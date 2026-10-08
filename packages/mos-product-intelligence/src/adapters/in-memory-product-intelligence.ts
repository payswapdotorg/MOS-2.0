/**
 * The in-memory product-intelligence adapter (W11-A).
 *
 * W11-A DISCLOSURE — ANALYSIS MATERIAL, NOT AN AUTHORITY OVER REALITY. The
 * records are versioned tenant-scoped append-only evidence-linked
 * product-side intelligence: facts/metrics/observations ABOUT product
 * subjects with provenance, rights-respect and explicit source attribution.
 * They INFORM marketing planning (§25) through the port's read surfaces;
 * this package carries NO mission authority (no plan/decision method
 * exists), NO commerce truth (external commerce observations enter ONLY as
 * provenance-carrying citations — never orders/inventory/listing state),
 * and forecast records are explicitly counterfactual-labeled (type-level
 * literal pin + runtime double-cast re-validation).
 *
 * APPEND-ONLY BY CONSTRUCTION: `recordProductIntelligence` is the ONLY
 * write path and always appends a NEW version to the `(tenant, record id)`
 * chain. There is NO update or delete surface; stored records are
 * clone-then-deep-frozen snapshots, digest-sealed for bit-for-bit
 * verification; a later record NEVER rewrites an earlier one.
 *
 * W9-B/W10-B disciplines by construction: composite keys are JSON array
 * keys (injective over the tuple — a hostile delimiter-laden tenant id can
 * never alias another tenant's chain); listings compare the STORED
 * record's tenant EXACTLY (never a prefix scan); stored records are
 * clone-then-deep-frozen (the caller's objects are never aliased and never
 * frozen in place); the record owns a FROZEN COPY of the caller's scope
 * (a post-hoc mutation of the caller's scope cannot move the stored
 * record's tenant identity); every numeric recording passes a finite
 * guard; the rights-coverage comparison is element-wise (never a
 * delimiter-joined set comparison).
 *
 * Ephemeral process-local scaffold (durable persistence is TL-owned); the
 * rights gate runs over the injected `ProductIntelligenceRightsSource`
 * (the composition root wires a real `@mos/rights` repository — imported
 * type-only here, hexagonal).
 */

import type { TenantScope, Timestamp, Version } from '@mos/contracts';
import type { ProductIntelligenceId } from '../contracts/ids.js';
import type { ProductSubjectRef } from '../contracts/ids.js';
import type {
  ProductIntelligenceRecord,
  ProductIntelligenceSourceKind,
} from '../contracts/records.js';
import type { ProductIntelligenceSearchQuery } from '../contracts/search.js';
import type {
  ProductIntelligenceIntegrityReport,
  ProductIntelligencePort,
  ProductIntelligenceRightsSource,
} from '../ports/product-intelligence-port.js';
import type { ProductIntelligenceVersionRef } from '../contracts/ids.js';
import type {
  ProductIntelligenceError,
  RecordProductIntelligenceInput,
} from '../ports/product-intelligence-port.js';
import {
  productIntelligenceFailure,
  productIntelligenceNowDefault,
} from '../ports/product-intelligence-port.js';
import {
  cloneDeep,
  deepFreeze,
  digestOf,
  isPlainObject,
} from './adapter-support.js';
import { validateProductIntelligenceRequest } from './record-validation.js';
import { checkProductIntelligenceRights } from './rights-gate.js';

/** Options for {@link createInMemoryProductIntelligence}. */
export interface InMemoryProductIntelligenceOptions {
  /**
   * The injected rights source (a narrow structural view of
   * `@mos/rights`' `RightsRepository`): every record passes the rights
   * gate through it. The disclosed in-memory rights repository satisfies
   * the same shape (tests use a structural double; the composition root
   * wires the real one).
   */
  readonly rights: ProductIntelligenceRightsSource;
  /** Injectable clock for deterministic `recordedAt` stamps. */
  readonly now?: () => Timestamp;
}

/** The deterministic digest of one frozen record payload. */
export const productIntelligenceDigestOf = (record: ProductIntelligenceRecord): string => {
  const payload: Record<string, unknown> = { ...record };
  delete payload.recordDigest;
  return digestOf(payload);
};

export function createInMemoryProductIntelligence(
  options: InMemoryProductIntelligenceOptions,
): ProductIntelligencePort {
  const now = options.now ?? productIntelligenceNowDefault;
  /**
   * Record chains keyed by JSON array [tenant, record id] (W9-B: injective
   * over the tuple — a hostile tenant id containing ANY delimiter can
   * never alias another tenant's chain).
   */
  const chains = new Map<string, ProductIntelligenceRecord[]>();

  const chainKey = (scope: TenantScope, id: string): string =>
    JSON.stringify([scope.tenantId as string, id as string]);

  /** READ view of one chain — never creates store entries. */
  const chainOf = (scope: TenantScope, id: string): readonly ProductIntelligenceRecord[] =>
    chains.get(chainKey(scope, id)) ?? [];

  /** Exact-tenant fetch of one record (latest or an exact version). */
  const recordIn = (
    scope: TenantScope,
    id: ProductIntelligenceId,
    version?: number,
  ): ProductIntelligenceRecord | null => {
    const chain = chainOf(scope, id as string);
    if (chain.length === 0) {
      return null;
    }
    const record =
      version === undefined
        ? chain[chain.length - 1]
        : chain.find((entry) => entry.version === version);
    if (record === undefined) {
      return null;
    }
    // W9-B: EXACT tenant equality on the STORED record (defense in depth —
    // the chain key already isolates tenants; a delimiter-laden tenant id
    // must never widen a read even if a future refactor re-keys the store).
    if ((record.tenantId as string) !== (scope.tenantId as string)) {
      return null;
    }
    return record;
  };

  /**
   * The LATEST version of every chain whose records match the predicate —
   * W9-B D2: EXACT tenant equality on the STORED record while iterating
   * every chain (NEVER a prefix scan over the key space), deterministic
   * order afterwards.
   */
  const latestMatching = (
    scope: TenantScope,
    predicate: (record: ProductIntelligenceRecord) => boolean,
  ): ProductIntelligenceRecord[] => {
    const latestById = new Map<string, ProductIntelligenceRecord>();
    for (const [, chain] of chains) {
      for (const record of chain) {
        if ((record.tenantId as string) !== (scope.tenantId as string)) {
          continue;
        }
        if (!predicate(record)) {
          continue;
        }
        const current = latestById.get(record.id as string);
        if (current === undefined || record.version > current.version) {
          latestById.set(record.id as string, record);
        }
      }
    }
    return [...latestById.values()];
  };

  /** Deterministic (subject, recordId) ordering — the search/list order. */
  const bySubjectThenId = (
    a: ProductIntelligenceRecord,
    b: ProductIntelligenceRecord,
  ): number => {
    const subjectA = a.subject as string;
    const subjectB = b.subject as string;
    if (subjectA !== subjectB) {
      return subjectA < subjectB ? -1 : 1;
    }
    const idA = a.id as string;
    const idB = b.id as string;
    return idA === idB ? 0 : idA < idB ? -1 : 1;
  };

  /** Validate the search query's finite-resource + vocabulary guards. */
  const validateSearchQuery = (
    query: ProductIntelligenceSearchQuery,
  ): ProductIntelligenceError | null => {
    if (!isPlainObject(query)) {
      return productIntelligenceFailure(
        'invalid-input',
        'the search query must be a plain object',
      );
    }
    if (query.limit !== undefined) {
      if (typeof query.limit !== 'number' || !Number.isInteger(query.limit) || query.limit < 1) {
        return productIntelligenceFailure(
          'invalid-input',
          'query.limit must be an integer >= 1 (a finite resource guard)',
        );
      }
      if (query.limit > 10_000) {
        return productIntelligenceFailure(
          'invalid-input',
          'query.limit must not exceed 10000 (a finite resource guard)',
        );
      }
    }
    if (query.kinds !== undefined && !Array.isArray(query.kinds)) {
      return productIntelligenceFailure('invalid-input', 'query.kinds must be an array');
    }
    if (query.sourceKinds !== undefined && !Array.isArray(query.sourceKinds)) {
      return productIntelligenceFailure('invalid-input', 'query.sourceKinds must be an array');
    }
    return null;
  };

  return {
    async recordProductIntelligence(
      input: RecordProductIntelligenceInput,
    ): Promise<ProductIntelligenceRecord | ProductIntelligenceError> {
      // ---- 1. structural validation (fail closed — nothing recorded) ----
      const requestFault = validateProductIntelligenceRequest(input);
      if (requestFault !== null) {
        return requestFault;
      }

      // ---- 2. the rights gate (fail closed — nothing recorded) ----
      const rightsFault = checkProductIntelligenceRights(input.scope, input, options.rights, now);
      if (rightsFault !== null) {
        return rightsFault;
      }

      // ---- 3. append the frozen, digest-sealed record ----
      // CLONE-THEN-FREEZE OWNERSHIP: every caller-supplied object/array is
      // cloned into the record before freezing — the frozen record can
      // never freeze or corrupt data the caller still owns, and mutating
      // the caller's objects after recording can never rewrite the stored
      // record.
      const version = (chainOf(input.scope, input.id as string).length + 1) as Version;
      const base = {
        id: input.id,
        version,
        tenantId: input.scope.tenantId,
        scope: cloneDeep(input.scope), // D4: the record's OWN frozen scope copy
        subject: input.subject,
        kind: input.content.kind,
        content: cloneDeep(input.content),
        source: cloneDeep(input.source),
        basis: cloneDeep(input.basis),
        citedCommerceObservations: (input.citedCommerceObservations ?? []).map((citation) =>
          cloneDeep(citation),
        ),
        rightsRef: input.rightsRef,
        attribution: input.attribution ?? null,
        recordedBy: input.recordedBy,
        recordedAt: now(),
        note: input.note ?? null,
        recordDigest: '',
        recordKind: 'product-intelligence-analysis' as const,
        disclosure: 'evidence-linked-product-intelligence-with-explicit-source-attribution' as const,
        intelligenceOnly:
          'product intelligence informs marketing planning only — it carries no mission authority, never authors commerce truth (external commerce observations are cited with provenance and never become orders, inventory or listing state), and counterfactual-forecast records are explicitly labeled simulated, never reality (§25)' as const,
      };
      const withDigest: ProductIntelligenceRecord = deepFreeze({
        ...base,
        recordDigest: productIntelligenceDigestOf(base),
      });
      const key = chainKey(input.scope, input.id as string);
      const chain = chains.get(key) ?? [];
      chain.push(withDigest);
      chains.set(key, chain);
      return withDigest;
    },

    async getProductIntelligenceRecord(
      scope: TenantScope,
      id: ProductIntelligenceId,
      version?: number,
    ): Promise<ProductIntelligenceRecord | null> {
      return recordIn(scope, id, version);
    },

    async listProductIntelligenceVersions(
      scope: TenantScope,
      id: ProductIntelligenceId,
    ): Promise<readonly ProductIntelligenceRecord[]> {
      // A copy of the chain view (the records themselves are frozen).
      return [...chainOf(scope, id as string)].filter(
        (record) => (record.tenantId as string) === (scope.tenantId as string),
      );
    },

    async listProductIntelligenceForSubject(
      scope: TenantScope,
      subject: ProductSubjectRef,
    ): Promise<readonly ProductIntelligenceRecord[]> {
      return latestMatching(scope, (record) => (record.subject as string) === (subject as string))
        .sort(bySubjectThenId);
    },

    async searchProductIntelligence(
      scope: TenantScope,
      query: ProductIntelligenceSearchQuery,
    ): Promise<readonly ProductIntelligenceRecord[] | ProductIntelligenceError> {
      const queryFault = validateSearchQuery(query);
      if (queryFault !== null) {
        return queryFault;
      }
      const kinds =
        query.kinds === undefined ? null : new Set<string>(query.kinds as readonly string[]);
      const sourceKinds =
        query.sourceKinds === undefined
          ? null
          : new Set<string>(query.sourceKinds as readonly string[]);
      const matches = latestMatching(scope, (record) => {
        if (
          query.subject !== undefined &&
          (record.subject as string) !== (query.subject as string)
        ) {
          return false;
        }
        if (kinds !== null && !kinds.has(record.kind as string)) {
          return false;
        }
        if (
          query.basis !== undefined &&
          (record.basis.basis as string) !== (query.basis as string)
        ) {
          return false;
        }
        if (
          sourceKinds !== null &&
          !sourceKinds.has(record.source.sourceKind as ProductIntelligenceSourceKind as string)
        ) {
          return false;
        }
        return true;
      }).sort(bySubjectThenId);
      return query.limit === undefined ? matches : matches.slice(0, query.limit);
    },

    async resolveProductIntelligenceCitations(
      scope: TenantScope,
      citations: readonly ProductIntelligenceVersionRef[],
    ): Promise<readonly ProductIntelligenceRecord[] | ProductIntelligenceError> {
      if (!Array.isArray(citations)) {
        return productIntelligenceFailure(
          'invalid-citation',
          'citations must be an array of versioned product-intelligence citations',
        );
      }
      const resolved: ProductIntelligenceRecord[] = [];
      for (const citation of citations) {
        if (
          !isPlainObject(citation) ||
          typeof citation.recordId !== 'string' ||
          citation.recordId.trim().length === 0 ||
          typeof citation.version !== 'number' ||
          !Number.isInteger(citation.version) ||
          citation.version < 1
        ) {
          return productIntelligenceFailure(
            'invalid-citation',
            'every citation must carry a non-blank recordId and an integer version >= 1',
          );
        }
        const record = recordIn(scope, citation.recordId as ProductIntelligenceId, citation.version);
        if (record === null) {
          return productIntelligenceFailure(
            'citation-not-found',
            `cited product intelligence "${citation.recordId}" v${citation.version} does not resolve in this tenant scope — citing intelligence that does not resolve would fabricate the plan's evidence base`,
          );
        }
        resolved.push(record);
      }
      return resolved;
    },

    async verifyProductIntelligenceIntegrity(
      scope: TenantScope,
      id: ProductIntelligenceId,
      version?: number,
    ): Promise<ProductIntelligenceIntegrityReport | null> {
      const record = recordIn(scope, id, version);
      if (record === null) {
        return null;
      }
      const recomputedDigest = productIntelligenceDigestOf(record);
      const report: ProductIntelligenceIntegrityReport = {
        recordId: record.id,
        version: record.version,
        status: recomputedDigest === record.recordDigest ? 'intact' : 'tampered',
        recordedDigest: record.recordDigest,
        recomputedDigest,
      };
      return report;
    },
  };
}
