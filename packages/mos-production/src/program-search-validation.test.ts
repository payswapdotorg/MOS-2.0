/**
 * Production program search (LAB-016) — the fail-closed validation battery:
 * declared policy validation, declared input validation, hand-designed
 * candidate validation (every named typed code), and the frozen-order
 * fourteen-operator mutation table (single-dimension variation proven by
 * sixteen-dimension fingerprint diff + fail-closed revalidation of every
 * mutant).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { CandidateProgram } from "./contracts/program-candidate.js";
import type {
  ProductionProgramSearchInput,
  ProductionProgramSearchPolicy,
} from "./contracts/program-search.js";
import type { ProductionProgramSearchError } from "./contracts/program-search.js";
import { resolveProgramSearchContext } from "./adapters/program-search-validation.js";
import type { ProgramSearchContext } from "./adapters/program-search-validation.js";
import { programMutationsOf } from "./adapters/program-mutations.js";
import {
  programFeatureFingerprint,
  sourceReferenceSignatureOf,
  variedDimensionsBetween,
} from "./adapters/program-fingerprint.js";
import { validateDeclaredCandidate } from "./adapters/program-candidate-validation.js";
import {
  composeProgramSearchStack,
  fixtureSearchInput,
  handDesignedProgram,
} from "./testing/compose-program-search-stack.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Failure = ProductionProgramSearchError;

const searchFailure = async (
  overrides: Parameters<typeof fixtureSearchInput>[0] = {},
): Promise<Failure> => {
  const stack = composeProgramSearchStack();
  const outcome = await stack.search.searchPrograms(fixtureSearchInput(overrides));
  if (!("error" in outcome)) {
    assert.fail(`expected a typed failure, got a result with ${outcome.ranked.length} entries`);
  }
  return outcome;
};

const badPolicy = (
  overrides: Partial<ProductionProgramSearchPolicy>,
): ProductionProgramSearchPolicy => ({
  ...fixtureSearchInput().policy,
  ...overrides,
});

/** Resolves the search context over the fixture stack (for the operator test). */
const fixtureContext = async (): Promise<ProgramSearchContext> => {
  const stack = composeProgramSearchStack();
  const input = fixtureSearchInput();
  const context = await resolveProgramSearchContext(input, {
    catalog: stack.doubles.catalog,
    organizations: stack.doubles.organizations,
    transforms: stack.doubles.transforms,
  });
  if ("error" in context) {
    assert.fail(`fixture context resolution failed: ${context.message}`);
  }
  return context;
};

// ---------------------------------------------------------------------------
// Declared policy validation (fail-closed, named checks)
// ---------------------------------------------------------------------------

test("policy validation fails closed on every malformed declared vocabulary", async () => {
  const cases: readonly [string, Partial<ProductionProgramSearchPolicy>][] = [
    ["non-integer version", { version: 0 }],
    ["maxChainSteps below one", { maxChainSteps: 0 }],
    ["empty preset vocabulary", { parameterPresetVocabulary: [] }],
    ["duplicate preset vocabulary", { parameterPresetVocabulary: ["a", "a"] }],
    ["blank preset vocabulary entry", { parameterPresetVocabulary: ["a", " "] }],
    ["empty modality vocabulary", { modalityVocabulary: [] }],
    ["duplicate modality vocabulary", { modalityVocabulary: ["studio", "studio"] }],
    ["empty model vocabulary", { modelVocabulary: [] }],
    ["empty engine vocabulary", { engineVocabulary: [] }],
    ["empty quality ladder", { qualityFloorLadder: [] }],
    ["non-ascending quality ladder", { qualityFloorLadder: [0.8, 0.5] }],
    ["quality floor out of range", { qualityFloorLadder: [0.5, 1.4] }],
    ["budgetScaleFactor at one", { budgetScaleFactor: 1 }],
    ["non-finite budgetScaleFactor", { budgetScaleFactor: Number.NaN }],
    ["empty duration ladder", { expectedDurationLadderMs: [] }],
    ["non-ascending duration ladder", { expectedDurationLadderMs: [300_000, 60_000] }],
    ["empty wait ladder", { waitHorizonLadderMs: [] }],
    ["non-ascending wait ladder", { waitHorizonLadderMs: [120_000, 30_000] }],
    ["maxRetriesCap below one", { maxRetriesCap: 0 }],
    ["seedCount below two", { seedCount: 1 }],
    ["plateauWindow below one", { plateauWindow: 0 }],
    ["negative improvementTolerance", { improvementTolerance: -0.5 }],
    ["unknown pruning rule", { pruning: "magic" as never }],
  ];
  for (const [label, overrides] of cases) {
    const failure = await searchFailure({ policy: badPolicy(overrides) });
    assert.equal(failure.error, "invalid-policy", label);
    assert.ok(failure.message.length > 0, label);
  }
});

// ---------------------------------------------------------------------------
// Declared input validation (fail-closed, named checks)
// ---------------------------------------------------------------------------

test("input validation fails closed on every malformed declared field", async () => {
  const base = fixtureSearchInput();
  const cases: readonly [string, Partial<ProductionProgramSearchInput>][] = [
    ["blank objective", { objective: "   " }],
    ["empty source artifacts", { sourceArtifactRefs: [] }],
    ["empty studio-format vocabulary", { studioFormatVocabulary: [] }],
    [
      "duplicate studio formats",
      {
        studioFormatVocabulary: [
          "studio-format:reaction-video" as never,
          "studio-format:reaction-video" as never,
        ],
      },
    ],
    [
      "duplicate human tasks",
      {
        humanTaskVocabulary: [
          "human-task:fixture-reaction-capture" as never,
          "human-task:fixture-reaction-capture" as never,
        ],
      },
    ],
    [
      "negative estimated wait",
      {
        delayExpectation: {
          ...base.delayExpectation,
          estimatedWaitMs: -1,
        },
      },
    ],
    [
      "success probability out of range",
      {
        delayExpectation: {
          ...base.delayExpectation,
          successProbability: 1.5,
        },
      },
    ],
    [
      "declared-assumption without a note",
      {
        delayExpectation: {
          ...base.delayExpectation,
          provenance: { kind: "declared-assumption", note: " " },
        },
      },
    ],
    [
      "delay-analysis without an id",
      {
        delayExpectation: {
          ...base.delayExpectation,
          provenance: { kind: "delay-analysis", analysisId: "", analysisVersion: 1 },
        },
      },
    ],
    [
      "negative base budget",
      {
        baseBudget: {
          maxCost: { amount: -5, currency: "USD" },
          maxDurationMs: 1_000,
        },
      },
    ],
    ["empty substitution preference", { substitutionPreference: [] }],
    [
      "duplicate substitution preference",
      { substitutionPreference: ["engine", "engine"] },
    ],
    ["unparseable deadline anchor", { deadlineAnchor: "not-a-date" as never }],
    ["non-integer seed", { seed: Number.NaN }],
    ["zero evaluation budget", { budget: { maxCandidateEvaluations: 0, maxIterations: 4 } }],
    ["zero iteration cap", { budget: { maxCandidateEvaluations: 30, maxIterations: 0 } }],
  ];
  for (const [label, overrides] of cases) {
    const failure = await searchFailure(overrides);
    assert.equal(failure.error, "invalid-input", label);
  }
});

// ---------------------------------------------------------------------------
// Hand-designed candidate validation (fail-closed, every named code)
// ---------------------------------------------------------------------------

test("hand-designed candidate validation fails closed with every named typed code", async () => {
  const cases: readonly [string, Failure["error"], CandidateProgram][] = [
    [
      "caller-claimed no-op baseline",
      "caller-claimed-no-op-baseline",
      handDesignedProgram({ isNoopBaseline: true }),
    ],
    [
      "empty transform chain",
      "invalid-candidate",
      handDesignedProgram({ transformChain: [] }),
    ],
    [
      "chain over the cap",
      "invalid-candidate",
      handDesignedProgram({
        transformChain: [
          { definitionId: "transform:clip-highlights" as never, definitionVersion: 1 as never, parameterPreset: "balanced", parameters: {} },
          { definitionId: "transform:reaction-pip" as never, definitionVersion: 1 as never, parameterPreset: "balanced", parameters: {} },
          { definitionId: "transform:semantic-highlights" as never, definitionVersion: 1 as never, parameterPreset: "balanced", parameters: {} },
          { definitionId: "transform:noop-repost" as never, definitionVersion: 1 as never, parameterPreset: "balanced", parameters: {} },
        ].slice(0, 4),
      }),
    ],
    [
      "modality outside vocabulary",
      "invalid-candidate",
      handDesignedProgram({ modality: "telepathic" as never }),
    ],
    [
      "studio format outside vocabulary",
      "invalid-candidate",
      handDesignedProgram({ studioFormat: "studio-format:unknown" as never }),
    ],
    [
      "unresolvable transform step (unknown id)",
      "transform-unresolved",
      handDesignedProgram({
        transformChain: [
          { definitionId: "transform:unknown" as never, definitionVersion: 1 as never, parameterPreset: "balanced", parameters: {} },
        ],
      }),
    ],
    [
      "unresolvable transform step (wrong version)",
      "transform-unresolved",
      handDesignedProgram({
        transformChain: [
          { definitionId: "transform:reaction-pip" as never, definitionVersion: 99 as never, parameterPreset: "aggressive", parameters: {} },
        ],
      }),
    ],
    [
      "the no-op-repost kind as a chain step",
      "no-op-transform-in-chain",
      handDesignedProgram({
        transformChain: [
          { definitionId: "transform:noop-repost" as never, definitionVersion: 1 as never, parameterPreset: "balanced", parameters: {} },
        ],
      }),
    ],
    [
      "parameter preset outside vocabulary",
      "invalid-candidate",
      handDesignedProgram({
        transformChain: [
          { definitionId: "transform:reaction-pip" as never, definitionVersion: 1 as never, parameterPreset: "maximal", parameters: {} },
        ],
      }),
    ],
    [
      "malformed parameters payload",
      "invalid-candidate",
      handDesignedProgram({
        transformChain: [
          {
            definitionId: "transform:reaction-pip" as never,
            definitionVersion: 1 as never,
            parameterPreset: "aggressive",
            parameters: ["not", "an", "object"] as never,
          },
        ],
      }),
    ],
    [
      "null organization citation",
      "organization-unresolved",
      handDesignedProgram({ organization: null }),
    ],
    [
      "unknown organization citation",
      "organization-unresolved",
      handDesignedProgram({
        organization: { organizationId: "organization:unknown", organizationVersion: 1 as never },
      }),
    ],
    [
      "unknown pawn kind",
      "invalid-candidate",
      handDesignedProgram({ pawnAgents: ["time-traveler" as never] }),
    ],
    [
      "duplicate pawn kinds",
      "invalid-candidate",
      handDesignedProgram({ pawnAgents: ["editor", "editor"] }),
    ],
    [
      "model assignment on a deterministic pawn",
      "model-assignment-for-deterministic-pawn",
      handDesignedProgram({
        pawnAgents: ["editor"],
        modelAssignments: [{ pawnKind: "editor", modelRef: "mos-model:pawn-default" as never }],
      }),
    ],
    [
      "model assignment citing an unstaffed pawn kind",
      "invalid-candidate",
      handDesignedProgram({
        pawnAgents: ["editor"],
        modelAssignments: [{ pawnKind: "podcast-interviewer", modelRef: "mos-model:pawn-default" as never }],
      }),
    ],
    [
      "duplicate model assignments for one pawn kind",
      "invalid-candidate",
      handDesignedProgram({
        pawnAgents: ["podcast-interviewer"],
        modelAssignments: [
          { pawnKind: "podcast-interviewer", modelRef: "mos-model:pawn-default" as never },
          { pawnKind: "podcast-interviewer", modelRef: "mos-model:pawn-default" as never },
        ],
      }),
    ],
    [
      "model ref outside the declared vocabulary",
      "invalid-candidate",
      handDesignedProgram({
        pawnAgents: ["podcast-interviewer"],
        modelAssignments: [{ pawnKind: "podcast-interviewer", modelRef: "mos-model:rogue" as never }],
      }),
    ],
    [
      "duplicate engine portfolio binding",
      "invalid-candidate",
      handDesignedProgram({
        enginePortfolio: [
          { capabilityId: "compose_reaction" as never, capabilityVersion: 1 as never, engineId: "engine:reaction-composer" as never, engineVersion: 2 as never },
          { capabilityId: "compose_reaction" as never, capabilityVersion: 1 as never, engineId: "engine:reaction-composer" as never, engineVersion: 2 as never },
        ],
      }),
    ],
    [
      "engine binding outside the registry vocabulary",
      "invalid-candidate",
      handDesignedProgram({
        enginePortfolio: [
          { capabilityId: "compose_reaction" as never, capabilityVersion: 1 as never, engineId: "engine:unknown" as never, engineVersion: 1 as never },
        ],
      }),
    ],
    [
      "human task outside the declared vocabulary",
      "human-task-outside-vocabulary",
      handDesignedProgram({ humanTasks: ["human-task:unknown" as never] }),
    ],
    [
      "duplicate human tasks",
      "invalid-candidate",
      handDesignedProgram({ humanTasks: ["human-task:fixture-reaction-capture" as never, "human-task:fixture-reaction-capture" as never] }),
    ],
    [
      "uncovered chain capability requirement",
      "uncovered-capability-requirement",
      handDesignedProgram({ capabilityAcquisition: [] }),
    ],
    [
      "acquisition entry without a chain requirement",
      "invalid-candidate",
      handDesignedProgram({
        capabilityAcquisition: [
          { requirement: { capabilityId: "compose_reaction" as never, version: 1 as never }, mode: "engine" },
          { requirement: { capabilityId: "reframe_video" as never, version: 1 as never }, mode: "existing" },
        ],
      }),
    ],
    [
      "engine-mode acquisition without a portfolio binding",
      "engine-binding-missing",
      handDesignedProgram({
        enginePortfolio: [],
      }),
    ],
    [
      "human-mode acquisition without human tasks",
      "invalid-candidate",
      handDesignedProgram({
        humanTasks: [],
        capabilityAcquisition: [
          { requirement: { capabilityId: "compose_reaction" as never, version: 1 as never }, mode: "human" },
        ],
      }),
    ],
    [
      "quality floor out of range",
      "invalid-candidate",
      handDesignedProgram({ qualityThresholds: { floor: 1.4, evaluatorRef: "evaluator:quality/program-outputs" as never } }),
    ],
    [
      "blank quality evaluator ref",
      "invalid-candidate",
      handDesignedProgram({ qualityThresholds: { floor: 0.65, evaluatorRef: " " as never } }),
    ],
    [
      "negative candidate budget",
      "invalid-candidate",
      handDesignedProgram({
        budget: { maxCost: { amount: -1, currency: "USD" }, maxDurationMs: 900_000 },
      }),
    ],
    [
      "unparseable candidate deadline",
      "invalid-candidate",
      handDesignedProgram({ deadline: "not-a-date" as never }),
    ],
    [
      "negative expected duration",
      "invalid-candidate",
      handDesignedProgram({ expectedDurationMs: -1 }),
    ],
    [
      "negative delay-policy maxWaitMs",
      "invalid-candidate",
      handDesignedProgram({ delayPolicy: { maxWaitMs: -1, onDelayExceeded: "substitute" } }),
    ],
    [
      "unknown delay-exceeded action",
      "invalid-candidate",
      handDesignedProgram({ delayPolicy: { maxWaitMs: 30_000, onDelayExceeded: "panic" as never } }),
    ],
    [
      "delay expectations without provenance sanity (probability out of range)",
      "invalid-candidate",
      handDesignedProgram({
        delayExpectation: {
          expectedIncrementalValue: 12,
          estimatedWaitMs: 30_000,
          delayCost: 1.5,
          acquisitionCost: 0.8,
          successProbability: 2,
          qualityImpact: -0.1,
          provenance: { kind: "declared-assumption", note: "test" },
        },
      }),
    ],
    [
      "negative stopping-policy retries",
      "invalid-candidate",
      handDesignedProgram({
        stoppingPolicy: { maxRetries: -1, substitutionPreference: ["engine"] },
      }),
    ],
    [
      "duplicate substitution preference",
      "invalid-candidate",
      handDesignedProgram({
        stoppingPolicy: { maxRetries: 1, substitutionPreference: ["engine", "engine"] },
      }),
    ],
  ];
  for (const [label, expected, candidate] of cases) {
    const failure = await searchFailure({ handDesigned: [{ candidate }] });
    assert.equal(failure.error, expected, `${label} → ${failure.message}`);
  }
});

test("a well-formed hand-designed candidate passes validation and joins the comparison", async () => {
  const stack = composeProgramSearchStack();
  const input = fixtureSearchInput({
    handDesigned: [{ candidate: handDesignedProgram() }],
  });
  const result = await stack.search.searchPrograms(input);
  assert.ok("ranked" in result);
  assert.ok(
    result.ranked.some((entry) => entry.provenance.origin === "hand-designed"),
  );
});

// ---------------------------------------------------------------------------
// The frozen-order fourteen-operator mutation table
// ---------------------------------------------------------------------------

test("the fourteen mutable §7 dimensions each have exactly one operator, in frozen order, varying exactly what the fingerprint diff says", async () => {
  const context = await fixtureContext();
  // A FULLY-POPULATED parent: every operator has somewhere to go.
  const parent = handDesignedProgram({
    transformChain: [
      { definitionId: "transform:reaction-pip" as never, definitionVersion: 1 as never, parameterPreset: "balanced", parameters: { preset: "balanced" } },
    ],
    pawnAgents: ["reaction-composition", "quality-critic", "podcast-interviewer"],
    modelAssignments: [
      { pawnKind: "podcast-interviewer", modelRef: "mos-model:pawn-default" as never },
    ],
    humanTasks: ["human-task:fixture-reaction-capture" as never],
  });
  const mutations = programMutationsOf(parent, context, 1);
  assert.equal(
    mutations.length,
    14,
    "every mutable dimension (all but source-reference and no-op-repost) has an operator",
  );
  const sourceSignature = sourceReferenceSignatureOf(context.input.sourceArtifactRefs);
  const parentFingerprint = programFeatureFingerprint(parent, sourceSignature);
  const mutableDimensions = [
    "transform-chain",
    "transform-parameters",
    "production-modality",
    "organization",
    "pawn-agents",
    "model-assignment",
    "engine-portfolio",
    "human-participation",
    "capability-acquisition",
    "quality-thresholds",
    "cost",
    "latency",
    "expected-value-of-delay",
    "stopping-substitution-policy",
  ];
  const variedUnion = new Set<string>();
  mutations.forEach((mutation, index) => {
    const fingerprint = programFeatureFingerprint(mutation.candidate, sourceSignature);
    // The PROVENANCE discipline: the dimensions whose fingerprints differ
    // between parent and child are EXACTLY the recorded varied dimensions.
    const diff = variedDimensionsBetween(parentFingerprint, fingerprint);
    assert.deepEqual(diff, mutation.variedDimensions);
    assert.ok(diff.length >= 1, "every operator actually varies something");
    for (const dimension of diff) {
      assert.ok(
        mutableDimensions.includes(dimension),
        `varied dimension '${dimension}' is a mutable dimension`,
      );
      variedUnion.add(dimension);
    }
    // The operator table is FROZEN-ORDER: the index-th mutation's diff
    // includes the index-th mutable dimension (its primary dimension).
    const primary = mutableDimensions[index];
    assert.ok(
      primary !== undefined && diff.includes(primary as never),
      `operator #${index + 1} varies its primary dimension '${String(primary)}'`,
    );
  });
  for (const dimension of mutableDimensions) {
    assert.ok(variedUnion.has(dimension), `dimension '${dimension}' varied`);
  }
  // Fail-closed revalidation of EVERY mutant (validity by construction).
  for (const mutation of mutations) {
    const failure = await validateDeclaredCandidate(context, mutation.candidate);
    assert.equal(failure, null, `mutant must stay valid: ${JSON.stringify(failure)}`);
  }
});

test("the mutation operators are deterministic (same parent, same context, same index)", async () => {
  const context = await fixtureContext();
  const parent = handDesignedProgram();
  const first = programMutationsOf(parent, context, 2);
  const second = programMutationsOf(parent, context, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
});
