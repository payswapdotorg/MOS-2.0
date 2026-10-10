/**
 * BRIDGE-003 contracts — the real-experiment record family.
 *
 * ONE real experiment = the §24 chain's final assembly as ONE immutable,
 * versioned, tenant-scoped, append-only record chain (W9-B D1–D5 by
 * construction in store/experiment-store.ts). Version 1 (`created`) is
 * minted by the binding act itself and carries EVERY resolved chain
 * segment; lifecycle successors append versions; prior versions stay
 * bit-for-bit immutable.
 *
 * The frozen RealExperimentBinding CONTRACT PROJECTION
 * (spec/contracts/core-contracts-v2.0.yaml — required [id, labCandidateRef,
 * missionRef, productionRequestRef, policyRef, rightsRef, distributionRef,
 * experimentRef, evidenceRef]) is `canonicalRealExperimentBinding` below:
 * a pure projection over the record with ALL nine required fields, each
 * ref resolving to an EXACT version of the underlying authority record
 * (the version pins ride the segment records; the refs are the canonical
 * citations). The projection never fabricates: it reads the segments the
 * chain resolved.
 *
 * Basis: §24 (the boundary chain), §30 (observability fields on every
 * attributable action), §31 (tenant scope), lock rules 14/29.
 */

import type {
  DistributionRef,
  EvidenceRef,
  ExperimentRef,
  IdentityRef,
  LabCandidateRef,
  MissionRef,
  PolicyRef,
  RightsRef,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";
import type { ArtifactRef } from "@mos/contracts";
import type { ProductionRequestId } from "@mos/contracts";

import type {
  ExperimentJobCitation,
  ExperimentLifecycleStatus,
  ExperimentMeasurementContext,
  REAL_EXPERIMENT_BOUNDARY_STATEMENT,
} from "./experiment-boundary.js";
import type {
  ExperimentMissionLinkage,
  ExperimentPolicyVerdict,
  ExperimentRightsFrameResolution,
} from "./authority-seams.js";
import type {
  LabCandidateCitation,
  LabCandidateExpectations,
} from "./lab-candidate-seam.js";
import type { ExperimentId } from "./ids.js";

// ---------------------------------------------------------------------------
// The recorded chain segments (verbatim citations for §30 audit)
// ---------------------------------------------------------------------------

/** The Lab segment: the cited candidate + its counterfactual expectations. */
export interface ExperimentLabCandidateSegment {
  readonly citation: LabCandidateCitation;
  /** The frozen counterfactual expectations, cited VERBATIM (rule 29). */
  readonly expectations: LabCandidateExpectations;
  /** The lab's own disclosure string, VERBATIM. */
  readonly disclosure: string;
  readonly benchmarkedAt: string;
  readonly citedAt: Timestamp;
}

/** The Policy segment: the gate verdict record (denial attribution verbatim). */
export interface ExperimentPolicyGateSegment {
  /** The authority's own verdict outcome (echo, verbatim vocabulary). */
  readonly outcome: ExperimentPolicyVerdict["outcome"];
  /** The gate decision the binding consumed (permitted only on `allowed`). */
  readonly decision: "permitted" | "denied";
  /** The authority's denial attribution, VERBATIM (null when permitted). */
  readonly denialReason: string | null;
  /** The canonical policy ref the verdict cites (allowing or denying rule). */
  readonly policyRef: PolicyRef | null;
  /** The authority's §30 evaluation record id (its own audit log entry). */
  readonly evaluationRef: string | null;
  readonly checkedAt: Timestamp;
}

/** The Rights segment: the declared frame resolution record. */
export interface ExperimentRightsGateSegment {
  readonly frameResolutions: readonly ExperimentRightsFrameResolution[];
  readonly frameActive: boolean;
  readonly checkedAt: Timestamp;
}

/** The Production segment: the canonical request citation (REAL shape). */
export interface ExperimentProductionSegment {
  /** The composed canonical CORE-001 ProductionRequest citation (id @ EXACT version). */
  readonly requestRef: { readonly id: ProductionRequestId; readonly version: number };
  /** The search result the selected candidate came from (§30 request id). */
  readonly searchResultId: string;
  /** The candidate's 1-based rank in that result. */
  readonly rank: number;
  /** The transform chain citation (definition ids @ exact versions). */
  readonly transformChain: readonly {
    readonly definitionId: string;
    readonly definitionVersion: number;
  }[];
}

/** The Distribution segment: the platform-confirmed publication citation. */
export interface ExperimentDistributionSegment {
  /** The REAL publication record id (the platform's confirmed output). */
  readonly publicationId: string;
  /** The channel the publication went through (REAL echo). */
  readonly channelRef: string;
  /** The platform identity (REAL echo — the measurement platform). */
  readonly providerId: string;
  /** The distributed artifact, VERBATIM from the REAL publication record. */
  readonly artifact: ArtifactRef;
  /** The platform's own post reference — WHAT THE PLATFORM RETURNED. */
  readonly postRef: string;
  /** When the platform says the post was published (platform-said). */
  readonly publishedAt: Timestamp;
  /** When MOS recorded the publication (the distribution authority's stamp). */
  readonly recordedAt: Timestamp;
  /** Honest transport source label (who reported the publication). */
  readonly source: string;
  readonly citedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// The analysis + closure segments (later versions)
// ---------------------------------------------------------------------------

/** The analysis citation carried on `analysed` and later versions. */
export interface ExperimentAnalysisCitation {
  /** The outcome chain id (≡ the experiment id, 1:1 by construction). */
  readonly outcomeId: ExperimentId;
  /** The EXACT outcome record version cited. */
  readonly outcomeVersion: number;
  /** The EXACT evidence record version the analysis folded. */
  readonly evidenceVersion: number;
  readonly analysedAt: Timestamp;
}

/** The §18 abandonment snapshot (abandon is FIRST-CLASS, auditable). */
export interface ExperimentAbandonmentSnapshot {
  /** Why the experiment was abandoned (mandatory, verbatim). */
  readonly reason: string;
  /** The abandonment justification summary (mandatory). */
  readonly summary: string;
  /** The latest evidence record citation at abandonment (may be the declared window). */
  readonly evidenceRef: { readonly evidenceId: ExperimentId; readonly version: number } | null;
  /** The durable job's own status echo at abandonment (the §30 trail). */
  readonly jobEcho: { readonly status: string; readonly attemptCount: number } | null;
  readonly abandonedAt: Timestamp;
}

/** The closure segment on terminal versions. */
export interface ExperimentClosureSegment {
  readonly kind: "closed" | "abandoned";
  /** §30 actor of the closure act. */
  readonly closedBy: IdentityRef;
  /** The closure summary (closed) or the abandonment snapshot (abandoned). */
  readonly summary: string | null;
  readonly abandonment: ExperimentAbandonmentSnapshot | null;
  readonly closedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// The experiment record (versioned, tenant-scoped, append-only)
// ---------------------------------------------------------------------------

/**
 * ONE real experiment record version — immutable, deep-frozen, appended to
 * the tenant's append-only experiment store. `version` 1 is minted by the
 * binding act (`created`, every segment present); lifecycle successors
 * append versions (`running`, `measured`, `analysed`, `closed`,
 * `abandoned`). Prior versions stay bit-for-bit immutable and resolvable.
 */
export interface RealExperimentRecord {
  /** Experiment identity (stable across the version chain; the binding/evidence/outcome chain key). */
  readonly id: ExperimentId;
  /** The tenant scope the record owns a frozen copy of (§31, W9-B D4). */
  readonly scope: TenantScope;
  /** §30 actor — the principal who bound the candidate. */
  readonly actor: IdentityRef;
  readonly createdAt: Timestamp;
  readonly status: ExperimentLifecycleStatus;
  /** The Lab segment (the cited candidate + counterfactual expectations). */
  readonly labCandidate: ExperimentLabCandidateSegment;
  /** The Mission segment (versioned linkage). */
  readonly mission: ExperimentMissionLinkage;
  /** The Policy segment (the permit verdict; denial paths never mint a record). */
  readonly policyGate: ExperimentPolicyGateSegment;
  /** The Rights segment (the active frame). */
  readonly rightsGate: ExperimentRightsGateSegment;
  /** The Production segment (the canonical request citation). */
  readonly production: ExperimentProductionSegment;
  /** The Distribution segment (the platform-confirmed publication). */
  readonly distribution: ExperimentDistributionSegment;
  /** The declared measurement context + the platform post subject measured. */
  readonly measurement: ExperimentMeasurementContext & { readonly subjectRef: string };
  /** The evidence chain citation (the declared window at v1; the folded observations later). */
  readonly evidenceRef: { readonly evidenceId: ExperimentId; readonly version: number };
  /** The durable job citation (the §26 measurement segment). */
  readonly job: ExperimentJobCitation | null;
  /** The analysis citation (present on `analysed` and later versions). */
  readonly analysis: ExperimentAnalysisCitation | null;
  /** The closure segment (terminal versions only). */
  readonly closure: ExperimentClosureSegment | null;
  /** The §24 boundary statement (verbatim, every record). */
  readonly boundaryStatement: typeof REAL_EXPERIMENT_BOUNDARY_STATEMENT;
  /** This record's version (1-based, append-only). */
  readonly version: number;
  /** The prior version this one supersedes (null on v1). */
  readonly priorVersion: number | null;
  /** Deterministic digest of the frozen record payload (bit-for-bit immutability). */
  readonly experimentDigest: string;
}

// ---------------------------------------------------------------------------
// The binding-attempt audit record (attributable gate denials)
// ---------------------------------------------------------------------------

/** Where in the binding chain an attributable denial happened. */
export type RealExperimentBindingFailureStage = "policy-gate" | "rights-gate";

/**
 * ONE binding-attempt audit record — the §30-attributable record an
 * attributable gate denial appends (EXACTLY ONE; the authority's denial
 * attribution rides VERBATIM). An audit record is NOT an experiment: zero
 * experiment state was created. Single-version immutable record.
 */
export interface RealExperimentBindingAuditRecord {
  readonly id: string;
  /** The tenant scope the record owns a frozen copy of (§31). */
  readonly scope: TenantScope;
  /** §30 actor — the principal whose binding attempt was denied. */
  readonly actor: IdentityRef;
  readonly createdAt: Timestamp;
  readonly stage: RealExperimentBindingFailureStage;
  /** The authority's denial attribution, VERBATIM. */
  readonly denial: string;
  /** The citation state at denial time (what was attempted, verbatim). */
  readonly attempted: {
    readonly labCandidate: LabCandidateCitation;
    readonly missionRef: MissionRef;
    readonly missionVersion: number;
    readonly policyCitations: readonly { readonly id: PolicyRef; readonly version: Version }[];
    readonly rightsRefs: readonly RightsRef[];
    readonly consentRefs: readonly string[];
  };
  /** The §24 boundary statement (verbatim, every record). */
  readonly boundaryStatement: typeof REAL_EXPERIMENT_BOUNDARY_STATEMENT;
}

// ---------------------------------------------------------------------------
// The frozen RealExperimentBinding contract projection (CORE-001)
// ---------------------------------------------------------------------------

/**
 * The frozen `RealExperimentBinding` contract projection (required fields
 * EXACTLY: id, labCandidateRef, missionRef, productionRequestRef, policyRef,
 * rightsRef, distributionRef, experimentRef, evidenceRef). Each ref resolves
 * to an EXACT version of the underlying authority record: the version pins
 * ride the source record's segments (mission segment `missionVersion`,
 * production segment `requestRef.version`, distribution segment
 * `publicationId`'s immutable record, evidence citation `version`,
 * `recordVersion` below); the opaque-string refs carry the version in their
 * canonical encoding where the brand cannot (labCandidateRef,
 * distributionRef). Documented derivations:
 * - `labCandidateRef` = `benchmark:<id>:v<version>:<key>` (the LAB-018
 *   labRunRef-encoding precedent);
 * - `missionRef` = the mission record id (ref-equals-record-id — resolves
 *   through `MissionRepository.getMission(id, missionVersion)`);
 * - `productionRequestRef` = the canonical ProductionRequest id @ version;
 * - `policyRef` = the rule the permit verdict cited;
 * - `rightsRef` = the declared frame's PRIMARY grant (the first declared
 *   rightsRef — verified active with the whole frame; every member's
 *   resolution rides the rights segment);
 * - `distributionRef` = `social-publication:<publicationId>` (the
 *   platform-confirmed publication is append-only-immutable: its identity
 *   IS its exact version);
 * - `experimentRef`/`evidenceRef` = this authority's own chain refs.
 */
export interface RealExperimentBinding {
  readonly id: string;
  readonly labCandidateRef: LabCandidateRef;
  readonly missionRef: MissionRef;
  readonly productionRequestRef: { readonly id: ProductionRequestId; readonly version: Version };
  readonly policyRef: PolicyRef;
  readonly rightsRef: RightsRef;
  readonly distributionRef: DistributionRef;
  readonly experimentRef: ExperimentRef;
  readonly evidenceRef: EvidenceRef;
  /** The EXACT experiment record version this projection was taken over. */
  readonly recordVersion: Version;
  /** The EXACT evidence record version cited. */
  readonly evidenceVersion: Version;
  /** The EXACT mission record version cited. */
  readonly missionVersion: Version;
}

/**
 * Project one experiment record version onto the frozen CORE-001
 * `RealExperimentBinding` contract (pure function — reads the segments the
 * chain resolved, never fabricates). The projection is recomputable from
 * the stored record at any version.
 */
export const canonicalRealExperimentBinding = (
  record: RealExperimentRecord,
): RealExperimentBinding => {
  const benchmark = record.labCandidate.citation;
  const primaryGrant = record.rightsGate.frameResolutions[0];
  if (primaryGrant === undefined) {
    // Fail loud — a bound experiment always carries a resolved frame (the
    // binding path guarantees at least one declared rights ref, verified
    // active). An absent frame here is store corruption, never defaulted.
    throw new Error(
      "canonical real-experiment binding: the record carries no resolved rights frame — the record shape is corrupt (store-corruption territory, never silently defaulted)",
    );
  }
  return {
    id: record.id as string,
    labCandidateRef: `benchmark:${benchmark.benchmarkId}:v${String(benchmark.benchmarkVersion)}:${benchmark.candidateKey}` as LabCandidateRef,
    missionRef: record.mission.missionRef as MissionRef,
    productionRequestRef: {
      id: record.production.requestRef.id,
      version: record.production.requestRef.version as Version,
    },
    policyRef: record.policyGate.policyRef as PolicyRef,
    rightsRef: primaryGrant.ref as RightsRef,
    distributionRef: `social-publication:${record.distribution.publicationId}` as DistributionRef,
    experimentRef: record.id as unknown as ExperimentRef,
    evidenceRef: record.evidenceRef.evidenceId as unknown as EvidenceRef,
    recordVersion: record.version as Version,
    evidenceVersion: record.evidenceRef.version as Version,
    missionVersion: record.mission.missionVersion as Version,
  };
};
