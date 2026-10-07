/**
 * Shared deterministic test fixtures for the notification plane tests
 * (NOTIFY-001).
 *
 * TEST FIXTURES ONLY: fixed injectable clocks (ISO + epoch ms), counting
 * id factories, valid notification submissions with reference-only
 * subjects, and a composed notification stack (store + disclosed
 * provider double + plane) with fully deterministic seams.
 */

import type {
  ArtifactRef,
  IdentityRef,
  ProviderId,
  Timestamp,
} from "@mos/contracts";

import type {
  NotificationKind,
  NotificationSubmission,
} from "../contracts/notification.js";
import type { NotificationDedupKey } from "../contracts/ids.js";
import type { NotificationDeliveryPort } from "../ports/notification-delivery.port.js";
import type { NotificationProviderPort } from "../ports/notification-provider.port.js";
import { createNotificationDeliveryPlane } from "../adapters/notification-delivery-plane.js";
import { createInMemoryNotificationStore } from "../adapters/in-memory-notification-store.js";
import {
  createInMemoryNotificationProviderDouble,
  type InMemoryNotificationRoute,
} from "../adapters/in-memory-notification-provider.js";
import { FIXED_CLOCK, TENANT_A, TENANT_B, SCOPE_A, SCOPE_B, createFakeClock, makeArtifactRef } from "./job-fixtures.js";

export { FIXED_CLOCK, TENANT_A, TENANT_B, SCOPE_A, SCOPE_B, createFakeClock, makeArtifactRef };

export const RECIPIENT_A = "identity:user-a" as IdentityRef;
export const RECIPIENT_B = "identity:user-b" as IdentityRef;

export const PROVIDER_ID = "provider:mos-notify-test" as ProviderId;

export const dedupKeyOf = (value: string): NotificationDedupKey => value as NotificationDedupKey;

/** Sequential ids: notification-1..., attempt-1..., receipt-1..., suppression-1... */
export function countingNotificationIds(): {
  notificationId: () => string;
  attemptId: () => string;
  receiptId: () => string;
  suppressionId: () => string;
} {
  let notificationCounter = 0;
  let attemptCounter = 0;
  let receiptCounter = 0;
  let suppressionCounter = 0;
  return {
    notificationId: () => `notification-${(notificationCounter += 1)}`,
    attemptId: () => `attempt-${(attemptCounter += 1)}`,
    receiptId: () => `receipt-${(receiptCounter += 1)}`,
    suppressionId: () => `suppression-${(suppressionCounter += 1)}`,
  };
}

/** One well-formed artifact ref in the fixture tenant (reused from jobs fixtures). */
function artifactRef(n: number): ArtifactRef {
  return makeArtifactRef(n, TENANT_A);
}

const SUBMITTER = { kind: "service", name: "studio-runtime" };

const BASE_SUBMISSION: Record<string, unknown> = {
  scope: SCOPE_A,
  dedupKey: "task-assignment-42",
  kind: "task-assignment",
  contractVersion: 1,
  submittedBy: SUBMITTER,
  recipient: RECIPIENT_A,
  subject: {
    artifactRefs: [artifactRef(1)],
    taskRefs: ["task:shoot-episode-42"],
    missionRefs: ["mission:reaction-pilot"],
  },
  retryPolicy: { maxAttempts: 1, backoffScheduleMs: [] },
};

/**
 * A valid notification submission with overrides (cast-once fixture
 * pattern). The base is DEEP-CLONED per call so tests that mutate their
 * submission (or delete fields to probe fail-closed validation) can
 * never bleed into later tests.
 */
export function makeNotificationSubmission(
  overrides: Record<string, unknown> = {},
): NotificationSubmission {
  return structuredClone({
    ...BASE_SUBMISSION,
    ...overrides,
  }) as unknown as NotificationSubmission;
}

/** A submission for a specific kind with a matching dedup key. */
export function makeKindSubmission(
  kind: NotificationKind,
  dedupKey: string,
): NotificationSubmission {
  return makeNotificationSubmission({ kind, dedupKey: dedupKeyOf(dedupKey) });
}

/** Options for the composed deterministic notification stack. */
export interface NotificationStackOptions {
  clock?: ReturnType<typeof createFakeClock>;
  /** Injectable ISO stamp clock (default: the fixed FIXED_CLOCK). */
  isoClock?: () => Timestamp;
  /** Scripted provider outcomes (DATA — see the provider double). */
  routes?: readonly InMemoryNotificationRoute[];
  providerId?: ProviderId;
}

export interface NotificationStack {
  readonly plane: NotificationDeliveryPort;
  readonly provider: NotificationProviderPort;
  readonly ids: ReturnType<typeof countingNotificationIds>;
  readonly clock: ReturnType<typeof createFakeClock>;
}

/**
 * The composed notification stack: in-memory store double + disclosed
 * provider double + the REAL plane adapter, all seams deterministic
 * (fixed ISO clock, controllable epoch clock, counting ids).
 */
export function makeNotificationStack(
  options: NotificationStackOptions = {},
): NotificationStack {
  const fake = options.clock ?? createFakeClock();
  const ids = countingNotificationIds();
  const provider = createInMemoryNotificationProviderDouble({
    providerId: options.providerId ?? PROVIDER_ID,
    routes: options.routes,
  });
  const plane = createNotificationDeliveryPlane({
    store: createInMemoryNotificationStore(),
    provider,
    clock: options.isoClock ?? FIXED_CLOCK,
    now: () => fake.now(),
    notificationIdFactory: ids.notificationId,
    attemptIdFactory: ids.attemptId,
    receiptIdFactory: ids.receiptId,
    suppressionIdFactory: ids.suppressionId,
  });
  return { plane, provider, ids, clock: fake };
}

