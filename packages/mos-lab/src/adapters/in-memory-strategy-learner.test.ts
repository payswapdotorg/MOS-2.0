import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryStrategyLearner } from './in-memory-strategy-learner.js';
import type {
  LearnedStrategyCandidate,
  StrategyLearningInput,
  StrategyLearningPort,
} from '../contracts/strategy-learning.js';
import {
  FIXED_NOW,
  contentCandidate,
  ensembleId,
  ensembleStack,
  reachRewardSpec,
  scopeOf,
  scenarioOf,
} from '../testing/w4a-lab-fixtures.js';

type LearningResult = Awaited<ReturnType<StrategyLearningPort['learnStrategy']>>;

const asCandidate = (result: LearningResult): LearnedStrategyCandidate => {
  if ('error' in result) {
    assert.fail(`unexpected learner error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: LearningResult): { error: string; message: string } => {
  assert.ok('error' in result, `expected a typed failure, got: ${String(result)}`);
  return result;
};

/** horizon 1 keeps rollouts small; 2 members × 3 seeds × 1 step = 6 per variant. */
const learningInput = (
  overrides: Partial<StrategyLearningInput> = {},
): StrategyLearningInput => ({
  scope: scopeOf('tenant-a'),
  ensembleId: ensembleId(),
  ensembleVersion: 1,
  scenario: scenarioOf(),
  rewardSpec: reachRewardSpec(),
  initialProgram: { candidate: contentCandidate, horizonSteps: 1 },
  seed: 42,
  stoppingPolicy: {
    maxIterations: 10,
    maxSimulatedSteps: 100_000,
    plateauWindow: 3,
    plateauTolerance: 0,
  },
  ...overrides,
});

const learnerOf = (ensemble: Parameters<typeof createInMemoryStrategyLearner>[0]['ensemble']) =>
  createInMemoryStrategyLearner({ ensemble, now: FIXED_NOW });

// ---------------------------------------------------------------------------
// Determinism (seed-required)
// ---------------------------------------------------------------------------

test('same (strategy, seed, ensemble version) → BIT-IDENTICAL learning trace', async () => {
  const stack = await ensembleStack();
  const learner = learnerOf(stack.ensemble);
  const input = learningInput();

  const first = asCandidate(await learner.learnStrategy(input));
  const second = asCandidate(await learner.learnStrategy(input));
  assert.deepEqual(second, first, 'the same instance reproduces the trace bit for bit');

  // A FRESH learner + fresh ensemble stack (same versions + same clock) too.
  const freshStack = await ensembleStack();
  const freshLearner = learnerOf(freshStack.ensemble);
  const fresh = asCandidate(await freshLearner.learnStrategy(input));
  assert.deepEqual(fresh, first, 'fresh stacks reproduce the trace bit for bit');

  // A different seed moves the trace (seed-required determinism).
  const otherSeed = asCandidate(await learner.learnStrategy(learningInput({ seed: 43 })));
  assert.notDeepEqual(otherSeed, first);
  assert.equal(otherSeed.provenance.seed, 43);
});

// ---------------------------------------------------------------------------
// Learning loop mechanics: improvement, budget, plateau, cap
// ---------------------------------------------------------------------------

test('the learner IMPROVES the incumbent and records the full iteration trace', async () => {
  const stack = await ensembleStack();
  const learner = learnerOf(stack.ensemble);
  const learned = asCandidate(await learner.learnStrategy(learningInput()));

  assert.ok(learned.trace.iterations.length >= 1);
  const first = learned.trace.iterations[0];
  assert.ok(first !== undefined);
  // Incumbent first, then the six coordinate neighbors.
  assert.ok(first.evaluated.length >= 2);
  assert.deepEqual(first.evaluated[0]?.candidate, contentCandidate, 'the incumbent is evaluated first');
  assert.ok(first.improved, 'cadence 5 → 7 improves the reach reward');
  assert.ok(first.improvement > 0);
  assert.deepEqual(first.chosen, first.evaluated.find(
    (variant) => variant.candidate.cadencePerWeek === 7,
  )?.candidate, 'the improving neighbor is chosen');

  // Cost dimensions are declared on every iteration (§2 delay-economics seam).
  assert.ok(first.costs.simulatedSteps > 0);
  assert.equal(
    first.costs.simulatedSteps,
    first.evaluated.length * 3 * 1 * 2,
    '7 variants × 3 seeds × 1 step × 2 members = 42 member steps',
  );
  assert.ok(learned.trace.totalSimulatedSteps >= first.costs.simulatedSteps);
  assert.ok(learned.trace.finalEstimate !== null);
  assert.ok(learned.trace.finalEstimate.interval.lower < learned.trace.finalEstimate.reward);
  assert.ok(learned.trace.finalEstimate.reward < learned.trace.finalEstimate.interval.upper);
});

test('iteration BUDGET enforcement: the declared member-step budget stops the run', async () => {
  const stack = await ensembleStack();
  const learner = learnerOf(stack.ensemble);

  // One worst-case iteration = 7 variants × 3 seeds × 1 step × 2 members = 42.
  const budgeted = asCandidate(
    await learner.learnStrategy(
      learningInput({
        stoppingPolicy: {
          maxIterations: 10,
          maxSimulatedSteps: 42,
          plateauWindow: 5,
          plateauTolerance: 0,
        },
      }),
    ),
  );
  assert.equal(budgeted.trace.stoppingReason, 'budget-exhausted');
  assert.equal(budgeted.trace.iterations.length, 1, 'exactly one iteration fit the budget');
  assert.equal(budgeted.trace.totalSimulatedSteps, 42);
  assert.match(budgeted.trace.stoppingDetail, /budget 42 exhausted/);

  // A budget that cannot cover even one worst-case iteration is rejected.
  const floor = asError(
    await learner.learnStrategy(
      learningInput({
        stoppingPolicy: {
          maxIterations: 10,
          maxSimulatedSteps: 41,
          plateauWindow: 5,
          plateauTolerance: 0,
        },
      }),
    ),
  );
  assert.equal(floor.error, 'invalid-input');
  assert.match(floor.message, /cannot cover even one worst-case iteration/);
});

test('PLATEAU detection: sub-tolerance improvements stop the run after the declared window', async () => {
  const stack = await ensembleStack();
  const learner = learnerOf(stack.ensemble);

  // Any real improvement is far below this declared tolerance → plateau.
  const plateaued = asCandidate(
    await learner.learnStrategy(
      learningInput({
        stoppingPolicy: {
          maxIterations: 10,
          maxSimulatedSteps: 100_000,
          plateauWindow: 2,
          plateauTolerance: 1e12,
        },
      }),
    ),
  );
  assert.equal(plateaued.trace.stoppingReason, 'plateau-detected');
  assert.equal(plateaued.trace.iterations.length, 2, 'the declared window of non-improving iterations ran');
  assert.match(plateaued.trace.stoppingDetail, /plateauTolerance 1000000000000/);
  for (const iteration of plateaued.trace.iterations) {
    assert.equal(iteration.improved, false);
    assert.deepEqual(iteration.chosen, contentCandidate, 'the incumbent never moves below tolerance');
  }
  assert.deepEqual(plateaued.candidate, contentCandidate);
});

test('the ITERATION CAP ends the run naturally', async () => {
  const stack = await ensembleStack();
  const learner = learnerOf(stack.ensemble);
  const capped = asCandidate(
    await learner.learnStrategy(
      learningInput({
        stoppingPolicy: {
          maxIterations: 1,
          maxSimulatedSteps: 100_000,
          plateauWindow: 5,
          plateauTolerance: 0,
        },
      }),
    ),
  );
  assert.equal(capped.trace.stoppingReason, 'iteration-cap-reached');
  assert.equal(capped.trace.iterations.length, 1);
  assert.match(capped.trace.stoppingDetail, /iteration cap 1 reached/);
  assert.equal(capped.provenance.iterationCount, 1);
});

// ---------------------------------------------------------------------------
// Reward-spec discipline + counterfactual labeling + provenance
// ---------------------------------------------------------------------------

test('reward-spec VERSION mismatch and non-derivable sources fail closed', async () => {
  const stack = await ensembleStack();
  const learner = learnerOf(stack.ensemble);

  const mismatch = asError(
    await learner.learnStrategy(
      learningInput({ rewardSpec: reachRewardSpec({ version: 2 }) }),
    ),
  );
  assert.equal(mismatch.error, 'reward-version-mismatch');

  // An observed-history source cannot resolve during learning — the learner
  // sees ONLY ensemble-predicted metrics (simulation experience only).
  const notDerivable = asError(
    await learner.learnStrategy(
      learningInput({
        rewardSpec: reachRewardSpec({
          extraTerms: [
            {
              metric: 'audience-growth',
              weight: 1,
              direction: 'maximize',
              definition: 'an observed-history source the learner must reject',
              metricSource: 'baseline-reach',
            },
          ],
        }),
      }),
    ),
  );
  assert.equal(notDerivable.error, 'reward-term-not-derivable');
});

test('unknown ensemble / missing version / malformed inputs fail closed', async () => {
  const stack = await ensembleStack();
  const learner = learnerOf(stack.ensemble);

  const unknown = asError(
    await learner.learnStrategy(learningInput({ scope: scopeOf('tenant-b') })),
  );
  assert.equal(unknown.error, 'unknown-ensemble');

  const missingVersion = asError(
    await learner.learnStrategy(learningInput({ ensembleVersion: 9 })),
  );
  assert.equal(missingVersion.error, 'ensemble-version-not-found');

  for (const bad of [
    { seed: Number.NaN },
    { initialProgram: { candidate: contentCandidate, horizonSteps: 0 } },
    { initialProgram: { candidate: { ...contentCandidate, cadencePerWeek: -1 }, horizonSteps: 1 } },
    { stoppingPolicy: { maxIterations: 0, maxSimulatedSteps: 100_000, plateauWindow: 3, plateauTolerance: 0 } },
    { stoppingPolicy: { maxIterations: 2, maxSimulatedSteps: 100_000, plateauWindow: 0, plateauTolerance: 0 } },
    { rewardSpec: { version: 1, terms: [] } },
  ]) {
    const invalid = asError(
      await learner.learnStrategy(learningInput(bad as Partial<StrategyLearningInput>)),
    );
    assert.equal(invalid.error, 'invalid-input');
  }
});

test('the learned candidate is counterfactual-labeled with FULL provenance (stays in the lab)', async () => {
  const stack = await ensembleStack();
  const learner = learnerOf(stack.ensemble);
  const learned = asCandidate(await learner.learnStrategy(learningInput()));

  // LOCK RULE 29 + §24: counterfactual, disclosed, lab-only.
  assert.equal(learned.counterfactual, true);
  assert.equal(learned.disclosure, 'learned-in-simulation');
  assert.match(learned.labOnly, /never a deployment decision/);
  assert.match(learned.labOnly, /§24/);

  // FULL provenance of which simulator/ensemble versions produced it.
  assert.equal(learned.provenance.ensembleId, ensembleId());
  assert.equal(learned.provenance.ensembleVersion, 1);
  assert.deepEqual(
    learned.provenance.memberWorldModelVersions,
    [1, 1],
    'the member world-model versions are enumerated',
  );
  assert.equal(learned.provenance.simulatorVersion, 1, 'scenario-pinned simulator version');
  assert.equal(learned.provenance.rewardSpecVersion, 1);
  assert.equal(learned.provenance.seed, 42);
  assert.equal(learned.provenance.parentStrategyRef, contentCandidate.strategyRef);
  assert.equal(learned.provenance.learnedAt, FIXED_NOW());
  assert.ok(['budget-exhausted', 'iteration-cap-reached', 'plateau-detected'].includes(
    learned.provenance.stoppingReason,
  ));

  // The candidate itself carries the sim knobs + the horizon it was learned over.
  assert.equal(learned.horizonSteps, 1);
  assert.deepEqual(
    Object.keys(learned.candidate).sort(),
    ['cadencePerWeek', 'engagementEffort', 'kind', 'novelty', 'strategyRef'],
  );
});

test('the learner surface is a single learnStrategy method (≤ 12 policy budget)', async () => {
  const stack = await ensembleStack();
  const learner = learnerOf(stack.ensemble);
  assert.deepEqual(Object.keys(learner), ['learnStrategy']);
});
