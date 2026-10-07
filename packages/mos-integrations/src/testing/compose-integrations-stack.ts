/**
 * REAL integrations stack composed at the testing seam (INTEG-001).
 *
 * Composes the package's own in-memory registries and the call surface
 * over:
 * - the REAL `@mos/capabilities` registry seeded with the REAL §5 seed
 *   catalog (so availability refs resolve through the actual capability
 *   vocabulary);
 * - the REAL `evaluateRights` rule of `@mos/rights` — injected into the
 *   disclosed rights-gate double (the handle→grants resolution is the
 *   doubled part; the evaluation rule itself is real, never
 *   re-implemented — there is no second rights authority);
 * - the DISCLOSED in-memory transport double (no network, deterministic).
 *
 * RUNTIME IMPORT DISCLOSURE: `@mos/rights` points its runtime export at
 * untranspiled `src/index.ts` (its own documented composition-root
 * convention), which plain Node ESM cannot execute. This seam therefore
 * imports the package's BUILT PUBLIC ENTRYPOINT
 * (`packages/mos-rights/dist/index.js`) by relative path — the same public
 * surface the bare specifier resolves to after `tsc -b` (project
 * references guarantee the build order; the W2-C precedent). When the
 * sibling exports map is reconciled, this becomes the bare `@mos/rights`
 * specifier and NOTHING else moves.
 *
 * NOT a production composition root — production binds durable registries
 * and a real substrate transport through the same ports.
 */

import { createInMemoryCapabilityRegistry } from "@mos/capabilities";
import { SEED_CAPABILITY_CATALOG } from "@mos/capabilities";
import type { CapabilityRegistryPort } from "@mos/capabilities";
import { evaluateRights } from "../../../mos-rights/dist/index.js";
import type { RightsGrant } from "@mos/rights";
import type { TenantScope } from "@mos/contracts";

import { createInMemoryProviderDefinitionRegistry } from "../adapters/in-memory-provider-definition-registry.js";
import { createInMemoryProviderImplementationRegistry } from "../adapters/in-memory-provider-implementation-registry.js";
import { createInMemoryMerchantClientInstanceRegistry } from "../adapters/in-memory-merchant-client-instance-registry.js";
import { createInMemoryAvailabilityCapabilityRegistry } from "../adapters/in-memory-availability-capability-registry.js";
import { createInMemoryProviderRightsGate } from "../adapters/in-memory-provider-rights-gate.js";
import type { RightsEvaluator } from "../adapters/in-memory-provider-rights-gate.js";
import { createInMemoryProviderSecretStore } from "../adapters/in-memory-provider-secret-store.js";
import {
  createInMemoryProviderTransportDouble,
  IN_MEMORY_TRANSPORT_SOURCE,
} from "../adapters/in-memory-provider-transport.js";
import type { InMemoryTransportRoute } from "../adapters/in-memory-provider-transport.js";
import { createInMemoryProviderInteractionPort } from "../adapters/in-memory-provider-interaction.js";
import type { InMemoryProviderRightsGate } from "../adapters/in-memory-provider-rights-gate.js";
import type { MerchantClientInstanceRegistryPort } from "../ports/merchant-client-instance-registry.port.js";
import type { ProviderDefinitionRegistryPort } from "../ports/provider-definition-registry.port.js";
import type { ProviderImplementationRegistryPort } from "../ports/provider-implementation-registry.port.js";
import type { AvailabilityCapabilityRegistryPort } from "../ports/availability-capability-registry.port.js";
import type { ProviderInteractionPort } from "../ports/provider-interaction.port.js";
import type { ProviderSecretStorePort } from "../ports/provider-secret-store.port.js";
import type { ProviderTransportPort } from "../ports/provider-transport.port.js";
import type { RightsContextRef } from "../contracts/ids.js";

/** Options for {@link composeIntegrationsStack}. */
export interface ComposeIntegrationsStackOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
  /** Scripted transport routes (DATA keyed by fictional provider ids). */
  readonly transportRoutes?: Readonly<Record<string, InMemoryTransportRoute>>;
  /** Overrides the REAL evaluateRights injection (only for negative tests of the seam itself). */
  readonly rightsEvaluator?: RightsEvaluator;
}

/** The composed REAL-for-contract-testing integrations stack. */
export interface ComposedIntegrationsStack {
  readonly capabilities: CapabilityRegistryPort;
  readonly secrets: ProviderSecretStorePort;
  readonly definitions: ProviderDefinitionRegistryPort;
  readonly implementations: ProviderImplementationRegistryPort;
  readonly instances: MerchantClientInstanceRegistryPort;
  readonly availability: AvailabilityCapabilityRegistryPort;
  readonly rightsGate: InMemoryProviderRightsGate;
  readonly transport: ProviderTransportPort;
  readonly interactions: ProviderInteractionPort;
  /** Seeding path of the rights-gate double (see its docblock). */
  registerRightsContext(input: {
    readonly scope: TenantScope;
    readonly grants: readonly RightsGrant[];
  }): RightsContextRef;
}

/**
 * Composes the full four-layer stack with REAL capability vocabulary and
 * the REAL rights evaluation rule (disclosed doubles only where the
 * package docblocks say so).
 */
export function composeIntegrationsStack(
  options: ComposeIntegrationsStackOptions = {},
): ComposedIntegrationsStack {
  const now = options.now ?? (() => new Date().toISOString());

  const capabilities = createInMemoryCapabilityRegistry({
    initial: SEED_CAPABILITY_CATALOG,
  });
  const secrets = createInMemoryProviderSecretStore({ now });
  const definitions = createInMemoryProviderDefinitionRegistry();
  const implementations = createInMemoryProviderImplementationRegistry({ definitions, now });
  const instances = createInMemoryMerchantClientInstanceRegistry({ implementations, secrets, now });
  const availability = createInMemoryAvailabilityCapabilityRegistry({ implementations, capabilities, now });
  const rightsGate = createInMemoryProviderRightsGate({
    // The REAL §27 evaluation rule — never re-implemented in this package.
    evaluate: options.rightsEvaluator ?? evaluateRights,
    now,
  });
  const transport = createInMemoryProviderTransportDouble({ routes: options.transportRoutes });
  const interactions = createInMemoryProviderInteractionPort({
    instances,
    implementations,
    availability,
    capabilities,
    rightsGate,
    transport,
    now,
  });

  return {
    capabilities,
    secrets,
    definitions,
    implementations,
    instances,
    availability,
    rightsGate,
    transport,
    interactions,
    registerRightsContext: (input) => rightsGate.registerRightsContext(input),
  };
}

/** The transport source label every §30 record carries in this wave. */
export { IN_MEMORY_TRANSPORT_SOURCE };
