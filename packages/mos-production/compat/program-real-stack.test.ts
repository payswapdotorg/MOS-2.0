/**
 * REAL-stack integration test (LAB-016) — the RUNTIME half of the
 * program-search compatibility pins (the compile-time half lives in
 * compat/program-search-compat.ts).
 *
 * Runs the PRODUCTION PROGRAM SEARCH through the REAL sibling packages
 * wired behind this package's declared port seams:
 *
 * - REAL `@mos/lab` LAB-011/012 transform-definition registry behind the
 *   CATALOG seam + the exact-version RESOLVE seam (one-line delegations:
 *   `listPromotedTransforms` → `listTransformDefinitions`, `resolve` →
 *   `getTransformDefinition`);
 * - REAL `@mos/agents` body registry + organization registry behind the
 *   ORGANIZATION-SOURCE seam (the ten §9 pawn bodies' canonical AgentBody
 *   records registered in the real registry; two organizations composed
 *   over them; descriptors = real records + the two declared §23 features);
 * - REAL `@mos/lab` LAB-007 world-model ensemble (world model store +
 *   simulator engine + two full-coverage members) behind the EVALUATION
 *   seam: the documented action mapping (ProgramSimulationAction →
 *   StrategyActionCandidate; the no-op repost maps to the FIRST-CLASS
 *   `no-op` action kind) and the §22 reward set from the real prediction
 *   (qualified-reach expected value + interval + member-spread
 *   disagreement + version pins);
 * - REAL `@mos/lab` LAB-015 delay economics (the declared `ev-delay-1`
 *   policy) computing the §2 EV OF DELAY for every candidate — the search
 *   itself never computes a delay EV.
 *
 * The result: a ranked, uncertainty-labeled, counterfactual candidate set
 * with the structurally-present no-op baseline and canonical
 * ProductionRequests — deterministic given (inputs, seed, policy version).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { LabScenario, TenantScope, Timestamp } from "@mos/contracts";
import { assertRequiredFields } from "@mos/contracts";

// REAL sibling packages (relative dist paths — the same public surfaces the
// bare specifiers resolve to after `tsc -b`; no runtime dependency of this
// package is created).
import {
  createInMemoryAgentBodyRegistry,
  createInMemoryOrganizationRegistry,
} from "../../mos-agents/dist/index.js";
import {
  createInMemoryTransformDefinitionRegistry,
  createInMemorySocialWorldModelStore,
  createInMemorySimulatorEngine,
  createInMemoryEnsemble,
  createInMemoryDelayEconomics,
  DELAY_OPTION_KINDS,
} from "../../mos-lab/dist/index.js";
import type {
  DelayDecisionPort,
  DelayEvaluationInput,
  DelayOptionDeclaration,
  EnsemblePort,
} from "../../mos-lab/dist/index.js";
import type { StrategyActionCandidate } from "../../mos-lab/dist/index.js";

// THIS package's public surface (built).
import {
  TRANSFORM_PAWN_BODIES,
  createInMemoryProgramSearch,
} from "../dist/index.js";
import type {
  ProductionProgramSearchInput,
  ProductionProgramSearchPolicy,
} from "../dist/index.js";
import type {
  ProgramOrganizationDescriptor,
  ProgramOrganizationSourcePort,
} from "../dist/index.js";
import type {
  ProgramEvaluationPort,
  ProgramEvaluationRequest,
} from "../dist/index.js";
import type { ProgramDelayTerms } from "../dist/index.js";

const NOW = (): Timestamp => "2026-01-01T00:00:00.000Z" as never;
const SCOPE: TenantScope = { tenantId: "tenant:program-compat" as never };

// ---------------------------------------------------------------------------
// The REAL lab fixture world (scenario, world models, ensemble)
// ---------------------------------------------------------------------------

const SCENARIO: LabScenario = {
  id: "scenario-program-compat" as never,
  version: 1 as never,
  niche: "sourdough-baking",
  platform: "short-video",
  objective: "qualified-reach",
  context: { campaignShape: "weekly-educational-clip" },
  budget: { maxCost: { amount: 500, currency: "USD" }, maxDurationMs: 14 * 86_400_000 },
  informationLag: 5 * 86_400_000,
  corpusVersion: 1 as never,
  simulatorVersion: 1 as never,
  rewardVersion: 1 as never,
};

const WORLD_A = {
  id: "world-program-a" as never,
  niche: "sourdough-baking",
  platform: "short-video",
  state: { baseAudience: 12_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
  notes: "compat member A (audience 12k)",
};

const WORLD_B = {
  id: "world-program-b" as never,
  niche: "sourdough-baking",
  platform: "short-video",
  state: { baseAudience: 24_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
  notes: "compat member B (audience 24k)",
};

const FULL_COVERAGE = {
  cadencePerWeek: { min: 0, max: 14 },
  novelty: { min: 0, max: 1 },
  engagementEffort: { min: 0, max: 1 },
};

const ENSEMBLE_ID = "ensemble-program-compat" as never;

// ---------------------------------------------------------------------------
// The REAL lab transform registry (catalog + resolve one-line delegations)
// ---------------------------------------------------------------------------

function makeDefinitionInput(
  id: string,
  kind: string,
  capabilityIds: readonly string[],
  inputType: "video" | "audio",
): Record<string, unknown> {
  return {
    scope: SCOPE,
    id: id as never,
    kind: kind as never,
    inputConstraint: {
      name: "compat-input",
      acceptedTypes: [inputType],
      acceptedModalities: [inputType],
      minInputs: 1,
      maxInputs: 4,
      requiresRights: true,
    },
    outputContract: { outputTypes: [inputType], outputCount: 1 },
    parameters: { type: "object" },
    capabilityRequirements: capabilityIds.map((capabilityId) => ({
      capabilityId: capabilityId as never,
      version: 1 as never,
    })),
    humanParticipation: false,
    evaluator: `evaluator:transform/${id}` as never,
    costModel: { basis: "per-invocation", amount: 0.1, currency: "USD" },
    latencyModel: { p50Ms: 1000, p95Ms: 4000, p99Ms: 10_000 },
    rightsRequirements: [],
    policyRequirements: [],
    lineageRules: [],
  };
}

// ---------------------------------------------------------------------------
// The declared search policy + input (the compat frame)
// ---------------------------------------------------------------------------

const POLICY: ProductionProgramSearchPolicy = Object.freeze({
  version: 1,
  maxChainSteps: 3,
  parameterPresetVocabulary: ["balanced", "aggressive"],
  modalityVocabulary: ["automated", "studio", "hybrid"] as readonly ["automated", "studio", "hybrid"],
  modelVocabulary: ["mos-model:pawn-default" as never, "mos-model:pawn-premium" as never],
  engineVocabulary: [
    { capabilityId: "rank_clip_candidates" as never, capabilityVersion: 1 as never, engineId: "engine:clip-ranker" as never, engineVersion: 1 as never },
    { capabilityId: "transcribe_audio" as never, capabilityVersion: 1 as never, engineId: "engine:transcriber" as never, engineVersion: 1 as never },
    { capabilityId: "generate_questions" as never, capabilityVersion: 1 as never, engineId: "engine:question-designer" as never, engineVersion: 1 as never },
  ],
  qualityFloorLadder: [0.5, 0.7],
  budgetScaleFactor: 2,
  expectedDurationLadderMs: [60_000, 300_000],
  waitHorizonLadderMs: [30_000, 120_000],
  maxRetriesCap: 2,
  seedCount: 2,
  plateauWindow: 2,
  improvementTolerance: 0.01,
  pruning: "interval-dominance",
});

const DELAY_TERMS: ProgramDelayTerms = {
  expectedIncrementalValue: 12,
  estimatedWaitMs: 30_000,
  delayCost: 1.5,
  acquisitionCost: 0.8,
  successProbability: 0.7,
  qualityImpact: -0.1,
};

function compatSearchInput(
  overrides: Partial<ProductionProgramSearchInput> = {},
): ProductionProgramSearchInput {
  return {
    scope: SCOPE,
    missionRef: "mission:program-compat" as never,
    strategyRef: "strategy:program-compat" as never,
    objective: "Produce reaction-video program candidates from the compat source video",
    sourceArtifactRefs: [
      {
        artifactId: "artifact:compat-source-video" as never,
        version: 1 as never,
        tenantId: SCOPE.tenantId,
        digest: "sha256:compat-source-video" as never,
        type: "video" as never,
        storageRef: "storage://compat/source-video" as never,
        rightsRef: "rights:compat-grant" as never,
        provenanceRef: "provenance:compat/source-video" as never,
      },
    ],
    rightsContext: {
      rightsRefs: ["rights:compat-grant" as never],
      consentRefs: ["consent:compat-producer" as never],
    },
    returnContract: { type: "object", properties: { output: { type: "string" } } },
    studioFormatVocabulary: [
      "studio-format:reaction-video" as never,
      "studio-format:audio-podcast" as never,
    ],
    humanTaskVocabulary: ["human-task:compat-reaction-capture" as never],
    delayExpectation: {
      ...DELAY_TERMS,
      provenance: {
        kind: "delay-analysis",
        analysisId: "delay-analysis:compat-001",
        analysisVersion: 1,
      },
    },
    deadlineAnchor: "2026-06-01T00:00:00.000Z" as never,
    baseBudget: { maxCost: { amount: 25, currency: "USD" }, maxDurationMs: 1_800_000 },
    qualityEvaluatorRef: "evaluator:quality/program-outputs" as never,
    substitutionPreference: ["engine", "transform", "reduced-scope"],
    policy: POLICY,
    budget: { maxCandidateEvaluations: 12, maxIterations: 2 },
    seed: 20260101,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The REAL stack composed behind the seams
// ---------------------------------------------------------------------------

async function composeRealProgramStack(): Promise<{
  readonly search: ReturnType<typeof createInMemoryProgramSearch>;
  readonly ensemble: EnsemblePort;
  readonly delayPort: DelayDecisionPort;
}> {
  // REAL LAB-007: world models + simulator engine + two-member ensemble.
  const worldModels = createInMemorySocialWorldModelStore({ now: NOW as never });
  const simulator = createInMemorySimulatorEngine({ worldModels, now: NOW as never });
  for (const draft of [WORLD_A, WORLD_B]) {
    const registered = await worldModels.registerWorldModel({ scope: SCOPE, worldModel: draft });
    if ("error" in registered) {
      throw new Error(`compat world registration failed: ${registered.message}`);
    }
  }
  const ensemble = createInMemoryEnsemble({ simulator, now: NOW as never });
  const registered = await ensemble.registerEnsemble({
    scope: SCOPE,
    ensemble: {
      id: ENSEMBLE_ID,
      niche: "sourdough-baking",
      platform: "short-video",
      members: [
        { id: "member-a", worldModelId: WORLD_A.id, worldModelVersion: 1, coverage: FULL_COVERAGE, notes: null },
        { id: "member-b", worldModelId: WORLD_B.id, worldModelVersion: 1, coverage: FULL_COVERAGE, notes: null },
      ],
      weightingPolicy: { id: "policy-uniform", version: 1, kind: "uniform", note: "compat uniform weighting" },
      notes: "compat program-search ensemble",
    },
  });
  if ("error" in registered) {
    throw new Error(`compat ensemble registration failed: ${registered.message}`);
  }

  // REAL LAB-015: the delay decision authority (the shipped ev-delay-1 policy v1).
  const delayPort = createInMemoryDelayEconomics({ now: NOW as never });

  // REAL LAB-011/012: the transform-definition registry behind the catalog +
  // resolve one-line delegations.
  const labRegistry = createInMemoryTransformDefinitionRegistry({ now: NOW as never });
  for (const input of [
    makeDefinitionInput("transform:compat-clips", "clip", ["rank_clip_candidates"], "video"),
    makeDefinitionInput("transform:compat-reaction", "reaction", ["rank_clip_candidates"], "video"),
    makeDefinitionInput("transform:compat-podcast", "podcast", ["transcribe_audio", "generate_questions"], "audio"),
  ]) {
    const result = await labRegistry.registerTransformDefinition(input as never);
    if (result !== null && "error" in result) {
      throw new Error(`compat definition registration failed: ${JSON.stringify(result)}`);
    }
  }
  const catalog = {
    listPromotedTransforms: (scope: TenantScope) => labRegistry.listTransformDefinitions(scope),
  };
  const transforms = {
    resolve: (
      scope: TenantScope,
      definitionId: Parameters<typeof labRegistry.getTransformDefinition>[1],
      version?: number,
    ) => labRegistry.getTransformDefinition(scope, version === undefined ? definitionId : definitionId, version),
  };

  // REAL @mos/agents: body registry (the ten §9 pawn bodies) + organization
  // registry; the organization-source seam lists real records + the two
  // declared §23 features.
  const bodies = createInMemoryAgentBodyRegistry();
  for (const pawn of TRANSFORM_PAWN_BODIES) {
    bodies.register(pawn.agentBody);
  }
  const organizations = createInMemoryOrganizationRegistry({ bodyRegistry: bodies });
  // NOTE (disclosed): the REAL agents registry requires an EXPLICIT model
  // assignment on every organization node — so the compat organizations are
  // composed over LLM-FLAVORED pawn bodies (podcast-interviewer /
  // question-designer) with declared model-assignment DATA refs (resolved
  // only at the single model-runtime boundary — lock rule 9). The §9
  // deterministic-pawns-carry-no-model discipline is this package's OWN
  // pawn-organization surface (W7-B); the agents registry's canonical
  // records are a different, stricter record shape.
  const organizationRecord = (
    id: string,
    version: number,
    nodeSpecs: readonly { readonly nodeId: string; readonly role: string; readonly bodyId: string }[],
  ) => ({
    id: id as never,
    version: version as never,
    tenantId: SCOPE.tenantId,
    nodes: nodeSpecs.map((node) => ({ ...node, bodyId: node.bodyId as never })),
    edges: [],
    modelAssignments: nodeSpecs.map((node) => ({
      nodeId: node.nodeId,
      modelRef: "mos-model:pawn-default" as never,
    })),
    memoryPolicy: { scope: "session" as never, sharing: "shared" as never },
    budgetPolicy: {
      organization: { maxCost: { amount: 100, currency: "USD" }, maxDurationMs: 3_600_000 },
      perNode: { maxCost: { amount: 50, currency: "USD" }, maxDurationMs: 1_800_000 },
    },
    terminationPolicy: { maxIterations: 8, timeoutMs: 600_000 },
    evaluator: `evaluator:organization/${id}`,
  });
  organizations.registerOrganization(
    SCOPE,
    organizationRecord("organization:compat-solo", 1, [
      { nodeId: "producer", role: "producer", bodyId: "pawn:podcast-interviewer" },
    ]),
  );
  organizations.registerOrganization(
    SCOPE,
    organizationRecord("organization:compat-duo", 1, [
      { nodeId: "producer", role: "producer", bodyId: "pawn:podcast-interviewer" },
      { nodeId: "designer", role: "designer", bodyId: "pawn:question-designer" },
    ]),
  );
  const organizationSource: ProgramOrganizationSourcePort = {
    async listOrganizations(scope) {
      const descriptors: ProgramOrganizationDescriptor[] = [];
      for (const id of organizations.listOrganizationIds(scope)) {
        const versions = organizations.listVersions(scope, id);
        const latest = versions.length > 0 ? Math.max(...(versions as readonly number[])) : undefined;
        const record = latest === undefined ? undefined : organizations.getOrganization(scope, id, latest as never);
        if (record === undefined) continue;
        descriptors.push({
          ...record,
          criticNodeIds: record.nodes.length > 1 ? [record.nodes[0]?.nodeId ?? ""] : [],
          executionOrdering: "sequential",
        });
      }
      return descriptors;
    },
  };

  // The EVALUATION seam over the REAL ensemble + REAL delay authority.
  const delayEvCache = new Map<string, { value: number; lower: number; upper: number }>();
  let analysisCounter = 0;
  const waitOptionOf = (terms: ProgramDelayTerms): DelayOptionDeclaration => ({
    optionKind: "wait",
    applicable: true,
    inapplicableReason: null,
    target: { kind: "none" },
    dimensions: {
      expectedIncrementalValue: {
        estimate: { amount: terms.expectedIncrementalValue, currency: "USD" },
        interval: { lower: terms.expectedIncrementalValue, upper: terms.expectedIncrementalValue },
        rewardSpecVersion: 1,
        derivation: {
          kind: "declared-assumption",
          note: "the candidate's declared delay expectations (program-search input)",
        },
      },
      estimatedWait: {
        waitMs: terms.estimatedWaitMs,
        derivation: {
          kind: "declared-assumption",
          note: "the candidate's declared estimated wait",
        },
      },
      delayCost: {
        perUnitTime: { amount: terms.delayCost, currency: "USD" },
        unitMs: terms.estimatedWaitMs > 0 ? terms.estimatedWaitMs : 3_600_000,
        source: {
          kind: "declared-budget",
          note: "the candidate's declared total delay cost over the estimated wait",
        },
      },
      acquisitionCost: {
        kind: "engine-acquisition-cost",
        estimate: { amount: terms.acquisitionCost, currency: "USD" },
        derivation: {
          kind: "declared-assumption",
          note: "the candidate's declared acquisition cost",
        },
      },
      successProbability: {
        probability: terms.successProbability,
        derivation: {
          kind: "declared-assumption",
          note: "the candidate's declared success probability",
        },
      },
      qualityImpact: {
        declared: terms.qualityImpact,
        derivation: {
          kind: "declared-assumption",
          note: "the candidate's declared signed quality impact (carried, never monetized)",
        },
      },
      alternativePaths: { ordered: [{ order: 1, optionKind: "abandon" }] },
    },
  });
  const evaluation: ProgramEvaluationPort = {
    async evaluateProgram(request: ProgramEvaluationRequest) {
      const { action, delayTerms, seed } = request;
      // The documented action mapping onto the LAB-004 vocabulary (the
      // no-op repost maps to the FIRST-CLASS no-op action kind).
      const candidate: StrategyActionCandidate = {
        strategyRef: action.strategyRef,
        kind: action.isNoopRepost ? "no-op" : "content",
        cadencePerWeek: action.cadencePerWeek,
        novelty: action.novelty,
        engagementEffort: action.engagementEffort,
      };
      const prediction = await ensemble.evaluateEnsemble({
        scope: request.scope,
        ensembleId: ENSEMBLE_ID,
        ensembleVersion: 1,
        scenario: SCENARIO,
        candidate,
        seed,
        step: 0,
      });
      if ("error" in prediction) {
        throw new Error(`compat ensemble evaluation failed: ${prediction.message}`);
      }
      const reach =
        prediction.metrics.find((metric) => metric.metric === "qualified-reach") ??
        prediction.metrics[0];
      if (reach === undefined) {
        throw new Error("compat ensemble produced no predicted metrics");
      }
      const disagreement =
        prediction.disagreement.perMetric.find((metric) => metric.metric === reach.metric)
          ?.halfSpread ?? 0;
      // The REAL LAB-015 authority computes the EV of delay (memoized per
      // declared request — identical requests evaluate once).
      const delayKey = JSON.stringify({ terms: delayTerms, seed });
      let ev = delayEvCache.get(delayKey);
      if (ev === undefined) {
        analysisCounter += 1;
        const analysisInput: DelayEvaluationInput = {
          scope: request.scope,
          id: `delay-analysis:program-compat-${analysisCounter}` as never,
          policyVersion: 1,
          seed,
          stateRefs: {
            humanTaskId: null,
            engineId: null,
            engineVersion: null,
            capability: null,
            providerId: null,
            providerVersion: null,
            organizationId: null,
            organizationVersion: null,
            transformId: null,
            transformVersion: null,
            scopeStatement: "the compat program-search delay wiring",
          },
          context: {
            dependency: "the program candidate's declared delay expectations",
            rewardSpecVersion: 1,
            deadline: null,
            options: DELAY_OPTION_KINDS.map((optionKind) =>
              optionKind === "wait"
                ? waitOptionOf(delayTerms)
                : {
                    optionKind,
                    applicable: false,
                    inapplicableReason:
                      "not applicable in this compat wiring (the wait option carries the candidate's declared delay expectations)",
                    target: null,
                    dimensions: null,
                  },
            ),
          },
        };
        const analysis = await delayPort.evaluateDelayDecision(analysisInput);
        if ("error" in analysis) {
          throw new Error(`compat delay decision failed: ${analysis.message}`);
        }
        const waitLine = analysis.lines.find((line) => line.optionKind === "wait");
        if (waitLine?.ev === null || waitLine?.ev === undefined) {
          throw new Error("compat delay decision produced no wait-option EV");
        }
        ev = {
          value: waitLine.ev.expectedValueOfDelay.amount,
          lower: waitLine.ev.interval.lower,
          upper: waitLine.ev.interval.upper,
        };
        delayEvCache.set(delayKey, ev);
      }
      return Object.freeze({
        expectedReward: reach.expectedValue,
        interval: Object.freeze({ lower: reach.interval.lower, upper: reach.interval.upper }),
        disagreementHalfWidth: disagreement,
        uncertainty: prediction.uncertainty,
        expectedValueOfDelay: Object.freeze({
          value: ev.value,
          interval: Object.freeze({ lower: ev.lower, upper: ev.upper }),
        }),
        ensembleId: prediction.ensembleId,
        ensembleVersion: prediction.ensembleVersion,
        simulatorVersion: prediction.simulatorVersion,
        rewardSpecVersion: SCENARIO.rewardVersion,
        counterfactual: true,
        disclosure: "disclosed-synthetic-ensemble-evaluation",
      });
    },
  };

  const search = createInMemoryProgramSearch({
    catalog,
    organizations: organizationSource,
    transforms,
    evaluation,
    now: NOW as never,
  });
  return { search, ensemble, delayPort };
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

test("the program search runs end-to-end over the REAL lab registry + REAL agents organizations", async () => {
  const stack = await composeRealProgramStack();
  const outcome = await stack.search.searchPrograms(compatSearchInput());
  if ("error" in outcome) {
    assert.fail(`expected a search result over the real stack: ${outcome.message}`);
  }
  // The no-op baseline is structurally present and composed from the REAL seams.
  assert.equal(outcome.noopBaseline.candidate.isNoopBaseline, true);
  assert.equal(outcome.ranked.length, outcome.budget.evaluationsConsumed);
  for (const entry of outcome.ranked) {
    assert.doesNotThrow(() => assertRequiredFields(entry.request, "ProductionRequest"));
    for (const step of entry.candidate.transformChain) {
      assert.match(step.definitionId as string, /^transform:compat-/);
    }
    if (entry.candidate.organization !== null) {
      assert.match(entry.candidate.organization.organizationId, /^organization:compat-/);
    }
  }
});

test("the §22 reward set + version pins come from the REAL LAB-007 ensemble prediction", async () => {
  const stack = await composeRealProgramStack();
  const outcome = await stack.search.searchPrograms(compatSearchInput());
  if ("error" in outcome) {
    assert.fail(`expected a search result: ${outcome.message}`);
  }
  for (const entry of outcome.ranked) {
    // Version pins from the REAL prediction surface.
    assert.equal(entry.provenance.ensembleId, ENSEMBLE_ID);
    assert.equal(entry.provenance.ensembleVersion, 1);
    assert.equal(entry.provenance.simulatorVersion, SCENARIO.simulatorVersion);
    assert.equal(entry.provenance.rewardSpecVersion, SCENARIO.rewardVersion);
    // The §22 set: the interval contains the estimate; the REAL member
    // disagreement (worlds at 12k vs 24k audience) is visible on PROGRAM
    // candidates, never hidden (the no-op action scores identically zero on
    // every member — zero disagreement, by construction).
    const { expectedReward, interval, disagreementHalfWidth } = entry.evaluation;
    assert.ok(interval.lower <= expectedReward && expectedReward <= interval.upper);
    if (entry.candidate.isNoopBaseline) {
      assert.equal(entry.evaluation.expectedReward, 0);
      assert.equal(disagreementHalfWidth, 0);
    } else {
      assert.ok(disagreementHalfWidth > 0, "the real two-member ensemble disagrees");
    }
  }
});

test("the §2 EV of delay is computed by the REAL LAB-015 authority (ev-delay-1)", async () => {
  const stack = await composeRealProgramStack();
  const outcome = await stack.search.searchPrograms(compatSearchInput());
  if ("error" in outcome) {
    assert.fail(`expected a search result: ${outcome.message}`);
  }
  // The declared delay terms: EV = p·V − D − A = 0.7·12 − 1.5 − 0.8 = 6.1
  // (computed by the REAL delay authority, quantized to 1e-10).
  for (const entry of outcome.ranked) {
    if (entry.candidate.isNoopBaseline) {
      assert.equal(entry.evaluation.expectedValueOfDelay.value, 0);
    } else {
      assert.equal(entry.evaluation.expectedValueOfDelay.value, 6.1);
      assert.ok(
        entry.evaluation.expectedValueOfDelay.interval.lower <= 6.1 &&
          6.1 <= entry.evaluation.expectedValueOfDelay.interval.upper,
      );
    }
  }
});

test("the search is deterministic over the REAL stack (inputs, seed, policy version)", async () => {
  const firstStack = await composeRealProgramStack();
  const secondStack = await composeRealProgramStack();
  const input = compatSearchInput();
  const first = await firstStack.search.searchPrograms(input);
  const second = await secondStack.search.searchPrograms(input);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
});

test("a search whose catalog is empty in a foreign scope fails closed through the REAL seams", async () => {
  const stack = await composeRealProgramStack();
  const failure = await stack.search.searchPrograms(
    compatSearchInput({ scope: { tenantId: "tenant:foreign" as never } }),
  );
  assert.ok("error" in failure);
  assert.equal(failure.error, "transform-unresolved");
});
