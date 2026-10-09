/**
 * Presentation-only IMPORT pins (WEB-001 / UX-001 / UX-002, test-enforced).
 *
 * The web module's registry authority is PRESENTATION-ONLY (deps
 * `[contracts]`): the package renders what view ports provide and declares
 * intent — nothing else. These pins keep that structural:
 *
 * 1. IMPORT pins (this file) — every `.ts` and `.tsx` file under `src`
 *    imports ONLY relative modules and `@mos/contracts`; the two `.jsx`
 *    mounting shims add exactly `react` and `react-dom/client`;
 *    `vite.config.cts` adds exactly the build tooling; the `testing`
 *    composition seam adds exactly `@mos/identity` + `@mos/missions` (the
 *    UX-001 runtime dependency set) and `@mos/studio` — TYPE-ONLY outside
 *    the node-only compat battery (the studio runtime is node-side; a value
 *    import of it would break the browser bundle) — plus node builtins. No
 *    `@zcode` package and no engine/provider SDK anywhere in the package.
 *
 * Vocabulary, retired-identity, no-publish and port-budget pins live in
 * `presentation-only-hygiene.test.ts` (same scan substrate, `pin-scan.ts`).
 */

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  allPackageSources,
  DOMAIN_PACKAGES,
  ENGINE_SDK_ROOTS,
  extractImportSpecifiers,
  importRoot,
  isNodeBuiltin,
  isRelative,
  packageRoot,
  seamSources,
  srcFiles,
  srcJsxFiles,
  srcJsxSources,
  srcTsSources,
  viteConfigSource,
} from './pin-scan.js';

test('src TypeScript imports only relative modules and @mos/contracts', () => {
  const offenders: string[] = [];
  for (const [file, source] of srcTsSources) {
    for (const specifier of extractImportSpecifiers(source)) {
      const allowed = isRelative(specifier) || specifier === '@mos/contracts';
      if (!allowed) {
        offenders.push(`${file}: "${specifier}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'src .ts/.tsx may import only relative + @mos/contracts');
});

test('src TypeScript never imports react directly (JSX runtime is compiler-emitted)', () => {
  const offenders: string[] = [];
  for (const [file, source] of srcTsSources) {
    for (const specifier of extractImportSpecifiers(source)) {
      if (importRoot(specifier) === 'react' || importRoot(specifier) === 'react-dom') {
        offenders.push(`${file}: "${specifier}"`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('the .jsx mounting shims import only react, react-dom/client and relative modules', () => {
  const offenders: string[] = [];
  for (const [file, source] of srcJsxSources) {
    for (const specifier of extractImportSpecifiers(source)) {
      const allowed =
        isRelative(specifier) || specifier === 'react' || specifier === 'react-dom/client';
      if (!allowed) {
        offenders.push(`${file}: "${specifier}"`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    '.jsx shims are the disclosed react/react-dom mounting exception — nothing else',
  );
});

test('the .jsx extension disclosure stays exactly the two mounting shims', () => {
  assert.deepEqual(srcJsxFiles, ['src/main.jsx', 'src/shell/error-boundary.jsx']);
});

test('src carries no compiler-bypassing script extensions (.js/.mjs/.mts/.cjs)', () => {
  const offenders = srcFiles.filter((file) =>
    /\.(js|mjs|cjs|mts|cts)$/.test(file),
  );
  assert.deepEqual(offenders, [], 'all src logic lives in scanned TypeScript or the pinned shims');
});

test('vite.config.cts imports only build tooling and node builtins', () => {
  const allowed = new Set([
    'node:fs',
    'node:path',
    'vite',
    '@vitejs/plugin-react',
    '@tailwindcss/vite',
  ]);
  const offenders = extractImportSpecifiers(viteConfigSource).filter(
    (specifier) => !allowed.has(specifier),
  );
  assert.deepEqual(offenders, []);
});

test('no @zcode/* import anywhere in the package source', () => {
  const offenders: string[] = [];
  for (const [file, source] of allPackageSources()) {
    for (const specifier of extractImportSpecifiers(source)) {
      if (specifier.startsWith('@zcode/')) {
        offenders.push(`${file}: "${specifier}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'the shell REPLACES the Zcode browser surface — patterns, not imports');
});

test('no engine/provider SDK import anywhere in the package source', () => {
  const offenders: string[] = [];
  for (const [file, source] of allPackageSources()) {
    for (const specifier of extractImportSpecifiers(source)) {
      if (ENGINE_SDK_ROOTS.includes(importRoot(specifier) as (typeof ENGINE_SDK_ROOTS)[number])) {
        offenders.push(`${file}: "${specifier}"`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('the composition seam imports only the UX-001/UX-002 dependency set + builtins', () => {
  const allowed = new Set(['@mos/contracts', '@mos/identity', '@mos/missions', '@mos/studio']);
  const offenders: string[] = [];
  for (const [file, source] of seamSources) {
    for (const specifier of extractImportSpecifiers(source)) {
      const ok =
        isRelative(specifier) ||
        isNodeBuiltin(specifier) ||
        (specifier.startsWith('@mos/') && allowed.has(importRoot(specifier)));
      if (!ok) {
        offenders.push(`${file}: "${specifier}"`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'testing/ is the disclosed seam over @mos/identity + @mos/missions (runtime) + @mos/studio (shapes) — no other domain package',
  );
});

test('@mos/studio is TYPE-ONLY in the seam outside the node-only compat battery', () => {
  // The REAL studio runtime imports node:crypto, so it can never run in the
  // browser bundle the seam boots. Every seam file EXCEPT the compat battery
  // may reference the studio package only in erased `import type` position
  // (package name OR relative dist path); the compat battery is the disclosed
  // node-side runtime consumer.
  const offenders: string[] = [];
  for (const [file, source] of seamSources) {
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
      continue;
    }
    // Strip erased `import type …;` blocks (multiline-safe), then look for
    // any REMAINING module specifier that reaches the studio package.
    const withoutTypeImports = source.replace(/import\s+type\s+[^;]*;/gs, '');
    for (const specifier of extractImportSpecifiers(withoutTypeImports)) {
      if (specifier === '@mos/studio' || specifier.startsWith('../../mos-studio/')) {
        offenders.push(`${file}: "${specifier}"`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'the studio package appears in the seam only as erased type imports (browser-bundle safety)',
  );
});

test('no domain package appears anywhere in src (registry: web deps [contracts])', () => {
  const offenders: string[] = [];
  for (const [file, source] of new Map<string, string>([...srcTsSources, ...srcJsxSources])) {
    for (const specifier of extractImportSpecifiers(source)) {
      if (DOMAIN_PACKAGES.includes(importRoot(specifier) as (typeof DOMAIN_PACKAGES)[number])) {
        offenders.push(`${file}: "${specifier}"`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('the browser-smoke script imports only node builtins and playwright-core', async () => {
  // The smoke script is the DISCLOSED `.cjs` extension exception (the frozen
  // boundary harness does not manage `.cjs`; the script must require the
  // workspace-provided playwright-core to drive the headless browser). This
  // pin keeps the exception exactly as narrow as disclosed: scripts/ may
  // import node builtins + playwright-core, nothing else.
  const scriptsDir = join(packageRoot, 'scripts');
  const allowed = new Set(['node:child_process', 'node:fs', 'node:path', 'node:http', 'playwright-core']);
  const offenders: string[] = [];
  let scriptCount = 0;
  try {
    for (const name of await readdir(scriptsDir)) {
      if (!name.endsWith('.cjs')) {
        offenders.push(`scripts/${name}: non-.cjs file in the disclosed scripts folder`);
        continue;
      }
      scriptCount += 1;
      const source = await readFile(join(scriptsDir, name), 'utf8');
      for (const specifier of extractImportSpecifiers(source)) {
        if (!allowed.has(specifier)) {
          offenders.push(`scripts/${name}: "${specifier}"`);
        }
      }
    }
  } catch {
    // no scripts folder — nothing to pin
  }
  assert.equal(scriptCount >= 1, true, 'the UX-002 browser smoke script exists');
  assert.deepEqual(
    offenders,
    [],
    'scripts/ is the disclosed browser-evidence exception: node builtins + playwright-core only',
  );
});
