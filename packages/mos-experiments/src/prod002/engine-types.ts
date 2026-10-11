/**
 * PROD-002 — engine type surface (split from engine.ts for the 400-line
 * production-file cap; pure code motion, no semantic change).
 */
import type { TenantId } from './ids.js';
import type { Clock, IdGenerator } from './util.js';
import type { ObservationSet, PlatformSaidObservation } from './observation-set.js';
import type { MeasuredEvidence, MetricSpec } from './evidence.js';
import type { CitedPrediction } from './upstream.js';
import type {
  AuthorityVersionResolver,
  ExperimentStore,
  JobsPort,
  LearningSinkPort,
  RightsGatePort,
  TrailPort,
} from './ports.js';

export type ExperimentPhase = 'proposed' | 'running' | 'collecting' | 'measured' | 'learned' | 'aborted';

export interface AuthorityVersions {
  readonly missionsModuleVersion: string;
  readonly productionModuleVersion: string;
  readonly distributionBindingId: string;
  readonly distributionBindingVersion: string;
}

export interface ResolvedChain {
  readonly resolvedAt: string;
  readonly missionsModuleVersion: string;
  readonly productionModuleVersion: string;
  readonly distributionBindingVersion: string;
  readonly citations: {
    readonly missionRef: { readonly missionId: string; readonly moduleVersion: string };
    readonly productionRequestRef: { readonly requestId: string; readonly moduleVersion: string };
    readonly distributionRef: { readonly bindingId: string; readonly bindingVersion: string };
  };
}

export interface ExperimentPlan {
  readonly hypothesis: string;
  readonly missionRef: { readonly missionId: string };
  readonly productionRequestRef: { readonly requestId: string };
  readonly distributionRef: { readonly bindingId: string };
  readonly metrics: readonly MetricSpec[];
  readonly collectionWindow: { readonly startsAt: string; readonly endsAt: string; readonly maxObservations: number | null };
  readonly prediction: CitedPrediction | null;
}

export interface ExperimentRecord {
  readonly experimentId: string;
  readonly tenantId: TenantId;
  readonly phase: ExperimentPhase;
  readonly plan: ExperimentPlan;
  readonly chain: ResolvedChain | null;
  readonly jobId: string | null;
  readonly observations: readonly PlatformSaidObservation[];
  readonly observationSet: ObservationSet | null;
  readonly evidence: MeasuredEvidence | null;
  readonly learning: { readonly learningRecordId: string; readonly publishedAt: string } | null;
  readonly abortReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AccessContext {
  readonly actor: string;
  readonly tenantId: TenantId;
}

export type AccessContextInput = { readonly actor: string; readonly tenantId: string };

export interface ExperimentEngineDeps {
  readonly store: ExperimentStore;
  readonly trail: TrailPort;
  readonly rights: RightsGatePort;
  readonly jobs: JobsPort;
  readonly learningSink: LearningSinkPort;
  readonly authorityVersions: AuthorityVersionResolver;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly tenantIdPattern?: RegExp;
}

export const JOB_KIND = 'experiments/prod002/run';
