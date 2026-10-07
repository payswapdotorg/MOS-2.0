/**
 * NO SECOND RUNTIME / NO MODEL ROUTER structural pins (LAB-013, §9 hard
 * rule — the W2-B single-model-boundary discipline applied to
 * packages/mos-production):
 *
 * Architecture lock rule 9 ("no second model router is introduced; model
 * selection remains behind a single model-runtime boundary") and lock rule
 * 8 ("transform pawns use the MOS agent body/instance runtime") pinned
 * STRUCTURALLY over this package's own sources (comments and string
 * contents are stripped before scanning):
 *
 * 1. Vocabulary ban — no non-test source declares model-selection/router
 *    vocabulary (`selectModel`, `chooseModel`, `pickModel`, `resolveModel`,
 *    `modelRouter`, `fallbackModel`, `router`).
 * 2. Single model-boundary call-site pin — `.bindModel(` (a call through a
 *    model-runtime port) appears in EXACTLY ONE non-test source file,
 *    exactly once: the agent-stack instance-registry double's `bind` (the
 *    disclosed mirror of the real registry's single call-site).
 * 3. modelRef surface pin — the token `modelRef` appears only in the pinned
 *    file set (seam declarations, record contracts, the boundary double,
 *    the execution run, the organization discipline, the composition seam).
 *    A new file touching model refs must be reviewed and added here
 *    deliberately.
 * 4. Single executor pin — `.execute(` (agent-instance execution) has
 *    exactly one call-site: the executor seam in the execution run.
 * 5. Single engine path pin — `.submit(` (EngineJob submission) has exactly
 *    one call-site: the runner seam in the execution run; the vocabulary
 *    `registerAdapter`/`EngineAdapter` NEVER appears in code (no engine
 *    adapter surface, no runner bypass).
 * 6. Registry-exact import pin — every bare `@mos/*` import in non-test
 *    sources is one of the frozen production module registry dependencies
 *    that exist (@mos/contracts, @mos/content, @mos/rights) — agents,
 *    agent-runtime, engines and lab are NOT production dependencies, so
 *    their surfaces are mirrored seams (compat-pinned), never imported.
 * 7. Exported-surface pin — the runtime exports are exactly the pinned set.
 * 8. Port method budgets — PawnExecutionPort 10, TransformPawnOrganization
 *    Port 3, and every mirrored seam ≤ 12 methods (counted on live port
 *    objects).
 * 9. Lockfile discipline — pnpm-lock.yaml's mos-production importer carries
 *    exactly the registry-exact dependency set.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as publicSurface from "./index.js";
import { composePawnStack } from "./testing/compose-pawn-stack.js";

const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Files that are allowed to mention the `modelRef` token (pin set). */
const MODEL_REF_FILE_ALLOWLIST: readonly string[] = [
  "adapters/in-memory-agent-stack.ts",
  "adapters/pawn-execution-run.ts",
  "contracts/pawn-execution.ts",
  "contracts/pawn-organization.ts",
  "domain/pawn-organization-compose.ts",
  "ports/agent-stack.ports.ts",
  "testing/compose-pawn-stack.ts",
];

/** The frozen production module registry dependencies that EXIST. */
const REGISTRY_EXACT_IMPORTS: readonly string[] = [
  "@mos/contracts",
  "@mos/content",
  "@mos/rights",
];

/** Banned model-selection/router vocabulary (word-boundary matched). */
const BANNED_VOCABULARY =
  /\b(?:selectModel|chooseModel|pickModel|resolveModel|modelRouter|fallbackModel|router)\b/i;

/**
 * Strips comments and string/template contents (replaced by spaces, keeping
 * newlines) so scans see only code tokens. State-machine approximation,
 * adequate for this package's controlled sources.
 */
function stripCommentsAndStringContents(source: string): string {
  let out = "";
  let i = 0;
  let mode: "code" | "line" | "block" | "single" | "double" | "template" = "code";
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1] ?? "";
    switch (mode) {
      case "code": {
        if (ch === "/" && next === "/") {
          mode = "line";
          out += "  ";
          i += 2;
        } else if (ch === "/" && next === "*") {
          mode = "block";
          out += "  ";
          i += 2;
        } else if (ch === "'") {
          mode = "single";
          out += " ";
          i += 1;
        } else if (ch === '"') {
          mode = "double";
          out += " ";
          i += 1;
        } else if (ch === "`") {
          mode = "template";
          out += " ";
          i += 1;
        } else {
          out += ch;
          i += 1;
        }
        break;
      }
      case "line": {
        if (ch === "\n") {
          mode = "code";
          out += "\n";
        } else {
          out += " ";
        }
        i += 1;
        break;
      }
      case "block": {
        if (ch === "*" && next === "/") {
          mode = "code";
          out += "  ";
          i += 2;
        } else {
          out += ch === "\n" ? "\n" : " ";
          i += 1;
        }
        break;
      }
      case "single":
      case "double": {
        const quote = mode === "single" ? "'" : '"';
        if (ch === "\\") {
          out += "  ";
          i += 2;
        } else if (ch === quote) {
          mode = "code";
          out += " ";
          i += 1;
        } else {
          out += ch === "\n" ? "\n" : " ";
          i += 1;
        }
        break;
      }
      case "template": {
        if (ch === "\\") {
          out += "  ";
          i += 2;
        } else if (ch === "`") {
          mode = "code";
          out += " ";
          i += 1;
        } else {
          out += ch === "\n" ? "\n" : " ";
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
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        files.push(relative);
      }
    }
  };
  walk(SRC_ROOT, "");
  return files;
}

const sources = listNonTestSources().map((path) => ({
  path,
  stripped: stripCommentsAndStringContents(readFileSync(`${SRC_ROOT}${path}`, "utf8")),
}));

test("every non-test source file is scanned (the pin covers the whole package)", () => {
  assert.ok(sources.length >= 20, `expected to scan the package sources, found ${sources.length}`);
});

test("no non-test source declares model-selection or router vocabulary", () => {
  for (const { path, stripped } of sources) {
    const match = BANNED_VOCABULARY.exec(stripped);
    assert.equal(
      match,
      null,
      `${path} must not declare model-selection/router vocabulary (lock rule 9): matched '${match?.[0] ?? ""}'`,
    );
  }
});

test(".bindModel( is called in exactly one place — the agent-stack registry double's bind", () => {
  const callSites = sources.filter(({ stripped }) => stripped.includes(".bindModel("));
  assert.deepEqual(
    callSites.map((file) => file.path),
    ["adapters/in-memory-agent-stack.ts"],
    "the ONLY call through a model boundary must be the instance registry's bind (the seam mirror of the real single call-site)",
  );
  const registry = sources.find(({ path }) => path === "adapters/in-memory-agent-stack.ts");
  assert.ok(registry !== undefined);
  const occurrences = registry.stripped.split(".bindModel(").length - 1;
  assert.equal(occurrences, 1, "exactly one bindModel call site in the registry double");
});

test("the modelRef token appears only in the pinned file set", () => {
  const offenders = sources
    .filter(({ stripped }) => stripped.includes("modelRef"))
    .filter(({ path }) => !MODEL_REF_FILE_ALLOWLIST.includes(path))
    .map(({ path }) => path);
  assert.deepEqual(
    offenders,
    [],
    `model refs outside the pinned single-boundary surface must be reviewed: ${offenders.join(", ")}`,
  );
});

test("agent-instance execution has exactly ONE call-site — the executor seam", () => {
  const callSites = sources.filter(({ stripped }) => stripped.includes(".execute("));
  assert.deepEqual(
    callSites.map((file) => file.path),
    ["adapters/pawn-execution-run.ts"],
    "the ONLY agent-execution path is the InstanceExecutorPort seam (no second runtime)",
  );
});

test("EngineJob submission has exactly ONE call-site — the runner seam (no bypass)", () => {
  const callSites = sources.filter(({ stripped }) => stripped.includes(".submit("));
  assert.deepEqual(
    callSites.map((file) => file.path),
    ["adapters/pawn-execution-run.ts"],
    "the ONLY engine invocation path is the EngineRunnerPort seam (§11: engines run behind the runner)",
  );
  // No engine adapter surface anywhere in code.
  for (const { path, stripped } of sources) {
    assert.equal(
      stripped.includes("EngineAdapter"),
      false,
      `${path} must not declare an EngineAdapter surface (adapters are runner-internal)`,
    );
    assert.equal(
      stripped.includes("registerAdapter"),
      false,
      `${path} must not register engine adapters (composition-root wiring, never pawn code)`,
    );
  }
});

test("registry-exact imports only: every bare @mos/* import is a declared production dependency", () => {
  // Import specifiers live inside string literals — scan the RAW source for
  // the import pattern (comments cannot form a `from "..."` import).
  const importPattern = /from\s+["'](@mos\/[a-z-]+)["']/g;
  const imported = new Set<string>();
  for (const { path } of sources) {
    const raw = readFileSync(`${SRC_ROOT}${path}`, "utf8");
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
    "the production module registry declares [contracts, content, rights, policy]; agents/agent-runtime/engines/lab are NOT production deps — their surfaces are mirrored seams (compat-pinned), and policy does not exist yet",
  );
});

test("the exported runtime surface is exactly the pinned set", () => {
  const runtimeExports = Object.keys(publicSurface).sort();
  assert.deepEqual(runtimeExports, [
    "PAWN_TRANSFORM_KINDS",
    "PawnExecutionError",
    "TRANSFORM_PAWN_BODIES",
    "TRANSFORM_PAWN_KINDS",
    "createInMemoryEngineRunner",
    "createInMemoryPawnBodyRegistry",
    "createInMemoryPawnExecutionRuntime",
    "createInMemoryPawnInstanceExecutor",
    "createInMemoryPawnInstanceRegistry",
    "createInMemoryPawnModelRuntime",
    "createInMemoryPawnOrganizationRegistry",
    "createInMemoryPawnRightsGate",
    "createInMemoryTransformSource",
    "engineToolRef",
  ]);
  for (const name of runtimeExports) {
    assert.equal(
      typeof publicSurface[name as keyof typeof publicSurface],
      name === "PAWN_TRANSFORM_KINDS" || name === "TRANSFORM_PAWN_BODIES" || name === "TRANSFORM_PAWN_KINDS"
        ? "object"
        : "function",
      `${name} must be a runtime export`,
    );
  }
});

test("port method budgets: PawnExecutionPort 10, organization port 3, every seam ≤ 12", () => {
  const stack = composePawnStack();
  // The lifecycle + execution surface.
  assert.deepEqual(Object.keys(stack.execution).sort(), [
    "bindPawnModel",
    "executePawn",
    "getPawnExecution",
    "getPawnInstance",
    "instantiatePawn",
    "listPawnBodies",
    "listPawnExecutions",
    "listPawnInstances",
    "registerPawnBody",
    "releasePawn",
  ]);
  assert.equal(Object.keys(stack.execution).length, 10);
  // Organization composition.
  assert.equal(Object.keys(stack.organizations).length, 3);
  // Mirrored seams (the doubles implement exactly the port methods plus
  // their disclosed inspection surfaces — count the PORT surface).
  assert.equal(Object.keys(stack.doubles.bodies).length, 5);
  assert.equal(Object.keys(stack.doubles.modelBoundary).length, 1);
  assert.equal(Object.keys(stack.doubles.executor).length, 1);
  assert.equal(Object.keys(stack.doubles.transforms).length, 3); // resolve + disclosed registration/list
  // The engine runner double: submit + submissions inspection.
  assert.ok(Object.keys(stack.doubles.engineRunner).length <= 12);
});

test("lockfile discipline: the mos-production importer carries exactly the registry-exact dependencies", () => {
  const lockfile = readFileSync(`${REPO_ROOT}pnpm-lock.yaml`, "utf8");
  const importerMatch = / {2}packages\/mos-production:\n([\s\S]*?)(?=\n {2}packages\/|\nimporters:|$)/.exec(lockfile);
  assert.ok(importerMatch !== null, "the mos-production importer must exist");
  const importerBody = importerMatch[1] ?? "";
  const dependencySpecifiers = [...importerBody.matchAll(/'(@mos\/[a-z-]+)':/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    [...new Set(dependencySpecifiers)].sort(),
    [...REGISTRY_EXACT_IMPORTS].sort(),
    "the lockfile delta must be the registry-exact importer entries only (policy does not exist yet — seam disclosed)",
  );
});
