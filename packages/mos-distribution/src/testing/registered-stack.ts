/**
 * Shared SOCIAL-001 test arrangement: one fully-registered fictional
 * distribution stack — the integrations four-layer binding
 * (definition → implementation → instance) through the REAL registries,
 * one social channel over it (fully-supported matrix), a rights context
 * covering ACTOR_ONE for distribute+analyze over the fixture artifact
 * and the channel account, and a permitting policy rule — the standard
 * fixture most test batteries extend.
 *
 * FICTIONAL DATA ONLY (see fixtures.ts): aurora-social is not a real
 * provider; the platform-said payloads are the disclosed transport
 * double's scripted routes.
 */

import type { Timestamp } from "@mos/contracts";
import type { MerchantClientInstance } from "@mos/integrations";
import type { ProviderDefinition } from "@mos/integrations";
import type { ProviderImplementation } from "@mos/integrations";
import type { CredentialRef, RightsContextRef } from "@mos/integrations";
import type { SocialChannel } from "../contracts/social-channel.js";
import type { SocialProviderCapability } from "../contracts/social-operation.js";
import type { InMemorySocialTransportRoute } from "../adapters/in-memory-social-transport.js";
import type { SocialRightsEvaluator } from "../adapters/in-memory-social-rights-gate.js";
import type { InMemoryPolicyRule } from "../adapters/in-memory-social-policy-gate.js";
import type { ComposedDistributionStack } from "./compose-distribution-stack.js";
import type { SocialTransportPort } from "../ports/social-transport.port.js";

import { composeDistributionStack } from "./compose-distribution-stack.js";
import {
  ACTOR_ONE,
  AURORA_DEFINITION_INPUT,
  AURORA_EXTERNAL_ACCOUNT,
  AURORA_PROVIDER_ID,
  EVIDENCE_HEALTH_CHECK,
  FIXTURE_ARTIFACT,
  FULLY_SUPPORTED_MATRIX,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  TENANT_ALPHA,
  channelInput,
  permitRule,
  socialRightsGrantFixture,
  STANDARD_TRANSPORT_ROUTES,
} from "./fixtures.js";

/** Options forwarded to {@link composeDistributionStack}. */
export interface RegisteredStackOptions {
  readonly now?: () => string;
  readonly transportRoutes?: Readonly<Record<string, InMemorySocialTransportRoute>>;
  readonly rightsEvaluator?: SocialRightsEvaluator;
  readonly policyRules?: readonly InMemoryPolicyRule[];
  /** Overrides the composed transport (test instrumentation — e.g. send counting). */
  readonly transport?: SocialTransportPort;
}

/** The registered arrangement (all records fictional DATA). */
export interface RegisteredStack {
  readonly stack: ComposedDistributionStack;
  /** The integrations layer-1 definition (fictional Aurora Social). */
  readonly definition: ProviderDefinition;
  /** The integrations layer-2 implementation (status available, evidence-backed). */
  readonly implementation: ProviderImplementation;
  /** The integrations layer-3 instance (credential HANDLE only). */
  readonly instance: MerchantClientInstance;
  /** The social channel bound to the instance (fully-supported matrix). */
  readonly channel: SocialChannel;
  /** Rights context covering ACTOR_ONE / distribute+analyze / artifact + channel account. */
  readonly rightsContextRef: RightsContextRef;
}

/**
 * Composes the stack and registers the standard Aurora arrangement:
 * definition v1 → implementation v1 (available, evidence-backed) →
 * secret escrow declaration → instance (merchant-one, external account)
 * → channel "aurora-main" (fully-supported matrix, instanceRef binding)
 * → rights context for ACTOR_ONE → permitting policy rule.
 */
export function registeredAuroraStack(options: RegisteredStackOptions = {}): RegisteredStack {
  const stack = composeDistributionStack({
    now: options.now,
    transportRoutes: options.transportRoutes ?? STANDARD_TRANSPORT_ROUTES,
    rightsEvaluator: options.rightsEvaluator,
    policyRules: options.policyRules ?? [permitRule(SCOPE_ALPHA)],
    transport: options.transport,
  });

  const definition = stack.integrations.definitions.register(AURORA_DEFINITION_INPUT);
  const implementation = stack.integrations.implementations.register({
    scope: SCOPE_ALPHA,
    definitionId: definition.id,
    definitionVersion: definition.version,
    label: "primary",
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
    evidenceModel: { shape: "provider-evidence-v1" },
    errorModel: { shape: "provider-errors-v1" },
    rateLimitObservation: {
      observedAt: "2026-01-01T00:00:00.000Z" as Timestamp,
      requestsPerWindow: 600,
      windowMs: 600_000,
    },
  });
  const credentialRef: CredentialRef = stack.integrations.secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "aurora oauth2 escrow",
    kind: "oauth2-refresh-token",
  });
  const instance = stack.integrations.instances.register({
    scope: SCOPE_ALPHA,
    name: "aurora-main",
    merchantIdentity: MERCHANT_ONE,
    externalAccount: AURORA_EXTERNAL_ACCOUNT,
    implementationId: implementation.id,
    implementationVersion: implementation.version,
    credentialRef,
  });
  const channel = stack.channels.register(
    channelInput(instance.id, FULLY_SUPPORTED_MATRIX, {
      externalAccount: AURORA_EXTERNAL_ACCOUNT,
    }),
  );
  const rightsContextRef = stack.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:aurora-distribution",
        tenantId: TENANT_ALPHA,
        grantee: ACTOR_ONE,
        actions: ["distribute", "analyze"],
        subjectRefs: [
          `artifact:${FIXTURE_ARTIFACT.artifactId as string}`,
          AURORA_EXTERNAL_ACCOUNT as string,
        ],
      }),
    ],
  });

  return { stack, definition, implementation, instance, channel, rightsContextRef };
}

/** A publish-request skeleton over the registered arrangement. */
export function standardPublishRequest(
  registered: RegisteredStack,
  overrides: {
    readonly channelRef?: SocialChannel["id"];
    readonly rightsContextRef?: RightsContextRef;
    readonly artifact?: typeof FIXTURE_ARTIFACT;
    readonly scope?: typeof SCOPE_ALPHA;
    readonly actor?: typeof ACTOR_ONE;
  } = {},
): Parameters<ComposedDistributionStack["adapter"]["publish"]>[0] {
  return {
    scope: overrides.scope ?? SCOPE_ALPHA,
    channelRef: overrides.channelRef ?? registered.channel.id,
    actor: overrides.actor ?? ACTOR_ONE,
    rightsContextRef: overrides.rightsContextRef ?? registered.rightsContextRef,
    artifact: overrides.artifact ?? FIXTURE_ARTIFACT,
    presentation: { kind: "artifact-with-caption", caption: "fixture caption (fictional)" },
  };
}

/** Registers a SECOND channel over the registered instance with a custom matrix. */
export function registerChannelWithMatrix(
  registered: RegisteredStack,
  matrix: readonly SocialProviderCapability[],
  name: string,
  providerId: SocialChannel["providerId"] = AURORA_PROVIDER_ID,
): SocialChannel {
  // The fixture channels share the registered instance's EXTERNAL ACCOUNT
  // boundary (they are the same fictional merchant presence), so the
  // channel-subject derivation (socialChannelSubject) resolves to the
  // account the standard rights context already covers.
  return registered.stack.channels.register(
    channelInput(registered.instance.id, matrix, {
      name,
      providerId,
      externalAccount: AURORA_EXTERNAL_ACCOUNT,
    }),
  );
}
