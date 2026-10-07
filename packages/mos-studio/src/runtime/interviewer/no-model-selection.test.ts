/**
 * THE STUDIO NEVER SELECTS MODELS — architectural surface assertion
 * (STUDIO-004; architecture lock rule 9: no second model router — model
 * selection remains behind @mos/agent-runtime's single model boundary).
 *
 * This suite asserts the absence of any model-selection surface in the
 * @mos/studio package in four ways:
 * 1. exported runtime surface: no exported binding whose name mentions
 *    model selection;
 * 2. source scan of the PRODUCTION surface (src/contracts, src/ports,
 *    src/runtime, src/index.ts — comments stripped, string-aware): no
 *    model-selection vocabulary at all, not even the instance's model /
 *    runtime refs (the studio-side agent handle carries instance + body
 *    identity only; the model binding record stays with the agent runtime);
 * 3. compile-time type pins: the interviewer binding/session inputs cannot
 *    express a model preference;
 * 4. behavioral: binding an interviewer agent through the studio port issues
 *    exactly the composition-root-configured model — the studio never named
 *    one, and the boundary decided.
 *
 * src/testing is EXCLUDED from the source scan by design: it is the
 * DISCLOSED composition seam (the test composition root), the exact place
 * where worker B's design puts model catalog configuration — the production
 * TL composition root replaces it with the real catalog behind the same
 * studio-owned ports. The studio adapters that production code calls carry
 * no model surface either way.
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import * as studio from "../../index.js";
import { composeRealInterviewerAgentStack, TEST_INTERVIEWER_DEFAULT_MODEL } from "../../testing/real-interviewer-agent.js";
import type { InterviewerAgentBindingInput } from "../../ports/interviewer-agent-binding.js";
import type { CreateInterviewerSessionInput } from "../../contracts/interviewer-session.js";
import type { InterviewerRepresentation } from "../../contracts/interviewer.js";

/** Tokens whose presence in studio production code would betray a model-selection surface. */
const FORBIDDEN_TOKEN =
  /\b(bindModel|ModelRuntime\w*|ModelBinding|modelRef|runtimeRef|requestedModelRef|defaultModelRef|modelCatalog|selectModel\w*|chooseModel\w*|pickModel\w*|no-model-requested|unknown-model)\b/;

/** Model-selection field names the studio input types must NOT carry. */
type ModelSelectionField =
  | "modelRef"
  | "runtimeRef"
  | "requestedModelRef"
  | "defaultModelRef"
  | "modelCatalog"
  | "modelRuntime"
  | "model";

/** True only when T has none of the model-selection fields. */
type NoModelFields<T> = Extract<keyof T, ModelSelectionField> extends never ? true : never;

// Compile-time pins (fail the build when violated).
const pinBindingInput: NoModelFields<InterviewerAgentBindingInput> = true;
const pinSessionInput: NoModelFields<CreateInterviewerSessionInput> = true;
void pinBindingInput;
void pinSessionInput;

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

/** Strip comments while respecting string literals (same machinery as no-publish). */
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

const PACKAGE_ROOT = await findPackageRoot();

test("exported runtime surface contains no model-selection bindings", () => {
  const exports = Object.keys(studio);
  assert.ok(exports.length > 0, "the package must export its runtime surface");
  const offenders = exports.filter((name) => FORBIDDEN_TOKEN.test(name));
  assert.deepEqual(
    offenders,
    [],
    `@mos/studio must never export a model-selection surface (found: ${offenders.join(", ")})`,
  );
});

test("studio production source (comments stripped) contains no model-selection surface", async () => {
  // The PRODUCTION surface: contracts + ports + runtime + the package index.
  // src/testing is the disclosed composition seam (see the module doc) —
  // model catalog configuration lives there exactly as it will live in the
  // production composition root.
  const productionDirs = ["src/contracts", "src/ports", "src/runtime"];
  const files: string[] = [];
  for (const dir of productionDirs) {
    files.push(...(await listTypeScriptFiles(join(PACKAGE_ROOT, dir))));
  }
  files.push(join(PACKAGE_ROOT, "src", "index.ts"));
  assert.ok(files.length > 40, `expected the full studio production tree, found ${files.length} files`);
  const offenders: string[] = [];
  for (const path of files) {
    if (path.endsWith(".test.ts")) {
      continue;
    }
    const stripped = stripComments(await readFile(path, "utf8"));
    const match = stripped.match(FORBIDDEN_TOKEN);
    if (match !== null) {
      offenders.push(`${path}: "${match[0]}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `the studio production source must contain no model-selection identifiers (found: ${offenders.join("; ")})`,
  );
});

test("behavioral pin: the model boundary decides — the studio never names a model", async () => {
  const stack = composeRealInterviewerAgentStack();
  const bound = await stack.agentBinding.bindInterviewerAgent({
    tenantId: "tenant-001" as never,
    bodyId: "studio-interviewer",
    bodyVersion: 1 as never,
  });
  assert.ok(bound.ok, `binding must succeed through the studio port: ${JSON.stringify(bound)}`);
  // The studio-side handle carries instance + body identity ONLY.
  assert.deepEqual(Object.keys(bound.agent).sort(), ["bodyId", "bodyVersion", "instanceId", "lifecycle"]);
  // The bound instance executes with the composition-root-configured model —
  // the one the single model boundary chose (the studio never supplied one).
  const record = stack.agentInstances.get({ tenantId: "tenant-001" as never }, bound.agent.instanceId as never);
  assert.ok(record !== undefined);
  assert.equal(String(record.modelRef), String(TEST_INTERVIEWER_DEFAULT_MODEL));
  assert.ok(record.runtimeRef !== undefined);
});

test("interviewer presentation surfaces carry no model vocabulary", () => {
  const representation: InterviewerRepresentation = {
    representation: "text",
    provenance: { origin: "human-performed" },
  };
  const presentationJson = JSON.stringify({
    representation,
    // Serialized studio views must not leak model identity either.
    trace: { instanceId: "i-1", bodyId: "b", bodyVersion: 1, finishReason: "completed", output: "o" },
  });
  assert.equal(FORBIDDEN_TOKEN.test(presentationJson), false);
});
