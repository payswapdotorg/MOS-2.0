/**
 * BRIDGE-003 — the disclosed in-memory real-experiment authority (the
 * composition over the pure cores + the append-only stores).
 *
 * This is the shipped DISCLOSED in-memory double of the
 * `RealExperimentAuthorityPort` surface (the mos-lab / mos-studio adapter
 * precedent): deterministic, no IO, injectable clock/id factories. The
 * REAL authority adapters (the lab-candidate reader over the REAL LAB-017
 * benchmark, the distribution observation source over the REAL
 * `@mos/distribution` adapter, the REAL mission repository, the REAL
 * `@mos/jobs` queue) are wired at the testing/compat seams — the port
 * surface stays identical.
 *
 * Method budget: the port carries TWELVE public methods (the policy
 * maximum); this adapter implements them all through the cores
 * (binding-core.ts / measurement-core.ts) and the stores.
 */

import type { IdentityRef, TenantScope, Timestamp } from "@mos/contracts";
import type { JobQueuePort } from "@mos/jobs";

import type {
  AdvanceMeasurementOutcome,
  AnalyseOutcomeFailure,
  CloseExperimentFailure,
  ExperimentClosureInput,
  ExperimentIntegrityReport,
  ExperimentJobClaim,
  RealExperimentAuthorityPort,
} from "../contracts/authority-port.js";
import type { RealExperimentBindingOutcome } from "../contracts/binding-request.js";
import type { RealExperimentBindingRequest } from "../contracts/binding-request.js";
import type { RealExperimentRecord } from "../contracts/experiment-record.js";
import type {
  DistributionObservationSource,
  ExperimentMissionSource,
  ExperimentPolicyGatePort,
  ExperimentRightsGatePort,
} from "../contracts/authority-seams.js";
import type { LabCandidateReaderPort } from "../contracts/lab-candidate-seam.js";
import type {
  ExperimentOutcomeObservation,
  ExperimentOutcomeRecord,
} from "../contracts/outcome.js";
import type { ExperimentId, ExperimentObservationId } from "../contracts/ids.js";
import {
  createRealExperimentBinding,
  defaultNextAuditId,
  defaultNextExperimentId,
} from "./binding-core.js";
import { advanceExperimentMeasurement } from "./measurement-core.js";
import {
  analyseExperimentOutcome,
  closeExperimentRecord,
  outcomeObservationOf,
} from "./outcome-core.js";
import { createRealExperimentStore, recomputedDigestOf } from "../store/experiment-store.js";
import {
  createExperimentEvidenceStore,
  createExperimentOutcomeStore,
} from "../store/measurement-store.js";

/** Options of {@link createInMemoryRealExperimentAuthority}. */
export interface InMemoryRealExperimentAuthorityOptions {
  /** The declared lab-candidate reader seam (@mos/lab behind it). */
  readonly labCandidate: LabCandidateReaderPort;
  /** The REAL mission repository read seam (@mos/missions — registry dep). */
  readonly missions: ExperimentMissionSource;
  /** The declared policy-gate seam (@mos/policy behind it). */
  readonly policyGate: ExperimentPolicyGatePort;
  /** The declared rights-gate seam (@mos/rights behind it). */
  readonly rightsGate: ExperimentRightsGatePort;
  /** The REAL distribution observation source (@mos/distribution — registry dep). */
  readonly distribution: DistributionObservationSource;
  /** The REAL durable job queue (@mos/jobs — registry dep). */
  readonly jobs: JobQueuePort;
  /** Injectable clock (deterministic tests). */
  readonly clock: () => Timestamp;
  /** Injectable experiment-id factory (deterministic tests). */
  readonly nextExperimentId?: () => ExperimentId;
  /** Injectable audit-id factory (deterministic tests). */
  readonly nextAuditId?: () => string;
  /** Injectable stores (defaults: the disclosed in-memory doubles). */
  readonly store?: ReturnType<typeof createRealExperimentStore>;
  readonly evidenceStore?: ReturnType<typeof createExperimentEvidenceStore>;
  readonly outcomeStore?: ReturnType<typeof createExperimentOutcomeStore>;
}

/** Create the disclosed in-memory real-experiment authority. */
export function createInMemoryRealExperimentAuthority(
  options: InMemoryRealExperimentAuthorityOptions,
): RealExperimentAuthorityPort & {
  /** Test inspection: the append-only stores the authority composes through. */
  readonly experimentStore: ReturnType<typeof createRealExperimentStore>;
  readonly evidenceStore: ReturnType<typeof createExperimentEvidenceStore>;
  readonly outcomeStore: ReturnType<typeof createExperimentOutcomeStore>;
} {
  const clock = options.clock;
  const store = options.store ?? createRealExperimentStore();
  const evidenceStore = options.evidenceStore ?? createExperimentEvidenceStore();
  const outcomeStore = options.outcomeStore ?? createExperimentOutcomeStore();
  const nextExperimentId = options.nextExperimentId ?? defaultNextExperimentId;
  const nextAuditId = options.nextAuditId ?? defaultNextAuditId;

  const bindingDeps = {
    labCandidate: options.labCandidate,
    missions: options.missions,
    policyGate: options.policyGate,
    rightsGate: options.rightsGate,
    distribution: options.distribution,
    jobs: options.jobs,
    store,
    evidenceStore,
    clock,
    nextExperimentId,
    nextAuditId,
  };
  const measurementDeps = {
    distribution: options.distribution,
    jobs: options.jobs,
    store,
    evidenceStore,
    outcomeStore,
    clock,
  };

  /** Deep-freeze a returned projection (D3 — returns are frozen copies). */
  const deepFrozen = <T>(value: T): T => {
    if (value !== null && typeof value === "object") {
      for (const key of Object.getOwnPropertyNames(value)) {
        deepFrozen((value as Record<string, unknown>)[key]);
      }
      Object.freeze(value);
    }
    return value;
  };

  /** Resolve the experiment a citation's outcome observation projects. */
  const resolveObservation = (
    scope: TenantScope,
    observationId: ExperimentObservationId,
  ): ExperimentOutcomeObservation | null => {
    // Deterministic derivation: the observation id is `exp-obs:<experimentId>`
    // (the ids.ts derivation) — resolve the experiment, then its outcome.
    const raw = String(observationId);
    if (!raw.startsWith("exp-obs:")) {
      return null;
    }
    const experimentId = raw.slice("exp-obs:".length) as ExperimentId;
    const record = store.getExperiment(scope, experimentId);
    if (record === undefined) {
      return null;
    }
    const outcome = outcomeStore.getOutcome(scope, experimentId);
    if (outcome === undefined) {
      return null;
    }
    const projection = outcomeObservationOf(scope, outcome, record);
    return projection === null ? null : deepFrozen(structuredClone(projection));
  };

  return {
    async createBinding(request: RealExperimentBindingRequest): Promise<RealExperimentBindingOutcome> {
      return createRealExperimentBinding(bindingDeps, request);
    },
    async advanceMeasurement(
      scope: TenantScope,
      experimentId: ExperimentId,
      claim: ExperimentJobClaim,
    ): Promise<AdvanceMeasurementOutcome> {
      return advanceExperimentMeasurement(measurementDeps, scope, experimentId, claim);
    },
    async analyse(
      scope: TenantScope,
      experimentId: ExperimentId,
      actor: IdentityRef,
    ): Promise<
      | { readonly ok: true; readonly value: { readonly outcome: ExperimentOutcomeRecord; readonly experiment: RealExperimentRecord } }
      | { readonly ok: false; readonly error: AnalyseOutcomeFailure }
    > {
      return analyseExperimentOutcome(measurementDeps, scope, experimentId, actor);
    },
    async closeExperiment(
      scope: TenantScope,
      experimentId: ExperimentId,
      actor: IdentityRef,
      closure: ExperimentClosureInput,
    ): Promise<
      | { readonly ok: true; readonly value: { readonly experiment: RealExperimentRecord } }
      | { readonly ok: false; readonly error: CloseExperimentFailure }
    > {
      return closeExperimentRecord(measurementDeps, scope, experimentId, actor, closure);
    },
    getExperiment: (scope, experimentId, version) => store.getExperiment(scope, experimentId, version),
    listExperiments: (scope) => store.listLatestExperiments(scope),
    getEvidence: (scope, experimentId, version) => evidenceStore.getEvidence(scope, experimentId, version),
    listEvidenceVersions: (scope, experimentId) => evidenceStore.listVersions(scope, experimentId),
    getOutcome: (scope, experimentId, version) => outcomeStore.getOutcome(scope, experimentId, version),
    getOutcomeObservation: (scope, observationId) => resolveObservation(scope, observationId),
    listBindingAudits: (scope) => store.listAuditRecords(scope),
    verifyExperimentIntegrity: (scope, experimentId, version): ExperimentIntegrityReport | null => {
      const record = store.getExperiment(scope, experimentId, version);
      if (record === undefined) {
        return null;
      }
      const recomputed = recomputedDigestOf(record);
      return {
        experimentId,
        recordVersion: record.version,
        status: recomputed === record.experimentDigest ? "intact" : "tampered",
        recordedDigest: record.experimentDigest,
        recomputedDigest: recomputed,
      };
    },
    experimentStore: store,
    evidenceStore,
    outcomeStore,
  };
}