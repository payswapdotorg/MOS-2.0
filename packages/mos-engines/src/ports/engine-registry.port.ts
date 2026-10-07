/**
 * EngineRegistry port (ENG-001).
 *
 * The port consumed by domain modules (Studio/Lab/production) to register
 * engine manifests, gate activation, and resolve capabilities to engines.
 * Domain modules ASK for capabilities; the registry SELECTS engines
 * (spec/mos-engine-policy-v2.0.yaml engineSelection). Port files never
 * import @zcode/* (boundary rule PORTS-NO-ZCODE).
 *
 * 10 public methods (policy budget: 12).
 */

import type {
  CapabilityId,
  Engine,
  EngineId,
  Timestamp,
  TenantId,
  Version,
} from "@mos/contracts";

import type {
  EngineActivationEvidenceInput,
  EngineActivationResult,
} from "../domain/activation.js";
import type { EngineResolutionCandidate } from "../domain/resolution.js";
import type { TieBreakDimension } from "../domain/resolution.js";
import type { EngineAssignmentVia } from "../domain/assignment.js";

export type { EngineAssignmentVia } from "../domain/assignment.js";

/** Result of a successful manifest registration (not yet activatable). */
export interface EngineRegistrationResult {
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly status: "registered";
}

/** The recorded engine assignment for one capability (optionally per tenant). */
export interface EngineAssignmentRecord {
  readonly capabilityId: CapabilityId;
  readonly tenantId?: TenantId;
  readonly engineId: EngineId;
  readonly engineVersion: Version;
  readonly recordedAt: Timestamp;
  readonly via: EngineAssignmentVia;
}

/** A tenant override pinning one engine version for one tenant. */
export interface EngineTenantOverride {
  readonly engineId: EngineId;
  readonly engineVersion: Version;
}

/** Options for capability resolution. */
export interface EngineResolutionOptions {
  /** Tenant scope (tenant overrides are allowed by policy). */
  readonly tenantId?: TenantId;
  /** Explicit tenant override pinning the resolved engine version. */
  readonly tenantOverride?: EngineTenantOverride;
}

/** The result of resolving a capability to an engine. */
export interface EngineResolution {
  readonly capabilityId: CapabilityId;
  readonly tenantId?: TenantId;
  readonly engine: Engine;
  readonly assignment: EngineAssignmentRecord;
  /** All eligible candidates ranked best-first (audit trail). */
  readonly candidates: readonly EngineResolutionCandidate[];
  /** How the winner was chosen. */
  readonly resolvedVia: "deterministic-tie-break" | "tenant-override";
  /** The tie-break dimension that decided the winner (undefined for sole candidates / overrides). */
  readonly decidedBy?: TieBreakDimension;
}

/** Input for an explicit engine replacement record (the migration record). */
export interface EngineReplacementInput {
  readonly capabilityId: CapabilityId;
  readonly fromEngineId: EngineId;
  readonly fromEngineVersion: Version;
  readonly toEngineId: EngineId;
  readonly toEngineVersion: Version;
  readonly reason: string;
}

/** A recorded explicit engine replacement (silent replacement is forbidden). */
export interface EngineReplacementRecord extends EngineReplacementInput {
  readonly recordedAt: Timestamp;
}

/** A recorded rollback of one engine id to an earlier version. */
export interface EngineVersionRollback {
  readonly engineId: EngineId;
  readonly fromEngineVersion: Version | null;
  readonly toEngineVersion: Version;
  readonly rolledBackAt: Timestamp;
}

/**
 * Registry of engine manifests with the fail-closed activation gate and
 * deterministic capability resolution.
 */
export interface EngineRegistryPort {
  /**
   * Registers one immutable engine manifest (validated against the Engine
   * contract's required fields, fail-closed). Registration alone never
   * activates: resolution considers an engine only after
   * {@link EngineRegistryPort.activateEngine} accepts its evidence chain.
   */
  registerEngine(manifest: Engine): EngineRegistrationResult;

  /**
   * FAIL-CLOSED activation gate: an engine version cannot activate without
   * the full evidence chain (manifestValidation, capabilityContractTests,
   * goldenCorpusBenchmark, evaluatorResult, securitySandboxReview,
   * codeLicenseReview, modelLicenseReview, sourceDataRightsReview,
   * provenanceRecord) and concluding verdicts. A rejected activation
   * returns `activated: false` with the named missing evidence items and
   * named failed checks — never a silent partial activation.
   */
  activateEngine(
    engineId: EngineId,
    engineVersion: Version,
    evidence: EngineActivationEvidenceInput,
  ): EngineActivationResult;

  /**
   * Deactivates one engine version. The version remains REGISTERED and
   * resolvable by {@link EngineRegistryPort.getEngine} (historical
   * reproducibility) but is excluded from future resolution.
   */
  deactivateEngine(engineId: EngineId, engineVersion: Version): void;

  /**
   * Resolves a capability to one activated engine version using the
   * deterministic tie-break (contractCompatibility, licenseCompatibility,
   * benchmarkScore, cost, latency, engineId). Tenant overrides are
   * allowed. Silent engine replacement is forbidden: when the winner's
   * engine id differs from the recorded assignment without an explicit
   * replacement record, resolution fails closed naming both engines.
   */
  resolveCapability(
    capabilityId: CapabilityId,
    options?: EngineResolutionOptions,
  ): EngineResolution;

  /**
   * Returns one registered engine version regardless of activation status
   * (historical reproducibility: old engine versions remain resolvable for
   * historical runs), or `undefined` when unknown.
   */
  getEngine(engineId: EngineId, engineVersion: Version): Engine | undefined;

  /** All registered versions of one engine id, ascending; empty when unknown. */
  listEngineVersions(engineId: EngineId): readonly Version[];

  /** All activated engines (optionally filtered by declared capability). */
  listActivatedEngines(capabilityId?: CapabilityId): readonly Engine[];

  /**
   * Records an explicit engine replacement (the migration record that
   * unblocks resolution after an engine id change). Both engines must be
   * registered; the target must be activated.
   */
  recordEngineReplacement(replacement: EngineReplacementInput): EngineReplacementRecord;

  /**
   * Rolls one engine id back to an earlier REGISTERED version that carries
   * a previously accepted activation evidence chain. The rollback makes
   * that version the engine's active version; later versions remain
   * registered and resolvable for historical runs.
   */
  rollbackEngineVersion(engineId: EngineId, toVersion: Version): EngineVersionRollback;

  /** The current engine assignment for one capability (default lane, or a tenant lane). */
  getEngineAssignment(
    capabilityId: CapabilityId,
    tenantId?: TenantId,
  ): EngineAssignmentRecord | undefined;
}
