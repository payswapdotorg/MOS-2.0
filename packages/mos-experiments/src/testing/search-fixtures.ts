/**
 * DISCLOSED BRIDGE-003 search-world fixtures (split from
 * experiment-fixtures.ts to respect the managed file line budget — the
 * studio bridge-search-fixtures precedent, behavior-identical): the REAL
 * production program search (LAB-016's own `createInMemoryProgramSearch`
 * from `@mos/production`) over its disclosed seam doubles, plus the
 * binding-request fixture over the REAL search output.
 */

import type {
  ArtifactRef,
  CapabilityId,
  ContentDigest,
  EvaluatorRef,
  StudioFormatId,
  Timestamp,
  TransformId,
  Version,
} from "@mos/contracts";
import type { JobQueuePort } from "@mos/jobs";
import { createDurableJobQueue, createInMemoryDurableJobStore } from "@mos/jobs";
import type { MissionRepository } from "@mos/missions";
import type {
  CandidateProgram,
  ProgramOrganizationDescriptor,
  ProgramProductionModality,
  ProgramTransformCatalogPort,
  ProductionProgramSearchInput,
  ProductionProgramSearchPolicy,
  ProductionProgramSearchResult,
  RankedCandidateProgram,
} from "@mos/production";
import {
  createInMemoryProgramEvaluation,
  createInMemoryProgramOrganizationSource,
  createInMemoryProgramSearch,
  createInMemoryTransformSource,
} from "@mos/production";
import type { SocialObservationRecord, SocialPublicationRecord } from "@mos/distribution";

import { createInMemoryRealExperimentAuthority } from "../adapters/in-memory-experiment-authority.js";
import type { InMemoryRealExperimentAuthorityOptions } from "../adapters/in-memory-experiment-authority.js";
import { createInMemoryLabCandidateReader } from "../adapters/in-memory-gate-doubles.js";
import {
  createInMemoryDistributionObservationSource,
  createInMemoryExperimentPolicyGate,
  createInMemoryExperimentRightsGate,
} from "../adapters/in-memory-gate-doubles.js";
import type {
  InMemoryExperimentPolicyGateOptions,
  InMemoryExperimentRightsGateOptions,
} from "../adapters/in-memory-gate-doubles.js";
import type { LabCandidateSnapshot } from "../contracts/lab-candidate-seam.js";
import {
  createExperimentClock,
  createExperimentIdFactory,
  createExperimentMissionRepository,
  experimentLabCandidateSnapshot,
  experimentPublicationFixture,
  experimentWindowObservations,
  EXPERIMENT_ACTOR,
  EXPERIMENT_BENCHMARK_ID,
  EXPERIMENT_CANDIDATE_KEY,
  EXPERIMENT_CONSENT_REF,
  EXPERIMENT_DISTRIBUTED_ARTIFACT,
  EXPERIMENT_MISSION_ACTIVE_VERSION,
  EXPERIMENT_MISSION_REF,
  EXPERIMENT_POLICY_REF,
  EXPERIMENT_PUBLICATION_ID,
  EXPERIMENT_RIGHTS_REF,
  EXPERIMENT_SCOPE,
  EXPERIMENT_TENANT,
  EXPERIMENT_WINDOW_END,
  EXPERIMENT_WINDOW_START,
} from "./experiment-fixtures.js";
export {
  experimentLabCandidateSnapshot,
  experimentObservationFixture,
  experimentPublicationFixture,
  experimentWindowObservations,
  EXPERIMENT_ACTOR,
  EXPERIMENT_SCOPE,
  EXPERIMENT_TENANT,
} from "./experiment-fixtures.js";

/** Deterministic content digest (the studio fixtures' helper). */
function fixtureDigest(seed: string): ContentDigest {
  return `sha256:${seed.padEnd(64 - 7, "0")}` as ContentDigest;
}

// ---------------------------------------------------------------------------
// The REAL production program search fixture (the studio precedent)
// ---------------------------------------------------------------------------

function capability(id: string): { capabilityId: CapabilityId; version: Version } {
  return { capabilityId: id as CapabilityId, version: 1 as Version };
}

function experimentOrganizationDescriptor(): ProgramOrganizationDescriptor {
  return {
    id: "organization:experiment-fixture-duo",
    version: 1 as Version,
    tenantId: EXPERIMENT_TENANT,
    nodes: [
      { nodeId: "organization:experiment-fixture-duo:node-1", bodyId: "agent-body:experiment-editor" as never },
      { nodeId: "organization:experiment-fixture-duo:node-2", bodyId: "agent-body:experiment-critic" as never },
    ],
    edges: [],
    modelAssignments: [],
    memoryPolicy: { scope: "session" },
    budgetPolicy: {
      organization: { maxCost: { amount: 100, currency: "USD" }, maxDurationMs: 3_600_000 },
      perNode: { maxCost: { amount: 50, currency: "USD" }, maxDurationMs: 1_800_000 },
    },
    terminationPolicy: { maxIterations: 8, timeoutMs: 600_000 },
    evaluator: "evaluator:organization/experiment-fixture-duo" as EvaluatorRef,
    criticNodeIds: ["organization:experiment-fixture-duo:node-2"],
    executionOrdering: "sequential",
  };
}

function experimentSearchPolicy(): ProductionProgramSearchPolicy {
  return {
    version: 1,
    maxChainSteps: 3,
    parameterPresetVocabulary: ["balanced", "aggressive", "conservative"],
    modalityVocabulary: ["automated", "studio", "human-arena", "hybrid"] as readonly ProgramProductionModality[],
    modelVocabulary: ["mos-model:experiment-default" as never],
    engineVocabulary: [
      {
        capabilityId: "compose_reaction" as CapabilityId,
        capabilityVersion: 1 as Version,
        engineId: "engine:experiment-reaction-composer" as never,
        engineVersion: 2 as Version,
      },
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

const EXPERIMENT_DELAY_EXPECTATION = Object.freeze({
  expectedIncrementalValue: 12,
  estimatedWaitMs: 30_000,
  delayCost: 1.5,
  acquisitionCost: 0.8,
  successProbability: 0.7,
  qualityImpact: -0.1,
  provenance: {
    kind: "delay-analysis",
    analysisId: "delay-analysis:experiment-003",
    analysisVersion: 1,
  } as const,
});

/** The fixture source artifact (the production program's input). */
export const EXPERIMENT_SOURCE_ARTIFACT: ArtifactRef = {
  artifactId: "artifact:experiment-source-video-1" as ArtifactRef["artifactId"],
  version: 1 as Version,
  tenantId: EXPERIMENT_TENANT,
  digest: fixtureDigest("experiment-source-video-one"),
  type: "video",
  storageRef: "mos-experiments:source:artifact:experiment-source-video-1" as ArtifactRef["storageRef"],
  rightsRef: EXPERIMENT_RIGHTS_REF,
  provenanceRef: "provenance:experiment-fixture-1" as ArtifactRef["provenanceRef"],
};

function experimentHandDesignedProgram(): CandidateProgram {
  return {
    isNoopBaseline: false,
    transformChain: [
      {
        definitionId: "transform:experiment-reaction-pip" as TransformId,
        definitionVersion: 1 as Version,
        parameterPreset: "aggressive",
        parameters: { preset: "aggressive" },
      },
    ],
    modality: "studio",
    studioFormat: "reaction" as StudioFormatId,
    organization: { organizationId: "organization:experiment-fixture-duo", organizationVersion: 1 as Version },
    pawnAgents: ["reaction-composition", "quality-critic"],
    modelAssignments: [],
    enginePortfolio: [
      {
        capabilityId: "compose_reaction" as CapabilityId,
        capabilityVersion: 1 as Version,
        engineId: "engine:experiment-reaction-composer" as never,
        engineVersion: 2 as Version,
      },
    ],
    humanTasks: [],
    capabilityAcquisition: [{ requirement: capability("compose_reaction"), mode: "engine" as const }],
    qualityThresholds: { floor: 0.65, evaluatorRef: "evaluator:quality/experiment-outputs" as EvaluatorRef },
    budget: { maxCost: { amount: 40, currency: "USD" }, maxDurationMs: 900_000 },
    deadline: "2026-06-01T00:15:00.000Z" as Timestamp,
    expectedDurationMs: 900_000,
    delayPolicy: { maxWaitMs: 30_000, onDelayExceeded: "substitute" as const },
    delayExpectation: EXPERIMENT_DELAY_EXPECTATION,
    stoppingPolicy: { maxRetries: 1, substitutionPreference: ["engine", "transform", "reduced-scope"] },
  };
}

/**
 * Run the REAL production program search over the fixture world and return
 * the result (ranked + the always-present no-op baseline — §7).
 * Deterministic given (inputs, seed, policy version).
 */
export async function runExperimentSearch(): Promise<ProductionProgramSearchResult> {
  const transforms = createInMemoryTransformSource({
    definitions: [
      {
        id: "transform:experiment-reaction-pip" as TransformId,
        tenantId: EXPERIMENT_TENANT,
        version: 1 as Version,
        kind: "reaction",
        inputTypes: ["video"],
        outputTypes: ["video"],
        parameters: { type: "object", properties: { layout: { type: "string" } } },
        capabilityRequirements: [capability("compose_reaction")],
        evaluator: "evaluator:transform/experiment-reaction-pip" as EvaluatorRef,
        costModel: { basis: "per-invocation", amount: 0.2, currency: "USD" },
        latencyModel: { p50Ms: 5_000, p95Ms: 20_000, p99Ms: 60_000 },
        rightsRequirements: [EXPERIMENT_RIGHTS_REF],
        policyRequirements: [EXPERIMENT_POLICY_REF],
        lineageRules: ["lineage:experiment-reaction-parents"],
      },
    ],
  });
  const catalog: ProgramTransformCatalogPort = {
    listPromotedTransforms: async (scope) => transforms.listLatest(scope),
  };
  const organizations = createInMemoryProgramOrganizationSource({
    seeds: [experimentOrganizationDescriptor()],
  });
  const evaluation = createInMemoryProgramEvaluation({});
  const search = createInMemoryProgramSearch({
    catalog,
    organizations,
    transforms,
    evaluation,
    now: () => "2026-05-31T00:00:00.000Z" as Timestamp,
  });
  const input: ProductionProgramSearchInput = {
    scope: EXPERIMENT_SCOPE,
    missionRef: EXPERIMENT_MISSION_REF,
    strategyRef: "strategy:experiment-reaction-loops" as never,
    objective: "Produce reaction-video program candidates from the experiment fixture source video",
    sourceArtifactRefs: [EXPERIMENT_SOURCE_ARTIFACT],
    rightsContext: { rightsRefs: [EXPERIMENT_RIGHTS_REF], consentRefs: [EXPERIMENT_CONSENT_REF] },
    returnContract: { type: "object", properties: { output: { type: "string" } } },
    studioFormatVocabulary: ["reaction" as StudioFormatId],
    humanTaskVocabulary: [],
    delayExpectation: EXPERIMENT_DELAY_EXPECTATION,
    deadlineAnchor: "2026-06-01T00:00:00.000Z" as Timestamp,
    baseBudget: { maxCost: { amount: 25, currency: "USD" }, maxDurationMs: 1_800_000 },
    qualityEvaluatorRef: "evaluator:quality/experiment-outputs" as EvaluatorRef,
    substitutionPreference: ["engine", "transform", "reduced-scope"],
    handDesigned: [{ candidate: experimentHandDesignedProgram() }],
    policy: experimentSearchPolicy(),
    budget: { maxCandidateEvaluations: 30, maxIterations: 4 },
    seed: 20260601,
  };
  const result = await search.searchPrograms(input);
  if ("error" in result) {
    throw new Error(`experiment fixture search failed: ${result.error} — ${result.message}`);
  }
  return result;
}

/** The first ranked candidate of the fixture search (a declared entry, never the baseline). */
export const firstRankedCandidateOf = (
  result: ProductionProgramSearchResult,
): RankedCandidateProgram => {
  const first = result.ranked[0];
  if (first === undefined) {
    throw new Error("experiment fixture search produced no ranked candidate");
  }
  return first;
};

// ---------------------------------------------------------------------------
// The composed authority under test (REAL missions + REAL jobs queue)
// ---------------------------------------------------------------------------

/** The composed authority's dependencies (spied doubles where disclosed). */
export interface ComposedExperimentWorld {
  /** The composed authority (with the disclosed store-inspection surface). */
  readonly authority: ReturnType<typeof createInMemoryRealExperimentAuthority>;
  readonly missions: MissionRepository;
  readonly jobs: JobQueuePort;
  readonly labCandidate: ReturnType<typeof createInMemoryLabCandidateReader>;
  readonly policyGate: ReturnType<typeof createInMemoryExperimentPolicyGate>;
  readonly rightsGate: ReturnType<typeof createInMemoryExperimentRightsGate>;
  readonly distribution: ReturnType<typeof createInMemoryDistributionObservationSource>;
  readonly clock: ReturnType<typeof createExperimentClock>;
}

/** Options of {@link composeExperimentWorld}. */
export interface ComposeExperimentWorldOptions {
  readonly labCandidates?: readonly (LabCandidateSnapshot & { readonly tenantId: string })[];
  readonly policyScript?: InMemoryExperimentPolicyGateOptions["script"];
  readonly frameScript?: InMemoryExperimentRightsGateOptions["frameScript"];
  readonly publications?: readonly SocialPublicationRecord[];
  readonly observations?: readonly SocialObservationRecord[];
  readonly missionRepository?: MissionRepository;
}

/** Compose the deterministic fixture world (the studio composeXForTests precedent). */
export const composeExperimentWorld = (
  options: ComposeExperimentWorldOptions = {},
): ComposedExperimentWorld => {
  const clock = createExperimentClock();
  const missions = options.missionRepository ?? createExperimentMissionRepository();
  const jobs = createDurableJobQueue({
    store: createInMemoryDurableJobStore(),
    clock: () => clock.now(),
    now: () => Date.parse(clock.now()),
    jobIdFactory: (() => {
      let counter = 0;
      return () => `job-exp-fixture-${(counter += 1)}`;
    })(),
    leaseTokenFactory: (() => {
      let counter = 0;
      return () => `lease-exp-fixture-${(counter += 1)}`;
    })(),
  });
  const labCandidate = createInMemoryLabCandidateReader({
    snapshots: options.labCandidates ?? [experimentLabCandidateSnapshot()],
  });
  const policyGate = createInMemoryExperimentPolicyGate({
    script:
      options.policyScript ?? [
        {
          decision: "permitted",
          outcome: "allowed",
          denialReason: null,
          policyRef: EXPERIMENT_POLICY_REF,
          evaluationRef: "policy-eval:experiment-fixture-1",
        },
      ],
  });
  const rightsGate = createInMemoryExperimentRightsGate({
    frameScript:
      options.frameScript ?? [
        {
          resolutions: [
            { ref: String(EXPERIMENT_RIGHTS_REF), kind: "rights-grant", status: "active" },
            { ref: String(EXPERIMENT_CONSENT_REF), kind: "consent-record", status: "active" },
          ],
          frameActive: true,
        },
      ],
  });
  const distribution = createInMemoryDistributionObservationSource({
    publications: options.publications ?? [experimentPublicationFixture()],
    observations: options.observations ?? experimentWindowObservations(),
  });
  const authorityOptions: InMemoryRealExperimentAuthorityOptions = {
    labCandidate,
    missions,
    policyGate,
    rightsGate,
    distribution,
    jobs,
    clock: () => clock.now(),
    nextExperimentId: createExperimentIdFactory(),
    nextAuditId: (() => {
      let counter = 0;
      return () => `expa-fixture-${(counter += 1)}`;
    })(),
  };
  const authority = createInMemoryRealExperimentAuthority(authorityOptions);
  return { authority, missions, jobs, labCandidate, policyGate, rightsGate, distribution, clock };
};

/** The standard valid binding request over the fixture world. */
export const experimentBindingRequestFixture = async (): Promise<{
  readonly searchResult: ProductionProgramSearchResult;
  readonly selected: RankedCandidateProgram;
  readonly request: import("../contracts/binding-request.js").RealExperimentBindingRequest;
}> => {
  const searchResult = await runExperimentSearch();
  const selected = firstRankedCandidateOf(searchResult);
  return {
    searchResult,
    selected,
    request: {
      scope: EXPERIMENT_SCOPE,
      actor: EXPERIMENT_ACTOR,
      labCandidate: {
        benchmarkId: EXPERIMENT_BENCHMARK_ID,
        benchmarkVersion: 1,
        candidateKey: EXPERIMENT_CANDIDATE_KEY,
      },
      mission: { missionRef: EXPERIMENT_MISSION_REF, missionVersion: EXPERIMENT_MISSION_ACTIVE_VERSION },
      policy: [{ id: EXPERIMENT_POLICY_REF, version: 1 as Version }],
      rightsFrame: {
        rightsRefs: [EXPERIMENT_RIGHTS_REF],
        consentRefs: [EXPERIMENT_CONSENT_REF],
      },
      production: { searchResult, selected },
      distribution: {
        publicationId: EXPERIMENT_PUBLICATION_ID,
        expectedArtifact: {
          artifactId: String(EXPERIMENT_DISTRIBUTED_ARTIFACT.artifactId),
          version: Number(EXPERIMENT_DISTRIBUTED_ARTIFACT.version),
        },
      },
      measurement: {
        windowStart: EXPERIMENT_WINDOW_START as Timestamp,
        windowEnd: EXPERIMENT_WINDOW_END as Timestamp,
        niche: "marketing-tech-saas",
        regime: "current-market-regime",
      },
    },
  };
};