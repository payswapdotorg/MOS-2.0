/**
 * SINGLE MODEL BOUNDARY structural pin (AGT-002 acceptance).
 *
 * Architecture lock rule 9: "No second model router is introduced; model
 * selection remains behind a single model-runtime boundary." This test pins
 * that STRUCTURALLY, over this package's own sources — it is not a behavior
 * test (those live next to the adapters):
 *
 * 1. Vocabulary ban — no non-test source of this package may declare any
 *    model-selection/router symbol (`selectModel`, `chooseModel`,
 *    `pickModel`, `resolveModel`, `modelRouter`, `router`, `fallbackModel`).
 * 2. Single call-site pin — `.bindModel(` (a call through a ModelRuntimePort
 *    instance) appears in EXACTLY ONE non-test source file, exactly once:
 *    the instance registry's `bind` (adapters/in-memory-agent-instance-registry.ts).
 * 3. modelRef surface pin — the token `modelRef` may appear only in the
 *    pinned file set (port declarations, the boundary adapter, the instance
 *    domain record, the registry's binding recorder, the executor's
 *    pass-through, the substrate mirror). A new file touching model refs
 *    must be reviewed and added here deliberately.
 * 4. Exported-surface pin — the package's runtime exports are exactly the
 *    pinned six; exactly one of them is a ModelRuntimePort provider.
 * 5. No-boundary guard — an instance registry cannot even be constructed
 *    without a ModelRuntimePort: without the boundary there is no path to a
 *    bound (executable) instance.
 *
 * Comments and string contents are stripped before scanning (state-machine
 * stripper below), so documentation mentioning routers cannot trip the pin.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { AgentRuntimeError } from "./domain/errors.js";
import { createInMemoryAgentInstanceRegistry } from "./adapters/in-memory-agent-instance-registry.js";
import type { AgentBodyRegistryPort } from "@mos/agents";

const SRC_ROOT = fileURLToPath(new URL("../src/", import.meta.url));

/** Files that are allowed to mention the `modelRef` token (pin set). */
const MODEL_REF_FILE_ALLOWLIST: readonly string[] = [
  "adapters/in-memory-agent-instance-registry.ts",
  "adapters/in-memory-model-runtime.ts",
  "adapters/substrate-instance-executor.ts",
  "domain/agent-instance.ts",
  "ports/model-runtime.port.ts",
  "types/substrate-agent-runtime.ts",
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
  assert.ok(sources.length >= 10, `expected to scan the package sources, found ${sources.length}`);
});

test("no non-test source declares model-selection or router vocabulary", () => {
  for (const { path, stripped } of sources) {
    const match = BANNED_VOCABULARY.exec(stripped);
    assert.equal(
      match,
      null,
      `${path} must not declare model-selection/router vocabulary (single model boundary is ModelRuntimePort only): matched '${match?.[0] ?? ""}'`,
    );
  }
});

test(".bindModel( is called in exactly one place — the instance registry's bind", () => {
  const callSites = sources.filter(({ stripped }) => stripped.includes(".bindModel("));
  assert.deepEqual(
    callSites.map((file) => file.path),
    ["adapters/in-memory-agent-instance-registry.ts"],
    "the ONLY call through the model boundary must be the instance registry's bind",
  );
  const registry = sources.find(({ path }) => path === "adapters/in-memory-agent-instance-registry.ts");
  assert.ok(registry !== undefined);
  const occurrences = registry.stripped.split(".bindModel(").length - 1;
  assert.equal(occurrences, 1, "exactly one bindModel call site in the registry adapter");
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

test("the exported runtime surface is exactly the pinned six, with one ModelRuntimePort provider", async () => {
  const index = await import("./index.js");
  const runtimeExports = Object.keys(index).sort();
  assert.deepEqual(runtimeExports, [
    "AgentRuntimeError",
    "agentBodyRef",
    "createInMemoryAgentInstanceRegistry",
    "createInMemoryAgentRuntimeSubstrateDouble",
    "createInMemoryModelRuntime",
    "createSubstrateInstanceExecutor",
  ]);
  for (const name of runtimeExports) {
    assert.equal(typeof index[name as keyof typeof index], "function", `${name} must be a runtime export`);
  }
  // Exactly one ModelRuntimePort provider ships: the in-memory boundary.
  assert.equal(typeof index.createInMemoryModelRuntime, "function");
  const port = index.createInMemoryModelRuntime({
    models: [{ modelRef: "model:probe" as never, runtimeRef: "runtime:probe" as never }],
  });
  assert.equal(typeof port.bindModel, "function");
  assert.deepEqual(Object.keys(port), ["bindModel"]);
});

test("an instance registry cannot be constructed without the model boundary", () => {
  const bodyRegistry = { getLatest: () => undefined } as unknown as AgentBodyRegistryPort;
  assert.throws(
    () =>
      createInMemoryAgentInstanceRegistry({
        bodyRegistry,
      } as Parameters<typeof createInMemoryAgentInstanceRegistry>[0]),
    (error: unknown) =>
      error instanceof AgentRuntimeError && error.code === "missing-model-boundary",
    "without a ModelRuntimePort there must be no path to a bound instance",
  );
});
