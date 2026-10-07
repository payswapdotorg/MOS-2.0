/**
 * Public surface of `@mos/integrations` (MOS v2.0 INTEG-001).
 *
 * The provider-integrations authority: the four-layer connector provider
 * contract (ProviderDefinition → ProviderImplementation →
 * MerchantClientInstance → AvailabilityCapability), the registry ports,
 * the ProviderInteractionPort call surface (rights gate + §30 records),
 * the declared secret-store and transport seams, typed errors, and the
 * in-memory adapters (disclosed doubles where docblocks say so).
 *
 * AUTHORITY DISCIPLINE (test-pinned): this surface is PROVIDER-NEUTRAL.
 * No provider name and no provider-specific type appears in any exported
 * contract, port, error or adapter — provider specifics live exclusively
 * in the DATA records tenants register at runtime (see
 * authority-discipline.test.ts). Test fixtures (fictional providers) are
 * deliberately NOT exported from this index: provider data never becomes
 * package surface.
 *
 * Export budget: 9 runtime functions (8 factories + 1 pure helper) + 5
 * frozen constants + 1 error class (well within the architecture policy
 * budget of 12 public functions); everything else is type-only. Sibling
 * packages import this package TYPE-ONLY and receive runtime
 * implementations through injection (hexagonal ports), per the documented
 * workspace convention — the runtime-export count is pinned by test.
 */

// ---- Contracts: identifiers and handles ----
export type {
  AvailabilityCapabilityId,
  CredentialRef,
  MerchantClientInstanceId,
  ProviderDefinitionId,
  ProviderImplementationId,
  ProviderInteractionId,
  RightsContextRef,
} from "./contracts/ids.js";

// ---- Contracts: layer 1 — provider definitions ----
export type {
  CapabilitySupportLevel,
  DeclaredCapabilitySurfaceEntry,
  ProviderDefinition,
  RegisterProviderDefinitionInput,
  TransportContractSurface,
} from "./contracts/provider-definition.js";
export {
  CAPABILITY_SUPPORT_LEVELS,
  PROVIDER_KINDS,
  TRANSPORT_KINDS,
} from "./contracts/provider-definition.js";
export type { ProviderKind, TransportKind } from "./contracts/provider-definition.js";

// ---- Contracts: layer 2 — provider implementations ----
export type {
  ProviderImplementation,
  ProviderImplementationStatus,
  ProviderStatusCorrectionInput,
  RegisterProviderImplementationInput,
} from "./contracts/provider-implementation.js";
export { PROVIDER_IMPLEMENTATION_STATUSES } from "./contracts/provider-implementation.js";

// ---- Contracts: layer 3 — merchant/client instances ----
export type {
  MerchantClientInstance,
  MerchantClientRebindInput,
  RegisterMerchantClientInstanceInput,
} from "./contracts/merchant-client-instance.js";

// ---- Contracts: layer 4 — availability capabilities ----
export type {
  AvailabilityCapability,
  AvailabilityConstraint,
  RegisterAvailabilityCapabilityInput,
} from "./contracts/availability-capability.js";

// ---- Contracts: the §30 interaction vocabulary ----
export type {
  InteractionRecordFilter,
  ProviderInteractionFailure,
  ProviderInteractionFailureCode,
  ProviderInteractionRecord,
  ProviderInteractionRequest,
  ProviderInteractionResult,
  ProviderInteractionWarning,
  ResolvedInstanceCapability,
} from "./contracts/interaction.js";

// ---- Ports ----
export type { ProviderDefinitionRegistryPort } from "./ports/provider-definition-registry.port.js";
export type { ProviderImplementationRegistryPort } from "./ports/provider-implementation-registry.port.js";
export type { MerchantClientInstanceRegistryPort } from "./ports/merchant-client-instance-registry.port.js";
export type { AvailabilityCapabilityRegistryPort } from "./ports/availability-capability-registry.port.js";
export type { ProviderInteractionPort } from "./ports/provider-interaction.port.js";
export type {
  ProviderRightsCheckRequest,
  ProviderRightsDenialReason,
  ProviderRightsGatePort,
  ProviderRightsGateVerdict,
} from "./ports/provider-rights-gate.port.js";
export type { ProviderSecretStorePort } from "./ports/provider-secret-store.port.js";
export type {
  ProviderTransportPort,
  ProviderTransportRequest,
  ProviderTransportResponse,
} from "./ports/provider-transport.port.js";

// ---- Typed errors ----
export { IntegrationsError } from "./errors.js";
export type { IntegrationsErrorCode } from "./errors.js";

// ---- In-memory adapters (disclosed doubles where docblocks say so) ----
export { createInMemoryProviderDefinitionRegistry } from "./adapters/in-memory-provider-definition-registry.js";
export {
  createInMemoryProviderImplementationRegistry,
} from "./adapters/in-memory-provider-implementation-registry.js";
export type { InMemoryProviderImplementationRegistryOptions } from "./adapters/in-memory-provider-implementation-registry.js";
export {
  createInMemoryMerchantClientInstanceRegistry,
} from "./adapters/in-memory-merchant-client-instance-registry.js";
export type { InMemoryMerchantClientInstanceRegistryOptions } from "./adapters/in-memory-merchant-client-instance-registry.js";
export {
  createInMemoryAvailabilityCapabilityRegistry,
} from "./adapters/in-memory-availability-capability-registry.js";
export type { InMemoryAvailabilityCapabilityRegistryOptions } from "./adapters/in-memory-availability-capability-registry.js";
export {
  createInMemoryProviderRightsGate,
} from "./adapters/in-memory-provider-rights-gate.js";
export type {
  InMemoryProviderRightsGate,
  InMemoryProviderRightsGateOptions,
  RightsEvaluator,
} from "./adapters/in-memory-provider-rights-gate.js";
export { createInMemoryProviderSecretStore } from "./adapters/in-memory-provider-secret-store.js";
export type { InMemoryProviderSecretStoreOptions } from "./adapters/in-memory-provider-secret-store.js";
export {
  createInMemoryProviderTransportDouble,
  IN_MEMORY_TRANSPORT_SOURCE,
} from "./adapters/in-memory-provider-transport.js";
export type {
  InMemoryProviderTransportDoubleOptions,
  InMemoryTransportRoute,
} from "./adapters/in-memory-provider-transport.js";
export {
  createInMemoryProviderInteractionPort,
  providerInteractionSubject,
} from "./adapters/in-memory-provider-interaction.js";
export type { InMemoryProviderInteractionOptions } from "./adapters/in-memory-provider-interaction.js";
