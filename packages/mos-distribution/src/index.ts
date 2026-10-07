/**
 * Public surface of `@mos/distribution` (MOS v2.0 SOCIAL-001 + the
 * SOCIAL-002..006 provider-profile extension + the HEALTH-001
 * platform-health observation surface).
 *
 * The social-distribution authority: the provider-neutral social adapter
 * contract (SocialAdapterPort — publish/schedule/read-observations/
 * delete/list-restrictions over content artifact refs), the versioned
 * tenant-scoped SocialChannel registry with its per-operation capability
 * matrix (parity is never assumed), the rights-gate and DECLARED
 * policy-gate seams that precede every provider call, the transport seam
 * (disclosed in-memory double), typed errors, and the platform-said
 * output records (publications, schedules, retractions, observations,
 * restrictions, rate-limit postures — §30-observable, tenant-scoped,
 * source-attributed).
 *
 * W7-C adds the PROVIDER-NEUTRAL profile/rate-limit contracts the five
 * per-provider adapter subtrees (src/adapters/providers/* — subpath
 * exports `@mos/distribution/providers/<provider>`) declare their
 * platform DATA against: SocialProviderProfile (capability matrix + auth
 * model KIND + coarse publicly-known operation shapes + evidence basis),
 * the closed vocabularies it selects from, and the transport-observed
 * rate-limit posture records.
 *
 * W8-C adds the HEALTH-001 platform-health observation surface:
 * OBSERVABLE-ONLY health records where a provider-CONFIRMED restriction
 * (from the W6-C list-restrictions surface) is TYPED apart from a
 * SUSPECTED distribution anomaly (a DERIVED record citing one of the
 * DECLARED, DOCUMENTED derivation rules — never invented), queryable per
 * provider/channel/tenant. The surface carries NO maneuver authority
 * (§3): compliant maneuvers are decided by the owning authorities.
 *
 * AUTHORITY DISCIPLINE (test-pinned): this surface is PROVIDER-NEUTRAL.
 * No provider name and no provider-specific type appears in any exported
 * contract, port, error or adapter — provider specifics live exclusively
 * in the DATA profiles of the isolated adapter subtrees and in the DATA
 * records tenants register at runtime. Test fixtures (fictional
 * providers) are deliberately NOT exported from this index: provider
 * data never becomes package surface.
 *
 * Export budget: 14 runtime functions (the 5 in-memory social factories +
 * the canonical capability-matrix projection helper + the two documented
 * rights-subject derivations + the documented artifact-type-family
 * derivation + the HEALTH-001 in-memory health-surface factory + the two
 * declared health-derivation functions + the observations-provider
 * helper + the canonical platform-health projection) + 10 frozen
 * constants (the 7 closed social vocabularies + the transport-source
 * label + the 2 HEALTH-001 vocabularies) + 1 error class — pinned by
 * test; the 12-public-method policy budget applies PER PORT.
 */

// ---- Contracts: identifiers and handles ----
export type {
  HealthObservationId,
  PlatformPostRef,
  SocialChannelId,
  SocialDistributionId,
  SocialObservationId,
  SocialPublicationId,
  SocialRateLimitObservationId,
  SocialRetractionId,
  SocialRestrictionId,
  SocialScheduleId,
} from "./contracts/ids.js";

// ---- Contracts: the social surface (operations, presentation, matrix) ----
export type {
  DeclaredSocialPresentation,
  DeleteSocialPostInput,
  ListSocialRestrictionsInput,
  PublishSocialPostInput,
  ReadSocialObservationsInput,
  ScheduleSocialPostInput,
  SocialOperation,
  SocialOperationRequest,
  SocialPresentationKind,
  SocialProviderCapability,
} from "./contracts/social-operation.js";
export {
  SOCIAL_OPERATIONS,
  SOCIAL_OPERATION_RIGHTS_ACTIONS,
  SOCIAL_PRESENTATION_KINDS,
  socialArtifactSubject,
  socialChannelSubject,
} from "./contracts/social-operation.js";

// ---- Contracts: the channel record (typed SocialAdapter projection) ----
export type { RegisterSocialChannelInput, SocialChannel } from "./contracts/social-channel.js";
export { projectCapabilityMatrix } from "./contracts/social-channel.js";

// ---- Contracts: the §30 interaction vocabulary ----
export type {
  CitedRightsGrant,
  SocialAdapterOutcome,
  SocialDistributionFailure,
  SocialDistributionFailureCode,
  SocialDistributionRecord,
  SocialDistributionRecordFilter,
  SocialWarning,
} from "./contracts/distribution-record.js";

// ---- Contracts: platform-said output records ----
export type {
  SocialObservationFilter,
  SocialObservationRecord,
  SocialPublicationFilter,
  SocialPublicationRecord,
  SocialRestrictionFilter,
  SocialRestrictionRecord,
  SocialRetractionRecord,
  SocialScheduleRecord,
} from "./contracts/social-record.js";

// ---- Contracts: the provider-profile + rate-limit extension (SOCIAL-002..006) ----
// Provider-NEUTRAL only: the five real-platform profiles live as DATA in
// their isolated adapter subtrees (subpath exports), never here.
export type {
  SocialArtifactTypeFamily,
  SocialAuthFlowKind,
  SocialOperationShape,
  SocialOperationShapeDeclaration,
  SocialProviderAuthDeclaration,
  SocialProviderProfile,
} from "./contracts/provider-profile.js";
export {
  SOCIAL_ARTIFACT_TYPE_FAMILIES,
  SOCIAL_AUTH_FLOW_KINDS,
  SOCIAL_OPERATION_SHAPES,
  socialArtifactTypeFamily,
} from "./contracts/provider-profile.js";
export type {
  SocialRateLimitObservationFilter,
  SocialRateLimitObservationRecord,
  SocialRateLimitPosture,
} from "./contracts/social-rate-limit.js";
export { SOCIAL_RATE_LIMIT_POSTURES } from "./contracts/social-rate-limit.js";

// ---- Ports ----
export type { SocialAdapterPort } from "./ports/social-adapter.port.js";
export type { SocialChannelRegistryPort } from "./ports/social-channel-registry.port.js";
export type {
  SocialPolicyCheckRequest,
  SocialPolicyGatePort,
  SocialPolicyVerdict,
} from "./ports/social-policy-gate.port.js";
export type {
  SocialRightsCheckRequest,
  SocialRightsDenialReason,
  SocialRightsGatePort,
  SocialRightsGateVerdict,
} from "./ports/social-rights-gate.port.js";
export type {
  SocialTransportPort,
  SocialTransportRequest,
  SocialTransportResponse,
} from "./ports/social-transport.port.js";

// ---- Typed errors ----
export { DistributionError } from "./errors.js";
export type { DistributionErrorCode } from "./errors.js";

// ---- In-memory adapters (disclosed doubles where docblocks say so) ----
export { createInMemorySocialChannelRegistry } from "./adapters/in-memory-social-channel-registry.js";
export type { InMemorySocialChannelRegistryOptions } from "./adapters/in-memory-social-channel-registry.js";
export { createInMemorySocialRightsGate } from "./adapters/in-memory-social-rights-gate.js";
export type {
  InMemorySocialRightsGate,
  InMemorySocialRightsGateOptions,
  SocialRightsEvaluator,
} from "./adapters/in-memory-social-rights-gate.js";
export { createInMemorySocialPolicyGate } from "./adapters/in-memory-social-policy-gate.js";
export type {
  InMemoryPolicyRule,
  InMemorySocialPolicyGate,
  InMemorySocialPolicyGateOptions,
} from "./adapters/in-memory-social-policy-gate.js";
export {
  createInMemorySocialTransportDouble,
  IN_MEMORY_SOCIAL_TRANSPORT_SOURCE,
} from "./adapters/in-memory-social-transport.js";
export type {
  InMemorySocialTransportDoubleOptions,
  InMemorySocialTransportRoute,
} from "./adapters/in-memory-social-transport.js";
export { createInMemorySocialAdapter } from "./adapters/in-memory-social-adapter.js";
export type { InMemorySocialAdapterOptions } from "./adapters/in-memory-social-adapter.js";

// ---- Platform health (HEALTH-001, W8-C) — OBSERVABLE-ONLY health records ----
// The provider-CONFIRMED restriction (from the W6-C list-restrictions
// surface) and the SUSPECTED distribution anomaly (a DERIVED record citing
// one of the DECLARED, DOCUMENTED derivation rules) are TYPED apart and
// never conflated; the surface records and queries observations only — NO
// maneuver authority (§3: compliant maneuvers are decided by the owning
// authorities consuming these records).
export type {
  HealthDerivationRuleId,
  HealthObservation,
  HealthObservationFilter,
  HealthObservationKind,
  MetricDeclineDerivationInputs,
  ObservationAbsenceDerivationInputs,
  ProviderConfirmedRestrictionObservation,
  ProviderHealthSummary,
  SuspectedAnomalyDerivation,
  SuspectedDistributionAnomalyObservation,
} from "./contracts/health-record.js";
export {
  HEALTH_DERIVATION_RULES,
  HEALTH_OBSERVATION_KINDS,
  platformHealthProjectionOf,
} from "./contracts/health-record.js";
export type {
  HealthRecordFailure,
  HealthRecordOutcome,
  HealthSurfacePort,
  RecordConfirmedRestrictionInput,
  RecordSuspectedAnomalyInput,
} from "./ports/health-surface.port.js";
export {
  deriveMetricDecline,
  deriveObservationAbsence,
  providerIdOf,
} from "./domain/health-derivations.js";
export { createInMemoryHealthSurface } from "./adapters/in-memory-health-surface.js";
export type { InMemoryHealthSurfaceOptions } from "./adapters/in-memory-health-surface.js";
