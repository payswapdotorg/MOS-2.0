/**
 * Shared value types for the MOS v2.0 core contracts.
 *
 * CORE-001. These primitives are the cross-contract vocabulary implied by
 * spec/contracts/core-contracts-v2.0.yaml: branded identifiers and opaque
 * references, versions, tenant scope, digests, storage/rights/provenance
 * references, cost/latency models, money, timestamps, uncertainty summaries,
 * budgets and JSON-schema objects.
 *
 * This module is TYPES ONLY — no runtime dependencies, no side effects.
 * Branding is purely compile-time nominal typing: at runtime every branded
 * value is the plain underlying scalar (`string` or `number`).
 *
 * Alignment note (for Tech-Lead reconciliation): @mos/identity (W0-A) and the
 * @mos/studio interface spike (W0-C) declared local mirror aliases
 * (TenantId/WorkspaceId, MosRef<...>). This package is now the canonical
 * authority for these shared types; sibling packages reconcile by importing
 * from here (their documented plan).
 */

/**
 * Compile-time nominal brand. `T` is the runtime scalar; `B` is a distinct
 * brand tag so that, e.g., a CapabilityId can never be used where an
 * EngineId is required.
 */
declare const mosContractBrand: unique symbol;
export type Branded<T, B extends string> = T & { readonly [mosContractBrand]: B };

// ---------------------------------------------------------------------------
// Record identifiers (one per core contract that declares an `id`)
// ---------------------------------------------------------------------------

/** Identifier of a {@link Capability} record. */
export type CapabilityId = Branded<string, "CapabilityId">;
/** Identifier of an {@link Engine} record. */
export type EngineId = Branded<string, "EngineId">;
/** Identifier of a {@link Transform} record. */
export type TransformId = Branded<string, "TransformId">;
/** Identifier of an {@link Artifact} record. */
export type ArtifactId = Branded<string, "ArtifactId">;
/** Identifier of a {@link ProductionGraph} record. */
export type ProductionGraphId = Branded<string, "ProductionGraphId">;
/** Identifier of an {@link AgentBody} record. */
export type AgentBodyId = Branded<string, "AgentBodyId">;
/** Identifier of an {@link AgentOrganization} record. */
export type AgentOrganizationId = Branded<string, "AgentOrganizationId">;
/** Identifier of a {@link ProductionRequest} record. */
export type ProductionRequestId = Branded<string, "ProductionRequestId">;
/** Identifier of a {@link StudioSession} record. */
export type StudioSessionId = Branded<string, "StudioSessionId">;
/** Identifier of a {@link StudioArtifactPackage} record. */
export type StudioArtifactPackageId = Branded<string, "StudioArtifactPackageId">;
/** Identifier of a {@link StudioFormat} record. */
export type StudioFormatId = Branded<string, "StudioFormatId">;
/** Identifier of a {@link HumanProductionTask} record. */
export type HumanProductionTaskId = Branded<string, "HumanProductionTaskId">;
/** Identifier of a {@link BottleneckDecision} record. */
export type BottleneckDecisionId = Branded<string, "BottleneckDecisionId">;
/** Identifier of a {@link LabScenario} record. */
export type LabScenarioId = Branded<string, "LabScenarioId">;
/** Identifier of a {@link LabRun} record. */
export type LabRunId = Branded<string, "LabRunId">;
/** Identifier of a {@link CalibrationRecord} record. */
export type CalibrationRecordId = Branded<string, "CalibrationRecordId">;
/** Identifier of an {@link EngineBenchmark} record. */
export type EngineBenchmarkId = Branded<string, "EngineBenchmarkId">;
/** Identifier of an {@link EngineJob} record. */
export type EngineJobId = Branded<string, "EngineJobId">;
/** Identifier of a {@link RealExperimentBinding} record. */
export type ExperimentBindingId = Branded<string, "ExperimentBindingId">;
/** Identifier of a {@link PlatformHealthObservation} record. */
export type PlatformHealthObservationId = Branded<string, "PlatformHealthObservationId">;
/** Identifier of a workspace (tenant sub-scope; canonical records live in @mos/identity). */
export type WorkspaceId = Branded<string, "WorkspaceId">;
/** Identifier of an external provider (integrations authority). */
export type ProviderId = Branded<string, "ProviderId">;

// ---------------------------------------------------------------------------
// Opaque cross-authority references
//
// Fields in the frozen YAML whose semantics are "reference to a record owned
// by another module" are typed as opaque branded strings. The owning module
// (rights, policy, missions, distribution, ...) defines the record shape;
// contracts only guarantee reference integrity.
// ---------------------------------------------------------------------------

/** Tenant identifier (multi-tenancy root; spec §31, requireTenantScopeOnMutableArtifacts). */
export type TenantId = Branded<string, "TenantId">;
/** Opaque reference into object/media storage (never media bytes over control-plane RPC; spec §6). */
export type StorageRef = Branded<string, "StorageRef">;
/** Opaque reference to a rights record owned by the rights module. */
export type RightsRef = Branded<string, "RightsRef">;
/** Opaque reference to a provenance record owned by the rights module. */
export type ProvenanceRef = Branded<string, "ProvenanceRef">;
/** Opaque reference to a consent record (human participation rights; spec §17). */
export type ConsentRef = Branded<string, "ConsentRef">;
/** Opaque reference to a policy record owned by the policy module. */
export type PolicyRef = Branded<string, "PolicyRef">;
/** Opaque reference to a production strategy owned by the production module. */
export type StrategyRef = Branded<string, "StrategyRef">;
/** Opaque reference to a transform graph owned by the production module. */
export type TransformGraphRef = Branded<string, "TransformGraphRef">;
/** Opaque reference to a mission owned by the missions module. */
export type MissionRef = Branded<string, "MissionRef">;
/** Opaque reference to a distribution run owned by the distribution module. */
export type DistributionRef = Branded<string, "DistributionRef">;
/** Opaque reference to a real experiment owned by the experiments module. */
export type ExperimentRef = Branded<string, "ExperimentRef">;
/** Opaque reference to an evidence record (real-world boundary; spec §24). */
export type EvidenceRef = Branded<string, "EvidenceRef">;
/** Opaque reference to a Lab strategy candidate (Lab search dimension; spec §7). */
export type LabCandidateRef = Branded<string, "LabCandidateRef">;
/** Opaque reference to a model behind the single model/runtime boundary (spec §9/AGT-002). */
export type ModelRef = Branded<string, "ModelRef">;
/** Opaque reference to an agent runtime behind the substrate adapter. */
export type RuntimeRef = Branded<string, "RuntimeRef">;
/** Opaque reference to an engine adapter implementation identity (ENG-002). */
export type AdapterRef = Branded<string, "AdapterRef">;
/** Opaque reference to a substrate tool reached through the tools port. */
export type ToolRef = Branded<string, "ToolRef">;
/** Opaque reference to a substrate permission grant reached through the permissions port. */
export type PermissionRef = Branded<string, "PermissionRef">;
/** Opaque reference to an identity principal owned by the identity module. */
export type IdentityRef = Branded<string, "IdentityRef">;
/** Opaque reference to an external account boundary (identity → account is 1:N, never merged; spec §15). */
export type AccountRef = Branded<string, "AccountRef">;
/** Opaque reference to an authorization grant for one account boundary. */
export type AuthorizationRef = Branded<string, "AuthorizationRef">;
/** Opaque reference to a conversation graph derived from session transcripts. */
export type ConversationGraphRef = Branded<string, "ConversationGraphRef">;
/** Opaque reference to an edit graph (editorial decisions; OTIO is interchange only, spec §12). */
export type EditGraphRef = Branded<string, "EditGraphRef">;
/** Opaque reference to a golden benchmark corpus (ENG-004). */
export type BenchmarkCorpusRef = Branded<string, "BenchmarkCorpusRef">;
/** Opaque reference to a versioned quality evaluator contract. */
export type EvaluatorRef = Branded<string, "EvaluatorRef">;

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

/**
 * Contract record version. MOS contracts are explicitly versioned
 * (requireExplicitVersionedContracts): versions are monotonic integers.
 */
export type Version = Branded<number, "Version">;
/** Content digest (hex-encoded cryptographic digest of artifact bytes; spec §6). */
export type ContentDigest = Branded<string, "ContentDigest">;
/** ISO-8601 timestamp string. */
export type Timestamp = Branded<string, "Timestamp">;
/** Duration / latency measured in milliseconds (plain number for readability). */
export type Milliseconds = number;
/** Artifact media/type label (MIME type or coarse classification; owned by the content module). */
export type ArtifactType = string;

// ---------------------------------------------------------------------------
// JSON payloads
// ---------------------------------------------------------------------------

/** Opaque JSON-schema object (input/output contract schemas and similar). */
export type JsonSchemaObject = { readonly [property: string]: unknown };
/** Opaque JSON object payload (engine parameters and similar). */
export type JsonObject = { readonly [property: string]: unknown };

// ---------------------------------------------------------------------------
// Money, cost and latency
// ---------------------------------------------------------------------------

/** A point monetary amount. `currency` is an ISO-4217 code. */
export interface MoneyAmount {
  readonly amount: number;
  readonly currency: string;
}

/** Basis on which a capability/transform cost model is priced. */
export type CostBasis =
  | "per-invocation"
  | "per-second"
  | "per-minute"
  | "per-byte"
  | "per-artifact"
  | "per-tenant-hour";

/** Predictive cost model for a capability or transform (spec §5). */
export interface CostModel {
  readonly basis: CostBasis;
  readonly amount: number;
  readonly currency: string;
}

/** Predictive latency profile for a capability or transform (spec §5). */
export interface LatencyModel {
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

// ---------------------------------------------------------------------------
// Uncertainty (spec §22 — uncertainty summaries are first-class)
// ---------------------------------------------------------------------------

export type UncertaintyLevel = "low" | "moderate" | "high";

/** Uncertainty summary attached to Lab predictions, calibration and health observations. */
export interface UncertaintySummary {
  readonly level: UncertaintyLevel;
  readonly note?: string;
}

// ---------------------------------------------------------------------------
// Budgets, acceptance criteria, capability requirements
// ---------------------------------------------------------------------------

/** Production budget cap (money + wall-clock duration). */
export interface Budget {
  readonly maxCost: MoneyAmount;
  readonly maxDurationMs: Milliseconds;
}

/** Acceptance criterion evaluated by a (optional) evaluator contract. */
export interface AcceptanceCriterion {
  readonly description: string;
  readonly evaluator?: EvaluatorRef;
}

/** A required capability, pinned to an exact capability contract version. */
export interface CapabilityRequirement {
  readonly capabilityId: CapabilityId;
  readonly version: Version;
}

// ---------------------------------------------------------------------------
// Tenant scope (requireTenantScopeOnMutableArtifacts)
// ---------------------------------------------------------------------------

/** Tenant (and optional workspace) scope under which a record is created/mutated. */
export interface TenantScope {
  readonly tenantId: TenantId;
  readonly workspaceId?: WorkspaceId;
}
