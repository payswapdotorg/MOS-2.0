/**
 * In-memory CapabilityRegistry adapter (CAP-001).
 *
 * Working adapter (not a skeleton): registration with fail-closed contract
 * validation, immutable frozen records, full version history preserved and
 * resolvable, unknown capabilities fail closed. Persistence-backed
 * adapters arrive with the persistence wave; the port is unchanged.
 */

import { assertRequiredFields } from "@mos/contracts";
import type { Capability, CapabilityId, Version } from "@mos/contracts";

import {
  CapabilityAlreadyRegisteredError,
  CapabilityVersionNotMonotonicError,
  InvalidCapabilityRecordError,
  UnknownCapabilityError,
} from "../errors.js";
import type { CapabilityRegistryPort } from "../ports/capability-registry.port.js";

/** Options for the in-memory capability registry. */
export interface InMemoryCapabilityRegistryOptions {
  /**
   * Initial records to register (e.g. the seed catalog). Registration rules
   * apply exactly as for `register()` calls.
   */
  readonly initial?: readonly Capability[];
}

function freezeCapability(capability: Capability): Capability {
  return Object.freeze({ ...capability });
}

/**
 * Creates an in-memory {@link CapabilityRegistryPort} adapter.
 */
export function createInMemoryCapabilityRegistry(
  options: InMemoryCapabilityRegistryOptions = {},
): CapabilityRegistryPort {
  /** capabilityId (string key) → version → frozen record. */
  const byId = new Map<string, Map<number, Capability>>();
  const insertionOrder: CapabilityId[] = [];

  function versionsOf(capabilityId: CapabilityId): Map<number, Capability> {
    return byId.get(capabilityId as string) ?? new Map<number, Capability>();
  }

  const registry: CapabilityRegistryPort = {
    register(capability: Capability): void {
      try {
        assertRequiredFields(capability, "Capability");
      } catch (error) {
        throw new InvalidCapabilityRecordError(
          error instanceof Error ? error.message : String(error),
        );
      }
      const idKey = capability.id as string;
      let versions = byId.get(idKey);
      if (versions === undefined) {
        versions = new Map<number, Capability>();
        byId.set(idKey, versions);
        insertionOrder.push(capability.id);
      }
      const versionKey = capability.version as number;
      if (versions.has(versionKey)) {
        throw new CapabilityAlreadyRegisteredError(idKey, versionKey);
      }
      const latest = versions.size > 0 ? Math.max(...versions.keys()) : 0;
      if (versionKey <= latest) {
        throw new CapabilityVersionNotMonotonicError(idKey, versionKey, latest);
      }
      versions.set(versionKey, freezeCapability(capability));
    },

    get(capabilityId: CapabilityId, version: Version): Capability | undefined {
      return versionsOf(capabilityId).get(version as number);
    },

    getLatest(capabilityId: CapabilityId): Capability | undefined {
      const versions = versionsOf(capabilityId);
      if (versions.size === 0) {
        return undefined;
      }
      const latest = Math.max(...versions.keys());
      return versions.get(latest);
    },

    require(capabilityId: CapabilityId, version?: Version): Capability {
      const versions = versionsOf(capabilityId);
      if (versions.size === 0) {
        throw new UnknownCapabilityError(capabilityId as string, version as number | undefined);
      }
      if (version === undefined) {
        const latest = Math.max(...versions.keys());
        return versions.get(latest) as Capability;
      }
      const record = versions.get(version as number);
      if (record === undefined) {
        throw new UnknownCapabilityError(capabilityId as string, version as number);
      }
      return record;
    },

    listVersions(capabilityId: CapabilityId): readonly Version[] {
      return [...versionsOf(capabilityId).keys()].sort((a, b) => a - b) as Version[];
    },

    listCapabilityIds(): readonly CapabilityId[] {
      return insertionOrder;
    },
  };

  for (const capability of options.initial ?? []) {
    registry.register(capability);
  }

  return registry;
}
