import type { AgentOrganizationId } from '@mos/agents';
import type {
  BottleneckDecision,
  BottleneckDecisionId,
  CapabilityRequirement,
  EngineId,
  HumanProductionTaskId,
  Milliseconds,
  ProviderId,
  TenantId,
  TenantScope,
  Timestamp,
  TransformId,
  Version,
} from '@mos/contracts';
import type { IntervalOverlapDeclaration } from './organization-search.js';
import type {
  DelayDecisionAnalysisId,
  DelayDecisionModel,
  DelayOptionKind,
  DelayOptionTarget,
} from './delay-economics.js';
import type { DelayEvComputation, DelayDecisionPolicy } from './delay-policy.js';

/**
 * The delay decision ANALYSIS surface (LAB-015, §18): the state references,
 * the decision context with its ten option declarations, the per-option
 * analysis lines, the ranked comparison, the immutable analysis record and
 * the canonical CORE-001 `BottleneckDecision` projection.
 *
 * Basis: spec/mos-architecture-v2.0.md §18 (the Expected Value of Delay is a
 * first-class production strategy variable; the Lab's options; abandoned
 * branches remain auditable), §2 (delay-expectation in program search),
 * §21 (reward-spec denomination), §22 (uncertainty intervals carried on
 * estimates), spec/contracts/core-contracts-v2.0.yaml BottleneckDecision
 * (the frozen canonical record: id, version, dependency,
 * expectedIncrementalValue, expectedWait, delayCost, acquisitionCost,
 * successProbability, qualityImpact, selectedAction), spec/mos-effective-
 * backlog-v2.0.md LAB-015 (deps LAB-009 ✓ + LAB-014 ✓).
 *
 * The FORMULA is DECLARED VERSIONED POLICY (delay-policy.ts), never hidden
 * math. §24 BOUNDARY: the analysis is a RECORDED RECOMMENDATION — executing
 * the selected option goes through the owning authorities; nothing here
 * deploys, publishes or waits.
 */

// ---------------------------------------------------------------------------
// State references + decision context
// ---------------------------------------------------------------------------

/**
 * The current state the decision is evaluated against, BY REFERENCE ONLY:
 * the dependency being waited on, the currently bound engine / capability /
 * provider / organization / transform and the production scope statement.
 * Existence resolution is composition-root wiring (the same W6-A structural
 * declaration discipline); the lab validates structure and cites refs.
 */
export interface DelayStateReferences {
  /** The human production task being waited on, when the bottleneck is human (§17). */
  readonly humanTaskId: HumanProductionTaskId | null;
  /** The engine currently bound to the bottleneck step (registry vocabulary). */
  readonly engineId: EngineId | null;
  readonly engineVersion: number | null;
  /** The capability currently supplying the step (ref only). */
  readonly capability: CapabilityRequirement | null;
  /** The provider currently supplying the step (INTEG-001 vocabulary). */
  readonly providerId: ProviderId | null;
  readonly providerVersion: number | null;
  /** The organization currently producing (descriptor ref only). */
  readonly organizationId: AgentOrganizationId | null;
  readonly organizationVersion: number | null;
  /** The transform currently applied (exact version, ref only). */
  readonly transformId: TransformId | null;
  readonly transformVersion: number | null;
  /** The production scope the decision is about (non-blank statement). */
  readonly scopeStatement: string;
}

/**
 * The decision context: the dependency descriptor (the canonical
 * `BottleneckDecision.dependency` is an opaque descriptor — carried
 * verbatim), the §21 reward spec version the estimates are denominated in,
 * the optional deadline (§17) and the ten per-option declarations.
 */
export interface DelayDecisionContext {
  /** The dependency being decided on (non-blank; carried verbatim onto the analysis). */
  readonly dependency: string;
  /** The active §21 reward spec version — every option's value estimate must be denominated in it. */
  readonly rewardSpecVersion: number;
  /** The deadline after which waiting stops being worth it (§17; null = no deadline). */
  readonly deadline: Timestamp | null;
  /** EXACTLY ONE declaration per §18 option kind (the ten). */
  readonly options: readonly DelayOptionDeclaration[];
}

/**
 * One option's declaration: applicability (with a NAMED reason when not
 * applicable), the BY-REFERENCE target and — for applicable options — the
 * complete §18 tracked-dimension model with provenance-carrying estimates.
 */
export interface DelayOptionDeclaration {
  readonly optionKind: DelayOptionKind;
  readonly applicable: boolean;
  /** Required (non-blank) when `applicable` is false — inapplicability is declared, never silent. */
  readonly inapplicableReason: string | null;
  /** The option's target; required for applicable options, shape-checked per kind. */
  readonly target: DelayOptionTarget | null;
  /** The seven-dimension model; REQUIRED for applicable options. */
  readonly dimensions: DelayDecisionModel | null;
}

// ---------------------------------------------------------------------------
// The analysis (one immutable evaluated record)
// ---------------------------------------------------------------------------

/**
 * One recorded analysis line: the option kind, its tracked dimensions, and
 * the EV-of-delay computation (null when the option is not applicable — the
 * named inapplicability reason is recorded instead).
 */
export interface DelayOptionAnalysisLine {
  readonly optionKind: DelayOptionKind;
  readonly applicable: boolean;
  /** The named inapplicability reason (null for applicable options). */
  readonly inapplicableReason: string | null;
  /** The BY-REFERENCE target (recorded verbatim from the declaration). */
  readonly target: DelayOptionTarget | null;
  /** The option's §18 tracked-dimension model (null when not applicable). */
  readonly dimensions: DelayDecisionModel | null;
  /** The EV-of-delay computation under the declared versioned policy (null when not applicable). */
  readonly ev: DelayEvComputation | null;
}

/** One ranked option: the declared ranking policy's deterministic order. */
export interface DelayRankedOption {
  /** 1-based rank (the declared ranking policy's order). */
  readonly rank: number;
  readonly optionKind: DelayOptionKind;
  readonly target: DelayOptionTarget;
  /** The option's EV computation (the ranking primary key). */
  readonly ev: DelayEvComputation;
  /** Null on rank 1; declared interval overlap vs the leader for every other rank. */
  readonly intervalOverlapWithLeader: IntervalOverlapDeclaration | null;
}

/**
 * A complete delay decision analysis — ONE immutable, tenant-scoped record:
 * the policy snapshot, the state refs, the decision context summary, ALL TEN
 * analysis lines (§18 order, no-op baseline first), the ranked comparison of
 * the applicable options and the rank-1 RECOMMENDATION line.
 *
 * DISCLOSURE (§24): the analysis is a recorded recommendation — executing
 * the selected option goes through the owning authorities; the §24
 * real-experiment boundary is untouched.
 */
export interface DelayDecisionAnalysis {
  readonly id: DelayDecisionAnalysisId;
  readonly tenantId: TenantId;
  readonly evaluatedAt: Timestamp;
  /** The declared versioned policy snapshot that produced this analysis. */
  readonly policy: DelayDecisionPolicy;
  /** The recorded determinism seed (the v1 formula is closed-form — recorded, unused). */
  readonly seed: number | null;
  readonly stateRefs: DelayStateReferences;
  /** The dependency descriptor (carried verbatim from the context). */
  readonly dependency: string;
  /** The §21 reward spec version the estimates are denominated in. */
  readonly rewardSpecVersion: number;
  /** The optional §17 deadline carried from the context. */
  readonly deadline: Timestamp | null;
  /** ALL TEN option lines in §18 order (no-op baseline first). */
  readonly lines: readonly DelayOptionAnalysisLine[];
  /** The applicable options, ranked by the declared deterministic policy. */
  readonly ranked: readonly DelayRankedOption[];
  /** The rank-1 line — the declared recommendation (§18: waiting is a decision variable). */
  readonly recommendation: DelayOptionAnalysisLine;
  readonly disclosure: 'declared-estimates-under-declared-versioned-policy';
  /** §24 boundary statement carried on the record. */
  readonly decisionBoundary:
    'the analysis is a recorded recommendation — executing the selected option goes through the owning authorities; the real-experiment boundary (§24) is untouched';
}

/** One delay decision evaluation request. */
export interface DelayEvaluationInput {
  readonly scope: TenantScope;
  readonly id: DelayDecisionAnalysisId;
  /** The declared policy version this evaluation pins (must equal the wired policy's version). */
  readonly policyVersion: number;
  /** Determinism seed (recorded on the analysis; the v1 formula is closed-form). */
  readonly seed?: number | null;
  readonly stateRefs: DelayStateReferences;
  readonly context: DelayDecisionContext;
}

// ---------------------------------------------------------------------------
// Canonical CORE-001 projection
// ---------------------------------------------------------------------------

const canonicalActionOf = (
  optionKind: DelayOptionKind,
  target: DelayOptionTarget | null,
): BottleneckDecision['selectedAction'] | null => {
  switch (optionKind) {
    case 'wait':
      return 'wait';
    case 'retry':
      return 'retry';
    case 'substitute-engine':
      return 'substitute-engine';
    case 'substitute-capability-provider':
      return target !== null && target.kind === 'provider'
        ? 'substitute-provider'
        : 'substitute-capability';
    case 'switch-organization':
      return 'switch-organization';
    case 'switch-transform':
      return 'switch-transform';
    case 'reduce-scope':
      return 'reduce-scope';
    case 'proceed-without-human':
      return 'proceed-without-human';
    case 'abandon':
      return 'abandon';
    case 'no-op':
      // The no-op baseline is a PROGRAM-SPACE dimension (§7 / lock rule 5);
      // the canonical §18 action vocabulary has no no-op action. The
      // projection returns null for a no-op recommendation (documented,
      // disclosed — the W6-A canonical-drop precedent).
      return null;
  }
};

/**
 * The canonical CORE-001 `BottleneckDecision` projection of an analysis
 * (derived, read-only): the dependency, the recommendation's tracked
 * dimensions (expected incremental value, expected wait, the TOTAL delay
 * cost over the estimated wait — the formula's D term, acquisition cost,
 * success probability, quality impact) and the selected action mapped onto
 * the frozen `BottleneckAction` vocabulary (`substitute-capability-provider`
 * maps to `substitute-capability` / `substitute-provider` by its target
 * kind). Returns `null` when the recommendation is the NO-OP baseline (the
 * canonical §18 action vocabulary cannot express it — documented above).
 */
export const canonicalBottleneckDecisionView = (
  analysis: DelayDecisionAnalysis,
): BottleneckDecision | null => {
  const recommendation = analysis.recommendation;
  const action = canonicalActionOf(recommendation.optionKind, recommendation.target);
  if (action === null || recommendation.dimensions === null) {
    return null;
  }
  const dimensions = recommendation.dimensions;
  const waitUnits = dimensions.estimatedWait.waitMs / dimensions.delayCost.unitMs;
  return {
    id: analysis.id as unknown as BottleneckDecisionId,
    version: 1 as Version,
    dependency: analysis.dependency,
    expectedIncrementalValue: dimensions.expectedIncrementalValue.estimate,
    expectedWait: dimensions.estimatedWait.waitMs as Milliseconds,
    delayCost: {
      amount: Math.round(
        dimensions.delayCost.perUnitTime.amount * waitUnits * 1e10,
      ) / 1e10,
      currency: dimensions.delayCost.perUnitTime.currency,
    },
    acquisitionCost: dimensions.acquisitionCost.estimate,
    successProbability: dimensions.successProbability.probability,
    qualityImpact: dimensions.qualityImpact.declared,
    selectedAction: action,
  };
};
