/**
 * Contract-name-to-projection mapping for the MOS core contracts
 * (CORE-001).
 *
 * `ContractsByName` maps every contract name in
 * spec/contracts/core-contracts-v2.0.yaml to its TypeScript projection in
 * this package. The mapping is the compile-time anchor used by the
 * CONTRACT_REQUIRED_FIELDS `satisfies` clause and by the type-level
 * validation tests (src/type-tests.ts): field names in the required-field
 * index must be keys of the matching projection interface.
 */

import type { AgentBody, AgentInstance, AgentOrganization } from "./agent.js";
import type { Artifact, ArtifactRef } from "./artifact.js";
import type { Capability } from "./capability.js";
import type { Engine, EngineBenchmark } from "./engine.js";
import type { EngineJob, EngineResult } from "./engine-job.js";
import type {
  BottleneckDecision,
  HumanProductionTask,
} from "./human-task.js";
import type {
  CalibrationRecord,
  LabRun,
  LabScenario,
  RealExperimentBinding,
} from "./lab.js";
import type {
  ConnectorProvider,
  PlatformHealthObservation,
  SocialAdapter,
} from "./integration.js";
import type { ProductionGraph } from "./production-graph.js";
import type { ProductionRequest } from "./production-request.js";
import type {
  StudioArtifactPackage,
  StudioFormat,
  StudioSession,
} from "./studio.js";
import type { Transform } from "./transform.js";

/** Version of the frozen contract manifest this projection is derived from. */
export const CONTRACT_MANIFEST_VERSION = "2.0";

/** Maps each core contract name to its TypeScript projection. */
export interface ContractsByName {
  readonly Capability: Capability;
  readonly Engine: Engine;
  readonly Transform: Transform;
  readonly Artifact: Artifact;
  readonly ProductionGraph: ProductionGraph;
  readonly AgentBody: AgentBody;
  readonly AgentInstance: AgentInstance;
  readonly AgentOrganization: AgentOrganization;
  readonly ProductionRequest: ProductionRequest;
  readonly StudioSession: StudioSession;
  readonly StudioArtifactPackage: StudioArtifactPackage;
  readonly HumanProductionTask: HumanProductionTask;
  readonly BottleneckDecision: BottleneckDecision;
  readonly LabScenario: LabScenario;
  readonly LabRun: LabRun;
  readonly CalibrationRecord: CalibrationRecord;
  readonly EngineBenchmark: EngineBenchmark;
  readonly RealExperimentBinding: RealExperimentBinding;
  readonly EngineJob: EngineJob;
  readonly EngineResult: EngineResult;
  readonly ArtifactRef: ArtifactRef;
  readonly StudioFormat: StudioFormat;
  readonly SocialAdapter: SocialAdapter;
  readonly ConnectorProvider: ConnectorProvider;
  readonly PlatformHealthObservation: PlatformHealthObservation;
}

/** The names of all core contracts, in frozen-YAML order. */
export type ContractName = keyof ContractsByName;
