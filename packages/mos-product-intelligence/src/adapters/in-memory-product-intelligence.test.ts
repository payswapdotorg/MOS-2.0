/**
 * The W11-A product-intelligence in-memory adapter battery — round-trip,
 * provenance, versioning, citation resolution, integrity, determinism.
 *
 * The rights source here is a DISCLOSED STRUCTURAL TEST DOUBLE implementing
 * the `Pick<RightsRepository, 'getRights'>` view consumed by the adapter's
 * rights gate (the @mos/content precedent): a real `@mos/rights`
 * repository satisfies the same shape at the composition root; @mos/rights
 * is imported type-only in this package.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryProductIntelligence } from './in-memory-product-intelligence.js';
import type { InMemoryProductIntelligenceOptions } from './in-memory-product-intelligence.js';
import type { ProductIntelligenceRecord } from '../contracts/records.js';
import type { ProductIntelligencePort } from '../ports/product-intelligence-port.js';
import type { RecordProductIntelligenceInput } from '../ports/product-intelligence-port.js';
import type { ProductIntelligenceVersionRef } from '../contracts/ids.js';
import type { TenantScope, TenantId, Timestamp } from '@mos/contracts';
import type { RightsGrant, RightsRef } from '@mos/rights';
import type { IdentityId } from '@mos/identity';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2026-06-15T12:00:00.000Z' as Timestamp;

const tenantId = (value: string): TenantId => value as TenantId;
const identityId = (value: string): IdentityId => value as IdentityId;
const rightsRef = (value: string): RightsRef => value as RightsRef;
const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenantId(tenant) });

const grantFixture = (id: string, overrides: Partial<RightsGrant> = {}): RightsGrant => ({
  id: rightsRef(id),
  tenantId: tenantId('tenant-a'),
  version: 1,
  scope: {
    actions: ['analyze'],
    subjectRefs: [
      'analytics://platform/reach-report-1',
      'commerce://marketplace-a/listing-42',
      'transcript://studio/session-7',
      'human://analyst/field-notes-3',
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

/**
 * DISCLOSED STRUCTURAL TEST DOUBLE for the injected rights source (the
 * `Pick<RightsRepository, 'getRights'>` view).
 */
const rightsWith = (...grants: RightsGrant[]): InMemoryProductIntelligenceOptions['rights'] => ({
  getRights: (ref: RightsRef): RightsGrant | null =>
    grants.find((grant) => grant.id === ref) ?? null,
});

const adapterWith = (
  grants: readonly RightsGrant[],
  now: () => Timestamp = () => NOW,
): ProductIntelligencePort =>
  createInMemoryProductIntelligence({ rights: rightsWith(...grants), now });

const isRecord = (
  value: ProductIntelligenceRecord | { readonly error: string },
): value is ProductIntelligenceRecord => !('error' in value);

const factContent = () => ({
  kind: 'product-fact' as const,
  statement: 'the landing page leads with the three-format promise',
  evidenceRefs: ['analytics://platform/reach-report-1'],
});

const metricContent = () => ({
  kind: 'product-metric' as const,
  metric: 'qualified-reach',
  value: 1200,
  unit: 'people',
  window: '2026-06-01..2026-06-30',
  evidenceRefs: ['analytics://platform/reach-report-1'],
});

const observationContent = () => ({
  kind: 'product-observation' as const,
  narrative: 'audience questions cluster around pricing tiers',
  evidenceRefs: ['transcript://studio/session-7'],
});

const factInput = (overrides: Partial<RecordProductIntelligenceInput> = {}): RecordProductIntelligenceInput => ({
  scope: scopeOf('tenant-a'),
  id: 'pi-reach-fact' as RecordProductIntelligenceInput['id'],
  subject: 'product://course/masterclass' as RecordProductIntelligenceInput['subject'],
  content: factContent(),
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

const metricInput = (
  overrides: Partial<RecordProductIntelligenceInput> = {},
): RecordProductIntelligenceInput => ({
  scope: scopeOf('tenant-a'),
  id: 'pi-reach-metric' as RecordProductIntelligenceInput['id'],
  subject: 'product://course/masterclass' as RecordProductIntelligenceInput['subject'],
  content: metricContent(),
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

const observationInput = (
  overrides: Partial<RecordProductIntelligenceInput> = {},
): RecordProductIntelligenceInput => ({
  scope: scopeOf('tenant-a'),
  id: 'pi-audience-observation' as RecordProductIntelligenceInput['id'],
  subject: 'product://course/masterclass' as RecordProductIntelligenceInput['subject'],
  content: observationContent(),
  source: {
    sourceKind: 'human-report',
    sourceRefs: ['human://analyst/field-notes-3'],
  },
  basis: {
    basis: 'cited-external-evidence',
    counterfactual: false,
    observedAt: '2026-06-11T00:00:00.000Z' as Timestamp,
  },
  rightsRef: rightsRef('rights://grant/analyze-1'),
  recordedBy: identityId('identity-analyst'),
  note: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Round-trip + provenance
// ---------------------------------------------------------------------------

test('a product-fact record round-trips bit-for-bit with full provenance', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const recorded = await adapter.recordProductIntelligence(factInput());
  assert.ok(isRecord(recorded));
  const readBack = await adapter.getProductIntelligenceRecord(
    scopeOf('tenant-a'),
    factInput().id,
    1,
  );
  assert.notEqual(readBack, null);
  assert.deepEqual(readBack, recorded);
  // Provenance: explicit source attribution + recorder + timestamp + evidence.
  assert.equal(readBack?.source.sourceKind, 'platform-analytics');
  assert.deepEqual(readBack?.source.sourceRefs, ['analytics://platform/reach-report-1']);
  assert.equal(readBack?.recordedBy, 'identity-analyst');
  assert.equal(readBack?.recordedAt, NOW);
  assert.deepEqual(readBack?.content.evidenceRefs, ['analytics://platform/reach-report-1']);
  assert.equal(readBack?.rightsRef, 'rights://grant/analyze-1');
  assert.equal(readBack?.version, 1);
  assert.equal(readBack?.tenantId, 'tenant-a');
});

test('a product-metric record round-trips with value, unit and window', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const recorded = await adapter.recordProductIntelligence(metricInput());
  assert.ok(isRecord(recorded));
  assert.equal(recorded.kind, 'product-metric');
  assert.equal(recorded.content.kind, 'product-metric');
  if (recorded.content.kind === 'product-metric') {
    assert.equal(recorded.content.value, 1200);
    assert.equal(recorded.content.unit, 'people');
    assert.equal(recorded.content.window, '2026-06-01..2026-06-30');
  }
});

test('a product-observation record round-trips', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const recorded = await adapter.recordProductIntelligence(observationInput());
  assert.ok(isRecord(recorded));
  assert.equal(recorded.kind, 'product-observation');
  assert.equal(recorded.content.kind, 'product-observation');
});

test('a counterfactual forecast record carries the explicit label and method note', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const input: RecordProductIntelligenceInput = {
    ...metricInput(),
    content: {
      ...metricContent(),
      metric: 'projected-qualified-reach',
      value: 1500,
    },
    source: { sourceKind: 'forecast-model', sourceRefs: ['analytics://platform/reach-report-1'] },
    basis: {
      basis: 'counterfactual-forecast',
      counterfactual: true,
      methodNote: 'linear projection of the cited platform report',
    },
  };
  const recorded = await adapter.recordProductIntelligence(input);
  assert.ok(isRecord(recorded));
  assert.equal(recorded.basis.basis, 'counterfactual-forecast');
  assert.equal(recorded.basis.counterfactual, true);
  assert.equal(recorded.basis.methodNote, 'linear projection of the cited platform report');
  assert.equal(recorded.source.sourceKind, 'forecast-model');
});

test('cited commerce observations are carried as provenance-labeled citations', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const input: RecordProductIntelligenceInput = {
    ...factInput(),
    id: 'pi-price-observation' as RecordProductIntelligenceInput['id'],
    content: {
      kind: 'product-fact',
      statement: 'the marketplace listing carries a 49 USD price tag',
      evidenceRefs: ['commerce://marketplace-a/listing-42'],
    },
    source: { sourceKind: 'external-commerce-system', sourceRefs: ['commerce://marketplace-a/listing-42'] },
    citedCommerceObservations: [
      {
        observationRef: 'commerce://marketplace-a/listing-42',
        observedAspect: 'listing-price',
        sourceSystem: 'marketplace-a',
        observedAt: '2026-06-12T00:00:00.000Z' as Timestamp,
      },
    ],
  };
  const recorded = await adapter.recordProductIntelligence(input);
  assert.ok(isRecord(recorded));
  assert.deepEqual(recorded.citedCommerceObservations, [
    {
      observationRef: 'commerce://marketplace-a/listing-42',
      observedAspect: 'listing-price',
      sourceSystem: 'marketplace-a',
      observedAt: '2026-06-12T00:00:00.000Z',
    },
  ]);
});

test('an external-commerce-system source without citations fails closed', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const input: RecordProductIntelligenceInput = {
    ...factInput(),
    source: { sourceKind: 'external-commerce-system', sourceRefs: ['commerce://marketplace-a/listing-42'] },
  };
  const failure = await adapter.recordProductIntelligence(input);
  assert.ok('error' in failure);
  assert.equal(failure.error, 'commerce-citation-required');
  // Nothing was recorded.
  const versions = await adapter.listProductIntelligenceVersions(scopeOf('tenant-a'), input.id);
  assert.equal(versions.length, 0);
});

// ---------------------------------------------------------------------------
// Version chains + append-only
// ---------------------------------------------------------------------------

test('records append as versions 1..n and never rewrite earlier versions', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const base = factInput();
  const v1 = await adapter.recordProductIntelligence(base);
  const v2 = await adapter.recordProductIntelligence({
    ...base,
    content: { ...factContent(), statement: 'the landing page now leads with the outcome proof' },
  });
  const v3 = await adapter.recordProductIntelligence({
    ...base,
    content: { ...factContent(), statement: 'the landing page now leads with the instructor reel' },
  });
  assert.ok(isRecord(v1) && isRecord(v2) && isRecord(v3));
  assert.equal(v1.version, 1);
  assert.equal(v2.version, 2);
  assert.equal(v3.version, 3);
  const versions = await adapter.listProductIntelligenceVersions(scopeOf('tenant-a'), base.id);
  assert.equal(versions.length, 3);
  assert.deepEqual(versions.map((record) => record.version), [1, 2, 3]);
  // The earlier versions are bit-for-bit unchanged (append-only).
  assert.deepEqual(versions[0], v1);
  assert.deepEqual(versions[1], v2);
  // Latest fetch without a version returns the newest.
  const latest = await adapter.getProductIntelligenceRecord(scopeOf('tenant-a'), base.id);
  assert.deepEqual(latest, v3);
});

test('reads on unknown ids/versions miss cleanly and never create chains', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const scope = scopeOf('tenant-a');
  assert.equal(await adapter.getProductIntelligenceRecord(scope, 'pi-unknown' as never, 1), null);
  assert.equal(await adapter.getProductIntelligenceRecord(scope, 'pi-unknown' as never), null);
  assert.deepEqual(await adapter.listProductIntelligenceVersions(scope, 'pi-unknown' as never), []);
  assert.equal(await adapter.verifyProductIntelligenceIntegrity(scope, 'pi-unknown' as never), null);
  // A later record with the same id still starts at version 1 (no phantom chain).
  const recorded = await adapter.recordProductIntelligence(factInput());
  assert.ok(isRecord(recorded));
  assert.equal(recorded.version, 1);
});

// ---------------------------------------------------------------------------
// Search / listing
// ---------------------------------------------------------------------------

test('search filters by kind, basis and source kind with deterministic order', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const scope = scopeOf('tenant-a');
  await adapter.recordProductIntelligence(factInput());
  await adapter.recordProductIntelligence(metricInput());
  await adapter.recordProductIntelligence(observationInput());
  await adapter.recordProductIntelligence({
    ...metricInput(),
    id: 'pi-forecast' as RecordProductIntelligenceInput['id'],
    content: { ...metricContent(), metric: 'projected-reach', value: 1500 },
    source: { sourceKind: 'forecast-model', sourceRefs: ['analytics://platform/reach-report-1'] },
    basis: {
      basis: 'counterfactual-forecast',
      counterfactual: true,
      methodNote: 'linear projection of the cited platform report',
    },
  });

  const facts = await adapter.searchProductIntelligence(scope, { kinds: ['product-fact'] });
  assert.ok(Array.isArray(facts));
  assert.equal(facts.length, 1);
  assert.equal(facts[0]?.kind, 'product-fact');

  const forecasts = await adapter.searchProductIntelligence(scope, {
    basis: 'counterfactual-forecast',
  });
  assert.ok(Array.isArray(forecasts));
  assert.equal(forecasts.length, 1);
  assert.equal(forecasts[0]?.id, 'pi-forecast');

  const observed = await adapter.searchProductIntelligence(scope, {
    basis: 'cited-external-evidence',
  });
  assert.ok(Array.isArray(observed));
  assert.equal(observed.length, 3);

  const bySource = await adapter.searchProductIntelligence(scope, {
    sourceKinds: ['human-report'],
  });
  assert.ok(Array.isArray(bySource));
  assert.equal(bySource.length, 1);
  assert.equal(bySource[0]?.source.sourceKind, 'human-report');

  // Deterministic (subject, id) ordering across the full set.
  const all = await adapter.searchProductIntelligence(scope, {});
  assert.ok(Array.isArray(all));
  const sortedIds = all
    .map((record) => record.id as string)
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  assert.deepEqual(
    all.map((record) => record.id),
    sortedIds,
  );
});

test('search returns the LATEST version per chain, never stale versions', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const scope = scopeOf('tenant-a');
  const base = factInput();
  await adapter.recordProductIntelligence(base);
  await adapter.recordProductIntelligence({
    ...base,
    content: { ...factContent(), statement: 'the landing page now leads with the outcome proof' },
  });
  const results = await adapter.searchProductIntelligence(scope, { subject: base.subject });
  assert.ok(Array.isArray(results));
  assert.equal(results.length, 1);
  assert.equal(results[0]?.version, 2);
});

test('search limit caps the deterministic result set and rejects invalid limits', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const scope = scopeOf('tenant-a');
  await adapter.recordProductIntelligence(factInput());
  await adapter.recordProductIntelligence(metricInput());
  await adapter.recordProductIntelligence(observationInput());
  const capped = await adapter.searchProductIntelligence(scope, { limit: 2 });
  assert.ok(Array.isArray(capped));
  assert.equal(capped.length, 2);
  for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001]) {
    const failure = await adapter.searchProductIntelligence(scope, { limit: invalid });
    assert.ok('error' in failure, `limit ${String(invalid)} must fail closed`);
    assert.equal(failure.error, 'invalid-input');
  }
});

test('listProductIntelligenceForSubject returns latest-per-chain for that subject only', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const scope = scopeOf('tenant-a');
  await adapter.recordProductIntelligence(factInput());
  await adapter.recordProductIntelligence(metricInput());
  const other = {
    ...observationInput(),
    subject: 'product://course/mini-class' as RecordProductIntelligenceInput['subject'],
  };
  await adapter.recordProductIntelligence(other);
  const forSubject = await adapter.listProductIntelligenceForSubject(
    scope,
    factInput().subject,
  );
  assert.equal(forSubject.length, 2);
  assert.ok(forSubject.every((record) => record.subject === factInput().subject));
});

// ---------------------------------------------------------------------------
// Citation resolution (the planner-facing port)
// ---------------------------------------------------------------------------

test('versioned citations resolve in order into frozen records', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const scope = scopeOf('tenant-a');
  const v1 = await adapter.recordProductIntelligence(factInput());
  const v2 = await adapter.recordProductIntelligence({
    ...factInput(),
    content: { ...factContent(), statement: 'the landing page now leads with the outcome proof' },
  });
  assert.ok(isRecord(v1) && isRecord(v2));
  const citations: readonly ProductIntelligenceVersionRef[] = [
    { recordId: factInput().id, version: 1 },
    { recordId: factInput().id, version: 2 },
  ];
  const resolved = await adapter.resolveProductIntelligenceCitations(scope, citations);
  assert.ok(Array.isArray(resolved));
  assert.deepEqual(resolved, [v1, v2]);
});

test('unresolvable citations fail closed (never silently-dropped provenance)', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const scope = scopeOf('tenant-a');
  await adapter.recordProductIntelligence(factInput());
  const unknownRecord = await adapter.resolveProductIntelligenceCitations(scope, [
    { recordId: 'pi-nope' as ProductIntelligenceVersionRef['recordId'], version: 1 },
  ]);
  assert.ok('error' in unknownRecord);
  assert.equal(unknownRecord.error, 'citation-not-found');
  const unknownVersion = await adapter.resolveProductIntelligenceCitations(scope, [
    { recordId: factInput().id, version: 9 },
  ]);
  assert.ok('error' in unknownVersion);
  assert.equal(unknownVersion.error, 'citation-not-found');
  const malformed = await adapter.resolveProductIntelligenceCitations(scope, [
    { recordId: '' as ProductIntelligenceVersionRef['recordId'], version: 1 },
  ]);
  assert.ok('error' in malformed);
  assert.equal(malformed.error, 'invalid-citation');
  const badVersion = await adapter.resolveProductIntelligenceCitations(scope, [
    { recordId: factInput().id, version: 0 },
  ]);
  assert.ok('error' in badVersion);
  assert.equal(badVersion.error, 'invalid-citation');
});

// ---------------------------------------------------------------------------
// Integrity + determinism
// ---------------------------------------------------------------------------

test('recorded records verify intact; the digest is a bit-for-bit change detector', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const scope = scopeOf('tenant-a');
  const recorded = await adapter.recordProductIntelligence(factInput());
  assert.ok(isRecord(recorded));
  const report = await adapter.verifyProductIntelligenceIntegrity(scope, factInput().id, 1);
  assert.notEqual(report, null);
  assert.equal(report?.status, 'intact');
  assert.equal(report?.recordedDigest, recorded.recordDigest);
  assert.equal(report?.recomputedDigest, recorded.recordDigest);
});

test('identical inputs under a fixed clock produce bit-for-bit identical records and digests', async () => {
  const first = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const second = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const a = await first.recordProductIntelligence(factInput());
  const b = await second.recordProductIntelligence(factInput());
  assert.ok(isRecord(a) && isRecord(b));
  assert.deepEqual(a, b);
  assert.equal(a.recordDigest, b.recordDigest);
});

test('different content produces a different digest', async () => {
  const adapter = adapterWith([grantFixture('rights://grant/analyze-1')]);
  const a = await adapter.recordProductIntelligence(factInput());
  const b = await adapter.recordProductIntelligence({
    ...factInput(),
    content: { ...factContent(), statement: 'a different statement entirely' },
  });
  assert.ok(isRecord(a) && isRecord(b));
  assert.notEqual(a.recordDigest, b.recordDigest);
});

test('attribution is carried when the grant terms require it', async () => {
  const grant = grantFixture('rights://grant/attributed', {
    terms: {
      attributionRequired: true,
      commercialUseAllowed: false,
      derivationAllowed: false,
      notes: null,
    },
  });
  const adapter = adapterWith([grant]);
  const recorded = await adapter.recordProductIntelligence({
    ...factInput(),
    rightsRef: rightsRef('rights://grant/attributed'),
    attribution: 'marketplace-a listing data, © 2026 the rights holder',
  });
  assert.ok(isRecord(recorded));
  assert.equal(recorded.attribution, 'marketplace-a listing data, © 2026 the rights holder');
});
