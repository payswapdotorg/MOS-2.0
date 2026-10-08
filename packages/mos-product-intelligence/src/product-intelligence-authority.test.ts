/**
 * PRODUCT-INTELLIGENCE AUTHORITY DISCIPLINE pins (W11-A — the §25 boundary,
 * structurally pinned over this package's own sources; the mos-production
 * no-second-runtime precedent).
 *
 * 1. §25 boundary statement — EVERY stored record carries the pinned
 *    `intelligenceOnly` statement verbatim + the §24-style analysis-artifact
 *    labels (`recordKind` / `disclosure`); forecast records carry
 *    `counterfactual === true`, cited-evidence records `=== false`.
 * 2. Port surface pin — the port carries EXACTLY the seven declared
 *    methods; the ONLY write path is the append-only record path; NO
 *    method name carries mission/plan/decision/commerce-authority
 *    vocabulary (§25: informs planning only).
 * 3. Exported-surface pin — the runtime exports are exactly the pinned
 *    three (one factory + two frozen vocabularies).
 * 4. Registry-exact import pin — every bare `@mos/*` import in non-test
 *    sources is one of the frozen module-registry dependencies
 *    [@mos/contracts, @mos/identity, @mos/rights]; zero `@zcode/*`.
 * 5. Lockfile discipline — the pnpm-lock.yaml importer for this package
 *    carries exactly the registry-exact dependency set (the disclosed
 *    lockfile delta).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as publicSurface from './index.js';
import { createInMemoryProductIntelligence } from './adapters/in-memory-product-intelligence.js';
import type { ProductIntelligencePort } from './ports/product-intelligence-port.js';
import type { RecordProductIntelligenceInput } from './ports/product-intelligence-port.js';
import type { RightsGrant, RightsRef } from '@mos/rights';
import type { TenantId, TenantScope, Timestamp } from '@mos/contracts';
import type { IdentityId } from '@mos/identity';

const SRC_ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The frozen module-registry dependency set for product-intelligence. */
const REGISTRY_EXACT_IMPORTS: readonly string[] = [
  '@mos/contracts',
  '@mos/identity',
  '@mos/rights',
];

/** The pinned §25 boundary statement carried on every record. */
const INTELLIGENCE_ONLY =
  'product intelligence informs marketing planning only — it carries no mission authority, never authors commerce truth (external commerce observations are cited with provenance and never become orders, inventory or listing state), and counterfactual-forecast records are explicitly labeled simulated, never reality (§25)';

/**
 * Strips comments and string/template contents (replaced by spaces, keeping
 * newlines) so scans see only code tokens — the mos-production precedent.
 */
function stripCommentsAndStringContents(source: string): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1] ?? '';
    switch (mode) {
      case 'code': {
        if (ch === '/' && next === '/') {
          mode = 'line';
          out += '  ';
          i += 2;
        } else if (ch === '/' && next === '*') {
          mode = 'block';
          out += '  ';
          i += 2;
        } else if (ch === "'") {
          mode = 'single';
          out += ' ';
          i += 1;
        } else if (ch === '"') {
          mode = 'double';
          out += ' ';
          i += 1;
        } else if (ch === '`') {
          mode = 'template';
          out += ' ';
          i += 1;
        } else {
          out += ch;
          i += 1;
        }
        break;
      }
      case 'line': {
        if (ch === '\n') {
          mode = 'code';
          out += '\n';
        } else {
          out += ' ';
        }
        i += 1;
        break;
      }
      case 'block': {
        if (ch === '*' && next === '/') {
          mode = 'code';
          out += '  ';
          i += 2;
        } else {
          if (ch === '\n') {
            out += '\n';
          } else {
            out += ' ';
          }
          i += 1;
        }
        break;
      }
      case 'single': {
        if (ch === '\\') {
          out += '  ';
          i += 2;
        } else if (ch === "'") {
          mode = 'code';
          out += ' ';
          i += 1;
        } else {
          out += ' ';
          i += 1;
        }
        break;
      }
      case 'double': {
        if (ch === '\\') {
          out += '  ';
          i += 2;
        } else if (ch === '"') {
          mode = 'code';
          out += ' ';
          i += 1;
        } else {
          out += ' ';
          i += 1;
        }
        break;
      }
      case 'template': {
        if (ch === '\\') {
          out += '  ';
          i += 2;
        } else if (ch === '`') {
          mode = 'code';
          out += ' ';
          i += 1;
        } else {
          out += ch === '\n' ? '\n' : ' ';
          i += 1;
        }
        break;
      }
    }
  }
  return out;
}

/** All non-test .ts files under src/, as package-relative paths. */
function listNonTestSources(): string[] {
  const files: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        walk(`${dir}/${entry.name}`, `${relative}/`);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        files.push(relative);
      }
    }
  };
  walk(SRC_ROOT, '');
  return files;
}

const sources = listNonTestSources().map((path) => ({
  path,
  raw: readFileSync(`${SRC_ROOT}${path}`, 'utf8'),
}));
for (const source of sources) {
  (source as { stripped?: string }).stripped = stripCommentsAndStringContents(source.raw);
}

// ---------------------------------------------------------------------------
// Fixtures for the record-shape pins
// ---------------------------------------------------------------------------

const NOW = '2026-06-15T12:00:00.000Z' as Timestamp;
const rightsRef = (value: string): RightsRef => value as RightsRef;
const identityId = (value: string): IdentityId => value as IdentityId;
const tenantId = (value: string): TenantId => value as TenantId;
const scopeOf = (tenant: string): TenantScope => ({ tenantId: tenantId(tenant) });

const grantFixture = (id: string): RightsGrant => ({
  id: rightsRef(id),
  tenantId: tenantId('tenant-a'),
  version: 1,
  scope: {
    actions: ['analyze'],
    subjectRefs: ['analytics://platform/reach-report-1'],
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
});

const port: ProductIntelligencePort = createInMemoryProductIntelligence({
  rights: {
    getRights: (ref: RightsRef): RightsGrant | null =>
      ref === 'rights://grant/analyze-1' ? grantFixture('rights://grant/analyze-1') : null,
  },
  now: () => NOW,
});

const citedInput: RecordProductIntelligenceInput = {
  scope: scopeOf('tenant-a'),
  id: 'pi-pin-1' as RecordProductIntelligenceInput['id'],
  subject: 'product://course/masterclass' as RecordProductIntelligenceInput['subject'],
  content: {
    kind: 'product-fact',
    statement: 'a pinned statement',
    evidenceRefs: ['analytics://platform/reach-report-1'],
  },
  source: { sourceKind: 'platform-analytics', sourceRefs: ['analytics://platform/reach-report-1'] },
  basis: {
    basis: 'cited-external-evidence',
    counterfactual: false,
    observedAt: '2026-06-10T00:00:00.000Z' as Timestamp,
  },
  rightsRef: rightsRef('rights://grant/analyze-1'),
  recordedBy: identityId('identity-analyst'),
  note: null,
};

const forecastInput: RecordProductIntelligenceInput = {
  ...citedInput,
  id: 'pi-pin-2' as RecordProductIntelligenceInput['id'],
  source: { sourceKind: 'forecast-model', sourceRefs: ['analytics://platform/reach-report-1'] },
  basis: {
    basis: 'counterfactual-forecast',
    counterfactual: true,
    methodNote: 'linear projection of the cited platform report',
  },
};

// ---------------------------------------------------------------------------
// 1. The §25 boundary statement pins
// ---------------------------------------------------------------------------

test('every non-test source file is scanned (the pin covers the whole package)', () => {
  assert.ok(sources.length >= 6, `expected to scan the package sources, found ${sources.length}`);
});

test('every record carries the pinned §25 boundary statement verbatim (§24-style)', async () => {
  const cited = await port.recordProductIntelligence(citedInput);
  const forecast = await port.recordProductIntelligence(forecastInput);
  assert.ok(!('error' in cited) && !('error' in forecast));
  assert.equal(cited.intelligenceOnly, INTELLIGENCE_ONLY);
  assert.equal(forecast.intelligenceOnly, INTELLIGENCE_ONLY);
  assert.equal(cited.recordKind, 'product-intelligence-analysis');
  assert.equal(forecast.recordKind, 'product-intelligence-analysis');
  assert.equal(
    cited.disclosure,
    'evidence-linked-product-intelligence-with-explicit-source-attribution',
  );
  assert.equal(
    forecast.disclosure,
    'evidence-linked-product-intelligence-with-explicit-source-attribution',
  );
});

test('counterfactual labels: forecasts true, cited evidence false — never confusable', async () => {
  const cited = await port.recordProductIntelligence(citedInput);
  const forecast = await port.recordProductIntelligence(forecastInput);
  assert.ok(!('error' in cited) && !('error' in forecast));
  assert.equal(cited.basis.counterfactual, false);
  assert.equal(forecast.basis.counterfactual, true);
  assert.equal(cited.basis.basis, 'cited-external-evidence');
  assert.equal(forecast.basis.basis, 'counterfactual-forecast');
});

// ---------------------------------------------------------------------------
// 2. The port surface pin (§25: informs planning only)
// ---------------------------------------------------------------------------

test('the port surface is EXACTLY the seven declared methods (no authority vocabulary)', async () => {
  const methodNames = Object.keys(port).sort();
  assert.deepEqual(methodNames, [
    'getProductIntelligenceRecord',
    'listProductIntelligenceForSubject',
    'listProductIntelligenceVersions',
    'recordProductIntelligence',
    'resolveProductIntelligenceCitations',
    'searchProductIntelligence',
    'verifyProductIntelligenceIntegrity',
  ]);
  // SEVEN methods ≤ the 12 policy budget; the only write path is the
  // append-only record path. NO mission/plan/decision/commerce-authority
  // vocabulary anywhere in the surface (§25).
  assert.equal(methodNames.length, 7);
  for (const name of methodNames) {
    assert.equal(
      /^(update|delete|remove|rewrite|plan|mission|decide|order|inventory|listing|commerce|publish|run|measure|experiment)/.test(
        name,
      ),
      false,
      `method name "${name}" carries authority vocabulary`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. The exported-surface pin
// ---------------------------------------------------------------------------

test('the exported runtime surface is exactly the pinned set (1 factory + 2 frozen vocabularies)', () => {
  const runtimeExports = Object.keys(publicSurface).sort();
  assert.deepEqual(runtimeExports, [
    'PRODUCT_INTELLIGENCE_KINDS',
    'PRODUCT_INTELLIGENCE_SOURCE_KINDS',
    'createInMemoryProductIntelligence',
  ]);
  assert.equal(typeof publicSurface.createInMemoryProductIntelligence, 'function');
  assert.equal(Object.isFrozen(publicSurface.PRODUCT_INTELLIGENCE_KINDS), true);
  assert.equal(Object.isFrozen(publicSurface.PRODUCT_INTELLIGENCE_SOURCE_KINDS), true);
  assert.deepEqual(publicSurface.PRODUCT_INTELLIGENCE_KINDS, [
    'product-fact',
    'product-metric',
    'product-observation',
  ]);
  assert.deepEqual(publicSurface.PRODUCT_INTELLIGENCE_SOURCE_KINDS, [
    'platform-analytics',
    'external-commerce-system',
    'human-report',
    'derived-analysis',
    'forecast-model',
  ]);
});

// ---------------------------------------------------------------------------
// 4. Registry-exact imports (+ zero @zcode)
// ---------------------------------------------------------------------------

test('registry-exact imports only: every bare @mos/* import is a declared registry dependency', () => {
  const importPattern = /from\s+["'](@mos\/[a-z-]+)["']/g;
  const imported = new Set<string>();
  for (const { raw } of sources) {
    for (const match of raw.matchAll(importPattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        imported.add(specifier);
      }
    }
  }
  assert.deepEqual(
    [...imported].sort(),
    [...REGISTRY_EXACT_IMPORTS].sort(),
    'the module registry declares product-intelligence dependencies [contracts, identity, rights] EXACTLY (spec/mos-module-registry-v2.0.yaml) — no other @mos/* import is allowed',
  );
});

test('zero @zcode/* imports anywhere in the package sources', () => {
  for (const { raw } of sources) {
    assert.equal(raw.includes('@zcode/'), false, 'MOS domain packages never import the substrate');
  }
});

// ---------------------------------------------------------------------------
// 5. Lockfile discipline
// ---------------------------------------------------------------------------

test('lockfile discipline: the mos-product-intelligence importer carries exactly the registry-exact dependencies', () => {
  const lockfile = readFileSync(`${REPO_ROOT}pnpm-lock.yaml`, 'utf8');
  const importerMatch =
    / {2}packages\/mos-product-intelligence:\n([\s\S]*?)(?=\n {2}packages\/|\nimporters:|$)/.exec(
      lockfile,
    );
  assert.ok(importerMatch !== null, 'the mos-product-intelligence importer must exist');
  const importerBody = importerMatch[1] ?? '';
  const dependencySpecifiers = [...importerBody.matchAll(/'(@mos\/[a-z-]+)':/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    [...new Set(dependencySpecifiers)].sort(),
    [...REGISTRY_EXACT_IMPORTS].sort(),
    'the lockfile delta must be the registry-exact importer entries only (workspace deps, no external runtime deps)',
  );
  // The dependencies block carries ONLY the workspace deps (no external
  // runtime dependency can ride along).
  const dependenciesBlock =
    / {4}dependencies:\n([\s\S]*?)(?=\n {4}devDependencies:|$)/.exec(importerBody);
  assert.ok(dependenciesBlock !== null, 'the importer must declare a dependencies block');
  const dependencyKeys = [...(dependenciesBlock[1] ?? '').matchAll(/^ {6}'?([a-z@][a-z0-9._/-]*)'?:/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    dependencyKeys.sort(),
    [...REGISTRY_EXACT_IMPORTS].sort(),
    'only the registry-exact workspace dependencies may appear as runtime deps',
  );
  // The devDependencies block carries only the repo-standard dev tooling.
  const devDependenciesBlock = / {4}devDependencies:\n([\s\S]*?)(?=\n {2}packages\/|$)/.exec(
    importerBody,
  );
  assert.ok(devDependenciesBlock !== null, 'the importer must declare a devDependencies block');
  const devDependencyKeys = [...(devDependenciesBlock[1] ?? '').matchAll(/^ {6}'?([a-z@][a-z0-9._/-]*)'?:/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    devDependencyKeys.sort(),
    ['@types/node', 'typescript'],
    'devDependencies are limited to the repo-standard dev tooling',
  );
});
