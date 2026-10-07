import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  DelayDecisionError,
  DelayDecisionPort,
  RecordDelayAbandonmentInput,
} from '../contracts/delay-decision-port.js';
import type { DelayAbandonmentRecord } from '../contracts/delay-abandonment.js';
import { createInMemoryDelayEconomics } from './in-memory-delay-economics.js';
import {
  FIXED_NOW,
  ensembleDerivation,
  historicalDerivation,
  scopeOf,
} from '../testing/w7a-delay-fixtures.js';
import {
  abandonmentRecordId,
  evaluationInput,
  learningOutcome,
} from '../testing/w7a-delay-declarations.js';

type AbandonmentResult = Awaited<ReturnType<DelayDecisionPort['recordDelayAbandonment']>>;
type OutcomeResult = Awaited<ReturnType<DelayDecisionPort['recordDelayAbandonmentOutcome']>>;

const asRecord = (result: AbandonmentResult | OutcomeResult): DelayAbandonmentRecord => {
  if ('error' in result) {
    assert.fail(`unexpected abandonment error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: AbandonmentResult | OutcomeResult): DelayDecisionError => {
  assert.ok('error' in result, `expected a typed failure, got a record: ${String(result)}`);
  return result as DelayDecisionError;
};

/** A port with one evaluated analysis ready for abandonment. */
const portWithAnalysis = async (): Promise<{
  readonly port: DelayDecisionPort;
  readonly analysisId: ReturnType<typeof evaluationInput>['id'];
}> => {
  const port = createInMemoryDelayEconomics({ now: FIXED_NOW });
  const input = evaluationInput();
  const result = await port.evaluateDelayDecision(input);
  if ('error' in result) {
    assert.fail(`fixture analysis failed: ${result.error} — ${result.message}`);
  }
  return { port, analysisId: input.id };
};

const abandonmentInput = (
  analysisId: ReturnType<typeof evaluationInput>['id'],
  overrides: {
    readonly recordId?: string;
    readonly optionKind?: string;
    readonly reason?: string;
    readonly scope?: ReturnType<typeof scopeOf>;
  } = {},
): RecordDelayAbandonmentInput => ({
  scope: overrides.scope ?? scopeOf('tenant-a'),
  recordId: abandonmentRecordId(overrides.recordId),
  analysisId,
  abandonedPath: {
    optionKind: (overrides.optionKind ?? 'wait') as never,
    target: { kind: 'none' },
  },
  reason: overrides.reason ?? 'delay cost dominates the expected incremental value of waiting (lock rule 26)',
});

// ---------------------------------------------------------------------------
// Auditable abandoned-path records
// ---------------------------------------------------------------------------

test('an abandoned decision path produces an AUDITABLE record: what, why, the analysis that justified it', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const record = asRecord(await port.recordDelayAbandonment(abandonmentInput(analysisId)));
  assert.equal(record.version, 1);
  assert.equal(record.tenantId, scopeOf('tenant-a').tenantId);
  assert.equal(record.analysisId, analysisId);
  // WHAT: the dependency + the abandoned option path.
  assert.equal(record.dependency, 'human voiceover for the reaction-format episode');
  assert.equal(record.abandonedPath.optionKind, 'wait');
  // WHY: the caller's non-blank reason.
  assert.match(record.reason, /lock rule 26/);
  // THE ANALYSIS that justified it — the full snapshot.
  assert.equal(record.analysis.id, analysisId);
  assert.equal(record.analysis.recommendation.optionKind, 'wait');
  assert.equal(record.analysis.ranked.length, 10);
  // Outcomes start empty — they are recorded WHEN LATER KNOWN.
  assert.deepEqual(record.outcomes, []);
  assert.equal(record.abandonedAt, FIXED_NOW());
  // The learning-feed pin: the shape feeds LAB-017/018; no learning is implemented.
  assert.equal(record.learningFeed, 'abandoned-branches-are-learning-data-no-learning-implemented');
});

test('the abandonment record\'s analysis snapshot is bit-for-bit the stored analysis', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const record = asRecord(await port.recordDelayAbandonment(abandonmentInput(analysisId)));
  const stored = await port.getDelayDecisionAnalysis(scopeOf('tenant-a'), analysisId);
  assert.notEqual(stored, null);
  assert.deepEqual(record.analysis, stored);
});

test('abandoned-path records are IMMUTABLE (nested mutation throws, deep-frozen)', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const record = asRecord(await port.recordDelayAbandonment(abandonmentInput(analysisId)));
  assert.throws(() => {
    (record as unknown as { reason: string }).reason = 'rewritten history';
  }, TypeError);
  assert.throws(() => {
    (record.abandonedPath as unknown as { optionKind: string }).optionKind = 'abandon';
  }, TypeError);
  assert.throws(() => {
    (record.analysis as unknown as { dependency: string }).dependency = 'rewritten';
  }, TypeError);
  assert.throws(() => {
    (record.analysis.recommendation as unknown as { optionKind: string }).optionKind = 'abandon';
  }, TypeError);
});

// ---------------------------------------------------------------------------
// Learning-relevant outcomes (recorded when later known, append-only)
// ---------------------------------------------------------------------------

test('a learning-relevant outcome is APPENDED (version + 1) and prior versions stay bit-for-bit', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const record = asRecord(await port.recordDelayAbandonment(abandonmentInput(analysisId)));
  const appended = asRecord(
    await port.recordDelayAbandonmentOutcome({
      scope: scopeOf('tenant-a'),
      recordId: record.id,
      outcome: learningOutcome(),
    }),
  );
  assert.equal(appended.version, 2);
  assert.equal(appended.outcomes.length, 1);
  assert.equal(appended.outcomes[0]?.outcome, 'the human dependency resolved two days later at accepted quality');
  assert.equal(appended.abandonedAt, record.abandonedAt);
  assert.equal(appended.updatedAt, FIXED_NOW());

  const prior = await port.getDelayAbandonmentRecord(scopeOf('tenant-a'), record.id, 1);
  assert.notEqual(prior, null);
  assert.equal(prior?.version, 1);
  assert.deepEqual(prior?.outcomes, []);
  assert.deepEqual(prior, record);

  const second = asRecord(
    await port.recordDelayAbandonmentOutcome({
      scope: scopeOf('tenant-a'),
      recordId: record.id,
      outcome: learningOutcome({
        outcome: 'the substitute engine delivery arrived at declared quality',
        derivation: historicalDerivation('the engine result record on the run'),
      }),
    }),
  );
  assert.equal(second.version, 3);
  assert.equal(second.outcomes.length, 2);
  const versionTwo = await port.getDelayAbandonmentRecord(scopeOf('tenant-a'), record.id, 2);
  assert.equal(versionTwo?.version, 2);
  assert.equal(versionTwo?.outcomes.length, 1);
  assert.equal(await port.getDelayAbandonmentRecord(scopeOf('tenant-a'), record.id, 99), null);
  assert.notEqual(await port.getDelayAbandonmentRecord(scopeOf('tenant-a'), record.id, 3), null);
});

test('an appended outcome is immutable and carries its own provenance', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const record = asRecord(await port.recordDelayAbandonment(abandonmentInput(analysisId)));
  const appended = asRecord(
    await port.recordDelayAbandonmentOutcome({
      scope: scopeOf('tenant-a'),
      recordId: record.id,
      outcome: learningOutcome(),
    }),
  );
  assert.throws(() => {
    (appended.outcomes[0] as unknown as { outcome: string }).outcome = 'rewritten';
  }, TypeError);
  assert.equal(appended.outcomes[0]?.derivation.kind, 'historical-observation');

  const ensembleSourced = asRecord(
    await port.recordDelayAbandonmentOutcome({
      scope: scopeOf('tenant-a'),
      recordId: record.id,
      outcome: learningOutcome({ derivation: ensembleDerivation() }),
    }),
  );
  assert.equal(ensembleSourced.outcomes[1]?.derivation.kind, 'ensemble-output');
});

test('an outcome without provenance is rejected (outcomes are never invented)', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const record = asRecord(await port.recordDelayAbandonment(abandonmentInput(analysisId)));
  const failure = asError(
    await port.recordDelayAbandonmentOutcome({
      scope: scopeOf('tenant-a'),
      recordId: record.id,
      outcome: {
        observedAt: '2026-06-25T09:30:00.000Z' as never,
        outcome: 'something happened',
        derivation: null as never,
      },
    }),
  );
  assert.equal(failure.error, 'estimate-without-provenance');
  assert.match(failure.message, /never invented/);
  // The record is unchanged.
  const latest = await port.getDelayAbandonmentRecord(scopeOf('tenant-a'), record.id);
  assert.deepEqual(latest?.outcomes, []);
});

test('outcome appends on unknown records fail closed', async () => {
  const { port } = await portWithAnalysis();
  const failure = asError(
    await port.recordDelayAbandonmentOutcome({
      scope: scopeOf('tenant-a'),
      recordId: abandonmentRecordId('delay-abandonment:unknown'),
      outcome: learningOutcome(),
    }),
  );
  assert.equal(failure.error, 'abandonment-not-found');
});

// ---------------------------------------------------------------------------
// Failure model + tenant scoping
// ---------------------------------------------------------------------------

test('an abandonment citing an unknown analysis fails closed', async () => {
  const { port } = await portWithAnalysis();
  const failure = asError(
    await port.recordDelayAbandonment(abandonmentInput('delay-analysis:unknown' as never)),
  );
  assert.equal(failure.error, 'analysis-not-found');
});

test('cross-tenant analyses do not resolve (indistinguishable from unknown)', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const failure = asError(
    await port.recordDelayAbandonment(
      abandonmentInput(analysisId, { scope: scopeOf('tenant-b') }),
    ),
  );
  assert.equal(failure.error, 'analysis-not-found');
});

test('a duplicate abandonment record id in the same tenant scope fails closed', async () => {
  const { port, analysisId } = await portWithAnalysis();
  asRecord(await port.recordDelayAbandonment(abandonmentInput(analysisId)));
  const failure = asError(await port.recordDelayAbandonment(abandonmentInput(analysisId)));
  assert.equal(failure.error, 'duplicate-abandonment-record');
});

test('a blank abandonment reason fails closed (abandonment is never silent)', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const failure = asError(
    await port.recordDelayAbandonment(abandonmentInput(analysisId, { reason: '   ' })),
  );
  assert.equal(failure.error, 'invalid-abandonment');
});

test('an abandoned path with a target of the wrong shape for its option kind fails closed', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const failure = asError(
    await port.recordDelayAbandonment({
      ...abandonmentInput(analysisId),
      abandonedPath: {
        optionKind: 'substitute-engine' as never,
        target: { kind: 'none' },
      },
    }),
  );
  assert.equal(failure.error, 'invalid-abandonment');
  assert.equal(failure.option, 'substitute-engine');
});

test('abandonment records are tenant-scoped; the same id in two tenants never mixes', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const tenantBInput = evaluationInput({ scope: scopeOf('tenant-b'), id: analysisId });
  const tenantBResult = await port.evaluateDelayDecision(tenantBInput);
  if ('error' in tenantBResult) {
    assert.fail(`tenant-b fixture analysis failed: ${tenantBResult.error}`);
  }
  const recordA = asRecord(await port.recordDelayAbandonment(abandonmentInput(analysisId)));
  const recordB = asRecord(
    await port.recordDelayAbandonment(
      abandonmentInput(analysisId, { scope: scopeOf('tenant-b'), recordId: 'delay-abandonment:b-1', reason: 'tenant-b abandonment' }),
    ),
  );
  assert.equal(recordA.tenantId, scopeOf('tenant-a').tenantId);
  assert.equal(recordB.tenantId, scopeOf('tenant-b').tenantId);
  assert.equal(await port.getDelayAbandonmentRecord(scopeOf('tenant-b'), recordA.id), null);
  assert.equal(await port.getDelayAbandonmentRecord(scopeOf('tenant-a'), recordB.id), null);
  assert.equal((await port.listDelayAbandonmentRecords(scopeOf('tenant-a'))).length, 1);
  assert.equal((await port.listDelayAbandonmentRecords(scopeOf('tenant-b'))).length, 1);
});

test('recordDelayAbandonment accepts a substituted-path abandonment with its BY-REFERENCE target', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const record = asRecord(
    await port.recordDelayAbandonment({
      ...abandonmentInput(analysisId),
      abandonedPath: {
        optionKind: 'substitute-engine' as never,
        target: { kind: 'engine', engineId: 'engine:alt-video-transcode' as never, engineVersion: 3 },
      },
      reason: 'the engine substitution was itself abandoned after the benchmark regression',
    }),
  );
  assert.equal(record.abandonedPath.optionKind, 'substitute-engine');
  assert.equal(record.abandonedPath.target.kind, 'engine');
  assert.equal(record.analysis.id, analysisId);
});

test('the latest version is returned by default; exact versions are resolvable', async () => {
  const { port, analysisId } = await portWithAnalysis();
  const record = asRecord(await port.recordDelayAbandonment(abandonmentInput(analysisId)));
  asRecord(
    await port.recordDelayAbandonmentOutcome({
      scope: scopeOf('tenant-a'),
      recordId: record.id,
      outcome: learningOutcome(),
    }),
  );
  const latest = await port.getDelayAbandonmentRecord(scopeOf('tenant-a'), record.id);
  assert.equal(latest?.version, 2);
  const exact = await port.getDelayAbandonmentRecord(scopeOf('tenant-a'), record.id, 1);
  assert.equal(exact?.version, 1);
  assert.deepEqual(exact?.outcomes, []);
});
