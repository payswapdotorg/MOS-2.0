/**
 * UX-004 — Connections / Integrations view port.
 * Presentation-only (WEB-001 discipline): imports ONLY own shell types. The
 * composition root injects real-shaped data; nothing here fabricates.
 *
 * Two DISTINCT observed authorities (spec §3 — never fused):
 *  - connectionsDirectory  → @mos/integrations  (provider-integrations)
 *  - distributionBindings  → @mos/distribution   (social-distribution)
 *
 * PLAN C reconciliation (TL battery): the worker emission assumed
 * `ProductionRequestRef` / `PolicyVerdictRef` / `JobQueueEvent` contract
 * names; the REAL surfaces carry no such exports, so the resolvable-ref
 * targets are declared here as presentation anchor views (the house
 * pattern: view models re-declare the observed record shapes — the shell
 * renders the LABEL and the anchor id, never the full domain record, which
 * stays in the production authority).
 */

/* ---------- honest availability (house pattern) ---------- */

export type ConnectionsAvailability =
  | { kind: 'available' }
  | { kind: 'unavailable'; reason: string };

/* ---------- §13 lifecycle badges ---------- */

export type DistributionBindingLifecycleStage =
  | 'draft'
  | 'gated'
  | 'executing'
  | 'observed'
  | 'closed'
  | 'retracted'
  | 'abandoned';

/* ---------- §27 credential discipline: NO secret-shaped fields anywhere ---------- */

/** Resolvable-only reference: unresolvable is a TYPED failure, never a blank. */
export type ResolvableRef<T> =
  | { resolvable: true; label: string; target: T }
  | { resolvable: false; kind: 'RefFailure'; reason: string };

/**
 * Presentation anchor for a resolved production-request reference — the
 * full `ProductionRequest` record stays in the production authority; the
 * shell's view model carries only what it renders.
 */
export interface ProductionRequestAnchorView {
  readonly requestId: string;
}

/** Policy-verdict record view (presentation re-declaration of the verdict the distribution authority owns). */
export interface PolicyVerdictRecordView {
  readonly verdictId: string;
  readonly namedConstraint: string;
}

/** Durable job-queue event view (§26 trail enrichment, presentation re-declaration). */
export interface DurableJobEventView {
  readonly kind: string;
  readonly occurredAt: string;
}

/* ---------- integrations authority: the four-layer machinery (INTEG-001) ---------- */

export type CapabilityStatus = 'supported' | 'unsupported' | 'unknown';

export interface CapabilityMatrixEntryVm {
  readonly capability: string;
  /** UNKNOWN states are PRESERVED — never coerced. Pinned by test. */
  readonly status: CapabilityStatus;
  readonly statusNote: string;
}

export type ProviderImplementationStatusVm =
  | 'registered'
  | 'available'
  | 'unavailable'
  | 'degraded'
  | 'unknown';

export interface ProviderImplementationLayerVm {
  readonly implementationId: string;
  readonly implementationLabel: string;
  readonly status: ProviderImplementationStatusVm;
  readonly transports: ReadonlyArray<{ transport: string; available: boolean }>;
  readonly capabilityMatrix: ReadonlyArray<CapabilityMatrixEntryVm>;
}

export interface ProviderClientInstanceVm {
  readonly instanceId: string;
  readonly merchantLabel: string;
  readonly implementationRef: ResolvableRef<ProviderImplementationLayerVm>;
  readonly scopedToTenant: string; // §31 tenant context explicit
}

export interface ProviderDefinitionVm {
  readonly providerId: string;
  readonly providerLabel: string;
  readonly providerKind: string; // from the integrations ProviderKind vocabulary (§2b)
  /** Authority attribution — always named, never fused. */
  readonly authority: 'provider-integrations';
  readonly implementations: ReadonlyArray<ProviderImplementationLayerVm>;
  readonly clientInstances: ReadonlyArray<ProviderClientInstanceVm>;
  readonly availability: ConnectionsAvailability;
}

export interface ProviderDirectoryVm {
  readonly authority: 'provider-integrations'; // DISTINCT from distribution (§3)
  readonly providers: ReadonlyArray<ProviderDefinitionVm>;
  readonly availability: ConnectionsAvailability;
}

/* ---------- distribution authority: binding lifecycle (PROD-001) ---------- */

export type GateOutcomeVm =
  | {
      kind: 'denied';
      authority: 'rights';
      namedRule: string;
      denialReason: string;
      /** SOCIAL-001 discipline made visible: denial ⇒ ZERO transport calls. */
      transportCallsOccurred: 0;
    }
  | {
      kind: 'granted';
      authority: 'rights';
      namedGrantOrConsent: string;
      grantReason: string;
    }
  | {
      kind: 'gate-error';
      authority: 'rights' | 'policy';
      errorKind: string;
      /** fail-closed render (criterion 5). */
      renderedFailClosed: true;
    };

export interface PolicyVerdictGateVm {
  readonly verdictRef: ResolvableRef<PolicyVerdictRecordView>;
  readonly outcome: 'pass' | 'fail' | 'gate-error';
  readonly namedConstraint: string;
}

export interface DurableJobLinkVm {
  readonly jobId: string;
  /** platform-said job state — never a fake spinner (§26). */
  readonly lastObservedState: string;
  readonly recentEvents: ReadonlyArray<DurableJobEventView>;
  readonly claim: 'durable-job-queue' | 'synchronous-http';
}

export interface DistributionBindingHealthObservationVm {
  readonly platformSaid: true;
  readonly sourceAttribution: string;
  readonly confidence: 'CONFIRMED' | 'SUSPECTED'; // never conflated — pinned by test
  readonly restrictionTyping?: string;
  readonly observedAt: string;
  readonly rateLimitPosture?: string; // SOCIAL_RATE_LIMIT_POSTURES vocabulary (§2b)
}

export interface DistributionBindingVm {
  readonly bindingId: string;
  readonly lifecycleStage: DistributionBindingLifecycleStage;
  readonly productionRequestRef: ResolvableRef<ProductionRequestAnchorView>;
  readonly artifactSetVersions: ReadonlyArray<{
    artifactLabel: string;
    version: string;
    resolvable: boolean;
    reason?: string;
  }>;
  readonly rightsGate: GateOutcomeVm;
  readonly policyVerdict: PolicyVerdictGateVm;
  readonly durableSegment: DurableJobLinkVm | null;
  /** health observations as platform-said, source-attributed (HEALTH-001). */
  readonly healthObservations: ReadonlyArray<DistributionBindingHealthObservationVm>;
  readonly tenantContext: string; // §31
}

export interface DistributionBindingsVm {
  readonly authority: 'social-distribution'; // DISTINCT from integrations (§3)
  readonly bindings: ReadonlyArray<DistributionBindingVm>;
  readonly availability: ConnectionsAvailability;
}

/* ---------- the port the composition root satisfies ---------- */

export interface ConnectionsViewData {
  readonly directory: ProviderDirectoryVm;
  readonly bindings: DistributionBindingsVm;
}

export interface ConnectionsViewPort {
  /** Honest read — typed failures surface as verdicts, never placeholders. */
  readonly getConnectionsViewData: () => Promise<ConnectionsViewData>;
}
