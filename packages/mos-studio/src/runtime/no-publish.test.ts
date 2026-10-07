/**
 * THE STUDIO NEVER PUBLISHES — architectural surface assertion
 * (STUDIO-001; spec/mos-architecture-policy-v2.0.yaml studio
 * specialRules.noDirectPublication; spec/mos-architecture-v2.0.md §13: the
 * Studio produces artifact packages and hands them over; distribution is a
 * separate module/authority).
 *
 * This suite asserts the absence of any publish/distribute/provider surface
 * in the @mos/studio package in three ways:
 * 1. exported runtime surface: no exported binding whose name mentions
 *    publishing/distribution/providers;
 * 2. source scan: no publish/distribute/provider call sites or identifiers
 *    in the compiled-in source (comments stripped, string-aware);
 * 3. package manifest: no publish-ish script or dependency.
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import * as studio from "../index.js";
import { StudioRuntime } from "../runtime/studio-runtime.js";

/** Tokens whose presence in code would betray a publication path. */
const FORBIDDEN_TOKEN = /\b(publish\w*|unpublish\w*|distribut\w*|syndicat\w*|broadcast\w*|upload\w*|deploy\w*|provider\w*)\b/i;

/** Locate the package root (works from src/ and from the compiled dist/ tree). */
async function findPackageRoot(): Promise<string> {
  let dir = fileURLToPath(new URL("./", import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const manifestPath = join(dir, "package.json");
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { name?: string };
      if (manifest.name === "@mos/studio") {
        return dir;
      }
    } catch {
      // keep walking up
    }
    const parent = join(dir, "..");
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error("could not locate the @mos/studio package root");
}

const PACKAGE_ROOT = await findPackageRoot();

/** Recursively list .ts files under a directory. */
async function listTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(path)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

/**
 * Strip comments (// and /\*\*) from TypeScript source while respecting
 * string literals, template literals and regex-ish contexts. Approximate but
 * conservative for this package's style: the goal is to avoid flagging doc
 * comments that quote the rule itself ("THE STUDIO NEVER PUBLISHES").
 */
function stripComments(source: string): string {
  let out = "";
  let index = 0;
  let mode: "code" | "line" | "block" | "single" | "double" | "template" = "code";
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    switch (mode) {
      case "code": {
        if (char === "/" && next === "/") {
          mode = "line";
          index += 2;
        } else if (char === "/" && next === "*") {
          mode = "block";
          index += 2;
        } else if (char === "'") {
          mode = "single";
          out += char;
          index += 1;
        } else if (char === '"') {
          mode = "double";
          out += char;
          index += 1;
        } else if (char === "`") {
          mode = "template";
          out += char;
          index += 1;
        } else {
          out += char;
          index += 1;
        }
        break;
      }
      case "line": {
        if (char === "\n") {
          mode = "code";
          out += "\n";
        }
        index += 1;
        break;
      }
      case "block": {
        if (char === "*" && next === "/") {
          mode = "code";
          index += 2;
        } else {
          if (char === "\n") {
            out += "\n";
          }
          index += 1;
        }
        break;
      }
      case "single": {
        if (char === "\\") {
          index += 2;
        } else {
          if (char === "'") {
            mode = "code";
          }
          index += 1;
        }
        break;
      }
      case "double": {
        if (char === "\\") {
          index += 2;
        } else {
          if (char === '"') {
            mode = "code";
          }
          index += 1;
        }
        break;
      }
      case "template": {
        if (char === "\\") {
          index += 2;
        } else {
          if (char === "`") {
            mode = "code";
          }
          index += 1;
        }
        break;
      }
    }
  }
  return out;
}

test("exported runtime surface contains no publish/distribute/provider bindings", () => {
  const exports = Object.keys(studio);
  assert.ok(exports.length > 0, "the package must export its runtime surface");
  const offenders = exports.filter((name) => FORBIDDEN_TOKEN.test(name));
  assert.deepEqual(
    offenders,
    [],
    `@mos/studio must never export a publication/distribution/provider surface (found: ${offenders.join(", ")})`,
  );
  // And the single runtime class exposes no publish-like method names.
  const methodNames = Object.getOwnPropertyNames(StudioRuntime.prototype).filter(
    (name) => name !== "constructor",
  );
  const methodOffenders = methodNames.filter((name) => FORBIDDEN_TOKEN.test(name));
  assert.deepEqual(methodOffenders, [], "StudioRuntime must not declare publish/distribute/provider methods");
});

test("studio source (comments stripped) contains no publish/distribute/provider call sites", async () => {
  const files = (await listTypeScriptFiles(join(PACKAGE_ROOT, "src"))).filter(
    (path) => !path.endsWith(".test.ts"),
  );
  assert.ok(files.length > 20, `expected the full studio source tree, found ${files.length} files`);
  const offenders: string[] = [];
  for (const path of files) {
    const stripped = stripComments(await readFile(path, "utf8"));
    // Extract identifier-ish tokens so string literals of test fixtures do not
    // hide real call sites; scan the code (identifiers + strings) directly.
    const match = stripped.match(FORBIDDEN_TOKEN);
    if (match !== null) {
      offenders.push(`${path}: "${match[0]}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `the studio source must contain no publish/distribute/provider identifiers (found: ${offenders.join("; ")})`,
  );
});

test("package manifest declares no publish-ish script or dependency", async () => {
  const manifest = JSON.parse(await readFile(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const scriptNames = Object.keys(manifest.scripts ?? {});
  const depNames = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
  assert.deepEqual(scriptNames.filter((name) => FORBIDDEN_TOKEN.test(name)), []);
  assert.deepEqual(depNames.filter((name) => FORBIDDEN_TOKEN.test(name)), []);
});
