/**
 * The disclosed program-search composition seam (LAB-016) — NOT a
 * production composition root.
 *
 * Wires the disclosed in-memory seam doubles into a deterministic
 * contract-testing world (the W7-B compose-pawn-stack pattern):
 * - the transform catalog seam as a ONE-LINE DELEGATION over the W7-B
 *   transform-source double (one vocabulary store, two seam views —
 *   exactly how the composition root will delegate to the REAL
 *   LAB-011/012 registry);
 * - the organization source seam over LAB-010-style fixture descriptors
 *   (tenant-scoped; the foreign tenant carries its own);
 * - the program evaluation double (LAB-007-style §22 synthetic ensemble);
 * - the program search runtime itself.
 *
 * The REAL @mos/lab registry, the REAL @mos/agents organization registry
 * and the REAL LAB-007/LAB-015 surfaces replace the doubles behind the
 * SAME port types at the composition root (compat/program-search-compat.ts
 * pins the wiring type-checks; compat/program-real-stack.test.ts runs the
 * search against the REAL lab registry + REAL lab ensemble).
 */

import type {
  AgentOrganizationNode,
  CapabilityId,
  ConsentRef,
  EvaluatorRef,
  HumanProductionTaskId,
  MissionRef,
  ModelRef,
  PolicyRef,
  RightsRef,
  StudioFormatId,
  StrategyRef,
  TenantId,
  TenantScope,
  Timestamp,
  TransformId,
  Version,
} from "@mos/contracts";

import {
  createInMemoryTransformSource,
} from "../adapters/in-memory-transform-source.js";
import type {
  InMemoryTransformSourceDouble,
  PawnTransformDefinitionSeed,
} from "../adapters/in-memory-transform-source.js";
import type {
  ProgramTransformCatalogPort,
} from "../ports/program-transform-catalog.port.js";
import {
  createInMemoryProgramOrganizationSource,
} from "../adapters/in-memory-program-organization-source.js";
import type {
  ProgramOrganizationDescriptor,
} from "../ports/program-organization-source.port.js";
import type {
  InMemoryProgramOrganizationSourceDouble,
} from "../adapters/in-memory-program-organization-source.js";
import {
  createInMemoryProgramEvaluation,
} from "../adapters/in-memory-program-evaluation.js";
import type { ProgramEvaluationPort } from "../ports/program-evaluation.port.js";
import {
  createInMemoryProgramSearch,
} from "../adapters/in-memory-program-search.js";
import type { ProductionProgramSearchPort } from "../contracts/program-search-result.js";
import type {
  ProductionProgramSearchInput,
  ProductionProgramSearchPolicy,
} from "../contracts/program-search.js";
import type { CandidateProgram } from "../contracts/program-candidate.js";
import type {
  ProgramProductionModality,
} from "../contracts/program-candidate.js";
import type { PawnEngineToolBinding } from "../contracts/pawn-role.js";
import { SCOPE_ALPHA, SCOPE_BETA, SOURCE_VIDEO_REF, SOURCE_AUDIO_REF } from "./compose-pawn-stack.js";

// ---------------------------------------------------------------------------
// The deterministic fixture world
// ---------------------------------------------------------------------------

/** Fixed clock for deterministic tests (shared with the pawn stack). */
export const FIXED_NOW = (): Timestamp => "2026-01-01T00:00:00.000Z" as Timestamp;

/** The primary test tenant (the pawn stack fixture tenants). */
export const PROGRAM_TENANT_ALPHA: TenantId = SCOPE_ALPHA.tenantId;
export const PROGRAM_TENANT_BETA: TenantId = SCOPE_BETA.tenantId;
/** The fixture tenant scopes (re-exported for tenant-scoping tests). */
export const PROGRAM_SCOPE_BETA: TenantScope = SCOPE_BETA;

function capability(id: string, version = 1): { capabilityId: CapabilityId; version: Version } {
  return { capabilityId: id as CapabilityId, version: version as Version };
}

function engineBinding(
  capabilityId: string,
  engineId: string,
  engineVersion: number,
): PawnEngineToolBinding {
  return {
    capabilityId: capabilityId as CapabilityId,
    capabilityVersion: 1 as Version,
    engineId: engineId as never,
    engineVersion: engineVersion as Version,
  };
}

/** The fixture transform definitions (the LAB-011/012 vocabulary seeds). */
const TRANSFORM_SEEDS: readonly PawnTransformDefinitionSeed[] = [
  {
    id: "transform:clip-highlights" as TransformId,
    tenantId: PROGRAM_TENANT_ALPHA,
    version: 1 as Version,
    kind: "clip",
    inputTypes: ["video"],
    outputTypes: ["video"],
    parameters: { type: "object", properties: { clipCount: { type: "number" } } },
    capabilityRequirements: [capability("rank_clip_candidates")],
    evaluator: "evaluator:transform/clip-highlights" as EvaluatorRef,
    costModel: { basis: "per-invocation", amount: 0.1, currency: "USD" },
    latencyModel: { p50Ms: 2_000, p95Ms: 8_000, p99Ms: 20_000 },
    rightsRequirements: ["rights:producer-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:clip-parents"],
  },
  {
    id: "transform:reaction-pip" as TransformId,
    tenantId: PROGRAM_TENANT_ALPHA,
    version: 1 as Version,
    kind: "reaction",
    inputTypes: ["video"],
    outputTypes: ["video"],
    parameters: { type: "object", properties: { layout: { type: "string" } } },
    capabilityRequirements: [capability("compose_reaction")],
    evaluator: "evaluator:transform/reaction-pip" as EvaluatorRef,
    costModel: { basis: "per-invocation", amount: 0.2, currency: "USD" },
    latencyModel: { p50Ms: 5_000, p95Ms: 20_000, p99Ms: 60_000 },
    rightsRequirements: ["rights:producer-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:reaction-parents"],
  },
  {
    id: "transform:semantic-highlights" as TransformId,
    tenantId: PROGRAM_TENANT_ALPHA,
    version: 1 as Version,
    kind: "compilation",
    inputTypes: ["audio"],
    outputTypes: ["video"],
    parameters: { type: "object", properties: { highlightCount: { type: "number" } } },
    capabilityRequirements: [capability("transcribe_audio"), capability("rank_clip_candidates")],
    evaluator: "evaluator:transform/semantic-highlights" as EvaluatorRef,
    costModel: { basis: "per-invocation", amount: 0.25, currency: "USD" },
    latencyModel: { p50Ms: 4_000, p95Ms: 15_000, p99Ms: 45_000 },
    rightsRequirements: ["rights:producer-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:highlight-parents"],
  },
  {
    id: "transform:noop-repost" as TransformId,
    tenantId: PROGRAM_TENANT_ALPHA,
    version: 1 as Version,
    kind: "no-op-repost",
    inputTypes: ["video", "audio"],
    outputTypes: ["video", "audio"],
    parameters: { type: "object", properties: {} },
    capabilityRequirements: [],
    evaluator: "evaluator:transform/noop-repost" as EvaluatorRef,
    costModel: { basis: "per-invocation", amount: 0, currency: "USD" },
    latencyModel: { p50Ms: 100, p95Ms: 500, p99Ms: 1_000 },
    rightsRequirements: ["rights:producer-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:identity"],
  },
  {
    id: "transform:beta-only" as TransformId,
    tenantId: PROGRAM_TENANT_BETA,
    version: 1 as Version,
    kind: "crop-reframe",
    inputTypes: ["video"],
    outputTypes: ["video"],
    parameters: { type: "object", properties: { aspect: { type: "string" } } },
    capabilityRequirements: [capability("reframe_video")],
    evaluator: "evaluator:transform/beta-only" as EvaluatorRef,
    costModel: { basis: "per-invocation", amount: 0.05, currency: "USD" },
    latencyModel: { p50Ms: 1_000, p95Ms: 4_000, p99Ms: 9_000 },
    rightsRequirements: ["rights:beta-source-grant" as RightsRef],
    policyRequirements: ["policy:production-default" as PolicyRef],
    lineageRules: ["lineage:crop-parents"],
  },
];

function organizationFixture(
  id: string,
  tenantId: TenantId,
  bodyIds: readonly string[],
  version: number,
): ProgramOrganizationDescriptor {
  return {
    id,
    version: version as Version,
    tenantId,
    nodes: bodyIds.map((bodyId, index) => ({
      nodeId: `${id}:node-${index + 1}`,
      bodyId: bodyId as AgentOrganizationNode["bodyId"],
    })),
    edges: [],
    modelAssignments: [],
    memoryPolicy: { scope: "session" },
    budgetPolicy: {
      organization: { maxCost: { amount: 100, currency: "USD" }, maxDurationMs: 3_600_000 },
      perNode: { maxCost: { amount: 50, currency: "USD" }, maxDurationMs: 1_800_000 },
    },
    terminationPolicy: { maxIterations: 8, timeoutMs: 600_000 },
    evaluator: `evaluator:organization/${id}`,
    criticNodeIds: bodyIds.length > 1 ? [`${id}:node-1`] : [],
    executionOrdering: "sequential",
  };
}

const ORGANIZATION_SEEDS: readonly ProgramOrganizationDescriptor[] = [
  organizationFixture("organization:fixture-solo", PROGRAM_TENANT_ALPHA, ["agent-body:fixture-editor"], 1),
  organizationFixture(
    "organization:fixture-duo",
    PROGRAM_TENANT_ALPHA,
    ["agent-body:fixture-editor", "agent-body:fixture-critic"],
    2,
  ),
  organizationFixture("organization:fixture-beta", PROGRAM_TENANT_BETA, ["agent-body:fixture-beta"], 1),
];

// ---------------------------------------------------------------------------
// The declared search frames (policy + input fixtures)
// ---------------------------------------------------------------------------

/** The fixture engine vocabulary (registry vocabulary, exact versions). */
export const ENGINE_VOCABULARY: readonly PawnEngineToolBinding[] = [
  engineBinding("rank_clip_candidates", "engine:clip-ranker", 3),
  engineBinding("compose_reaction", "engine:reaction-composer", 2),
  engineBinding("transcribe_audio", "engine:transcriber", 5),
];

/** The fixture search policy (v1 — the declared vocabulary set). */
export const FIXTURE_POLICY: ProductionProgramSearchPolicy = Object.freeze({
  version: 1,
  maxChainSteps: 3,
  parameterPresetVocabulary: ["balanced", "aggressive", "conservative"],
  modalityVocabulary: [
    "automated",
    "studio",
    "human-arena",
    "hybrid",
  ] as readonly ProgramProductionModality[],
  modelVocabulary: ["mos-model:pawn-default" as ModelRef, "mos-model:pawn-premium" as ModelRef],
  engineVocabulary: ENGINE_VOCABULARY,
  qualityFloorLadder: [0.5, 0.65, 0.8],
  budgetScaleFactor: 2,
  expectedDurationLadderMs: [60_000, 300_000, 900_000],
  waitHorizonLadderMs: [0, 30_000, 120_000],
  maxRetriesCap: 2,
  seedCount: 3,
  plateauWindow: 2,
  improvementTolerance: 0.01,
  pruning: "interval-dominance",
});

/** The LAB-014 human production task refs fixture (BY REFERENCE ONLY). */
export const HUMAN_TASK_VOCABULARY: readonly HumanProductionTaskId[] = [
  "human-task:fixture-reaction-capture" as HumanProductionTaskId,
  "human-task:fixture-voice-over" as HumanProductionTaskId,
];

/** The studio-format vocabulary fixture. */
export const STUDIO_FORMAT_VOCABULARY: readonly StudioFormatId[] = [
  "studio-format:reaction-video" as StudioFormatId,
  "studio-format:audio-podcast" as StudioFormatId,
];

/** The declared §18 delay expectations fixture (provenance-cited). */
export const FIXTURE_DELAY_EXPECTATION = Object.freeze({
  expectedIncrementalValue: 12,
  estimatedWaitMs: 30_000,
  delayCost: 1.5,
  acquisitionCost: 0.8,
  successProbability: 0.7,
  qualityImpact: -0.1,
  provenance: {
    kind: "delay-analysis",
    analysisId: "delay-analysis:fixture-001",
    analysisVersion: 1,
  } as const,
});

/** Builds a valid search input over the fixture world. */
export function fixtureSearchInput(
  overrides: Partial<ProductionProgramSearchInput> = {},
): ProductionProgramSearchInput {
  return {
    scope: SCOPE_ALPHA,
    missionRef: "mission:fixture-growth" as MissionRef,
    strategyRef: "strategy:fixture-reaction-loops" as StrategyRef,
    objective: "Produce reaction-video program candidates from the fixture source video",
    sourceArtifactRefs: [SOURCE_VIDEO_REF, SOURCE_AUDIO_REF],
    rightsContext: {
      rightsRefs: ["rights:producer-source-grant" as RightsRef],
      consentRefs: ["consent:producer-1" as ConsentRef],
    },
    returnContract: { type: "object", properties: { output: { type: "string" } } },
    studioFormatVocabulary: STUDIO_FORMAT_VOCABULARY,
    humanTaskVocabulary: HUMAN_TASK_VOCABULARY,
    delayExpectation: FIXTURE_DELAY_EXPECTATION,
    deadlineAnchor: "2026-06-01T00:00:00.000Z" as Timestamp,
    baseBudget: { maxCost: { amount: 25, currency: "USD" }, maxDurationMs: 1_800_000 },
    qualityEvaluatorRef: "evaluator:quality/program-outputs" as EvaluatorRef,
    substitutionPreference: ["engine", "transform", "reduced-scope"],
    policy: FIXTURE_POLICY,
    budget: { maxCandidateEvaluations: 30, maxIterations: 4 },
    seed: 20260601,
    ...overrides,
  };
}

/** Builds one hand-designed candidate program over the fixture world. */
export function handDesignedProgram(
  overrides: Partial<CandidateProgram> = {},
): CandidateProgram {
  return {
    isNoopBaseline: false,
    transformChain: [
      {
        definitionId: "transform:reaction-pip" as TransformId,
        definitionVersion: 1 as Version,
        parameterPreset: "aggressive",
        parameters: { preset: "aggressive" },
      },
    ],
    modality: "studio",
    studioFormat: "studio-format:reaction-video" as StudioFormatId,
    organization: { organizationId: "organization:fixture-duo", organizationVersion: 2 as Version },
    pawnAgents: ["reaction-composition", "quality-critic"],
    modelAssignments: [],
    enginePortfolio: [engineBinding("compose_reaction", "engine:reaction-composer", 2)],
    humanTasks: [],
    capabilityAcquisition: [
      { requirement: capability("compose_reaction"), mode: "engine" as const },
    ],
    qualityThresholds: { floor: 0.65, evaluatorRef: "evaluator:quality/program-outputs" as EvaluatorRef },
    budget: { maxCost: { amount: 40, currency: "USD" }, maxDurationMs: 900_000 },
    deadline: "2026-06-01T00:15:00.000Z" as Timestamp,
    expectedDurationMs: 900_000,
    delayPolicy: { maxWaitMs: 30_000, onDelayExceeded: "substitute" as const },
    delayExpectation: FIXTURE_DELAY_EXPECTATION,
    stoppingPolicy: { maxRetries: 1, substitutionPreference: ["engine", "transform", "reduced-scope"] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The composed stack
// ---------------------------------------------------------------------------

/** Options for {@link composeProgramSearchStack}. */
export interface ComposeProgramSearchStackOptions {
  /** Injectable clock (deterministic tests). */
  readonly now?: () => Timestamp;
  /** Extra transform definitions seeded into the vocabulary store. */
  readonly extraTransforms?: readonly PawnTransformDefinitionSeed[];
  /** Extra organization descriptors seeded into the source double. */
  readonly extraOrganizations?: readonly ProgramOrganizationDescriptor[];
  /** Overrides the evaluation double (failure-path tests). */
  readonly evaluationOverride?: ProgramEvaluationPort;
}

/** The composed program search stack (the disclosed in-memory world). */
export interface ComposedProgramSearchStack {
  /** The production program search port. */
  readonly search: ProductionProgramSearchPort;
  /** The disclosed seam doubles (inspection + fixture registration). */
  readonly doubles: {
    readonly transforms: InMemoryTransformSourceDouble;
    /** The catalog seam (a one-line delegation over the vocabulary store). */
    readonly catalog: ProgramTransformCatalogPort;
    readonly organizations: InMemoryProgramOrganizationSourceDouble;
    readonly evaluation: ProgramEvaluationPort;
  };
}

/** Composes the disclosed program search stack. */
export function composeProgramSearchStack(
  options: ComposeProgramSearchStackOptions = {},
): ComposedProgramSearchStack {
  const now = options.now ?? FIXED_NOW;

  // The vocabulary store (the W7-B transform-source double) + the catalog
  // seam as a ONE-LINE DELEGATION over it (the composition-root shape —
  // the REAL registry sits behind the same view at the composition root).
  const transforms = createInMemoryTransformSource({
    definitions: [...TRANSFORM_SEEDS, ...(options.extraTransforms ?? [])],
  });
  const catalog: ProgramTransformCatalogPort = {
    listPromotedTransforms: async (scope) => transforms.listLatest(scope),
  };

  // The organization source double (tenant-scoped LAB-010-style descriptors).
  const organizations = createInMemoryProgramOrganizationSource({
    seeds: [...ORGANIZATION_SEEDS, ...(options.extraOrganizations ?? [])],
  });

  // The program evaluation double (LAB-007-style §22 synthetic ensemble).
  const evaluation =
    options.evaluationOverride ?? createInMemoryProgramEvaluation({});

  // The search runtime.
  const search = createInMemoryProgramSearch({
    catalog,
    organizations,
    transforms,
    evaluation,
    now,
  });

  return {
    search,
    doubles: { transforms, catalog, organizations, evaluation },
  };
}
