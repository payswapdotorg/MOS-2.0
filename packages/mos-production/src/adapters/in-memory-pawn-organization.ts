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
import { cloneThenFreezeRecord } from "./registry-support.js";
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
  /** JSON array keys `[tenantId, organizationId]` → versions ascending
   * (W9-B: injective over the tuple — hostile delimiter-laden tenant ids
   * cannot alias another tenant's organizations; the W3-A class). */
  const byKey = new Map<string, Map<number, TransformPawnOrganizationRecord>>();

  const keyOf = (tenantId: string, organizationId: string): string =>
    JSON.stringify([tenantId, organizationId]);

  function versionsOf(
    scope: TenantScope,
    organizationId: PawnAgentOrganizationId,
  ): Map<number, TransformPawnOrganizationRecord> | undefined {
    return byKey.get(keyOf(scope.tenantId as string, organizationId as string));
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
      const key = keyOf(scope.tenantId as string, input.organizationId as string);
      let versions = byKey.get(key);
      if (versions === undefined) {
        versions = new Map<number, TransformPawnOrganizationRecord>();
        byKey.set(key, versions);
      }
      const nextVersion = ([...versions.keys()].at(-1) ?? 0) + 1;
      // DEEP-frozen PRIVATE snapshot (W9-B clone-then-freeze): nested
      // node/edge/assignment objects and the policies stay immutable through
      // the returned record AND the caller's policy objects are never frozen
      // in place (pinned by the append-only registry tests).
      const versioned = cloneThenFreezeRecord({ ...record, version: nextVersion as Version });
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
      const latest: TransformPawnOrganizationRecord[] = [];
      for (const [, versions] of byKey) {
        // W9-B: EXACT tenant equality on the stored record (never a prefix
        // scan — a delimiter-laden tenant id must not widen the match).
        const top = [...versions.keys()].at(-1);
        if (top === undefined) continue;
        const record = versions.get(top);
        if (record === undefined) continue;
        if ((record.tenantId as string) !== (scope.tenantId as string)) continue;
        latest.push(record);
      }
      return latest;
    },
  };
}
