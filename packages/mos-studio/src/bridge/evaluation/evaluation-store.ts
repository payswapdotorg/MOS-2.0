/**
 * BRIDGE-002 evaluation store — the append-only, versioned, tenant-scoped
 * record store behind the §19 Studio-output evaluation authority.
 *
 * Construction disciplines (W9-B, by construction — the BRIDGE-001 store
 * discipline): D1/D2 exact-tenant JSON-array keys; D3 clone-then-deep-freeze
 * (the caller's draft is never aliased, never frozen in place); D4 frozen
 * scope copies; D5 finite guards at the validation layer BEFORE the store.
 *
 * Append-only discipline: v1 is minted by the §19 decision itself; the ONLY
 * successor path is `appendTreatmentLinkage` over a treatment-creating
 * decision whose linkage is still `awaiting-successor` (the §19 old → new
 * version link, completed by citing the successor the studio's own path
 * composed — same package chain at a later immutable version, or the
 * re-produced output's package after a switch). Exactly ONE successor
 * completes a linkage; prior versions stay bit-for-bit immutable and
 * resolvable. There is no update/delete surface.
 */

import type { TenantScope, IdentityRef } from "@mos/contracts";
import type { StudioSessionId, Timestamp } from "../../contracts/refs.js";
import type { StudioArtifactPackageId } from "../../contracts/refs.js";
import type { StudioOutputEvaluationRecord } from "./contracts/studio-output-evaluation.js";

// ---------------------------------------------------------------------------
// Deep freeze / clone helpers (pure-data records only — the store's payloads
// carry no functions by construction)
// ---------------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** The store's private structural copy (D3 — never the caller's object). */
function cloneForStore(record: StudioOutputEvaluationRecord): StudioOutputEvaluationRecord {
  return {
    ...structuredClone({
      ...record,
      // D4: the record owns a fresh frozen copy of the caller's scope.
      scope: { tenantId: record.scope.tenantId, workspaceId: record.scope.workspaceId },
    }),
  };
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/** The append-only evaluation store (internal to the authority; test-visible). */
export interface StudioOutputEvaluationStore {
  /** Append version 1 of a new evaluation (the §19 decision's own record). */
  appendFirstVersion(record: StudioOutputEvaluationRecord): StudioOutputEvaluationRecord;
  /**
   * Append the `treatment-linked` successor version over an open linkage.
   * Fails closed (typed string reasons) on unknown/cross-tenant evaluation
   * ids, non-treatment decisions, already-completed linkages, or successors
   * that are not a later immutable version of the same package chain (the
   * re-produced shape — a different package id — is the disclosed switch
   * completion and passes the structural check).
   */
  appendTreatmentLinkage(
    scope: TenantScope,
    evaluationId: string,
    successor: {
      readonly successorKind: "treatment-successor" | "re-produced-output";
      readonly packageId: string;
      readonly version: number;
      readonly sessionRef: StudioSessionId;
      readonly linkedBy: IdentityRef;
      readonly linkedAt: Timestamp;
    },
  ): { ok: true; record: StudioOutputEvaluationRecord } | { ok: false; reason: string };
  /** One evaluation version (latest, or the exact version) — cross-tenant ≡ unknown. */
  getEvaluation(
    scope: TenantScope,
    evaluationId: string,
    version?: number,
  ): StudioOutputEvaluationRecord | undefined;
  /** Every evaluation chain's latest version of one tenant (creation order). */
  listLatestEvaluations(scope: TenantScope): readonly StudioOutputEvaluationRecord[];
  /** The full append-only version chain of one evaluation (ascending). */
  listEvaluationVersions(
    scope: TenantScope,
    evaluationId: string,
  ): readonly StudioOutputEvaluationRecord[];
}

/** Create the in-memory append-only evaluation store (the disclosed store double). */
export function createStudioOutputEvaluationStore(): StudioOutputEvaluationStore {
  /** JSON-array keys: tenantId → evaluationId → version chain (D1/D2 exact keys). */
  const chains = new Map<string, StudioOutputEvaluationRecord[]>();
  /** tenantId → evaluationIds in first-seen order (listing discipline). */
  const order = new Map<string, string[]>();

  const tenantKeyOf = (scope: TenantScope): string => JSON.stringify([String(scope.tenantId)]);
  const chainKeyOf = (scope: TenantScope, evaluationId: string): string =>
    JSON.stringify([String(scope.tenantId), evaluationId]);

  return {
    appendFirstVersion(record) {
      const chainKey = chainKeyOf(record.scope, record.id);
      if (chains.get(chainKey) !== undefined) {
        // Fail loud — the authority mints one evaluation id per decision; a
        // collision here is an authority defect, never a silent overwrite.
        throw new Error(`studio-output-evaluation store: evaluation id collision on ${chainKey}`);
      }
      // D3/D4: clone-then-deep-freeze — the caller's record is never aliased.
      const stored = deepFreeze(cloneForStore(record));
      chains.set(chainKey, [stored]);
      const tenantKey = tenantKeyOf(record.scope);
      order.set(tenantKey, [...(order.get(tenantKey) ?? []), record.id]);
      return stored;
    },
    appendTreatmentLinkage(scope, evaluationId, successor) {
      const chainKey = chainKeyOf(scope, evaluationId);
      const chain = chains.get(chainKey);
      if (chain === undefined || chain.length === 0) {
        return { ok: false, reason: "evaluation-unresolved: no evaluation chain resolves for this tenant scope" };
      }
      const latest = chain[chain.length - 1];
      if (latest === undefined) {
        return { ok: false, reason: "evaluation-unresolved: empty evaluation chain" };
      }
      const linkage = latest.treatmentLinkage;
      if (linkage === null) {
        return { ok: false, reason: `linkage-not-open: the ${String(latest.decision.kind)} decision creates no treatment linkage (only request-treatment and switch-* do)` };
      }
      if (linkage.phase === "linked") {
        return { ok: false, reason: `linkage-already-completed: successor ${String(linkage.successorPackageRef.packageId)}@v${String(linkage.successorPackageRef.version)} already completed this linkage (append-only — exactly one successor)` };
      }
      const prior = linkage.priorPackageRef;
      const sameChain =
        String(successor.packageId) === String(prior.packageId) && successor.version > prior.version;
      const reProduced =
        successor.successorKind === "re-produced-output" &&
        String(successor.packageId) !== String(prior.packageId);
      if (!sameChain && !reProduced) {
        return {
          ok: false,
          reason: `successor-not-linked: ${String(successor.packageId)}@v${String(successor.version)} is not a later immutable version of package ${String(prior.packageId)} (prior v${String(prior.version)}) nor a disclosed re-produced output`,
        };
      }
      const completedLinkage = {
        phase: "linked",
        decisionKind: linkage.decisionKind,
        priorPackageRef: prior,
        directive: linkage.directive,
        reservedAt: linkage.reservedAt,
        successorKind: successor.successorKind,
        successorPackageRef: {
          // The single disclosed brand-bridge point: the successor id was
          // already proven through the canonical packaging authority by the
          // core's resolve call before the store sees it.
          packageId: successor.packageId as StudioArtifactPackageId,
          version: successor.version,
          sessionRef: successor.sessionRef,
        },
        linkedBy: successor.linkedBy,
        linkedAt: successor.linkedAt,
      } as const;
      const successorRecord: StudioOutputEvaluationRecord = {
        ...structuredClone(latest),
        status: "treatment-linked",
        treatmentLinkage: completedLinkage,
        version: latest.version + 1,
        priorVersion: latest.version,
      };
      const stored = deepFreeze(cloneForStore(successorRecord));
      chain.push(stored);
      return { ok: true, record: stored };
    },
    getEvaluation(scope, evaluationId, version) {
      const chain = chains.get(chainKeyOf(scope, evaluationId));
      if (chain === undefined || chain.length === 0) {
        return undefined;
      }
      if (version === undefined) {
        return chain[chain.length - 1];
      }
      return chain.find((record) => record.version === version);
    },
    listLatestEvaluations(scope) {
      const entryIds = order.get(tenantKeyOf(scope));
      if (entryIds === undefined) {
        return [];
      }
      const latest: StudioOutputEvaluationRecord[] = [];
      for (const evaluationId of entryIds) {
        const chain = chains.get(chainKeyOf(scope, evaluationId));
        const record = chain?.[chain.length - 1];
        if (record !== undefined) {
          latest.push(record);
        }
      }
      return latest;
    },
    listEvaluationVersions(scope, evaluationId) {
      const chain = chains.get(chainKeyOf(scope, evaluationId));
      return chain === undefined ? [] : [...chain];
    },
  };
}