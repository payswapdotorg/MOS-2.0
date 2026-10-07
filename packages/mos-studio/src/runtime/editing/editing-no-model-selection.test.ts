import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import * as studio from "../../index.js";
import { createAudioPodcastFormatPlugin } from "../formats/audio-podcast.js";
import { composeEditingStack } from "../../testing/compose-editing-stack.js";
import {
  EDITING_PRINCIPAL,
  EDITING_STACK_TENANT,
  editingChoice,
  editingSessionInputOverPackage,
} from "../../testing/editing-fixtures.js";
import type { EditingSessionInput } from "../../contracts/editing-composition.js";
import type { EditorCompositionRequest } from "./editor-pawn-binding.js";
import type { EditingCompositionPort } from "../../ports/editing-composition.port.js";

/**
 * THE STUDIO NEVER SELECTS MODELS — the W3-C pin EXTENDED to the editing
 * surface (STUDIO-008; architecture lock rule 9: no second model router).
 *
 * The Editor Pawn is DETERMINISTIC: it is instantiated WITHOUT any model
 * binding and executes without one; there is no model-selection vocabulary
 * anywhere on the editing surface. This suite asserts the absence four ways:
 * 1. exported runtime surface: no exported editing symbol whose name
 *    mentions model selection;
 * 2. source scan of the editing PRODUCTION surface (src/runtime/editing,
 *    src/contracts/editing-*, src/ports/editing-composition.port.ts —
 *    comments stripped, string-aware): no model-selection vocabulary at all;
 * 3. compile-time type pins: the editing session input and the composition
 *    request cannot express a model preference;
 * 4. behavioral: a full editing session over the REAL stack instantiates
 *    the editor pawn with NO model binding and every pawn execution record
 *    carries `modelBinding: null`.
 *
 * src/testing is EXCLUDED from the source scan by design: it is the
 * DISCLOSED composition seam where the model catalog is configured (the
 * production TL composition root replaces it) — exactly where worker B's
 * design puts it.
 */

/** Tokens whose presence in editing production code would betray a model-selection surface. */
const FORBIDDEN_TOKEN =
  /\b(bindModel|ModelRuntime\w*|ModelBinding|modelRef|runtimeRef|requestedModelRef|defaultModelRef|modelCatalog|selectModel\w*|chooseModel\w*|pickModel\w*)\b/;

/** Model-selection field names the editing input types must NOT carry. */
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
const pinSessionInput: NoModelFields<EditingSessionInput> = true;
const pinCompositionRequest: NoModelFields<EditorCompositionRequest> = true;
const pinPort: NoModelFields<EditingCompositionPort> = true;
void pinSessionInput;
void pinCompositionRequest;
void pinPort;

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

/** Recursively collects the editing production-surface source files. */
async function editingSourceFiles(dir: string): Promise<string[]> {
  const collected: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collected.push(...(await editingSourceFiles(path)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      collected.push(path);
    }
  }
  return collected;
}

/** Strips block + line comments (string-aware). */
function stripComments(source: string): string {
  let result = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      result += char;
      index += 1;
      while (index < source.length) {
        result += source[index];
        if (source[index] === "\\" && index + 1 < source.length) {
          result += source[index + 1];
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      continue;
    }
    result += char ?? "";
    index += 1;
  }
  return result;
}

test("STUDIO-008 no-model-selection: the editing surface exports no model-selection symbol", () => {
  const editingSymbols = [
    "createEditingCompositionRuntime",
    "createEditorPawnBinding",
    "composeEditingStack",
    "EDIT_COMPOSITION_KINDS",
    "EDIT_GRAPH_INTERCHANGE_FORMAT",
  ];
  for (const symbol of editingSymbols) {
    assert.ok(symbol in studio, `${symbol} is exported`);
  }
  // No export ANYWHERE on the studio surface names a model selector (the
  // W3-C interviewer pin already enforces this for the whole surface; this
  // re-asserts it so the editing additions can never regress it).
  const offenders = Object.keys(studio).filter((key) => FORBIDDEN_TOKEN.test(key));
  assert.deepEqual(offenders, [], "no studio export names a model-selection surface");
});

test("STUDIO-008 no-model-selection: the editing production source carries no model-selection vocabulary", async () => {
  const files = [
    // src/runtime/editing (the whole editing runtime subtree)
    ...(await editingSourceFiles(join(PACKAGE_ROOT, "src/runtime/editing"))),
    join(PACKAGE_ROOT, "src/contracts/editing-composition.ts"),
    join(PACKAGE_ROOT, "src/contracts/edit-graph-interop.ts"),
    join(PACKAGE_ROOT, "src/ports/editing-composition.port.ts"),
  ];
  assert.ok(files.length >= 8, `the editing surface files were found (${files.length})`);
  for (const file of files) {
    const source = stripComments(await readFile(file, "utf8"));
    const match = FORBIDDEN_TOKEN.exec(source);
    assert.equal(
      match,
      null,
      `${file} carries model-selection vocabulary: ${String(match?.[0])}`,
    );
  }
});

test("STUDIO-008 no-model-selection: the editor pawn is deterministic — no binding requested, none recorded", async () => {
  const stack = composeEditingStack();
  const formatPlugin = createAudioPodcastFormatPlugin();
  const final = await stack.createSourceArtifact({
    tenantId: EDITING_STACK_TENANT,
    type: "audio",
    stage: "final",
    content: "mix",
  });
  const sourcePackage = stack.buildSourcePackage({
    tenantId: EDITING_STACK_TENANT,
    sessionId: "studio-session:editing-noselect",
    packageId: "package:noselect-1",
    rawArtifacts: [],
    intermediateArtifacts: [],
    finalArtifacts: [final],
  });
  stack.grantTransformRights({
    tenantId: EDITING_STACK_TENANT,
    grantee: EDITING_PRINCIPAL,
    subjectRefs: [String(final.artifactId)],
  });
  const input: EditingSessionInput = editingSessionInputOverPackage({
    formatPlugin,
    artifactPackage: sourcePackage,
    choices: [
      editingChoice(
        "choice-cut",
        "podcast-edit-points",
        "tight",
        [
          {
            operationId: "op-cut-1",
            kind: "cut" as const,
            inputArtifactRefs: [final],
            parameters: { to: 10 },
          },
        ],
        stack.now(),
      ),
    ],
  });
  const outcome = await stack.editing.runEditingSession(
    { tenantId: EDITING_STACK_TENANT },
    input,
  );
  assert.ok(outcome.ok, `the session must succeed: ${JSON.stringify(outcome)}`);
  // The editor pawn instance was instantiated WITHOUT a model binding...
  const instance = stack.pawnExecution.getPawnInstance(
    { tenantId: EDITING_STACK_TENANT },
    outcome.result.record.editorPawn.instanceId as never,
  );
  assert.ok(instance);
  assert.equal(instance?.modelRef, undefined, "no model was ever selected for the editor pawn");
  assert.equal(instance?.runtimeRef, undefined);
  // ...and every recorded execution carries modelBinding: null (deterministic).
  for (const execution of stack.pawnExecution.listPawnExecutions({ tenantId: EDITING_STACK_TENANT })) {
    assert.equal(execution.modelBinding, null);
  }
  // The §30 editing session record carries no model identity either.
  const recordSource = JSON.stringify(outcome.result.record);
  assert.ok(!/"modelRef"/.test(recordSource));
  assert.ok(!/"runtimeRef"/.test(recordSource));
});
