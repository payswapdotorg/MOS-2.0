/**
 * SocialAdapter, ConnectorProvider and PlatformHealthObservation
 * contracts (CORE-001).
 *
 * Contract mapping (spec/contracts/core-contracts-v2.0.yaml):
 *   SocialAdapter.required = [provider, version, capabilityMatrix,
 *     accountOperations, contentOperations, analyticsOperations,
 *     publishingOperations, restrictionObservations]
 *   ConnectorProvider.required = [providerId, version, capabilities,
 *     authentication, invocationContract, evidenceModel, errorModel,
 *     rateLimitObservation]
 *   PlatformHealthObservation.required = [id, accountRef, provider,
 *     observedAt, observableSignals, healthState, confidence, uncertainty,
 *     maneuvers]
 *
 * Basis: spec/mos-architecture-v2.0.md §3 (integrations/distribution are
 * the only provider-touching authorities), spec/mos-module-registry
 * -v2.0.yaml rules (studioToDirectProviderImports forbidden,
 * labToDirectProviderImports forbidden, forbidProviderCallsOutsideIntegration),
 * AGENTS.md ("Do not infer rights from URL accessibility", "Studio never
 * publishes directly").
 *
 * The integrations module (@mos/integrations, INTEG-001+) and distribution
 * module (@mos/distribution) implement against these types. Social
 * adapters WRAP platform capabilities for distribution; connector
 * providers WRAP external services; health observations record what the
 * platform actually allows, with uncertainty — they are observations, not
 * rights.
 */

import type {
  AccountRef,
  JsonSchemaObject,
  PlatformHealthObservationId,
  ProviderId,
  Timestamp,
  UncertaintySummary,
  Version,
} from "./value-types.js";

// ---------------------------------------------------------------------------
// SocialAdapter
// ---------------------------------------------------------------------------

/** One observed platform restriction (an observation, never a rights grant). */
export interface RestrictionObservation {
  readonly observedAt: Timestamp;
  readonly description: string;
}

/**
 * A social-platform adapter contract for the distribution authority: the
 * provider it wraps, the capability matrix (which platform capabilities
 * are actually available), the account/content/analytics/publishing
 * operation surfaces, and the restrictions observed on this platform.
 * Publishing flows through distribution/policy — an adapter with
 * publishing operations is NOT a publication authority by itself.
 */
export interface SocialAdapter {
  readonly provider: ProviderId;
  readonly version: Version;
  /** Platform capability matrix: capability name → available or not. */
  readonly capabilityMatrix: Readonly<Record<string, boolean>>;
  readonly accountOperations: readonly string[];
  readonly contentOperations: readonly string[];
  readonly analyticsOperations: readonly string[];
  readonly publishingOperations: readonly string[];
  readonly restrictionObservations: readonly RestrictionObservation[];
}

// ---------------------------------------------------------------------------
// ConnectorProvider
// ---------------------------------------------------------------------------

/** How a connector provider authenticates and who escrows the credentials. */
export interface AuthenticationModel {
  /** Authentication kind (e.g. "oauth2", "api-key", "session-cookie", "none"). */
  readonly kind: string;
  /** Credentials are held by the integrations module, never by engines or domain modules. */
  readonly managedBy: "integrations" | "caller";
}

/** Observed rate-limit posture of a connector provider. */
export interface RateLimitObservation {
  readonly observedAt: Timestamp;
  readonly requestsPerWindow: number;
  readonly windowMs: number;
}

/**
 * A connector provider contract for the integrations authority: the
 * provider id, its capabilities, its authentication model, invocation
 * contract, evidence model (how real-world evidence is shaped), error
 * model, and observed rate limits.
 */
export interface ConnectorProvider {
  readonly providerId: ProviderId;
  readonly version: Version;
  readonly capabilities: readonly string[];
  readonly authentication: AuthenticationModel;
  readonly invocationContract: JsonSchemaObject;
  readonly evidenceModel: JsonSchemaObject;
  readonly errorModel: JsonSchemaObject;
  readonly rateLimitObservation: RateLimitObservation;
}

// ---------------------------------------------------------------------------
// PlatformHealthObservation
// ---------------------------------------------------------------------------

/** Observed health state of an account on a platform. */
export type PlatformHealthState =
  | "healthy"
  | "degraded"
  | "restricted"
  | "suspended"
  | "unknown";

/**
 * One platform health observation for one account: which signals were
 * observable, the inferred health state, the confidence and uncertainty of
 * that inference, and the maneuvers applied or available. Observations feed
 * distribution strategy — they carry no rights semantics.
 */
export interface PlatformHealthObservation {
  readonly id: PlatformHealthObservationId;
  readonly accountRef: AccountRef;
  readonly provider: ProviderId;
  readonly observedAt: Timestamp;
  readonly observableSignals: readonly string[];
  readonly healthState: PlatformHealthState;
  /** Confidence of the health inference, in [0, 1]. */
  readonly confidence: number;
  readonly uncertainty: UncertaintySummary;
  readonly maneuvers: readonly string[];
}
