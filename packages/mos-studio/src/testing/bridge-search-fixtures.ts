/**
 * DISCLOSED BRIDGE-001 search-world fixtures (extracted from
 * bridge-fixtures.ts — the file-length policy, behavior-identical): the
 * REAL production program search (LAB-016's own
 * `createInMemoryProgramSearch` from `@mos/production`, runtime-resolved
 * through the built `dist/` entrypoint exactly like compose-editing-stack.ts)
 * over its OWN disclosed seam doubles (the transform catalog delegation, the
 * organization source, the program evaluation double).
 *
 * The fixture world (one tenant, two source artifacts, one producing
 * organization, the reaction transform vocabulary) is DATA: no real
 * tenant/organization/transform is implied. The REAL-lab wiring behind these
 * same seams is compat-pinned in mos-production's own battery
 * (compat/program-real-stack.test.ts).
 */

import {
  createInMemoryProgramEvaluation,
  createInMemoryProgramOrganizationSource,
  createInMemoryProgramSearch,
  createInMemoryTransformSource,
} from "@mos/production";
import type {
  ProgramOrganizationDescriptor,
  ProgramTransformCatalogPort,
  ProductionProgramSearchPolicy,
  ProductionProgramSearchResult,
  ProductionProgramSearchInput,
  CandidateProgram,
  ProgramProductionModality,
  RankedCandidateProgram,
} from "@mos/production";
import type {
  ArtifactRef,
  CapabilityId,
  ContentDigest,
  EvaluatorRef,
  HumanProductionTaskId,
  StudioFormatId,
  StrategyRef,
  Timestamp,
  TransformId,
  Version,
} from "@mos/contracts";

import {
  BRIDGE_CONSENT_REF,
  BRIDGE_MISSION_REF,
  BRIDGE_NOW,
  BRIDGE_POLICY_REF,
  BRIDGE_RIGHTS_REF,
  BRIDGE_SCOPE,
  BRIDGE_TENANT,
} from "./bridge-world-refs.js";

// ---------------------------------------------------------------------------
// The source artifacts (§27: rights ride explicit refs, never URLs)
// ---------------------------------------------------------------------------

function digestOf(seed: string): ContentDigest {
  return `sha256:${seed.padEnd(64 - 7, "0")}` as ContentDigest;
}

function artifactRefOf(
  artifactId: string,
  digestSeed: string,
  type: "video" | "audio",
): ArtifactRef {
  return {
    artifactId: artifactId as ArtifactRef["artifactId"],
    version: 1 as Version,
    tenantId: BRIDGE_TENANT,
    digest: digestOf(digestSeed),
    type,
    storageRef: `mos-bridge:source:${artifactId}` as ArtifactRef["storageRef"],
    rightsRef: BRIDGE_RIGHTS_REF,
    provenanceRef: "provenance:bridge-fixture-1" as ArtifactRef["provenanceRef"],
  };
}

/** The two fixture source artifacts the production programs compose. */
export const BRIDGE_SOURCE_ARTIFACTS: readonly ArtifactRef[] = [
  artifactRefOf("artifact:bridge-source-video-1", "bridge-source-video-one", "video"),
  artifactRefOf("artifact:bridge-source-audio-1", "bridge-source-audio-one", "audio"),
];

// ---------------------------------------------------------------------------
// The producing organization (cited by the search, loadable by the studio)
// ---------------------------------------------------------------------------

function capability(id: string): { capabilityId: CapabilityId; version: Version } {
  return { capabilityId: id as CapabilityId, version: 1 as Version };
}

/**
 * The fixture organization descriptor — the SAME record seeded into BOTH the
 * search's organization-source seam (the candidate's citation) and the studio
 * runtime's organization source (STUDIO-007 loads exactly this @ v1). The
 * declared capabilities cover every initial format's requirements (the
 * TEST_ORGANIZATION set).
 */
function bridgeOrganizationDescriptor(): ProgramOrganizationDescriptor {
  return {
    id: "organization:bridge-fixture-duo",
    version: 1 as Version,
    tenantId: BRIDGE_TENANT,
    nodes: [
      { nodeId: "organization:bridge-fixture-duo:node-1", bodyId: "agent-body:bridge-editor" as never },
      { nodeId: "organization:bridge-fixture-duo:node-2", bodyId: "agent-body:bridge-critic" as never },
    ],
    edges: [],
    modelAssignments: [],
    memoryPolicy: { scope: "session" },
    budgetPolicy: {
      organization: { maxCost: { amount: 100, currency: "USD" }, maxDurationMs: 3_600_000 },
      perNode: { maxCost: { amount: 50, currency: "USD" }, maxDurationMs: 1_800_000 },
    },
    terminationPolicy: { maxIterations: 8, timeoutMs: 600_000 },
    evaluator: "evaluator:organization/bridge-fixture-duo" as EvaluatorRef,
    criticNodeIds: ["organization:bridge-fixture-duo:node-2"],
    executionOrdering: "sequential",
  };
}

/** The studio-side organization seed (id + version + derived capabilities). */
export const BRIDGE_STUDIO_ORGANIZATION = {
  id: "organization:bridge-fixture-duo",
  version: 1,
  declaredCapabilities: [
    "compose_reaction",
    "render_timeline",
    "transcribe_audio",
    "mix_audio",
    "compose_video",
    "evaluate_content",
  ],
} as const;

// ---------------------------------------------------------------------------
// The search world (REAL createInMemoryProgramSearch over disclosed seams)
// ---------------------------------------------------------------------------

/** One registry-vocabulary engine binding (exact versions). */
function engineBinding(
  capabilityId: string,
  engineId: string,
  engineVersion: number,
): CandidateProgram["enginePortfolio"][number] {
  return {
    capabilityId: capabilityId as CapabilityId,
    capabilityVersion: 1 as Version,
    engineId: engineId as never,
    engineVersion: engineVersion as Version,
  };
}

/** The fixture search policy (v1 — the declared vocabulary set). */
function bridgeSearchPolicy(): ProductionProgramSearchPolicy {
  return {
    version: 1,
    maxChainSteps: 3,
    parameterPresetVocabulary: ["balanced", "aggressive", "conservative"],
    modalityVocabulary: ["automated", "studio", "human-arena", "hybrid"] as readonly ProgramProductionModality[],
    modelVocabulary: ["mos-model:bridge-default" as never, "mos-model:bridge-premium" as never],
    engineVocabulary: [
      engineBinding("rank_clip_candidates", "engine:bridge-clip-ranker", 3),
      engineBinding("compose_reaction", "engine:bridge-reaction-composer", 2),
    ],
    qualityFloorLadder: [0.5, 0.65, 0.8],
    budgetScaleFactor: 2,
    expectedDurationLadderMs: [60_000, 300_000, 900_000],
    waitHorizonLadderMs: [0, 30_000, 120_000],
    maxRetriesCap: 2,
    seedCount: 3,
    plateauWindow: 2,
    improvementTolerance: 0.01,
    pruning: "interval-dominance",
  };
}

/** The declared §18 delay expectations fixture (provenance-cited). */
const BRIDGE_DELAY_EXPECTATION = Object.freeze({
  expectedIncrementalValue: 12,
  estimatedWaitMs: 30_000,
  delayCost: 1.5,
  acquisitionCost: 0.8,
  successProbability: 0.7,
  qualityImpact: -0.1,
  provenance: {
    kind: "delay-analysis",
    analysisId: "delay-analysis:bridge-001",
    analysisVersion: 1,
  } as const,
});

/** The hand-designed studio candidate seed (modality studio, org citation). */
function bridgeHandDesignedProgram(): CandidateProgram {
  return {
    isNoopBaseline: false,
    transformChain: [
      {
        definitionId: "transform:bridge-reaction-pip" as TransformId,
        definitionVersion: 1 as Version,
        parameterPreset: "aggressive",
        parameters: { preset: "aggressive" },
      },
    ],
    modality: "studio",
    studioFormat: "reaction" as StudioFormatId,
    organization: { organizationId: "organization:bridge-fixture-duo", organizationVersion: 1 as Version },
    pawnAgents: ["reaction-composition", "quality-critic"],
    modelAssignments: [],
    enginePortfolio: [engineBinding("compose_reaction", "engine:bridge-reaction-composer", 2)],
    humanTasks: [],
    capabilityAcquisition: [
      { requirement: capability("compose_reaction"), mode: "engine" as const },
    ],
    qualityThresholds: { floor: 0.65, evaluatorRef: "evaluator:quality/bridge-outputs" as EvaluatorRef },
    budget: { maxCost: { amount: 40, currency: "USD" }, maxDurationMs: 900_000 },
    deadline: "2026-06-01T00:15:00.000Z" as Timestamp,
    expectedDurationMs: 900_000,
    delayPolicy: { maxWaitMs: 30_000, onDelayExceeded: "substitute" as const },
    delayExpectation: BRIDGE_DELAY_EXPECTATION,
    stoppingPolicy: { maxRetries: 1, substitutionPreference: ["engine", "transform", "reduced-scope"] },
  };
}

/** The fixture search input over the bridge world. */
function bridgeSearchInput(): ProductionProgramSearchInput {
  return {
    scope: BRIDGE_SCOPE,
    missionRef: BRIDGE_MISSION_REF,
    strategyRef: "strategy:bridge-reaction-loops" as StrategyRef,
    objective: "Produce reaction-video program candidates from the bridge fixture source video",
    sourceArtifactRefs: BRIDGE_SOURCE_ARTIFACTS,
    rightsContext: {
      rightsRefs: [BRIDGE_RIGHTS_REF],
      consentRefs: [BRIDGE_CONSENT_REF],
    },
    returnContract: { type: "object", properties: { output: { type: "string" } } },
    studioFormatVocabulary: ["reaction" as StudioFormatId, "audio-podcast" as StudioFormatId],
    humanTaskVocabulary: [
      "human-task:bridge-reaction-capture" as HumanProductionTaskId,
    ],
    delayExpectation: BRIDGE_DELAY_EXPECTATION,
    deadlineAnchor: "2026-06-01T00:00:00.000Z" as Timestamp,
    baseBudget: { maxCost: { amount: 25, currency: "USD" }, maxDurationMs: 1_800_000 },
    qualityEvaluatorRef: "evaluator:quality/bridge-outputs" as EvaluatorRef,
    substitutionPreference: ["engine", "transform", "reduced-scope"],
    handDesigned: [{ candidate: bridgeHandDesignedProgram() }],
    policy: bridgeSearchPolicy(),
    budget: { maxCandidateEvaluations: 30, maxIterations: 4 },
    seed: 20260601,
  };
}

/** The composed REAL search stack over the disclosed seam doubles. */
function composeBridgeSearch() {
  const transforms = createInMemoryTransformSource({
    definitions: [
      {
        id: "transform:bridge-reaction-pip" as TransformId,
        tenantId: BRIDGE_TENANT,
        version: 1 as Version,
        kind: "reaction",
        inputTypes: ["video"],
        outputTypes: ["video"],
        parameters: { type: "object", properties: { layout: { type: "string" } } },
        capabilityRequirements: [capability("compose_reaction")],
        evaluator: "evaluator:transform/bridge-reaction-pip" as EvaluatorRef,
        costModel: { basis: "per-invocation", amount: 0.2, currency: "USD" },
        latencyModel: { p50Ms: 5_000, p95Ms: 20_000, p99Ms: 60_000 },
        rightsRequirements: [BRIDGE_RIGHTS_REF],
        policyRequirements: [BRIDGE_POLICY_REF],
        lineageRules: ["lineage:bridge-reaction-parents"],
      },
      {
        id: "transform:bridge-clip-highlights" as TransformId,
        tenantId: BRIDGE_TENANT,
        version: 1 as Version,
        kind: "clip",
        inputTypes: ["video"],
        outputTypes: ["video"],
        parameters: { type: "object", properties: { clipCount: { type: "number" } } },
        capabilityRequirements: [capability("rank_clip_candidates")],
        evaluator: "evaluator:transform/bridge-clip-highlights" as EvaluatorRef,
        costModel: { basis: "per-invocation", amount: 0.1, currency: "USD" },
        latencyModel: { p50Ms: 2_000, p95Ms: 8_000, p99Ms: 20_000 },
        rightsRequirements: [BRIDGE_RIGHTS_REF],
        policyRequirements: [BRIDGE_POLICY_REF],
        lineageRules: ["lineage:bridge-clip-parents"],
      },
    ],
  });
  const catalog: ProgramTransformCatalogPort = {
    listPromotedTransforms: async (scope) => transforms.listLatest(scope),
  };
  const organizations = createInMemoryProgramOrganizationSource({
    seeds: [bridgeOrganizationDescriptor()],
  });
  const evaluation = createInMemoryProgramEvaluation({});
  const search = createInMemoryProgramSearch({
    catalog,
    organizations,
    transforms,
    evaluation,
    now: BRIDGE_NOW,
  });
  return { search, doubles: { transforms, catalog, organizations, evaluation } };
}

/**
 * Run the REAL production program search over the fixture world and return
 * the result (ranked + the always-present no-op baseline — §7). Deterministic
 * given (inputs, seed, policy version).
 */
export async function runBridgeSearch(): Promise<ProductionProgramSearchResult> {
  const { search } = composeBridgeSearch();
  const result = await search.searchPrograms(bridgeSearchInput());
  if ("error" in result) {
    throw new Error(
      `bridge fixture search failed: ${result.error} — ${result.message}`,
    );
  }
  return result;
}

/**
 * The first STUDIO-modality ranked candidate of a result (the hand-designed
 * program with a producing organization — the bridge-enterable shape).
 */
export function firstStudioCandidateOf(
  result: ProductionProgramSearchResult,
): RankedCandidateProgram {
  const candidate = result.ranked.find(
    (entry) => entry.candidate.modality === "studio" && entry.candidate.organization !== null,
  );
  if (candidate === undefined) {
    throw new Error("bridge fixture search produced no studio-modality ranked candidate");
  }
  return candidate;
}
