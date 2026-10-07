/**
 * CapabilityRefSource port (AGT-001).
 *
 * The narrow read surface the agent body registry needs from the capability
 * authority (@mos/capabilities — CAP-001). Declared IN THIS PACKAGE because
 * the module registry (`spec/mos-module-registry-v2.0.yaml`) allows agents to
 * depend on [contracts, identity] only — @mos/capabilities is NOT an agents
 * dependency, so the composition root wires the real capability registry
 * here instead.
 *
 * The shape is deliberately structural: `@mos/capabilities`'s
 * `CapabilityRegistryPort.getLatest` satisfies this interface as-is (its
 * `Capability` return type structurally carries `id: CapabilityId`), so no
 * adapter shim is needed at the composition root. In tests a Map-backed
 * double stands in for the real registry (disclosed test double).
 */

import type { CapabilityId } from "@mos/contracts";

/** Minimal capability existence record the agents domain needs. */
export interface KnownCapability {
  readonly id: CapabilityId;
}

/**
 * Read-only capability source for capability-ref validation of agent bodies.
 * Fail-closed: `getLatest` returns `undefined` for unknown capability ids.
 */
export interface CapabilityRefSource {
  /**
   * Resolves the latest registered version of one capability, or `undefined`
   * when the capability id is unknown.
   */
  getLatest(capabilityId: CapabilityId): KnownCapability | undefined;
}
