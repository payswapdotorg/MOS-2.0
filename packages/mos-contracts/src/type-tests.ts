/**
 * Compile-time contract validation tests (CORE-001).
 *
 * These are TYPE-LEVEL assertions only — they emit no runtime code. They
 * fail `tsc --noEmit` (and therefore every `tsc -b` build and test run)
 * when:
 *
 * 1. a required field listed in CONTRACT_REQUIRED_FIELDS is missing from a
 *    contract interface (enforced by the `satisfies` clause on the constant
 *    itself — the field names must be `keyof` the projection), or
 * 2. a required field exists but became optional (`?`) — enforced by the
 *    `AllFieldsRequired` checks below: `Pick<T, K>` must extend
 *    `Required<Pick<T, K>>` only when every field in K is non-optional, or
 * 3. the contract name set drifts (CONTRACT_REQUIRED_FIELDS keys must
 *    exactly equal the ContractsByName keys), or
 * 4. the TypeScript projection and the machine-readable index fall out of
 *    sync in any other structural way.
 */

import { CONTRACT_REQUIRED_FIELDS } from "./contract-required-fields.js";
import type {
  ContractName,
  ContractsByName,
} from "./contracts-by-name.js";

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

/** Compile-time assertion helper: the expression must resolve to `true`. */
export type Expect<T extends true> = T;

/** Strict type equality. */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/**
 * True only when every field of `K` is a non-optional property of `T`:
 * `Pick<T, K>` extends `Required<Pick<T, K>>` fails the moment any picked
 * field is optional.
 */
export type AllFieldsRequired<
  T,
  K extends readonly (keyof T & string)[],
> = Pick<T, K[number]> extends Required<Pick<T, K[number]>> ? true : false;

// --- (3) contract name sets must be exactly equal -------------------------
type _ContractNamesExactlyMatchYamlIndex = Expect<
  Equal<ContractName, keyof typeof CONTRACT_REQUIRED_FIELDS>
>;
type _ProjectionCoversExactlyTheYamlContracts = Expect<
  Equal<keyof ContractsByName, keyof typeof CONTRACT_REQUIRED_FIELDS>
>;

// --- (2) every required field must be non-optional in the projection ------
type _CapabilityFieldsAreRequired = Expect<
  AllFieldsRequired<Capability, typeof CONTRACT_REQUIRED_FIELDS.Capability>
>;
type _EngineFieldsAreRequired = Expect<
  AllFieldsRequired<Engine, typeof CONTRACT_REQUIRED_FIELDS.Engine>
>;
type _TransformFieldsAreRequired = Expect<
  AllFieldsRequired<Transform, typeof CONTRACT_REQUIRED_FIELDS.Transform>
>;
type _ArtifactFieldsAreRequired = Expect<
  AllFieldsRequired<Artifact, typeof CONTRACT_REQUIRED_FIELDS.Artifact>
>;
type _ProductionGraphFieldsAreRequired = Expect<
  AllFieldsRequired<ProductionGraph, typeof CONTRACT_REQUIRED_FIELDS.ProductionGraph>
>;
type _AgentBodyFieldsAreRequired = Expect<
  AllFieldsRequired<AgentBody, typeof CONTRACT_REQUIRED_FIELDS.AgentBody>
>;
type _AgentInstanceFieldsAreRequired = Expect<
  AllFieldsRequired<AgentInstance, typeof CONTRACT_REQUIRED_FIELDS.AgentInstance>
>;
type _AgentOrganizationFieldsAreRequired = Expect<
  AllFieldsRequired<AgentOrganization, typeof CONTRACT_REQUIRED_FIELDS.AgentOrganization>
>;
type _ProductionRequestFieldsAreRequired = Expect<
  AllFieldsRequired<ProductionRequest, typeof CONTRACT_REQUIRED_FIELDS.ProductionRequest>
>;
type _StudioSessionFieldsAreRequired = Expect<
  AllFieldsRequired<StudioSession, typeof CONTRACT_REQUIRED_FIELDS.StudioSession>
>;
type _StudioArtifactPackageFieldsAreRequired = Expect<
  AllFieldsRequired<StudioArtifactPackage, typeof CONTRACT_REQUIRED_FIELDS.StudioArtifactPackage>
>;
type _HumanProductionTaskFieldsAreRequired = Expect<
  AllFieldsRequired<HumanProductionTask, typeof CONTRACT_REQUIRED_FIELDS.HumanProductionTask>
>;
type _BottleneckDecisionFieldsAreRequired = Expect<
  AllFieldsRequired<BottleneckDecision, typeof CONTRACT_REQUIRED_FIELDS.BottleneckDecision>
>;
type _LabScenarioFieldsAreRequired = Expect<
  AllFieldsRequired<LabScenario, typeof CONTRACT_REQUIRED_FIELDS.LabScenario>
>;
type _LabRunFieldsAreRequired = Expect<
  AllFieldsRequired<LabRun, typeof CONTRACT_REQUIRED_FIELDS.LabRun>
>;
type _CalibrationRecordFieldsAreRequired = Expect<
  AllFieldsRequired<CalibrationRecord, typeof CONTRACT_REQUIRED_FIELDS.CalibrationRecord>
>;
type _EngineBenchmarkFieldsAreRequired = Expect<
  AllFieldsRequired<EngineBenchmark, typeof CONTRACT_REQUIRED_FIELDS.EngineBenchmark>
>;
type _RealExperimentBindingFieldsAreRequired = Expect<
  AllFieldsRequired<RealExperimentBinding, typeof CONTRACT_REQUIRED_FIELDS.RealExperimentBinding>
>;
type _EngineJobFieldsAreRequired = Expect<
  AllFieldsRequired<EngineJob, typeof CONTRACT_REQUIRED_FIELDS.EngineJob>
>;
type _EngineResultFieldsAreRequired = Expect<
  AllFieldsRequired<EngineResult, typeof CONTRACT_REQUIRED_FIELDS.EngineResult>
>;
type _ArtifactRefFieldsAreRequired = Expect<
  AllFieldsRequired<ArtifactRef, typeof CONTRACT_REQUIRED_FIELDS.ArtifactRef>
>;
type _StudioFormatFieldsAreRequired = Expect<
  AllFieldsRequired<StudioFormat, typeof CONTRACT_REQUIRED_FIELDS.StudioFormat>
>;
type _SocialAdapterFieldsAreRequired = Expect<
  AllFieldsRequired<SocialAdapter, typeof CONTRACT_REQUIRED_FIELDS.SocialAdapter>
>;
type _ConnectorProviderFieldsAreRequired = Expect<
  AllFieldsRequired<ConnectorProvider, typeof CONTRACT_REQUIRED_FIELDS.ConnectorProvider>
>;
type _PlatformHealthObservationFieldsAreRequired = Expect<
  AllFieldsRequired<PlatformHealthObservation, typeof CONTRACT_REQUIRED_FIELDS.PlatformHealthObservation>
>;

// --- sanity: every YAML contract is individually represented --------------
type _All25ContractsAreRepresented = Expect<
  Equal<
    ContractsByName,
    {
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
  >
>;
