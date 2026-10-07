/**
 * In-memory ProviderTransport adapter (INTEG-001 — the DISCLOSED DOUBLE of
 * the transport seam).
 *
 * NO REAL NETWORK: this adapter performs no I/O of any kind (no sockets,
 * no fetch, no DNS, no timers — pinned by the package's structural
 * no-network test). It routes by the request's providerId over DATA routes
 * supplied by the caller (tests/scripts); with no matching route it
 * answers with the DEFAULT deterministic echo response.
 *
 * DETERMINISM (documented, pinned by tests): `send` is a PURE function of
 * (request, routes) — no randomness, no clock reads, no ambient state. The
 * same request against the same double returns a deep-equal response,
 * bit-for-bit, in any process. Route tables are plain data.
 *
 * Every response self-labels its source ("in-memory-transport-double") so
 * the §30 record always names where the output came from — double output
 * can never masquerade as live provider evidence (AGENTS.md Verification).
 *
 * Failures produced by routes are normalized to the `transport-failed`
 * code — the only failure code the transport seam emits.
 */

import type { JsonObject } from "@mos/contracts";

import type { ProviderInteractionWarning } from "../contracts/interaction.js";
import type {
  ProviderTransportPort,
  ProviderTransportRequest,
  ProviderTransportResponse,
} from "../ports/provider-transport.port.js";

/** The self-label every response of this double carries. */
export const IN_MEMORY_TRANSPORT_SOURCE = "in-memory-transport-double";

/** One scripted route (DATA): how the double answers one providerId. */
export type InMemoryTransportRoute =
  | {
      readonly kind: "ok";
      /** Output payload (data); defaults to the deterministic echo. */
      readonly output?: JsonObject;
      /** Warnings to surface on the §30 record. */
      readonly warnings?: readonly ProviderInteractionWarning[];
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
export interface InMemoryProviderTransportDoubleOptions {
  /** Scripted routes keyed by providerId (DATA — provider specifics live here, never in code). */
  readonly routes?: Readonly<Record<string, InMemoryTransportRoute>>;
}

function echoOutput(request: ProviderTransportRequest): JsonObject {
  // Deterministic echo: names the capability/version exercised and echoes
  // the (small, control-plane) parameters. Pure function of the request.
  return Object.freeze({
    exercisedCapability: Object.freeze({
      capabilityId: request.capabilityId,
      capabilityVersion: request.capabilityVersion,
    }),
    echoedParameters: request.parameters,
  });
}

/**
 * Creates the in-memory {@link ProviderTransportPort} double.
 */
export function createInMemoryProviderTransportDouble(
  options: InMemoryProviderTransportDoubleOptions = {},
): ProviderTransportPort {
  const routes = options.routes ?? {};

  return {
    send(request: ProviderTransportRequest): ProviderTransportResponse {
      // The credential HANDLE travels to this boundary; the double never
      // resolves it and never sees a value (there is none in the control
      // plane — the compile-time exact-keyset pin guarantees the request
      // has no credential-value field).
      const route = routes[request.providerId as string];
      if (route === undefined) {
        return {
          ok: true,
          output: echoOutput(request),
          warnings: [],
          source: IN_MEMORY_TRANSPORT_SOURCE,
        };
      }
      if (route.kind === "ok") {
        return {
          ok: true,
          output: route.output === undefined ? echoOutput(request) : route.output,
          warnings: route.warnings ?? [],
          source: IN_MEMORY_TRANSPORT_SOURCE,
        };
      }
      return {
        ok: false,
        failure: {
          code: "transport-failed",
          message: route.message,
          retriable: route.retriable ?? false,
          ...(route.details !== undefined ? { details: route.details } : {}),
        },
        source: IN_MEMORY_TRANSPORT_SOURCE,
      };
    },
  };
}
