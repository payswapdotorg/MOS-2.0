import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EnsemblePort } from '../contracts/ensemble.js';
import type {
  MarketingBenchmarkPort,
  RobustBenchmarkRecord,
} from '../contracts/robust-benchmark-port.js';
import type {
  MarketingBenchmarkInput,
  RobustBenchmarkError,
} from '../contracts/robust-benchmark.js';
import { BENCHMARK_NOOP_STRATEGY_REF } from '../contracts/robust-benchmark.js';
import { createInMemoryMarketingBenchmark } from './in-memory-marketing-benchmark.js';
import {
  ALT_ENSEMBLE_ID,
  benchmarkCandidateAlpha,
  benchmarkCandidateBeta,
  benchmarkEnsembleStack,
  benchmarkInput,
  benchmarkScenario,
  reachRewardSpec,
  robustnessPolicy,
} from '../testing/w9a-benchmark-fixtures.js';
import { FIXED_NOW } from '../testing/w9a-benchmark-fixtures.js';

type RunResult = Awaited<ReturnType<MarketingBenchmarkPort['runBenchmark']>>;

const asRecord = (result: RunResult): RobustBenchmarkRecord => {
  if ('error' in result) {
    assert.fail(`unexpected benchmark error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: RunResult): RobustBenchmarkError => {
  assert.ok('error' in result, `expected a typed failure, got: ${String(result)}`);
  return result;
};

const portOver = (ensemble: EnsemblePort): MarketingBenchmarkPort =>
  createInMemoryMarketingBenchmark({ ensemble, now: FIXED_NOW });

const runOver = async (
  ensemble: EnsemblePort,
  overrides: Partial<MarketingBenchmarkInput> = {},
): Promise<RunResult> => portOver(ensemble).runBenchmark(benchmarkInput(overrides));

type RobustnessPolicyFixture = ReturnType<typeof robustnessPolicy>;

// ---------------------------------------------------------------------------
// Fail-closed validation (typed, named codes)
// ---------------------------------------------------------------------------

test('caller claims on the no-op baseline identity fail closed', async () => {
  const { ensemble } = await benchmarkEnsembleStack();

  const byOrigin = asError(
    await runOver(ensemble, {
      candidates: [
        benchmarkCandidateAlpha({
          key: 'claim-1',
          source: {
            origin: 'no-op-baseline',
            producerPins: [],
            note: 'hostile claim on the synthesized baseline origin',
          },
        }),
      ],
    }),
  );
  assert.equal(byOrigin.error, 'caller-claimed-noop-baseline');

  const byRef = asError(
    await runOver(ensemble, {
      candidates: [
        benchmarkCandidateAlpha({
          key: 'claim-2',
          action: { ...benchmarkCandidateAlpha().action, strategyRef: BENCHMARK_NOOP_STRATEGY_REF },
        }),
      ],
    }),
  );
  assert.equal(byRef.error, 'caller-claimed-noop-baseline');

  const byKey = asError(
    await runOver(ensemble, {
      candidates: [benchmarkCandidateAlpha({ key: 'no-op-baseline' })],
    }),
  );
  assert.equal(byKey.error, 'caller-claimed-noop-baseline');
});

test('duplicate candidate keys fail closed', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const failure = asError(
    await runOver(ensemble, {
      candidates: [benchmarkCandidateAlpha(), benchmarkCandidateBeta({ key: 'alpha' })],
    }),
  );
  assert.equal(failure.error, 'duplicate-candidate-key');
  assert.ok(failure.message.includes('alpha'));
});

test('structurally invalid candidates fail closed naming the candidate', async () => {
  const { ensemble } = await benchmarkEnsembleStack();

  const badKnobs = asError(
    await runOver(ensemble, {
      candidates: [
        benchmarkCandidateAlpha({
          key: 'bad-knobs',
          action: { ...benchmarkCandidateAlpha().action, cadencePerWeek: -1 },
        }),
      ],
    }),
  );
  assert.equal(badKnobs.error, 'invalid-candidate');
  assert.ok(badKnobs.message.includes('bad-knobs'));

  const badHorizon = asError(
    await runOver(ensemble, {
      candidates: [benchmarkCandidateAlpha({ key: 'bad-horizon', horizonSteps: 0 })],
    }),
  );
  assert.equal(badHorizon.error, 'invalid-candidate');

  const noopWithCadence = asError(
    await runOver(ensemble, {
      candidates: [
        benchmarkCandidateAlpha({
          key: 'bad-noop',
          action: {
            strategyRef: 'strategy-bad-noop' as never,
            kind: 'no-op',
            cadencePerWeek: 3,
            novelty: 0.5,
            engagementEffort: 0.5,
          },
        }),
      ],
    }),
  );
  assert.equal(noopWithCadence.error, 'invalid-candidate');

  // hostile non-object candidates fail closed (never a TypeError crash).
  const nullCandidate = asError(
    await runOver(ensemble, {
      candidates: [null as never],
    }),
  );
  assert.equal(nullCandidate.error, 'invalid-candidate');
});

test('malformed run inputs fail closed (scenario/policy/seeds/candidates shapes)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const port = portOver(ensemble);

  const nullScenario = asError(
    await port.runBenchmark(benchmarkInput({ scenario: null as never })),
  );
  assert.equal(nullScenario.error, 'invalid-input');

  const nullPolicy = asError(
    await port.runBenchmark(benchmarkInput({ policy: null as never })),
  );
  assert.equal(nullPolicy.error, 'invalid-input');

  const nullSeeds = asError(
    await port.runBenchmark(benchmarkInput({ seeds: null as never })),
  );
  assert.equal(nullSeeds.error, 'seed-budget-mismatch');

  const nullCandidates = asError(
    await port.runBenchmark(benchmarkInput({ candidates: null as never })),
  );
  assert.equal(nullCandidates.error, 'invalid-input');

  // a malformed run appends NO record.
  const record = asRecord(await port.runBenchmark(benchmarkInput()));
  assert.equal(record.version, 1);
});

test('seed budget mismatches fail closed (count, duplicates, non-finite)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();

  const wrongCount = asError(await runOver(ensemble, { seeds: [11, 22] }));
  assert.equal(wrongCount.error, 'seed-budget-mismatch');

  const duplicates = asError(await runOver(ensemble, { seeds: [11, 11, 33] }));
  assert.equal(duplicates.error, 'seed-budget-mismatch');

  const nonFinite = asError(await runOver(ensemble, { seeds: [11, 22, Number.NaN] }));
  assert.equal(nonFinite.error, 'seed-budget-mismatch');
});

test('invalid robustness policies fail closed (every declared rule)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();

  const cases: readonly (readonly [string, Partial<RobustnessPolicyFixture>])[] = [
    ['seedBudget below two', { seedBudget: 1 }],
    ['empty world-model set', { worldModelSet: [] }],
    [
      'missing mandatory seed sweep',
      {
        sweepDimensions: ['world-model'] as never,
        worldModelSet: [{ ensembleId: ALT_ENSEMBLE_ID, ensembleVersion: 1, label: 'only' }],
      },
    ],
    [
      'world-model sweep with a single world',
      {
        sweepDimensions: ['seed', 'world-model'],
        worldModelSet: [{ ensembleId: ALT_ENSEMBLE_ID, ensembleVersion: 1, label: 'only' }],
      },
    ],
    ['unknown aggregation rule', { aggregation: 'median' as never }],
    ['unknown tie-break', { tieBreak: 'key-asc' as never }],
    ['blank note', { note: '   ' }],
    [
      'duplicate world-model labels',
      {
        worldModelSet: [
          { ensembleId: ALT_ENSEMBLE_ID, ensembleVersion: 1, label: 'same' },
          { ensembleId: ALT_ENSEMBLE_ID, ensembleVersion: 1, label: 'same' },
        ],
      },
    ],
    ['unknown sweep dimension', { sweepDimensions: ['seed', 'regime' as never] }],
  ];
  for (const [name, overrides] of cases) {
    const failure = asError(await runOver(ensemble, { policy: robustnessPolicy(overrides) }));
    assert.equal(failure.error, 'invalid-input', `policy case "${name}" must fail invalid-input`);
    assert.ok(failure.message.length > 0);
  }
});

test('unresolvable world-model refs fail closed (unknown, wrong version, scenario mismatch)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();

  const unknown = asError(
    await runOver(ensemble, {
      policy: robustnessPolicy({
        worldModelSet: [
          { ensembleId: 'ensemble-nope' as never, ensembleVersion: 1, label: 'unknown' },
        ],
        sweepDimensions: ['seed'],
      }),
    }),
  );
  assert.equal(unknown.error, 'unknown-ensemble');

  const wrongVersion = asError(
    await runOver(ensemble, {
      policy: robustnessPolicy({
        worldModelSet: [{ ensembleId: ALT_ENSEMBLE_ID, ensembleVersion: 7, label: 'stale' }],
        sweepDimensions: ['seed'],
      }),
    }),
  );
  assert.equal(wrongVersion.error, 'ensemble-version-not-found');
  assert.ok(wrongVersion.message.includes('latest is 1'));

  const foreignPlatform = asError(
    await runOver(ensemble, {
      scenario: {
        ...benchmarkScenario(),
        platform: 'long-video',
      },
    }),
  );
  assert.equal(foreignPlatform.error, 'scenario-ensemble-mismatch');
});

test('reward version mismatches fail closed', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const failure = asError(
    await runOver(ensemble, { rewardSpec: reachRewardSpec({ version: 9 }) }),
  );
  assert.equal(failure.error, 'reward-version-mismatch');
  assert.ok(failure.message.includes('9'));
});

test('reward terms that resolve nowhere fail closed (never invented)', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  const failure = asError(
    await runOver(ensemble, {
      rewardSpec: reachRewardSpec({
        extraTerms: [
          {
            metric: 'retention',
            weight: 1,
            direction: 'maximize',
            definition: 'an observed-domain-only metric source',
            metricSource: 'baseline-reach',
          },
        ],
      }),
    }),
  );
  assert.equal(failure.error, 'reward-term-not-derivable');
  assert.ok(failure.message.includes('baseline-reach'));
  assert.ok(
    failure.message.includes('candidate'),
    'the failing candidate must be named in the failure message',
  );
});

test('ensemble evaluation failures surface as benchmark evaluation failures', async () => {
  const { ensemble } = await benchmarkEnsembleStack();
  // A scenario pinned against a different simulator version fails every
  // member evaluation — the benchmark surfaces it fail-closed.
  const failure = asError(
    await runOver(ensemble, {
      scenario: { ...benchmarkScenario(), simulatorVersion: 99 as never },
    }),
  );
  assert.equal(failure.error, 'ensemble-evaluation-failed');
  assert.ok(failure.message.includes('simulator-version-mismatch'));
});
