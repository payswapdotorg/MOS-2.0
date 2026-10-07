/**
 * In-memory transform pawn organization registry (LAB-013) — the
 * TransformPawnOrganizationPort adapter.
 *
 * Composes the canonical organization record from pawn citations (pure
 * compose in domain/pawn-organization-compose.ts — this package never
 * re-implements organization semantics) and registers it append-only,
 * tenant-scoped: re-registering an existing id appends version + 1 and
 * every prior version stays resolvable bit-for-bit. Cross-tenant reads are
 * indistinguishable from unknown (no existence leaks).
 *
 * DISCLOSED DOUBLE: process-local map (durable organization storage is
 * composition-root work behind the same port).
 */

import type { TenantScope, Version } from "@mos/contracts";

import { PawnExecutionError } from "../domain/errors.js";
import { deepFreezeRecord } from "./registry-support.js";
import {
  composeTransformPawnOrganization,
} from "../domain/pawn-organization-compose.js";
import type {
  ComposeTransformPawnOrganizationInput,
  TransformPawnOrganizationRecord,
} from "../contracts/pawn-organization.js";
import type { PawnAgentOrganizationId } from "../contracts/pawn-ids.js";
import type { TransformPawnOrganizationPort } from "../ports/pawn-organization.port.js";
import type { TransformPawnBody } from "../contracts/pawn-body.js";

/** Options for the in-memory pawn organization registry. */
export interface InMemoryPawnOrganizationRegistryOptions {
  /** The registered pawn bodies (the execution port's `listPawnBodies`). */
  readonly listPawnBodies: () => readonly TransformPawnBody[];
}

/** Creates the in-memory {@link TransformPawnOrganizationPort} adapter. */
export function createInMemoryPawnOrganizationRegistry(
  options: InMemoryPawnOrganizationRegistryOptions,
): TransformPawnOrganizationPort {
  /** `${tenantId}\u0000${organizationId}` → versions ascending. */
  const byKey = new Map<string, Map<number, TransformPawnOrganizationRecord>>();

  function versionsOf(
    scope: TenantScope,
    organizationId: PawnAgentOrganizationId,
  ): Map<number, TransformPawnOrganizationRecord> | undefined {
    return byKey.get(`${scope.tenantId as string}\u0000${organizationId as string}`);
  }

  return {
    registerPawnOrganization(
      scope: TenantScope,
      input: ComposeTransformPawnOrganizationInput,
    ): TransformPawnOrganizationRecord {
      const { record, reasons } = composeTransformPawnOrganization(
        input,
        options.listPawnBodies(),
      );
      if (record === null) {
        throw new PawnExecutionError(
          "invalid-pawn-organization",
          reasons.map((reason) => `${reason.code}: ${reason.detail}`).join("; "),
        );
      }
      const key = `${scope.tenantId as string}\u0000${input.organizationId as string}`;
      let versions = byKey.get(key);
      if (versions === undefined) {
        versions = new Map<number, TransformPawnOrganizationRecord>();
        byKey.set(key, versions);
      }
      const nextVersion = ([...versions.keys()].at(-1) ?? 0) + 1;
      // DEEP-frozen snapshot: nested node/edge/assignment objects and the
      // policies stay immutable through the returned record (pinned by the
      // append-only registry tests).
      const versioned = deepFreezeRecord({ ...record, version: nextVersion as Version });
      versions.set(nextVersion, versioned);
      return versioned;
    },

    getPawnOrganization(
      scope: TenantScope,
      organizationId: PawnAgentOrganizationId,
      version?: Version,
    ): TransformPawnOrganizationRecord | undefined {
      const versions = versionsOf(scope, organizationId);
      if (versions === undefined) return undefined;
      if (version === undefined) {
        const top = [...versions.keys()].at(-1);
        return top === undefined ? undefined : versions.get(top);
      }
      return versions.get(version as number);
    },

    listPawnOrganizations(scope: TenantScope): readonly TransformPawnOrganizationRecord[] {
      const prefix = `${scope.tenantId as string}\u0000`;
      const latest: TransformPawnOrganizationRecord[] = [];
      for (const [key, versions] of byKey) {
        if (!key.startsWith(prefix)) continue;
        const top = [...versions.keys()].at(-1);
        if (top !== undefined) {
          latest.push(versions.get(top) as TransformPawnOrganizationRecord);
        }
      }
      return latest;
    },
  };
}
