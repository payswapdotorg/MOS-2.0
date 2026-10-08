/**
 * REAL-stack integration test (LAB-017) — the RUNTIME half of the
 * benchmark production-seam compatibility pins (the compile-time half
 * lives in compat/benchmark-production-compat.ts).
 *
 * Runs the REAL `@mos/production` PROGRAM SEARCH (LAB-016) over its
 * declared seams — the REAL `@mos/lab` transform-definition registry
 * behind the catalog + resolve one-line delegations, a REAL
 * `@mos/agents` organization behind the organization-source seam, and the
 * production package's OWN shipped disclosed evaluation double for the
 * search-side estimate — then flows its ranked output through THIS
 * package's robust marketing benchmark (the declared ACTION SEAM: the
 * documented composition-seam mapping of the production candidate onto
 * the LAB-004 `StrategyActionCandidate` knobs, with producing-surface
 * version pins carried as provenance), evaluated over the REAL LAB-007
 * world-model ensemble stack that is this package's own engine.
 *
 * DISCLOSED: the search-side candidate estimate uses the production
 * package's shipped disclosed in-memory evaluation double (its own
 * documented synthetic response function — the REAL-lab-ensemble binding
 * behind that seam is the production package's own compat battery's
 * subject, already covered on main); the BENCHMARK side — the surface
 * under test here — evaluates every candidate through the REAL LAB-007
 * ensemble over the REAL LAB-004 simulator engine. Production's own no-op
 * baseline is NOT re-supplied as a caller candidate: the benchmark
 * synthesizes its own (the W8-B reserved-identity discipline, pinned
 * in-package).
 *
 * The result: a ranked, uncertainty-labeled, counterfactual benchmark
 * record with the structurally-present no-op baseline, the fairness pin,
 * full provenance and the §24 statement — deterministic given (inputs,
 * policy version, seeds).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { LabScenario, StrategyRef, TenantScope, Timestamp } from "@mos/contracts";

// THIS package's public surface (built).
import {
  createInMemoryMarketingBenchmark,
  createInMemorySocialWorldModelStore,
  createInMemorySimulatorEngine,
  createInMemoryEnsemble,
  createInMemoryTransformDefinitionRegistry,
} from "../dist/index.js";
import type {
  BenchmarkCandidate,
  MarketingBenchmarkPort,
  MarketingBenchmarkInput,
  RobustBenchmarkRecord,
  RobustnessPolicy,
} from "../dist/index.js";

// REAL sibling packages (relative dist paths — the same public surfaces
// the bare specifiers resolve to after `tsc -b`; no runtime dependency of
// this package is created).
import {
  createInMemoryAgentBodyRegistry,
  createInMemoryOrganizationRegistry,
} from "../../mos-agents/dist/index.js";
import {
  createInMemoryProgramSearch,
  createInMemoryProgramEvaluation,
  TRANSFORM_PAWN_BODIES,
} from "../../mos-production/dist/index.js";
import type {
  ProductionProgramSearchInput,
  ProductionProgramSearchPolicy,
  ProgramOrganizationDescriptor,
  ProgramOrganizationSourcePort,
  RankedCandidateProgram,
} from "../../mos-production/dist/index.js";

const NOW = (): Timestamp => "2026-01-01T00:00:00.000Z" as never;
const SCOPE: TenantScope = { tenantId: "tenant:benchmark-compat" as never };

// ---------------------------------------------------------------------------
// The REAL lab fixture world (scenario, world models, two ensembles)
// ---------------------------------------------------------------------------

const SCENARIO: LabScenario = {
  id: "scenario-benchmark-compat" as never,
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
  id: "world-benchmark-a" as never,
  niche: "sourdough-baking",
  platform: "short-video",
  state: { baseAudience: 12_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
  notes: "compat member A (audience 12k)",
};

const WORLD_B = {
  id: "world-benchmark-b" as never,
  niche: "sourdough-baking",
  platform: "short-video",
  state: { baseAudience: 24_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
  notes: "compat member B (audience 24k)",
};

const WORLD_C = {
  id: "world-benchmark-c" as never,
  niche: "sourdough-baking",
  platform: "short-video",
  state: { baseAudience: 30_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
  notes: "compat member C (audience 30k)",
};

const FULL_COVERAGE = {
  cadencePerWeek: { min: 0, max: 14 },
  novelty: { min: 0, max: 1 },
  engagementEffort: { min: 0, max: 1 },
};

const PRIMARY_ENSEMBLE_ID = "ensemble-benchmark-compat" as never;
const ALT_ENSEMBLE_ID = "ensemble-benchmark-compat-alt" as never;

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

function compatSearchInput(
  overrides: Partial<ProductionProgramSearchInput> = {},
): ProductionProgramSearchInput {
  return {
    scope: SCOPE,
    missionRef: "mission:benchmark-compat" as never,
    strategyRef: "strategy:benchmark-compat" as never,
    objective: "Produce reaction-video program candidates from the compat source video",
    sourceArtifactRefs: [
      {
        artifactId: "artifact:benchmark-compat-source" as never,
        version: 1 as never,
        tenantId: SCOPE.tenantId,
        digest: "sha256:benchmark-compat-source" as never,
        type: "video" as never,
        storageRef: "storage://benchmark-compat/source-video" as never,
        rightsRef: "rights:benchmark-compat-grant" as never,
        provenanceRef: "provenance:benchmark-compat/source-video" as never,
      },
    ],
    rightsContext: {
      rightsRefs: ["rights:benchmark-compat-grant" as never],
      consentRefs: ["consent:benchmark-compat-producer" as never],
    },
    returnContract: { type: "object", properties: { output: { type: "string" } } },
    studioFormatVocabulary: [
      "studio-format:reaction-video" as never,
      "studio-format:audio-podcast" as never,
    ],
    humanTaskVocabulary: ["human-task:benchmark-compat-reaction-capture" as never],
    delayExpectation: {
      expectedIncrementalValue: 12,
      estimatedWaitMs: 30_000,
      delayCost: 1.5,
      acquisitionCost: 0.8,
      successProbability: 0.7,
      qualityImpact: -0.1,
      provenance: {
        kind: "delay-analysis",
        analysisId: "delay-analysis:benchmark-compat-001",
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
// The declared action-seam mapping (the documented composition-seam view)
// ---------------------------------------------------------------------------

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The DOCUMENTED composition-seam mapping of one production candidate onto
 * the LAB-004 knobs (the formulas the production package documents for its
 * own action mapping — mirrored here as the composition root binds them):
 * cadence = 1 + min(chainDepth,5) + (studio|hybrid ? 1 : 0); novelty and
 * engagement from the chain/pawn/human/portfolio composition. The no-op
 * baseline maps to the ZERO-KNOB first-class no-op action.
 */
function mappedActionOf(ranked: RankedCandidateProgram): {
  strategyRef: StrategyRef;
  kind: "no-op" | "content";
  cadencePerWeek: number;
  novelty: number;
  engagementEffort: number;
} {
  const candidate = ranked.candidate;
  if (candidate.isNoopBaseline) {
    return {
      strategyRef: `strategy:benchmark-compat-noop` as never,
      kind: "no-op",
      cadencePerWeek: 0,
      novelty: 0,
      engagementEffort: 0,
    };
  }
  const chainDepth = candidate.transformChain.length;
  const distinctPresets = new Set(
    candidate.transformChain.map((step) => step.parameterPreset),
  ).size;
  const pawnCount = candidate.pawnAgents.length;
  const humanTaskCount = candidate.humanTasks.length;
  const portfolioSize = candidate.enginePortfolio.length;
  return {
    strategyRef: `strategy:benchmark-compat-${ranked.rank}` as never,
    kind: "content",
    cadencePerWeek:
      1 +
      Math.min(chainDepth, 5) +
      (candidate.modality === "studio" || candidate.modality === "hybrid" ? 1 : 0),
    novelty: clamp01(
      0.12 * chainDepth + 0.08 * distinctPresets + 0.06 * pawnCount + 0.05 * humanTaskCount,
    ),
    engagementEffort: clamp01(0.15 * humanTaskCount + 0.05 * pawnCount + 0.04 * portfolioSize),
  };
}

/**
 * Maps one REAL production search entry onto a benchmark candidate. The
 * production no-op baseline maps to `null` — the benchmark synthesizes its
 * OWN baseline (the reserved-identity discipline).
 */
function benchmarkCandidateOf(ranked: RankedCandidateProgram): BenchmarkCandidate | null {
  if (ranked.candidate.isNoopBaseline) {
    return null;
  }
  return {
    key: `program-r${ranked.rank}`,
    action: mappedActionOf(ranked),
    horizonSteps: 2,
    source: {
      origin: "production-search",
      producerPins: [
        { surface: "production-program-search", version: ranked.provenance.policyVersion },
        {
          surface: "production-program-search-evaluation",
          version: ranked.provenance.rewardSpecVersion,
        },
      ],
      note: `production program-search candidate (rank ${ranked.rank}) through the declared action seam`,
    },
    label: `production program candidate #${ranked.rank}`,
  };
}

// ---------------------------------------------------------------------------
// The composed REAL stacks
// ---------------------------------------------------------------------------

async function composeRealProductionSearch() {
  // REAL LAB-011/012: the transform-definition registry behind the catalog
  // + resolve one-line delegations.
  const labRegistry = createInMemoryTransformDefinitionRegistry({ now: NOW as never });
  for (const input of [
    makeDefinitionInput("transform:benchmark-compat-clips", "clip", ["rank_clip_candidates"], "video"),
    makeDefinitionInput("transform:benchmark-compat-reaction", "reaction", ["rank_clip_candidates"], "video"),
    makeDefinitionInput("transform:benchmark-compat-podcast", "podcast", ["transcribe_audio", "generate_questions"], "audio"),
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
    ) => labRegistry.getTransformDefinition(scope, definitionId, version),
  };

  // REAL @mos/agents: body registry (the ten §9 pawn bodies) + one
  // organization behind the organization-source seam.
  const bodies = createInMemoryAgentBodyRegistry();
  for (const pawn of TRANSFORM_PAWN_BODIES) {
    bodies.register(pawn.agentBody);
  }
  const organizations = createInMemoryOrganizationRegistry({ bodyRegistry: bodies });
  const organizationRecord = {
    id: "organization:benchmark-compat-solo" as never,
    version: 1 as never,
    tenantId: SCOPE.tenantId,
    nodes: [
      { nodeId: "producer", role: "producer", bodyId: "pawn:podcast-interviewer" as never },
    ],
    edges: [],
    modelAssignments: [
      { nodeId: "producer", modelRef: "mos-model:pawn-default" as never },
    ],
    memoryPolicy: { scope: "session" as never, sharing: "shared" as never },
    budgetPolicy: {
      organization: { maxCost: { amount: 100, currency: "USD" }, maxDurationMs: 3_600_000 },
      perNode: { maxCost: { amount: 50, currency: "USD" }, maxDurationMs: 1_800_000 },
    },
    terminationPolicy: { maxIterations: 8, timeoutMs: 600_000 },
    evaluator: "evaluator:organization/benchmark-compat-solo",
  };
  organizations.registerOrganization(SCOPE, organizationRecord);
  const organizationSource: ProgramOrganizationSourcePort = {
    async listOrganizations(scope) {
      const descriptors: ProgramOrganizationDescriptor[] = [];
      for (const id of organizations.listOrganizationIds(scope)) {
        const versions = organizations.listVersions(scope, id);
        const latest =
          versions.length > 0 ? Math.max(...(versions as readonly number[])) : undefined;
        const record =
          latest === undefined
            ? undefined
            : organizations.getOrganization(scope, id, latest as never);
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

  // The search-side evaluation seam: the production package's OWN shipped
  // disclosed double (see the file docblock — the REAL-lab-ensemble binding
  // behind THIS seam is the production compat battery's subject).
  const evaluation = createInMemoryProgramEvaluation();

  const search = createInMemoryProgramSearch({
    catalog,
    organizations: organizationSource,
    transforms,
    evaluation,
    now: NOW as never,
  });
  return { search };
}

async function composeRealBenchmarkStack(): Promise<{
  readonly benchmark: MarketingBenchmarkPort;
  readonly input: (candidates: readonly BenchmarkCandidate[]) => MarketingBenchmarkInput;
}> {
  // REAL LAB-007: world models + simulator engine + two two-member
  // ensembles (the multi-world axis), all full coverage.
  const worldModels = createInMemorySocialWorldModelStore({ now: NOW as never });
  const simulator = createInMemorySimulatorEngine({ worldModels, now: NOW as never });
  for (const draft of [WORLD_A, WORLD_B, WORLD_C]) {
    const registered = await worldModels.registerWorldModel({ scope: SCOPE, worldModel: draft });
    if ("error" in registered) {
      throw new Error(`compat world registration failed: ${registered.message}`);
    }
  }
  const ensemble = createInMemoryEnsemble({ simulator, now: NOW as never });
  for (const ensembleId of [PRIMARY_ENSEMBLE_ID, ALT_ENSEMBLE_ID]) {
    const registered = await ensemble.registerEnsemble({
      scope: SCOPE,
      ensemble: {
        id: ensembleId,
        niche: "sourdough-baking",
        platform: "short-video",
        members:
          ensembleId === PRIMARY_ENSEMBLE_ID
            ? [
                { id: "member-a", worldModelId: WORLD_A.id, worldModelVersion: 1, coverage: FULL_COVERAGE, notes: null },
                { id: "member-b", worldModelId: WORLD_B.id, worldModelVersion: 1, coverage: FULL_COVERAGE, notes: null },
              ]
            : [
                { id: "member-c", worldModelId: WORLD_C.id, worldModelVersion: 1, coverage: FULL_COVERAGE, notes: null },
                { id: "member-d", worldModelId: WORLD_A.id, worldModelVersion: 1, coverage: FULL_COVERAGE, notes: null },
              ],
        weightingPolicy: {
          id: `policy-uniform-${ensembleId === PRIMARY_ENSEMBLE_ID ? "primary" : "alt"}`,
          version: 1,
          kind: "uniform",
          note: "compat uniform weighting",
        },
        notes: "compat benchmark ensemble",
      },
    });
    if ("error" in registered) {
      throw new Error(`compat ensemble registration failed: ${registered.message}`);
    }
  }

  const benchmark = createInMemoryMarketingBenchmark({ ensemble, now: NOW });
  const policy: RobustnessPolicy = Object.freeze({
    id: "policy-benchmark-compat",
    version: 1,
    seedBudget: 3,
    worldModelSet: [
      { ensembleId: PRIMARY_ENSEMBLE_ID, ensembleVersion: 1, label: "primary" },
      { ensembleId: ALT_ENSEMBLE_ID, ensembleVersion: 1, label: "pessimistic" },
    ],
    sweepDimensions: ["seed", "world-model"] as const,
    aggregation: "pooled-mean",
    tieBreak: "expected-desc-halfwidth-asc-key-asc",
    note: "compat policy: 3-seed sweep over the two-ensemble compat world set, pooled mean",
  });
  const input = (candidates: readonly BenchmarkCandidate[]): MarketingBenchmarkInput => ({
    scope: SCOPE,
    benchmarkId: "bench-benchmark-compat" as never,
    scenario: SCENARIO,
    candidates,
    rewardSpec: {
      version: 1,
      terms: [
        {
          metric: "qualified-reach",
          weight: 1,
          direction: "maximize",
          definition: "maximize predicted qualified reach over the compat horizon",
          metricSource: "qualified-reach",
        },
      ],
    },
    policy,
    seeds: [11, 22, 33],
  });
  return { benchmark, input };
}

/** Compose the full real stack and return the benchmark record over the search output. */
async function runCompatBenchmark(): Promise<{
  readonly record: RobustBenchmarkRecord;
  readonly mappedCount: number;
  readonly searchRanked: readonly RankedCandidateProgram[];
}> {
  const { search } = await composeRealProductionSearch();
  const outcome = await search.searchPrograms(compatSearchInput());
  if ("error" in outcome) {
    throw new Error(`compat program search failed: ${outcome.message}`);
  }
  const candidates = outcome.ranked
    .map((entry) => benchmarkCandidateOf(entry))
    .filter((candidate): candidate is BenchmarkCandidate => candidate !== null);
  const { benchmark, input } = await composeRealBenchmarkStack();
  const result = await benchmark.runBenchmark(input(candidates));
  if ("error" in result) {
    throw new Error(`compat benchmark run failed: ${result.message}`);
  }
  return { record: result, mappedCount: candidates.length, searchRanked: outcome.ranked };
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

test("the REAL production program search flows through the declared action seam into this benchmark", async () => {
  const { record, mappedCount, searchRanked } = await runCompatBenchmark();

  // the search produced real candidates (its own baseline included) and at
  // least one NON-baseline program mapped through the seam.
  assert.ok(searchRanked.length >= 2, "the real search must rank its baseline + programs");
  assert.ok(mappedCount >= 1, "at least one production program must map through the seam");

  // every mapped production candidate is ranked; the synthesized no-op
  // baseline is STRUCTURALLY present (the production baseline is not
  // re-supplied — the benchmark's own baseline carries the reserved origin).
  assert.equal(record.ranked.length, mappedCount + 1);
  assert.equal(record.comparison.noopBaseline.origin, "no-op-baseline");
  assert.equal(record.comparison.declared.length, mappedCount);
  for (const entry of record.comparison.declared) {
    assert.equal(entry.origin, "production-search");
    assert.match(entry.key, /^program-r\d+$/);
    // the producing-surface version pins ride as provenance (data, never interpreted).
    assert.deepEqual(entry.provenance.candidateSource.producerPins, [
      { surface: "production-program-search", version: 1 },
      { surface: "production-program-search-evaluation", version: 1 },
    ]);
    // the mapped action knobs stay within the LAB-004 contract.
    assert.ok(entry.candidate.action.cadencePerWeek >= 0);
    assert.ok(entry.candidate.action.novelty >= 0 && entry.candidate.action.novelty <= 1);
    assert.ok(
      entry.candidate.action.engagementEffort >= 0 && entry.candidate.action.engagementEffort <= 1,
    );
  }
});

test("production-driven benchmark records carry the full §22 set + the fairness pin", async () => {
  const { record } = await runCompatBenchmark();

  // the fairness pin: same seeds/worlds/policy/reward for every candidate.
  assert.equal(
    record.fairness.statement,
    "every candidate in this benchmark was evaluated under the same seeds, world-model set, policy version and reward spec version — no per-candidate condition cherry-picking",
  );
  assert.deepEqual(record.fairness.seeds, [11, 22, 33]);
  assert.deepEqual(
    record.fairness.worldModelSet.map((ref) => `${ref.ensembleId}@${ref.ensembleVersion}`),
    [`${PRIMARY_ENSEMBLE_ID as string}@1`, `${ALT_ENSEMBLE_ID as string}@1`],
  );

  for (const entry of record.ranked) {
    const { expectedReward, interval, breakdown, seedRobustness, disagreement, worldRobustness } =
      entry.evaluation;
    assert.ok(interval.lower <= expectedReward && expectedReward <= interval.upper);
    assert.equal(breakdown.formula, "bench-additive-v1");
    assert.equal(
      breakdown.totalHalfWidth,
      breakdown.memberDisagreementHalfWidth +
        breakdown.seedRobustnessHalfWidth +
        breakdown.worldModelSpreadHalfWidth,
    );
    assert.deepEqual(seedRobustness.seeds, [11, 22, 33]);
    // multi-world axis: both compat ensembles evaluated, per-world member
    // disagreement visible (the content candidates differ across members).
    assert.equal(worldRobustness.perWorld.length, 2);
    assert.equal(disagreement.perWorld.length, 2);
    if (entry.origin === "production-search") {
      assert.ok(disagreement.worstHalfWidth > 0, "the real two-member ensembles disagree");
    }
    // per-candidate provenance pins the same conditions.
    assert.deepEqual(entry.provenance.seeds, [11, 22, 33]);
    assert.equal(entry.provenance.worldModels.length, 2);
  }
  // run-level provenance: the versions that produced every number.
  assert.equal(record.provenance.simulatorVersion, 1);
  assert.equal(record.provenance.rewardSpecVersion, 1);
  assert.equal(record.provenance.worldModels.length, 2);
});

test("§24 boundary statement + calibration-pending declaration on the production-driven record", async () => {
  const { record } = await runCompatBenchmark();

  assert.equal(
    record.labOnly,
    "robust benchmark output informs selection only — it is NOT deployment evidence; the real-experiment boundary (§24) is the only path to reality-grade proof",
  );
  assert.equal(record.counterfactual, true);
  assert.equal(record.disclosure, "robust-benchmark-over-disclosed-synthetic-ensembles");
  assert.equal(record.calibration.status, "pending-reality");
  assert.deepEqual(Object.keys(record.calibration).sort(), [
    "predictionSurface",
    "provenance",
    "status",
  ]);
  for (const entry of record.ranked) {
    assert.equal(entry.evaluation.calibration.status, "pending-reality");
    assert.equal(entry.evaluation.counterfactual, true);
  }
});

test("the composed real stack is deterministic (fresh stacks reproduce the digest)", async () => {
  const first = await runCompatBenchmark();
  const second = await runCompatBenchmark();
  assert.equal(first.mappedCount, second.mappedCount);
  assert.equal(first.record.resultDigest, second.record.resultDigest);
  assert.deepEqual(first.record.ranked.map((entry) => entry.key), second.record.ranked.map((entry) => entry.key));
});
