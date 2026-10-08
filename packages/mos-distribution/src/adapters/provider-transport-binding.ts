/**
 * Provider transport binding (SOCIAL-002..006) — the SHARED, provider-neutral
 * machinery every per-provider adapter subtree instantiates with ITS profile
 * DATA as its transport binding to the {@link SocialTransportPort} seam.
 *
 * DISCLOSED DOUBLE: this binding performs NO I/O. The provider interaction
 * delegates to the W6-C disclosed in-memory transport double over
 * caller-supplied (test/composition) route tables; every response the
 * binding returns carries the binding's OWN self-label
 * (`<providerId>-transport-double`) so double output can never masquerade
 * as live platform evidence (AGENTS.md Verification). Real network
 * transport is composition-root future work at the same seam.
 *
 * The binding's pipeline (each refusal is typed, self-labeled, and happens
 * BEFORE any provider operation is recorded):
 * 1. COMPOSITION ISOLATION — a request addressed to another providerId is
 *    a typed `provider-adapter-mismatch` refusal (a per-provider binding
 *    never serves a foreign provider's channel — the structural isolation
 *    pin's behavioral twin);
 * 2. ADAPTER CAPABILITY DECLARATION — the profile's own matrix
 *    (adapter-level fail-closed: declared unsupported → typed refusal;
 *    declared unknown → its OWN preserved outcome; defense in depth over
 *    the channel's registered matrix);
 * 3. OPERATION SHAPES — the profile's declared shapes for the request's
 *    artifact type family × presentation kind (outside the declared
 *    shapes → typed `operation-shape-unsupported` refusal);
 * 4. IDEMPOTENCY/REPLAY — a request carrying an idempotency key names ONE
 *    logical provider operation: the same key with the same logical
 *    parameters REPLAYS the recorded provider answer (ONE provider
 *    operation recorded for any number of retries — replay-safe, with an
 *    `idempotent-replay` warning); the same key with different parameters
 *    is a typed `idempotency-key-conflict` refusal, never a silent second
 *    operation;
 * 5. PROVIDER OPERATION — the delegated double interaction, recorded in
 *    the binding's provider-operation log (the evidence of what a real
 *    adapter would have sent over the network);
 * 6. RATE-LIMIT POSTURE — a DECLAREDLY simulated posture (when configured)
 *    rides every ok response's output as the `rateLimit` observation the
 *    adapter runtime types into an immutable §30-style record — observed
 *    data with observedAt + provider refs, never invented numbers, and
 *    self-labeled so simulated postures can never masquerade as live
 *    platform evidence.
 *
 * DETERMINISM: `send` is a pure function of (request, profile, routes,
 * simulated posture, replay state) — no randomness, no clock reads (the
 * clock is injectable), no ambient state.
 *
 * Internal machinery (not exported from the package index — the per-provider
 * subtree factories are the composition surface).
 */

import type { JsonObject, TenantScope, Timestamp } from "@mos/contracts";

import type { SocialDistributionFailure } from "../contracts/distribution-record.js";
import type { SocialOperation } from "../contracts/social-operation.js";
import type {
  SocialProviderProfile,
} from "../contracts/provider-profile.js";
import type {
  SocialRateLimitPosture,
} from "../contracts/social-rate-limit.js";
import type { SocialChannelId, SocialDistributionId } from "../contracts/ids.js";
import type {
  SocialTransportPort,
  SocialTransportRequest,
  SocialTransportResponse,
} from "../ports/social-transport.port.js";
import { createInMemorySocialTransportDouble } from "./in-memory-social-transport.js";
import type { InMemorySocialTransportRoute } from "./in-memory-social-transport.js";
import {
  checkProviderOperationShapes,
  checkProviderOperationSupport,
  validateSocialProviderProfile,
} from "./provider-profile-validation.js";
import { deepFreeze, defaultNow } from "./registry-support.js";

// ---------------------------------------------------------------------------
// The provider-operation log (ONE record per provider interaction)
// ---------------------------------------------------------------------------

/**
 * ONE recorded PROVIDER OPERATION — what a real adapter would have sent to
 * the platform (the network-boundary evidence of the disclosed double).
 * Idempotent REPLAYS append NO record: the same logical operation retried
 * any number of times shows exactly ONE provider operation here.
 */
export interface ProviderOperationRecord {
  /** The §30 request id of the attempt that triggered the provider operation. */
  readonly requestId: SocialDistributionId;
  /** Tenant/workspace scope (§31). */
  readonly scope: TenantScope;
  /** The channel the provider operation acted through. */
  readonly channelRef: SocialChannelId;
  /** Which social operation was exercised at the provider. */
  readonly operation: SocialOperation;
  /** The idempotency key that named the logical operation (null when the caller carried none). */
  readonly idempotencyKey: string | null;
  /** When the provider operation occurred (injectable clock — §30-observable). */
  readonly occurredAt: Timestamp;
}

// ---------------------------------------------------------------------------
// The DECLAREDLY simulated rate-limit posture (test/composition DATA)
// ---------------------------------------------------------------------------

/**
 * A DECLAREDLY SIMULATED rate-limit posture the double observes and
 * reports on its ok responses (test/composition DATA — self-labeled
 * through the record's source so it can never masquerade as live platform
 * evidence). The `observed` payload is what the double observed: its
 * fictional numbers are the double's own, never presented as the platform's.
 */
export interface SimulatedRateLimitPosture {
  /** The observed posture (closed vocabulary — a posture, never a verdict). */
  readonly posture: SocialRateLimitPosture;
  /** When the double says the posture was observed. */
  readonly observedAt: Timestamp;
  /** The observed payload VERBATIM (fictional double data, self-labeled). */
  readonly observed: JsonObject;
  /** The fictional provider references for the reported posture. */
  readonly providerRefs: readonly string[];
}

/** Options for {@link createProviderTransportBinding}. */
export interface ProviderTransportBindingOptions {
  /** The provider profile (validated fail-closed at construction). */
  readonly profile: SocialProviderProfile;
  /** Scripted platform-said routes for the delegated double (DATA). */
  readonly routes?: Readonly<Record<string, InMemorySocialTransportRoute>>;
  /** The DECLAREDLY simulated rate-limit posture riding ok responses (DATA). */
  readonly simulatedRateLimit?: SimulatedRateLimitPosture;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
}

/** A provider transport binding: the seam implementation + its evidence surface. */
export interface ProviderTransportBinding extends SocialTransportPort {
  /** The honest self-label every response of this binding carries. */
  readonly source: string;
  /**
   * The provider-operation log — ONE record per provider interaction
   * (idempotent replays and pre-interaction refusals append none).
   */
  providerOperations(): readonly ProviderOperationRecord[];
}

const REPLAY_WARNING_CODE = "idempotent-replay";

/** Creates a provider transport binding over the disclosed double. */
export function createProviderTransportBinding(
  options: ProviderTransportBindingOptions,
): ProviderTransportBinding {
  const profile = validateSocialProviderProfile(options.profile);
  const double = createInMemorySocialTransportDouble({ routes: options.routes });
  const now = options.now ?? defaultNow;
  const source = `${profile.providerId as string}-transport-double`;

  const operations: ProviderOperationRecord[] = [];
  /** idempotencyKey → the recorded provider answer + the logical digest it is bound to. */
  const replayLedger = new Map<
    string,
    { readonly digest: string; readonly response: SocialTransportResponse }
  >();

  function refusal(failure: SocialDistributionFailure): SocialTransportResponse {
    return { ok: false, failure, source };
  }

  /** The digest of one logical operation: its kind + its control-plane parameters. */
  function digestOf(request: SocialTransportRequest): string {
    return JSON.stringify({ operation: request.operation, parameters: request.parameters });
  }

  // W9-B: the replay-ledger key is a JSON array key (injective over the
  // string tuple). The old `|`-delimited concatenation was injectable —
  // hostile tenant/channel/key ids containing `|` could alias ANOTHER
  // tenant's ledger entry, replaying a foreign tenant's provider answer
  // or evicting its idempotency binding (W3-A hostile-id class).
  const ledgerKeyOf = (
    tenantId: string,
    channelRef: string,
    operation: SocialOperation,
    key: string,
  ): string => JSON.stringify([tenantId, channelRef, operation, key]);

  const binding: ProviderTransportBinding = {
    source,

    send(request: SocialTransportRequest): SocialTransportResponse {
      // 1. COMPOSITION ISOLATION: this binding serves ITS provider only —
      // a request addressed to any other providerId is a typed refusal
      // (never a cross-provider interaction).
      if ((request.providerId as string) !== (profile.providerId as string)) {
        return refusal({
          code: "provider-adapter-mismatch",
          message:
            "the transport binding was asked to serve another provider's request — provider adapter subtrees are isolated",
          retriable: false,
          details: {
            expectedProviderId: profile.providerId as string,
            requestedProviderId: request.providerId as string,
          },
        });
      }

      // 2. ADAPTER CAPABILITY DECLARATION (adapter-level fail-closed).
      const support = checkProviderOperationSupport(profile, request.operation);
      if (!support.ok) {
        return refusal(support.refusal);
      }

      // 3. OPERATION SHAPES — provider-specific parameters validated inside
      // the subtree (against the profile DATA) BEFORE any provider interaction.
      const parameters = request.parameters as { readonly artifact?: { readonly type?: unknown }; readonly presentation?: { readonly kind?: unknown } };
      const shapes = checkProviderOperationShapes(
        profile,
        request.operation,
        parameters?.artifact?.type,
        parameters?.presentation?.kind,
      );
      if (!shapes.ok) {
        return refusal(shapes.refusal);
      }

      // 4. IDEMPOTENCY/REPLAY: a carried key names ONE logical provider operation.
      const key = request.idempotencyKey ?? null;
      if (key !== null) {
        const ledgerKey = ledgerKeyOf(request.scope.tenantId as string, request.channelRef as string, request.operation, key);
        const prior = replayLedger.get(ledgerKey);
        if (prior !== undefined) {
          if (prior.digest !== digestOf(request)) {
            return refusal({
              code: "idempotency-key-conflict",
              message:
                "the idempotency key is already bound to a different logical operation — retrying with changed parameters is a typed refusal, never a silent second provider operation",
              retriable: false,
              details: { operation: request.operation, idempotencyKey: key },
            });
          }
          // REPLAY: the recorded provider answer again, with the replay
          // warning — NO new provider operation is recorded.
          if (prior.response.ok) {
            return {
              ok: true,
              output: prior.response.output,
              warnings: [
                ...prior.response.warnings,
                {
                  code: REPLAY_WARNING_CODE,
                  message: "idempotent replay — the recorded provider answer for this logical operation, no new provider operation",
                },
              ],
              source,
            };
          }
          return { ok: false, failure: prior.response.failure, source };
        }
      }

      // 5. PROVIDER OPERATION through the disclosed double — recorded in
      // the provider-operation log (what a real adapter would have sent).
      const delegateResponse = double.send(request);
      let response: SocialTransportResponse;
      if (delegateResponse.ok && options.simulatedRateLimit !== undefined) {
        // 6. DECLAREDLY simulated rate-limit posture rides the ok payload.
        const simulated = options.simulatedRateLimit;
        response = {
          ok: true,
          output: {
            ...delegateResponse.output,
            rateLimit: deepFreeze({
              posture: simulated.posture,
              observedAt: simulated.observedAt,
              observed: simulated.observed,
              providerRefs: Object.freeze([...simulated.providerRefs]),
            }),
          },
          warnings: [...delegateResponse.warnings],
          source,
        };
      } else {
        response = delegateResponse.ok
          ? { ok: true, output: delegateResponse.output, warnings: [...delegateResponse.warnings], source }
          : { ok: false, failure: delegateResponse.failure, source };
      }

      operations.push(
        // W9-B: clone-then-freeze — the caller's request.scope object is
        // neither aliased by the stored record nor frozen in place.
        deepFreeze(structuredClone({
          requestId: request.requestId,
          scope: request.scope,
          channelRef: request.channelRef,
          operation: request.operation,
          idempotencyKey: key,
          occurredAt: now() as Timestamp,
        })),
      );
      if (key !== null) {
        const ledgerKey = ledgerKeyOf(request.scope.tenantId as string, request.channelRef as string, request.operation, key);
        replayLedger.set(ledgerKey, { digest: digestOf(request), response });
      }
      return response;
    },

    providerOperations(): readonly ProviderOperationRecord[] {
      return [...operations];
    },
  };

  return binding;
}
