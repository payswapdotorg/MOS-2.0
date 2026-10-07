/**
 * In-memory ProviderDefinitionRegistry adapter (INTEG-001, layer 1).
 *
 * Working adapter (not a skeleton): fail-closed registration validation,
 * immutable deep-frozen versioned snapshots keyed per (tenant, id),
 * append-only versioning (registering with a known in-tenant id appends
 * the next version), tenant-scoped reads with cross-tenant ≡ unknown.
 * Durable persistence is TL-owned later work; the port is unchanged.
 *
 * DISCLOSED LIMIT: ephemeral process-local scaffold (no durability claim).
 */

import type { TenantId, Version } from "@mos/contracts";

import type { ProviderDefinition } from "../contracts/provider-definition.js";
import type {
  RegisterProviderDefinitionInput,
  TransportContractSurface,
} from "../contracts/provider-definition.js";
import {
  CAPABILITY_SUPPORT_LEVELS,
  PROVIDER_KINDS,
  TRANSPORT_KINDS,
} from "../contracts/provider-definition.js";
import type { ProviderDefinitionId } from "../contracts/ids.js";
import { IntegrationsError } from "../errors.js";
import type { ProviderDefinitionRegistryPort } from "../ports/provider-definition-registry.port.js";
import {
  assertArray,
  assertExactFields,
  assertNonBlankString,
  assertPlainObject,
  assertVocabularyMember,
  deepFreeze,
} from "./registry-support.js";

const INPUT_FIELDS = [
  "id",
  "scope",
  "providerId",
  "displayName",
  "kind",
  "transport",
  "declaredCapabilities",
  "externalAccount",
] as const;

const TRANSPORT_FIELDS = ["transportKind", "authentication", "invocationContract"] as const;
const AUTHENTICATION_FIELDS = ["kind", "managedBy"] as const;
const DECLARED_ENTRY_FIELDS = ["capabilityId", "support", "note"] as const;

function validateTransport(transport: unknown): TransportContractSurface {
  assertPlainObject(transport, "transport", "provider-definition");
  assertExactFields(transport as object, TRANSPORT_FIELDS, "provider-definition");
  const surface = transport as TransportContractSurface;
  assertVocabularyMember(surface.transportKind, TRANSPORT_KINDS, "transport.transportKind", "provider-definition");
  assertPlainObject(surface.authentication, "transport.authentication", "provider-definition");
  assertExactFields(surface.authentication as object, AUTHENTICATION_FIELDS, "provider-definition");
  assertNonBlankString(
    (surface.authentication as { kind: unknown }).kind,
    "transport.authentication.kind",
    "provider-definition",
  );
  assertVocabularyMember(
    (surface.authentication as { managedBy: unknown }).managedBy,
    ["integrations", "caller"],
    "transport.authentication.managedBy",
    "provider-definition",
  );
  assertPlainObject(surface.invocationContract, "transport.invocationContract", "provider-definition");
  return surface;
}

/**
 * Creates an in-memory {@link ProviderDefinitionRegistryPort} adapter.
 */
export function createInMemoryProviderDefinitionRegistry(): ProviderDefinitionRegistryPort {
  /** tenantKey → definitionId → version → frozen record. */
  const byTenant = new Map<string, Map<string, Map<number, ProviderDefinition>>>();
  /** tenantKey → insertion-ordered definition ids. */
  const order = new Map<string, ProviderDefinitionId[]>();
  let minted = 0;

  function layer(tenantId: TenantId): Map<string, Map<number, ProviderDefinition>> {
    const key = tenantId as string;
    let definitions = byTenant.get(key);
    if (definitions === undefined) {
      definitions = new Map<string, Map<number, ProviderDefinition>>();
      byTenant.set(key, definitions);
    }
    return definitions;
  }

  const registry: ProviderDefinitionRegistryPort = {
    register(input: RegisterProviderDefinitionInput): ProviderDefinition {
      assertExactFields(input, INPUT_FIELDS, "provider-definition");
      if (input.scope === undefined || typeof input.scope !== "object") {
        throw new IntegrationsError("invalid-provider-definition", "scope is required", { field: "scope" });
      }
      assertNonBlankString(input.scope.tenantId, "scope.tenantId", "provider-definition");
      assertNonBlankString(input.providerId, "providerId", "provider-definition");
      assertNonBlankString(input.displayName, "displayName", "provider-definition");
      assertVocabularyMember(input.kind, PROVIDER_KINDS, "kind", "provider-definition");
      const transport = validateTransport(input.transport);
      assertArray(input.declaredCapabilities, "declaredCapabilities", "provider-definition");
      const seen = new Set<string>();
      for (const entry of input.declaredCapabilities) {
        assertPlainObject(entry, "declaredCapabilities[]", "provider-definition");
        assertExactFields(entry as object, DECLARED_ENTRY_FIELDS, "provider-definition");
        assertNonBlankString(
          (entry as { capabilityId: unknown }).capabilityId,
          "declaredCapabilities[].capabilityId",
          "provider-definition",
        );
        assertVocabularyMember(
          (entry as { support: unknown }).support,
          CAPABILITY_SUPPORT_LEVELS,
          "declaredCapabilities[].support",
          "provider-definition",
        );
        const idKey = (entry as { capabilityId: string }).capabilityId as string;
        if (seen.has(idKey)) {
          throw new IntegrationsError(
            "invalid-provider-definition",
            `declaredCapabilities lists capability ${idKey} more than once — one declaration per capability`,
            { field: "declaredCapabilities", capabilityId: idKey },
          );
        }
        seen.add(idKey);
      }
      if (input.externalAccount !== undefined) {
        assertNonBlankString(input.externalAccount, "externalAccount", "provider-definition");
      }

      const tenantKey = input.scope.tenantId as string;
      const definitions = layer(input.scope.tenantId);
      const idKey = (input.id ?? (`provider-definition-${++minted}` as ProviderDefinitionId)) as string;
      const versions = definitions.get(idKey);
      const nextVersion = versions === undefined ? 1 : Math.max(...versions.keys()) + 1;

      const record: ProviderDefinition = deepFreeze({
        id: idKey as ProviderDefinitionId,
        version: nextVersion as Version,
        scope: input.scope,
        providerId: input.providerId,
        displayName: input.displayName,
        kind: input.kind,
        transport,
        declaredCapabilities: input.declaredCapabilities,
        ...(input.externalAccount !== undefined ? { externalAccount: input.externalAccount } : {}),
      });

      if (versions === undefined) {
        definitions.set(idKey, new Map<number, ProviderDefinition>([[nextVersion, record]]));
        const ids = order.get(tenantKey) ?? [];
        ids.push(record.id);
        order.set(tenantKey, ids);
      } else {
        versions.set(nextVersion, record);
      }
      return record;
    },

    get(tenantId: TenantId, definitionId: ProviderDefinitionId, version: Version): ProviderDefinition | undefined {
      return layer(tenantId).get(definitionId as string)?.get(version as number);
    },

    getLatest(tenantId: TenantId, definitionId: ProviderDefinitionId): ProviderDefinition | undefined {
      const versions = layer(tenantId).get(definitionId as string);
      if (versions === undefined || versions.size === 0) {
        return undefined;
      }
      const latest = Math.max(...versions.keys());
      return versions.get(latest);
    },

    listVersions(tenantId: TenantId, definitionId: ProviderDefinitionId): readonly Version[] {
      const versions = layer(tenantId).get(definitionId as string);
      if (versions === undefined) {
        return [];
      }
      return [...versions.keys()].sort((a, b) => a - b) as Version[];
    },

    listForTenant(tenantId: TenantId): readonly ProviderDefinitionId[] {
      return order.get(tenantId as string) ?? [];
    },
  };

  return registry;
}
