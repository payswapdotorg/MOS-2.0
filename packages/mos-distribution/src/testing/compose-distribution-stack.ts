/**
 * REAL distribution stack composed at the testing seam (SOCIAL-001).
 *
 * Composes this package's in-memory channel registry, rights gate, policy
 * gate, transport double and adapter runtime over:
 * - the REAL `@mos/integrations` registries (layer 1–3: definitions,
 *   implementations, secret store, instances) — the channel's
 *   `instanceRef` binding resolves through the ACTUAL integrations
 *   authority vocabulary (the registry-allowed real import);
 * - the REAL `evaluateRights` rule of `@mos/rights` — injected into the
 *   disclosed rights-gate double (the handle→grants resolution is the
 *   doubled part; the evaluation rule itself is real, never
 *   re-implemented — there is no second rights authority);
 * - the DISCLOSED in-memory policy gate double (the declared seam's
 *   stand-in — the policy package arrives in a later wave);
 * - the DISCLOSED in-memory transport double (no network, deterministic,
 *   self-labelling).
 *
 * RUNTIME IMPORT DISCLOSURE (the W2-C/W5-C precedent): `@mos/rights` and
 * `@mos/integrations` point their runtime exports at built artifacts
 * (`dist/index.js`) which plain Node ESM executes after `tsc -b` (project
 * references guarantee the build order). `@mos/rights`'s package exports
 * map actually resolves the bare specifier to untranspiled `src/index.ts`
 * in some waves, so this seam imports BOTH packages' BUILT PUBLIC
 * ENTRYPOINTS by relative path — the same public surfaces the bare
 * specifiers resolve to after `tsc -b`. When the sibling exports maps are
 * fully reconciled, these become bare `@mos/*` specifiers and NOTHING
 * else moves.
 *
 * NOT a production composition root — production binds durable
 * registries, the real policy authority's gate and a real substrate
 * transport through the same ports.
 */

import { evaluateRights } from "../../../mos-rights/dist/index.js";
import {
  createInMemoryMerchantClientInstanceRegistry,
  createInMemoryProviderDefinitionRegistry,
  createInMemoryProviderImplementationRegistry,
  createInMemoryProviderSecretStore,
} from "../../../mos-integrations/dist/index.js";
import type {
  MerchantClientInstanceRegistryPort,
  ProviderDefinitionRegistryPort,
  ProviderImplementationRegistryPort,
  RightsContextRef,
} from "@mos/integrations";
import type { ProviderSecretStorePort } from "@mos/integrations";
import type { RightsGrant } from "@mos/rights";
import type { TenantScope } from "@mos/contracts";

import { createInMemorySocialChannelRegistry } from "../adapters/in-memory-social-channel-registry.js";
import { createInMemorySocialRightsGate } from "../adapters/in-memory-social-rights-gate.js";
import type { SocialRightsEvaluator } from "../adapters/in-memory-social-rights-gate.js";
import { createInMemorySocialPolicyGate } from "../adapters/in-memory-social-policy-gate.js";
import type { InMemoryPolicyRule } from "../adapters/in-memory-social-policy-gate.js";
import {
  createInMemorySocialTransportDouble,
} from "../adapters/in-memory-social-transport.js";
import type { InMemorySocialTransportRoute } from "../adapters/in-memory-social-transport.js";
import { createInMemorySocialAdapter } from "../adapters/in-memory-social-adapter.js";
import type { SocialAdapterPort } from "../ports/social-adapter.port.js";
import type { SocialChannelRegistryPort } from "../ports/social-channel-registry.port.js";
import type { SocialPolicyGatePort } from "../ports/social-policy-gate.port.js";
import type { SocialRightsGatePort } from "../ports/social-rights-gate.port.js";
import type { SocialTransportPort } from "../ports/social-transport.port.js";

/** Options for {@link composeDistributionStack}. */
export interface ComposeDistributionStackOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** Scripted transport routes (DATA keyed by fictional provider ids). */
  readonly transportRoutes?: Readonly<Record<string, InMemorySocialTransportRoute>>;
  /** Overrides the REAL evaluateRights injection (only for negative tests of the seam itself). */
  readonly rightsEvaluator?: SocialRightsEvaluator;
  /** Initial policy rules of the disclosed double (DATA). */
  readonly policyRules?: readonly InMemoryPolicyRule[];
  /** Overrides the composed transport (test instrumentation — e.g. send counting). */
  readonly transport?: SocialTransportPort;
}

/** The composed REAL-for-contract-testing distribution stack. */
export interface ComposedDistributionStack {
  /** The REAL integrations registries (the channel binding authority). */
  readonly integrations: {
    readonly definitions: ProviderDefinitionRegistryPort;
    readonly implementations: ProviderImplementationRegistryPort;
    readonly secrets: ProviderSecretStorePort;
    readonly instances: MerchantClientInstanceRegistryPort;
  };
  readonly channels: SocialChannelRegistryPort;
  readonly rightsGate: SocialRightsGatePort;
  readonly policyGate: SocialPolicyGatePort;
  readonly transport: SocialTransportPort;
  readonly adapter: SocialAdapterPort;
  /** Seeding path of the rights-gate double (see its docblock). */
  registerRightsContext(input: {
    readonly scope: TenantScope;
    readonly grants: readonly RightsGrant[];
  }): RightsContextRef;
  /** Seeding path of the policy-gate double (see its docblock). */
  registerPolicyRule(rule: InMemoryPolicyRule): void;
}

/**
 * Composes the full social distribution stack with the REAL integrations
 * registries and the REAL rights evaluation rule (disclosed doubles only
 * where the package docblocks say so).
 */
export function composeDistributionStack(
  options: ComposeDistributionStackOptions = {},
): ComposedDistributionStack {
  const now = options.now ?? (() => new Date().toISOString());

  const definitions = createInMemoryProviderDefinitionRegistry();
  const implementations = createInMemoryProviderImplementationRegistry({ definitions, now });
  const secrets = createInMemoryProviderSecretStore({ now });
  const instances = createInMemoryMerchantClientInstanceRegistry({ implementations, secrets, now });
  const channels = createInMemorySocialChannelRegistry({ instances, now });
  const rightsGate = createInMemorySocialRightsGate({
    // The REAL §27 evaluation rule — never re-implemented in this package.
    evaluate: options.rightsEvaluator ?? evaluateRights,
    now,
  });
  const policyGate = createInMemorySocialPolicyGate({ rules: options.policyRules });
  const transport = options.transport ?? createInMemorySocialTransportDouble({ routes: options.transportRoutes });
  const adapter = createInMemorySocialAdapter({
    channels,
    rightsGate,
    policyGate,
    transport,
    now,
  });

  return {
    integrations: { definitions, implementations, secrets, instances },
    channels,
    rightsGate,
    policyGate,
    transport,
    adapter,
    registerRightsContext: (input) => rightsGate.registerRightsContext(input),
    registerPolicyRule: (rule) => policyGate.registerPolicyRule(rule),
  };
}
