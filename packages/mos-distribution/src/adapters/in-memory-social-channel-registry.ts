/**
 * In-memory SocialChannelRegistry adapter (SOCIAL-001).
 *
 * Working adapter (not a skeleton): fail-closed registration validation,
 * immutable deep-frozen versioned snapshots keyed per (tenant, id),
 * append-only versioning (registering with a known in-tenant id appends
 * the next version), tenant-scoped reads with cross-tenant ≡ unknown,
 * tenant-unique channel names, and fail-closed validation of the
 * INTEGRATIONS binding (the referenced MerchantClientInstance must
 * resolve IN THE SAME TENANT through the injected registry port — the
 * link is validated, never assumed).
 *
 * DISCLOSED LIMIT: ephemeral process-local scaffold (no durability
 * claim); durable persistence is TL-owned later work behind the same
 * port.
 */

import type { TenantId, Version } from "@mos/contracts";
import type { MerchantClientInstanceRegistryPort } from "@mos/integrations";
import { CAPABILITY_SUPPORT_LEVELS } from "@mos/integrations";

import type { SocialChannel } from "../contracts/social-channel.js";
import type { RegisterSocialChannelInput } from "../contracts/social-channel.js";
import type { SocialProviderCapability } from "../contracts/social-operation.js";
import { SOCIAL_OPERATIONS } from "../contracts/social-operation.js";
import type { SocialChannelId } from "../contracts/ids.js";
import { DistributionError } from "../errors.js";
import type { SocialChannelRegistryPort } from "../ports/social-channel-registry.port.js";
import {
  assertArray,
  assertExactFields,
  assertNonBlankString,
  assertPlainObject,
  assertVocabularyMember,
  deepFreeze,
  defaultNow,
} from "./registry-support.js";

const INPUT_FIELDS = [
  "id",
  "scope",
  "name",
  "providerId",
  "displayName",
  "instanceRef",
  "externalAccount",
  "capabilityMatrix",
] as const;

const MATRIX_ENTRY_FIELDS = ["operation", "support", "note"] as const;

/** Options for the in-memory channel registry. */
export interface InMemorySocialChannelRegistryOptions {
  /**
   * The integrations layer-3 registry the channel's instanceRef is
   * validated against (fail-closed: the instance must exist IN THE SAME
   * TENANT — cross-tenant ≡ unknown).
   */
  readonly instances: MerchantClientInstanceRegistryPort;
  /** Injectable clock (deterministic tests). */
  readonly now?: () => string;
}

/**
 * Creates the in-memory {@link SocialChannelRegistryPort} adapter.
 */
export function createInMemorySocialChannelRegistry(
  options: InMemorySocialChannelRegistryOptions,
): SocialChannelRegistryPort {
  const instances = options.instances;
  const now = options.now ?? defaultNow;
  /** tenantKey → channelId → version → frozen record. */
  const byTenant = new Map<string, Map<string, Map<number, SocialChannel>>>();
  /** tenantKey → channel name → channel id (tenant-unique names). */
  const namesByTenant = new Map<string, Map<string, SocialChannelId>>();
  /** tenantKey → insertion-ordered channel ids. */
  const order = new Map<string, SocialChannelId[]>();
  let minted = 0;

  function layer(tenantId: TenantId): Map<string, Map<number, SocialChannel>> {
    const key = tenantId as string;
    let channels = byTenant.get(key);
    if (channels === undefined) {
      channels = new Map<string, Map<number, SocialChannel>>();
      byTenant.set(key, channels);
    }
    return channels;
  }

  function validateMatrix(value: unknown): readonly SocialProviderCapability[] {
    assertArray(value, "capabilityMatrix", "social-channel");
    const matrix = value as readonly SocialProviderCapability[];
    const seen = new Set<string>();
    for (const entry of matrix) {
      assertPlainObject(entry, "capabilityMatrix[]", "social-channel");
      assertExactFields(entry as object, MATRIX_ENTRY_FIELDS, "social-channel");
      assertVocabularyMember(
        (entry as { operation: unknown }).operation,
        SOCIAL_OPERATIONS,
        "capabilityMatrix[].operation",
        "social-channel",
      );
      assertVocabularyMember(
        (entry as { support: unknown }).support,
        CAPABILITY_SUPPORT_LEVELS,
        "capabilityMatrix[].support",
        "social-channel",
      );
      if ((entry as { note?: unknown }).note !== undefined) {
        assertNonBlankString((entry as { note?: unknown }).note, "capabilityMatrix[].note", "social-channel");
      }
      const operationKey = (entry as { operation: string }).operation;
      if (seen.has(operationKey)) {
        throw new DistributionError(
          "invalid-social-channel",
          `capabilityMatrix lists operation ${operationKey} more than once — one declaration per operation`,
          { field: "capabilityMatrix", operation: operationKey },
        );
      }
      seen.add(operationKey);
    }
    return matrix;
  }

  const registry: SocialChannelRegistryPort = {
    register(input: RegisterSocialChannelInput): SocialChannel {
      assertExactFields(input, INPUT_FIELDS, "social-channel");
      if (input.scope === undefined || typeof input.scope !== "object") {
        throw new DistributionError("invalid-social-channel", "scope is required", { field: "scope" });
      }
      assertNonBlankString(input.scope.tenantId, "scope.tenantId", "social-channel");
      assertNonBlankString(input.name, "name", "social-channel");
      assertNonBlankString(input.providerId, "providerId", "social-channel");
      assertNonBlankString(input.displayName, "displayName", "social-channel");
      assertNonBlankString(input.instanceRef, "instanceRef", "social-channel");
      if (input.externalAccount !== undefined) {
        assertNonBlankString(input.externalAccount, "externalAccount", "social-channel");
      }
      const capabilityMatrix = validateMatrix(input.capabilityMatrix);

      // The INTEGRATIONS binding is validated fail-closed: the instance
      // must resolve IN THIS TENANT (cross-tenant ≡ unknown — §31 no
      // existence leaks; an unresolvable binding is never silently
      // carried).
      if (instances.getLatest(input.scope.tenantId, input.instanceRef) === undefined) {
        throw new DistributionError(
          "unknown-merchant-client-instance-reference",
          "instanceRef does not resolve to a merchant/client instance in this tenant (the integrations binding is validated, never assumed)",
          { field: "instanceRef" },
        );
      }

      const tenantKey = input.scope.tenantId as string;
      const channels = layer(input.scope.tenantId);
      const names = namesByTenant.get(tenantKey) ?? new Map<string, SocialChannelId>();
      namesByTenant.set(tenantKey, names);

      // Channel names are unique per tenant — but a NEW VERSION of the
      // SAME channel id re-registering its own name is the append-only
      // correction path, not a collision.
      const idKey = (input.id ?? (`social-channel-${++minted}` as SocialChannelId)) as string;
      const existingVersions = channels.get(idKey);
      const nameOwner = names.get(input.name);
      if (
        nameOwner !== undefined &&
        (nameOwner as string) !== idKey
      ) {
        throw new DistributionError(
          "duplicate-social-channel",
          `channel name "${input.name}" is already registered in this tenant`,
          { field: "name", name: input.name },
        );
      }

      const nextVersion = existingVersions === undefined ? 1 : Math.max(...existingVersions.keys()) + 1;

      const record: SocialChannel = deepFreeze({
        id: idKey as SocialChannelId,
        version: nextVersion as Version,
        scope: input.scope,
        name: input.name,
        providerId: input.providerId,
        displayName: input.displayName,
        instanceRef: input.instanceRef,
        capabilityMatrix,
        ...(input.externalAccount !== undefined ? { externalAccount: input.externalAccount } : {}),
        createdAt: now() as SocialChannel["createdAt"],
      });

      if (existingVersions === undefined) {
        channels.set(idKey, new Map<number, SocialChannel>([[nextVersion, record]]));
        const ids = order.get(tenantKey) ?? [];
        ids.push(record.id);
        order.set(tenantKey, ids);
      } else {
        existingVersions.set(nextVersion, record);
      }
      names.set(input.name, record.id);
      return record;
    },

    get(tenantId: TenantId, channelId: SocialChannelId, version: Version): SocialChannel | undefined {
      return layer(tenantId).get(channelId as string)?.get(version as number);
    },

    getLatest(tenantId: TenantId, channelId: SocialChannelId): SocialChannel | undefined {
      const versions = layer(tenantId).get(channelId as string);
      if (versions === undefined || versions.size === 0) {
        return undefined;
      }
      const latest = Math.max(...versions.keys());
      return versions.get(latest);
    },

    listVersions(tenantId: TenantId, channelId: SocialChannelId): readonly Version[] {
      const versions = layer(tenantId).get(channelId as string);
      if (versions === undefined) {
        return [];
      }
      return [...versions.keys()].sort((a, b) => a - b) as Version[];
    },

    listForTenant(tenantId: TenantId): readonly SocialChannelId[] {
      return order.get(tenantId as string) ?? [];
    },
  };

  return registry;
}
