/**
 * The W11-A product-intelligence ADVERSARIAL battery — the W9-B/W10-B
 * defect classes applied by construction and pinned here:
 *
 * - D1 delimiter-injectable composite keys: hostile delimiter-laden tenant
 *   ids can never alias another tenant's chain (JSON-array keys);
 * - D2 prefix-scan listings: search/list/subject reads compare the STORED
 *   record's tenant EXACTLY — a delimiter-laden tenant id never widens
 *   another tenant's listing;
 * - D3 shallow-freeze/caller-aliased records: clone-then-deep-freeze —
 *   mutating the caller's input objects after recording never rewrites the
 *   stored record, and the caller's objects are never frozen in place;
 * - D4 caller-aliased TenantScope: the record owns a FROZEN COPY of the
 *   caller's scope — a post-hoc mutation cannot move the stored record's
 *   tenant identity;
 * - D5 non-finite numerics: NaN/±Infinity metric values fail closed,
 *   nothing recorded;
 * - D6 delimiter-join set comparison: the rights-coverage check is
 *   element-wise — join-colliding cited-ref sets are NOT covered;
 * - append-only/never-rewrite: earlier versions stay bit-for-bit immutable;
 * - `__proto__`-carrying payloads never pollute `Object.prototype`;
 * - the rights gate's full fail-closed ladder;
 * - the basis literal double-cast re-validation (runtime guard over the
 *   compile-time pins for untyped callers).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryProductIntelligence } from './in-memory-product-intelligence.js';
import type { InMemoryProductIntelligenceOptions } from './in-memory-product-intelligence.js';
import type { ProductIntelligenceRecord } from '../contracts/records.js';
import type { ProductIntelligencePort } from '../ports/product-intelligence-port.js';
import type { RecordProductIntelligenceInput } from '../ports/product-intelligence-port.js';
import type { TenantScope, TenantId, Timestamp, WorkspaceId } from '@mos/contracts';
import type { RightsGrant, RightsRef } from '@mos/rights';
import type { IdentityId } from '@mos/identity';

// ---------------------------------------------------------------------------
// Fixtures (mirrors of the main battery's, self-contained per house style)
// ---------------------------------------------------------------------------

const NOW = '2026-06-15T12:00:00.000Z' as Timestamp;
const tenantId = (value: string): TenantId => value as TenantId;
const identityId = (value: string): IdentityId => value as IdentityId;
const rightsRef = (value: string): RightsRef => value as RightsRef;
const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenantId(tenant) });

const grantFixture = (id: string, overrides: Partial<RightsGrant> = {}): RightsGrant => ({
  id: rightsRef(id),
  tenantId: tenantId('tenant-honest'),
  version: 1,
  scope: {
    actions: ['analyze'],
    subjectRefs: [
      'analytics://platform/reach-report-1',
      'analytics://platform/reach-report-2',
      'cap_a',
      'cap_b\u0000cap_c',
    ],
  },
  grantee: identityId('identity-analyst'),
  sourceRefs: ['license://holder-v2/doc-9'],
  terms: {
    attributionRequired: false,
    commercialUseAllowed: true,
    derivationAllowed: true,
    notes: null,
  },
  grantedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  ...overrides,
});

const rightsWith = (...grants: RightsGrant[]): InMemoryProductIntelligenceOptions['rights'] => ({
  getRights: (ref: RightsRef): RightsGrant | null =>
    grants.find((grant) => grant.id === ref) ?? null,
});

const adapterWith = (grants: readonly RightsGrant[]): ProductIntelligencePort =>
  createInMemoryProductIntelligence({ rights: rightsWith(...grants), now: () => NOW });

const isRecord = (
  value: ProductIntelligenceRecord | { readonly error: string },
): value is ProductIntelligenceRecord => !('error' in value);

const inputFor = (
  tenant: string,
  overrides: Partial<RecordProductIntelligenceInput> = {},
): RecordProductIntelligenceInput => ({
  scope: scopeOf(tenant),
  id: 'pi-chain-1' as RecordProductIntelligenceInput['id'],
  subject: 'product://course/masterclass' as RecordProductIntelligenceInput['subject'],
  content: {
    kind: 'product-fact',
    statement: 'the landing page leads with the three-format promise',
    evidenceRefs: ['analytics://platform/reach-report-1'],
  },
  source: {
    sourceKind: 'platform-analytics',
    sourceRefs: ['analytics://platform/reach-report-1'],
  },
  basis: {
    basis: 'cited-external-evidence',
    counterfactual: false,
    observedAt: '2026-06-10T00:00:00.000Z' as Timestamp,
  },
  rightsRef: rightsRef('rights://grant/analyze-1'),
  recordedBy: identityId('identity-analyst'),
  note: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// D1 — delimiter-injectable composite keys (hostile tenant ids)
// ---------------------------------------------------------------------------

test('D1: hostile delimiter-laden tenant ids cannot alias the honest tenant chain (both directions)', async () => {
  // The TRUE W3-A collision shape: the honest tenant id ITSELF contains a
  // delimiter, and the hostile tenant ids are crafted to collide under a
  // naive string-concatenation key (tenant::id, NUL-joined, pipe-joined).
  const honest = 'tenant::a';
  const hostiles: readonly string[] = [
    'tenant' + '::a-prefix', // shares the honest tenant's '::' delimiter
    'tenant::a\u0000x', // NUL-laden
    'tenant::a|suffix', // pipe-laden
  ];
  const grants: RightsGrant[] = [
    grantFixture('rights://grant/analyze-1', { tenantId: tenantId(honest) }),
    ...hostiles.map((tenant, index) =>
      grantFixture(`rights://grant/hostile-${index}`, {
        tenantId: tenantId(tenant),
        scope: { actions: ['analyze'], subjectRefs: ['analytics://platform/reach-report-1'] },
      }),
    ),
  ];
  const adapter = adapterWith(grants);

  const honestRecord = await adapter.recordProductIntelligence(inputFor(honest));
  assert.ok(isRecord(honestRecord));
  assert.equal(honestRecord.version, 1);

  // Each hostile tenant records its OWN record under the SAME record id.
  for (let index = 0; index < hostiles.length; index += 1) {
    const hostile = hostiles[index] as string;
    const hostileRecord = await adapter.recordProductIntelligence(
      inputFor(hostile, { rightsRef: rightsRef(`rights://grant/hostile-${index}`) }),
    );
    assert.ok(isRecord(hostileRecord), `hostile tenant "${hostile}" records into its OWN chain`);
    assert.equal(hostileRecord.version, 1);
    assert.equal(hostileRecord.tenantId, hostile);
  }

  // The honest tenant's chain is untouched: still exactly one record (a
  // delimiter-aliasing key would have made the hostile writes version 2+).
  const honestVersions = await adapter.listProductIntelligenceVersions(
    scopeOf(honest),
    'pi-chain-1' as RecordProductIntelligenceInput['id'],
  );
  assert.equal(honestVersions.length, 1);
  assert.deepEqual(honestVersions[0], honestRecord);

  // Each hostile tenant's own read resolves its own record ONLY — and the
  // honest tenant's read stays bit-for-bit its own (no existence leak).
  for (const hostile of hostiles) {
    const own = await adapter.listProductIntelligenceVersions(
      scopeOf(hostile),
      'pi-chain-1' as RecordProductIntelligenceInput['id'],
    );
    assert.equal(own.length, 1);
    assert.equal(own[0]?.tenantId, hostile);
  }
  const honestRead = await adapter.getProductIntelligenceRecord(
    scopeOf(honest),
    'pi-chain-1' as RecordProductIntelligenceInput['id'],
    1,
  );
  assert.deepEqual(honestRead, honestRecord);
});

test('D2: delimiter-laden tenant ids never widen another tenant\'s search/list/subject reads', async () => {
  const honest = 'tenant::a';
  const hostile = 'tenant::a\u0000x'; // a naive prefix scan would match the honest tenant
  const grant = grantFixture('rights://grant/analyze-1', { tenantId: tenantId(honest) });
  const hostileGrant = grantFixture('rights://grant/hostile', {
    tenantId: tenantId(hostile),
    scope: { actions: ['analyze'], subjectRefs: ['analytics://platform/reach-report-1'] },
  });
  const adapter = adapterWith([grant, hostileGrant]);

  await adapter.recordProductIntelligence(inputFor(honest));
  await adapter.recordProductIntelligence(
    inputFor(hostile, { rightsRef: rightsRef('rights://grant/hostile') }),
  );

  // The hostile tenant's search sees ONLY its own record.
  const hostileResults = await adapter.searchProductIntelligence(scopeOf(hostile), {});
  assert.ok(Array.isArray(hostileResults));
  assert.equal(hostileResults.length, 1);
  assert.equal(hostileResults[0]?.tenantId, hostile);

  // The honest tenant's search sees ONLY its own record.
  const honestResults = await adapter.searchProductIntelligence(scopeOf(honest), {});
  assert.ok(Array.isArray(honestResults));
  assert.equal(honestResults.length, 1);
  assert.equal(honestResults[0]?.tenantId, honest);

  // Subject listings stay exact per tenant too.
  const hostileSubject = await adapter.listProductIntelligenceForSubject(
    scopeOf(hostile),
    'product://course/masterclass' as RecordProductIntelligenceInput['subject'],
  );
  assert.equal(hostileSubject.length, 1);
  assert.equal(hostileSubject[0]?.tenantId, hostile);
});

test('two tenants using the SAME record id maintain independent version chains', async () => {
  const grantA = grantFixture('rights://grant/a');
  const grantB = grantFixture('rights://grant/b', {
    tenantId: tenantId('tenant-b'),
    scope: { actions: ['analyze'], subjectRefs: ['analytics://platform/reach-report-1'] },
  });
  const adapter = adapterWith([grantA, grantB]);
  await adapter.recordProductIntelligence(
    inputFor('tenant-honest', { rightsRef: rightsRef('rights://grant/a') }),
  );
  await adapter.recordProductIntelligence(
    inputFor('tenant-honest', { rightsRef: rightsRef('rights://grant/a') }),
  );
  await adapter.recordProductIntelligence(
    inputFor('tenant-b', { rightsRef: rightsRef('rights://grant/b') }),
  );
  const chainA = await adapter.listProductIntelligenceVersions(
    scopeOf('tenant-honest'),
    'pi-chain-1' as RecordProductIntelligenceInput['id'],
  );
  const chainB = await adapter.listProductIntelligenceVersions(
    scopeOf('tenant-b'),
    'pi-chain-1' as RecordProductIntelligenceInput['id'],
  );
  assert.equal(chainA.length, 2);
  assert.equal(chainB.length, 1);
  assert.equal(chainB[0]?.version, 1);
});

// ---------------------------------------------------------------------------
// D3 — clone-then-deep-freeze (caller-aliased records)
// ---------------------------------------------------------------------------

test('D3: mutating the caller\'s input objects after recording never rewrites the stored record', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const content = {
    kind: 'product-fact' as const,
    statement: 'the landing page leads with the three-format promise',
    evidenceRefs: ['analytics://platform/reach-report-1'],
  };
  const source = {
    sourceKind: 'platform-analytics' as const,
    sourceRefs: ['analytics://platform/reach-report-1'],
  };
  const basis = {
    basis: 'cited-external-evidence' as const,
    counterfactual: false as const,
    observedAt: '2026-06-10T00:00:00.000Z' as Timestamp,
  };
  const input = inputFor('tenant-honest', { content, source, basis });
  const recorded = await adapter.recordProductIntelligence(input);
  assert.ok(isRecord(recorded));

  // The caller's objects are NOT frozen (clone-then-freeze, not freeze-in-place).
  assert.equal(Object.isFrozen(content), false);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(basis), false);
  assert.equal(Object.isFrozen(input), false);

  // Mutating them never changes the stored record.
  content.statement = 'REWRITTEN BY THE CALLER';
  (content.evidenceRefs as string[]).push('fabricated://ref');
  source.sourceRefs.push('fabricated://source');
  const readBack = await adapter.getProductIntelligenceRecord(
    scopeOf('tenant-honest'),
    input.id,
    1,
  );
  assert.deepEqual(readBack?.content, {
    kind: 'product-fact',
    statement: 'the landing page leads with the three-format promise',
    evidenceRefs: ['analytics://platform/reach-report-1'],
  });
  assert.deepEqual(readBack?.source, {
    sourceKind: 'platform-analytics',
    sourceRefs: ['analytics://platform/reach-report-1'],
  });
});

test('D3: the stored record IS deep-frozen — nested mutation attempts throw', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const recorded = await adapter.recordProductIntelligence(inputFor('tenant-honest'));
  assert.ok(isRecord(recorded));
  assert.equal(Object.isFrozen(recorded), true);
  assert.equal(Object.isFrozen(recorded.content), true);
  assert.equal(Object.isFrozen(recorded.source), true);
  assert.equal(Object.isFrozen(recorded.basis), true);
  assert.equal(Object.isFrozen(recorded.scope), true);
  assert.throws(() => {
    (recorded.content as { statement: string }).statement = 'hostile rewrite';
  });
  if (recorded.content.kind === 'product-fact') {
    assert.throws(() => {
      (recorded.content.evidenceRefs as string[]).push('hostile://ref');
    });
  }
});

// ---------------------------------------------------------------------------
// D4 — caller-aliased TenantScope (frozen scope copies)
// ---------------------------------------------------------------------------

test('D4: mutating the caller\'s scope after recording cannot move the stored record\'s tenant identity', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const scope: { tenantId: TenantId; workspaceId?: WorkspaceId } = {
    tenantId: tenantId('tenant-honest'),
  };
  const input = inputFor('tenant-honest', { scope });
  const recorded = await adapter.recordProductIntelligence(input);
  assert.ok(isRecord(recorded));
  assert.equal(recorded.tenantId, 'tenant-honest');
  assert.equal(recorded.scope.tenantId, 'tenant-honest');

  // Post-hoc identity forgery attempt: move the caller's scope to another tenant.
  scope.tenantId = tenantId('tenant-forged');
  scope.workspaceId = 'ws-forged' as WorkspaceId;

  // The stored record's tenant identity is unchanged (frozen copy).
  assert.equal(recorded.tenantId, 'tenant-honest');
  assert.equal(recorded.scope.tenantId, 'tenant-honest');
  assert.equal(recorded.scope.workspaceId, undefined);

  // The record still resolves under the ORIGINAL tenant, and the forged
  // tenant cannot see it.
  const original = await adapter.getProductIntelligenceRecord(
    scopeOf('tenant-honest'),
    input.id,
    1,
  );
  assert.notEqual(original, null);
  const forged = await adapter.getProductIntelligenceRecord(
    scopeOf('tenant-forged'),
    input.id,
    1,
  );
  assert.equal(forged, null);
});

// ---------------------------------------------------------------------------
// D5 — non-finite numerics
// ---------------------------------------------------------------------------

test('D5: NaN/±Infinity metric values fail closed with nothing recorded', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  for (const hostile of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const failure = await adapter.recordProductIntelligence(
      inputFor('tenant-honest', {
        content: {
          kind: 'product-metric',
          metric: 'qualified-reach',
          value: hostile,
          unit: 'people',
          window: null,
          evidenceRefs: ['analytics://platform/reach-report-1'],
        },
      }),
    );
    assert.ok('error' in failure, `value ${String(hostile)} must fail closed`);
    assert.equal(failure.error, 'non-finite-metric-value');
    assert.ok(failure.message.includes('never recorded'));
  }
  const versions = await adapter.listProductIntelligenceVersions(
    scopeOf('tenant-honest'),
    'pi-chain-1' as RecordProductIntelligenceInput['id'],
  );
  assert.equal(versions.length, 0);
});

// ---------------------------------------------------------------------------
// D6 — delimiter-join set comparison (rights coverage)
// ---------------------------------------------------------------------------

test('D6: join-colliding cited-ref sets are recognized as NOT covered (element-wise comparison)', async () => {
  // Under a naive sort-then-join-with-NUL comparison these two sets are
  // IDENTICAL: ["cap_a", "cap_b\u0000cap_c"] vs ["cap_a\u0000cap_b", "cap_c"].
  // The element-wise coverage check must reject the second.
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const failure = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', {
      content: {
        kind: 'product-fact',
        statement: 'a hostile statement citing join-colliding refs',
        evidenceRefs: ['cap_a\u0000cap_b', 'cap_c'],
      },
    }),
  );
  assert.ok('error' in failure);
  assert.equal(failure.error, 'cited-ref-not-covered-by-grant');
});

test('D6: coverage is order-insensitive (not over-strict) — same refs in any order pass', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const recorded = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', {
      content: {
        kind: 'product-fact',
        statement: 'a statement citing the covered refs in reversed order',
        evidenceRefs: ['cap_b\u0000cap_c', 'cap_a'],
      },
      source: { sourceKind: 'human-report', sourceRefs: ['cap_a'] },
    }),
  );
  assert.ok(isRecord(recorded));
});

// ---------------------------------------------------------------------------
// Append-only / never-rewrite
// ---------------------------------------------------------------------------

test('append-only: a later record never rewrites an earlier version (bit-for-bit pin)', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const v1 = await adapter.recordProductIntelligence(inputFor('tenant-honest'));
  assert.ok(isRecord(v1));
  const v1Snapshot = JSON.parse(JSON.stringify(v1)) as ProductIntelligenceRecord;
  const v2 = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', {
      content: {
        kind: 'product-fact',
        statement: 'a corrected statement',
        evidenceRefs: ['analytics://platform/reach-report-1'],
      },
    }),
  );
  assert.ok(isRecord(v2));
  const versions = await adapter.listProductIntelligenceVersions(
    scopeOf('tenant-honest'),
    'pi-chain-1' as RecordProductIntelligenceInput['id'],
  );
  assert.equal(versions.length, 2);
  assert.deepEqual(versions[0], v1);
  assert.deepEqual(JSON.parse(JSON.stringify(versions[0])) as ProductIntelligenceRecord, v1Snapshot);
  const integrity = await adapter.verifyProductIntelligenceIntegrity(
    scopeOf('tenant-honest'),
    'pi-chain-1' as RecordProductIntelligenceInput['id'],
    1,
  );
  assert.equal(integrity?.status, 'intact');
});

// ---------------------------------------------------------------------------
// __proto__-carrying payloads
// ---------------------------------------------------------------------------

test('__proto__-carrying payloads never pollute Object.prototype (inert own properties)', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  // A JSON.parse-shaped content object carrying "__proto__" as an OWN key.
  const hostileContent = JSON.parse(
    '{"kind":"product-fact","statement":"a statement with a hostile own-property","evidenceRefs":["analytics://platform/reach-report-1"],"__proto__":{"polluted":"yes"}}',
  ) as unknown as RecordProductIntelligenceInput['content'];
  const recorded = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', { content: hostileContent }),
  );
  assert.ok(isRecord(recorded));
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
  // The stored record survives a re-read (the inert own property never
  // breaks the digest discipline).
  const readBack = await adapter.getProductIntelligenceRecord(
    scopeOf('tenant-honest'),
    'pi-chain-1' as RecordProductIntelligenceInput['id'],
    1,
  );
  assert.notEqual(readBack, null);
  const integrity = await adapter.verifyProductIntelligenceIntegrity(
    scopeOf('tenant-honest'),
    'pi-chain-1' as RecordProductIntelligenceInput['id'],
    1,
  );
  assert.equal(integrity?.status, 'intact');
});

// ---------------------------------------------------------------------------
// The rights gate's fail-closed ladder
// ---------------------------------------------------------------------------

test('rights gate: unresolvable refs fail closed as no-explicit-grant (URLs never imply rights)', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const failure = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', { rightsRef: rightsRef('rights://grant/unknown') }),
  );
  assert.ok('error' in failure);
  assert.equal(failure.error, 'no-explicit-grant');
  assert.ok(failure.message.includes('never implies rights'));
});

test('rights gate: cross-tenant grants fail closed as rights-grant-tenant-mismatch', async () => {
  const foreignGrant = grantFixture('rights://grant/foreign', {
    tenantId: tenantId('tenant-other'),
    scope: { actions: ['analyze'], subjectRefs: ['analytics://platform/reach-report-1'] },
  });
  const adapter = adapterWith([foreignGrant]);
  const failure = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', { rightsRef: rightsRef('rights://grant/foreign') }),
  );
  assert.ok('error' in failure);
  assert.equal(failure.error, 'rights-grant-tenant-mismatch');
});

test('rights gate: revoked grants fail closed as rights-grant-revoked', async () => {
  const revoked = grantFixture('rights://grant/revoked', {
    revokedAt: '2026-02-01T00:00:00.000Z',
  });
  const adapter = adapterWith([revoked]);
  const failure = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', { rightsRef: rightsRef('rights://grant/revoked') }),
  );
  assert.ok('error' in failure);
  assert.equal(failure.error, 'rights-grant-revoked');
});

test('rights gate: expired grants fail closed as rights-grant-expired', async () => {
  const expired = grantFixture('rights://grant/expired', {
    expiresAt: '2026-06-01T00:00:00.000Z',
  });
  const adapter = adapterWith([expired]);
  const failure = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', { rightsRef: rightsRef('rights://grant/expired') }),
  );
  assert.ok('error' in failure);
  assert.equal(failure.error, 'rights-grant-expired');
});

test('rights gate: grants without the analyze action fail closed as analyze-action-not-granted', async () => {
  const noAnalyze = grantFixture('rights://grant/no-analyze', {
    scope: {
      actions: ['use', 'transform'],
      subjectRefs: ['analytics://platform/reach-report-1'],
    },
  });
  const adapter = adapterWith([noAnalyze]);
  const failure = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', { rightsRef: rightsRef('rights://grant/no-analyze') }),
  );
  assert.ok('error' in failure);
  assert.equal(failure.error, 'analyze-action-not-granted');
});

test('rights gate: attribution-demanding terms fail closed without an attribution', async () => {
  const attributed = grantFixture('rights://grant/attributed', {
    terms: {
      attributionRequired: true,
      commercialUseAllowed: false,
      derivationAllowed: false,
      notes: null,
    },
  });
  const adapter = adapterWith([attributed]);
  const failure = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', {
      rightsRef: rightsRef('rights://grant/attributed'),
      attribution: null,
    }),
  );
  assert.ok('error' in failure);
  assert.equal(failure.error, 'attribution-required');
});

// ---------------------------------------------------------------------------
// The basis literal double-cast re-validation (runtime guard)
// ---------------------------------------------------------------------------

test('basis double-cast: a cited-evidence basis with counterfactual true fails closed at runtime', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  // The compile-time literal pin makes this impossible to construct WITH
  // types; an untyped caller bypasses it — the runtime guard catches it.
  const hostile = {
    ...inputFor('tenant-honest'),
    basis: {
      basis: 'cited-external-evidence',
      counterfactual: true,
      observedAt: '2026-06-10T00:00:00.000Z',
    },
  } as unknown as RecordProductIntelligenceInput;
  const failure = await adapter.recordProductIntelligence(hostile);
  assert.ok('error' in failure);
  assert.equal(failure.error, 'invalid-input');
  assert.ok(failure.message.includes('double-cast guard'));
});

test('basis double-cast: a forecast basis with counterfactual false fails closed at runtime', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const hostile = {
    ...inputFor('tenant-honest'),
    source: { sourceKind: 'forecast-model', sourceRefs: ['analytics://platform/reach-report-1'] },
    basis: {
      basis: 'counterfactual-forecast',
      counterfactual: false,
      methodNote: 'a forecast that claims to be observed',
    },
  } as unknown as RecordProductIntelligenceInput;
  const failure = await adapter.recordProductIntelligence(hostile);
  assert.ok('error' in failure);
  assert.equal(failure.error, 'invalid-input');
  assert.ok(failure.message.includes('counterfactual-labeled'));
});

test('coherence: a forecast-model source cannot claim cited-external-evidence basis', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const failure = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', {
      source: { sourceKind: 'forecast-model', sourceRefs: ['analytics://platform/reach-report-1'] },
    }),
  );
  assert.ok('error' in failure);
  assert.equal(failure.error, 'invalid-input');
  assert.ok(failure.message.includes('forecasts are counterfactual by construction'));
});

test('coherence: an external-commerce-system source cannot claim a forecast basis', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const failure = await adapter.recordProductIntelligence(
    inputFor('tenant-honest', {
      source: {
        sourceKind: 'external-commerce-system',
        sourceRefs: ['analytics://platform/reach-report-1'],
      },
      basis: {
        basis: 'counterfactual-forecast',
        counterfactual: true,
        methodNote: 'a commerce forecast wearing an observation source',
      },
    }),
  );
  assert.ok('error' in failure);
  assert.equal(failure.error, 'invalid-input');
  assert.ok(failure.message.includes('never a forecast authority'));
});
