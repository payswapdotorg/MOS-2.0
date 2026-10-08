/**
 * In-memory EngineRegistry adapter (ENG-001).
 *
 * Working adapter (not a skeleton): manifest registration with fail-closed
 * contract validation, the full fail-closed activation evidence gate,
 * deterministic capability resolution exactly per
 * spec/mos-engine-policy-v2.0.yaml, tenant overrides, silent-replacement
 * guard with explicit replacement records, rollback by engine version, and
 * historical reproducibility (every registered version stays resolvable).
 *
 * Optional capability-registry wiring: when a CapabilityRegistryPort is
 * provided, resolution fails closed for unknown capabilities using the
 * capabilities module's typed error.
 */

import { assertRequiredFields } from "@mos/contracts";
import type {
  CapabilityId,
  Engine,
  EngineId,
  Timestamp,
  TenantId,
  Version,
} from "@mos/contracts";
import { UnknownCapabilityError } from "@mos/capabilities";
import type { CapabilityRegistryPort } from "@mos/capabilities";

import type {
  EngineActivationEvidence,
  EngineActivationEvidenceInput,
  EngineActivationResult,
} from "../domain/activation.js";
import { activationFailedChecks, missingEvidenceItems } from "../domain/activation.js";
import type { EngineResolutionCandidate } from "../domain/resolution.js";
import {
  compareEngineCandidates,
  deriveLicenseCompatibility,
  firstDifferingDimension,
} from "../domain/resolution.js";
import { contractVerdictFor, manifestPolicyFailedChecks } from "../domain/manifest-policy.js";
import { assignmentVia } from "../domain/assignment.js";
import { tenantOverrideTarget } from "../domain/tenant-override.js";
import { EngineRegistryError } from "../domain/errors.js";
import type {
  EngineAssignmentRecord,
  EngineRegistrationResult,
  EngineReplacementInput,
  EngineReplacementRecord,
  EngineResolution,
  EngineResolutionOptions,
  EngineRegistryPort,
  EngineVersionRollback,
} from "../ports/engine-registry.port.js";

/** Options for the in-memory engine registry. */
export interface InMemoryEngineRegistryOptions {
  /**
   * Capability registry used to fail-closed unknown capabilities at
   * resolution time. Optional: without it the engine registry trusts the
   * caller's capability ids (documented; the composition root wires it).
   */
  readonly capabilityRegistry?: CapabilityRegistryPort;
  /** Injectable clock (default: real wall-clock ISO-8601 stamps). */
  readonly clock?: () => Timestamp;
}

interface EngineEntry {
  readonly engine: Engine;
  readonly registeredAt: Timestamp;
  evidence?: EngineActivationEvidence;
  active: boolean;
  activatedAt?: Timestamp;
}

const DEFAULT_LANE = "default";
const FIXED_NOW = () => new Date().toISOString() as Timestamp;

/**
 * W9-B collision-proof composite lane key. The old `"::"`-delimited
 * concatenation was injectable: a hostile tenant id containing `"::"`
 * aliased another tenant's assignment lane (the W3-A hostile-id-factory
 * class). A JSON array key is injective over string tuples — components
 * can never blur into each other.
 */
function laneKey(capabilityId: CapabilityId, tenantId?: TenantId): string {
  return JSON.stringify([tenantId ?? DEFAULT_LANE, capabilityId as string]);
}

/**
 * Clone-then-deep-freeze (the W4-B/W8-A ownership discipline): the
 * registry stores a PRIVATE structural copy — caller-retained objects are
 * never aliased by stored records and never frozen in place.
 */
function freezeClone<T>(value: T): T {
  const clone = structuredClone(value);
  const deepFreeze = (item: unknown): void => {
    if (typeof item === "object" && item !== null && !Object.isFrozen(item)) {
      for (const key of Object.keys(item as Record<string, unknown>)) {
        deepFreeze((item as Record<string, unknown>)[key]);
      }
      Object.freeze(item);
    }
  };
  deepFreeze(clone);
  return clone;
}

/**
 * Creates an in-memory {@link EngineRegistryPort} adapter.
 */
export function createInMemoryEngineRegistry(
  options: InMemoryEngineRegistryOptions = {},
): EngineRegistryPort {
  const clock = options.clock ?? FIXED_NOW;

  /** engineId (string key) → version → entry. */
  const engines = new Map<string, Map<number, EngineEntry>>();
  const assignments = new Map<string, EngineAssignmentRecord>();
  const replacements: EngineReplacementRecord[] = [];
  const rollbacks: EngineVersionRollback[] = [];

  function entryOf(
    engineId: EngineId,
    engineVersion: Version,
  ): EngineEntry | undefined {
    return engines.get(engineId as string)?.get(engineVersion as number);
  }

  function requireEntry(
    engineId: EngineId,
    engineVersion: Version,
  ): EngineEntry {
    const entry = entryOf(engineId, engineVersion);
    if (entry === undefined) {
      throw new EngineRegistryError(
        "unknown-engine",
        `Unknown engine: ${engineId as string} version ${engineVersion as number} is not registered`,
        { engineId: engineId as string, engineVersion: engineVersion as number },
      );
    }
    return entry;
  }

  function activeVersionOf(engineId: EngineId): EngineEntry | undefined {
    const versions = engines.get(engineId as string);
    if (versions === undefined) {
      return undefined;
    }
    for (const entry of versions.values()) {
      if (entry.active) {
        return entry;
      }
    }
    return undefined;
  }

  function recordAssignment(
    record: EngineAssignmentRecord,
  ): EngineAssignmentRecord {
    const frozen = Object.freeze({ ...record });
    assignments.set(
      laneKey(record.capabilityId, record.tenantId),
      frozen,
    );
    return frozen;
  }

  const registry: EngineRegistryPort = {
    registerEngine(manifest: Engine): EngineRegistrationResult {
      try {
        assertRequiredFields(manifest, "Engine");
      } catch (error) {
        throw new EngineRegistryError(
          "invalid-engine-manifest",
          error instanceof Error ? error.message : String(error),
        );
      }
      const idKey = manifest.id as string;
      let versions = engines.get(idKey);
      if (versions === undefined) {
        versions = new Map<number, EngineEntry>();
        engines.set(idKey, versions);
      }
      const versionKey = manifest.version as number;
      if (versions.has(versionKey)) {
        throw new EngineRegistryError(
          "engine-already-registered",
          `Engine ${idKey} version ${versionKey} is already registered; manifests are immutable — register a new version instead`,
          { engineId: idKey, engineVersion: versionKey },
        );
      }
      versions.set(versionKey, {
        engine: freezeClone(manifest),
        registeredAt: clock(),
        active: false,
      });
      return Object.freeze({
        engineId: manifest.id,
        engineVersion: manifest.version,
        status: "registered",
      });
    },

    activateEngine(
      engineId: EngineId,
      engineVersion: Version,
      evidence: EngineActivationEvidenceInput,
    ): EngineActivationResult {
      const entry = requireEntry(engineId, engineVersion);
      const missing = missingEvidenceItems(evidence);
      if (missing.length > 0) {
        return Object.freeze({
          activated: false,
          engineId,
          engineVersion,
          missingEvidence: Object.freeze([...missing]),
          failedChecks: [],
        });
      }
      const full = evidence as EngineActivationEvidence;
      const failed = [
        ...activationFailedChecks(full, entry.engine.capabilityIds),
        ...manifestPolicyFailedChecks(entry.engine, full),
      ];
      if (failed.length > 0) {
        return Object.freeze({
          activated: false,
          engineId,
          engineVersion,
          missingEvidence: [],
          failedChecks: Object.freeze([...failed]),
        });
      }
      // Promotion: activating a version deactivates the engine's other
      // versions (one active version per engine id; benchmark-before-
      // promotion and rollback-by-version semantics).
      for (const other of engines.get(engineId as string)?.values() ?? []) {
        other.active = false;
      }
      entry.evidence = freezeClone(full);
      entry.active = true;
      entry.activatedAt = clock();
      return Object.freeze({
        activated: true,
        engineId,
        engineVersion,
        activatedAt: entry.activatedAt,
      });
    },

    deactivateEngine(engineId: EngineId, engineVersion: Version): void {
      const entry = requireEntry(engineId, engineVersion);
      entry.active = false;
    },

    resolveCapability(
      capabilityId: CapabilityId,
      resolutionOptions?: EngineResolutionOptions,
    ): EngineResolution {
      if (options.capabilityRegistry !== undefined) {
        const known =
          options.capabilityRegistry.getLatest(capabilityId) !== undefined;
        if (!known) {
          throw new UnknownCapabilityError(capabilityId as string);
        }
      }

      // ---- Tenant override lane (explicit, caller-supplied) ----
      const tenantId = resolutionOptions?.tenantId;
      const tenantOverride = resolutionOptions?.tenantOverride;
      if (tenantId !== undefined && tenantOverride !== undefined) {
        const target = tenantOverrideTarget(
          capabilityId,
          tenantId,
          tenantOverride,
          entryOf,
        );
        const assignment = recordAssignment({
          capabilityId,
          tenantId,
          engineId: target.engine.id,
          engineVersion: target.engine.version,
          recordedAt: clock(),
          via: "tenant-override",
        });
        return Object.freeze({
          capabilityId,
          tenantId,
          engine: target.engine,
          assignment,
          candidates: [],
          resolvedVia: "tenant-override",
        });
      }

      // ---- Default lane: deterministic tie-break over activated engines ----
      const candidates: EngineResolutionCandidate[] = [];
      for (const versions of engines.values()) {
        for (const entry of versions.values()) {
          if (!entry.active) {
            continue;
          }
          const engine = entry.engine;
          if (!engine.capabilityIds.includes(capabilityId)) {
            continue;
          }
          const licenseCompatibility = deriveLicenseCompatibility(engine.license);
          if (licenseCompatibility === "incompatible") {
            continue; // fail-closed exclusion: blocked license layer
          }
          const contractCompatibility = contractVerdictFor(entry, capabilityId);
          if (contractCompatibility === "incompatible") {
            continue; // fail-closed exclusion: incompatible contract verdict
          }
          candidates.push({
            engine,
            engineId: engine.id,
            engineVersion: engine.version,
            contractCompatibility,
            licenseCompatibility,
            benchmarkScore: engine.benchmark.metrics.score,
            costAmount: engine.benchmark.cost.amount,
            latencyMs: engine.benchmark.latency,
          });
        }
      }
      if (candidates.length === 0) {
        throw new EngineRegistryError(
          "no-activatable-engine",
          `No activated engine is resolvable for capability ${capabilityId as string}`,
          { capabilityId: capabilityId as string },
        );
      }
      const ranked = [...candidates].sort(compareEngineCandidates);
      const winner = ranked[0] as EngineResolutionCandidate;
      const decidedBy =
        ranked.length > 1
          ? firstDifferingDimension(
              winner,
              ranked[1] as EngineResolutionCandidate,
            )
          : undefined;

      // ---- Silent replacement guard (default lane) ----
      const existing = assignments.get(laneKey(capabilityId));
      const assignedEntry =
        existing === undefined
          ? undefined
          : entryOf(existing.engineId, existing.engineVersion);
      const via = assignmentVia(
        capabilityId,
        existing,
        winner,
        replacements,
        assignedEntry?.active ?? false,
      );
      const assignment = recordAssignment({
        capabilityId,
        engineId: winner.engineId,
        engineVersion: winner.engineVersion,
        recordedAt: clock(),
        via,
      });
      return Object.freeze({
        capabilityId,
        tenantId,
        engine: winner.engine,
        assignment,
        candidates: Object.freeze([...ranked]),
        resolvedVia: "deterministic-tie-break",
        decidedBy,
      });
    },

    getEngine(engineId: EngineId, engineVersion: Version): Engine | undefined {
      return entryOf(engineId, engineVersion)?.engine;
    },

    listEngineVersions(engineId: EngineId): readonly Version[] {
      const versions = engines.get(engineId as string);
      if (versions === undefined) {
        return [];
      }
      return [...versions.keys()].sort((a, b) => a - b) as Version[];
    },

    listActivatedEngines(capabilityId?: CapabilityId): readonly Engine[] {
      const activated: Engine[] = [];
      for (const versions of engines.values()) {
        for (const entry of versions.values()) {
          if (!entry.active) {
            continue;
          }
          if (
            capabilityId !== undefined &&
            !entry.engine.capabilityIds.includes(capabilityId)
          ) {
            continue;
          }
          activated.push(entry.engine);
        }
      }
      return activated;
    },

    recordEngineReplacement(
      replacement: EngineReplacementInput,
    ): EngineReplacementRecord {
      requireEntry(replacement.fromEngineId, replacement.fromEngineVersion);
      const target = requireEntry(replacement.toEngineId, replacement.toEngineVersion);
      if (!target.active) {
        throw new EngineRegistryError(
          "engine-not-activated",
          `Replacement target engine ${replacement.toEngineId as string}@${replacement.toEngineVersion as number} is registered but not activated`,
          {
            engineId: replacement.toEngineId as string,
            engineVersion: replacement.toEngineVersion as number,
          },
        );
      }
      const record: EngineReplacementRecord = Object.freeze({
        ...replacement,
        recordedAt: clock(),
      });
      replacements.push(record);
      return record;
    },

    rollbackEngineVersion(
      engineId: EngineId,
      toVersion: Version,
    ): EngineVersionRollback {
      const target = requireEntry(engineId, toVersion);
      if (target.evidence === undefined) {
        throw new EngineRegistryError(
          "rollback-target-not-previously-activated",
          `Rollback target engine ${engineId as string}@${toVersion as number} was never activated (no accepted evidence chain); the activation gate cannot be bypassed by rollback`,
          { engineId: engineId as string, engineVersion: toVersion as number },
        );
      }
      const current = activeVersionOf(engineId);
      if (current !== undefined) {
        current.active = false;
      }
      target.active = true;
      const rollback: EngineVersionRollback = Object.freeze({
        engineId,
        fromEngineVersion: current?.engine.version ?? null,
        toEngineVersion: toVersion,
        rolledBackAt: clock(),
      });
      rollbacks.push(rollback);
      return rollback;
    },

    getEngineAssignment(
      capabilityId: CapabilityId,
      tenantId?: TenantId,
    ): EngineAssignmentRecord | undefined {
      return assignments.get(laneKey(capabilityId, tenantId));
    },
  };

  return registry;
}
