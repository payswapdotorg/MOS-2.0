/**
 * NotificationProviderPort (NOTIFY-001 — the declared transport seam of
 * the notification plane).
 *
 * The single seam through which a notification delivery leaves the
 * control plane. The provider identity is DATA (`ProviderId` from the
 * @mos/contracts vocabulary — the same family the INTEG-001
 * provider-contract module owns; THIS package never imports
 * mos-integrations, the types-level vocabulary alignment is the declared
 * seam). REAL provider bindings (email/push/webhook adapters over actual
 * providers) are FUTURE composition-root work — no real network exists
 * in this package. The shipped adapter is the DISCLOSED deterministic
 * in-memory double whose responses self-label (`source`) so double
 * output can never masquerade as live provider evidence (AGENTS.md
 * "Mocks/doubles can test contracts but cannot be represented as live
 * provider or production proof").
 *
 * Port files never import @zcode/* (boundary rule PORTS-NO-ZCODE).
 * 1 public method (policy budget 12).
 */

import type { IdentityRef, ProviderId, TenantScope } from "@mos/contracts";

import type { DeliveryAttemptId, NotificationId, ProviderAckRef } from "../contracts/ids.js";
import type {
  NotificationKind,
  NotificationSubject,
  NotificationWarning,
  TypedNotificationFailure,
} from "../contracts/notification.js";

/** One outbound notification delivery attempt at the transport seam. */
export interface NotificationDeliveryRequest {
  /** §30 request id — the delivery attempt id this request belongs to. */
  readonly requestId: DeliveryAttemptId;
  readonly scope: TenantScope;
  readonly notificationId: NotificationId;
  /** The declarative kind (semantic category — providers transport, never interpret). */
  readonly kind: NotificationKind;
  /** The recipient identity ref (resolution to an address/handle is the real adapter's concern). */
  readonly recipient: IdentityRef;
  /** Reference-only subject (artifact/task/mission refs — never inline content, §6). */
  readonly subject: NotificationSubject;
  /** The delivery attempt number (1-based). */
  readonly attempt: number;
}

/**
 * The transport's response to one outbound delivery attempt. Every
 * response SELF-LABELS with `source` — the honest name of the adapter
 * that produced it (e.g. "in-memory-notification-provider-double"),
 * copied onto the §30 attempt record and the receipt.
 */
export type NotificationProviderResponse =
  | {
      readonly ok: true;
      /** The provider's acknowledgment reference, or null when it returns none. */
      readonly ackRef: ProviderAckRef | null;
      /** Non-fatal warnings from the transport/provider (§30 warnings). */
      readonly warnings: readonly NotificationWarning[];
      /** Honest self-label naming the adapter that produced this response. */
      readonly source: string;
    }
  | {
      readonly ok: false;
      /** The typed failure (closed code vocabulary: rejected / transport-failed). */
      readonly failure: TypedNotificationFailure;
      readonly source: string;
    };

/**
 * The notification transport seam. `providerId` is the declared identity
 * of this transport binding (§30 provider ref — data, not vendor
 * specifics in code); real bindings resolve through the provider-contract
 * vocabulary at the composition root.
 */
export interface NotificationProviderPort {
  /** The provider identity of this declared transport binding (§30 provider ref). */
  readonly providerId: ProviderId;

  /**
   * Performs one outbound delivery attempt. Adapters are synchronous in
   * this wave (the disclosed double performs no I/O); async transports
   * are a composition-root adapter concern, not a contract change.
   */
  deliver(request: NotificationDeliveryRequest): NotificationProviderResponse;
}
