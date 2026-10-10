/**
 * BRIDGE-003 measurement store — the append-only, versioned, tenant-scoped
 * store for the evidence chains and the outcome chains (W9-B D1–D5 by
 * construction, the experiment-store discipline applied to both families;
 * the digest-sealing covers each family's own payload).
 */

import type { TenantScope } from "@mos/contracts";

import type { ExperimentId } from "../contracts/ids.js";
import type { ExperimentEvidenceRecord } from "../contracts/evidence.js";
import type { ExperimentOutcomeRecord } from "../contracts/outcome.js";
import { digestOf } from "../domain/digest.js";

function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** The evidence digest payload (content only — the digest field excluded). */
const evidencePayloadOf = (record: ExperimentEvidenceRecord): unknown => {
  const { evidenceDigest: _digest, ...payload } = record;
  return payload;
};

/** The outcome digest payload (content only — the digest field excluded). */
const outcomePayloadOf = (record: ExperimentOutcomeRecord): unknown => {
  const { outcomeDigest: _digest, ...payload } = record;
  return payload;
};

/** Recompute the evidence digest of one stored record. */
export const recomputedEvidenceDigestOf = (record: ExperimentEvidenceRecord): string =>
  digestOf(evidencePayloadOf(record));

/** Recompute the outcome digest of one stored record. */
export const recomputedOutcomeDigestOf = (record: ExperimentOutcomeRecord): string =>
  digestOf(outcomePayloadOf(record));

// ---------------------------------------------------------------------------
// The evidence store
// ---------------------------------------------------------------------------

/** The append-only evidence chain store (internal; exposed for tests). */
export interface ExperimentEvidenceStore {
  /** Append version 1 (the declared window — minted with the experiment record). */
  appendFirstVersion(record: ExperimentEvidenceRecord): ExperimentEvidenceRecord;
  /**
   * Append a measured successor version. Fails closed (typed string reason)
   * on unknown/cross-tenant ids or a non-declared latest kind (only the
   * declared window or a prior measured version admits a measured
   * successor).
   */
  appendMeasuredVersion(
    scope: TenantScope,
    evidenceId: ExperimentId,
    successor: ExperimentEvidenceRecord,
  ): { ok: true; record: ExperimentEvidenceRecord } | { ok: false; reason: string };
  /** One evidence record version (latest, or exact) — cross-tenant ≡ unknown. */
  getEvidence(
    scope: TenantScope,
    evidenceId: ExperimentId,
    version?: number,
  ): ExperimentEvidenceRecord | undefined;
  /** The full evidence version chain (ascending). */
  listVersions(scope: TenantScope, evidenceId: ExperimentId): readonly ExperimentEvidenceRecord[];
}

/** Create the in-memory append-only evidence store (the disclosed double). */
export function createExperimentEvidenceStore(): ExperimentEvidenceStore {
  const chains = new Map<string, ExperimentEvidenceRecord[]>();
  const chainKeyOf = (scope: TenantScope, evidenceId: ExperimentId): string =>
    JSON.stringify([String(scope.tenantId), String(evidenceId)]);
  const sealed = (record: ExperimentEvidenceRecord): ExperimentEvidenceRecord => {
    if (recomputedEvidenceDigestOf(record) !== record.evidenceDigest) {
      throw new Error(
        `experiment evidence store: digest mismatch on evidence ${String(record.id)} v${String(record.version)} — the draft is corrupt (never stored)`,
      );
    }
    return deepFreeze(structuredClone(record) as ExperimentEvidenceRecord);
  };
  return {
    appendFirstVersion(record) {
      const chainKey = chainKeyOf({ tenantId: record.tenantId } as TenantScope, record.id);
      if (chains.has(chainKey)) {
        throw new Error(`experiment evidence store: evidence id collision on ${chainKey}`);
      }
      const frozen = sealed(record);
      chains.set(chainKey, [frozen]);
      return frozen;
    },
    appendMeasuredVersion(scope, evidenceId, successor) {
      const chainKey = chainKeyOf(scope, evidenceId);
      const chain = chains.get(chainKey);
      if (chain === undefined || chain.length === 0) {
        return { ok: false, reason: "evidence-not-found: no evidence chain resolves for this tenant scope (§31)" };
      }
      const latest = chain[chain.length - 1];
      if (latest === undefined) {
        return { ok: false, reason: "evidence-not-found: empty evidence chain" };
      }
      if (successor.version !== latest.version + 1) {
        return { ok: false, reason: `version-chain-violation: the measured successor must be version ${String(latest.version + 1)}` };
      }
      if (successor.kind !== "measured-evidence") {
        return { ok: false, reason: "evidence-kind-violation: only measured successors append (the declared window is v1 only)" };
      }
      const frozen = sealed(successor);
      chain.push(frozen);
      return { ok: true, record: frozen };
    },
    getEvidence(scope, evidenceId, version) {
      const chain = chains.get(chainKeyOf(scope, evidenceId));
      if (chain === undefined || chain.length === 0) {
        return undefined;
      }
      if (version === undefined) {
        return chain[chain.length - 1];
      }
      return chain.find((record) => record.version === version);
    },
    listVersions(scope, evidenceId) {
      const chain = chains.get(chainKeyOf(scope, evidenceId));
      return chain === undefined ? [] : [...chain];
    },
  };
}

// ---------------------------------------------------------------------------
// The outcome store
// ---------------------------------------------------------------------------

/** The append-only outcome chain store (internal; exposed for tests). */
export interface ExperimentOutcomeStore {
  /** Append version 1 (the first analysis). Fails closed on collision. */
  appendFirstVersion(record: ExperimentOutcomeRecord): ExperimentOutcomeRecord;
  /**
   * Append a re-analysis successor version. Fails closed (typed string
   * reason) on unknown/cross-tenant ids or version-chain violations.
   */
  appendSuccessorVersion(
    scope: TenantScope,
    outcomeId: ExperimentId,
    successor: ExperimentOutcomeRecord,
  ): { ok: true; record: ExperimentOutcomeRecord } | { ok: false; reason: string };
  /** One outcome record version (latest, or exact) — cross-tenant ≡ unknown. */
  getOutcome(
    scope: TenantScope,
    outcomeId: ExperimentId,
    version?: number,
  ): ExperimentOutcomeRecord | undefined;
  /** The full outcome version chain (ascending). */
  listVersions(scope: TenantScope, outcomeId: ExperimentId): readonly ExperimentOutcomeRecord[];
}

/** Create the in-memory append-only outcome store (the disclosed double). */
export function createExperimentOutcomeStore(): ExperimentOutcomeStore {
  const chains = new Map<string, ExperimentOutcomeRecord[]>();
  const chainKeyOf = (scope: TenantScope, outcomeId: ExperimentId): string =>
    JSON.stringify([String(scope.tenantId), String(outcomeId)]);
  const sealed = (record: ExperimentOutcomeRecord): ExperimentOutcomeRecord => {
    if (recomputedOutcomeDigestOf(record) !== record.outcomeDigest) {
      throw new Error(
        `experiment outcome store: digest mismatch on outcome ${String(record.id)} v${String(record.version)} — the draft is corrupt (never stored)`,
      );
    }
    return deepFreeze(structuredClone(record) as ExperimentOutcomeRecord);
  };
  return {
    appendFirstVersion(record) {
      const chainKey = chainKeyOf({ tenantId: record.tenantId } as TenantScope, record.id);
      if (chains.has(chainKey)) {
        throw new Error(`experiment outcome store: outcome id collision on ${chainKey}`);
      }
      const frozen = sealed(record);
      chains.set(chainKey, [frozen]);
      return frozen;
    },
    appendSuccessorVersion(scope, outcomeId, successor) {
      const chainKey = chainKeyOf(scope, outcomeId);
      const chain = chains.get(chainKey);
      if (chain === undefined || chain.length === 0) {
        return { ok: false, reason: "outcome-not-found: no outcome chain resolves for this tenant scope (§31)" };
      }
      const latest = chain[chain.length - 1];
      if (latest === undefined) {
        return { ok: false, reason: "outcome-not-found: empty outcome chain" };
      }
      if (successor.version !== latest.version + 1) {
        return { ok: false, reason: `version-chain-violation: the re-analysis successor must be version ${String(latest.version + 1)}` };
      }
      const frozen = sealed(successor);
      chain.push(frozen);
      return { ok: true, record: frozen };
    },
    getOutcome(scope, outcomeId, version) {
      const chain = chains.get(chainKeyOf(scope, outcomeId));
      if (chain === undefined || chain.length === 0) {
        return undefined;
      }
      if (version === undefined) {
        return chain[chain.length - 1];
      }
      return chain.find((record) => record.version === version);
    },
    listVersions(scope, outcomeId) {
      const chain = chains.get(chainKeyOf(scope, outcomeId));
      return chain === undefined ? [] : [...chain];
    },
  };
}
