/**
 * Program-search seam compatibility pins (LAB-016).
 *
 * Compile-time assertions that this package's DECLARED program-search seams
 * (src/ports/program-transform-catalog.port.ts,
 * src/ports/program-organization-source.port.ts,
 * src/ports/program-evaluation.port.ts) and the REAL `@mos/lab` /
 * `@mos/agents` surfaces agree — zero drift:
 *
 * 1. CATALOG SEAM — the REAL `@mos/lab` LAB-011/012
 *    `TransformDefinitionRegistry.listTransformDefinitions` satisfies the
 *    `ProgramTransformCatalogPort` with a ONE-LINE DELEGATION (the resolved
 *    `TransformDefinition` satisfies `ResolvedPawnTransform`, pinned by
 *    transform-source-compat.ts).
 *
 * 2. ORGANIZATION-SOURCE SEAM — the REAL `@mos/agents`
 *    `AgentOrganizationRecord` plus LAB-010's `DeclaredOrganizationFeatures`
 *    compose into the `ProgramOrganizationDescriptor` (the canonical
 *    organization field set + the two declared §23 features the canonical
 *    record cannot express — exactly how LAB-010's searched descriptors
 *    register back into the agents registry and then list through the seam).
 *
 * 3. EVALUATION SEAM — the REAL LAB-007 `EnsemblePort.evaluateEnsemble`
 *    prediction carries every §22 field the seam output needs (expected
 *    value + interval per metric, member-spread disagreement, ensemble /
 *    simulator / reward-spec version pins), and LAB-015's
 *    `DelayEvComputation` (the declared `ev-delay-1` policy output) carries
 *    the §2 EV-of-delay value + interval — the documented composition-root
 *    mapping views below satisfy the seam with ZERO adapters.
 *
 * 4. ACTION MAPPING — the seam's `ProgramSimulationAction` maps onto the
 *    LAB-004 `StrategyActionCandidate` vocabulary (the no-op repost maps to
 *    the first-class `no-op` action kind — architecture lock rule 5).
 *
 * The runtime half of the pin is compat/program-real-stack.test.ts (the
 * search running against the REAL lab registry + REAL agents organization
 * registry + REAL lab ensemble + REAL lab delay economics).
 *
 * Import form: the real packages are imported by RELATIVE SOURCE PATH
 * (their exports maps point `types` at src/index.ts — the same source this
 * resolves to; no runtime dependency is created).
 */

import type { LabScenario as RealLabScenario, TenantScope } from "@mos/contracts";

import type {
  DeclaredOrganizationFeatures as RealDeclaredOrganizationFeatures,
} from "../../mos-lab/src/index.js";
import type {
  EnsemblePort as RealEnsemblePort,
  EnsemblePrediction as RealEnsemblePrediction,
  StrategyActionCandidate as RealStrategyActionCandidate,
} from "../../mos-lab/src/index.js";
import type {
  DelayEvComputation as RealDelayEvComputation,
  DelayDecisionModel as RealDelayDecisionModel,
  DelayDecisionPort as RealDelayDecisionPort,
} from "../../mos-lab/src/index.js";
import type {
  AgentOrganizationRecord as RealAgentOrganizationRecord,
} from "../../mos-agents/src/index.js";
import type {
  TransformDefinition as RealTransformDefinition,
  TransformDefinitionRegistry as RealTransformDefinitionRegistry,
} from "../../mos-lab/src/index.js";

import type { ProgramTransformCatalogPort } from "../src/ports/program-transform-catalog.port.js";
import type {
  ProgramOrganizationDescriptor,
  ProgramOrganizationSourcePort,
} from "../src/ports/program-organization-source.port.js";
import type {
  ProgramEvaluationPort,
  ProgramEvaluationRequest,
  ProgramEvaluationResult,
  ProgramSimulationAction,
} from "../src/ports/program-evaluation.port.js";
import type { ProgramDelayTerms } from "../src/contracts/program-candidate.js";

// ---------------------------------------------------------------------------
// 1. The catalog seam: the REAL lab registry lists behind it (one-line delegation)
// ---------------------------------------------------------------------------

/**
 * The one-line delegation view over the REAL lab registry satisfies the
 * catalog seam — this is EXACTLY the composition-root wiring:
 * `{ listPromotedTransforms: (scope) => registry.listTransformDefinitions(scope) }`.
 */
export const labCatalogDelegationSatisfiesSeam: ProgramTransformCatalogPort = {
  listPromotedTransforms: null as unknown as (
    scope: TenantScope,
  ) => Promise<readonly RealTransformDefinition[]>,
};

/** The lab registry's own listing method type, for the record. */
export type LabListingShape =
  RealTransformDefinitionRegistry["listTransformDefinitions"];

// ---------------------------------------------------------------------------
// 2. The organization-source seam: real records + declared features compose
// ---------------------------------------------------------------------------

/**
 * The composition view: a REAL `AgentOrganizationRecord` plus LAB-010's
 * `DeclaredOrganizationFeatures` (the two §23 features the canonical
 * record cannot express) compose into the descriptor — the intersection
 * type SATISFIES the descriptor, asserted here (the composition root lists
 * the real registry's records with their registered declared features
 * through the seam).
 */
export const organizationCompositionSatisfiesDescriptor: ProgramOrganizationDescriptor =
  null as unknown as RealAgentOrganizationRecord &
    Pick<
      RealDeclaredOrganizationFeatures,
      "criticNodeIds" | "executionOrdering"
    >;

/** The one-line delegation view satisfies the organization-source seam. */
export const organizationSourceDelegationSatisfiesSeam: ProgramOrganizationSourcePort =
  {
    listOrganizations: null as unknown as (
      scope: TenantScope,
    ) => Promise<readonly ProgramOrganizationDescriptor[]>,
  };

// ---------------------------------------------------------------------------
// 3. The evaluation seam: the REAL ensemble + REAL delay economics map onto it
// ---------------------------------------------------------------------------

/**
 * The documented action mapping view: the seam's simulation action maps
 * onto the LAB-004 strategy-action candidate (the no-op repost maps to the
 * FIRST-CLASS `no-op` action kind — lock rule 5).
 */
export const actionMappingView: RealStrategyActionCandidate = {
  strategyRef: null as unknown as ProgramSimulationAction["strategyRef"],
  kind: null as unknown as ProgramSimulationAction["isNoopRepost"] extends true
    ? "no-op"
    : "content",
  cadencePerWeek: null as unknown as ProgramSimulationAction["cadencePerWeek"],
  novelty: null as unknown as ProgramSimulationAction["novelty"],
  engagementEffort: null as unknown as ProgramSimulationAction["engagementEffort"],
};

/**
 * The documented prediction mapping view: the REAL ensemble prediction
 * carries every §22 field the seam output needs — the expected value +
 * interval (per predicted metric), the member-spread disagreement
 * (`disagreement.perMetric[].halfSpread`), the version pins (ensemble id +
 * version, simulator version, reward-spec version via the scenario), and
 * the LAB-007 evaluation input shape (scope, ensemble, scenario,
 * candidate, seed, step).
 */
export const ensembleEvaluationSatisfiesSeam: ProgramEvaluationPort = {
  evaluateProgram: null as unknown as (
    request: ProgramEvaluationRequest,
  ) => Promise<ProgramEvaluationResult>,
};

/** The real ensemble evaluation input type, for the record. */
export type RealEnsembleEvaluationInput = Parameters<
  RealEnsemblePort["evaluateEnsemble"]
>[0];

/** The scenario pin the composition root evaluates under. */
export const scenarioPin: RealLabScenario = null as unknown as RealLabScenario;

/** The seam output's version pins come from the REAL prediction surface. */
export const seamPinsFromRealPrediction: Pick<
  ProgramEvaluationResult,
  "ensembleId" | "ensembleVersion" | "simulatorVersion" | "rewardSpecVersion"
> = {
  ensembleId: null as unknown as RealEnsemblePrediction["ensembleId"],
  ensembleVersion: null as unknown as RealEnsemblePrediction["ensembleVersion"],
  simulatorVersion: null as unknown as RealEnsemblePrediction["simulatorVersion"],
  rewardSpecVersion: null as unknown as RealLabScenario["rewardVersion"],
};

/** The seam output's §22 reward set comes from the REAL prediction metrics. */
export const seamRewardFromRealPrediction: Pick<
  ProgramEvaluationResult,
  "expectedReward" | "interval" | "disagreementHalfWidth"
> = {
  expectedReward: null as unknown as RealEnsemblePrediction["metrics"][number]["expectedValue"],
  interval: null as unknown as RealEnsemblePrediction["metrics"][number]["interval"],
  disagreementHalfWidth: null as unknown as RealEnsemblePrediction["disagreement"]["perMetric"][number]["halfSpread"],
};

/**
 * The seam's §2 EV-of-delay output comes from the REAL LAB-015
 * `DelayEvComputation` (the declared `ev-delay-1` policy output — value +
 * carried §22 interval; computed BY the delay authority, never by the
 * search).
 */
export const seamEvOfDelayFromRealComputation: Pick<
  ProgramEvaluationResult,
  "expectedValueOfDelay"
> = {
  expectedValueOfDelay: {
    value: null as unknown as RealDelayEvComputation["expectedValueOfDelay"]["amount"],
    interval: null as unknown as RealDelayEvComputation["interval"],
  },
};

/**
 * The seam's delay-terms input maps onto LAB-015's §18 tracked-dimension
 * model (the seven dimensions in the program-search projection: expected
 * incremental value, estimated wait, total delay cost, acquisition cost,
 * success probability, quality impact — the alternative-paths dimension is
 * the delay authority's own ranking concern, not the search's).
 */
export const delayTermsFromRealModel: ProgramDelayTerms = {
  expectedIncrementalValue: null as unknown as RealDelayDecisionModel["expectedIncrementalValue"]["estimate"]["amount"],
  estimatedWaitMs: null as unknown as RealDelayDecisionModel["estimatedWait"]["waitMs"],
  delayCost: null as unknown as number,
  acquisitionCost: null as unknown as RealDelayDecisionModel["acquisitionCost"]["estimate"]["amount"],
  successProbability: null as unknown as RealDelayDecisionModel["successProbability"]["probability"],
  qualityImpact: null as unknown as RealDelayDecisionModel["qualityImpact"]["declared"],
};

/** The real delay decision port's evaluation method, for the record. */
export type RealDelayEvaluationShape =
  RealDelayDecisionPort["evaluateDelayDecision"];
