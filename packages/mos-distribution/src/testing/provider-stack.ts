/**
 * Provider-parameterized registered distribution stack (SOCIAL-002..006
 * test arrangement — the shared, PROVIDER-NEUTRAL twin of the W6-C
 * registered-stack seam).
 *
 * Composes the full REAL-for-contract-testing distribution stack (the REAL
 * `@mos/integrations` four-layer binding, the REAL injected `evaluateRights`
 * rule, the disclosed policy-gate double — see compose-distribution-stack)
 * with a caller-supplied PROVIDER TRANSPORT BINDING and a caller-supplied
 * PROVIDER PROFILE: the profile's providerId/auth model drive the
 * integrations definition, the profile's capability matrix drives the
 * channel registration, and the binding is the composed transport seam.
 *
 * This helper carries NO provider names — the profile and binding arrive
 * as parameters (the five real profiles live inside their isolated
 * subtrees; fictional profiles exercise the shared machinery). The
 * arrangement registers rights contexts covering the three neutral
 * fixture artifacts (video/image/text families) plus the channel's
 * external account for distribute+analyze, and a permitting policy rule.
 */

import type { AccountRef, EvidenceRef, Timestamp } from "@mos/contracts";
import type { MerchantClientInstance } from "@mos/integrations";
import type { ProviderDefinition } from "@mos/integrations";
import type { ProviderImplementation } from "@mos/integrations";
import type { CredentialRef, RightsContextRef } from "@mos/integrations";
import type { ArtifactRef } from "@mos/content";
import type { SocialChannel } from "../contracts/social-channel.js";
import type { SocialProviderProfile } from "../contracts/provider-profile.js";
import type { InMemoryPolicyRule } from "../adapters/in-memory-social-policy-gate.js";
import type { ComposedDistributionStack } from "./compose-distribution-stack.js";
import type { SocialTransportPort } from "../ports/social-transport.port.js";

import { composeDistributionStack } from "./compose-distribution-stack.js";
import {
  ACTOR_ONE,
  FIXTURE_ARTIFACT,
  IMAGE_ARTIFACT,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  SCOPE_BETA,
  TENANT_ALPHA,
  TENANT_BETA,
  TEXT_ARTIFACT,
  permitRule,
  socialRightsGrantFixture,
} from "./fixtures.js";

/** Options for {@link registeredProviderStack}. */
export interface ProviderStackOptions {
  /** The provider profile (validated at binding construction). */
  readonly profile: SocialProviderProfile;
  /** The provider transport binding (the composed transport seam). */
  readonly transport: SocialTransportPort;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** Initial policy rules of the disclosed double (default: one permitting rule). */
  readonly policyRules?: readonly InMemoryPolicyRule[];
  /** The external account boundary (default: a neutral fixture account). */
  readonly externalAccount?: AccountRef;
}

/** The registered provider arrangement (channel + rights + the composed stack). */
export interface RegisteredProviderStack {
  readonly stack: ComposedDistributionStack;
  /** The provider profile the arrangement was registered from (DATA). */
  readonly profile: SocialProviderProfile;
  /** The integrations layer-1 definition registered from the profile. */
  readonly definition: ProviderDefinition;
  /** The integrations layer-2 implementation (status available, evidence-backed). */
  readonly implementation: ProviderImplementation;
  /** The integrations layer-3 instance (credential HANDLE only). */
  readonly instance: MerchantClientInstance;
  /** The social channel registered with the profile's capability matrix. */
  readonly channel: SocialChannel;
  /** Rights context covering the three fixture artifacts + the external account. */
  readonly rightsContextRef: RightsContextRef;
  /** The three neutral fixture artifacts (video / image / text type families). */
  readonly artifacts: {
    readonly video: ArtifactRef;
    readonly image: ArtifactRef;
    readonly text: ArtifactRef;
  };
}

/** A neutral external account boundary for the registered instance (fixture data). */
export const PROVIDER_STACK_EXTERNAL_ACCOUNT = "account:provider-stack-fixture" as AccountRef;

/** Neutral evidence ref for the fixture implementation's positive status. */
export const PROVIDER_STACK_EVIDENCE = "evidence:provider-stack-health-check" as EvidenceRef;

/**
 * Composes the full distribution stack with the caller's provider binding
 * and registers the standard provider arrangement: definition v1 (from the
 * profile's providerId + auth model) → implementation v1 (available,
 * evidence-backed) → secret escrow declaration (kind from the auth model)
 * → instance (external account) → channel carrying the PROFILE's capability
 * matrix → rights context covering the three fixture artifacts + the
 * external account → permitting policy rule.
 */
export function registeredProviderStack(options: ProviderStackOptions): RegisteredProviderStack {
  const now = options.now;
  const externalAccount = options.externalAccount ?? PROVIDER_STACK_EXTERNAL_ACCOUNT;
  const stack = composeDistributionStack({
    now,
    policyRules: options.policyRules ?? [permitRule(SCOPE_ALPHA)],
    transport: options.transport,
  });

  const definition = stack.integrations.definitions.register({
    scope: SCOPE_ALPHA,
    providerId: options.profile.providerId,
    displayName: options.profile.displayName,
    kind: "social-platform",
    transport: {
      transportKind: "http-rest",
      authentication: options.profile.auth.model,
      invocationContract: { type: "object", required: ["operation", "parameters"] },
    },
    declaredCapabilities: [],
  });
  const implementation = stack.integrations.implementations.register({
    scope: SCOPE_ALPHA,
    definitionId: definition.id,
    definitionVersion: definition.version,
    label: "primary",
    status: "available",
    evidenceRefs: [PROVIDER_STACK_EVIDENCE],
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
    displayName: `${options.profile.displayName} escrow (fixture)`,
    kind: "oauth2-refresh-token",
  });
  const instance = stack.integrations.instances.register({
    scope: SCOPE_ALPHA,
    name: "provider-main",
    merchantIdentity: MERCHANT_ONE,
    externalAccount,
    implementationId: implementation.id,
    implementationVersion: implementation.version,
    credentialRef,
  });
  const channel = stack.channels.register({
    scope: SCOPE_ALPHA,
    name: "provider-main",
    providerId: options.profile.providerId,
    displayName: options.profile.displayName,
    instanceRef: instance.id,
    externalAccount,
    capabilityMatrix: options.profile.capabilityMatrix,
  });
  const rightsContextRef = stack.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:provider-stack-distribution",
        tenantId: TENANT_ALPHA,
        grantee: ACTOR_ONE,
        actions: ["distribute", "analyze"],
        subjectRefs: [
          `artifact:${FIXTURE_ARTIFACT.artifactId as string}`,
          `artifact:${IMAGE_ARTIFACT.artifactId as string}`,
          `artifact:${TEXT_ARTIFACT.artifactId as string}`,
          externalAccount as string,
        ],
      }),
    ],
  });

  return {
    stack,
    profile: options.profile,
    definition,
    implementation,
    instance,
    channel,
    rightsContextRef,
    artifacts: { video: FIXTURE_ARTIFACT, image: IMAGE_ARTIFACT, text: TEXT_ARTIFACT },
  };
}

// ---------------------------------------------------------------------------
// The second-tenant arrangement (the shared tenant-scoping probe)
// ---------------------------------------------------------------------------

/** A second-tenant channel + rights arrangement (the §31 isolation probe). */
export interface SecondTenantRegistration {
  /** The beta-tenant channel carrying the profile's capability matrix. */
  readonly channel: SocialChannel;
  /** Rights context covering the beta artifact + the beta external account. */
  readonly rightsContextRef: RightsContextRef;
  /** The beta-tenant artifact ref (a tenant-scoped copy of the base family artifact). */
  readonly artifact: ArtifactRef;
}

/**
 * Registers the SAME provider in a SECOND tenant (SCOPE_BETA) over the
 * same composed stack: definition v1 → implementation v1 (available,
 * evidence-backed) → secret escrow declaration → instance (external
 * account) → channel with the profile's matrix → permitting policy rule →
 * rights context covering the beta artifact + the beta external account.
 * The per-provider batteries use this to pin tenant scoping (§31): logs
 * never cross tenants, and a foreign tenant's channel id is
 * indistinguishable from unknown.
 */
export function registerSecondTenant(
  registered: RegisteredProviderStack,
  options: {
    /** Which family artifact registers in the second tenant (default: video). */
    readonly artifactFamily?: "video" | "image" | "text";
  } = {},
): SecondTenantRegistration {
  const family = options.artifactFamily ?? "video";
  const base = registered.artifacts[family];
  const betaArtifact = Object.freeze({
    ...base,
    tenantId: TENANT_BETA,
    artifactId: `${base.artifactId as string}-beta` as ArtifactRef["artifactId"],
    storageRef: `${base.storageRef as string}-beta` as ArtifactRef["storageRef"],
  });
  const externalAccount = "account:provider-stack-beta-fixture" as AccountRef;
  registered.stack.registerPolicyRule(permitRule(SCOPE_BETA));

  const betaDefinition = registered.stack.integrations.definitions.register({
    scope: SCOPE_BETA,
    providerId: registered.profile.providerId,
    displayName: `${registered.profile.displayName} (beta fixture)`,
    kind: "social-platform",
    transport: {
      transportKind: "http-rest",
      authentication: registered.profile.auth.model,
      invocationContract: { type: "object", required: ["operation", "parameters"] },
    },
    declaredCapabilities: [],
  });
  const betaImplementation = registered.stack.integrations.implementations.register({
    scope: SCOPE_BETA,
    definitionId: betaDefinition.id,
    definitionVersion: betaDefinition.version,
    label: "primary",
    status: "available",
    evidenceRefs: ["evidence:provider-stack-beta-health-check" as EvidenceRef],
    evidenceModel: { shape: "provider-evidence-v1" },
    errorModel: { shape: "provider-errors-v1" },
    rateLimitObservation: {
      observedAt: "2026-01-01T00:00:00.000Z" as Timestamp,
      requestsPerWindow: 600,
      windowMs: 600_000,
    },
  });
  const betaCredential = registered.stack.integrations.secrets.declare({
    scope: SCOPE_BETA,
    displayName: `${registered.profile.displayName} beta escrow (fixture)`,
    kind: "oauth2-refresh-token",
  });
  const betaInstance = registered.stack.integrations.instances.register({
    scope: SCOPE_BETA,
    name: "provider-beta",
    merchantIdentity: MERCHANT_ONE,
    externalAccount,
    implementationId: betaImplementation.id,
    implementationVersion: betaImplementation.version,
    credentialRef: betaCredential,
  });
  const betaChannel = registered.stack.channels.register({
    scope: SCOPE_BETA,
    name: "provider-beta",
    providerId: registered.profile.providerId,
    displayName: `${registered.profile.displayName} (beta fixture)`,
    instanceRef: betaInstance.id,
    externalAccount,
    capabilityMatrix: registered.profile.capabilityMatrix,
  });
  const betaRights = registered.stack.registerRightsContext({
    scope: SCOPE_BETA,
    grants: [
      socialRightsGrantFixture({
        grantId: "grant:provider-stack-beta",
        tenantId: TENANT_BETA,
        grantee: ACTOR_ONE,
        actions: ["distribute", "analyze"],
        subjectRefs: [`artifact:${betaArtifact.artifactId as string}`, externalAccount as string],
      }),
    ],
  });

  return { channel: betaChannel, rightsContextRef: betaRights, artifact: betaArtifact };
}

/** A publish-request skeleton over the registered provider arrangement. */
export function providerPublishRequest(
  registered: RegisteredProviderStack,
  overrides: {
    readonly artifact?: ArtifactRef;
    readonly presentationKind?: "single-artifact" | "artifact-with-caption" | "link-preview" | "text-only";
    readonly idempotencyKey?: string;
    readonly rightsContextRef?: RightsContextRef;
  } = {},
): Parameters<ComposedDistributionStack["adapter"]["publish"]>[0] {
  return {
    scope: registered.channel.scope,
    channelRef: registered.channel.id,
    actor: ACTOR_ONE,
    rightsContextRef: overrides.rightsContextRef ?? registered.rightsContextRef,
    ...(overrides.idempotencyKey !== undefined ? { idempotencyKey: overrides.idempotencyKey } : {}),
    artifact: overrides.artifact ?? registered.artifacts.video,
    presentation: { kind: overrides.presentationKind ?? "artifact-with-caption" },
  };
}
