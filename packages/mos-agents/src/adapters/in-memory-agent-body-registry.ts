/**
 * In-memory AgentBodyRegistry adapter (AGT-001).
 *
 * Working adapter (not a skeleton): registration with fail-closed contract
 * validation (frozen YAML required fields + semantics + capability refs),
 * immutable frozen records, full version history preserved and resolvable,
 * unknown bodies fail closed. Persistence-backed adapters arrive with the
 * persistence wave; the port is unchanged.
 */

import type { AgentBody, Version } from "@mos/contracts";

import type { AgentBodyId } from "../domain/ids.js";

import {
  AgentBodyRegistrationConflictError,
  InvalidAgentBodyError,
  UnknownAgentBodyError,
} from "../errors.js";
import { assertValidAgentBody } from "../domain/agent-body.js";
import type { AgentBodyRegistryPort } from "../ports/agent-body-registry.port.js";
import type { CapabilityRefSource } from "../ports/capability-ref-source.port.js";

/** Options for the in-memory agent body registry. */
export interface InMemoryAgentBodyRegistryOptions {
  /**
   * Capability source used for capability-ref validation at registration.
   * The composition root wires the real @mos/capabilities registry here
   * (structurally compatible — see the CapabilityRefSource port). When
   * omitted, capability refs are validated for shape only.
   */
  readonly capabilitySource?: CapabilityRefSource;
  /** Initial records to register. Registration rules apply exactly as for `register()`. */
  readonly initial?: readonly AgentBody[];
}

/**
 * Clone-then-deep-freeze (W9-B ownership discipline, the W4-B/W8-A
 * pattern): the registry stores a PRIVATE structural copy of the declared
 * body. Before this fix the stored record was only SHALLOW-frozen — the
 * caller's nested objects (roleContract, inputContract, budget, latency,
 * safety, …) were embedded by reference and stayed mutable, so mutating
 * the caller's body AFTER registration rewrote the STORED record
 * (bit-for-bit append-only violation — the W5-A/W6-A defect class) and
 * nested fields of returned records were mutable in place.
 */
function freezeBody(body: AgentBody): AgentBody {
  const clone = structuredClone(body);
  const deepFreeze = (value: unknown): void => {
    if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        deepFreeze((value as Record<string, unknown>)[key]);
      }
      Object.freeze(value);
    }
  };
  deepFreeze(clone);
  return clone;
}

/**
 * Creates an in-memory {@link AgentBodyRegistryPort} adapter.
 */
export function createInMemoryAgentBodyRegistry(
  options: InMemoryAgentBodyRegistryOptions = {},
): AgentBodyRegistryPort {
  /** bodyId (string key) → version → frozen record. */
  const byId = new Map<string, Map<number, AgentBody>>();

  function versionsOf(bodyId: AgentBodyId): Map<number, AgentBody> {
    return byId.get(bodyId as string) ?? new Map<number, AgentBody>();
  }

  const registry: AgentBodyRegistryPort = {
    register(body: AgentBody): void {
      try {
        assertValidAgentBody(body, options.capabilitySource);
      } catch (error) {
        if (error instanceof InvalidAgentBodyError) {
          throw error;
        }
        throw new InvalidAgentBodyError(
          error instanceof Error ? error.message : String(error),
        );
      }
      const idKey = body.id as string;
      let versions = byId.get(idKey);
      if (versions === undefined) {
        versions = new Map<number, AgentBody>();
        byId.set(idKey, versions);
      }
      const versionKey = body.version as number;
      if (versions.has(versionKey)) {
        throw new AgentBodyRegistrationConflictError(
          "agent-body-already-registered",
          `Agent body ${idKey} version ${versionKey} is already registered; body versions are immutable — register a new version instead`,
          idKey,
          versionKey,
          versionKey,
        );
      }
      const latest = versions.size > 0 ? Math.max(...versions.keys()) : 0;
      if (versionKey <= latest) {
        throw new AgentBodyRegistrationConflictError(
          "agent-body-version-not-monotonic",
          `Agent body ${idKey} version ${versionKey} does not append monotonically (latest registered version is ${latest})`,
          idKey,
          versionKey,
          latest,
        );
      }
      versions.set(versionKey, freezeBody(body));
    },

    get(bodyId: AgentBodyId, version: Version): AgentBody | undefined {
      return versionsOf(bodyId).get(version as number);
    },

    getLatest(bodyId: AgentBodyId): AgentBody | undefined {
      const versions = versionsOf(bodyId);
      if (versions.size === 0) {
        return undefined;
      }
      const latest = Math.max(...versions.keys());
      return versions.get(latest);
    },

    require(bodyId: AgentBodyId, version?: Version): AgentBody {
      const versions = versionsOf(bodyId);
      if (versions.size === 0) {
        throw new UnknownAgentBodyError(bodyId as string, version as number | undefined);
      }
      if (version === undefined) {
        const latest = Math.max(...versions.keys());
        return versions.get(latest) as AgentBody;
      }
      const record = versions.get(version as number);
      if (record === undefined) {
        throw new UnknownAgentBodyError(bodyId as string, version as number);
      }
      return record;
    },

    listVersions(bodyId: AgentBodyId): readonly Version[] {
      return [...versionsOf(bodyId).keys()].sort((a, b) => a - b) as Version[];
    },
  };

  for (const body of options.initial ?? []) {
    registry.register(body);
  }

  return registry;
}
