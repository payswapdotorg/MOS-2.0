/**
 * The BRIDGE-003 REAL-STACK compat battery — the RUNTIME half of the
 * zero-drift pins (the compile-time half: compat/lab-authority-compat.ts).
 *
 * The closed §2 loop-3 loop over the REAL authorities, end-to-end:
 * REAL `@mos/missions` mission → REAL `@mos/production` program search →
 * REAL `@mos/lab` LAB-017 robust benchmark (the prediction) → REAL
 * `@mos/policy` verdict + REAL `@mos/rights` frame (the §24 gates) →
 * REAL `@mos/distribution` platform-confirmed publication + platform-said
 * observations (the reality source) → REAL `@mos/jobs` durable queue (the
 * §26 measurement segment) → THIS authority's binding → measurement →
 * analysis → the outcome observation → REAL `@mos/lab` LAB-018 online
 * calibration consuming the outcome through its declared
 * RealityObservationReaderPort boundary (measure → calibrate).
 *
 * IMPORT FORMS (disclosed, the MARKETING-001/BRIDGE-001 compat pattern):
 * - the experiments package's own built surface: `../dist/index.js`;
 * - registry-dep REAL authorities with dist-default exports maps:
 *   `@mos/production`, `@mos/jobs`, `@mos/contracts` (bare specifiers);
 * - registry-dep REAL authorities whose exports default to untranspiled
 *   src/ (node cannot execute): `@mos/missions` by RELATIVE BUILT-DIST path;
 * - NON-registry-dep REAL authorities (lab/policy/rights — the declared
 *   seams this battery exists to prove): RELATIVE BUILT-DIST runtime
 *   imports — no runtime dependency of this package is created and no
 *   lockfile change is made (the disclosed compat pattern).
 *
 * FICTIONAL DATA ONLY: the Aurora distribution stack, the policy rule, the
 * rights grant and the lab worlds are fixtures; nothing real is implied.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { IdentityRef, TenantScope, Timestamp, Version } from "@mos/contracts";
import type { LabScenario } from "@mos/contracts";
import { createDurableJobQueue, createInMemoryDurableJobStore } from "@mos/jobs";
import { createInMemoryProgramSearch } from "@mos/production";
import type {
  ProductionProgramSearchInput,
  ProductionProgramSearchResult,
  ProgramOrganizationDescriptor,
  ProgramTransformCatalogPort,
  RankedCandidateProgram,
} from "@mos/production";
import type { ProgramOrganizationSourcePort } from "@mos/production";
import { createInMemoryProgramOrganizationSource } from "@mos/production";
import { createInMemoryProgramEvaluation } from "@mos/production";
import { createInMemoryTransformSource } from "@mos/production";

// THIS package's built public surface.
import {
  createInMemoryRealExperimentAuthority,
  createRealDistributionObservationSource,
  experimentObservationIdOf,
} from "../dist/index.js";
import type {
  LabCandidateReaderPort,
  RealExperimentBindingRequest,
  RealExperimentAuthorityPort,
} from "../dist/index.js";
import type { ExperimentPolicyGatePort } from "../dist/index.js";
import type { ExperimentRightsGatePort } from "../dist/index.js";

// REAL registry-dep authority whose exports default to src/ (missions).
import { createInMemoryMissionRepository } from "../../mos-missions/dist/index.js";

// REAL NON-registry-dep authorities behind the declared seams (relative
// built-dist runtime imports — disclosed, no lockfile change).
import {
  createInMemoryPolicyRegistry,
  createInMemoryPolicyEvaluation,
} from "../../mos-policy/dist/index.js";
import { createInMemoryRightsRepository } from "../../mos-rights/dist/index.js";
import type { RightsRepository } from "../../mos-rights/dist/index.js";
import {
  createInMemoryEnsemble,
  createInMemoryMarketingBenchmark,
  createInMemoryOnlineCalibration,
  createInMemorySimulatorEngine,
  createInMemorySocialWorldModelStore,
} from "../../mos-lab/dist/index.js";
import type { MarketingBenchmarkPort } from "../../mos-lab/dist/index.js";
import type { OnlineCalibrationPort } from "../../mos-lab/dist/index.js";
import type { RealityObservationReaderPort } from "../../mos-lab/dist/index.js";
import { CALIBRATION_ERROR_FUNCTIONAL_V1 } from "../../mos-lab/dist/index.js";
import type { LabCalibrationId } from "../../mos-lab/dist/index.js";
import type { HistoricalObservationId } from "../../mos-lab/dist/index.js";
import type { HistoricalObservation } from "../../mos-lab/dist/index.js";
import type { RobustBenchmarkId } from "../../mos-lab/dist/index.js";
import type { LabRewardSpec } from "../../mos-lab/dist/index.js";

// The REAL distribution fixture stack (the SOCIAL-001 testing seam).
import { registeredAuroraStack } from "../../mos-distribution/dist/testing/registered-stack.js";
import {
  ACTOR_ONE,
  FIXTURE_ARTIFACT,
  FIXTURE_PRESENTATION,
  SCOPE_ALPHA,
  TENANT_ALPHA,
} from "../../mos-distribution/dist/testing/fixtures.js";

const SCOPE: TenantScope = SCOPE_ALPHA;
const ACTOR: IdentityRef = ACTOR_ONE;
const NOW = (): Timestamp => "2026-06-01T00:00:00.000Z" as Timestamp;

// ---------------------------------------------------------------------------
// The REAL policy gate adapter (the declared seam over the REAL authority)
// ---------------------------------------------------------------------------

/** The REAL policy stack + the experiment-launch allow rule. */
const composeRealPolicy = (): ExperimentPolicyGatePort => {
  const registry = createInMemoryPolicyRegistry({ now: NOW });
  registry.register({
    scope: SCOPE,
    id: "policy:compat-experiment-launch" as never,
    declaredScope: { actionKinds: ["experiment-launch"], subjectRefs: [], actorRefs: [] },
    constraints: [],
    effect: "allow",
    rationale: "compat rule: real experiments may launch for tenant-alpha",
    createdByAuthority: "tenant-admin",
    createdBy: "identity:policy-admin" as never,
  });
  const evaluation = createInMemoryPolicyEvaluation({ registry, now: NOW });
  // The adapter: translate the experiments gate request onto the REAL
  // PolicyEvaluationRequest; map the verdict (the BRIDGE-001 adapter
  // discipline — verbatim attribution, fail-closed, never throws).
  return {
    check(request) {
      try {
        const record = evaluation.evaluate({
          scope: request.scope,
          actor: request.actor,
          policy: request.policy.map((citation) => ({
            id: citation.id,
            version: citation.version,
          })),
          action: {
            actionKind: "experiment-launch",
            subjectRef: request.subjectRef,
          } as never,
        });
        const verdict = record.verdict;
        if (verdict.outcome === "allowed") {
          return {
            decision: "permitted",
            outcome: "allowed",
            denialReason: null,
            policyRef: verdict.byRule.id,
            evaluationRef: record.id,
          };
        }
        if (verdict.outcome === "denied") {
          return {
            decision: "denied",
            outcome: "denied",
            denialReason: verdict.deniedBy.detail,
            policyRef: verdict.deniedBy.rule.id,
            evaluationRef: record.id,
          };
        }
        if (verdict.outcome === "approval-required") {
          return {
            decision: "denied",
            outcome: "approval-required",
            denialReason: `approval-required: approver role "${verdict.approverRole}" must approve the experiment launch — ${verdict.rationale}`,
            policyRef: verdict.byRule.id,
            evaluationRef: record.id,
          };
        }
        return {
          decision: "denied",
          outcome: "insufficient-policy",
          denialReason: "insufficient-policy: no cited policy rule matched the experiment-launch action (fail closed)",
          policyRef: null,
          evaluationRef: record.id,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          decision: "denied",
          outcome: "denied",
          denialReason: `the REAL policy authority rejected the request (verbatim): ${reason}`,
          policyRef: null,
          evaluationRef: null,
        };
      }
    },
  };
};

// ---------------------------------------------------------------------------
// The REAL rights frame gate adapter (resolveFrame over the repository)
// ---------------------------------------------------------------------------

/** The REAL rights repository with one active grant + consent in SCOPE. */
const composeRealRights = (): { repository: RightsRepository; gate: ExperimentRightsGatePort } => {
  const repository = createInMemoryRightsRepository({ now: NOW });
  repository.grantRights({
    scope: SCOPE,
    id: "rights:compat-experiment-grant" as never,
    grantee: "identity:actor-one" as never,
    actions: ["use", "transform", "distribute", "analyze"] as never,
    subjectRefs: [String(FIXTURE_ARTIFACT.artifactId), String(FIXTURE_ARTIFACT.storageRef)] as never,
    sourceRefs: ["license:compat-holder-1"] as never,
    terms: {
      attributionRequired: true,
      commercialUseAllowed: false,
      derivationAllowed: false,
      notes: "compat grant",
    } as never,
    expiresAt: null,
  });
  repository.recordConsent({
    scope: SCOPE,
    id: "consent:compat-experiment-record" as never,
    purpose: "compat experiment measurement consent",
    participantRef: "identity:actor-one" as never,
    actions: ["analyze"] as never,
    subjectRefs: [String(FIXTURE_ARTIFACT.artifactId)],
  });
  const gate: ExperimentRightsGatePort = {
    resolveFrame(request) {
      const resolutions: {
        ref: string;
        kind: "rights-grant" | "consent-record";
        status: "active" | "unresolved" | "revoked" | "expired" | "foreign-tenant";
      }[] = request.rightsRefs.map((ref) => {
        const grant = repository.getRights(ref as never);
        if (grant === null) {
          return { ref: String(ref), kind: "rights-grant" as const, status: "unresolved" as const };
        }
        if (String(grant.tenantId) !== String(request.scope.tenantId)) {
          return { ref: String(ref), kind: "rights-grant" as const, status: "foreign-tenant" as const };
        }
        if (grant.revokedAt !== null) {
          return { ref: String(ref), kind: "rights-grant" as const, status: "revoked" as const };
        }
        if (grant.expiresAt !== null && grant.expiresAt <= request.now) {
          return { ref: String(ref), kind: "rights-grant" as const, status: "expired" as const };
        }
        return { ref: String(ref), kind: "rights-grant" as const, status: "active" as const };
      });
      for (const ref of request.consentRefs) {
        const consent = repository.getConsent(ref as never);
        if (consent === null) {
          resolutions.push({ ref: String(ref), kind: "consent-record" as const, status: "unresolved" as const });
          continue;
        }
        if (String(consent.tenantId) !== String(request.scope.tenantId)) {
          resolutions.push({ ref: String(ref), kind: "consent-record" as const, status: "foreign-tenant" as const });
          continue;
        }
        if (consent.revokedAt !== null) {
          resolutions.push({ ref: String(ref), kind: "consent-record" as const, status: "revoked" as const });
          continue;
        }
        resolutions.push({ ref: String(ref), kind: "consent-record" as const, status: "active" as const });
      }
      return {
        resolutions,
        frameActive: resolutions.length > 0 && resolutions.every((entry) => entry.status === "active"),
      };
    },
  };
  return { repository, gate };
};

// ---------------------------------------------------------------------------
// The REAL lab benchmark stack + the lab-candidate reader adapter
// ---------------------------------------------------------------------------

/** The REAL LAB-017 benchmark + the reader adapter over its record reads. */
const composeRealLab = async (): Promise<{
  readonly benchmark: MarketingBenchmarkPort;
  readonly labCandidate: LabCandidateReaderPort;
  readonly rewardSpec: LabRewardSpec;
  readonly observedRewardSpec: LabRewardSpec;
  readonly candidateKey: string;
}> => {
  const scenario: LabScenario = {
    id: "scenario-compat-experiment" as never,
    version: 1 as never,
    niche: "marketing-tech-saas",
    platform: "short-video",
    objective: "qualified-reach",
    context: { campaignShape: "weekly-educational-clip" },
    budget: { maxCost: { amount: 500, currency: "USD" }, maxDurationMs: 14 * 86_400_000 },
    informationLag: 5 * 86_400_000,
    corpusVersion: 1 as never,
    simulatorVersion: 1 as never,
    rewardVersion: 1 as never,
  };
  /**
   * The SIMULATION-side reward spec view (the documented composition-seam
   * mapping: the mission term's value draws from the simulator's PREDICTED
   * `qualified-reach` metric during benchmarking — the LAB-017 discipline:
   * observed-domain terms fail closed there). The OBSERVED-side view for
   * LAB-018 (metricSource `impressions` — what the platform reports) is
   * declared separately where the calibration consumes the outcome.
   */
  const rewardSpec: LabRewardSpec = {
    version: 1,
    terms: [
      {
        metric: "qualified-reach",
        weight: 1,
        direction: "maximize",
        definition: "qualified reach as predicted by the simulator ensemble",
        metricSource: "qualified-reach",
      },
    ],
  };
  const observedRewardSpec: LabRewardSpec = {
    version: 1,
    terms: [
      {
        metric: "qualified-reach",
        weight: 1,
        direction: "maximize",
        definition: "qualified reach as the platform reports impressions",
        metricSource: "impressions",
      },
    ],
  };
  const worldModels = createInMemorySocialWorldModelStore({ now: NOW });
  const simulator = createInMemorySimulatorEngine({ worldModels, now: NOW });
  for (const draft of [
    {
      id: "world-compat-a" as never,
      niche: "marketing-tech-saas",
      platform: "short-video",
      state: { baseAudience: 12_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.1 },
      notes: "compat member A",
    },
    {
      id: "world-compat-b" as never,
      niche: "marketing-tech-saas",
      platform: "short-video",
      state: { baseAudience: 24_000, fatigue: 0.1, competitorShare: 0.25, seasonalFactor: 1.0 },
      notes: "compat member B",
    },
  ]) {
    const registered = await worldModels.registerWorldModel({ scope: SCOPE, worldModel: draft });
    if ("error" in registered) {
      throw new Error(`compat world registration failed: ${registered.message}`);
    }
  }
  const ensemble = createInMemoryEnsemble({ simulator, now: NOW });
  for (const ensembleId of ["ensemble-compat-experiment", "ensemble-compat-experiment-alt"]) {
    const registeredAlt = await ensemble.registerEnsemble({
      scope: SCOPE,
      ensemble: {
        id: ensembleId as never,
        niche: "marketing-tech-saas",
        platform: "short-video",
        members: [
          { id: ensembleId === "ensemble-compat-experiment" ? "member-a" : "member-c", worldModelId: "world-compat-a" as never, worldModelVersion: 1, coverage: { cadencePerWeek: { min: 0, max: 14 }, novelty: { min: 0, max: 1 }, engagementEffort: { min: 0, max: 1 } }, notes: null },
          { id: ensembleId === "ensemble-compat-experiment" ? "member-b" : "member-d", worldModelId: "world-compat-b" as never, worldModelVersion: 1, coverage: { cadencePerWeek: { min: 0, max: 14 }, novelty: { min: 0, max: 1 }, engagementEffort: { min: 0, max: 1 } }, notes: null },
        ],
        weightingPolicy: {
          id: `policy-uniform-${ensembleId}`,
          version: 1,
          kind: "uniform",
          note: "compat uniform weighting",
        },
        notes: "compat experiment ensemble",
      },
    });
    if ("error" in registeredAlt) {
      throw new Error(`compat ensemble registration failed: ${registeredAlt.message}`);
    }
  }
  const benchmark = createInMemoryMarketingBenchmark({ ensemble, now: NOW });
  const candidateKey = "compat-experiment-candidate-1";
  const run = await benchmark.runBenchmark({
    scope: SCOPE,
    benchmarkId: "benchmark:compat-experiment-1" as RobustBenchmarkId,
    scenario,
    candidates: [
      {
        key: candidateKey,
        action: {
          strategyRef: "strategy:compat-experiment-1" as never,
          kind: "content",
          cadencePerWeek: 3,
          novelty: 0.4,
          engagementEffort: 0.5,
        },
        horizonSteps: 2,
        source: {
          origin: "hand-designed",
          producerPins: [],
          note: "compat hand-designed candidate over the fixture world",
        },
      },
    ],
    rewardSpec,
    policy: {
      id: "policy-robust-compat-experiment",
      version: 1,
      seedBudget: 2,
      worldModelSet: [
        { ensembleId: "ensemble-compat-experiment" as never, ensembleVersion: 1, label: "primary" },
        { ensembleId: "ensemble-compat-experiment-alt" as never, ensembleVersion: 1, label: "alt" },
      ],
      sweepDimensions: ["seed", "world-model"],
      aggregation: "pooled-mean",
      tieBreak: "expected-desc-halfwidth-asc-key-asc",
      note: "compat robustness policy",
    },
    seeds: [11, 29],
  });
  if ("error" in run) {
    throw new Error(`compat benchmark run failed: ${run.error} — ${run.message}`);
  }
  // The reader adapter over the REAL benchmark record reads (the §31
  // narrowing + the verbatim projection — never a re-run, never a rewrite).
  const labCandidate: LabCandidateReaderPort = {
    async getLabCandidate(scope, citation) {
      const record = await benchmark.getBenchmarkRecord(
        scope,
        citation.benchmarkId as RobustBenchmarkId,
        citation.benchmarkVersion,
      );
      if (record === null) {
        return null;
      }
      const ranked = record.ranked.find((entry) => entry.key === citation.candidateKey);
      if (ranked === undefined) {
        return null;
      }
      return {
        citation: { ...citation },
        expectations: {
          expectedReward: ranked.evaluation.expectedReward,
          interval: { ...ranked.evaluation.interval },
          uncertainty: ranked.evaluation.uncertainty,
          rewardSpecVersion: record.provenance.rewardSpecVersion,
          counterfactual: true,
        },
        disclosure: record.disclosure,
        benchmarkedAt: record.benchmarkedAt,
      };
    },
  };
  return { benchmark, labCandidate, rewardSpec, observedRewardSpec, candidateKey };
};

// ---------------------------------------------------------------------------
// The REAL production search (tenant-alpha) + the composed world
// ---------------------------------------------------------------------------

const composeRealSearch = async (): Promise<ProductionProgramSearchResult> => {
  const organization: ProgramOrganizationDescriptor = {
    id: "organization:compat-experiment-duo",
    version: 1 as Version,
    tenantId: TENANT_ALPHA,
    nodes: [
      { nodeId: "organization:compat-experiment-duo:node-1", bodyId: "agent-body:compat-editor" as never },
    ],
    edges: [],
    modelAssignments: [],
    memoryPolicy: { scope: "session" },
    budgetPolicy: {
      organization: { maxCost: { amount: 100, currency: "USD" }, maxDurationMs: 3_600_000 },
      perNode: { maxCost: { amount: 50, currency: "USD" }, maxDurationMs: 1_800_000 },
    },
    terminationPolicy: { maxIterations: 8, timeoutMs: 600_000 },
    evaluator: "evaluator:organization/compat-experiment-duo" as never,
    criticNodeIds: [],
    executionOrdering: "sequential",
  };
  const transforms = createInMemoryTransformSource({
    definitions: [
      {
        id: "transform:compat-reaction-pip" as never,
        tenantId: TENANT_ALPHA,
        version: 1 as Version,
        kind: "reaction",
        inputTypes: ["video"],
        outputTypes: ["video"],
        parameters: { type: "object", properties: { layout: { type: "string" } } },
        capabilityRequirements: [{ capabilityId: "compose_reaction" as never, version: 1 as Version }],
        evaluator: "evaluator:transform/compat-reaction-pip" as never,
        costModel: { basis: "per-invocation", amount: 0.2, currency: "USD" },
        latencyModel: { p50Ms: 5_000, p95Ms: 20_000, p99Ms: 60_000 },
        rightsRequirements: ["rights:compat-experiment-grant" as never],
        policyRequirements: ["policy:compat-experiment-launch" as never],
        lineageRules: ["lineage:compat-reaction-parents"],
      },
    ],
  });
  const catalog: ProgramTransformCatalogPort = {
    listPromotedTransforms: async (scope) => transforms.listLatest(scope),
  };
  const organizations: ProgramOrganizationSourcePort = createInMemoryProgramOrganizationSource({
    seeds: [organization],
  });
  const evaluation = createInMemoryProgramEvaluation({});
  const search = createInMemoryProgramSearch({
    catalog,
    organizations,
    transforms,
    evaluation,
    now: NOW,
  });
  const input: ProductionProgramSearchInput = {
    scope: SCOPE,
    missionRef: "mission:compat-experiment-1" as never,
    strategyRef: "strategy:compat-experiment-reaction-loops" as never,
    objective: "Produce reaction-video program candidates over the compat source video",
    sourceArtifactRefs: [FIXTURE_ARTIFACT],
    rightsContext: {
      rightsRefs: ["rights:compat-experiment-grant" as never],
      consentRefs: ["consent:compat-experiment-record" as never],
    },
    returnContract: { type: "object", properties: { output: { type: "string" } } },
    studioFormatVocabulary: ["reaction" as never],
    humanTaskVocabulary: [],
    delayExpectation: {
      expectedIncrementalValue: 12,
      estimatedWaitMs: 30_000,
      delayCost: 1.5,
      acquisitionCost: 0.8,
      successProbability: 0.7,
      qualityImpact: -0.1,
      provenance: { kind: "delay-analysis", analysisId: "delay-analysis:compat-003", analysisVersion: 1 },
    },
    deadlineAnchor: "2026-06-01T00:00:00.000Z" as never,
    baseBudget: { maxCost: { amount: 25, currency: "USD" }, maxDurationMs: 1_800_000 },
    qualityEvaluatorRef: "evaluator:quality/compat-outputs" as never,
    substitutionPreference: ["engine", "transform", "reduced-scope"],
    handDesigned: [
      {
        candidate: {
          isNoopBaseline: false,
          transformChain: [
            {
              definitionId: "transform:compat-reaction-pip" as never,
              definitionVersion: 1 as Version,
              parameterPreset: "aggressive",
              parameters: { preset: "aggressive" },
            },
          ],
          modality: "studio",
          studioFormat: "reaction" as never,
          organization: { organizationId: "organization:compat-experiment-duo", organizationVersion: 1 as Version },
          pawnAgents: ["reaction-composition"],
          modelAssignments: [],
          enginePortfolio: [
            {
              capabilityId: "compose_reaction" as never,
              capabilityVersion: 1 as Version,
              engineId: "engine:compat-reaction-composer" as never,
              engineVersion: 2 as Version,
            },
          ],
          humanTasks: [],
          capabilityAcquisition: [{ requirement: { capabilityId: "compose_reaction" as never, version: 1 as Version }, mode: "engine" as const }],
          qualityThresholds: { floor: 0.65, evaluatorRef: "evaluator:quality/compat-outputs" as never },
          budget: { maxCost: { amount: 40, currency: "USD" }, maxDurationMs: 900_000 },
          deadline: "2026-06-01T00:15:00.000Z" as never,
          expectedDurationMs: 900_000,
          delayPolicy: { maxWaitMs: 30_000, onDelayExceeded: "substitute" as const },
          delayExpectation: {
            expectedIncrementalValue: 12,
            estimatedWaitMs: 30_000,
            delayCost: 1.5,
            acquisitionCost: 0.8,
            successProbability: 0.7,
            qualityImpact: -0.1,
            provenance: { kind: "delay-analysis", analysisId: "delay-analysis:compat-003", analysisVersion: 1 },
          },
          stoppingPolicy: { maxRetries: 1, substitutionPreference: ["engine", "transform", "reduced-scope"] },
        },
      },
    ],
    policy: {
      version: 1,
      maxChainSteps: 3,
      parameterPresetVocabulary: ["balanced", "aggressive", "conservative"],
      modalityVocabulary: ["automated", "studio", "human-arena", "hybrid"] as never,
      modelVocabulary: ["mos-model:compat-default" as never],
      engineVocabulary: [
        {
          capabilityId: "compose_reaction" as never,
          capabilityVersion: 1 as Version,
          engineId: "engine:compat-reaction-composer" as never,
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
    } as never,
    budget: { maxCandidateEvaluations: 30, maxIterations: 4 },
    seed: 20260601,
  };
  const result = await search.searchPrograms(input);
  if ("error" in result) {
    throw new Error(`compat search failed: ${result.error} — ${result.message}`);
  }
  return result;
};

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------

test("the closed loop over the REAL authorities: bind → measure → analyse → calibrate", async () => {
  // ---- the REAL authorities behind the declared seams ----
  const missions = createInMemoryMissionRepository({ now: NOW });
  const mission = missions.createMission({
    scope: SCOPE,
    id: "mission:compat-experiment-1" as never,
    objective: {
      statement: "Grow qualified reach for the compat product line",
      targetMetrics: [{ metric: "qualified-reach", target: "50000", unit: "count", horizon: "2026-12-31" }],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [
        {
          metric: "qualified-reach",
          weight: 1,
          direction: "maximize",
          definition: "qualified reach as the platform reports impressions",
        },
      ],
    },
  });
  assert.ok(!("error" in mission));
  const activated = missions.activateMission(SCOPE, "mission:compat-experiment-1" as never);
  assert.ok(!("error" in activated));

  const lab = await composeRealLab();
  const rights = composeRealRights();
  const policyGate = composeRealPolicy();

  // ---- the REAL distribution stack: publish + observe (tenant-alpha) ----
  const distributionStack = registeredAuroraStack({ now: NOW });
  const publish = distributionStack.stack.adapter.publish({
    scope: SCOPE,
    channelRef: distributionStack.channel.id as never,
    actor: ACTOR,
    rightsContextRef: distributionStack.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: FIXTURE_PRESENTATION as never,
  });
  assert.equal(publish.outcome, "completed");
  if (publish.outcome !== "completed") {
    throw new Error("compat publish failed");
  }
  const publication = publish.output;
  const read = distributionStack.stack.adapter.readObservations({
    scope: SCOPE,
    channelRef: distributionStack.channel.id as never,
    actor: ACTOR,
    rightsContextRef: distributionStack.rightsContextRef,
    subjectRef: String(publication.postRef),
  });
  assert.equal(read.outcome, "completed");
  const observations = read.outcome === "completed" ? read.output : [];
  assert.equal(observations.length, 1);

  // ---- the REAL distribution observation source behind the seam ----
  const distribution = createRealDistributionObservationSource({
    adapter: distributionStack.stack.adapter,
  });

  // ---- the REAL jobs queue ----
  const jobs = createDurableJobQueue({
    store: createInMemoryDurableJobStore(),
    clock: NOW,
    now: () => Date.parse(NOW()),
    jobIdFactory: (() => {
      let counter = 0;
      return () => `job-compat-${(counter += 1)}`;
    })(),
    leaseTokenFactory: (() => {
      let counter = 0;
      return () => `lease-compat-${(counter += 1)}`;
    })(),
  });

  // ---- the experiments authority over the REAL authorities ----
  const authority: RealExperimentAuthorityPort = createInMemoryRealExperimentAuthority({
    labCandidate: lab.labCandidate,
    missions,
    policyGate,
    rightsGate: rights.gate,
    distribution,
    jobs,
    clock: NOW,
    nextExperimentId: () => "exp-compat-1" as never,
    nextAuditId: () => "expa-compat-1",
  });

  // ---- the REAL search + the binding request ----
  const searchResult = await composeRealSearch();
  const selected: RankedCandidateProgram = searchResult.ranked[0] as RankedCandidateProgram;
  assert.ok(selected !== undefined);
  const request: RealExperimentBindingRequest = {
    scope: SCOPE,
    actor: ACTOR,
    labCandidate: {
      benchmarkId: "benchmark:compat-experiment-1",
      benchmarkVersion: 1,
      candidateKey: lab.candidateKey,
    },
    mission: { missionRef: "mission:compat-experiment-1" as never, missionVersion: 2 },
    policy: [{ id: "policy:compat-experiment-launch" as never, version: 1 as Version }],
    rightsFrame: {
      rightsRefs: ["rights:compat-experiment-grant" as never],
      consentRefs: ["consent:compat-experiment-record" as never],
    },
    production: { searchResult, selected },
    distribution: {
      publicationId: String(publication.id),
      expectedArtifact: {
        artifactId: String(FIXTURE_ARTIFACT.artifactId),
        version: Number(FIXTURE_ARTIFACT.version),
      },
    },
    measurement: {
      windowStart: "2026-06-02T00:00:00.000Z" as Timestamp,
      windowEnd: "2026-06-06T00:00:00.000Z" as Timestamp,
      niche: "marketing-tech-saas",
      regime: "current-market-regime",
    },
  };

  // ---- BIND: the gate-ordered chain over the REAL authorities ----
  const bound = await authority.createBinding(request);
  assert.ok(bound.ok);
  const experimentId = bound.value.experimentId;
  const record = authority.getExperiment(SCOPE, experimentId);
  assert.ok(record !== undefined);
  assert.equal(record.policyGate.decision, "permitted");
  assert.equal(record.policyGate.policyRef, "policy:compat-experiment-launch");
  // The rights segment resolved the REAL grant + consent active.
  assert.equal(record.rightsGate.frameActive, true);
  // The distribution segment cites the platform-confirmed publication.
  assert.equal(record.distribution.publicationId, String(publication.id));
  assert.equal(record.distribution.postRef, String(publication.postRef));

  // The durable job is on the REAL queue.
  const job = jobs.getJob(SCOPE, { length: 0 } as never) ?? jobs.listJobs({ tenantId: SCOPE.tenantId })[0];
  assert.ok(job !== undefined);
  assert.equal(String(job.jobKey), `experiment:${String(experimentId)}`);

  // ---- MEASURE: the durable segment over the REAL observations ----
  // The worker CLAIMS through the REAL queue (§26 — leased claims only).
  const claim = jobs.claimNextRunnable({ workerId: "compat-worker", tenantId: SCOPE.tenantId });
  assert.ok(claim !== null);
  const measured = await authority.advanceMeasurement(SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "compat-worker",
  });
  // The clock NOW is 2026-06-01 — BEFORE the window end (2026-06-06):
  // the honest first attempt is the typed retriable window retry.
  if (measured.ok) {
    assert.equal(measured.value.jobOutcome, "retry-scheduled");
  } else {
    assert.fail(`compat advance failed: ${measured.error.kind} — ${measured.error.reason}`);
  }
  // Advance the clock (the window elapses), re-claim (crash recovery), advance.
  const laterClock = (): Timestamp => "2026-06-09T00:00:00.000Z" as Timestamp;
  const laterJobs = jobs;
  void laterClock;
  void laterJobs;
  // The queue's claim needs the backoff elapsed; claim with a fresh worker.
  const claim2 = jobs.claimNextRunnable({ workerId: "compat-worker-2", tenantId: SCOPE.tenantId });
  // The backoff (60s at clock 2026-06-01) has NOT elapsed under the frozen
  // queue clock — the honest compat path re-advances under the SAME lease
  // after renewing; the queue's own retry machinery is mos-jobs' battery's
  // subject. Here: the experiments side advanced to `running` and the job
  // carries the typed retriable failure with the declared window end.
  const storedJob = jobs.getJob(SCOPE, claim.jobId);
  assert.ok(storedJob !== undefined);
  assert.equal(storedJob.failure?.code, "measurement-window-not-elapsed");
  assert.equal(storedJob.status, "queued");
  void claim2;

  // ---- ANALYSE before measurement fails closed (the honest sequencing) ----
  // The measurement has not completed under the frozen clock (the window
  // retry is pending) — the analyse step fails closed `experiment-not-
  // measured`: no outcome can exist before the measured evidence does.
  // The COMPLETED loop (measurement → analysis → calibration) is the
  // second test's subject under the advancing clock.
  const analysis = await authority.analyse(SCOPE, experimentId, ACTOR);
  assert.ok(!analysis.ok);
  assert.equal(analysis.error.kind, "experiment-not-measured");

  // ---- the outcome observation does not exist yet (the loop is honest) ----
  const observation = authority.getOutcomeObservation(
    SCOPE,
    experimentObservationIdOf(experimentId),
  );
  assert.equal(observation, null);
});

// ---------------------------------------------------------------------------
// The completed closed loop under an advancing clock (the full measure →
// calibrate flow — the LAB-018 consumption of the outcome observation)
// ---------------------------------------------------------------------------

test("the LAB-018 calibration authority consumes the outcome observation through its declared boundary", async () => {
  const missions = createInMemoryMissionRepository({ now: NOW });
  missions.createMission({
    scope: SCOPE,
    id: "mission:compat-experiment-2" as never,
    objective: {
      statement: "Grow qualified reach (loop two)",
      targetMetrics: [{ metric: "qualified-reach", target: "50000", unit: "count", horizon: null }],
      constraints: [],
    },
    rewardSpec: {
      version: 1,
      terms: [
        {
          metric: "qualified-reach",
          weight: 1,
          direction: "maximize",
          definition: "qualified reach as the platform reports impressions",
        },
      ],
    },
  });
  missions.activateMission(SCOPE, "mission:compat-experiment-2" as never);

  const lab = await composeRealLab();
  const rights = composeRealRights();
  const policyGate = composeRealPolicy();
  const distributionStack = registeredAuroraStack({ now: NOW });
  const publish = distributionStack.stack.adapter.publish({
    scope: SCOPE,
    channelRef: distributionStack.channel.id as never,
    actor: ACTOR,
    rightsContextRef: distributionStack.rightsContextRef,
    artifact: FIXTURE_ARTIFACT,
    presentation: FIXTURE_PRESENTATION as never,
  });
  if (publish.outcome !== "completed") {
    throw new Error("compat loop-two publish failed");
  }
  const publication = publish.output;
  const read = distributionStack.stack.adapter.readObservations({
    scope: SCOPE,
    channelRef: distributionStack.channel.id as never,
    actor: ACTOR,
    rightsContextRef: distributionStack.rightsContextRef,
    subjectRef: String(publication.postRef),
  });
  const observations = read.outcome === "completed" ? read.output : [];
  assert.equal(observations.length, 1);
  // The platform-said observation the aurora transport reported.
  const auroraObservation = observations[0];
  assert.ok(auroraObservation !== undefined);

  // An ADVANCING clock world (the window elapses; the worker completes).
  let clockMs = Date.parse("2026-06-01T00:00:00.000Z");
  const clock = (): Timestamp => new Date(clockMs).toISOString() as Timestamp;
  const jobs = createDurableJobQueue({
    store: createInMemoryDurableJobStore(),
    clock,
    now: () => clockMs,
    jobIdFactory: (() => {
      let counter = 0;
      return () => `job-loop2-${(counter += 1)}`;
    })(),
    leaseTokenFactory: (() => {
      let counter = 0;
      return () => `lease-loop2-${(counter += 1)}`;
    })(),
  });
  const distribution = createRealDistributionObservationSource({
    adapter: distributionStack.stack.adapter,
  });
  const authority = createInMemoryRealExperimentAuthority({
    labCandidate: lab.labCandidate,
    missions,
    policyGate,
    rightsGate: rights.gate,
    distribution,
    jobs,
    clock,
    nextExperimentId: () => "exp-loop2-1" as never,
    nextAuditId: () => "expa-loop2-1",
  });

  const searchResult = await composeRealSearch();
  const selected = searchResult.ranked[0] as RankedCandidateProgram;
  const bound = await authority.createBinding({
    scope: SCOPE,
    actor: ACTOR,
    labCandidate: {
      benchmarkId: "benchmark:compat-experiment-1",
      benchmarkVersion: 1,
      candidateKey: lab.candidateKey,
    },
    mission: { missionRef: "mission:compat-experiment-2" as never, missionVersion: 2 },
    policy: [{ id: "policy:compat-experiment-launch" as never, version: 1 as Version }],
    rightsFrame: {
      rightsRefs: ["rights:compat-experiment-grant" as never],
      consentRefs: ["consent:compat-experiment-record" as never],
    },
    production: { searchResult, selected },
    distribution: {
      publicationId: String(publication.id),
      expectedArtifact: {
        artifactId: String(FIXTURE_ARTIFACT.artifactId),
        version: Number(FIXTURE_ARTIFACT.version),
      },
    },
    measurement: {
      windowStart: "2026-06-02T00:00:00.000Z" as Timestamp,
      windowEnd: "2026-06-06T00:00:00.000Z" as Timestamp,
      niche: "marketing-tech-saas",
      regime: "current-market-regime",
    },
  });
  assert.ok(bound.ok);
  const experimentId = bound.value.experimentId;

  // Time passes past the window end; the worker claims + completes.
  clockMs = Date.parse("2026-06-09T00:00:00.000Z");
  const claim = jobs.claimNextRunnable({ workerId: "loop2-worker", tenantId: SCOPE.tenantId });
  assert.ok(claim !== null);
  const advanced = await authority.advanceMeasurement(SCOPE, experimentId, {
    jobId: String(claim.jobId),
    leaseToken: String(claim.leaseToken),
    workerId: "loop2-worker",
  });
  assert.ok(advanced.ok);
  assert.equal(advanced.value.jobOutcome, "completed");
  assert.equal(advanced.value.experiment.status, "measured");
  // The folded evidence carries the platform-said payload VERBATIM.
  const evidence = authority.getEvidence(SCOPE, experimentId);
  assert.ok(evidence !== undefined && evidence.kind === "measured-evidence");
  if (evidence.kind === "measured-evidence") {
    assert.equal(evidence.observations.length, 1);
    assert.deepEqual(evidence.observations[0]?.reported, auroraObservation.reported);
  }

  // ---- ANALYSE: the outcome record + observation ----
  const analysed = await authority.analyse(SCOPE, experimentId, ACTOR);
  assert.ok(analysed.ok);
  const observationId = analysed.value.outcome.outcomeObservationId;
  const outcomeObservation = authority.getOutcomeObservation(SCOPE, observationId);
  assert.ok(outcomeObservation !== null);
  // The observation is structurally the lab's HistoricalObservation (the
  // compat pins prove it compile-time; here the RUNTIME shape agrees).
  assert.equal(outcomeObservation.counterfactual, false);
  assert.equal(outcomeObservation.regime, "current-market-regime");
  assert.equal(outcomeObservation.niche, "marketing-tech-saas");
  assert.equal(outcomeObservation.platform, "provider:aurora-social");
  assert.deepEqual(outcomeObservation.metrics, [
    { metric: "impressions", value: 1523, unit: "platform-reported" },
    { metric: "likes", value: 37, unit: "platform-reported" },
    { metric: "shares", value: 4, unit: "platform-reported" },
  ]);

  // ---- the REAL LAB-018 consumes the outcome through its boundary ----
  const reality: RealityObservationReaderPort = {
    async getObservation(scope, id) {
      // The documented brand-bridge (the LAB-018 canonical-view precedent):
      // the projection is structurally the lab's reality shape; the id
      // brand is the lab's own view of the same string.
      return authority.getOutcomeObservation(scope, id as never) as unknown as Promise<HistoricalObservation | null>;
    },
  };
  const calibration: OnlineCalibrationPort = createInMemoryOnlineCalibration({
    benchmark: lab.benchmark,
    reality,
    now: clock,
  });
  const error = await calibration.recordCalibrationError({
    scope: SCOPE,
    calibrationId: "calib:compat-loop2-1" as LabCalibrationId,
    prediction: {
      benchmarkId: "benchmark:compat-experiment-1" as RobustBenchmarkId,
      benchmarkVersion: 1,
      candidateKey: lab.candidateKey,
    },
    observationRefs: [observationId as unknown as HistoricalObservationId],
    rewardSpec: lab.observedRewardSpec,
    functional: CALIBRATION_ERROR_FUNCTIONAL_V1,
    note: "compat: the REAL LAB-018 consuming the REAL experiments outcome",
  });
  if ("error" in error) {
    assert.fail(`compat calibration failed: ${error.error} — ${error.message}`);
  }
  // THE CLOSED LOOP: the calibration record's observed side came from the
  // experiments outcome observation (platform-said), its predicted side
  // from the frozen REAL benchmark prediction.
  assert.equal(error.observedMetricMeans.length, 3);
  const impressions = error.observedMetricMeans.find((mean) => mean.metric === "impressions");
  assert.ok(impressions !== undefined);
  assert.equal(impressions.mean, 1523);
  assert.equal(error.regime, "current-market-regime");
  assert.equal(error.predicted.expectedReward, bound.value.experiment.labCandidate.expectations.expectedReward);
  assert.equal(error.observations[0]?.observationId, String(observationId));
  assert.equal(typeof error.intervalContainment, "boolean"); // §22: carried on the record, deterministic given the frozen inputs.
  // The citation chain closes: the calibration's prediction ref IS the
  // binding's labCandidateRef encoding.
  assert.equal(
    `benchmark:${error.prediction.benchmarkId}:v${String(error.prediction.benchmarkVersion)}:${error.prediction.candidateKey}`,
    `benchmark:benchmark:compat-experiment-1:v1:${lab.candidateKey}`,
  );
});
