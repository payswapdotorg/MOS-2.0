/**
 * In-memory NotificationProviderPort adapter (NOTIFY-001 — the DISCLOSED
 * DOUBLE of the notification transport seam).
 *
 * NO REAL NETWORK: this adapter performs no I/O of any kind (no sockets,
 * no fetch, no DNS, no timers). It answers every delivery request from
 * DATA routes supplied by the caller (tests/scripts); with no scripted
 * outcome it answers with the DEFAULT deterministic acknowledgment.
 *
 * DETERMINISM (documented, pinned by tests): `deliver` is a PURE
 * function of (request, routes) — no randomness, no clock reads, no
 * ambient state. The same request against the same double returns a
 * deep-equal response, bit-for-bit, in any process. Route tables are
 * plain data.
 *
 * Every response self-labels its source ("in-memory-notification-provider-double")
 * so the §30 attempt record and the receipt always name where the
 * response came from — double output can never masquerade as live
 * provider evidence (AGENTS.md Verification).
 *
 * Failures produced by routes use the closed provider-seam vocabulary:
 * `provider-rejected` (permanent) or `provider-transport-failed`
 * (transient, retry candidate).
 */

import type { ProviderId } from "@mos/contracts";

import type { ProviderAckRef } from "../contracts/ids.js";
import type { TypedNotificationFailure } from "../contracts/notification.js";
import type {
  NotificationDeliveryRequest,
  NotificationProviderPort,
  NotificationProviderResponse,
} from "../ports/notification-provider.port.js";

/** The self-label every response of this double carries. */
export const IN_MEMORY_NOTIFICATION_PROVIDER_SOURCE = "in-memory-notification-provider-double";

/** One scripted outcome (DATA): how the double answers one delivery. */
export type InMemoryNotificationRoute =
  | {
      readonly kind: "ok";
      /** Acknowledgment reference to return (data); null = provider returns none. */
      readonly ackRef?: string | null;
      /** Warnings to surface on the §30 record. */
      readonly warnings?: readonly { code: string; message: string }[];
    }
  | {
      readonly kind: "fail";
      /** Which closed failure code the provider reports. */
      readonly code: "provider-rejected" | "provider-transport-failed";
      /** Human-facing failure message (data). */
      readonly message: string;
      /** Whether callers may retry (default: rejected=false, transport=true). */
      readonly retriable?: boolean;
      /** Structured failure details (data). */
      readonly details?: Record<string, unknown>;
    };

/** Options for the in-memory notification provider double. */
export interface InMemoryNotificationProviderDoubleOptions {
  /** The declared provider identity of this transport binding (§30 provider ref — DATA). */
  readonly providerId: ProviderId;
  /**
   * Scripted outcomes, applied IN ORDER per delivery attempt count: the
   * entry at index (attempt − 1) answers that attempt; entries beyond the
   * list length reuse the LAST entry; an EMPTY list answers every attempt
   * with the default acknowledgment (DATA — provider specifics live here,
   * never in code).
   */
  readonly routes?: readonly InMemoryNotificationRoute[];
}

/** Creates the in-memory {@link NotificationProviderPort} double. */
export function createInMemoryNotificationProviderDouble(
  options: InMemoryNotificationProviderDoubleOptions,
): NotificationProviderPort {
  const routes = options.routes ?? [];

  const routeFor = (attempt: number): InMemoryNotificationRoute | undefined => {
    if (routes.length === 0) {
      return undefined;
    }
    const index = Math.min(attempt - 1, routes.length - 1);
    return routes[index];
  };

  return {
    providerId: options.providerId,

    deliver(request: NotificationDeliveryRequest): NotificationProviderResponse {
      const route = routeFor(request.attempt);
      if (route === undefined) {
        // Deterministic default: acknowledged with a request-derived ack ref.
        return {
          ok: true,
          ackRef: `ack:${request.requestId as string}` as ProviderAckRef,
          warnings: [],
          source: IN_MEMORY_NOTIFICATION_PROVIDER_SOURCE,
        };
      }
      if (route.kind === "ok") {
        return {
          ok: true,
          ackRef: route.ackRef === undefined
            ? (`ack:${request.requestId as string}` as ProviderAckRef)
            : (route.ackRef === null ? null : (route.ackRef as ProviderAckRef)),
          warnings: route.warnings ?? [],
          source: IN_MEMORY_NOTIFICATION_PROVIDER_SOURCE,
        };
      }
      const failure: TypedNotificationFailure = {
        code: route.code,
        message: route.message,
        retriable: route.retriable ?? route.code === "provider-transport-failed",
        ...(route.details === undefined ? {} : { details: route.details }),
      };
      return {
        ok: false,
        failure,
        source: IN_MEMORY_NOTIFICATION_PROVIDER_SOURCE,
      };
    },
  };
}
