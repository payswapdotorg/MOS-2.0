import type { TenantScope, Timestamp } from '@mos/contracts';
import type { WorldModelEnsemble, WorldModelEnsembleId } from '../contracts/ensemble.js';
import type {
  DelayDecisionAnalysis,
  DelayEvaluationInput,
  DelayOptionAnalysisLine,
  DelayRankedOption,
} from '../contracts/delay-decision.js';
import type { DelayDecisionPolicy } from '../contracts/delay-policy.js';
import { DELAY_DECISION_POLICY_V1 } from '../contracts/delay-policy.js';
import type {
  DelayDecisionError,
  DelayDecisionPort,
  RecordDelayAbandonmentInput,
  RecordDelayAbandonmentOutcomeInput,
} from '../contracts/delay-decision-port.js';
import type {
  DelayAbandonmentRecord,
} from '../contracts/delay-abandonment.js';
import type {
  DelayAbandonmentRecordId,
  DelayDecisionAnalysisId,
} from '../contracts/delay-economics.js';
import {
  DELAY_OPTION_KINDS,
} from '../contracts/delay-economics.js';
import { computeOptionEv, rankApplicableLines } from './delay-ev-computation.js';
import {
  ensembleDerivationsOf,
} from './delay-decision-validation.js';
import {
  evaluationInputProblem,
  learningOutcomeProblem,
  optionTargetProblem,
  toDelayError,
} from './delay-target-validation.js';
import { cloneDeep, deepFreeze, isBlankString, isPlainObject } from './parametric-support.js';

/**
 * The narrow LAB-007 ensemble view the delay surface consumes (the W5-A
 * narrow-registry-view precedent): exact-version ensemble resolution only.
 * `EnsemblePort` satisfies this structurally — the composition root wires
 * the real ensemble store; tests wire the real in-memory ensemble.
 */
export interface DelayEnsembleView {
  /** Resolve one ensemble at an EXACT version, or `null` when unknown in scope. */
  getEnsemble(
    scope: TenantScope,
    id: WorldModelEnsembleId,
    version: number,
  ): Promise<WorldModelEnsemble | null>;
}

/**
 * Options for {@link createInMemoryDelayEconomics}.
 *
 * `policy` defaults to the shipped {@link DELAY_DECISION_POLICY_V1} (a
 * DECLARED VERSIONED policy — the formula is documented, never hidden
 * math); a caller-supplied policy must be well-formed (non-blank id,
 * integer version ≥ 1, non-blank formula document, `ev-delay-1` formula,
 * declared ranking). `ensemble` is the OPTIONAL LAB-007 view: when wired,
 * every `ensemble-output` derivation resolves fail-closed
 * (`ensemble-derivation-unresolved` naming the option); when absent,
 * ensemble derivations stay STRUCTURAL declarations (the W6-A disclosed
 * seam discipline, pinned by test). `now` is injectable for deterministic
 * timestamps.
 */
export interface InMemoryDelayEconomicsOptions {
  readonly policy?: DelayDecisionPolicy;
  readonly ensemble?: DelayEnsembleView;
  readonly now?: () => Timestamp;
}

const nowDefault = (): Timestamp => new Date().toISOString() as Timestamp;

const policyProblem = (policy: unknown): string | null => {
  if (!isPlainObject(policy)) {
    return 'the delay decision policy must be a declared policy record';
  }
  const record = policy as Record<string, unknown>;
  if (typeof record.id !== 'string' || isBlankString(record.id)) {
    return 'the policy id must be a non-blank string';
  }
  if (typeof record.version !== 'number' || !Number.isInteger(record.version) || record.version < 1) {
    return 'the policy version must be an integer >= 1';
  }
  if (record.formula !== 'ev-delay-1') {
    return 'the in-memory adapter implements exactly the ev-delay-1 formula';
  }
  if (typeof record.formulaDocument !== 'string' || isBlankString(record.formulaDocument)) {
    return 'the policy must document its formula (never hidden math)';
  }
  if (!isPlainObject(record.ranking) || record.ranking.kind !== 'uncertainty-aware-deterministic') {
    return 'the policy must declare the uncertainty-aware deterministic ranking';
  }
  return null;
};

/**
 * Build an in-memory {@link DelayDecisionPort} (LAB-015).
 *
 * W7-A DISCLOSURE: ephemeral, process-local scaffold (no durable
 * persistence — TL-owned). The adapter is a DISCLOSED DETERMINISTIC DOUBLE
 * of the decision surface: it implements EXACTLY the declared versioned
 * policy's documented formula (`ev-delay-1`) and the declared deterministic
 * ranking — no other math exists here; the EV-of-delay computation is
 * declared, versioned policy, never hidden math. Analyses are immutable
 * deep-frozen records keyed per (tenant, analysis id); abandonment records
 * are versioned append-only (an outcome append produces version + 1; prior
 * versions stay resolvable BIT-FOR-BIT). Estimates arrive as caller DECLARED
 * values with provenance — the adapter never invents precision, never
 * resolves engines/capabilities/providers/organizations/transforms (BY
 * REFERENCE only) and resolves ensemble-output derivations ONLY through the
 * optional wired LAB-007 view.
 */
export function createInMemoryDelayEconomics(
  options: InMemoryDelayEconomicsOptions = {},
): DelayDecisionPort {
  const policyProblemText = policyProblem(options.policy);
  if (options.policy !== undefined && policyProblemText !== null) {
    throw new Error(`createInMemoryDelayEconomics: ${policyProblemText}`);
  }
  const policy = options.policy ?? DELAY_DECISION_POLICY_V1;
  const ensembleView = options.ensemble;
  const now = options.now ?? nowDefault;

  /** Analyses keyed per (tenant, analysis id) — insertion order preserved. */
  const analyses = new Map<string, Map<string, DelayDecisionAnalysis>>();
  /** Abandonment version chains keyed per (tenant, record id). */
  const abandonments = new Map<string, Map<string, readonly DelayAbandonmentRecord[]>>();
  /** Insertion order of abandonment record ids per tenant. */
  const abandonmentOrder = new Map<string, string[]>();

  const tenantMap = <T>(store: Map<string, Map<string, T>>, tenantId: string): Map<string, T> => {
    const existing = store.get(tenantId);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Map<string, T>();
    store.set(tenantId, created);
    return created;
  };

  const abandonmentOrderOf = (tenantId: string): string[] => {
    const existing = abandonmentOrder.get(tenantId);
    if (existing !== undefined) {
      return existing;
    }
    const created: string[] = [];
    abandonmentOrder.set(tenantId, created);
    return created;
  };

  const fail = (
    error: DelayDecisionError['error'],
    message: string,
    extra?: { dimension?: DelayDecisionError['dimension']; option?: DelayDecisionError['option'] },
  ): DelayDecisionError => ({
    error,
    message,
    ...(extra?.dimension === undefined ? {} : { dimension: extra.dimension }),
    ...(extra?.option === undefined ? {} : { option: extra.option }),
  });

  /** Resolve every ensemble-output derivation through the wired view (fail-closed). */
  const resolveEnsembleDerivations = async (
    scope: TenantScope,
    input: DelayEvaluationInput,
  ): Promise<DelayDecisionError | null> => {
    if (ensembleView === undefined) {
      return null;
    }
    for (const declaration of input.context.options) {
      if (declaration.applicable !== true || declaration.dimensions === null) {
        continue;
      }
      for (const entry of ensembleDerivationsOf(declaration.dimensions)) {
        if (entry.derivation.kind !== 'ensemble-output') {
          continue;
        }
        const resolved = await ensembleView.getEnsemble(
          scope,
          entry.derivation.ensembleId,
          entry.derivation.ensembleVersion,
        );
        if (resolved === null) {
          return fail(
            'ensemble-derivation-unresolved',
            `the ${entry.dimension} estimate of option "${declaration.optionKind}" cites ensemble ${String(entry.derivation.ensembleId)}@${String(entry.derivation.ensembleVersion)} which does not resolve in this tenant scope`,
            { dimension: entry.dimension, option: declaration.optionKind },
          );
        }
      }
    }
    return null;
  };

  return {
    async evaluateDelayDecision(input: DelayEvaluationInput) {
      const inputFailure = evaluationInputProblem(input);
      if (inputFailure !== null) {
        return toDelayError(inputFailure);
      }
      if (input.policyVersion !== policy.version) {
        return fail(
          'policy-version-mismatch',
          `the evaluation pins policy version ${String(input.policyVersion)} but the wired policy "${policy.id}" is version ${String(policy.version)} — the declared policy version is an explicit input, never a silent default`,
        );
      }
      const store = tenantMap(analyses, String(input.scope.tenantId));
      if (store.has(input.id)) {
        return fail('duplicate-analysis', `a delay decision analysis already exists in this tenant scope: ${input.id}`);
      }
      const ensembleFailure = await resolveEnsembleDerivations(input.scope, input);
      if (ensembleFailure !== null) {
        return ensembleFailure;
      }

      // ALL TEN lines in §18 order (no-op baseline first).
      const byKind = new Map(input.context.options.map((declaration) => [declaration.optionKind, declaration]));
      const lines: DelayOptionAnalysisLine[] = DELAY_OPTION_KINDS.map((optionKind) => {
        const declaration = byKind.get(optionKind);
        if (declaration === undefined || declaration.applicable !== true) {
          return {
            optionKind,
            applicable: false,
            inapplicableReason: declaration?.inapplicableReason ?? 'not declared applicable in this decision context',
            target: null,
            dimensions: null,
            ev: null,
          };
        }
        const dimensions = declaration.dimensions as NonNullable<typeof declaration.dimensions>;
        return {
          optionKind,
          applicable: true,
          inapplicableReason: null,
          target: declaration.target,
          dimensions,
          ev: computeOptionEv(policy, dimensions),
        };
      });
      const ranked: readonly DelayRankedOption[] = rankApplicableLines(lines);
      const recommendation = lines.find((line) => line.optionKind === ranked[0]?.optionKind) ?? null;
      if (recommendation === null) {
        return fail('no-applicable-options', 'a delay decision analysis requires at least one applicable option');
      }
      const evaluatedAt = now();
      const analysis: DelayDecisionAnalysis = deepFreeze(cloneDeep({
        id: input.id,
        tenantId: input.scope.tenantId,
        evaluatedAt,
        policy: { ...policy },
        seed: input.seed ?? null,
        stateRefs: input.stateRefs,
        dependency: input.context.dependency,
        rewardSpecVersion: input.context.rewardSpecVersion,
        deadline: input.context.deadline,
        lines,
        ranked,
        recommendation,
        disclosure: 'declared-estimates-under-declared-versioned-policy',
        decisionBoundary:
          'the analysis is a recorded recommendation — executing the selected option goes through the owning authorities; the real-experiment boundary (§24) is untouched',
      }));
      store.set(input.id, analysis);
      return analysis;
    },

    async getDelayDecisionAnalysis(scope: TenantScope, analysisId: DelayDecisionAnalysisId) {
      return tenantMap(analyses, String(scope.tenantId)).get(analysisId) ?? null;
    },

    async listDelayDecisionAnalyses(scope: TenantScope) {
      return [...tenantMap(analyses, String(scope.tenantId)).values()];
    },

    async recordDelayAbandonment(input: RecordDelayAbandonmentInput) {
      if (!isPlainObject(input) || typeof input.recordId !== 'string' || isBlankString(input.recordId)) {
        return fail('invalid-abandonment', 'the abandonment record id must be a non-blank string');
      }
      if (!isPlainObject(input.scope) || typeof (input.scope as Record<string, unknown>).tenantId !== 'string') {
        return fail('invalid-abandonment', 'the abandonment input must carry a tenant scope');
      }
      const analysis = tenantMap(analyses, String(input.scope.tenantId)).get(input.analysisId);
      if (analysis === undefined) {
        return fail('analysis-not-found', `the abandonment cites an analysis that does not resolve in this tenant scope: ${String(input.analysisId)}`);
      }
      if (!isPlainObject(input.abandonedPath) || typeof input.abandonedPath.optionKind !== 'string') {
        return fail('invalid-abandonment', 'the abandoned path must name its option kind');
      }
      const targetFailure = optionTargetProblem(
        input.abandonedPath.target,
        input.abandonedPath.optionKind,
      );
      if (targetFailure !== null) {
        return fail('invalid-abandonment', targetFailure.message, { option: input.abandonedPath.optionKind });
      }
      if (typeof input.reason !== 'string' || isBlankString(input.reason)) {
        return fail('invalid-abandonment', 'the abandonment reason must be non-blank (abandonment is never silent)');
      }
      const recordStore = tenantMap(abandonments, String(input.scope.tenantId));
      if (recordStore.has(input.recordId)) {
        return fail('duplicate-abandonment-record', `an abandoned-path record already exists in this tenant scope: ${input.recordId}`);
      }
      const abandonedAt = now();
      const record: DelayAbandonmentRecord = deepFreeze(cloneDeep({
        id: input.recordId,
        version: 1,
        tenantId: input.scope.tenantId,
        analysisId: input.analysisId,
        dependency: analysis.dependency,
        abandonedPath: input.abandonedPath,
        reason: input.reason,
        analysis,
        outcomes: [],
        abandonedAt,
        updatedAt: abandonedAt,
        learningFeed: 'abandoned-branches-are-learning-data-no-learning-implemented',
      }));
      recordStore.set(input.recordId, [record]);
      const order = abandonmentOrderOf(String(input.scope.tenantId));
      if (!order.includes(input.recordId)) {
        order.push(input.recordId);
      }
      return record;
    },

    async recordDelayAbandonmentOutcome(input: RecordDelayAbandonmentOutcomeInput) {
      if (!isPlainObject(input) || typeof input.recordId !== 'string' || isBlankString(input.recordId)) {
        return fail('invalid-abandonment', 'the abandonment record id must be a non-blank string');
      }
      if (!isPlainObject(input.scope) || typeof (input.scope as Record<string, unknown>).tenantId !== 'string') {
        return fail('invalid-abandonment', 'the outcome input must carry a tenant scope');
      }
      const outcomeFailure = learningOutcomeProblem(input.outcome);
      if (outcomeFailure !== null) {
        return toDelayError(outcomeFailure);
      }
      const recordStore = tenantMap(abandonments, String(input.scope.tenantId));
      const chain = recordStore.get(input.recordId);
      if (chain === undefined || chain.length === 0) {
        return fail('abandonment-not-found', `no abandoned-path record resolves in this tenant scope: ${input.recordId}`);
      }
      const latest = chain[chain.length - 1]!;
      const appended: DelayAbandonmentRecord = deepFreeze(cloneDeep({
        ...latest,
        version: latest.version + 1,
        outcomes: [...latest.outcomes, input.outcome],
        updatedAt: now(),
      }));
      recordStore.set(input.recordId, [...chain, appended]);
      return appended;
    },

    async getDelayAbandonmentRecord(scope: TenantScope, recordId: DelayAbandonmentRecordId, version?: number) {
      const chain = tenantMap(abandonments, String(scope.tenantId)).get(recordId);
      if (chain === undefined) {
        return null;
      }
      if (version === undefined) {
        return chain[chain.length - 1] ?? null;
      }
      return chain.find((record) => record.version === version) ?? null;
    },

    async listDelayAbandonmentRecords(scope: TenantScope) {
      const order = abandonmentOrderOf(String(scope.tenantId));
      const recordStore = tenantMap(abandonments, String(scope.tenantId));
      return order
        .map((recordId) => recordStore.get(recordId))
        .filter((chain): chain is readonly DelayAbandonmentRecord[] => chain !== undefined)
        .map((chain) => chain[chain.length - 1]!)
        .filter((record) => record !== undefined);
    },
  };
}
