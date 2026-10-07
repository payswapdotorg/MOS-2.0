/**
 * Shared INTEG-001 test arrangement: one fully-registered fictional
 * four-layer stack (definition → implementation → instance → availability
 * capabilities) plus a rights context that covers ONE actor/action/subject
 * — the standard fixture most test batteries extend.
 *
 * FICTIONAL DATA ONLY (see fixtures.ts): aurora-social is not a real
 * provider; capability ids are the REAL @mos/capabilities §5 seed
 * vocabulary so refs resolve through the real registry.
 */

import type { Version } from "@mos/contracts";

import { composeIntegrationsStack } from "./compose-integrations-stack.js";
import type { ComposedIntegrationsStack } from "./compose-integrations-stack.js";
import type { InMemoryTransportRoute } from "../adapters/in-memory-provider-transport.js";
import type { RightsEvaluator } from "../adapters/in-memory-provider-rights-gate.js";
import type { AvailabilityCapability } from "../contracts/availability-capability.js";
import type { MerchantClientInstance } from "../contracts/merchant-client-instance.js";
import type { ProviderDefinition } from "../contracts/provider-definition.js";
import type { ProviderImplementation } from "../contracts/provider-implementation.js";
import type { CredentialRef, RightsContextRef } from "../contracts/ids.js";
import {
  ACTOR_ONE,
  AURORA_DEFINITION_INPUT,
  AURORA_EXTERNAL_ACCOUNT,
  EVIDENCE_HEALTH_CHECK,
  MERCHANT_ONE,
  SCOPE_ALPHA,
  TENANT_ALPHA,
  auroraImplementationInput,
  generateVoiceAvailabilityInput,
  rightsGrantFixture,
  transcribeAvailabilityInput,
} from "./fixtures.js";

/** Options forwarded to {@link composeIntegrationsStack}. */
export interface RegisteredStackOptions {
  readonly now?: () => string;
  readonly transportRoutes?: Readonly<Record<string, InMemoryTransportRoute>>;
  readonly rightsEvaluator?: RightsEvaluator;
}

/** The registered arrangement (all records fictional DATA). */
export interface RegisteredStack {
  readonly stack: ComposedIntegrationsStack;
  readonly definition: ProviderDefinition;
  /** Implementation v1 — status `unknown`, NO evidence yet. */
  readonly implementationUnknown: ProviderImplementation;
  /** Implementation v2 — status `available` after the evidence-backed correction. */
  readonly implementationAvailable: ProviderImplementation;
  readonly credentialRef: CredentialRef;
  /** The instance, bound to the AVAILABLE implementation version. */
  readonly instance: MerchantClientInstance;
  readonly transcribeAvailability: AvailabilityCapability;
  readonly voiceAvailability: AvailabilityCapability;
  /** Rights context covering ACTOR_ONE / action "use" / the Aurora account. */
  readonly rightsContextRef: RightsContextRef;
}

/**
 * Composes the stack and registers the standard Aurora arrangement:
 * definition v1 → implementation v1 (unknown) → corrected v2 (available,
 * evidence-backed) → instance bound to v2 → transcribe_audio + generate_voice
 * availability → rights context for ACTOR_ONE over the Aurora account.
 */
export function registeredAuroraStack(options: RegisteredStackOptions = {}): RegisteredStack {
  const stack = composeIntegrationsStack({
    now: options.now,
    transportRoutes: options.transportRoutes,
    rightsEvaluator: options.rightsEvaluator,
  });

  const definition = stack.definitions.register(AURORA_DEFINITION_INPUT);
  const implementationUnknown = stack.implementations.register(
    auroraImplementationInput(definition.id),
  );
  const implementationAvailable = stack.implementations.recordStatusCorrection({
    scope: SCOPE_ALPHA,
    implementationId: implementationUnknown.id,
    status: "available",
    evidenceRefs: [EVIDENCE_HEALTH_CHECK],
  });
  const credentialRef = stack.secrets.declare({
    scope: SCOPE_ALPHA,
    displayName: "aurora oauth2 escrow",
    kind: "oauth2-refresh-token",
  });
  const instance = stack.instances.register({
    scope: SCOPE_ALPHA,
    name: "aurora-main",
    merchantIdentity: MERCHANT_ONE,
    externalAccount: AURORA_EXTERNAL_ACCOUNT,
    implementationId: implementationAvailable.id,
    implementationVersion: implementationAvailable.version,
    credentialRef,
  });
  const transcribeAvailability = stack.availability.register(
    transcribeAvailabilityInput(implementationAvailable.id),
  );
  const voiceAvailability = stack.availability.register(
    generateVoiceAvailabilityInput(implementationAvailable.id),
  );
  const rightsContextRef = stack.registerRightsContext({
    scope: SCOPE_ALPHA,
    grants: [
      rightsGrantFixture({
        grantId: "grant:aurora-main",
        tenantId: TENANT_ALPHA,
        grantee: ACTOR_ONE,
        action: "use",
        subjectRef: AURORA_EXTERNAL_ACCOUNT as string,
      }),
    ],
  });

  return {
    stack,
    definition,
    implementationUnknown,
    implementationAvailable,
    credentialRef,
    instance,
    transcribeAvailability,
    voiceAvailability,
    rightsContextRef,
  };
}

/** The standard invoke-request skeleton over the registered arrangement. */
export function standardInvokeRequest(
  registered: RegisteredStack,
  overrides: {
    readonly capabilityVersion?: Version;
    readonly rightsContextRef?: RightsContextRef;
    readonly rightsAction?: "use" | "transform" | "distribute" | "derive" | "analyze";
    readonly parameters?: Readonly<Record<string, unknown>>;
    readonly scope?: typeof SCOPE_ALPHA;
  } = {},
): Parameters<ComposedIntegrationsStack["interactions"]["invoke"]>[0] {
  return {
    scope: overrides.scope ?? SCOPE_ALPHA,
    instanceId: registered.instance.id,
    capabilityId: registered.transcribeAvailability.capabilityId,
    capabilityVersion: overrides.capabilityVersion ?? registered.transcribeAvailability.capabilityVersion,
    actor: ACTOR_ONE,
    rightsContextRef: overrides.rightsContextRef ?? registered.rightsContextRef,
    rightsAction: overrides.rightsAction ?? "use",
    parameters: overrides.parameters ?? { audio: "storage:fixture-audio-1" },
  };
}
