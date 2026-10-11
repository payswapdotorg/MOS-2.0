/**
 * PROD-002 — ports. Every port stays <= 12 methods (house law).
 */
import type { Failure, Result } from './errors.js';
import type { TenantId } from './ids.js';
import type { LearningRecord } from './learning.js';
import type { AuthorityVersions, ExperimentRecord } from './engine.js';

/**
 * §26 durable path: the engine rides this JobQueuePort contract. The REAL
 * @mos/jobs authority is pinned by name in compat-pins.ts and bridged onto
 * this contract by the composition root / adaptJobsPort (upstream.ts).
 */
export interface JobsPort {
  enqueue(input: { readonly kind: string; readonly payload: Readonly<Record<string, unknown>> }): Result<{ readonly jobId: string }, Failure>;
  complete(jobId: string, outcome: Readonly<Record<string, unknown>>): Result<void, Failure>;
  fail(jobId: string, reason: string): Result<void, Failure>;
}

export type TrailEventKind =
  | 'experiment:proposed'
  | 'experiment:started'
  | 'experiment:aborted'
  | 'job:enqueued'
  | 'job:completed'
  | 'job:failed'
  | 'collection:opened'
  | 'observation:ingested'
  | 'observation:rejected'
  | 'evidence:measured'
  | 'learning:published'
  | 'rights:denied';

export interface TrailAttribution {
  readonly authority: string;
  readonly said: string;
}

export interface TrailEvent {
  readonly eventId: string;
  readonly at: string;
  readonly tenantId: TenantId;
  readonly kind: TrailEventKind;
  readonly subject: string;
  readonly attribution?: TrailAttribution;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * §30 platform-said trail. Implementations that cannot record an event must
 * fail with E_TRAIL_FAILED — a missing audit event is never silent.
 */
export interface TrailPort {
  emit(event: TrailEvent): Result<void, Failure>;
}

export type RightsAction = 'propose' | 'start' | 'collect' | 'ingest' | 'measure' | 'learn' | 'abort' | 'read' | 'list';

export interface RightsRequest {
  readonly actor: string;
  readonly tenantId: TenantId;
  readonly action: RightsAction;
  readonly resource: string;
  readonly targetTenantId: TenantId;
}

export type RightsDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly denial: { readonly authority: string; readonly verbatim: string } };

/**
 * §27: rights gates PRECEDE any record access crossing tenant boundaries.
 * Denials are attributable: the authority's statement is carried verbatim.
 */
export interface RightsGatePort {
  check(request: RightsRequest): Result<RightsDecision, Failure>;
}

/**
 * The measured learning channel's outbound sink. The Lab (LAB-018) consumes
 * these records downstream; experiments only publishes (§20/§24: measured
 * only — the sink contract carries channel 'measured' records exclusively).
 */
export interface LearningSinkPort {
  publish(record: LearningRecord): Result<void, Failure>;
}

export interface ExperimentStore {
  get(experimentId: string): Result<ExperimentRecord | null, Failure>;
  put(record: ExperimentRecord): Result<void, Failure>;
  list(tenantId: TenantId): Result<readonly ExperimentRecord[], Failure>;
}

/**
 * REAL authority versions for the §24 chain — supplied by the composition
 * root from the live modules. Never invented here; unresolvable versions are
 * typed failures at the engine.
 */
export interface AuthorityVersionResolver {
  resolve(): Result<AuthorityVersions, Failure>;
}
