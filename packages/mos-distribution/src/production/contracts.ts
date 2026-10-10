/**
 * PROD-001 — production-side Distribution / Integration composition contracts.
 *
 * Placement: packages/mos-distribution/src/production/** (TL-approved, §4).
 * Chain position (spec §24): Production/Studio → Distribution/Integration
 * (THIS surface) → Workflow/Execution (durable jobs, §26) → platform.
 *
 * Laws pinned by these contracts:
 *  - AC1 no second publishing authority: transport happens ONLY through
 *    DistributionAuthorityPort (mirrors the @mos/distribution
 *    SocialAdapterContract: publish/schedule/readObservations/delete/
 *    listRestrictions).
 *  - AC3 artifact-ref inputs only: exact immutable versions, no inline media.
 *  - AC4 credentials at the boundary only: CredentialRef handles.
 *  - AC5 durable execution via JobsPort (@mos/jobs JobQueuePort).
 *  - AC6/AC8 UNKNOWN preserved: health statuses are verbatim strings; ONLY
 *    the literal 'CONFIRMED' gates; SUSPECTED / UNKNOWN / unrecognized
 *    values are never coerced and never gate. Unknown authority failure
 *    kinds are preserved verbatim and never retried.
 *
 * Deliberate isolation: this subtree imports NO real @mos/* package. Real
 * adapters implementing these ports are bound TL-side at wiring time;
 * compat/authority-surfaces.ts carries the zero-drift pins.
 */

export type TenantId = string;

/** Verbatim health status. Only the literal 'CONFIRMED' gates (AC6/AC8). */
export type HealthStatus = string;
export const HEALTH_STATUS_CONFIRMED: HealthStatus = 'CONFIRMED';
export const HEALTH_STATUS_SUSPECTED: HealthStatus = 'SUSPECTED';
export const HEALTH_STATUS_UNKNOWN: HealthStatus = 'UNKNOWN';

/** Exact immutable version (no ranges, no 'latest'). */
export type ExactVersion = string;

export interface ArtifactVersionRef {
  readonly kind: 'package' | 'artifact';
  readonly id: string;
  readonly version: ExactVersion;
}

export interface ProviderCapabilityInstance {
  readonly providerId: string;
  readonly capability: string;
  readonly instanceId: string;
  readonly instanceVersion: ExactVersion;
  readonly channelRef: string;
  readonly accountRef: string;
}

/** Opaque handle; the credential VALUE never enters the control plane (AC4). */
export interface CredentialRef {
  readonly credentialId: string;
}

export interface ProviderTarget {
  readonly capability: ProviderCapabilityInstance;
  readonly credential: CredentialRef;
}

export type DeclaredSchedule =
  | { readonly kind: 'immediate' }
  | { readonly kind: 'scheduled'; readonly scheduledAt: string };

export interface RightsContextCitation {
  readonly rightsGrantRef: string;
}

export interface PolicyContextCitation {
  readonly policyRef: string;
}

export interface ObservabilityTrail {
  readonly recordRefs: readonly string[];
}

export interface BackoffPolicy {
  readonly kind: 'exponential';
  readonly baseMs: number;
  readonly maxAttempts: number;
}

/** Declared backoff for distribution publishing jobs (retries per §26). */
export const DEFAULT_PUBLISH_BACKOFF: BackoffPolicy = deepFreeze({
  kind: 'exponential',
  baseMs: 500,
  maxAttempts: 4,
});

export const DEFAULT_PUBLISH_TIMEOUT_MS = 30_000;

export interface DistributionRequest {
  readonly tenant: TenantId;
  readonly artifactRefs: readonly ArtifactVersionRef[];
  readonly targets: readonly ProviderTarget[];
  readonly schedule: DeclaredSchedule;
  readonly clientJobKey: string;
  readonly rightsContext: RightsContextCitation;
  readonly policyContext: PolicyContextCitation;
  readonly observabilityTrail: ObservabilityTrail;
  readonly backoffPolicy?: BackoffPolicy;
}

export function targetKeyOf(target: ProviderTarget): string {
  const c = target.capability;
  return `${c.providerId}\u0000${c.instanceId}\u0000${c.channelRef}`;
}

export function capabilityKeyOf(c: {
  readonly providerId: string;
  readonly capability: string;
  readonly instanceId: string;
  readonly instanceVersion: string;
  readonly channelRef: string;
  readonly accountRef: string;
}): string {
  return `${c.providerId}\u0000${c.capability}\u0000${c.instanceId}\u0000${c.instanceVersion}\u0000${c.channelRef}\u0000${c.accountRef}`;
}

/** Deep-freezes plain object/array graphs (AC8 immutable records). */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  const seen = new WeakSet<object>();
  const visit = (node: object): void => {
    if (seen.has(node)) return;
    seen.add(node);
    if (!Object.isFrozen(node)) Object.freeze(node);
    for (const key of Object.keys(node)) {
      const child: unknown = (node as Record<string, unknown>)[key];
      if (typeof child === 'object' && child !== null) visit(child as object);
    }
  };
  visit(value as object);
  return value;
}

/** Caller-error shape: recorded nowhere, transports nowhere (AC2). */
export interface CallerErrorDetail {
  readonly path: string;
  readonly rule: string;
}

export class DistributionCallerError extends Error {
  readonly code = 'caller_error' as const;
  readonly details: readonly CallerErrorDetail[];
  constructor(details: readonly CallerErrorDetail[]) {
    super(`caller_error: ${details.map((d) => `${d.path}: ${d.rule}`).join('; ')}`);
    this.name = 'DistributionCallerError';
    this.details = Object.freeze([...details]);
  }
}

/** Structural signal an authority adapter uses to report a typed failure. */
export interface AuthorityFailure {
  readonly failureKind?: string;
}

/** Control-plane-side typed failure signal (e.g. unresolvable observation). */
export class AuthorityFailureSignal extends Error {
  readonly failureKind: string;
  constructor(failureKind: string, message: string) {
    super(message);
    this.name = 'AuthorityFailureSignal';
    this.failureKind = failureKind;
  }
}

// ---------------------------------------------------------------------------
// Gates (AC2: rights → policy → provider; verbatim denial reasons)
// ---------------------------------------------------------------------------

export type GateDecision =
  | { readonly decision: 'ALLOW' }
  | { readonly decision: 'DENY'; readonly reason: string };

export interface RightsGateInput {
  readonly tenant: TenantId;
  readonly artifactRefs: readonly ArtifactVersionRef[];
  readonly targets: readonly ProviderTarget[];
  readonly rightsContext: RightsContextCitation;
}

export interface PolicyGateInput {
  readonly tenant: TenantId;
  readonly artifactRefs: readonly ArtifactVersionRef[];
  readonly targets: readonly ProviderTarget[];
  readonly policyContext: PolicyContextCitation;
}

export interface RightsGatePort {
  evaluateRights(input: RightsGateInput): Promise<GateDecision>;
}

export interface PolicyGatePort {
  evaluatePolicy(input: PolicyGateInput): Promise<GateDecision>;
}

// ---------------------------------------------------------------------------
// Distribution authority port — REAL @mos/distribution SocialAdapterContract
// (AC1: composition only; never a second publishing authority)
// ---------------------------------------------------------------------------

export interface AuthorityPublishInput {
  readonly tenant: TenantId;
  readonly target: ProviderTarget;
  readonly artifactRefs: readonly ArtifactVersionRef[];
  readonly distributionId: string;
}

export interface AuthorityPublishResult {
  readonly observationId: string;
  readonly providerId: string;
  readonly platformPostRef: string;
  readonly recordedAt: string;
}

/** Parity-only: scheduled publishing rides the jobs authority (§5/§26). */
export interface AuthorityScheduleInput {
  readonly tenant: TenantId;
  readonly target: ProviderTarget;
  readonly artifactRefs: readonly ArtifactVersionRef[];
  readonly distributionId: string;
  readonly scheduledAt: string;
}

export interface AuthorityScheduleResult {
  readonly observationId: string;
  readonly providerId: string;
  readonly scheduledFor: string;
}

export interface AuthorityObservation {
  readonly observationId: string;
  readonly providerId: string;
  /** The platform post this observation reports on (REAL: subjectRef). */
  readonly platformPostRef: string;
  /** Platform-said payload — NEVER stored by this surface (AC7). */
  readonly platformSaid: string;
  readonly sourceAttribution: string;
  readonly recordedAt: string;
}

export interface AuthorityObservationQuery {
  readonly tenant: TenantId;
  readonly observationIds: readonly string[];
}

export interface AuthorityRetractInput {
  readonly tenant: TenantId;
  readonly distributionId: string;
  readonly observationId: string;
  readonly reason: string;
}

export interface AuthorityRetractResult {
  readonly retractedAt: string;
}

export interface AuthorityRestriction {
  readonly restrictionId: string;
  readonly providerId: string;
  readonly channelRef?: string;
  readonly state: 'active' | 'inactive';
  readonly description: string;
}

export interface AuthorityRestrictionQuery {
  readonly tenant: TenantId;
  readonly providerIds: readonly string[];
}

export interface DistributionAuthorityPort {
  publish(input: AuthorityPublishInput): Promise<AuthorityPublishResult>;
  schedule(input: AuthorityScheduleInput): Promise<AuthorityScheduleResult>;
  readObservations(query: AuthorityObservationQuery): Promise<readonly AuthorityObservation[]>;
  delete(input: AuthorityRetractInput): Promise<AuthorityRetractResult>;
  listRestrictions(query: AuthorityRestrictionQuery): Promise<readonly AuthorityRestriction[]>;
}

// ---------------------------------------------------------------------------
// Health authority (AC6 / HEALTH-001: CONFIRMED-only gating, verbatim status)
// ---------------------------------------------------------------------------

export interface HealthRestrictionObservation {
  readonly restrictionId: string;
  readonly providerId: string;
  readonly channelRef?: string;
  /** Verbatim as reported; never coerced (AC8). */
  readonly status: HealthStatus;
  readonly observedAt: string;
}

export interface HealthQuery {
  readonly tenant: TenantId;
  readonly providerIds: readonly string[];
}

export interface HealthPort {
  readRestrictions(query: HealthQuery): Promise<readonly HealthRestrictionObservation[]>;
}

// ---------------------------------------------------------------------------
// Integrations directory (AC4: exact-version capability-instance resolution)
// ---------------------------------------------------------------------------

export interface DeclaredCapabilityInstance {
  readonly providerId: string;
  readonly capability: string;
  readonly instanceId: string;
  readonly instanceVersion: ExactVersion;
  readonly channelRef: string;
  readonly accountRef: string;
}

export interface IntegrationsDirectoryQuery {
  readonly tenant: TenantId;
  readonly providerIds: readonly string[];
}

export interface IntegrationsDirectoryPort {
  listCapabilityInstances(query: IntegrationsDirectoryQuery): Promise<readonly DeclaredCapabilityInstance[]>;
}

// ---------------------------------------------------------------------------
// Observability (§30): exactly one record per attributable attempt (AC2)
// ---------------------------------------------------------------------------

export type DenialOrigin = 'rights-gate' | 'policy-gate' | 'health-restrictions';
export type ObservabilityDecidedAt = DenialOrigin | 'gate-chain';
export type ObservabilityOutcome = 'allowed' | 'denied';

export interface ObservabilityRecord {
  readonly recordId: string;
  readonly tenant: TenantId;
  readonly recordedAt: string;
  readonly distributionId: string;
  readonly outcome: ObservabilityOutcome;
  readonly decidedAt: ObservabilityDecidedAt;
  /** Verbatim denial reason for gate denials. */
  readonly reason?: string;
}

export type ObservabilityRecordInput = Omit<ObservabilityRecord, 'recordId'>;

export interface ObservabilityRecorderPort {
  appendObservabilityRecord(input: ObservabilityRecordInput): Promise<{ recordId: string }>;
}

// ---------------------------------------------------------------------------
// Durable jobs (§26 / AC5): queued → running → succeeded|failed|cancelled|timed_out
// ---------------------------------------------------------------------------

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';

/** Unknown authority failure kinds preserved verbatim; never retried (AC8). */
export type TypedJobFailure =
  | { readonly kind: 'transport_error'; readonly message: string; readonly retryable: true }
  | { readonly kind: 'provider_rejected'; readonly message: string; readonly retryable: false }
  | { readonly kind: 'timeout'; readonly message: string; readonly retryable: true }
  | { readonly kind: 'unknown_failure'; readonly message: string; readonly retryable: false; readonly preservedKind: string };

export interface PublishJobPayload {
  readonly distributionId: string;
  readonly targets: readonly ProviderTarget[];
  readonly artifactRefs: readonly ArtifactVersionRef[];
}

export interface JobDeclaration {
  readonly tenant: TenantId;
  readonly clientJobKey: string;
  readonly kind: 'mos-distribution.production.publish';
  readonly payload: PublishJobPayload;
  readonly backoff: BackoffPolicy;
  readonly timeoutMs: number;
  readonly scheduledAt?: string;
}

export interface JobHandle {
  readonly jobId: string;
  readonly clientJobKey: string;
  readonly state: JobState;
  readonly attempts: number;
  readonly lastFailure?: TypedJobFailure;
}

export interface JobsPort {
  /** Idempotent by (tenant, clientJobKey). */
  enqueue(declaration: JobDeclaration): Promise<JobHandle>;
  getJob(query: { readonly tenant: TenantId; readonly jobId: string }): Promise<JobHandle | null>;
  cancelJob(query: { readonly tenant: TenantId; readonly jobId: string }): Promise<JobHandle | null>;
}

export type PublishJobHandler = (
  job: { readonly jobId: string; readonly declaration: JobDeclaration },
) => Promise<{ ok: true } | { ok: false; failure: TypedJobFailure }>;

// ---------------------------------------------------------------------------
// Records (AC8: tenant-scoped, append-only, immutable)
// ---------------------------------------------------------------------------

export type DistributionEventKind =
  | 'requested'
  | 'denied'
  | 'queued'
  | 'publish-succeeded'
  | 'publish-failed'
  | 'retraction-denied'
  | 'retracted'
  | 'cancelled';

export interface ObservationRef {
  /** By-reference citation (AC7): locator only, never the observation payload. */
  readonly observationId: string;
  readonly authorityModule: '@mos/distribution';
  readonly providerId: string;
  readonly recordedAt: string;
}

export interface DistributionEvent {
  readonly eventId: string;
  readonly tenant: TenantId;
  readonly distributionId: string;
  readonly kind: DistributionEventKind;
  readonly recordedAt: string;
  readonly reason?: string;
  readonly failure?: TypedJobFailure;
  readonly observationRefs?: readonly ObservationRef[];
  readonly targetKey?: string;
  readonly jobId?: string;
}

export interface HealthExclusion {
  readonly targetKey: string;
  readonly source: 'health-confirmed' | 'provider-declared-active';
  readonly restrictionId: string;
  /** Verbatim as consulted ('CONFIRMED' or 'active'). */
  readonly status: string;
}

export type TimeSource = {
  nowMs(): number;
  isoNow(): string;
};

export interface DistributionPlan {
  readonly distributionId: string;
  readonly tenant: TenantId;
  readonly request: DistributionRequest;
  readonly maneuverTargets: readonly ProviderTarget[];
  readonly exclusions: readonly HealthExclusion[];
  readonly gateChain: {
    readonly rights: 'ALLOW' | 'DENY';
    readonly policy: 'ALLOW' | 'DENY' | 'not-evaluated';
  };
  readonly schedule: DeclaredSchedule;
  readonly backoff: BackoffPolicy;
  readonly createdAt: string;
  readonly denial?: { readonly reason: string; readonly decidedAt: DenialOrigin };
  readonly healthContextConsulted?: {
    readonly consultedAt: string;
    readonly restrictions: readonly HealthRestrictionObservation[];
  };
  readonly providerRestrictionsConsulted?: readonly AuthorityRestriction[];
}

export interface DistributionSubmitResult {
  readonly distributionId: string;
  readonly status: 'denied' | 'queued';
  readonly plan: DistributionPlan;
  readonly reason?: string;
  readonly job?: JobHandle;
  readonly replayed?: boolean;
}

export interface RetractionResult {
  readonly status: 'retracted' | 'denied';
  readonly reason?: string;
}
