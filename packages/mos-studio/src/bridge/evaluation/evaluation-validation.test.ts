/**
 * BRIDGE-002 intake validation battery (evaluation-validation.ts) — the
 * fail-closed §19 gate over the closed ten-kind decision vocabulary.
 *
 * Pins:
 * - THE TEN §19 DECISION KINDS as a closed, typed vocabulary (exact names,
 *   runtime deep-equal against the spec §19 verb list, order included);
 * - unknown kinds fail closed typed `decision-kind-out-of-vocabulary` —
 *   including the RIGHTS/POLICY REJECTION SMUGGLING PROBE (§19 distinct
 *   classes: `reject-rights-policy` is a studio-side operator outcome, NEVER
 *   a bridge evaluation kind), case-variant probes, and fabricated kinds;
 * - kind↔payload correlation for every one of the ten kinds;
 * - the treatment-kind vocabulary is the studio's own closed set;
 * - frame validation (scope/actor/entry/package citation primitives);
 * - W9-B D5 finite guards on the §18 delay-economics figures;
 * - W10-F3 pure-data pins (cyclic payloads fail typed).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { StudioOutputEvaluationRequest } from "./contracts/studio-output-evaluation.js";
import {
  STUDIO_EVALUATION_DECISION_KINDS,
  TREATMENT_LINKED_DECISION_KINDS,
} from "./contracts/studio-output-evaluation.js";
import { validateStudioOutputEvaluation, validateDecisionPayload } from "./evaluation-validation.js";
import type { StudioOutputEvaluationFailure } from "./contracts/studio-output-evaluation.js";

// ---------------------------------------------------------------------------
// The request frame under test
// ---------------------------------------------------------------------------

const BASE_PACKAGE = { packageId: "pkg_under_test", version: 2 } as const;

function requestOf(decision: unknown, overrides: Record<string, unknown> = {}): StudioOutputEvaluationRequest {
  return {
    scope: { tenantId: "tenant-validation" },
    actor: "identity-lab-evaluator-1",
    entryId: "lts_validation_entry",
    evaluatedPackage: { ...BASE_PACKAGE },
    decision: decision as StudioOutputEvaluationRequest["decision"],
    ...overrides,
  } as StudioOutputEvaluationRequest;
}

type Failure = { readonly ok: false; readonly failure: StudioOutputEvaluationFailure };

function failureOf(
  result: ReturnType<typeof validateStudioOutputEvaluation> | ReturnType<typeof validateDecisionPayload>,
): Failure {
  assert.ok(result !== null && !result.ok, "the validation must fail");
  return result as Failure;
}

// ---------------------------------------------------------------------------
// THE TEN §19 DECISION KINDS — the closed vocabulary, exact names
// ---------------------------------------------------------------------------

test("VOCABULARY: the ten §19 decision kinds are exactly the spec's ten verbs, in order", () => {
  assert.deepEqual([...STUDIO_EVALUATION_DECISION_KINDS], [
    "accept",
    "reject-quality",
    "reject-strategy",
    "request-treatment",
    "require-human-action",
    "switch-organization",
    "switch-transform",
    "switch-engine",
    "accept-alternate-output",
    "abandon",
  ]);
  assert.equal(STUDIO_EVALUATION_DECISION_KINDS.length, 10);
});

test("VOCABULARY: the treatment-linked kinds are request-treatment + the three switch-* kinds", () => {
  assert.deepEqual([...TREATMENT_LINKED_DECISION_KINDS], [
    "request-treatment",
    "switch-organization",
    "switch-transform",
    "switch-engine",
  ]);
});

test("VOCABULARY: every one of the ten kinds passes intake with a well-formed payload", () => {
  const decisions: unknown[] = [
    { kind: "accept", summary: "output meets the declared expectations within interval" },
    { kind: "reject-quality", failedCriteria: ["hook-retention-floor"], rationale: "cold open under floor" },
    { kind: "reject-strategy", rationale: "the output no longer serves the declared strategy" },
    { kind: "request-treatment", treatment: { kind: "edit", rationale: "tighten the mid-section" } },
    { kind: "require-human-action", humanAction: { objective: "re-capture the intro take", rationale: "synthetic intro reads flat" } },
    { kind: "switch-organization", routing: { rationale: "org underproduced", missionRef: "mission:one", searchResultId: "search:one" } },
    { kind: "switch-transform", routing: { rationale: "clip chain misfitted", missionRef: "mission:one", searchResultId: "search:one" } },
    { kind: "switch-engine", routing: { rationale: "engine quality below floor", missionRef: "mission:one", searchResultId: "search:one" } },
    { kind: "accept-alternate-output", alternate: { packageId: "pkg_alternate", version: 1 } },
    { kind: "abandon", justification: "delay cost dominates", analysis: { summary: "economics", analysisRef: { analysisId: "delay-analysis:1", analysisVersion: 1 } } },
  ];
  assert.equal(decisions.length, 10);
  for (const decision of decisions) {
    const result = validateStudioOutputEvaluation(requestOf(decision));
    assert.ok(result.ok, `a well-formed ${String((decision as { kind: string }).kind)} payload must pass intake`);
  }
});

// ---------------------------------------------------------------------------
// THE CLOSED VOCABULARY — unknown kinds fail closed typed
// ---------------------------------------------------------------------------

test("CLOSED VOCABULARY: an unknown kind fails typed decision-kind-out-of-vocabulary", () => {
  const result = failureOf(validateStudioOutputEvaluation(requestOf({ kind: "escalate", rationale: "x" })));
  assert.equal(result.failure.kind, "decision-kind-out-of-vocabulary");
  assert.match(result.failure.reason, /closed ten-kind §19 vocabulary/);
});

test("CLOSED VOCABULARY: THE RIGHTS/POLICY SMUGGLING PROBE — reject-rights-policy is NOT an evaluation kind", () => {
  // §19: a quality rejection is DISTINCT from a rights/policy rejection.
  // Rights/policy denials belong to the §24 gate chain (BRIDGE-001) — an
  // attempt to record one through the evaluation surface fails CLOSED typed.
  const result = failureOf(
    validateStudioOutputEvaluation(
      requestOf({ kind: "reject-rights-policy", violations: ["rights:circumvention"], notes: "smuggled" }),
    ),
  );
  assert.equal(result.failure.kind, "decision-kind-out-of-vocabulary");
  assert.match(result.failure.reason, /rights\/policy rejections are NOT evaluation kinds/);
});

test("CLOSED VOCABULARY: case-variant and lookalike kinds fail closed", () => {
  for (const kind of ["Accept", "ACCEPT", " accept", "reject-quality ", "acceptt", "treatment-request"]) {
    const result = failureOf(validateStudioOutputEvaluation(requestOf({ kind, summary: "x" })));
    assert.equal(result.failure.kind, "decision-kind-out-of-vocabulary", `kind "${kind}" must fail closed`);
  }
});

test("CLOSED VOCABULARY: BRIDGE-001 failure-kind shapes are not decision kinds either", () => {
  // The §24 gate-chain failure kinds (policy-gate-denied, rights-gate-denied,
  // assets-gate-denied) are entry-record shapes — never convertible into §19
  // verdicts through this surface.
  for (const kind of ["policy-gate-denied", "rights-gate-denied", "assets-gate-denied", "studio-entry-failed"]) {
    const result = failureOf(
      validateStudioOutputEvaluation(requestOf({ kind, stage: "policy-gate", reason: "denied" })),
    );
    assert.equal(result.failure.kind, "decision-kind-out-of-vocabulary");
  }
});

test("CLOSED VOCABULARY: a non-string or missing kind fails typed", () => {
  for (const decision of [null, "accept", 42, {}, { rationale: "kindless" }]) {
    const result = failureOf(validateStudioOutputEvaluation(requestOf(decision)));
    assert.equal(result.failure.kind, "invalid-decision-payload");
  }
});

// ---------------------------------------------------------------------------
// Kind ↔ payload correlation (each of the ten)
// ---------------------------------------------------------------------------

test("ACCEPT: a blank or missing summary fails", () => {
  for (const summary of ["", "   ", undefined]) {
    const result = failureOf(validateStudioOutputEvaluation(requestOf({ kind: "accept", summary })));
    assert.equal(result.failure.kind, "invalid-decision-payload");
    assert.match(result.failure.reason, /accept.*summary/);
  }
});

test("REJECT-QUALITY: empty/blank/malformed failed criteria fail; rationale required", () => {
  for (const failedCriteria of [[], ["  "], "not-a-list", undefined]) {
    const result = failureOf(
      validateStudioOutputEvaluation(requestOf({ kind: "reject-quality", failedCriteria, rationale: "r" })),
    );
    assert.equal(result.failure.kind, "invalid-decision-payload");
  }
  const noRationale = failureOf(
    validateStudioOutputEvaluation(requestOf({ kind: "reject-quality", failedCriteria: ["floor"], rationale: "" })),
  );
  assert.equal(noRationale.failure.kind, "invalid-decision-payload");
});

test("REJECT-STRATEGY: a blank rationale fails", () => {
  const result = failureOf(validateStudioOutputEvaluation(requestOf({ kind: "reject-strategy", rationale: "" })));
  assert.equal(result.failure.kind, "invalid-decision-payload");
});

test("REQUEST-TREATMENT: the treatment kind must be a member of the STUDIO's own closed vocabulary", () => {
  const result = failureOf(
    validateStudioOutputEvaluation(
      requestOf({ kind: "request-treatment", treatment: { kind: "re-master", rationale: "r" } }),
    ),
  );
  assert.equal(result.failure.kind, "invalid-decision-payload");
  assert.match(result.failure.reason, /studio's own closed treatment vocabulary/);
});

test("REQUEST-TREATMENT: missing directive / blank parametersRef / blank rationale fail", () => {
  const missing = failureOf(validateStudioOutputEvaluation(requestOf({ kind: "request-treatment" })));
  assert.equal(missing.failure.kind, "invalid-decision-payload");
  const badParams = failureOf(
    validateStudioOutputEvaluation(
      requestOf({ kind: "request-treatment", treatment: { kind: "edit", parametersRef: "  ", rationale: "r" } }),
    ),
  );
  assert.equal(badParams.failure.kind, "invalid-decision-payload");
  const noRationale = failureOf(
    validateStudioOutputEvaluation(requestOf({ kind: "request-treatment", treatment: { kind: "edit" } })),
  );
  assert.equal(noRationale.failure.kind, "invalid-decision-payload");
});

test("REQUIRE-HUMAN-ACTION: objective + rationale required; a malformed task-package citation fails", () => {
  const noObjective = failureOf(
    validateStudioOutputEvaluation(requestOf({ kind: "require-human-action", humanAction: { rationale: "r" } })),
  );
  assert.equal(noObjective.failure.kind, "invalid-decision-payload");
  const noRationale = failureOf(
    validateStudioOutputEvaluation(requestOf({ kind: "require-human-action", humanAction: { objective: "o" } })),
  );
  assert.equal(noRationale.failure.kind, "invalid-decision-payload");
  const badTaskPackage = failureOf(
    validateStudioOutputEvaluation(
      requestOf({
        kind: "require-human-action",
        humanAction: { objective: "o", rationale: "r", referencedTaskPackage: { id: "  ", version: 1 } },
      }),
    ),
  );
  assert.equal(badTaskPackage.failure.kind, "invalid-decision-payload");
  const unversionedTaskPackage = failureOf(
    validateStudioOutputEvaluation(
      requestOf({
        kind: "require-human-action",
        humanAction: { objective: "o", rationale: "r", referencedTaskPackage: { id: "human-task:1", version: 0 } },
      }),
    ),
  );
  assert.equal(unversionedTaskPackage.failure.kind, "invalid-decision-payload");
});

test("SWITCH-*: the routing citation requires rationale + missionRef + searchResultId", () => {
  for (const kind of ["switch-organization", "switch-transform", "switch-engine"]) {
    const missing = failureOf(validateStudioOutputEvaluation(requestOf({ kind })));
    assert.equal(missing.failure.kind, "invalid-decision-payload");
    assert.match(missing.failure.reason, new RegExp(`the ${kind} decision must carry a routing citation`));
    const noMission = failureOf(
      validateStudioOutputEvaluation(
        requestOf({ kind, routing: { rationale: "r", searchResultId: "search:one" } }),
      ),
    );
    assert.equal(noMission.failure.kind, "invalid-decision-payload");
    const noSearch = failureOf(
      validateStudioOutputEvaluation(requestOf({ kind, routing: { rationale: "r", missionRef: "mission:one" } })),
    );
    assert.equal(noSearch.failure.kind, "invalid-decision-payload");
  }
});

test("ACCEPT-ALTERNATE-OUTPUT: the alternate cannot be the evaluated package version itself", () => {
  const result = failureOf(
    validateStudioOutputEvaluation(
      requestOf({ kind: "accept-alternate-output", alternate: { ...BASE_PACKAGE } }),
    ),
  );
  assert.equal(result.failure.kind, "invalid-decision-payload");
  assert.match(result.failure.reason, /cannot be the evaluated package version itself/);
});

test("ACCEPT-ALTERNATE-OUTPUT: a malformed alternate citation fails", () => {
  const blank = failureOf(
    validateStudioOutputEvaluation(requestOf({ kind: "accept-alternate-output", alternate: { packageId: " ", version: 1 } })),
  );
  assert.equal(blank.failure.kind, "invalid-decision-payload");
  const unversioned = failureOf(
    validateStudioOutputEvaluation(requestOf({ kind: "accept-alternate-output", alternate: { packageId: "pkg_other", version: 1.5 } })),
  );
  assert.equal(unversioned.failure.kind, "invalid-decision-payload");
});

test("ABANDON: justification + analysis snapshot required (first-class, §18)", () => {
  const noJustification = failureOf(
    validateStudioOutputEvaluation(
      requestOf({ kind: "abandon", analysis: { summary: "s", analysisRef: { analysisId: "a:1", analysisVersion: 1 } } }),
    ),
  );
  assert.equal(noJustification.failure.kind, "invalid-decision-payload");
  const noAnalysis = failureOf(validateStudioOutputEvaluation(requestOf({ kind: "abandon", justification: "j" })));
  assert.equal(noAnalysis.failure.kind, "invalid-decision-payload");
  const noSummary = failureOf(
    validateStudioOutputEvaluation(requestOf({ kind: "abandon", justification: "j", analysis: { analysisRef: { analysisId: "a:1", analysisVersion: 1 } } })),
  );
  assert.equal(noSummary.failure.kind, "invalid-decision-payload");
});

test("ABANDON: the analysis snapshot must cite the Lab's analysis record BY REFERENCE (id @ exact version)", () => {
  const badRef = failureOf(
    validateStudioOutputEvaluation(
      requestOf({ kind: "abandon", justification: "j", analysis: { summary: "s", analysisRef: { analysisId: "", analysisVersion: 1 } } }),
    ),
  );
  assert.equal(badRef.failure.kind, "invalid-decision-payload");
  const unversioned = failureOf(
    validateStudioOutputEvaluation(
      requestOf({ kind: "abandon", justification: "j", analysis: { summary: "s", analysisRef: { analysisId: "a:1" } } }),
    ),
  );
  assert.equal(unversioned.failure.kind, "invalid-decision-payload");
});

test("ABANDON: the §18 delay-economics figures must be finite (W9-B D5 — NaN/Infinity fail)", () => {
  for (const delayEconomics of [
    { expectedIncrementalValue: Number.NaN, estimatedWaitMs: 1, delayCost: 1 },
    { expectedIncrementalValue: 1, estimatedWaitMs: Number.POSITIVE_INFINITY, delayCost: 1 },
    { expectedIncrementalValue: 1, estimatedWaitMs: 1, delayCost: Number.NaN },
    { expectedIncrementalValue: "1" as unknown, estimatedWaitMs: 1, delayCost: 1 },
  ]) {
    const result = failureOf(
      validateStudioOutputEvaluation(
        requestOf({
          kind: "abandon",
          justification: "j",
          analysis: { summary: "s", analysisRef: { analysisId: "a:1", analysisVersion: 1 }, delayEconomics },
        }),
      ),
    );
    assert.equal(result.failure.kind, "invalid-decision-payload");
    assert.match(result.failure.reason, /finite/);
  }
});

// ---------------------------------------------------------------------------
// The frame validation (caller primitives — hostile shapes)
// ---------------------------------------------------------------------------

test("FRAME: hostile scope/actor/entry/package shapes fail typed invalid-evaluation-request", () => {
  const probes: [string, Record<string, unknown>][] = [
    ["coerced tenant object", { scope: { tenantId: { valueOf: () => "x" } } }],
    ["blank tenant", { scope: { tenantId: "  " } }],
    ["missing scope", { scope: undefined }],
    ["blank actor", { actor: " " }],
    ["object actor", { actor: { identityRef: "x" } }],
    ["blank entryId", { entryId: "" }],
    ["zero entryVersion", { entryVersion: 0 }],
    ["fractional entryVersion", { entryVersion: 1.5 }],
    ["missing evaluatedPackage", { evaluatedPackage: undefined }],
    ["blank packageId", { evaluatedPackage: { packageId: "", version: 1 } }],
    ["zero version", { evaluatedPackage: { packageId: "pkg_x", version: 0 } }],
    ["string version", { evaluatedPackage: { packageId: "pkg_x", version: "2" } }],
    ["blank notes", { notes: "   " }],
  ];
  for (const [name, overrides] of probes) {
    const result = failureOf(
      validateStudioOutputEvaluation(requestOf({ kind: "accept", summary: "s" }, overrides)),
    );
    assert.equal(result.failure.kind, "invalid-evaluation-request", `probe "${name}" must fail the frame gate`);
  }
});

test("FRAME: a cyclic request payload fails typed (W10-F3 pure-data pin)", () => {
  const decision: Record<string, unknown> = { kind: "accept", summary: "s" };
  decision.self = decision;
  const result = failureOf(validateStudioOutputEvaluation(requestOf(decision)));
  assert.equal(result.failure.kind, "invalid-evaluation-request");
  assert.match(result.failure.reason, /pure data/);
});

test("FRAME: validateDecisionPayload is independently callable over the evaluated-package citation", () => {
  // The alternate-self probe fires at the payload layer too (defense in depth).
  const result = failureOf(
    validateDecisionPayload(
      { kind: "accept-alternate-output", alternate: { packageId: "pkg_under_test", version: 2 } },
      BASE_PACKAGE,
    ),
  );
  assert.equal(result.failure.kind, "invalid-decision-payload");
});
