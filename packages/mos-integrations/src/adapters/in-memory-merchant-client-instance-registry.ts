/**
 * In-memory MerchantClientInstanceRegistry adapter (INTEG-001, layer 3).
 *
 * Working adapter: fail-closed registration with STRICT SHAPE (the runtime
 * credential-never-in-control-plane guard — any property beyond the
 * declared field set, e.g. a smuggled `secret`, is a typed error),
 * referenced implementation must exist IN THE SAME TENANT, the credential
 * HANDLE must resolve at the secret-store seam, instance names unique per
 * tenant; append-only versioning with recordRebind; tenant-scoped reads
 * with cross-tenant ≡ unknown.
 *
 * DISCLOSED LIMIT: ephemeral process-local scaffold (no durability claim).
 */

import type { TenantId, Version } from "@mos/contracts";

import type {
  MerchantClientInstance,
  MerchantClientRebindInput,
  RegisterMerchantClientInstanceInput,
} from "../contracts/merchant-client-instance.js";
import type { MerchantClientInstanceId } from "../contracts/ids.js";
import { IntegrationsError } from "../errors.js";
import type { ProviderImplementationRegistryPort } from "../ports/provider-implementation-registry.port.js";
import type { ProviderSecretStorePort } from "../ports/provider-secret-store.port.js";
import type { MerchantClientInstanceRegistryPort } from "../ports/merchant-client-instance-registry.port.js";
import {
  assertExactFields,
  assertNonBlankString,
  deepFreeze,
  defaultNow,
} from "./registry-support.js";

/** Options for the in-memory merchant-client-instance registry. */
export interface InMemoryMerchantClientInstanceRegistryOptions {
  /** Layer-2 registry: implementations must resolve here (fail-closed). */
  readonly implementations: ProviderImplementationRegistryPort;
  /** The substrate secret-store seam: credential handles must resolve here. */
  readonly secrets: ProviderSecretStorePort;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
}

const INPUT_FIELDS = [
  "id",
  "scope",
  "name",
  "merchantIdentity",
  "externalAccount",
  "implementationId",
  "implementationVersion",
  "credentialRef",
] as const;

const REBIND_FIELDS = ["scope", "instanceId", "implementationId", "implementationVersion"] as const;

/**
 * Creates an in-memory {@link MerchantClientInstanceRegistryPort} adapter.
 */
export function createInMemoryMerchantClientInstanceRegistry(
  options: InMemoryMerchantClientInstanceRegistryOptions,
): MerchantClientInstanceRegistryPort {
  const now = options.now ?? defaultNow;
  const implementations = options.implementations;
  const secrets = options.secrets;
  /** tenantKey → instanceId → version → frozen record. */
  const byTenant = new Map<string, Map<string, Map<number, MerchantClientInstance>>>();
  /** tenantKey → instanceId → insertion order. */
  const order = new Map<string, MerchantClientInstanceId[]>();
  /** tenantKey → instance NAME → owning instanceId (uniqueness). */
  const names = new Map<string, Map<string, MerchantClientInstanceId>>();
  let minted = 0;

  function layer(tenantId: TenantId): Map<string, Map<number, MerchantClientInstance>> {
    const key = tenantId as string;
    let instances = byTenant.get(key);
    if (instances === undefined) {
      instances = new Map<string, Map<number, MerchantClientInstance>>();
      byTenant.set(key, instances);
    }
    return instances;
  }

  function latestOf(
    tenantId: TenantId,
    instanceId: MerchantClientInstanceId,
  ): MerchantClientInstance | undefined {
    const versions = layer(tenantId).get(instanceId as string);
    if (versions === undefined || versions.size === 0) {
      return undefined;
    }
    const latest = Math.max(...versions.keys());
    return versions.get(latest);
  }

  function requireImplementation(
    tenantId: TenantId,
    implementationId: unknown,
    implementationVersion: unknown,
  ): void {
    assertNonBlankString(implementationId, "implementationId", "merchant-client-instance");
    if (typeof implementationVersion !== "number" || !Number.isInteger(implementationVersion) || implementationVersion < 1) {
      throw new IntegrationsError(
        "invalid-merchant-client-instance",
        "implementationVersion must be an integer ≥ 1",
        { field: "implementationVersion" },
      );
    }
    const implementation = implementations.get(
      tenantId,
      implementationId as MerchantClientInstance["implementationId"],
      implementationVersion as Version,
    );
    if (implementation === undefined) {
      // Cross-tenant ≡ unknown — no existence leaks (§31).
      throw new IntegrationsError(
        "unknown-provider-implementation-reference",
        "instance references an unknown provider implementation (id or version not registered in this tenant)",
        {},
      );
    }
  }

  const registry: MerchantClientInstanceRegistryPort = {
    register(input: RegisterMerchantClientInstanceInput): MerchantClientInstance {
      // STRICT SHAPE first: a smuggled credential-value field cannot enter
      // the control plane through this registry (runtime twin of the
      // compile-time exact-keyset pin).
      assertExactFields(input, INPUT_FIELDS, "merchant-client-instance");
      if (input.scope === undefined || typeof input.scope !== "object") {
        throw new IntegrationsError("invalid-merchant-client-instance", "scope is required", { field: "scope" });
      }
      assertNonBlankString(input.scope.tenantId, "scope.tenantId", "merchant-client-instance");
      assertNonBlankString(input.name, "name", "merchant-client-instance");
      assertNonBlankString(input.merchantIdentity, "merchantIdentity", "merchant-client-instance");
      if (input.externalAccount !== undefined) {
        assertNonBlankString(input.externalAccount, "externalAccount", "merchant-client-instance");
      }
      requireImplementation(input.scope.tenantId, input.implementationId, input.implementationVersion);
      assertNonBlankString(input.credentialRef, "credentialRef", "merchant-client-instance");

      // The credential HANDLE must resolve at the substrate secret-store
      // seam — a binding to a non-existent credential escrow is invalid.
      if (!secrets.resolves(input.credentialRef)) {
        throw new IntegrationsError(
          "unresolved-credential-ref",
          "credentialRef does not resolve at the secret-store seam",
          {},
        );
      }

      const tenantKey = input.scope.tenantId as string;
      const instances = layer(input.scope.tenantId);
      const idKey = (input.id ?? (`merchant-client-instance-${++minted}` as MerchantClientInstanceId)) as string;
      const versions = instances.get(idKey);
      const priorLatest = versions === undefined || versions.size === 0 ? undefined : versions.get(Math.max(...versions.keys()));
      const nextVersion = versions === undefined || versions.size === 0 ? 1 : Math.max(...versions.keys()) + 1;

      // Instance names are unique per tenant across DISTINCT instance ids
      // (an append to the SAME id may keep or correct its own name).
      const nameChanged = priorLatest !== undefined && priorLatest.name !== input.name;
      if (priorLatest === undefined || nameChanged) {
        const taken = names.get(tenantKey)?.get(input.name);
        if (taken !== undefined && (taken as string) !== idKey) {
          throw new IntegrationsError(
            "duplicate-merchant-client-instance",
            `instance name "${input.name}" is already used in this tenant`,
            { name: input.name },
          );
        }
      }

      const record: MerchantClientInstance = deepFreeze({
        id: idKey as MerchantClientInstanceId,
        version: nextVersion as Version,
        scope: input.scope,
        name: input.name,
        merchantIdentity: input.merchantIdentity,
        ...(input.externalAccount !== undefined ? { externalAccount: input.externalAccount } : {}),
        implementationId: input.implementationId,
        implementationVersion: input.implementationVersion,
        credentialRef: input.credentialRef,
        createdAt: now() as MerchantClientInstance["createdAt"],
      });

      if (versions === undefined) {
        instances.set(idKey, new Map<number, MerchantClientInstance>([[nextVersion, record]]));
        const ids = order.get(tenantKey) ?? [];
        ids.push(record.id);
        order.set(tenantKey, ids);
      } else {
        versions.set(nextVersion, record);
      }
      const tenantNames = names.get(tenantKey) ?? new Map<string, MerchantClientInstanceId>();
      tenantNames.set(input.name, record.id);
      names.set(tenantKey, tenantNames);
      return record;
    },

    get(
      tenantId: TenantId,
      instanceId: MerchantClientInstanceId,
      version: Version,
    ): MerchantClientInstance | undefined {
      return layer(tenantId).get(instanceId as string)?.get(version as number);
    },

    getLatest(tenantId: TenantId, instanceId: MerchantClientInstanceId): MerchantClientInstance | undefined {
      return latestOf(tenantId, instanceId);
    },

    listVersions(tenantId: TenantId, instanceId: MerchantClientInstanceId): readonly Version[] {
      const versions = layer(tenantId).get(instanceId as string);
      if (versions === undefined) {
        return [];
      }
      return [...versions.keys()].sort((a, b) => a - b) as Version[];
    },

    listForTenant(tenantId: TenantId): readonly MerchantClientInstanceId[] {
      return order.get(tenantId as string) ?? [];
    },

    recordRebind(input: MerchantClientRebindInput): MerchantClientInstance {
      assertExactFields(input, REBIND_FIELDS, "merchant-client-instance");
      if (input.scope === undefined || typeof input.scope !== "object") {
        throw new IntegrationsError("invalid-merchant-client-instance", "scope is required", { field: "scope" });
      }
      assertNonBlankString(input.scope.tenantId, "scope.tenantId", "merchant-client-instance");
      const latest = latestOf(input.scope.tenantId, input.instanceId);
      if (latest === undefined) {
        // Cross-tenant ≡ unknown — no existence leaks (§31).
        throw new IntegrationsError(
          "unknown-merchant-client-instance",
          "instance is not registered in this tenant",
          {},
        );
      }
      requireImplementation(input.scope.tenantId, input.implementationId, input.implementationVersion);

      const versions = layer(input.scope.tenantId).get(input.instanceId as string) as Map<
        number,
        MerchantClientInstance
      >;
      const nextVersion = latest.version + 1;
      // APPEND-ONLY rebind: the prior binding stays resolvable — §30 records
      // issued before the rebind keep naming the implementation version that
      // actually served them.
      const rebound: MerchantClientInstance = deepFreeze({
        ...latest,
        version: nextVersion as Version,
        implementationId: input.implementationId,
        implementationVersion: input.implementationVersion,
        createdAt: now() as MerchantClientInstance["createdAt"],
      });
      versions.set(nextVersion, rebound);
      return rebound;
    },
  };

  return registry;
}
