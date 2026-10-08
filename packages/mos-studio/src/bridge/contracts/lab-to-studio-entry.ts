/**
 * BRIDGE-001 contracts — the Lab → Studio entry record family.
 *
 * The §24 boundary chain's Lab→Mission→Policy/Rights/Assets→Production/Studio
 * segment: a SELECTED LAB-016 production program search candidate (a
 * `RankedCandidateProgram` of a `ProductionProgramSearchResult`, both REAL
 * `@mos/production` shapes — canonical `ProductionRequest`, versioned,
 * provenance'd) becomes a studio-side production entry. The record family is
 * versioned, tenant-scoped, append-only (W9-B D1–D5 by construction in
 * ../bridge-entry-store.ts).
 *
 * The output shape is designed for BRIDGE-002 (Studio Output Evaluation /
 * Treatment, deps BRIDGE-001 + LAB-017): every entry carries the candidate's
 * DECLARED EXPECTATIONS (expected reward + interval + baseline delta + the
 * §2 expected-value-of-delay, all finite-guarded) and the studio
 * session/package refs evaluation will consume.
 *
 * Basis: spec/mos-architecture-v2.0.md §7 (the selected candidate's shape),
 * §19 (evaluation/treatment consume declared expectations), §24 (the boundary
 * chain), §30 (observability fields), §31 (tenant scope); lock rule 29
 * (the lab expectations stay counterfactual-labeled, never evidence).
 */

import type {
  IdentityRef,
  MissionRef,
  PolicyRef,
  ProductionRequestId,
  StudioFormatId,
  TenantScope,
  Version,
} from "@mos/contracts";
import type {
  ProductionProgramSearchResult,
  RankedCandidateProgram,
} from "@mos/production";

import type {
  LabCandidateRef,
  RightsRef,
  StudioArtifactPackageId,
  StudioSessionId,
  Timestamp as StudioTimestamp,
} from "../../contracts/refs.js";
import type { StudioInputKind } from "../../contracts/studio-format.js";

// ---------------------------------------------------------------------------
// The §24 boundary statement (carried on EVERY record, verbatim)
// ---------------------------------------------------------------------------

/**
 * The §24 boundary statement every entry record carries: the bridge's output
 * is a STUDIO-SIDE PRODUCTION ENTRY — Lab/Studio never call social platforms
 * directly, and this surface makes no outbound platform call of any kind.
 */
export const LAB_TO_STUDIO_BOUNDARY_STATEMENT =
  "a studio-side production entry under the §24 boundary chain — Lab/Studio never call social platforms directly" as const;

// ---------------------------------------------------------------------------
// The entry request (the §24 chain's caller frame)
// ---------------------------------------------------------------------------

/** Policy rule citation: exact version, citation order preserved. */
export interface BridgePolicyRuleVersionRef {
  /** Stable rule identity (the canonical `PolicyRef` brand — `PolicyRuleId`'s referent). */
  readonly id: PolicyRef;
  /** The EXACT version to consult (never "latest") — the canonical `Version` brand. */
  readonly version: Version;
}

/**
 * One Lab → Studio entry request. The candidate MUST be one of the search
 * result's OWN entries (`noopBaseline` or a `ranked` member) — a lookalike
 * object is rejected fail-closed (never a raw caller-claimed shape).
 */
export interface LabToStudioEntryRequest {
  /** Tenant/workspace scope (§31 — the entry is tenant-scoped). */
  readonly scope: TenantScope;
  /** §30 actor — the principal entering the candidate into production. */
  readonly actor: IdentityRef;
  /** The LAB-016 search result the selection comes from (REAL shape). */
  readonly searchResult: ProductionProgramSearchResult;
  /** The selected candidate — must be the result's own entry. */
  readonly selected: RankedCandidateProgram;
  /** EXACT mission record version the linkage cites (never "latest"). */
  readonly missionVersion: number;
  /**
   * Policy rules to consult at the production-request-approval gate: exact
   * versions, in citation order (the caller's declared citation set — the
   * bridge never discovers rules on its own).
   */
  readonly policy: readonly BridgePolicyRuleVersionRef[];
  /** The studio format plugin version the production runs under. */
  readonly formatVersion: number;
  /**
   * The operator's declared intake plan. Source-artifact rights state is NOT
   * caller-claimable here: the bridge DERIVES `rightsCleared` from the assets
   * gate verdict (the REAL rights authority), never from this declaration.
   */
  readonly intake: {
    readonly inputKind: StudioInputKind;
    readonly participantCount?: number;
    readonly hasScriptOrQuestionGraph: boolean;
  };
}

// ---------------------------------------------------------------------------
// The recorded chain segments (verbatim citations for §30 audit)
// ---------------------------------------------------------------------------

/** The Mission segment: the versioned linkage the bridge records (§24). */
export interface LabToStudioMissionLinkage {
  readonly missionRef: MissionRef;
  /** The EXACT mission record version cited (requiredExplicitVersionedContracts). */
  readonly missionVersion: number;
  /** The mission's independently versioned reward spec (§21). */
  readonly rewardSpecVersion: number;
  /** The mission's lifecycle status at linkage time (echo). */
  readonly missionStatus: string;
  readonly linkedAt: StudioTimestamp;
}

/** The Policy segment: the gate verdict record (denial attribution verbatim). */
export interface LabToStudioPolicyGateRecord {
  /** The authority's own verdict outcome (echo, verbatim vocabulary). */
  readonly outcome: "allowed" | "denied" | "approval-required" | "insufficient-policy";
  /** The gate decision the bridge consumed (permitted only on `allowed`). */
  readonly decision: "permitted" | "denied";
  /** The authority's denial attribution, VERBATIM (null when permitted). */
  readonly denialReason: string | null;
  /** The canonical policy ref the verdict cites (allowing or denying rule). */
  readonly policyRef: PolicyRef | null;
  /** The authority's §30 evaluation record id (its own audit log entry). */
  readonly evaluationRef: string | null;
  readonly checkedAt: StudioTimestamp;
}

/** One subject verdict of a rights-gate evaluation (reasons verbatim). */
export interface LabToStudioRightsSubjectVerdict {
  readonly subjectRef: string;
  readonly verdict: "granted" | "denied";
  /** The REAL rights authority's denial reason, VERBATIM (null when granted). */
  readonly reason: string | null;
  /** The explicit grant that authorized the subject (null when denied). */
  readonly grantRef: RightsRef | null;
}

/** One frame-reference resolution of the rights gate (declared frame). */
export interface LabToStudioRightsFrameResolution {
  readonly ref: string;
  readonly kind: "rights-grant" | "consent-record";
  readonly status: "active" | "unresolved" | "revoked" | "expired" | "foreign-tenant";
}

/** The Rights segment: the declared rights frame resolution record. */
export interface LabToStudioRightsGateRecord {
  readonly frameResolutions: readonly LabToStudioRightsFrameResolution[];
  readonly frameActive: boolean;
  readonly checkedAt: StudioTimestamp;
}

/** The Assets segment: per-source-artifact coverage record (§27 discipline). */
export interface LabToStudioAssetsGateRecord {
  /** The action the coverage was evaluated under (derived from the chain). */
  readonly action: "use" | "transform";
  readonly verdicts: readonly LabToStudioRightsSubjectVerdict[];
  readonly allCovered: boolean;
  readonly checkedAt: StudioTimestamp;
}

/** The Production/Studio segment: the studio-side entry citation. */
export interface LabToStudioStudioEntry {
  /** The studio session the candidate entered (the runtime's own id). */
  readonly sessionRef: StudioSessionId;
  /** The supplier citation the studio session records (lab entry mode). */
  readonly labCandidateRef: LabCandidateRef;
  /** The organization binding, at the EXACT cited version (STUDIO-007). */
  readonly organizationRef: { readonly id: string; readonly version: number };
  /** The format plugin the session runs under (id + version). */
  readonly formatRef: { readonly formatId: string; readonly version: number };
  /** The session's lifecycle state at entry (the runtime's own echo). */
  readonly lifecycleState: string;
  readonly enteredAt: StudioTimestamp;
}

// ---------------------------------------------------------------------------
// The declared expectations (BRIDGE-002's consumption surface)
// ---------------------------------------------------------------------------

/**
 * The candidate's DECLARED EXPECTATIONS carried on the entry — what
 * BRIDGE-002 (Studio Output Evaluation / Treatment) consumes when the studio
 * output exists. Every number is finite-guarded at intake (W9-B D5); the
 * lab-side labeling survives verbatim (lock rule 29 — counterfactual, never
 * evidence).
 */
export interface LabToStudioDeclaredExpectations {
  /** The candidate evaluation's expected reward (finite). */
  readonly expectedReward: number;
  /** The §22 prediction interval (finite, lower ≤ upper). */
  readonly interval: { readonly lower: number; readonly upper: number };
  /** The always-present no-op baseline's expected reward (finite). */
  readonly baselineExpectedReward: number;
  /** This candidate's delta vs the baseline (finite). */
  readonly expectedRewardDelta: number;
  /** The §2 first-class expected value of delay (finite). */
  readonly expectedValueOfDelay: number;
  /** The evaluation's own disclosure string, VERBATIM. */
  readonly disclosure: string;
  /** LOCK RULE 29 PIN: a declared lab estimate, never evidence. */
  readonly counterfactual: true;
}

// ---------------------------------------------------------------------------
// The candidate citation (what the entry pins about the selected candidate)
// ---------------------------------------------------------------------------

/** The versioned citation of the selected candidate the entry records. */
export interface LabToStudioCandidateCitation {
  /** The search result the candidate was selected from (§30 request id). */
  readonly searchResultId: string;
  /** The candidate's rank in that result (1-based). */
  readonly rank: number;
  /** The canonical composed request citation (id + EXACT version). */
  readonly requestRef: { readonly id: ProductionRequestId; readonly version: number };
  /** Where the candidate came from (the search's own origin vocabulary). */
  readonly candidateOrigin: string;
  /** False by construction (the no-op baseline cannot enter the studio). */
  readonly isNoopBaseline: false;
  /** The transform chain citation (definition ids @ exact versions). */
  readonly transformChain: readonly {
    readonly definitionId: string;
    readonly definitionVersion: number;
  }[];
  /**
   * The producing organization citation (id @ exact version) — non-null by
   * construction: a studio-enterable candidate must carry one (the no-op
   * baseline, whose organization is null, is rejected at intake).
   */
  readonly organizationCitation: {
    readonly organizationId: string;
    readonly organizationVersion: number;
  };
  /** The provenance version pins the search itself recorded. */
  readonly provenance: {
    readonly policyVersion: number;
    readonly seed: number;
    readonly generationIndex: number | null;
    readonly variedDimensions: readonly string[];
  };
  /** The canonical rights frame the request runs under (cited verbatim). */
  readonly rightsContext: {
    readonly rightsRefs: readonly string[];
    readonly consentRefs: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// The entry record (versioned, tenant-scoped, append-only)
// ---------------------------------------------------------------------------

/** The lifecycle status of one entry's version chain. */
export type LabToStudioEntryStatus =
  | "entered"
  | "denied"
  | "studio-entry-failed"
  | "packaged";

/** Where in the §24 chain a denial/studio failure happened. */
export type LabToStudioFailureStage =
  | "policy-gate"
  | "rights-gate"
  | "assets-gate"
  | "studio-entry";

/** The denial/failure citation carried on non-entered records. */
export interface LabToStudioDenialCitation {
  readonly stage: LabToStudioFailureStage;
  /** The authority's denial attribution, VERBATIM. */
  readonly reason: string;
}

/**
 * ONE Lab → Studio production entry version — immutable, deep-frozen,
 * appended to the tenant's append-only entry store. `version` 1 is minted by
 * the entry attempt itself; `recordStudioPackage` appends `version` 2
 * (`packaged`) over an `entered` v1. Prior versions stay bit-for-bit
 * immutable.
 */
export interface LabToStudioProductionEntry {
  /** Entry identity (stable across the version chain). */
  readonly id: string;
  /** The tenant scope the record owns a frozen copy of (§31, W9-B D4). */
  readonly scope: TenantScope;
  /** §30 actor. */
  readonly actor: IdentityRef;
  readonly createdAt: StudioTimestamp;
  readonly status: LabToStudioEntryStatus;
  /** Present on `denied`/`studio-entry-failed` records (verbatim reasons). */
  readonly denial: LabToStudioDenialCitation | null;
  /** The selected-candidate citation (see above). */
  readonly candidate: LabToStudioCandidateCitation;
  /** The Mission segment (present once the linkage resolved). */
  readonly mission: LabToStudioMissionLinkage | null;
  /** The Policy segment (present once the gate ran). */
  readonly policyGate: LabToStudioPolicyGateRecord | null;
  /** The Rights + Assets segments (present once the gates ran). */
  readonly rightsGate: LabToStudioRightsGateRecord | null;
  readonly assetsGate: LabToStudioAssetsGateRecord | null;
  /** The Production/Studio segment (present on entered/entry-failed). */
  readonly studio: LabToStudioStudioEntry | null;
  /** BRIDGE-002's consumption surface (present once validation passed). */
  readonly expectations: LabToStudioDeclaredExpectations | null;
  /** The studio-produced package citation (v2 `packaged` records only). */
  readonly packageRef: { readonly packageId: StudioArtifactPackageId; readonly version: number } | null;
  /** The §24 boundary statement (verbatim, every record). */
  readonly boundaryStatement: typeof LAB_TO_STUDIO_BOUNDARY_STATEMENT;
  /** This record's version (1-based, append-only). */
  readonly version: number;
  /** The prior version this one supersedes (null on v1). */
  readonly priorVersion: number | null;
}

// ---------------------------------------------------------------------------
// The typed failure model (result union — the MOS domain convention)
// ---------------------------------------------------------------------------

/**
 * Caller-shape failures append NO record (the W8-A discipline: nothing
 * attributable happened). Gate/studio failures ARE recorded — the attempt is
 * attributable — and the failure value echoes the same verbatim reason the
 * record carries.
 */
export type LabToStudioEntryFailure =
  // — request/candidate shape validation (nothing recorded) —
  | { readonly kind: "invalid-entry-request"; readonly reason: string }
  | { readonly kind: "malformed-candidate"; readonly reason: string }
  | { readonly kind: "unversioned-candidate"; readonly reason: string }
  | { readonly kind: "unprovenanced-candidate"; readonly reason: string }
  | { readonly kind: "candidate-not-in-result"; readonly reason: string }
  | { readonly kind: "no-op-baseline-not-studio-enterable"; readonly reason: string }
  | { readonly kind: "candidate-modality-not-studio"; readonly reason: string }
  | { readonly kind: "tenant-mismatch"; readonly reason: string }
  | { readonly kind: "format-mismatch"; readonly reason: string }
  | { readonly kind: "organization-citation-mismatch"; readonly reason: string }
  | { readonly kind: "invalid-declared-expectations"; readonly reason: string }
  // — mission linkage (citation resolution; nothing recorded) —
  | { readonly kind: "mission-unresolved"; readonly reason: string }
  | { readonly kind: "mission-not-active"; readonly reason: string }
  // — recorded gate/studio failures (§30 record appended) —
  | {
      readonly kind: "policy-gate-denied";
      readonly stage: "policy-gate";
      readonly reason: string;
      readonly entry: LabToStudioProductionEntry;
    }
  | {
      readonly kind: "rights-gate-denied";
      readonly stage: "rights-gate";
      readonly reason: string;
      readonly entry: LabToStudioProductionEntry;
    }
  | {
      readonly kind: "assets-gate-denied";
      readonly stage: "assets-gate";
      readonly reason: string;
      readonly entry: LabToStudioProductionEntry;
    }
  | {
      readonly kind: "studio-entry-failed";
      readonly stage: "studio-entry";
      readonly reason: string;
      readonly entry: LabToStudioProductionEntry;
    };

/** Ok/failure pair of the entry attempt. */
export type LabToStudioEntryOutcome =
  | {
      readonly ok: true;
      readonly value: {
        readonly entry: LabToStudioProductionEntry;
        /** The studio session view (the runtime's own projection). */
        readonly session: unknown;
      };
    }
  | { readonly ok: false; readonly error: LabToStudioEntryFailure };

// ---------------------------------------------------------------------------
// Compile-time pins (§24 / lock rule 29)
// ---------------------------------------------------------------------------

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** Declared expectations are always counterfactual-labeled (lock rule 29). */
type _ExpectationsAreAlwaysCounterfactual = Expect<
  Equal<LabToStudioDeclaredExpectations["counterfactual"], true>
>;

/** Every record carries the §24 statement (literal type). */
type _BoundaryStatementIsRequired = Expect<
  Equal<keyof Pick<LabToStudioProductionEntry, "boundaryStatement">, "boundaryStatement">
>;

/** Re-exports used by the port/core files (one import site per type). */
export type { ProductionProgramSearchResult, RankedCandidateProgram };
export type { StudioFormatId };
