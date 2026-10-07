/**
 * In-memory AvailabilityCapabilityRegistry adapter (INTEG-001, layer 4).
 *
 * Working adapter: fail-closed registration — capability refs MUST resolve
 * through the REAL @mos/capabilities vocabulary (the injected
 * CapabilityRegistryPort; unresolvable refs provide nothing, so they cannot
 * be registered), the referenced implementation must exist IN THE SAME
 * TENANT; append-only versioned snapshots; tenant-scoped reads with
 * cross-tenant ≡ unknown.
 *
 * This registry is the ONLY source of availability: nothing else in the
 * package derives capability availability (the definition's declared
 * surface is declaration data — an instance without capability records
 * provides NOTHING).
 *
 * DISCLOSED LIMIT: ephemeral process-local scaffold (no durability claim).
 */

import type { CapabilityId, TenantId, Version } from "@mos/contracts";
import type { CapabilityRegistryPort } from "@mos/capabilities";

import type {
  AvailabilityCapability,
  RegisterAvailabilityCapabilityInput,
} from "../contracts/availability-capability.js";
import type { AvailabilityCapabilityId, ProviderImplementationId } from "../contracts/ids.js";
import { IntegrationsError } from "../errors.js";
import type { ProviderImplementationRegistryPort } from "../ports/provider-implementation-registry.port.js";
import type { AvailabilityCapabilityRegistryPort } from "../ports/availability-capability-registry.port.js";
import {
  assertArray,
  assertExactFields,
  assertNonBlankString,
  assertPlainObject,
  deepFreeze,
  defaultNow,
} from "./registry-support.js";

/** Options for the in-memory availability-capability registry. */
export interface InMemoryAvailabilityCapabilityRegistryOptions {
  /** Layer-2 registry: implementations must resolve here (fail-closed). */
  readonly implementations: ProviderImplementationRegistryPort;
  /**
   * The REAL capability vocabulary (@mos/capabilities registry): every
   * registered availability ref must resolve here — (capabilityId,
   * capabilityVersion) pairs that resolve nowhere provide nothing and are
   * rejected.
   */
  readonly capabilities: CapabilityRegistryPort;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
}

const INPUT_FIELDS = [
  "id",
  "scope",
  "implementationId",
  "capabilityId",
  "capabilityVersion",
  "constraints",
] as const;

const CONSTRAINT_FIELDS = ["kind", "parameters"] as const;

/**
 * Creates an in-memory {@link AvailabilityCapabilityRegistryPort} adapter.
 */
export function createInMemoryAvailabilityCapabilityRegistry(
  options: InMemoryAvailabilityCapabilityRegistryOptions,
): AvailabilityCapabilityRegistryPort {
  const now = options.now ?? defaultNow;
  const implementations = options.implementations;
  const capabilities = options.capabilities;
  /** tenantKey → availabilityId → version → frozen record. */
  const byTenant = new Map<string, Map<string, Map<number, AvailabilityCapability>>>();
  /** tenantKey → implementationId → insertion-ordered availability ids. */
  const byImplementation = new Map<string, AvailabilityCapabilityId[]>();
  let minted = 0;

  function layer(tenantId: TenantId): Map<string, Map<number, AvailabilityCapability>> {
    const key = tenantId as string;
    let availabilities = byTenant.get(key);
    if (availabilities === undefined) {
      availabilities = new Map<string, Map<number, AvailabilityCapability>>();
      byTenant.set(key, availabilities);
    }
    return availabilities;
  }

  function latestOf(
    tenantId: TenantId,
    availabilityId: AvailabilityCapabilityId,
  ): AvailabilityCapability | undefined {
    const versions = layer(tenantId).get(availabilityId as string);
    if (versions === undefined || versions.size === 0) {
      return undefined;
    }
    const latest = Math.max(...versions.keys());
    return versions.get(latest);
  }

  const registry: AvailabilityCapabilityRegistryPort = {
    register(input: RegisterAvailabilityCapabilityInput): AvailabilityCapability {
      assertExactFields(input, INPUT_FIELDS, "availability-capability");
      if (input.scope === undefined || typeof input.scope !== "object") {
        throw new IntegrationsError("invalid-availability-capability", "scope is required", { field: "scope" });
      }
      assertNonBlankString(input.scope.tenantId, "scope.tenantId", "availability-capability");
      assertNonBlankString(input.implementationId, "implementationId", "availability-capability");
      assertNonBlankString(input.capabilityId, "capabilityId", "availability-capability");
      if (
        typeof input.capabilityVersion !== "number" ||
        !Number.isInteger(input.capabilityVersion) ||
        input.capabilityVersion < 1
      ) {
        throw new IntegrationsError(
          "invalid-availability-capability",
          "capabilityVersion must be an integer ≥ 1",
          { field: "capabilityVersion" },
        );
      }
      assertArray(input.constraints, "constraints", "availability-capability");
      for (const constraint of input.constraints) {
        assertPlainObject(constraint, "constraints[]", "availability-capability");
        assertExactFields(constraint as object, CONSTRAINT_FIELDS, "availability-capability");
        assertNonBlankString((constraint as { kind: unknown }).kind, "constraints[].kind", "availability-capability");
        assertPlainObject((constraint as { parameters: unknown }).parameters, "constraints[].parameters", "availability-capability");
      }

      // The referenced implementation must exist IN THIS TENANT
      // (cross-tenant ≡ unknown — no existence leaks).
      if (implementations.getLatest(input.scope.tenantId, input.implementationId) === undefined) {
        throw new IntegrationsError(
          "unknown-provider-implementation-reference",
          "availability references an unknown provider implementation (not registered in this tenant)",
          {},
        );
      }

      // Capability refs resolve through the @mos/capabilities vocabulary:
      // an availability whose (capabilityId, capabilityVersion) resolves
      // nowhere provides NOTHING and is rejected fail-closed.
      if (capabilities.get(input.capabilityId as CapabilityId, input.capabilityVersion as Version) === undefined) {
        throw new IntegrationsError(
          "unknown-capability-reference",
          "capability reference does not resolve in the capability registry (unknown capability id or version)",
          { capabilityId: input.capabilityId as string, capabilityVersion: input.capabilityVersion as number },
        );
      }

      const tenantKey = input.scope.tenantId as string;
      const availabilities = layer(input.scope.tenantId);
      const idKey = (input.id ?? (`availability-capability-${++minted}` as AvailabilityCapabilityId)) as string;
      const versions = availabilities.get(idKey);
      const nextVersion = versions === undefined ? 1 : Math.max(...versions.keys()) + 1;

      const record: AvailabilityCapability = deepFreeze({
        id: idKey as AvailabilityCapabilityId,
        version: nextVersion as Version,
        scope: input.scope,
        implementationId: input.implementationId,
        capabilityId: input.capabilityId,
        capabilityVersion: input.capabilityVersion,
        constraints: input.constraints,
        createdAt: now() as AvailabilityCapability["createdAt"],
      });

      if (versions === undefined) {
        availabilities.set(idKey, new Map<number, AvailabilityCapability>([[nextVersion, record]]));
        const implKey = input.implementationId as string;
        const ids = byImplementation.get(`${tenantKey}\u0000${implKey}`) ?? [];
        ids.push(record.id);
        byImplementation.set(`${tenantKey}\u0000${implKey}`, ids);
      } else {
        versions.set(nextVersion, record);
      }
      return record;
    },

    get(
      tenantId: TenantId,
      availabilityId: AvailabilityCapabilityId,
      version: Version,
    ): AvailabilityCapability | undefined {
      return layer(tenantId).get(availabilityId as string)?.get(version as number);
    },

    getLatest(tenantId: TenantId, availabilityId: AvailabilityCapabilityId): AvailabilityCapability | undefined {
      return latestOf(tenantId, availabilityId);
    },

    listVersions(tenantId: TenantId, availabilityId: AvailabilityCapabilityId): readonly Version[] {
      const versions = layer(tenantId).get(availabilityId as string);
      if (versions === undefined) {
        return [];
      }
      return [...versions.keys()].sort((a, b) => a - b) as Version[];
    },

    listForImplementation(
      tenantId: TenantId,
      implementationId: ProviderImplementationId,
    ): readonly AvailabilityCapability[] {
      const ids = byImplementation.get(`${tenantId as string}\u0000${implementationId as string}`) ?? [];
      const out: AvailabilityCapability[] = [];
      for (const id of ids) {
        const latest = latestOf(tenantId, id);
        if (latest !== undefined) {
          out.push(latest);
        }
      }
      return out;
    },
  };

  return registry;
}
