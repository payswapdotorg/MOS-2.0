/**
 * Presentation-only HYGIENE pins for `@mos/desktop` (registry module
 * `desktop`, test-enforced) — adapted from @mos/web's hygiene battery:
 *
 * 1. NO ZCODE pin — no `@zcode/*` import anywhere in the package's scanned
 *    sources (src/, composition/, the package-root .jsx entry).
 * 2. SRC PRESENTATION-ONLY pin — `src/` imports ONLY `@mos/web`,
 *    `@mos/contracts`, relative paths and node builtins; the DOMAIN runtime
 *    packages are importable ONLY in `composition/` (the seam, OUTSIDE
 *    src/) and never by relative dist path from `src/`.
 * 3. REACT ENTRY pin — `react`/`react-dom` are imported ONLY by the
 *    disclosed package-root `.jsx` entry (the boundary harness's scanned
 *    extensions stay react-free).
 * 4. RUNTIME DOMAIN IMPORT DEPTH pin — the composition seam imports the
 *    domain runtimes ONLY by the relative built-dist sibling paths
 *    (`../../mos-<pkg>/dist/index.js`), never fixture/`testing/` paths and
 *    never the `@mos/web` testing seam.
 * 5. NO-FIXTURE pin — no fixture or demo-seed imports anywhere.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOMAIN_RUNTIME_PACKAGES,
  allPackageSources,
  entrySource,
  extractImportSpecifiers,
  importRoot,
  isNodeBuiltin,
  isRelative,
  srcSources,
  stripTypeOnlyImports,
} from './pin-scan.js';

test('no @zcode/* import exists anywhere in the package sources', () => {
  const offenders: string[] = [];
  for (const [file, source] of allPackageSources()) {
    for (const specifier of extractImportSpecifiers(source)) {
      if (specifier.startsWith('@zcode/')) {
        offenders.push(`${file}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'the desktop shell mounts the MOS surface, never Zcode');
});

test('src/ is presentation-only: only @mos/web, @mos/contracts, relative and node builtins', () => {
  const allowed = new Set(['@mos/web', '@mos/contracts']);
  const offenders: string[] = [];
  for (const [file, source] of srcSources) {
    for (const specifier of extractImportSpecifiers(source)) {
      if (isRelative(specifier) || isNodeBuiltin(specifier)) {
        continue;
      }
      if (!allowed.has(importRoot(specifier))) {
        offenders.push(`${file}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'src/ is presentation-only: domain runtimes are imported exclusively by the composition seam outside src/',
  );
});

test('domain runtime packages appear only in composition/, never in src/', () => {
  const domain = new Set<string>(DOMAIN_RUNTIME_PACKAGES);
  const srcOffenders: string[] = [];
  for (const [file, source] of srcSources) {
    for (const specifier of extractImportSpecifiers(source)) {
      const root = importRoot(specifier);
      if (domain.has(root) || /\/mos-[a-z-]+\/dist\//.test(specifier)) {
        srcOffenders.push(`${file}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(
    srcOffenders,
    [],
    'domain runtime imports live only in the composition seam (composition/), outside the presentation-only src/ tree',
  );
});

test('react/react-dom are imported only by the disclosed package-root .jsx entry', () => {
  const offenders: string[] = [];
  for (const [file, source] of srcSources) {
    for (const specifier of extractImportSpecifiers(source)) {
      if (specifier === 'react' || specifier === 'react-dom' || specifier.startsWith('react-dom/')) {
        offenders.push(`${file}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'scanned src/ modules stay react-free by construction');

  const entryImports = extractImportSpecifiers(entrySource);
  assert.ok(
    entryImports.includes('react') && entryImports.includes('react-dom/client'),
    'the .jsx entry owns the react/react-dom mount imports',
  );
});

test('the composition seam imports domain runtimes only by relative built-dist sibling paths', () => {
  const offenders: string[] = [];
  for (const [file, source] of allPackageSources()) {
    // Type-only imports are erased at compile time — strip them before
    // extracting the RUNTIME import specifiers.
    const runtimeSource = stripTypeOnlyImports(source);
    for (const specifier of extractImportSpecifiers(runtimeSource)) {
      const root = importRoot(specifier);
      if (!DOMAIN_RUNTIME_PACKAGES.includes(root as (typeof DOMAIN_RUNTIME_PACKAGES)[number])) {
        continue;
      }
      // Package-name imports of domain runtimes are not executable in node
      // (their exports point at untranspiled src) — the seam discipline is
      // the relative built-dist sibling path.
      if (!/^(\.\.\/)+mos-[a-z-]+\/dist\/(index|[^/]+)\.js$/.test(specifier)) {
        offenders.push(`${file}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'domain runtimes are imported by the disclosed relative built-dist paths only (node-executable seam)',
  );
});

test('no fixture or demo-seed imports anywhere in the package', () => {
  const offenders: string[] = [];
  for (const [file, source] of allPackageSources()) {
    for (const specifier of extractImportSpecifiers(source)) {
      if (/fixture|demo|seed/i.test(specifier)) {
        offenders.push(`${file}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'the production composition binds real runtimes — no fixtures, no demo seeds',
  );
});
