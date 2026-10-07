/**
 * Studio session contracts — the unit of interactive AI+Human production.
 *
 * STUDIO-001 interface spike — TYPES ONLY (no runtime implementation).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   StudioSession.required = [id, version, productionRequestRef,
 *     formatVersion, organizationRef, participants, lifecycle,
 *     artifactPackageRef]
 *   ProductionRequest.required (studio consumes) = [id, version, scope,
 *     objective, sourceArtifacts, strategyRef, transformGraphRef,
 *     organizationRef, studioFormat, capabilityRequirements, humanTasks,
 *     acceptanceCriteria, budget, deadline, delayPolicy, rightsContext,
 *     returnContract]
 *
 * Basis: spec/mos-architecture-v2.0.md §13 (two entry modes — standalone user
 * creation and Lab-invoked production; standalone flow: intent/script →
 * format → production graph → capture → processing → review → artifact
 * package), §15 (multi-account sessions: each participant retains identity,
 * account boundary, authorization, participation grant, consent and
 * contribution provenance; credentials are NEVER merged), §6 (versioned
 * lineage-preserving aggregates), §30 (observability), §31 (tenant scope).
 *
 * Backlog: STUDIO-001 (runtime), STUDIO-006 (multi-account sessions)
 * implement against these types.
 */

import type {
  AcceptanceCriteriaRef,
  AccountRef,
  ArtifactId,
  ConsentRef,
  ContractVersion,
  DelayPolicyRef,
  DeviceRef,
  HumanProductionTaskRef,
  IdentityRef,
  MoneyAmount,
  ParticipationGrantId,
  ProductionRequestId,
  RightsRef,
  SessionParticipantId,
  SessionParticipantRole,
  StudioArtifactPackageId,
  StudioSessionId,
  StrategyRef,
  Timestamp,
  TransformGraphRef,
  ReturnContractRef,
  CapabilityId,
} from "./refs.js";
import type { StudioFormatVersion } from "./studio-format.js";
import type { StudioOrganizationRef } from "./organization-loading.js";

/**
 * Versioned reference to the artifact package produced by a session.
 * `version` pins the exact immutable package version handed to the caller.
 */
export interface ArtifactPackageRef {
  readonly packageId: StudioArtifactPackageId;
  readonly version: ContractVersion;
}

/**
 * The Studio session — one run of the single Studio runtime for one format,
 * one loaded organization version and one set of participants.
 *
 * Field-for-field match of core-contracts-v2.0.yaml StudioSession required
 * fields. Two entry modes (§13) both produce a session:
 * - standalone: the user's intent/script is materialized as a local
 *   ProductionRequest (owned by the `production` module) which
 *   `productionRequestRef` then points at;
 * - Lab-invoked: the Lab's production candidate supplies the request.
 */
export interface StudioSession {
  readonly id: StudioSessionId;
  readonly version: ContractVersion;
  readonly productionRequestRef: ProductionRequestId;
  readonly formatVersion: StudioFormatVersion;
  readonly organizationRef: StudioOrganizationRef;
  readonly participants: readonly SessionParticipant[];
  readonly lifecycle: StudioSessionLifecycle;
  /**
   * Reference to the produced artifact package. `null` until the lifecycle
   * reaches `packaged`; afterwards it pins the exact immutable package
   * version (treatments create NEW package versions — see treatment.ts).
   */
  readonly artifactPackageRef: ArtifactPackageRef | null;
  readonly createdAt: Timestamp;
}

/**
 * Account boundary of one participant (§15). A session may span multiple
 * authorized MOS accounts/devices; each participant's boundary stays
 * separate for the whole session — credentials are never merged.
 */
export interface ParticipantAccountBoundary {
  readonly accountId: AccountRef;
  readonly deviceRef?: DeviceRef;
}

/** What a participant is authorized to do inside the session. */
export interface ParticipantAuthorization {
  /** Actions granted, e.g. capture, review, treatment-request. */
  readonly grantedActions: readonly string[];
  /** Grants are scoped to this session only and expire with it. */
  readonly scopedToSession: StudioSessionId;
}

/** The grant that admitted the participant into the session. */
export interface ParticipationGrant {
  readonly grantId: ParticipationGrantId;
  readonly grantedBy: IdentityRef;
  readonly grantedAt: Timestamp;
  readonly expiresAt?: Timestamp;
}

/** Participant consent for capture and processing of their contribution (§27). */
export interface ParticipantConsent {
  readonly consentRefs: readonly ConsentRef[];
  readonly coversCapture: boolean;
  readonly coversProcessingIntoArtifacts: boolean;
}

/** Attribution of one participant's contributions (§15 contribution provenance). */
export interface ParticipantContributionProvenance {
  /** Provenance records tying this participant's raw captures to their identity. */
  readonly provenanceRefs: readonly string[];
}

/**
 * One participant of a Studio session. Per §15 every participant RETAINS:
 * identity, account boundary, authorization, participation grant, consent
 * and contribution provenance — each as a separate, explicit field. No
 * participant is ever flattened into a shared credential or anonymous pool.
 */
export interface SessionParticipant {
  readonly participantId: SessionParticipantId;
  readonly identityRef: IdentityRef;
  readonly accountBoundary: ParticipantAccountBoundary;
  readonly authorization: ParticipantAuthorization;
  readonly participationGrant: ParticipationGrant;
  readonly consent: ParticipantConsent;
  readonly contributionProvenance: ParticipantContributionProvenance;
  readonly roles: readonly SessionParticipantRole[];
}

/**
 * Session lifecycle state machine (§13 standalone flow: → capture →
 * processing → review → packaged; Lab mode adds Lab evaluation after
 * packaging).
 *
 * Legal forward transitions:
 * - requested → loading | abandoned | failed
 * - loading → capturing | abandoned | failed
 * - capturing → processing | abandoned | failed
 * - processing → review | capturing (re-capture/treatment) | abandoned | failed
 * - review → processing (treatment requested) | packaged | abandoned | failed
 * - packaged → closed
 * - closed / abandoned / failed are TERMINAL (append-only history retained)
 */
export type StudioSessionLifecycleState =
  | "requested"
  | "loading"
  | "capturing"
  | "processing"
  | "review"
  | "packaged"
  | "closed"
  | "abandoned"
  | "failed";

/** One recorded lifecycle transition (append-only — history is never rewritten). */
export interface StudioSessionLifecycleTransition {
  readonly from: StudioSessionLifecycleState;
  readonly to: StudioSessionLifecycleState;
  readonly at: Timestamp;
  /** Why the transition happened (treatment request, Lab decision, failure...). */
  readonly reason?: string;
  /** Who/what caused it, when attributable (participant, Lab, system). */
  readonly actor?: string;
}

/** Lifecycle of a session: current state plus append-only transition history. */
export interface StudioSessionLifecycle {
  readonly state: StudioSessionLifecycleState;
  readonly transitions: readonly StudioSessionLifecycleTransition[];
}

/**
 * Studio-side READ-ONLY consumption view of the ProductionRequest contract
 * (owned by the `production` module). Field-for-field match of
 * core-contracts-v2.0.yaml ProductionRequest required fields so the Studio
 * can validate what it is asked to produce WITHOUT becoming a production
 * authority. Wave 1 replaces this mirror with the canonical import from
 * `@mos/contracts` when that package lands; it is not a second authority.
 */
export interface StudioProductionRequestView {
  readonly id: ProductionRequestId;
  readonly version: ContractVersion;
  readonly scope: string;
  readonly objective: string;
  readonly sourceArtifacts: readonly ArtifactId[];
  readonly strategyRef: StrategyRef;
  readonly transformGraphRef: TransformGraphRef;
  readonly organizationRef: StudioOrganizationRef;
  readonly studioFormat: StudioFormatVersion;
  readonly capabilityRequirements: readonly CapabilityId[];
  readonly humanTasks: readonly HumanProductionTaskRef[];
  readonly acceptanceCriteria: AcceptanceCriteriaRef;
  readonly budget: StudioProductionBudget;
  /** Null when no deadline is set — the delay policy governs waiting (§18). */
  readonly deadline: Timestamp | null;
  readonly delayPolicy: DelayPolicyRef;
  readonly rightsContext: RightsRef;
  readonly returnContract: ReturnContractRef;
}

/** Budget of a production request as seen by the Studio. */
export interface StudioProductionBudget {
  readonly limit: MoneyAmount;
}
