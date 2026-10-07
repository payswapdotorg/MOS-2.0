/**
 * In-memory SocialTransport adapter (SOCIAL-001 — the DISCLOSED DOUBLE of
 * the transport seam).
 *
 * NO REAL NETWORK: this adapter performs no I/O of any kind (no sockets,
 * no fetch, no DNS, no timers — pinned by the package's structural
 * no-network test). It routes by the request's providerId over DATA
 * routes supplied by the caller (tests/scripts); with no matching route
 * it answers with the DEFAULT deterministic echo response (the request's
 * own parameters echoed back — which the adapter runtime then fails to
 * type as platform data where the operation requires it: an honest
 * `invalid-platform-response`, never an invented post ref or metric).
 *
 * DETERMINISM (documented, pinned by tests): `send` is a PURE function of
 * (request, routes) — no randomness, no clock reads, no ambient state.
 * The same request against the same double returns a deep-equal
 * response, bit-for-bit, in any process. Route tables are plain data.
 *
 * Every response self-labels its source ("in-memory-social-transport-
 * double") so the §30 record always names where the output came from —
 * double output can never masquerade as live platform evidence
 * (AGENTS.md Verification). Route payloads are PLATFORM-SAID DATA
 * supplied by the caller: fictional post refs, fictional metrics — the
 * source label keeps them honest.
 *
 * Failures produced by routes are normalized to the `transport-failed`
 * code — the only failure code the transport seam emits itself.
 */

import type { JsonObject } from "@mos/contracts";

import type {
  SocialDistributionFailure,
  SocialWarning,
} from "../contracts/distribution-record.js";
import type {
  SocialTransportPort,
  SocialTransportRequest,
  SocialTransportResponse,
} from "../ports/social-transport.port.js";

/** The self-label every response of this double carries. */
export const IN_MEMORY_SOCIAL_TRANSPORT_SOURCE = "in-memory-social-transport-double";

/** One scripted route (DATA): how the double answers one providerId. */
export type InMemorySocialTransportRoute =
  | {
      readonly kind: "ok";
      /** Platform-said payload (data — the fictional platform's answer). */
      readonly output?: JsonObject;
      /** Warnings to surface on the §30 record. */
      readonly warnings?: readonly SocialWarning[];
    }
  | {
      readonly kind: "fail";
      /** Human-facing failure message (data). */
      readonly message: string;
      /** Whether callers may retry (default false). */
      readonly retriable?: boolean;
      /** Structured failure details (data). */
      readonly details?: JsonObject;
    };

/** Options for the in-memory transport double. */
export interface InMemorySocialTransportDoubleOptions {
  /** Scripted routes keyed by providerId (DATA — provider specifics live here, never in code). */
  readonly routes?: Readonly<Record<string, InMemorySocialTransportRoute>>;
}

function echoOutput(request: SocialTransportRequest): JsonObject {
  // Deterministic echo: names the operation exercised and echoes the
  // (small, control-plane) parameters. Pure function of the request. The
  // echo deliberately carries NO platform refs/metrics — the runtime
  // types it as invalid-platform-response where platform data is
  // required instead of letting the double invent any.
  return Object.freeze({
    exercisedOperation: request.operation,
    echoedParameters: request.parameters,
  });
}

/**
 * Creates the in-memory {@link SocialTransportPort} double.
 */
export function createInMemorySocialTransportDouble(
  options: InMemorySocialTransportDoubleOptions = {},
): SocialTransportPort {
  const routes = options.routes ?? {};

  return {
    send(request: SocialTransportRequest): SocialTransportResponse {
      // The integrations instanceRef travels to this boundary; the double
      // never resolves it and never sees a credential value (there is
      // none in the distribution control plane — the compile-time
      // exact-keyset pin guarantees the request has no credential-value
      // or media-bytes field).
      const route = routes[request.providerId as string];
      if (route === undefined) {
        return {
          ok: true,
          output: echoOutput(request),
          warnings: [],
          source: IN_MEMORY_SOCIAL_TRANSPORT_SOURCE,
        };
      }
      if (route.kind === "ok") {
        return {
          ok: true,
          output: route.output === undefined ? echoOutput(request) : route.output,
          warnings: route.warnings ?? [],
          source: IN_MEMORY_SOCIAL_TRANSPORT_SOURCE,
        };
      }
      const failure: SocialDistributionFailure = {
        code: "transport-failed",
        message: route.message,
        retriable: route.retriable ?? false,
        ...(route.details !== undefined ? { details: route.details } : {}),
      };
      return {
        ok: false,
        failure,
        source: IN_MEMORY_SOCIAL_TRANSPORT_SOURCE,
      };
    },
  };
}
