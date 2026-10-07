import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DelayDecisionAnalysis } from '../contracts/delay-decision.js';
import type {
  DelayDecisionError,
  DelayDecisionPort,
} from '../contracts/delay-decision-port.js';
import type { DelayEvaluationInput } from '../contracts/delay-decision.js';
import type {
  DelayDecisionModel,
  DelayDimensionName,
  DelayOptionKind,
} from '../contracts/delay-economics.js';
import { DELAY_OPTION_KINDS } from '../contracts/delay-economics.js';
import { createInMemoryDelayEconomics } from './in-memory-delay-economics.js';
import { DELAY_DIMENSION_NAMES, FIXED_NOW, scopeOf } from '../testing/w7a-delay-fixtures.js';
import { decisionContext, evaluationInput } from '../testing/w7a-delay-declarations.js';

type EvaluationResult = Awaited<ReturnType<DelayDecisionPort['evaluateDelayDecision']>>;

const asAnalysis = (result: EvaluationResult): DelayDecisionAnalysis => {
  if ('error' in result) {
    assert.fail(`unexpected delay decision error: ${result.error} — ${result.message}`);
  }
  return result;
};

const asError = (result: EvaluationResult): DelayDecisionError => {
  assert.ok('error' in result, `expected a typed failure, got a record: ${String(result)}`);
  return result;
};

const port = (): DelayDecisionPort =>
  createInMemoryDelayEconomics({ now: FIXED_NOW });

/** Deep-clone the fixture input with one option's model replaced. */
const withModel = (
  input: DelayEvaluationInput,
  option: DelayOptionKind,
  mutate: (model: DelayDecisionModel) => DelayDecisionModel,
): DelayEvaluationInput => ({
  ...input,
  context: {
    ...input.context,
    options: input.context.options.map((declaration) =>
      declaration.optionKind === option
        ? { ...declaration, dimensions: mutate(declaration.dimensions as DelayDecisionModel) }
        : declaration,
    ),
  },
});

/** Drop one key from one option's model (the missing-dimension sweep). */
const withoutDimension = (
  input: DelayEvaluationInput,
  option: DelayOptionKind,
  key: keyof DelayDecisionModel,
): DelayEvaluationInput =>
  withModel(input, option, (model) => {
    const copy: Record<string, unknown> = { ...model };
    delete copy[key as string];
    return copy as unknown as DelayDecisionModel;
  });

// ---------------------------------------------------------------------------
// The ten §18 options — evaluated, dimensioned, ranked
// ---------------------------------------------------------------------------

test('the TEN §18 options (nine + no-op baseline) are each evaluated with their full dimension model', async () => {
  const analysis = asAnalysis(await port().evaluateDelayDecision(evaluationInput()));
  assert.equal(analysis.lines.length, 10);
  assert.deepEqual(
    analysis.lines.map((line) => line.optionKind),
    [...DELAY_OPTION_KINDS],
  );
  for (const line of analysis.lines) {
    assert.equal(line.applicable, true);
    assert.notEqual(line.dimensions, null);
    const dimensions = line.dimensions as DelayDecisionModel;
    // ALL SEVEN §18 tracked dimensions present as explicit typed records.
    assert.notEqual(dimensions.expectedIncrementalValue.estimate.amount, undefined);
    assert.notEqual(dimensions.expectedIncrementalValue.derivation, undefined);
    assert.notEqual(dimensions.estimatedWait.waitMs, undefined);
    assert.notEqual(dimensions.delayCost.perUnitTime.amount, undefined);
    assert.notEqual(dimensions.delayCost.source.kind, undefined);
    assert.notEqual(dimensions.acquisitionCost.kind, undefined);
    assert.notEqual(dimensions.acquisitionCost.estimate.amount, undefined);
    assert.notEqual(dimensions.successProbability.probability, undefined);
    assert.notEqual(dimensions.qualityImpact.declared, undefined);
    assert.notEqual(dimensions.alternativePaths.ordered.length > 0, false);
    // The EV computation is recorded on every applicable line.
    assert.notEqual(line.ev, null);
    assert.equal(line.ev?.policyId, 'mos-delay-decision-policy');
    assert.equal(line.ev?.policyVersion, 1);
    assert.equal(line.ev?.formula, 'ev-delay-1');
    assert.ok((line.ev?.formulaDocument ?? '').includes('EV(option) = p × V − D − A'));
  }
});

test('every applicable option carries the BY-REFERENCE target its option kind requires', async () => {
  const analysis = asAnalysis(await port().evaluateDelayDecision(evaluationInput()));
  const targetKindByOption: Record<DelayOptionKind, string> = {
    'no-op': 'none',
    wait: 'none',
    retry: 'none',
    abandon: 'none',
    'substitute-engine': 'engine',
    'substitute-capability-provider': 'capability',
    'switch-organization': 'organization',
    'switch-transform': 'transform',
    'reduce-scope': 'reduced-scope',
    'proceed-without-human': 'human-task',
  };
  for (const line of analysis.lines) {
    assert.equal(line.target?.kind, targetKindByOption[line.optionKind], line.optionKind);
  }
  const engineLine = analysis.lines.find((line) => line.optionKind === 'substitute-engine');
  assert.equal(engineLine?.target?.kind, 'engine');
  if (engineLine?.target?.kind === 'engine') {
    assert.equal(engineLine.target.engineId, 'engine:alt-video-transcode');
    assert.equal(engineLine.target.engineVersion, 3);
  }
});

test('inapplicable options are recorded with their named reason and excluded from the ranking', async () => {
  const delayPort = port();
  const analysis = asAnalysis(
    await delayPort.evaluateDelayDecision(
      evaluationInput({ inapplicable: ['switch-organization', 'abandon'] }),
    ),
  );
  const organizationLine = analysis.lines.find((line) => line.optionKind === 'switch-organization');
  assert.equal(organizationLine?.applicable, false);
  assert.ok((organizationLine?.inapplicableReason ?? '').length > 0);
  assert.equal(organizationLine?.dimensions, null);
  assert.equal(organizationLine?.ev, null);
  assert.equal(
    analysis.ranked.some((ranked) => ranked.optionKind === 'switch-organization'),
    false,
  );
  assert.equal(analysis.ranked.length, 8);
});

test('an inapplicable option without a named reason fails closed', async () => {
  const input = evaluationInput();
  const mutated: DelayEvaluationInput = {
    ...input,
    context: {
      ...input.context,
      options: input.context.options.map((declaration) =>
        declaration.optionKind === 'retry'
          ? { ...declaration, applicable: false, inapplicableReason: null, dimensions: null }
          : declaration,
      ),
    },
  };
  const failure = asError(await port().evaluateDelayDecision(mutated));
  assert.equal(failure.error, 'invalid-option-declaration');
  assert.equal(failure.option, 'retry');
  assert.match(failure.message, /named reason/);
});

test('exactly the ten option declarations are required — missing or duplicate kinds fail closed', async () => {
  const input = evaluationInput();
  const missing = {
    ...input,
    context: { ...input.context, options: input.context.options.slice(0, 9) },
  };
  const missingFailure = asError(await port().evaluateDelayDecision(missing));
  assert.equal(missingFailure.error, 'invalid-option-declaration');
  assert.match(missingFailure.message, /10 option declarations/);

  const duplicated = {
    ...input,
    context: {
      ...input.context,
      options: [...input.context.options.slice(0, 9), input.context.options[0]!],
    },
  };
  const duplicateFailure = asError(await port().evaluateDelayDecision(duplicated));
  assert.equal(duplicateFailure.error, 'invalid-option-declaration');
  assert.equal(duplicateFailure.option, 'no-op');
});

test('a context with zero applicable options fails closed', async () => {
  const failure = asError(
    await port().evaluateDelayDecision(
      evaluationInput({ inapplicable: [...DELAY_OPTION_KINDS] }),
    ),
  );
  assert.equal(failure.error, 'no-applicable-options');
});

// ---------------------------------------------------------------------------
// Named failures: dimensions missing / malformed / without provenance
// ---------------------------------------------------------------------------

test('a missing tracked dimension fails closed NAMING the dimension (sweep over all seven §18 dimensions)', async () => {
  const input = evaluationInput();
  for (const [dimension, key] of DELAY_DIMENSION_NAMES.map(
    (name): [DelayDimensionName, keyof DelayDecisionModel] => {
      const map: Record<DelayDimensionName, keyof DelayDecisionModel> = {
        'expected-incremental-value': 'expectedIncrementalValue',
        'estimated-wait': 'estimatedWait',
        'delay-cost': 'delayCost',
        'acquisition-cost': 'acquisitionCost',
        'success-probability': 'successProbability',
        'quality-impact': 'qualityImpact',
        'alternative-paths': 'alternativePaths',
      };
      return [name, map[name]];
    },
  )) {
    const failure = asError(
      await port().evaluateDelayDecision(withoutDimension(input, 'wait', key)),
    );
    assert.equal(failure.error, 'missing-dimension', dimension);
    assert.equal(failure.dimension, dimension, dimension);
    assert.equal(failure.option, 'wait', dimension);
  }
});

test('an estimate without provenance is rejected NAMING the dimension (sweep over the derivation-carrying dimensions)', async () => {
  const input = evaluationInput();
  const derivationKeys: readonly [DelayDimensionName, keyof DelayDecisionModel][] = [
    ['expected-incremental-value', 'expectedIncrementalValue'],
    ['estimated-wait', 'estimatedWait'],
    ['acquisition-cost', 'acquisitionCost'],
    ['success-probability', 'successProbability'],
    ['quality-impact', 'qualityImpact'],
  ];
  for (const [dimension, key] of derivationKeys) {
    const failure = asError(
      await port().evaluateDelayDecision(
        withModel(input, 'wait', (model) => {
          const copy = { ...model } as unknown as Record<string, Record<string, unknown>>;
          copy[key as string] = { ...copy[key as string], derivation: null };
          return copy as unknown as DelayDecisionModel;
        }),
      ),
    );
    assert.equal(failure.error, 'estimate-without-provenance', dimension);
    assert.equal(failure.dimension, dimension, dimension);
    assert.equal(failure.option, 'wait', dimension);
  }
});

test('a probability estimate with a derivation that cites nothing is rejected (never invented precision)', async () => {
  const input = evaluationInput();
  const blankNote = asError(
    await port().evaluateDelayDecision(
      withModel(input, 'wait', (model) => ({
        ...model,
        successProbability: {
          ...model.successProbability,
          derivation: { kind: 'ensemble-output', ensembleId: 'ensemble-reach' as never, ensembleVersion: 1, note: '   ' },
        },
      })),
    ),
  );
  assert.equal(blankNote.error, 'estimate-without-provenance');
  assert.equal(blankNote.dimension, 'success-probability');

  const unknownKind = asError(
    await port().evaluateDelayDecision(
      withModel(input, 'wait', (model) => ({
        ...model,
        successProbability: {
          ...model.successProbability,
          derivation: { kind: 'gut-feeling', note: 'it feels likely' } as never,
        },
      })),
    ),
  );
  assert.equal(unknownKind.error, 'estimate-without-provenance');
  assert.equal(unknownKind.dimension, 'success-probability');
  assert.match(unknownKind.message, /ensemble-output \| historical-observation \| declared-assumption/);
});

test('malformed dimension values fail closed naming the dimension and option', async () => {
  const input = evaluationInput();
  const cases: readonly [string, DelayEvaluationInput][] = [
    ['probability out of range', withModel(input, 'wait', (model) => ({
      ...model,
      successProbability: { ...model.successProbability, probability: 1.4 },
    }))],
    ['negative wait', withModel(input, 'wait', (model) => ({
      ...model,
      estimatedWait: { ...model.estimatedWait, waitMs: -1 },
    }))],
    ['zero delay-cost unit', withModel(input, 'wait', (model) => ({
      ...model,
      delayCost: { ...model.delayCost, unitMs: 0 },
    }))],
    ['delay cost without a source', withModel(input, 'wait', (model) => ({
      ...model,
      delayCost: { ...model.delayCost, source: { kind: 'declared-budget' } as never },
    }))],
    ['acquisition cost outside the §21 vocabulary', withModel(input, 'wait', (model) => ({
      ...model,
      acquisitionCost: { ...model.acquisitionCost, kind: 'agency-acquisition-cost' as never },
    }))],
    ['non-finite quality impact', withModel(input, 'wait', (model) => ({
      ...model,
      qualityImpact: { ...model.qualityImpact, declared: Number.NaN },
    }))],
  ];
  for (const [label, mutated] of cases) {
    const failure = asError(await port().evaluateDelayDecision(mutated));
    assert.equal(failure.error, 'invalid-dimension', label);
    assert.equal(failure.option, 'wait', label);
    assert.notEqual(failure.dimension, undefined, label);
  }
});

test('alternative-path violations fail closed naming the dimension', async () => {
  const input = evaluationInput();
  const selfReference = asError(
    await port().evaluateDelayDecision(
      withModel(input, 'wait', (model) => ({
        ...model,
        alternativePaths: { ordered: [{ order: 1, optionKind: 'wait' }] },
      })),
    ),
  );
  assert.equal(selfReference.error, 'invalid-dimension');
  assert.equal(selfReference.dimension, 'alternative-paths');

  const nonAscending = asError(
    await port().evaluateDelayDecision(
      withModel(input, 'wait', (model) => ({
        ...model,
        alternativePaths: {
          ordered: [
            { order: 2, optionKind: 'retry' },
            { order: 1, optionKind: 'abandon' },
          ],
        },
      })),
    ),
  );
  assert.equal(nonAscending.error, 'invalid-dimension');
  assert.equal(nonAscending.dimension, 'alternative-paths');

  const unknownKind = asError(
    await port().evaluateDelayDecision(
      withModel(input, 'wait', (model) => ({
        ...model,
        alternativePaths: { ordered: [{ order: 1, optionKind: 'escalate' as DelayOptionKind }] },
      })),
    ),
  );
  assert.equal(unknownKind.error, 'invalid-dimension');
  assert.equal(unknownKind.dimension, 'alternative-paths');
});

test('the uncertainty interval must bracket the value estimate (fail-closed by name)', async () => {
  const input = evaluationInput();
  const inverted = asError(
    await port().evaluateDelayDecision(
      withModel(input, 'wait', (model) => ({
        ...model,
        expectedIncrementalValue: {
          ...model.expectedIncrementalValue,
          interval: { lower: 1200, upper: 800 },
        },
      })),
    ),
  );
  assert.equal(inverted.error, 'invalid-interval');
  assert.equal(inverted.dimension, 'expected-incremental-value');

  const outside = asError(
    await port().evaluateDelayDecision(
      withModel(input, 'wait', (model) => ({
        ...model,
        expectedIncrementalValue: {
          ...model.expectedIncrementalValue,
          interval: { lower: 0, upper: 500 },
        },
      })),
    ),
  );
  assert.equal(outside.error, 'invalid-interval');
  assert.equal(outside.dimension, 'expected-incremental-value');
});

test('money terms that mix currencies fail closed (no invented exchange rates)', async () => {
  const input = evaluationInput();
  const failure = asError(
    await port().evaluateDelayDecision(
      withModel(input, 'wait', (model) => ({
        ...model,
        delayCost: {
          ...model.delayCost,
          perUnitTime: { amount: 20, currency: 'EUR' },
        },
      })),
    ),
  );
  assert.equal(failure.error, 'currency-mismatch');
  assert.equal(failure.option, 'wait');
});

// ---------------------------------------------------------------------------
// Target shape discipline (BY REFERENCE only)
// ---------------------------------------------------------------------------

test('a substitution target of the wrong shape for its option kind fails closed naming the option', async () => {
  const base = evaluationInput();
  const wrongEngineTarget = asError(
    await port().evaluateDelayDecision({
      ...base,
      context: decisionContext({
        targetOverrides: {
          'substitute-engine': { kind: 'capability', requirement: { capabilityId: 'capability:video-transcode' as never, version: 2 as never } },
        },
      }),
    }),
  );
  assert.equal(wrongEngineTarget.error, 'invalid-option-declaration');
  assert.equal(wrongEngineTarget.option, 'substitute-engine');

  const waitWithTarget = asError(
    await port().evaluateDelayDecision({
      ...base,
      context: decisionContext({
        targetOverrides: { wait: { kind: 'engine', engineId: 'engine:x' as never, engineVersion: 1 } },
      }),
    }),
  );
  assert.equal(waitWithTarget.error, 'invalid-option-declaration');
  assert.equal(waitWithTarget.option, 'wait');

  const providerSubstitution = asAnalysis(
    await port().evaluateDelayDecision({
      ...base,
      context: decisionContext({
        targetOverrides: {
          'substitute-capability-provider': { kind: 'provider', providerId: 'provider:arena' as never, providerVersion: 4 },
        },
      }),
    }),
  );
  const providerLine = providerSubstitution.lines.find(
    (line) => line.optionKind === 'substitute-capability-provider',
  );
  assert.equal(providerLine?.target?.kind, 'provider');
});

// ---------------------------------------------------------------------------
// Reward-spec version pinning + policy version pinning + duplicates
// ---------------------------------------------------------------------------

test('the reward-spec denomination is pinned against the decision context', async () => {
  const matching = asAnalysis(
    await port().evaluateDelayDecision(evaluationInput({ rewardSpecVersion: 2 })),
  );
  assert.equal(matching.rewardSpecVersion, 2);
  for (const line of matching.lines) {
    assert.equal(line.dimensions?.expectedIncrementalValue.rewardSpecVersion, 2);
  }

  const input = evaluationInput();
  const mismatched = withModel(input, 'wait', (model) => ({
    ...model,
    expectedIncrementalValue: {
      ...model.expectedIncrementalValue,
      rewardSpecVersion: 2,
    },
  }));
  const failure = asError(await port().evaluateDelayDecision(mismatched));
  assert.equal(failure.error, 'reward-spec-mismatch');
  assert.equal(failure.dimension, 'expected-incremental-value');
  assert.equal(failure.option, 'wait');
});

test('the declared policy version is an explicit input — a mismatch fails closed', async () => {
  const failure = asError(
    await port().evaluateDelayDecision(evaluationInput({ policyVersion: 2 })),
  );
  assert.equal(failure.error, 'policy-version-mismatch');
  assert.match(failure.message, /version 2.*version 1/);
});

test('a duplicate analysis id in the same tenant scope fails closed', async () => {
  const delayPort = port();
  const input = evaluationInput();
  asAnalysis(await delayPort.evaluateDelayDecision(input));
  const failure = asError(await delayPort.evaluateDelayDecision(input));
  assert.equal(failure.error, 'duplicate-analysis');
});

// ---------------------------------------------------------------------------
// Tenant scoping
// ---------------------------------------------------------------------------

test('analyses are tenant-scoped — cross-tenant reads are indistinguishable from unknown', async () => {
  const delayPort = port();
  const input = evaluationInput();
  const analysis = asAnalysis(await delayPort.evaluateDelayDecision(input));
  assert.equal(analysis.tenantId, scopeOf('tenant-a').tenantId);

  assert.equal(
    await delayPort.getDelayDecisionAnalysis(scopeOf('tenant-b'), input.id),
    null,
  );
  assert.equal(
    await delayPort.getDelayDecisionAnalysis(scopeOf('tenant-a'), 'unknown' as never),
    null,
  );

  const sameIdOtherTenant = evaluationInput({ scope: scopeOf('tenant-b'), id: input.id });
  const otherTenant = asAnalysis(await delayPort.evaluateDelayDecision(sameIdOtherTenant));
  assert.equal(otherTenant.tenantId, scopeOf('tenant-b').tenantId);
  assert.equal((await delayPort.listDelayDecisionAnalyses(scopeOf('tenant-a'))).length, 1);
  assert.equal((await delayPort.listDelayDecisionAnalyses(scopeOf('tenant-b'))).length, 1);
  assert.equal(
    (await delayPort.getDelayDecisionAnalysis(scopeOf('tenant-a'), input.id))?.tenantId,
    scopeOf('tenant-a').tenantId,
  );
});

test('the same analysis id in two tenants never mixes records (cross-tenant bleed pin)', async () => {
  const delayPort = port();
  const sharedId = evaluationInput().id;
  const tenantA = asAnalysis(
    await delayPort.evaluateDelayDecision(evaluationInput({ scope: scopeOf('tenant-a'), id: sharedId })),
  );
  const tenantB = asAnalysis(
    await delayPort.evaluateDelayDecision(
      evaluationInput({ scope: scopeOf('tenant-b'), id: sharedId, dependency: 'a different dependency entirely' }),
    ),
  );
  assert.equal(tenantA.dependency, 'human voiceover for the reaction-format episode');
  assert.equal(tenantB.dependency, 'a different dependency entirely');
  assert.equal(
    (await delayPort.getDelayDecisionAnalysis(scopeOf('tenant-a'), sharedId))?.dependency,
    tenantA.dependency,
  );
  assert.equal(
    (await delayPort.getDelayDecisionAnalysis(scopeOf('tenant-b'), sharedId))?.dependency,
    tenantB.dependency,
  );
});

test('malformed top-level inputs fail closed', async () => {
  const failure = asError(
    await port().evaluateDelayDecision({ ...evaluationInput(), id: '   ' as never }),
  );
  assert.equal(failure.error, 'invalid-input');

  const stateFailure = asError(
    await port().evaluateDelayDecision({
      ...evaluationInput(),
      stateRefs: { ...evaluationInput().stateRefs, scopeStatement: '  ' },
    }),
  );
  assert.equal(stateFailure.error, 'invalid-input');
  assert.match(stateFailure.message, /scopeStatement/);
});

// ---------------------------------------------------------------------------
// Immutability (the W5-A/W6-A deep-freeze pinning discipline)
// ---------------------------------------------------------------------------

test('a stored analysis is IMMUTABLE at every nesting level (mutation throws, never corrupts)', async () => {
  const delayPort = port();
  const analysis = asAnalysis(await delayPort.evaluateDelayDecision(evaluationInput()));
  assert.throws(() => {
    (analysis.dependency as unknown as { dependency: string }).dependency = 'rewritten';
  }, TypeError);
  assert.throws(() => {
    (analysis.lines[1]!.dimensions as unknown as { waitMs: number }).waitMs = 99_999;
  }, TypeError);
  assert.throws(() => {
    (analysis.ranked[0]!.ev.expectedValueOfDelay as unknown as { amount: number }).amount = 1e9;
  }, TypeError);
  assert.throws(() => {
    (analysis.recommendation.dimensions!.successProbability as unknown as { probability: number }).probability = 0;
  }, TypeError);
  assert.throws(() => {
    (analysis.policy as unknown as { id: string }).id = 'rewritten-policy';
  }, TypeError);
  // The stored copy is unaffected by every failed mutation attempt above.
  const stored = await delayPort.getDelayDecisionAnalysis(scopeOf('tenant-a'), analysis.id);
  assert.notEqual(stored, null);
  assert.equal(stored!.dependency, 'human voiceover for the reaction-format episode');
  assert.equal(stored!.lines[1]!.dimensions!.estimatedWait.waitMs, 10_000);
  assert.equal(stored!.ranked[0]!.ev.expectedValueOfDelay.amount, 550);
  assert.deepEqual(stored, analysis);
});

test('mutating the CALLER input after evaluation never corrupts the stored analysis', async () => {
  const delayPort = port();
  const input = evaluationInput();
  const analysis = asAnalysis(await delayPort.evaluateDelayDecision(input));
  // The adapter clones-then-freezes; the caller's records stay caller-owned.
  (input.context as unknown as { dependency: string }).dependency = 'MUTATED-BY-CALLER';
  (input.context.options[1]!.dimensions as unknown as { waitMs: number }).waitMs = 0;
  const stored = await delayPort.getDelayDecisionAnalysis(scopeOf('tenant-a'), analysis.id);
  assert.notEqual(stored, null);
  assert.equal(stored!.dependency, 'human voiceover for the reaction-format episode');
  assert.equal(stored!.lines[1]!.dimensions!.estimatedWait.waitMs, 10_000);
  assert.equal(stored!.ranked.length, 10);
});
