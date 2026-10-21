import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared scan substrate for the presentation-only structural pins of
 * `@mos/desktop` (registry module `desktop`) — adapted from @mos/web's
 * `testing/pin-scan.ts`. Loads the package's `src`, `composition`,
 * `testing` and the package-root mount entry sources ONCE (top-level
 * await — node --test imports this module from the pin test files) and
 * provides the string-aware import extractor + comment/string stripper
 * the pins assert with.
 */

/** Locate the package root (works from the compiled out/ tree). */
async function findPackageRoot(): Promise<string> {
  let dir = fileURLToPath(new URL('./', import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const manifestPath = join(dir, 'package.json');
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { name?: string };
      if (manifest.name === '@mos/desktop') {
        return dir;
      }
    } catch {
      // keep walking up
    }
    const parent = join(dir, '..');
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error('could not locate the @mos/desktop package root');
}

/** Recursively list files under a directory (relative names, posix). */
async function walkFiles(root: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files.sort();
}

/** A source span that is a comment or a string literal. */
interface Span {
  readonly start: number;
  readonly end: number;
  readonly kind: 'comment' | 'string';
}

/**
 * Compute comment and string spans (single/double/template literals;
 * template interpolations are treated as part of the string). Regex literals
 * are not modeled — the scanned sources contain none in code position.
 */
function computeSpans(source: string): Span[] {
  const spans: Span[] = [];
  let mode: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl' = 'code';
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    switch (mode) {
      case 'code': {
        if (char === '/' && next === '/') {
          mode = 'line';
          start = index;
          index += 1;
        } else if (char === '/' && next === '*') {
          mode = 'block';
          start = index;
          index += 1;
        } else if (char === "'") {
          mode = 'sq';
          start = index;
        } else if (char === '"') {
          mode = 'dq';
          start = index;
        } else if (char === '`') {
          mode = 'tpl';
          start = index;
        }
        break;
      }
      case 'line': {
        if (char === '\n') {
          spans.push({ start, end: index, kind: 'comment' });
          mode = 'code';
        }
        break;
      }
      case 'block': {
        if (char === '*' && next === '/') {
          spans.push({ start, end: index + 2, kind: 'comment' });
          mode = 'code';
          index += 1;
        }
        break;
      }
      case 'sq': {
        if (char === '\\') {
          index += 1;
        } else if (char === "'" || char === '\n') {
          spans.push({ start, end: index + 1, kind: 'string' });
          mode = 'code';
        }
        break;
      }
      case 'dq': {
        if (char === '\\') {
          index += 1;
        } else if (char === '"' || char === '\n') {
          spans.push({ start, end: index + 1, kind: 'string' });
          mode = 'code';
        }
        break;
      }
      case 'tpl': {
        if (char === '\\') {
          index += 1;
        } else if (char === '`') {
          spans.push({ start, end: index + 1, kind: 'string' });
          mode = 'code';
        }
        break;
      }
    }
  }
  return spans;
}

function inside(spans: readonly Span[], position: number): Span | null {
  return spans.find((span) => position >= span.start && position < span.end) ?? null;
}

/**
 * Extract module specifiers recognized only in CODE position: `from '…'`
 * (import/export-from), side-effect `import '…'`, dynamic `import('…')` and
 * `require('…')`.
 */
export function extractImportSpecifiers(source: string): string[] {
  const spans = computeSpans(source);
  const specifiers: string[] = [];
  const patterns: RegExp[] = [
    /\bfrom\s*(['"])([^'"]+)\1/g,
    /\bimport\s*(['"])([^'"]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"]+)\1/g,
    /\brequire\s*\(\s*(['"])([^'"]+)\1/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const keywordStart = match.index ?? 0;
      const specifier = match[2];
      if (specifier !== undefined && inside(spans, keywordStart) === null) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

/** Source with comments and string-literal CONTENTS removed. */
export function stripCommentsAndStrings(source: string): string {
  const spans = computeSpans(source);
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    out += source.slice(cursor, span.start);
    cursor = span.end;
  }
  out += source.slice(cursor);
  return out;
}

/**
 * Remove TYPE-ONLY import/export statements (`import type { … } from '…'`,
 * `export type { … } from '…'` — erased at compile time, so they do not
 * count as runtime imports for the seam-depth pins).
 */
export function stripTypeOnlyImports(source: string): string {
  return source.replace(
    /(?:^|\n)\s*(?:import|export)\s+type\s+\{[\s\S]*?\}\s*from\s*(['"])[^'"]+\1;?/g,
    '',
  );
}

/**
 * The DOMAIN runtime packages (the composition seam's territory — `src/`
 * is presentation-only and may import only `@mos/web` + `@mos/contracts`
 * + relative paths).
 */
export const DOMAIN_RUNTIME_PACKAGES = [
  '@mos/identity',
  '@mos/missions',
  '@mos/lab',
  '@mos/studio',
  '@mos/production',
  '@mos/integrations',
  '@mos/distribution',
] as const;

export function importRoot(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    const scoped = parts[1];
    return parts.length >= 2 && scoped !== undefined ? `${parts[0]}/${scoped}` : specifier;
  }
  return specifier.split('/')[0] ?? specifier;
}

export function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

export function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith('node:') || specifier === 'node';
}

async function readSources(files: readonly string[]): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for (const file of files) {
    sources.set(file, await readFile(join(packageRoot, file), 'utf8'));
  }
  return sources;
}

export const packageRoot = await findPackageRoot();
// walkFiles walks `join(root, prefix)` and returns prefixed relative names,
// so the package root is passed as the root and the subtree as the prefix.
export const srcFiles = await walkFiles(packageRoot, 'src');
export const compositionFiles = await walkFiles(packageRoot, 'composition');
export const testingFiles = await walkFiles(packageRoot, 'testing');

export const srcSources = await readSources(srcFiles.filter((file) => /\.(ts|tsx)$/.test(file)));
export const compositionSources = await readSources(
  compositionFiles.filter((file) => /\.(ts|tsx)$/.test(file)),
);
export const entrySource = await readFile(join(packageRoot, 'mos-desktop-entry.jsx'), 'utf8');

/** Every source file the package-wide pins scan (src + seam + entry). */
export function allPackageSources(): Map<string, string> {
  return new Map<string, string>([
    ...srcSources,
    ...compositionSources,
    ['mos-desktop-entry.jsx', entrySource],
  ]);
}
