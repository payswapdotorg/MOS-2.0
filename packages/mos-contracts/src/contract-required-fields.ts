/**
 * Machine-readable required-field index for the MOS core contracts
 * (CORE-001 CONTRACT VALIDATION TEST anchor).
 *
 * `CONTRACT_REQUIRED_FIELDS` maps every contract name in
 * spec/contracts/core-contracts-v2.0.yaml to the exact list of its required
 * fields, in YAML order. The `satisfies` clause makes the constant
 * compile-time-checked against the TypeScript projection: every listed
 * field name must be a key of the matching contract interface, so removing
 * a required field from a contract breaks the build HERE, and the runtime
 * test (src/contracts.test.ts) additionally cross-checks against the
 * vendored JSON fixture (src/fixtures/core-contracts-required-fields.json)
 * which was hand-derived independently from the frozen YAML.
 *
 * Field non-optionality (no `?`) is enforced by src/type-tests.ts.
 */

import type { ContractName, ContractsByName } from "./contracts-by-name.js";

/**
 * The required-field index: contract name → required field names, exactly
 * as listed in the frozen YAML's `contracts.<Name>.required`, in order.
 * The readable long-form derivation lives in the vendored JSON fixture.
 */
export const CONTRACT_REQUIRED_FIELDS = {
  Capability: ["id", "version", "inputSchema", "outputSchema", "evaluator", "costModel", "latencyModel", "provenance"],
  Engine: ["id", "version", "capabilityIds", "adapterRef", "inputContract", "outputContract", "resources", "deterministic", "license", "security", "provenance", "benchmark"],
  Transform: ["id", "version", "inputTypes", "outputTypes", "parameters", "capabilityRequirements", "evaluator", "costModel", "latencyModel", "rightsRequirements", "policyRequirements", "lineageRules"],
  Artifact: ["id", "version", "tenantId", "type", "digest", "storageRef", "provenanceRef", "rightsRef", "lineage", "creationMethod"],
  ProductionGraph: ["id", "version", "inputs", "nodes", "edges", "acceptanceCriteria", "budget", "stoppingPolicy"],
  AgentBody: ["id", "version", "roleContract", "inputContract", "outputContract", "tools", "permissions", "memory", "communication", "actionInterface", "capabilities", "budget", "latency", "evaluator", "safety"],
  AgentInstance: ["bodyVersion", "modelRef", "runtimeRef", "toolRefs", "capabilityRefs"],
  AgentOrganization: ["id", "version", "nodes", "edges", "modelAssignments", "memoryPolicy", "budgetPolicy", "terminationPolicy", "evaluator"],
  ProductionRequest: ["id", "version", "scope", "objective", "sourceArtifacts", "strategyRef", "transformGraphRef", "organizationRef", "studioFormat", "capabilityRequirements", "humanTasks", "acceptanceCriteria", "budget", "deadline", "delayPolicy", "rightsContext", "returnContract"],
  StudioSession: ["id", "version", "productionRequestRef", "formatVersion", "organizationRef", "participants", "lifecycle", "artifactPackageRef"],
  StudioArtifactPackage: ["id", "version", "sessionRef", "rawArtifacts", "intermediateArtifacts", "finalArtifacts", "transcriptRefs", "conversationGraphRef", "editGraphRef", "provenance", "consent", "evaluation", "cost", "duration"],
  HumanProductionTask: ["id", "version", "objective", "sourceRefs", "scriptOrQuestions", "captureBrief", "targetOutput", "rightsConsent", "evaluator", "deadline", "expectedValueOfWaiting", "acceptableSubstitutions"],
  BottleneckDecision: ["id", "version", "dependency", "expectedIncrementalValue", "expectedWait", "delayCost", "acquisitionCost", "successProbability", "qualityImpact", "selectedAction"],
  LabScenario: ["id", "version", "niche", "platform", "objective", "context", "budget", "informationLag", "corpusVersion", "simulatorVersion", "rewardVersion"],
  LabRun: ["id", "version", "scenarioRef", "seed", "cutoff", "worldModelVersion", "strategyCandidates", "lifecycle", "predictionSummary", "uncertaintySummary"],
  CalibrationRecord: ["id", "version", "labRunRef", "worldModelVersion", "simulatedPrediction", "uncertainty", "observedOutcome", "predictionError", "regime", "updateVersion"],
  EngineBenchmark: ["id", "capabilityVersion", "engineVersion", "benchmarkCorpusRef", "evaluatorVersion", "metrics", "cost", "latency", "licenseStatus", "result"],
  RealExperimentBinding: ["id", "labCandidateRef", "missionRef", "productionRequestRef", "policyRef", "rightsRef", "distributionRef", "experimentRef", "evidenceRef"],
  EngineJob: ["id", "capabilityId", "capabilityVersion", "engineId", "engineVersion", "inputArtifactRefs", "parameters", "seed", "resourceLimits", "outputContract"],
  EngineResult: ["jobId", "outputArtifactRefs", "metrics", "provenance", "duration", "resourceUsage", "cost", "warnings", "failure"],
  ArtifactRef: ["artifactId", "version", "tenantId", "digest", "type", "storageRef", "rightsRef", "provenanceRef"],
  StudioFormat: ["id", "version", "inputRequirements", "participantModel", "captureRequirements", "interviewerRequirements", "organizationCompatibility", "outputContract", "provenanceRequirements", "evaluationHooks"],
  SocialAdapter: ["provider", "version", "capabilityMatrix", "accountOperations", "contentOperations", "analyticsOperations", "publishingOperations", "restrictionObservations"],
  ConnectorProvider: ["providerId", "version", "capabilities", "authentication", "invocationContract", "evidenceModel", "errorModel", "rateLimitObservation"],
  PlatformHealthObservation: ["id", "accountRef", "provider", "observedAt", "observableSignals", "healthState", "confidence", "uncertainty", "maneuvers"],
} as const satisfies {
  readonly [K in ContractName]: readonly (keyof ContractsByName[K] & string)[];
};

Object.freeze(CONTRACT_REQUIRED_FIELDS);

/** Names of all core contracts, in frozen-YAML order. */
export const CONTRACT_NAMES: readonly ContractName[] = Object.freeze(
  Object.keys(CONTRACT_REQUIRED_FIELDS) as readonly ContractName[],
);

/**
 * Returns the frozen required-field list for one core contract.
 * Throws (fail-closed) for unknown contract names.
 */
export function getRequiredFields(contract: ContractName): readonly string[] {
  const fields = CONTRACT_REQUIRED_FIELDS[contract];
  if (fields === undefined) {
    throw new Error(`Unknown core contract name: ${String(contract)}`);
  }
  return fields;
}

/**
 * Runtime shape guard: does `record` carry every required field of the
 * named core contract (present and not `undefined`)? Structural, not
 * deep — it validates the contract's required surface, which is exactly
 * what registries gate on at registration time.
 */
export function hasRequiredFields(
  record: object,
  contract: ContractName,
): boolean {
  const fields = CONTRACT_REQUIRED_FIELDS[contract];
  if (fields === undefined) {
    return false;
  }
  for (const field of fields) {
    if ((record as Record<string, unknown>)[field] === undefined) {
      return false;
    }
  }
  return true;
}

/**
 * Fail-closed assertion version of {@link hasRequiredFields}: throws naming
 * every missing required field.
 */
export function assertRequiredFields(
  record: object,
  contract: ContractName,
): void {
  const fields = CONTRACT_REQUIRED_FIELDS[contract];
  if (fields === undefined) {
    throw new Error(`Unknown core contract name: ${String(contract)}`);
  }
  const missing = fields.filter(
    (field) => (record as Record<string, unknown>)[field] === undefined,
  );
  if (missing.length > 0) {
    throw new Error(
      `Contract ${String(contract)} is missing required fields: ${missing.join(", ")}`,
    );
  }
}
