/**
 * BRIDGE-002 contracts — the §19 Studio-output evaluation/treatment record
 * family (spec/mos-architecture-v2.0.md §19 — THIS file's law).
 *
 * The Lab-side verdict over PRODUCED studio output, recorded through the
 * bridge with full attribution: an evaluation consumes a BRIDGE-001 entry
 * chain's packaged output (the entry's `packageRef` cited at EXACT version,
 * resolved through the canonical STUDIO-013 packaging authority) together
 * with the entry's DECLARED EXPECTATIONS (`LabToStudioDeclaredExpectations`
 * — simulation-based, counterfactual-labeled, lock rule 29: never evidence).
 *
 * THE TEN §19 DECISION KINDS (the closed typed vocabulary — exact names):
 * accept; reject-quality; reject-strategy; request-treatment;
 * require-human-action; switch-organization; switch-transform; switch-engine;
 * accept-alternate-output; abandon.
 *
 * Quality rejection is DISTINCT from rights/policy rejection (§19): the
 * evaluation vocabulary carries reject-quality/reject-strategy ONLY —
 * rights/policy denials come from the §24 gate chain (BRIDGE-001's typed
 * entry failures) and can NEVER be smuggled through this surface (pinned:
 * no such decision kind exists, unknown kinds fail closed typed).
 *
 * Treatment creates a NEW IMMUTABLE LINKED version (§19): a request-treatment
 * or switch-* decision references the prior package version and RESERVES an
 * append-only linkage that `recordTreatmentSuccessor` completes by CITING the
 * successor version the studio's own path composed through STUDIO-013 (the
 * bridge NEVER packages by itself — the BRIDGE-001 recordStudioPackage
 * citation discipline). Prior versions never mutate.
 *
 * Decisions DRIVE the chain, never execute it (§24): switch-* verdicts route
 * back to the Lab/production search surfaces BY REFERENCE; this authority
 * never resolves engines, never instantiates organizations, never calls
 * providers, and never invokes the studio runtime (pinned structurally —
 * read-only seams only).
 *
 * Basis: §19 (the law), §2 (EV-of-delay rides the expectations), §18
 * (abandoned branches remain auditable, may be learning data), §22
 * (simulator outputs are never ground truth), §24 (boundary), §30
 * (observability), §31 (tenant scope); lock rules 14/23/29.
 */

import type { IdentityRef, TenantScope } from "@mos/contracts";

import type {
  LabToStudioCandidateCitation,
  LabToStudioDeclaredExpectations,
  LabToStudioMissionLinkage,
  LabToStudioStudioEntry,
} from "../../contracts/lab-to-studio-entry.js";
import type {
  StudioArtifactPackageId,
  StudioSessionId,
  Timestamp,
} from "../../../contracts/refs.js";
import type { TreatmentKind } from "../../../contracts/treatment.js";

// ---------------------------------------------------------------------------
// The §24 boundary statement (carried on EVERY record, verbatim)
// ---------------------------------------------------------------------------

/**
 * The §24 boundary statement every evaluation record carries: this is a
 * Lab-side RECORDED VERDICT over produced studio output — decisions drive the
 * chain, never execute it, and Lab/Studio never call social platforms
 * directly.
 */
export const STUDIO_EVALUATION_BOUNDARY_STATEMENT =
  "a Lab-side §19 verdict recorded over produced studio output — decisions drive the chain, never execute it; Lab/Studio never call social platforms directly" as const;

// ---------------------------------------------------------------------------
// THE TEN §19 DECISION KINDS (closed typed vocabulary — exact names)
// ---------------------------------------------------------------------------

/**
 * The ten §19 decision kinds, in spec order. CLOSED vocabulary: extension is
 * a spec change (§19 is frozen), never a call-site act — unknown kinds fail
 * closed with typed `decision-kind-out-of-vocabulary` and record NOTHING.
 */
export const STUDIO_EVALUATION_DECISION_KINDS = [
  "accept",
  "reject-quality",
  "reject-strategy",
  "request-treatment",
  "require-human-action",
  "switch-organization",
  "switch-transform",
  "switch-engine",
  "accept-alternate-output",
  "abandon",
] as const;

/** One §19 decision kind (the closed union — exactly ten members). */
export type StudioEvaluationDecisionKind = (typeof STUDIO_EVALUATION_DECISION_KINDS)[number];

/** The runtime intake gate's closed decision-kind set. */
export const STUDIO_EVALUATION_DECISION_KIND_SET: ReadonlySet<string> = new Set(
  STUDIO_EVALUATION_DECISION_KINDS,
);

/**
 * The treatment-creating kinds (§19: "every treatment creates a new immutable
 * linked artifact/output version"): a request-treatment or switch-* decision
 * references the prior package version and opens the reserved linkage.
 */
export const TREATMENT_LINKED_DECISION_KINDS = [
  "request-treatment",
  "switch-organization",
  "switch-transform",
  "switch-engine",
] as const satisfies readonly StudioEvaluationDecisionKind[];

/** The treatment-creating decision kinds (request-treatment + switch-*). */
export type TreatmentLinkedDecisionKind = (typeof TREATMENT_LINKED_DECISION_KINDS)[number];

// ---------------------------------------------------------------------------
// Decision payloads (pure data — every shape is store-freezable)
// ---------------------------------------------------------------------------

/** The §19 treatment directive over the prior version (request-treatment). */
export interface StudioTreatmentDirective {
  /** The studio's own closed treatment vocabulary (contracts/treatment.ts). */
  readonly kind: TreatmentKind;
  /** Out-of-line parameters ref (no media over control RPC). */
  readonly parametersRef?: string;
  readonly rationale: string;
}

/**
 * The LAB-014 routing citation (require-human-action): the human production
 * task surface is referenced BY REFERENCE — this authority never creates a
 * Human Production Task (the Lab's own authority owns that lifecycle).
 */
export interface HumanActionRouting {
  readonly objective: string;
  readonly rationale: string;
  /** An already-created LAB-014 task package citation, when one exists. */
  readonly referencedTaskPackage?: { readonly id: string; readonly version: number };
}

/**
 * The Lab/production search routing citation (switch-* verdicts): the verdict
 * routes BACK to the Lab's production-program search surface BY REFERENCE —
 * this authority never resolves engines, never instantiates organizations.
 */
export interface LabSearchRouting {
  readonly rationale: string;
  /** The mission whose Lab surface the routing returns to (cross-checked). */
  readonly missionRef: string;
  /** The search result the routing returns to (the original or a re-run). */
  readonly searchResultId: string;
}

/**
 * The §18 abandonment analysis snapshot (abandon is FIRST-CLASS): the
 * auditable justification of the abandoned path — feeds the LAB-017/018
 * learning surfaces BY REFERENCE (the analysisRef), never a deletion.
 */
export interface AbandonmentAnalysisSnapshot {
  readonly summary: string;
  /** The Lab's own analysis record, cited by reference (id @ exact version). */
  readonly analysisRef: { readonly analysisId: string; readonly analysisVersion: number };
  /** The §18 delay-economics figures, when the abandonment is delay-driven. */
  readonly delayEconomics?: {
    readonly expectedIncrementalValue: number;
    readonly estimatedWaitMs: number;
    readonly delayCost: number;
  };
}

/** One §19 decision — the discriminated union over the ten kinds. */
export type StudioEvaluationDecision =
  | { readonly kind: "accept"; readonly summary: string }
  | {
      readonly kind: "reject-quality";
      readonly failedCriteria: readonly string[];
      readonly rationale: string;
    }
  | { readonly kind: "reject-strategy"; readonly rationale: string }
  | { readonly kind: "request-treatment"; readonly treatment: StudioTreatmentDirective }
  | { readonly kind: "require-human-action"; readonly humanAction: HumanActionRouting }
  | { readonly kind: "switch-organization"; readonly routing: LabSearchRouting }
  | { readonly kind: "switch-transform"; readonly routing: LabSearchRouting }
  | { readonly kind: "switch-engine"; readonly routing: LabSearchRouting }
  | {
      readonly kind: "accept-alternate-output";
      readonly alternate: { readonly packageId: string; readonly version: number };
    }
  | {
      readonly kind: "abandon";
      readonly justification: string;
      readonly analysis: AbandonmentAnalysisSnapshot;
    };

// ---------------------------------------------------------------------------
// The evaluation request (the caller frame)
// ---------------------------------------------------------------------------

/**
 * One §19 evaluation request. The evaluated package is cited at EXACT version
 * and must be the cited BRIDGE-001 entry version's own `packageRef` (the
 * citation chain closes entry → package through the REAL authorities).
 */
export interface StudioOutputEvaluationRequest {
  /** Tenant/workspace scope (§31 — the evaluation is tenant-scoped). */
  readonly scope: TenantScope;
  /** §30 actor — the Lab evaluator issuing the verdict. */
  readonly actor: IdentityRef;
  /** The BRIDGE-001 entry chain the evaluated output belongs to. */
  readonly entryId: string;
  /** The entry version cited (default: the chain's latest). */
  readonly entryVersion?: number;
  /** The evaluated studio package, at EXACT version (never "latest"). */
  readonly evaluatedPackage: { readonly packageId: string; readonly version: number };
  /** The §19 decision (kind + payload). */
  readonly decision: StudioEvaluationDecision;
  /** Optional evaluator notes, carried verbatim (§30). */
  readonly notes?: string;
}

// ---------------------------------------------------------------------------
// The treatment linkage (§19: old version → new version, decision = reason)
// ---------------------------------------------------------------------------

/** The reserved directive a treatment-creating decision carries. */
export interface TreatmentLinkageDirective {
  readonly kind: TreatmentLinkedDecisionKind;
  readonly rationale: string;
  /** Present on request-treatment (the §19 treatment directive). */
  readonly treatment?: StudioTreatmentDirective;
  /** Present on switch-* (the Lab search routing citation, BY REFERENCE). */
  readonly routing?: LabSearchRouting;
}

/**
 * The §19 treatment linkage. v1 (`awaiting-successor`) RESERVES the link over
 * the prior package version; the successor citation appends v2 (`linked`)
 * with the successor the studio's own path composed through STUDIO-013 —
 * either the same package chain's next immutable version (a treatment
 * successor) or the re-produced output's package after a switch (caller-cited
 * with attribution). Exactly ONE successor completes a linkage.
 */
export type TreatmentLinkage =
  | {
      readonly phase: "awaiting-successor";
      readonly decisionKind: TreatmentLinkedDecisionKind;
      readonly priorPackageRef: {
        readonly packageId: StudioArtifactPackageId;
        readonly version: number;
      };
      readonly directive: TreatmentLinkageDirective;
      readonly reservedAt: Timestamp;
    }
  | {
      readonly phase: "linked";
      readonly decisionKind: TreatmentLinkedDecisionKind;
      readonly priorPackageRef: {
        readonly packageId: StudioArtifactPackageId;
        readonly version: number;
      };
      readonly directive: TreatmentLinkageDirective;
      readonly reservedAt: Timestamp;
      readonly successorKind: "treatment-successor" | "re-produced-output";
      readonly successorPackageRef: {
        readonly packageId: StudioArtifactPackageId;
        readonly version: number;
        readonly sessionRef: StudioSessionId;
      };
      /** §30 attribution of the successor-citation act. */
      readonly linkedBy: IdentityRef;
      readonly linkedAt: Timestamp;
    };

// ---------------------------------------------------------------------------
// The recorded citations (verbatim from the REAL records — never invented)
// ---------------------------------------------------------------------------

/**
 * The entry/candidate citation chain, carried VERBATIM from the cited BRIDGE-001
 * entry version (status `packaged` — mission + studio segments non-null).
 */
export interface StudioEvaluationEntryCitation {
  readonly entryId: string;
  readonly entryVersion: number;
  readonly candidate: LabToStudioCandidateCitation;
  readonly mission: LabToStudioMissionLinkage;
  readonly studio: LabToStudioStudioEntry;
}

/** The §30 observability trail (cited from resolved REAL records only). */
export interface StudioEvaluationObservability {
  readonly evaluationId: string;
  readonly entryId: string;
  readonly sessionRef: StudioSessionId;
  readonly formatRef: { readonly formatId: string; readonly version: number };
  readonly organizationRef: { readonly id: string; readonly version: number };
  readonly transformChain: readonly {
    readonly definitionId: string;
    readonly definitionVersion: number;
  }[];
  readonly finalArtifactIds: readonly string[];
  readonly cost: { readonly currency: string; readonly amount: string };
  readonly durationSeconds: number;
  readonly sessionLifecycleState: string;
  readonly missionRef: { readonly id: string; readonly version: number };
  readonly evaluatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// The evaluation record (versioned, tenant-scoped, append-only)
// ---------------------------------------------------------------------------

/** The lifecycle status of one evaluation's version chain. */
export type StudioOutputEvaluationStatus = "decided" | "treatment-linked";

/**
 * ONE §19 evaluation record version — immutable, deep-frozen, appended to the
 * tenant's append-only evaluation store. `version` 1 is minted by the decision
 * itself (`decided`); `recordTreatmentSuccessor` appends `version` 2
 * (`treatment-linked`) over a treatment-creating decision with an open
 * linkage. Prior versions stay bit-for-bit immutable.
 */
export interface StudioOutputEvaluationRecord {
  /** Evaluation identity (stable across the version chain). */
  readonly id: string;
  /** The tenant scope the record owns a frozen copy of (§31, W9-B D4). */
  readonly scope: TenantScope;
  /** §30 actor — the Lab evaluator who issued the verdict. */
  readonly actor: IdentityRef;
  readonly createdAt: Timestamp;
  readonly status: StudioOutputEvaluationStatus;
  /** The §19 decision (verbatim payload — the verdict never mutates). */
  readonly decision: StudioEvaluationDecision;
  /** The evaluated package citation (EXACT version, resolved via STUDIO-013). */
  readonly evaluatedPackage: {
    readonly packageId: StudioArtifactPackageId;
    readonly version: number;
    readonly sessionRef: StudioSessionId;
  };
  /** The entry/candidate citation chain (verbatim, at the cited entry version). */
  readonly entryCitation: StudioEvaluationEntryCitation;
  /** The declared-expectations citation (verbatim, counterfactual — rule 29). */
  readonly expectations: LabToStudioDeclaredExpectations;
  /** The reserved/completed §19 treatment linkage (treatment-creating kinds). */
  readonly treatmentLinkage: TreatmentLinkage | null;
  /** The §30 observability trail (cited, never invented). */
  readonly observability: StudioEvaluationObservability;
  /** Evaluator notes, verbatim (null when none). */
  readonly notes: string | null;
  /** The §24 boundary statement (verbatim, every record). */
  readonly boundaryStatement: typeof STUDIO_EVALUATION_BOUNDARY_STATEMENT;
  /** This record's version (1-based, append-only). */
  readonly version: number;
  /** The prior version this one supersedes (null on v1). */
  readonly priorVersion: number | null;
}

// ---------------------------------------------------------------------------
// The typed failure model (result union — the MOS domain convention)
// ---------------------------------------------------------------------------

/**
 * Every §19 evaluation failure is a caller/citation error that appends NO
 * record (the W8-A discipline: nothing attributable happened — no authority
 * denied anything, the caller cited an unresolvable or malformed shape).
 * Kind ↔ stage correlation: `package-unresolved` is the package-resolution
 * stage; `entry-unresolved`/`entry-not-packaged`/`package-citation-mismatch`
 * the entry-citation stage; `expectations-unavailable` the expectations-
 * citation stage; `session-summary-unresolved` the §30 observation stage;
 * the `decision-*`/`routing-*`/`alternate-*` kinds the decision-vocabulary
 * stage; `evaluation-store-rejection` the record stage (defense in depth).
 */
export type StudioOutputEvaluationFailure =
  | { readonly kind: "invalid-evaluation-request"; readonly reason: string }
  | { readonly kind: "package-unresolved"; readonly reason: string }
  | { readonly kind: "entry-unresolved"; readonly reason: string }
  | { readonly kind: "entry-not-packaged"; readonly reason: string }
  | { readonly kind: "package-citation-mismatch"; readonly reason: string }
  | { readonly kind: "expectations-unavailable"; readonly reason: string }
  | { readonly kind: "session-summary-unresolved"; readonly reason: string }
  | { readonly kind: "decision-kind-out-of-vocabulary"; readonly reason: string }
  | { readonly kind: "invalid-decision-payload"; readonly reason: string }
  | { readonly kind: "routing-mission-mismatch"; readonly reason: string }
  | { readonly kind: "alternate-package-unresolved"; readonly reason: string }
  | { readonly kind: "evaluation-store-rejection"; readonly reason: string };

/** Ok/failure pair of the §19 evaluation attempt. */
export type StudioOutputEvaluationOutcome =
  | { readonly ok: true; readonly value: { readonly evaluation: StudioOutputEvaluationRecord } }
  | { readonly ok: false; readonly error: StudioOutputEvaluationFailure };

/** Every failure of the successor-citation act (nothing appended on failure). */
export type TreatmentSuccessorRecordFailure =
  | { readonly kind: "invalid-successor-request"; readonly reason: string }
  | { readonly kind: "evaluation-unresolved"; readonly reason: string }
  | { readonly kind: "linkage-not-open"; readonly reason: string }
  | { readonly kind: "linkage-already-completed"; readonly reason: string }
  | { readonly kind: "successor-package-unresolved"; readonly reason: string }
  | { readonly kind: "successor-not-linked"; readonly reason: string }
  | { readonly kind: "successor-store-rejection"; readonly reason: string };

/** Ok/failure pair of the successor-citation act. */
export type TreatmentSuccessorRecordOutcome =
  | { readonly ok: true; readonly value: { readonly evaluation: StudioOutputEvaluationRecord } }
  | { readonly ok: false; readonly failure: TreatmentSuccessorRecordFailure };

// ---------------------------------------------------------------------------
// Compile-time pins (§19 vocabulary closure / lock rule 29 / §24 statement)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

/** The decision-kind tuple covers the closed union EXACTLY (no drift). */
type ExhaustiveDecisionKinds =
  StudioEvaluationDecisionKind extends (typeof STUDIO_EVALUATION_DECISION_KINDS)[number]
    ? (typeof STUDIO_EVALUATION_DECISION_KINDS)[number] extends StudioEvaluationDecisionKind
      ? true
      : never
    : never;
type _DecisionVocabularyIsExact = Expect<ExhaustiveDecisionKinds>;

/** The treatment-linked kinds are all decision kinds (subset pin). */
type _TreatmentLinkedKindsAreDecisionKinds = Expect<
  TreatmentLinkedDecisionKind extends StudioEvaluationDecisionKind ? true : never
>;

/**
 * RIGHTS/POLICY REJECTION IS NOT AN EVALUATION KIND (§19 distinct classes):
 * the studio-side operator vocabulary's `reject-rights-policy` member is
 * provably OUTSIDE this vocabulary — the union admits no such member (this
 * pin compiles only because no member's kind equals it).
 */
type _RightsRejectionIsOutsideTheVocabulary = Expect<
  Equal<Extract<StudioEvaluationDecisionKind, "reject-rights-policy">, never>
>;

/** The declared-expectations citation stays counterfactual-labeled (rule 29). */
type _ExpectationsCitationIsCounterfactual = Expect<
  Equal<LabToStudioDeclaredExpectations["counterfactual"], true>
>;

/** Every record carries the §24 statement (literal type). */
type _BoundaryStatementIsRequired = Expect<
  Equal<keyof Pick<StudioOutputEvaluationRecord, "boundaryStatement">, "boundaryStatement">
>;
