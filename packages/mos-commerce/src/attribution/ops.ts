/**
 * ATTRIB-001 — the attribution service: versioned, tenant-scoped,
 * append-only records linking social observations to commerce discovery
 * candidates by opaque reference; corrections append; every free-text
 * field passes the causality guard.
 */
import type { IdentityRef, TenantId, TenantScope } from "@mos/contracts";
import type {
  AttributionBasis,
  AttributionCorrection,
  AttributionError,
  AttributionId,
  AttributionRecord,
  SocialObservationRef,
} from "./types.js";
import { validateAttribution, validateNoCausalityVocabulary } from "./validation.js";
import {
  cloneAndDeepFreeze,
  commerceDiscoveryIdDefault,
  commerceDiscoveryNowDefault,
  frozenTenantScope,
  type CommerceDiscoveryClock,
} from "../helpers.js";

/** D1: composite store keys — tenant + attribution id. */
const storeKey = (tenantId: TenantId, id: AttributionId): string =>
  `${tenantId}::${id}`;

export interface AttributionServiceOptions {
  readonly clock?: CommerceDiscoveryClock;
  readonly nextId?: () => string;
}

export interface CreateAttributionInput {
  readonly tenantId: TenantId;
  readonly tenantScope: TenantScope;
  readonly socialObservationRef: SocialObservationRef;
  readonly commerceCandidate: {
    readonly discoveryId: string;
    readonly version: number;
  };
  /** The declared linking basis (causality-guarded; kind validated against the frozen vocabulary). */
  readonly basis: AttributionBasis | { kind: string; note: string };
  /** §30 actor declaring the attribution. */
  readonly declaredBy: IdentityRef;
}

export type AttributionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AttributionError };

export class AttributionService {
  private readonly records = new Map<string, AttributionRecord>();
  private readonly clock: CommerceDiscoveryClock;
  private readonly nextId: () => string;

  constructor(options: AttributionServiceOptions = {}) {
    this.clock = options.clock ?? commerceDiscoveryNowDefault;
    this.nextId = options.nextId ?? (() => `attribution:${commerceDiscoveryIdDefault()}`);
  }

  /** Create a v1 attribution (validated, causality-guarded, frozen). */
  create(input: CreateAttributionInput): AttributionResult<AttributionRecord> {
    const invalid = validateAttribution(input);
    if (invalid) return { ok: false, error: invalid };
    const id = this.nextId() as AttributionId;
    const key = storeKey(input.tenantId, id);
    if (this.records.has(key)) {
      return {
        ok: false,
        error: { code: "DUPLICATE_ID", message: `attribution id already exists: ${id}` },
      };
    }
    const now = this.clock();
    const record: AttributionRecord = {
      id,
      tenantId: input.tenantId,
      tenantScope: frozenTenantScope(input.tenantScope),
      version: 1,
      socialObservationRef: input.socialObservationRef,
      commerceCandidate: cloneAndDeepFreeze(input.commerceCandidate),
      basis: cloneAndDeepFreeze(input.basis) as AttributionBasis,
      declaredBy: cloneAndDeepFreeze(input.declaredBy),
      createdAt: now,
      updatedAt: now,
      corrections: [],
    };
    const sealed = cloneAndDeepFreeze(record);
    this.records.set(key, sealed);
    return { ok: true, value: cloneAndDeepFreeze(sealed) };
  }

  /** Exact-tenant fetch (D2: no prefix scans, no existence leaks). */
  get(tenantId: TenantId, id: AttributionId): AttributionResult<AttributionRecord> {
    const record = this.records.get(storeKey(tenantId, id));
    if (!record) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: `no attribution ${id} for this tenant` },
      };
    }
    return { ok: true, value: cloneAndDeepFreeze(record) };
  }

  /** Exact-tenant listing by cited observation (D2). */
  listForObservation(
    tenantId: TenantId,
    socialObservationRef: SocialObservationRef,
  ): ReadonlyArray<AttributionRecord> {
    const out: AttributionRecord[] = [];
    for (const record of this.records.values()) {
      if (
        record.tenantId === tenantId &&
        record.socialObservationRef === socialObservationRef
      ) {
        out.push(cloneAndDeepFreeze(record));
      }
    }
    return out;
  }

  /** Exact-tenant listing by cited discovery candidate (D2). */
  listForCandidate(
    tenantId: TenantId,
    discoveryId: string,
  ): ReadonlyArray<AttributionRecord> {
    const out: AttributionRecord[] = [];
    for (const record of this.records.values()) {
      if (
        record.tenantId === tenantId &&
        record.commerceCandidate.discoveryId === discoveryId
      ) {
        out.push(cloneAndDeepFreeze(record));
      }
    }
    return out;
  }

  /**
   * Append one correction (version+1). Only the basis note is correctable —
   * the cited refs are immutable (a correction of a citation is a NEW
   * attribution; the observation and candidate ends never move under an
   * existing record).
   */
  correct(
    tenantId: TenantId,
    id: AttributionId,
    correctedBy: IdentityRef,
    reason: string,
    patch: { basis?: AttributionBasis | { kind: string; note: string } },
  ): AttributionResult<AttributionRecord> {
    const current = this.records.get(storeKey(tenantId, id));
    if (!current) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: `no attribution ${id} for this tenant` },
      };
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: "INVALID_BASIS",
          message: "a correction requires a non-blank §30-attributable reason",
        },
      };
    }
    const reasonGuard = validateNoCausalityVocabulary("reason", reason);
    if (reasonGuard) return { ok: false, error: reasonGuard };
    let basis = current.basis;
    const changed: string[] = [];
    if (patch.basis) {
      const basisGuard = validateNoCausalityVocabulary("basis.note", patch.basis.note);
      if (basisGuard) return { ok: false, error: basisGuard };
      basis = cloneAndDeepFreeze(patch.basis) as AttributionBasis;
      changed.push("basis");
    }
    const correction: AttributionCorrection = {
      version: current.version + 1,
      at: this.clock(),
      correctedBy: cloneAndDeepFreeze(correctedBy),
      reason: reason.trim(),
      changed,
    };
    const next: AttributionRecord = {
      ...current,
      basis,
      version: correction.version,
      updatedAt: correction.at,
      corrections: [...current.corrections, correction],
    };
    const sealed = cloneAndDeepFreeze(next);
    this.records.set(storeKey(tenantId, id), sealed);
    return { ok: true, value: cloneAndDeepFreeze(sealed) };
  }
}
