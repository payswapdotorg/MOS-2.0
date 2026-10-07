/**
 * Social distribution interaction contracts — the §30 observability
 * vocabulary of the adapter call surface (SOCIAL-001).
 *
 * Spec §30 (Observability): every Lab/Studio/Engine production action
 * records request/run id, contract version, actor, ... artifact refs,
 * cost/latency, failure/warning, provenance, evaluation result. For
 * social distribution the operative fields are: REQUEST ID, PROVIDER,
 * CAPABILITY INVOKED (the operation + the matrix declaration that
 * governed it), ACTOR, DURATION, FAILURE/WARNINGS — plus the tenant
 * scope, the channel binding, the rights frame that authorized the call,
 * the policy verdict's cited policy and the transport source (so a
 * disclosed in-memory transport can never masquerade as a live platform —
 * AGENTS.md "Mocks/doubles can test contracts but cannot be represented
 * as live provider or production proof").
 *
 * RIGHTS/POLICY GATES PRECEDE PROVIDER CALLS (backlog acceptance,
 * test-pinned): a denied rights or policy evaluation NEVER reaches the
 * transport seam; the §30 record names which gate refused
 * (`transportSource` carries the refusing gate's label for pre-transport
 * failures).
 *
 * UNKNOWN PRESERVATION extends to the failure vocabulary itself:
 * `operation-support-unknown` is a DISTINCT code from
 * `operation-unsupported` — a declared-unknown capability is never
 * rewritten to a refusal-as-unsupported (W5-C discipline).
 */

import type {
  IdentityRef,
  JsonObject,
  Milliseconds,
  PolicyRef,
  ProviderId,
  RightsRef,
  TenantScope,
  Timestamp,
} from "@mos/contracts";
import type { RightsContextRef } from "@mos/integrations";

import type { SocialChannelId, SocialDistributionId } from "./ids.js";
import type { CapabilitySupportLevel } from "@mos/integrations";
import type { SocialOperation } from "./social-operation.js";

// ---------------------------------------------------------------------------
// Typed failure + warning vocabulary
// ---------------------------------------------------------------------------

/**
 * Machine-readable failure codes of a social adapter invocation. Note the
 * THREE DISTINCT capability-matrix codes: `operation-not-declared` (no
 * matrix entry — parity never assumed), `operation-unsupported` (declared
 * unsupported) and `operation-support-unknown` (declared UNKNOWN — its own
 * preserved outcome, never coerced to unsupported).
 */
export type SocialDistributionFailureCode =
  /** The channel does not exist IN THIS TENANT (cross-tenant ≡ unknown — §31). */
  | "unknown-social-channel"
  /** The rights gate denied the call (details carry the verbatim @mos/rights denial reason). */
  | "rights-gate-denied"
  /** The policy gate denied the call (details carry the policy denial reason). */
  | "policy-gate-denied"
  /** The channel's capability matrix has NO declaration for the requested operation. */
  | "operation-not-declared"
  /** The channel's capability matrix declares the operation UNSUPPORTED. */
  | "operation-unsupported"
  /** The channel's capability matrix declares the operation UNKNOWN (preserved first-class). */
  | "operation-support-unknown"
  /** The transport seam reported a failure. */
  | "transport-failed"
  /** The transport responded, but its response carries no typable platform record (never invented). */
  | "invalid-platform-response";

/** A typed social-distribution failure (§30 failure field). */
export interface SocialDistributionFailure {
  readonly code: SocialDistributionFailureCode;
  readonly message: string;
  readonly retriable: boolean;
  /** Structured details (e.g. the verbatim rights denial reason, the policy reason). */
  readonly details?: JsonObject;
}

/** A non-fatal warning recorded with an interaction (§30 warnings field). */
export interface SocialWarning {
  readonly code: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// §30 distribution record
// ---------------------------------------------------------------------------

/**
 * The immutable audit record of ONE social adapter attempt (success,
 * typed failure, rights/policy denial — every attributable attempt is
 * recorded; there is no unrecorded path). Fields beyond the §30 list:
 * the tenant scope, the channel binding, the rights frame used, the
 * policy the gate cited, the capability-matrix declaration that
 * governed the operation and the transport source label.
 */
export interface SocialDistributionRecord {
  /** §30 request id — unique within the distribution audit log. */
  readonly id: SocialDistributionId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The channel the caller asked to act through. */
  readonly channelRef: SocialChannelId;
  /** §30 provider — the platform identity (data) of the channel. */
  readonly providerId: ProviderId;
  /** §30 capability invoked — which social operation was exercised. */
  readonly operation: SocialOperation;
  /**
   * The capability-matrix declaration that governed the operation
   * VERBATIM at invocation time (null when a preceding gate — rights or
   * policy — refused before the matrix was consulted). A declared
   * `unknown` is recorded VERBATIM, never coerced.
   */
  readonly operationSupport: CapabilitySupportLevel | null;
  /** §30 actor — the identity principal that initiated the operation. */
  readonly actor: IdentityRef;
  /** The rights frame the caller presented (audit; the gate's verdict is in failure/warnings). */
  readonly rightsContextRef: RightsContextRef;
  /**
   * The policy record the policy gate's PERMIT verdict cited, when one
   * was (audit; the policy seam's contract is frozen — the policy
   * authority arrives in a later wave).
   */
  readonly policyRef: PolicyRef | null;
  /** When the attempt started (ISO-8601). */
  readonly startedAt: Timestamp;
  /** §30 duration in milliseconds (≥ 0; 0 for pre-transport failures under a fixed clock). */
  readonly durationMs: Milliseconds;
  /** §30 failure — null on success. */
  readonly failure: SocialDistributionFailure | null;
  /** §30 warnings — transport warnings + declared-constraint surfacing. */
  readonly warnings: readonly SocialWarning[];
  /**
   * Honest transport source label: the transport that answered (e.g.
   * "in-memory-social-transport-double" for the disclosed double) or the
   * refusing gate's label for pre-transport failures ("rights-gate",
   * "policy-gate", "capability-matrix"). Every §30 record names where its
   * outcome came from.
   */
  readonly transportSource: string;
}

// ---------------------------------------------------------------------------
// Result envelope of the call surface
// ---------------------------------------------------------------------------

/**
 * The outcome of one social adapter operation through the call surface.
 *
 * - `completed`: the transport answered and its response carried a
 *   typable platform record; the §30 record (failure null) is in the
 *   audit log and echoed here, with the typed output record(s).
 * - `failed`: an attributable invocation failed at a typed stage
 *   (rights gate, policy gate, capability matrix, transport or platform
 *   response parsing); the §30 record (failure present) is ALWAYS in the
 *   audit log and echoed here.
 * - `unresolved-channel`: the requested channel does not exist IN THE
 *   CALLER'S TENANT (cross-tenant is indistinguishable — §31). Nothing
 *   was attributable, so NO §30 record exists (disclosed: the audit log
 *   records invocations, not lookups that failed to identify one — the
 *   W5-C precedent).
 */
export type SocialAdapterOutcome<TOutput> =
  | {
      readonly outcome: "completed";
      /** The §30 record (failure null, warnings present). */
      readonly record: SocialDistributionRecord;
      /** The typed platform-confirmed output record(s). */
      readonly output: TOutput;
    }
  | {
      readonly outcome: "failed";
      /** The §30 record (failure present — the typed failure is echoed here). */
      readonly record: SocialDistributionRecord;
      readonly failure: SocialDistributionFailure;
    }
  | {
      readonly outcome: "unresolved-channel";
      /** The typed failure (always code `unknown-social-channel`). */
      readonly failure: SocialDistributionFailure;
    };

/** Filter for reading the §30 distribution audit log (all fields optional). */
export interface SocialDistributionRecordFilter {
  readonly channelRef?: SocialChannelId;
  readonly operation?: SocialOperation;
  readonly actor?: IdentityRef;
  /** Only records with this failure code (omit for all, incl. successes). */
  readonly failureCode?: SocialDistributionFailureCode;
  /** Maximum number of records returned (ascending time order, then id). */
  readonly limit?: number;
}

/** The rights grant a permitted verdict cited (audit echo type). */
export type CitedRightsGrant = RightsRef;
