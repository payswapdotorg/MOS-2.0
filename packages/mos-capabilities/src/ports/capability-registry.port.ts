/**
 * CapabilityRegistry port (CAP-001).
 *
 * The port consumed by domain modules (Studio/Lab/production request
 * CAPABILITIES, never engines). Port files never import @zcode/* (boundary
 * rule PORTS-NO-ZCODE).
 *
 * Registry semantics:
 * - records follow the {@link Capability} core contract (required fields
 *   validated at registration, fail-closed);
 * - records are immutable: registering an existing id+version again is an
 *   error, and new versions must append monotonically;
 * - version history is preserved: every registered version stays
 *   resolvable by (id, version) — contracts are versioned;
 * - unknown capabilities fail closed (undefined from the getters, a typed
 *   error from {@link CapabilityRegistryPort.require}).
 */

import type { Capability, CapabilityId, Version } from "@mos/contracts";

/**
 * Registry of capability contracts. 6 public methods (policy budget: 12).
 */
export interface CapabilityRegistryPort {
  /**
   * Registers one immutable capability contract record. Fail-closed: the
   * record must carry every required Capability field; duplicate
   * id+version and non-monotonic versions are rejected with typed errors.
   */
  register(capability: Capability): void;

  /** Resolves one exact version, or `undefined` when unknown (fail-closed). */
  get(capabilityId: CapabilityId, version: Version): Capability | undefined;

  /** Resolves the latest registered version, or `undefined` when unknown (fail-closed). */
  getLatest(capabilityId: CapabilityId): Capability | undefined;

  /**
   * Fail-closed resolution: returns the exact version (or the latest when
   * `version` is omitted) or throws
   * {@link ../errors.js!UnknownCapabilityError} naming the capability.
   */
  require(capabilityId: CapabilityId, version?: Version): Capability;

  /** All registered versions of one capability, ascending; empty when unknown. */
  listVersions(capabilityId: CapabilityId): readonly Version[];

  /** All registered capability ids (insertion order). */
  listCapabilityIds(): readonly CapabilityId[];
}
