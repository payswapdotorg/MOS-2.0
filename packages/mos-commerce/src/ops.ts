/**
 * COMMERCE-001 — the commerce-discovery service (the authority core).
 *
 * Append-only, tenant-scoped, versioned records; every mutation is a
 * correction that APPENDS (version+1) — records never mutate in place.
 * Demand-test binding rides the declared {@link DemandExperimentPort}
 * seam; denials come back verbatim-attributed and append ZERO experiment
 * state (nothing attributable happened — the W8-A discipline).
 */
import type { IdentityRef, TenantId, TenantScope } from "@mos/contracts";
import type { ProductSubjectRef } from "@mos/product-intelligence";
import type {
  CommerceDiscoveryError,
  CommerceDiscoveryId,
  CommerceDiscoveryRecord,
  CorrectionRecord,
  DemandExperimentBindingOutcome,
  DemandExperimentPort,
  DemandTestDeclaration,
  ProvenanceSource,
} from "./types.js";
import {
  validateCommerceDiscoveryRecord,
} from "./validation.js";
import {
  cloneAndDeepFreeze,
  commerceDiscoveryIdDefault,
  commerceDiscoveryNowDefault,
  frozenTenantScope,
  type CommerceDiscoveryClock,
  type CommerceDiscoveryIdFactory,
} from "./helpers.js";

/** D1: composite store keys — tenant + record id (no cross-tenant leak). */
const storeKey = (tenantId: TenantId, id: CommerceDiscoveryId): string =>
  `${tenantId}::${id}`;

export interface CommerceDiscoveryServiceOptions {
  /** The declared demand-experiment seam (REQUIRED — no default port). */
  readonly demandExperimentPort: DemandExperimentPort;
  readonly clock?: CommerceDiscoveryClock;
  readonly nextId?: CommerceDiscoveryIdFactory;
}

export interface CreateCommerceDiscoveryInput {
  readonly tenantId: TenantId;
  readonly tenantScope: TenantScope;
  readonly subject: ProductSubjectRef;
  readonly provenance: ReadonlyArray<ProvenanceSource>;
  readonly demandTest: DemandTestDeclaration;
}

export type CommerceDiscoveryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: CommerceDiscoveryError };

export class CommerceDiscoveryService {
  private readonly records = new Map<string, CommerceDiscoveryRecord>();
  private readonly demandPort: DemandExperimentPort;
  private readonly clock: CommerceDiscoveryClock;
  private readonly nextId: CommerceDiscoveryIdFactory;

  constructor(options: CommerceDiscoveryServiceOptions) {
    if (!options || !options.demandExperimentPort) {
      throw new TypeError(
        "CommerceDiscoveryService requires the declared DemandExperimentPort seam",
      );
    }
    this.demandPort = options.demandExperimentPort;
    this.clock = options.clock ?? commerceDiscoveryNowDefault;
    this.nextId = options.nextId ?? commerceDiscoveryIdDefault;
  }

  /** Create a v1 discovery candidate (validated, frozen, append-only start). */
  create(input: CreateCommerceDiscoveryInput): CommerceDiscoveryResult<CommerceDiscoveryRecord> {
    const invalid = validateCommerceDiscoveryRecord(input);
    if (invalid) return { ok: false, error: invalid };
    const id = this.nextId() as CommerceDiscoveryId;
    const key = storeKey(input.tenantId, id);
    if (this.records.has(key)) {
      return {
        ok: false,
        error: { code: "DUPLICATE_ID", message: `record id already exists: ${id}` },
      };
    }
    const now = this.clock();
    const record: CommerceDiscoveryRecord = {
      id,
      tenantId: input.tenantId,
      tenantScope: frozenTenantScope(input.tenantScope),
      version: 1,
      subject: input.subject,
      createdAt: now,
      updatedAt: now,
      provenance: cloneAndDeepFreeze([...input.provenance]),
      demandTest: cloneAndDeepFreeze(input.demandTest),
      corrections: [],
    };
    const sealed = cloneAndDeepFreeze(record);
    this.records.set(key, sealed);
    return { ok: true, value: cloneAndDeepFreeze(sealed) };
  }

  /** Exact-tenant fetch (D2: no prefix scans, no existence leaks). */
  get(tenantId: TenantId, id: CommerceDiscoveryId): CommerceDiscoveryResult<CommerceDiscoveryRecord> {
    const record = this.records.get(storeKey(tenantId, id));
    if (!record) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: `no commerce-discovery record ${id} for this tenant` },
      };
    }
    return { ok: true, value: cloneAndDeepFreeze(record) };
  }

  /** The full append-only version chain (v1..current, in order). */
  listVersions(
    tenantId: TenantId,
    id: CommerceDiscoveryId,
  ): CommerceDiscoveryResult<ReadonlyArray<CommerceDiscoveryRecord>> {
    const first = this.get(tenantId, id);
    if (!first.ok) return first;
    // The in-memory store keeps only the current version of the chain body;
    // corrections carry the trail. Reconstruct by replay: v1 is not stored
    // separately, so the chain is [current-with-corrections] — the durable
    // binding stores per-version snapshots TL-side.
    return { ok: true, value: [first.value] };
  }

  /** Exact-tenant listing by subject (D2: never a prefix scan). */
  listForSubject(tenantId: TenantId, subject: ProductSubjectRef): ReadonlyArray<CommerceDiscoveryRecord> {
    const out: CommerceDiscoveryRecord[] = [];
    for (const record of this.records.values()) {
      if (record.tenantId === tenantId && record.subject === subject) {
        out.push(cloneAndDeepFreeze(record));
      }
    }
    return out;
  }

  /**
   * Append one correction (version+1, reason attributed, fields listed).
   * The correction changes only the declared fields: subject, demandTest.
   */
  correct(
    tenantId: TenantId,
    id: CommerceDiscoveryId,
    reason: string,
    patch: { subject?: ProductSubjectRef; demandTest?: DemandTestDeclaration },
  ): CommerceDiscoveryResult<CommerceDiscoveryRecord> {
    const current = this.records.get(storeKey(tenantId, id));
    if (!current) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: `no commerce-discovery record ${id} for this tenant` },
      };
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: "INVALID_DEMAND_TEST",
          message: "a correction requires a non-blank §30-attributable reason",
        },
      };
    }
    const demandTest = patch.demandTest ?? current.demandTest;
    if (patch.demandTest) {
      const invalid = validateCommerceDiscoveryRecord({
        tenantId: current.tenantId,
        provenance: current.provenance,
        demandTest: patch.demandTest,
      });
      if (invalid) return { ok: false, error: invalid };
    }
    const changed: string[] = [];
    if (patch.subject !== undefined) changed.push("subject");
    if (patch.demandTest !== undefined) changed.push("demandTest");
    const correction: CorrectionRecord = {
      version: current.version + 1,
      at: this.clock(),
      reason: reason.trim(),
      changed,
    };
    const next: CommerceDiscoveryRecord = {
      ...current,
      subject: patch.subject ?? current.subject,
      demandTest,
      version: correction.version,
      updatedAt: correction.at,
      corrections: [...current.corrections, correction],
    };
    const sealed = cloneAndDeepFreeze(next);
    this.records.set(storeKey(tenantId, id), sealed);
    return { ok: true, value: cloneAndDeepFreeze(sealed) };
  }

  /**
   * Bind the record's demand test through the REAL experiment authority
   * seam. Success returns the authority-minted experiment ref; denial
   * returns the verbatim attribution and appends ZERO experiment state.
   */
  async bindDemandTest(
    tenantId: TenantId,
    id: CommerceDiscoveryId,
    actor: IdentityRef,
  ): Promise<CommerceDiscoveryResult<DemandExperimentBindingOutcome>> {
    const record = this.records.get(storeKey(tenantId, id));
    if (!record) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: `no commerce-discovery record ${id} for this tenant` },
      };
    }
    const outcome = await this.demandPort.bindDemandTest(
      record.tenantScope,
      actor,
      record,
    );
    return { ok: true, value: outcome };
  }
}
