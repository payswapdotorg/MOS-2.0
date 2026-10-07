import assert from "node:assert/strict";
import { test } from "node:test";

import { createAudioPodcastFormatPlugin } from "../formats/audio-podcast.js";
import { composeEditingStack } from "../../testing/compose-editing-stack.js";
import {
  EDIT_COMPOSITION_KINDS,
  EDIT_KIND_TRANSFORM_ALIGNMENT,
  type EditingSessionInput,
  type OrganizationEditChoice,
} from "../../contracts/editing-composition.js";
import {
  EDITING_PRINCIPAL,
  EDITING_STACK_TENANT,
  editingChoice,
  editingContributor,
  editingSessionInputOverPackage,
  recordEditingSessionConsent,
} from "../../testing/editing-fixtures.js";
import { validateEditChoices } from "./editing-validation.js";
import type { Timestamp } from "../../contracts/refs.js";

// ---------------------------------------------------------------------------
// STUDIO-008 org edit-decision discipline — the W3-C pin EXTENDED to the
// editing surface: the studio accepts org decisions ONLY at edit decision
// points the format plugin DECLARED (§16: the org decides at declared
// points; the studio records); the composition vocabulary is CLOSED
// (unknown edit kinds rejected); operation inputs must resolve in the
// edited source; sources are tenant-scoped; §15 multi-account consent
// gates precede any composition. Validation failures produce NO §30
// session record — no production action ran.
// ---------------------------------------------------------------------------

const SCOPE = { tenantId: EDITING_STACK_TENANT };
const SESSION_ID = "studio-session:editing-discipline";

/** A minimal valid scenario the discipline cases mutate. */
async function disciplineScenario() {
  const stack = composeEditingStack();
  const formatPlugin = createAudioPodcastFormatPlugin();
  const raw = await stack.createSourceArtifact({
    tenantId: EDITING_STACK_TENANT,
    type: "audio",
    stage: "raw",
    content: "voice",
  });
  const final = await stack.createSourceArtifact({
    tenantId: EDITING_STACK_TENANT,
    type: "audio",
    stage: "final",
    content: "mix",
  });
  const consentRef = recordEditingSessionConsent(stack.rightsRepository, {
    tenantId: EDITING_STACK_TENANT,
    identityRef: "identity:contributor-a",
    sessionId: SESSION_ID,
  });
  const sourcePackage = stack.buildSourcePackage({
    tenantId: EDITING_STACK_TENANT,
    sessionId: SESSION_ID,
    packageId: "package:discipline-1",
    rawArtifacts: [raw],
    intermediateArtifacts: [],
    finalArtifacts: [final],
    consentRefs: [consentRef],
  });
  stack.grantTransformRights({
    tenantId: EDITING_STACK_TENANT,
    grantee: EDITING_PRINCIPAL,
    subjectRefs: [String(raw.artifactId), String(final.artifactId)],
  });
  const baseInput = editingSessionInputOverPackage({
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
    contributors: [editingContributor("identity:contributor-a", [String(consentRef)])],
  });
  return { stack, formatPlugin, sourcePackage, raw, final, consentRef, baseInput };
}

/** The mutating harness: run the session with the given choices override. */
async function runWith(
  scenario: Awaited<ReturnType<typeof disciplineScenario>>,
  mutate: (input: EditingSessionInput) => EditingSessionInput,
) {
  return scenario.stack.editing.runEditingSession(SCOPE, mutate(scenario.baseInput));
}

test("STUDIO-008 discipline: a choice at an UNDECLARED edit decision point is rejected (W3-C pin extended)", async () => {
  const scenario = await disciplineScenario();
  const outcome = await runWith(scenario, (input) => ({
    ...input,
    choices: [
      editingChoice(
        "choice-alien",
        "reaction-layout",
        "picture-in-picture",
        [],
        scenario.stack.now(),
      ),
    ],
  }));
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "choice-point-not-declared");
  if (outcome.failure.kind === "choice-point-not-declared") {
    assert.equal(outcome.failure.decisionPointId, "reaction-layout");
    assert.deepEqual(outcome.failure.declaredPointIds, ["podcast-edit-points", "podcast-edit-pacing"]);
  }
  // NO session record: validation precedes every production action.
  assert.equal(outcome.record, null);
  assert.equal(scenario.stack.editing.listEditingSessions(SCOPE).length, 0);
  assert.equal(scenario.stack.pawnExecution.listPawnExecutions(SCOPE).length, 0, "no pawn execution ran");
  assert.equal(scenario.stack.jobEvents.events.length, 0, "no EngineJob was submitted");
});

test("STUDIO-008 discipline: the same declared point decided twice is rejected", async () => {
  const scenario = await disciplineScenario();
  const choice: OrganizationEditChoice = editingChoice(
    "choice-dup",
    "podcast-edit-points",
    "tight",
    [],
    scenario.stack.now(),
  );
  const outcome = await runWith(scenario, (input) => ({
    ...input,
    choices: [choice, { ...choice, choiceId: "choice-dup-2" }],
  }));
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "edit-choice-malformed");
  assert.equal(outcome.record, null);
});

test("STUDIO-008 discipline: an UNKNOWN edit kind is rejected (closed vocabulary, verbatim echo)", async () => {
  const scenario = await disciplineScenario();
  const outcome = await runWith(scenario, (input) => ({
    ...input,
    choices: [
      editingChoice(
        "choice-cut",
        "podcast-edit-points",
        "tight",
        [
          {
            operationId: "op-alien",
            kind: "speed-ramp" as "cut",
            inputArtifactRefs: [scenario.final],
            parameters: {},
          },
        ],
        scenario.stack.now(),
      ),
    ],
  }));
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "unknown-edit-kind");
  if (outcome.failure.kind === "unknown-edit-kind") {
    assert.equal(outcome.failure.editKind, "speed-ramp");
    assert.equal(outcome.failure.operationId, "op-alien");
    assert.deepEqual(outcome.failure.knownKinds, EDIT_COMPOSITION_KINDS);
  }
  assert.equal(outcome.record, null);
});

test("STUDIO-008 discipline: the closed vocabulary is the seven declared edit kinds with transform alignment", () => {
  assert.deepEqual(EDIT_COMPOSITION_KINDS, [
    "cut",
    "trim",
    "reorder",
    "overlay",
    "caption",
    "dub-track",
    "scale",
  ]);
  // The DECLARED alignment with the frozen §5 transform kinds (data pin).
  assert.deepEqual(EDIT_KIND_TRANSFORM_ALIGNMENT.cut, ["clip"]);
  assert.deepEqual(EDIT_KIND_TRANSFORM_ALIGNMENT.trim, ["clip"]);
  assert.deepEqual(EDIT_KIND_TRANSFORM_ALIGNMENT.reorder, ["remix", "compilation"]);
  assert.deepEqual(EDIT_KIND_TRANSFORM_ALIGNMENT.overlay, ["reaction", "hybrid"]);
  assert.deepEqual(EDIT_KIND_TRANSFORM_ALIGNMENT.caption, ["voiceover", "hybrid"]);
  assert.deepEqual(EDIT_KIND_TRANSFORM_ALIGNMENT["dub-track"], ["translation-dubbing"]);
  assert.deepEqual(EDIT_KIND_TRANSFORM_ALIGNMENT.scale, ["crop-reframe"]);
});

test("STUDIO-008 discipline: malformed choices are rejected with enumerated reasons", async () => {
  const scenario = await disciplineScenario();
  // Blank choiceId.
  const blankId = await runWith(scenario, (input) => ({
    ...input,
    choices: [editingChoice("   ", "podcast-edit-points", "tight", [], scenario.stack.now())],
  }));
  assert.ok(!blankId.ok);
  assert.equal(blankId.failure.kind, "edit-choice-malformed");
  if (blankId.failure.kind === "edit-choice-malformed") {
    assert.ok(blankId.failure.reasons.length > 0);
  }
  // Duplicate operation ids across choices.
  const duplicated = await runWith(scenario, (input) => ({
    ...input,
    choices: [
      editingChoice(
        "choice-cut",
        "podcast-edit-points",
        "tight",
        [
          {
            operationId: "op-cut-1",
            kind: "cut" as const,
            inputArtifactRefs: [scenario.final],
            parameters: {},
          },
        ],
        scenario.stack.now(),
      ),
      editingChoice(
        "choice-pacing",
        "podcast-edit-pacing",
        "fast",
        [
          {
            operationId: "op-cut-1",
            kind: "trim" as const,
            inputArtifactRefs: [scenario.final],
            parameters: {},
          },
        ],
        scenario.stack.now(),
      ),
    ],
  }));
  assert.ok(!duplicated.ok);
  assert.equal(duplicated.failure.kind, "edit-choice-malformed");
  // An operation with EMPTY declared inputs is malformed.
  const emptyInputs = await runWith(scenario, (input) => ({
    ...input,
    choices: [
      editingChoice(
        "choice-cut",
        "podcast-edit-points",
        "tight",
        [{ operationId: "op-none", kind: "cut" as const, inputArtifactRefs: [], parameters: {} }],
        scenario.stack.now(),
      ),
    ],
  }));
  assert.ok(!emptyInputs.ok);
  assert.equal(emptyInputs.failure.kind, "edit-choice-malformed");
});

test("STUDIO-008 discipline: an operation input that does not resolve in the edited source is rejected", async () => {
  const scenario = await disciplineScenario();
  const foreignArtifact = {
    ...scenario.final,
    artifactId: "artifact:not-in-source" as typeof scenario.final.artifactId,
  };
  const outcome = await runWith(scenario, (input) => ({
    ...input,
    choices: [
      editingChoice(
        "choice-cut",
        "podcast-edit-points",
        "tight",
        [
          {
            operationId: "op-cut-1",
            kind: "cut" as const,
            inputArtifactRefs: [foreignArtifact],
            parameters: {},
          },
        ],
        scenario.stack.now(),
      ),
    ],
  }));
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "operation-input-not-in-source");
  if (outcome.failure.kind === "operation-input-not-in-source") {
    assert.equal(outcome.failure.operationId, "op-cut-1");
    assert.equal(outcome.failure.artifactId, "artifact:not-in-source");
  }
  assert.equal(outcome.record, null);
});

test("STUDIO-008 discipline: a cross-tenant source is rejected (§31)", async () => {
  const scenario = await disciplineScenario();
  const outcome = await runWith(scenario, (input) => ({
    ...input,
    source: {
      kind: "package",
      artifactPackage: {
        ...scenario.sourcePackage,
        rawArtifacts: [
          {
            ...scenario.raw,
            tenantId: "tenant:foreign" as typeof scenario.raw.tenantId,
          },
        ],
      },
    },
  }));
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "cross-tenant-source");
  if (outcome.failure.kind === "cross-tenant-source") {
    assert.equal(outcome.failure.sourceTenantId, "tenant:foreign");
    assert.equal(outcome.failure.scopeTenantId, EDITING_STACK_TENANT);
  }
  assert.equal(outcome.record, null);
});

test("STUDIO-008 discipline: raw multi-account sources REQUIRE contributors (§15 gate)", async () => {
  const scenario = await disciplineScenario();
  const outcome = await runWith(scenario, (input) => ({ ...input, contributors: undefined }));
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "consent-contributors-required");
  if (outcome.failure.kind === "consent-contributors-required") {
    assert.equal(outcome.failure.rawArtifactCount, 1);
  }
  assert.equal(outcome.record, null);
});

test("STUDIO-008 discipline: a contributor WITHOUT processing consent blocks the session", async () => {
  const scenario = await disciplineScenario();
  // A consent record that only covers capture ("use") — not processing.
  const captureOnly = recordEditingSessionConsent(scenario.stack.rightsRepository, {
    tenantId: EDITING_STACK_TENANT,
    identityRef: "identity:contributor-b",
    sessionId: SESSION_ID,
    actions: ["use"],
  });
  const outcome = await runWith(scenario, (input) => ({
    ...input,
    contributors: [
      editingContributor("identity:contributor-b", [String(captureOnly)]),
    ],
  }));
  assert.ok(!outcome.ok);
  assert.equal(outcome.failure.kind, "consent-not-covering-processing");
  if (outcome.failure.kind === "consent-not-covering-processing") {
    assert.equal(outcome.failure.participantIdentityRef, "identity:contributor-b");
  }
  assert.equal(outcome.record, null);
  assert.equal(scenario.stack.pawnExecution.listPawnExecutions(SCOPE).length, 0);
});

test("STUDIO-008 discipline: a source with NO raw artifacts needs no contributors (no consent gate subjects)", async () => {
  const scenario = await disciplineScenario();
  const outcome = await runWith(scenario, (input) => ({
    ...input,
    source: {
      kind: "package",
      artifactPackage: {
        ...scenario.sourcePackage,
        rawArtifacts: [],
        consent: {
          ...scenario.sourcePackage.consent,
          allRawArtifactsCovered: true,
        },
      },
    },
    contributors: undefined,
  }));
  assert.ok(outcome.ok, `a no-raw-artifact source must not require contributors: ${JSON.stringify(outcome)}`);
});

test("STUDIO-008 discipline: invalid seed and engine grant shapes are typed failures (§11)", async () => {
  const scenario = await disciplineScenario();
  const badSeed = await runWith(scenario, (input) => ({ ...input, seed: Number.NaN }));
  assert.ok(!badSeed.ok);
  assert.equal(badSeed.failure.kind, "invalid-seed");
  assert.equal(badSeed.record, null);

  const badLimits = await runWith(scenario, (input) => ({
    ...input,
    engineResourceLimits: { ...input.engineResourceLimits, cpuCores: 0 },
  }));
  assert.ok(!badLimits.ok);
  assert.equal(badLimits.failure.kind, "invalid-engine-resource-limits");
  assert.equal(badLimits.record, null);
});

test("STUDIO-008 discipline: validateEditChoices is exported pure validation over the format's declared points", () => {
  const formatPlugin = createAudioPodcastFormatPlugin();
  const at = "2026-01-01T00:00:00.000Z" as Timestamp;
  const valid = validateEditChoices(formatPlugin, [
    editingChoice("c1", "podcast-edit-points", "tight", [], at),
  ]);
  assert.equal(valid, null);
  const invalid = validateEditChoices(formatPlugin, [
    editingChoice("c1", "undeclared-point", "tight", [], at),
  ]);
  assert.ok(invalid !== null);
  assert.equal(invalid?.kind, "choice-point-not-declared");
});
