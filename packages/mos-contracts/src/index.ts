/**
 * Public surface of `@mos/contracts` (MOS v2.0 CORE-001).
 *
 * The complete TypeScript projection of spec/contracts/core-contracts-v2.0.yaml
 * (25 contracts), the shared value-type vocabulary, and the machine-readable
 * required-field index with its runtime guards.
 *
 * Export budget: 4 runtime functions (getRequiredFields,
 * hasRequiredFields, assertRequiredFields, isValidTenantId) + 4 frozen
 * constants (CONTRACT_REQUIRED_FIELDS, CONTRACT_NAMES,
 * CONTRACT_MANIFEST_VERSION, TENANT_ID_GRAMMAR / TENANT_ID_GRAMMAR_PATTERN_SOURCE).
 * Everything else is type-only. Well within the architecture policy budget
 * of 12 public functions. (W11-B: the tenant-id grammar pair backs the
 * tenant-id-grammar ACR — docs/architecture/TENANT-ID-GRAMMAR-ACR-v1.md.)
 */

// ---- Shared value types ----
export type {
  AccountRef,
  AdapterRef,
  ArtifactId,
  ArtifactType,
  AuthorizationRef,
  BenchmarkCorpusRef,
  BottleneckDecisionId,
  Branded,
  Budget,
  CalibrationRecordId,
  CapabilityId,
  CapabilityRequirement,
  ConsentRef,
  ContentDigest,
  ConversationGraphRef,
  CostBasis,
  CostModel,
  DistributionRef,
  EditGraphRef,
  EngineBenchmarkId,
  EngineId,
  EngineJobId,
  EvaluatorRef,
  EvidenceRef,
  ExperimentBindingId,
  ExperimentRef,
  HumanProductionTaskId,
  IdentityRef,
  JsonSchemaObject,
  JsonObject,
  LabCandidateRef,
  LabRunId,
  LabScenarioId,
  LatencyModel,
  Milliseconds,
  MissionRef,
  ModelRef,
  MoneyAmount,
  PermissionRef,
  PlatformHealthObservationId,
  PolicyRef,
  ProductionGraphId,
  ProductionRequestId,
  ProvenanceRef,
  ProviderId,
  RightsRef,
  RuntimeRef,
  StorageRef,
  StrategyRef,
  StudioArtifactPackageId,
  StudioFormatId,
  StudioSessionId,
  TenantId,
  TenantScope,
  Timestamp,
  ToolRef,
  TransformGraphRef,
  TransformId,
  UncertaintyLevel,
  UncertaintySummary,
  Version,
  WorkspaceId,
  AcceptanceCriterion,
} from "./value-types.js";

// ---- Contract families ----
export type { Capability } from "./capability.js";
export type {
  BenchmarkMetrics,
  BenchmarkResult,
  Engine,
  EngineBenchmark,
  EngineLicense,
  EngineSecurity,
  LicenseRecord,
  LicenseReviewStatus,
  ResourceProfile,
} from "./engine.js";
export type {
  EngineJob,
  EngineJobFailure,
  EngineResult,
  EngineWarning,
  ResourceLimits,
  ResourceUsage,
  RunProvenance,
} from "./engine-job.js";
export type { Transform, TransformCapabilityRequirement } from "./transform.js";
export type { Artifact, ArtifactRef, CreationMethod } from "./artifact.js";
export type {
  ProductionGraph,
  ProductionGraphEdge,
  ProductionGraphNode,
  ProductionGraphNodeKind,
  StoppingPolicy,
} from "./production-graph.js";
export type {
  AgentBody,
  AgentInstance,
  AgentOrganization,
  AgentOrganizationEdge,
  AgentOrganizationEdgeKind,
  AgentOrganizationNode,
  AgentRoleContract,
  BudgetPolicy,
  CommunicationPolicy,
  MemoryPolicy,
  MemoryScope,
  ModelAssignment,
  SafetyPolicy,
  SafetyProhibition,
  TerminationPolicy,
} from "./agent.js";
export type {
  DelayExceededAction,
  DelayPolicy,
  ProductionRequest,
  RightsContext,
} from "./production-request.js";
export type {
  CaptureRequirements,
  EvaluationHook,
  InterviewerRequirements,
  SessionParticipant,
  SessionStateTransition,
  StudioArtifactPackage,
  StudioEvaluation,
  StudioEvaluationVerdict,
  StudioFormat,
  StudioSession,
  StudioSessionLifecycle,
  StudioSessionLifecycleState,
} from "./studio.js";
export type {
  AcceptableSubstitution,
  BottleneckAction,
  BottleneckDecision,
  HumanProductionTask,
  TargetOutput,
} from "./human-task.js";
export type {
  CalibrationRecord,
  LabRun,
  LabRunLifecycleState,
  LabScenario,
  RealExperimentBinding,
} from "./lab.js";
export type {
  AuthenticationModel,
  ConnectorProvider,
  PlatformHealthObservation,
  PlatformHealthState,
  RateLimitObservation,
  RestrictionObservation,
  SocialAdapter,
} from "./integration.js";

// ---- Tenant-id grammar (W11-B ACR; docs/architecture/TENANT-ID-GRAMMAR-ACR-v1.md) ----
export type { TenantIdGrammar } from "./tenant-id-grammar.js";
export {
  TENANT_ID_GRAMMAR,
  TENANT_ID_GRAMMAR_PATTERN_SOURCE,
  isValidTenantId,
} from "./tenant-id-grammar.js";

// ---- Machine-readable required-field index + guards ----
export type {
  ContractName,
  ContractsByName,
} from "./contracts-by-name.js";
export { CONTRACT_MANIFEST_VERSION } from "./contracts-by-name.js";
export {
  CONTRACT_NAMES,
  CONTRACT_REQUIRED_FIELDS,
  assertRequiredFields,
  getRequiredFields,
  hasRequiredFields,
} from "./contract-required-fields.js";
