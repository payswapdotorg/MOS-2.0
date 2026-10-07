/**
 * Provider interaction contracts — the §30 observability vocabulary of the
 * call surface (INTEG-001).
 *
 * Spec §30 (Observability): every Lab/Studio/Engine PRODUCTION action
 * records request/run id, contract version, actor, organization version,
 * engine version, capability version, artifact refs, cost/latency,
 * failure/warning, provenance, evaluation result. For provider
 * interactions the operative fields are: REQUEST ID, PROVIDER,
 * IMPLEMENTATION VERSION, CAPABILITY, ACTOR, DURATION, FAILURE/WARNINGS —
 * plus the tenant scope, the instance binding, the rights frame that
 * authorized the call and the transport source (so a disclosed in-memory
 * transport can never masquerade as a live provider — AGENTS.md
 * "Mocks/doubles can test contracts but cannot be represented as live
 * provider or production proof").
 *
 * MEDIA DISCIPLINE (§6 / AGENTS.md "Media"): interaction parameters are a
 * JsonObject of SMALL control-plane values; large media travels as storage
 * references, never inline. The record itself carries references only.
 */

import type {
  Capability,
  CapabilityId,
  IdentityRef,
  JsonObject,
  Milliseconds,
  ProviderId,
  TenantScope,
  Timestamp,
  Version,
} from "@mos/contracts";
import type { RightsAction } from "@mos/rights";

import type { AvailabilityCapability } from "./availability-capability.js";
import type {
  MerchantClientInstanceId,
  ProviderInteractionId,
  ProviderImplementationId,
  RightsContextRef,
} from "./ids.js";
import type { ProviderImplementationStatus } from "./provider-implementation.js";

// ---------------------------------------------------------------------------
// Typed failure + warning vocabulary
// ---------------------------------------------------------------------------

/**
 * Machine-readable failure codes of a provider interaction. Note the two
 * DISTINCT status codes: `implementation-status-unavailable` and
 * `implementation-status-unknown` — an UNKNOWN implementation status is its
 * own fail-closed outcome, never rewritten to "unavailable" (the UNKNOWN
 * preservation discipline extends to the failure vocabulary itself).
 */
export type ProviderInteractionFailureCode =
  /** The instance does not exist IN THIS TENANT (cross-tenant is indistinguishable — §31). */
  | "unknown-merchant-client-instance"
  /** No explicit AvailabilityCapability record covers the requested capability on the bound implementation. */
  | "capability-not-available-on-instance"
  /** The bound implementation version records status "unavailable". */
  | "implementation-status-unavailable"
  /** The bound implementation version records status "unknown" (preserved, NOT coerced to unavailable). */
  | "implementation-status-unknown"
  /** The rights gate denied the call (details carry the denial reason). */
  | "rights-gate-denied"
  /** The transport seam reported a failure. */
  | "transport-failed";

/** A typed provider-interaction failure (§30 failure field). */
export interface ProviderInteractionFailure {
  readonly code: ProviderInteractionFailureCode;
  readonly message: string;
  readonly retriable: boolean;
  /** Structured details (e.g. the rights denial reason). */
  readonly details?: JsonObject;
}

/** A non-fatal warning recorded with an interaction (§30 warnings field). */
export interface ProviderInteractionWarning {
  readonly code: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// §30 interaction record
// ---------------------------------------------------------------------------

/**
 * The immutable audit record of ONE provider interaction attempt (success,
 * typed failure or rights denial — every attempt through the call surface
 * is recorded; there is no unrecorded path). Fields beyond the §30 list:
 * the tenant scope, the instance binding, the rights frame used, the
 * verbatim implementation status and the transport source label.
 */
export interface ProviderInteractionRecord {
  /** §30 request id — unique within the interaction log. */
  readonly id: ProviderInteractionId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The instance the caller asked to act through. */
  readonly instanceId: MerchantClientInstanceId;
  /** §30 provider — the provider identity (data) of the bound definition. */
  readonly providerId: ProviderId;
  /** The implementation that served (or was attempted). */
  readonly implementationId: ProviderImplementationId;
  /** §30 implementation version — the EXACT bound record version. */
  readonly implementationVersion: Version;
  /**
   * The implementation status VERBATIM at interaction time (UNKNOWN
   * preserved first-class — never coerced).
   */
  readonly implementationStatus: ProviderImplementationStatus;
  /** §30 capability — which capability was exercised. */
  readonly capabilityId: CapabilityId;
  /** Capability version — the EXACT version exercised. */
  readonly capabilityVersion: Version;
  /** §30 actor — the identity principal that initiated the interaction. */
  readonly actor: IdentityRef;
  /** The rights frame the caller presented (audit; the gate's verdict is in failure/warnings). */
  readonly rightsContextRef: RightsContextRef;
  /** When the attempt started (ISO-8601). */
  readonly startedAt: Timestamp;
  /** §30 duration in milliseconds (≥ 0; 0 for pre-transport failures under a fixed clock). */
  readonly durationMs: Milliseconds;
  /** §30 failure — null on success. */
  readonly failure: ProviderInteractionFailure | null;
  /** §30 warnings — transport warnings + declared-constraint surfacing. */
  readonly warnings: readonly ProviderInteractionWarning[];
  /**
   * Honest transport source label (e.g. "in-memory-transport-double" for the
   * disclosed double; real adapters label themselves). Every §30 record
   * names where its response came from.
   */
  readonly transportSource: string;
}

// ---------------------------------------------------------------------------
// Request / result of the call surface
// ---------------------------------------------------------------------------

/** A request to invoke one capability through one merchant/client instance. */
export interface ProviderInteractionRequest {
  readonly scope: TenantScope;
  /** The instance to act through (tenant-scoped; unknown → typed failure). */
  readonly instanceId: MerchantClientInstanceId;
  /** Which capability to exercise. */
  readonly capabilityId: CapabilityId;
  /** The EXACT capability version to exercise (must be explicitly available). */
  readonly capabilityVersion: Version;
  /** §30 actor. */
  readonly actor: IdentityRef;
  /**
   * Rights frame handle: the rights gate resolves it and FAILS CLOSED
   * without an adequate grant (unknown handle included). @mos/rights
   * vocabulary: the action the caller exercises.
   */
  readonly rightsContextRef: RightsContextRef;
  readonly rightsAction: RightsAction;
  /**
   * Small control-plane parameters (§6: large media travels as storage
   * references — never inline).
   */
  readonly parameters: JsonObject;
}

/**
 * The outcome of one provider interaction through the call surface.
 *
 * - `completed`: the transport answered; the §30 record (failure null)
 *   is in the audit log and echoed here.
 * - `failed`: an attributable interaction failed at a typed stage
 *   (rights gate, availability gate, status gate or transport); the §30
 *   record (failure present) is ALWAYS in the audit log and echoed here.
 * - `unresolved-instance`: the requested instance does not exist IN THE
 *   CALLER'S TENANT (cross-tenant is indistinguishable — §31). Nothing
 *   was attributable, so NO §30 record exists (disclosed: the audit log
 *   records interactions, not lookups that failed to identify one).
 */
export type ProviderInteractionResult =
  | {
      readonly outcome: "completed";
      /** The §30 record (failure null, warnings present). */
      readonly record: ProviderInteractionRecord;
      /** The transport's output payload (data). */
      readonly output: JsonObject;
    }
  | {
      readonly outcome: "failed";
      /** The §30 record (failure present — the typed failure is echoed here). */
      readonly record: ProviderInteractionRecord;
      readonly failure: ProviderInteractionFailure;
    }
  | {
      readonly outcome: "unresolved-instance";
      /** The typed failure (always code `unknown-merchant-client-instance`). */
      readonly failure: ProviderInteractionFailure;
    };

/** Filter for reading the interaction audit log (all fields optional). */
export interface InteractionRecordFilter {
  readonly instanceId?: MerchantClientInstanceId;
  readonly capabilityId?: CapabilityId;
  readonly actor?: IdentityRef;
  /** Only records with this failure code (omit for all, incl. successes). */
  readonly failureCode?: ProviderInteractionFailureCode;
  /** Maximum number of records returned (ascending time order, then id). */
  readonly limit?: number;
}

/**
 * One availability entry of an instance, RESOLVED through the
 * @mos/capabilities vocabulary: the explicit availability record plus the
 * canonical capability contract it resolved to. Entries whose capability
 * refs do not resolve in the vocabulary are NOT returned — an
 * availability without a resolvable capability record provides nothing.
 */
export interface ResolvedInstanceCapability {
  /** The explicit layer-4 availability record. */
  readonly availability: AvailabilityCapability;
  /** The canonical capability contract the ref resolved to. */
  readonly capability: Capability;
}
