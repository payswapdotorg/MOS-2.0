/**
 * Public surface of `@mos/capabilities` (MOS v2.0 CAP-001).
 *
 * The CapabilityRegistry port, the in-memory adapter, typed errors, and the
 * clearly-marked SEED capability catalog (architecture §5 examples as test
 * fixtures — NOT engine claims).
 *
 * Export budget: 1 runtime factory (`createInMemoryCapabilityRegistry`)
 * plus the frozen SEED_CAPABILITY_CATALOG / SEED_CAPABILITY_IDS constants
 * and the error classes. Well within the architecture policy budget of 12
 * public functions.
 */

export type { CapabilityRegistryPort } from "./ports/capability-registry.port.js";

export type { InMemoryCapabilityRegistryOptions } from "./adapters/in-memory-capability-registry.js";
export { createInMemoryCapabilityRegistry } from "./adapters/in-memory-capability-registry.js";

export {
  CapabilityAlreadyRegisteredError,
  CapabilityRegistryError,
  CapabilityVersionNotMonotonicError,
  InvalidCapabilityRecordError,
  UnknownCapabilityError,
} from "./errors.js";

export {
  SEED_CAPABILITY_CATALOG,
  SEED_CAPABILITY_IDS,
  SEED_PROVENANCE_MARKER,
} from "./fixtures/seed-capabilities.js";
