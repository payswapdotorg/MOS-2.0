import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertRequiredFields } from '@mos/contracts';
import { canonicalBottleneckDecisionView } from '../contracts/delay-decision.js';
import { DELAY_DECISION_POLICY_V1 } from '../contracts/delay-policy.js';
import type { DelayDecisionAnalysis } from '../contracts/delay-decision.js';
import { createInMemoryEnsemble } from './in-memory-ensemble.js';
import { createInMemorySocialWorldModelStore, createInMemorySimulatorEngine } from './in-memory-social-simulator.js';
import { createInMemoryDelayEconomics } from './in-memory-delay-economics.js';
import {
  worldDraftA,
  worldDraftB,
  memberA,
  memberB,
  uniformPolicy,
} from '../testing/w4a-lab-fixtures.js';
import {
  FIXED_NOW,
  ensembleDerivation,
  scopeOf,
} from '../testing/w7a-delay-fixtures.js';
import { EXPECTED_FULL_RANKING, evaluationInput } from '../testing/w7a-delay-declarations.js';

type AnalysisResult = Awaited<ReturnType<ReturnType<typeof createInMemoryDelayEconomics>['evaluateDelayDecision']>>;

const asAnalysis = (result: AnalysisResult): DelayDecisionAnalysis => {
  if ('error' in result) {
    assert.fail(`unexpected delay decision error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: AnalysisResult): { readonly error: string; readonly message: string } => {
  assert.ok('error' in result, `expected a typed failure, got a record: ${String(result)}`);
  return result as { error: string; message: string };
};

const evaluate = async (): Promise<DelayDecisionAnalysis> =>
  asAnalysis(
    await createInMemoryDelayEconomics({ now: FIXED_NOW }).evaluateDelayDecision(evaluationInput()),
  );

// ---------------------------------------------------------------------------
// The DECLARED VERSIONED policy + the formula pin (known inputs → exact outputs)
// ---------------------------------------------------------------------------

test('the shipped policy v1 documents its formula and ranking (declared, never hidden math)', () => {
  assert.equal(DELAY_DECISION_POLICY_V1.id, 'mos-delay-decision-policy');
  assert.equal(DELAY_DECISION_POLICY_V1.version, 1);
  assert.equal(DELAY_DECISION_POLICY_V1.formula, 'ev-delay-1');
  assert.match(DELAY_DECISION_POLICY_V1.formulaDocument, /EV\(option\) = p × V − D − A/);
  assert.match(DELAY_DECISION_POLICY_V1.formulaDocument, /EV\.lower = p × V\.interval\.lower − D − A/);
  assert.match(DELAY_DECISION_POLICY_V1.formulaDocument, /ONE currency/);
  assert.match(DELAY_DECISION_POLICY_V1.formulaDocument, /NOT monetized/);
  assert.equal(DELAY_DECISION_POLICY_V1.ranking.kind, 'uncertainty-aware-deterministic');
  assert.equal(DELAY_DECISION_POLICY_V1.ranking.primary, 'expected-value-of-delay-desc');
  assert.equal(DELAY_DECISION_POLICY_V1.ranking.tieBreakOne, 'interval-half-width-asc');
  assert.equal(DELAY_DECISION_POLICY_V1.ranking.tieBreakTwo, 'option-kind-asc');
  assert.equal(DELAY_DECISION_POLICY_V1.qualityImpactPolicy, 'carried-not-monetized');
  assert.equal(DELAY_DECISION_POLICY_V1.quantization, 'quantized-to-1e-10');
});

test('FORMULA PIN: known inputs produce the exact documented outputs (EV(wait) = 550 USD over [390, 710])', async () => {
  const analysis = await evaluate();
  const wait = analysis.lines.find((line) => line.optionKind === 'wait');
  const ev = wait?.ev ?? assert.fail('the wait option must carry an EV computation');
  // p × V − D − A = 0.8 × 1000 − (20 × 10000/1000) − 50 = 800 − 200 − 50 = 550.
  assert.equal(ev.expectedValueOfDelay.amount, 550);
  assert.equal(ev.expectedValueOfDelay.currency, 'USD');
  // The uncertainty interval is carried: [0.8×800 − 250, 0.8×1200 − 250].
  assert.equal(ev.interval.lower, 390);
  assert.equal(ev.interval.upper, 710);
  // The exact terms are recorded (auditable, never implicit).
  assert.deepEqual(ev.terms, {
    successProbability: 0.8,
    expectedIncrementalValue: { amount: 1000, currency: 'USD' },
    delayCost: { amount: 200, currency: 'USD' },
    acquisitionCost: { amount: 50, currency: 'USD' },
  });
  // The point estimate lies inside the carried interval (§22 discipline).
  assert.ok(ev.expectedValueOfDelay.amount >= ev.interval.lower);
  assert.ok(ev.expectedValueOfDelay.amount <= ev.interval.upper);
});

test('FORMULA PIN: every option\'s EV matches the documented formula exactly', async () => {
  const analysis = await evaluate();
  const expectedEv: Record<string, number> = {
    'no-op': 0,
    wait: 550,
    retry: 500,
    'substitute-engine': 500,
    'substitute-capability-provider': 450,
    'switch-organization': 360,
    'switch-transform': 532.5,
    'reduce-scope': 530,
    'proceed-without-human': 200,
    abandon: -100,
  };
  for (const line of analysis.lines) {
    assert.equal(
      line.ev?.expectedValueOfDelay.amount,
      expectedEv[line.optionKind],
      line.optionKind,
    );
  }
});

test('FORMULA PIN: zero wait means zero delay cost; p=0 collapses the value term', async () => {
  const analysis = asAnalysis(
    await createInMemoryDelayEconomics({ now: FIXED_NOW }).evaluateDelayDecision(
      evaluationInput({
        modelOverrides: {
          wait: { estimate: 400, interval: [200, 600], probability: 0, waitMs: 0, perUnitTime: 20, unitMs: 1000, acquisition: 0 },
        },
      }),
    ),
  );
  const wait = analysis.lines.find((line) => line.optionKind === 'wait');
  assert.equal(wait?.ev?.terms.delayCost.amount, 0);
  assert.equal(wait?.ev?.expectedValueOfDelay.amount, 0);
  assert.equal(wait?.ev?.interval.lower, 0);
  assert.equal(wait?.ev?.interval.upper, 0);
});

// ---------------------------------------------------------------------------
// The ranked comparison (declared deterministic ranking, uncertainty-aware)
// ---------------------------------------------------------------------------

test('the ten applicable options are ranked by the declared deterministic policy', async () => {
  const analysis = await evaluate();
  assert.deepEqual(
    analysis.ranked.map((ranked) => ranked.optionKind),
    [...EXPECTED_FULL_RANKING],
  );
  for (const [index, ranked] of analysis.ranked.entries()) {
    assert.equal(ranked.rank, index + 1);
  }
});

test('an EV tie breaks on interval half-width, then option kind (the deterministic total order)', async () => {
  const analysis = await evaluate();
  const retry = analysis.ranked.find((ranked) => ranked.optionKind === 'retry');
  const substituteEngine = analysis.ranked.find(
    (ranked) => ranked.optionKind === 'substitute-engine',
  );
  // Both EV 500 — retry's interval [360, 640] is narrower than
  // substitute-engine's [350, 650], so retry ranks first.
  assert.equal(retry?.ev.expectedValueOfDelay.amount, 500);
  assert.equal(substituteEngine?.ev.expectedValueOfDelay.amount, 500);
  assert.ok((retry?.rank ?? 0) < (substituteEngine?.rank ?? 0));
  assert.equal(retry?.rank, 4);
  assert.equal(substituteEngine?.rank, 5);
});

test('every non-rank-1 option carries its interval-overlap-with-leader declaration', async () => {
  const analysis = await evaluate();
  for (const ranked of analysis.ranked) {
    if (ranked.rank === 1) {
      assert.equal(ranked.intervalOverlapWithLeader, null);
      continue;
    }
    assert.notEqual(ranked.intervalOverlapWithLeader, null);
    assert.equal(typeof ranked.intervalOverlapWithLeader?.overlaps, 'boolean');
    assert.ok((ranked.intervalOverlapWithLeader?.note ?? '').length > 0);
  }
  // switch-transform [362.5, 702.5] overlaps the leader wait [390, 710] — declared.
  const switchTransform = analysis.ranked.find((ranked) => ranked.optionKind === 'switch-transform');
  assert.equal(switchTransform?.intervalOverlapWithLeader?.overlaps, true);
});

test('the recommendation is the rank-1 line and the analysis carries the §24 boundary statement', async () => {
  const analysis = await evaluate();
  assert.equal(analysis.recommendation.optionKind, 'wait');
  assert.equal(analysis.recommendation.applicable, true);
  assert.equal(analysis.recommendation.ev?.expectedValueOfDelay.amount, 550);
  assert.equal(analysis.disclosure, 'declared-estimates-under-declared-versioned-policy');
  assert.match(analysis.decisionBoundary, /recorded recommendation/);
  assert.match(analysis.decisionBoundary, /§24/);
  assert.equal(analysis.policy.id, DELAY_DECISION_POLICY_V1.id);
  assert.equal(analysis.policy.version, 1);
  assert.equal(analysis.seed, 7);
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('DETERMINISM: identical inputs (incl. declared policy version + seed) produce bit-identical analyses', async () => {
  const first = await evaluate();
  const second = await evaluate();
  assert.deepEqual(first, second);
});

test('DETERMINISM: fresh adapter instances reproduce the same analysis bit-for-bit', async () => {
  const first = await evaluate();
  const anotherClock = (): ReturnType<typeof FIXED_NOW> => '2027-01-01T00:00:00.000Z' as ReturnType<typeof FIXED_NOW>;
  const second = asAnalysis(
    await createInMemoryDelayEconomics({ now: anotherClock }).evaluateDelayDecision(evaluationInput()),
  );
  // The computed content is identical; only the evaluation timestamp moves.
  const { evaluatedAt: _firstAt, ...firstContent } = first;
  const { evaluatedAt: _secondAt, ...secondContent } = second;
  assert.deepEqual(firstContent, secondContent);
  assert.notEqual(first.evaluatedAt, second.evaluatedAt);
});

test('DETERMINISM: a different dependency produces a different analysis (not a cached echo)', async () => {
  const first = await evaluate();
  const second = asAnalysis(
    await createInMemoryDelayEconomics({ now: FIXED_NOW }).evaluateDelayDecision(
      evaluationInput({ id: 'delay-analysis:reaction-voiceover-2', dependency: 'a different dependency' }),
    ),
  );
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.dependency, second.dependency);
});

// ---------------------------------------------------------------------------
// Ensemble-output derivation resolution (the LAB-007 seam)
// ---------------------------------------------------------------------------

const ensembleViewStack = async () => {
  const worldModels = createInMemorySocialWorldModelStore({ now: FIXED_NOW });
  const engine = createInMemorySimulatorEngine({ worldModels, now: FIXED_NOW });
  for (const draft of [worldDraftA(), worldDraftB()]) {
    const result = await worldModels.registerWorldModel({
      scope: scopeOf('tenant-a'),
      worldModel: draft,
    });
    if ('error' in result) {
      throw new Error(`fixture world model registration failed: ${result.error}`);
    }
  }
  const ensemble = createInMemoryEnsemble({ simulator: engine, now: FIXED_NOW });
  const registered = await ensemble.registerEnsemble({
    scope: scopeOf('tenant-a'),
    ensemble: {
      id: 'ensemble-reach' as never,
      niche: 'sourdough-baking',
      platform: 'short-video',
      members: [memberA(), memberB()],
      weightingPolicy: uniformPolicy(),
      notes: 'delay derivation fixture ensemble',
    },
  });
  if ('error' in registered) {
    throw new Error(`fixture ensemble registration failed: ${registered.error}`);
  }
  return ensemble;
};

test('a wired LAB-007 view resolves ensemble-output derivations fail-closed (unknown ensemble rejected)', async () => {
  const ensemble = await ensembleViewStack();
  const wired = createInMemoryDelayEconomics({ now: FIXED_NOW, ensemble });

  const valid = asAnalysis(await wired.evaluateDelayDecision(evaluationInput()));
  assert.equal(valid.lines.length, 10);

  const unknown = asError(
    await wired.evaluateDelayDecision(
      evaluationInput({
        id: 'delay-analysis:ensemble-unknown',
        modelOverrides: {
          wait: { probabilityDerivation: ensembleDerivation({ ensembleId: 'ensemble-unknown' }) },
        },
      }),
    ),
  );
  assert.equal(unknown.error, 'ensemble-derivation-unresolved');
  assert.match(unknown.message, /ensemble-unknown/);

  const wrongVersion = asError(
    await wired.evaluateDelayDecision(
      evaluationInput({
        id: 'delay-analysis:ensemble-wrong-version',
        modelOverrides: {
          wait: { probabilityDerivation: ensembleDerivation({ ensembleVersion: 9 }) },
        },
      }),
    ),
  );
  assert.equal(wrongVersion.error, 'ensemble-derivation-unresolved');
  assert.match(wrongVersion.message, /@9/);
});

test('an unwired ensemble view keeps ensemble derivations as STRUCTURAL declarations (disclosed seam)', async () => {
  const unwired = createInMemoryDelayEconomics({ now: FIXED_NOW });
  const analysis = asAnalysis(
    await unwired.evaluateDelayDecision(
      evaluationInput({
        modelOverrides: {
          wait: { probabilityDerivation: ensembleDerivation({ ensembleId: 'ensemble-unknown' }) },
        },
      }),
    ),
  );
  assert.equal(analysis.lines.length, 10);
  assert.equal(analysis.recommendation.optionKind, 'wait');
});

test('a caller-supplied policy must be a well-formed declared policy (the adapter refuses hidden math)', () => {
  assert.throws(
    () => createInMemoryDelayEconomics({ now: FIXED_NOW, policy: { ...DELAY_DECISION_POLICY_V1, formula: 'secret-math' as never } }),
    /ev-delay-1/,
  );
  assert.throws(
    () => createInMemoryDelayEconomics({ now: FIXED_NOW, policy: { ...DELAY_DECISION_POLICY_V1, formulaDocument: '' } }),
    /document/,
  );
});

// ---------------------------------------------------------------------------
// The canonical CORE-001 BottleneckDecision projection
// ---------------------------------------------------------------------------

test('the canonical CORE-001 BottleneckDecision projection satisfies the frozen contract', async () => {
  const analysis = await evaluate();
  const view = canonicalBottleneckDecisionView(analysis);
  assert.notEqual(view, null);
  assertRequiredFields(view!, 'BottleneckDecision');
  assert.equal(view!.dependency, analysis.dependency);
  assert.equal(view!.selectedAction, 'wait');
  assert.equal(view!.expectedIncrementalValue.amount, 1000);
  assert.equal(view!.expectedWait, 10_000);
  // delayCost projects the TOTAL delay cost over the estimated wait (the formula's D term).
  assert.equal(view!.delayCost.amount, 200);
  assert.equal(view!.delayCost.currency, 'USD');
  assert.equal(view!.acquisitionCost.amount, 50);
  assert.equal(view!.successProbability, 0.8);
  assert.equal(view!.qualityImpact, 0.3);
});

test('the canonical projection maps capability-provider substitutions by their target kind', async () => {
  const delayPort = createInMemoryDelayEconomics({ now: FIXED_NOW });
  const providerTop = asAnalysis(
    await delayPort.evaluateDelayDecision(
      evaluationInput({
        id: 'delay-analysis:provider-top',
        modelOverrides: {
          'substitute-capability-provider': { estimate: 2_000, interval: [1_500, 2_500] },
        },
        targetOverrides: {
          'substitute-capability-provider': { kind: 'provider', providerId: 'provider:arena' as never, providerVersion: 4 },
        },
      }),
    ),
  );
  assert.equal(providerTop.recommendation.optionKind, 'substitute-capability-provider');
  const providerView = canonicalBottleneckDecisionView(providerTop);
  assert.equal(providerView?.selectedAction, 'substitute-provider');

  const capabilityTop = asAnalysis(
    await delayPort.evaluateDelayDecision(
      evaluationInput({
        id: 'delay-analysis:capability-top',
        modelOverrides: {
          'substitute-capability-provider': { estimate: 2_000, interval: [1_500, 2_500] },
        },
      }),
    ),
  );
  assert.equal(capabilityTop.recommendation.optionKind, 'substitute-capability-provider');
  const capabilityView = canonicalBottleneckDecisionView(capabilityTop);
  assert.equal(capabilityView?.selectedAction, 'substitute-capability');
});

test('the canonical projection returns null for a no-op recommendation (program-space baseline, documented)', async () => {
  const analysis = asAnalysis(
    await createInMemoryDelayEconomics({ now: FIXED_NOW }).evaluateDelayDecision(
      evaluationInput({
        id: 'delay-analysis:no-op-top',
        modelOverrides: {
          'no-op': { estimate: 5_000, interval: [4_000, 6_000] },
        },
      }),
    ),
  );
  assert.equal(analysis.recommendation.optionKind, 'no-op');
  assert.equal(canonicalBottleneckDecisionView(analysis), null);
});
