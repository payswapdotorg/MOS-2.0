import type {
  ConnectionsViewData,
  ConnectionsViewPort,
  DistributionBindingVm,
  ProviderDirectoryVm,
} from '../dist/src/ports/connections-views.js';

/**
 * DISCLOSED in-memory composition double for the Connections view port
 * (UX-004, over the PROD-001 distribution/integrations machinery).
 *
 * Everything here is FIXED fixture data over REAL-shaped view models — no
 * transport ever runs, no credential material exists anywhere in the tree,
 * and the exercised cases are exactly the honesty pins the surface claims:
 * multi-provider directory entries, UNKNOWN capabilities preserved, a
 * resolvable and an unresolvable client-instance implementation ref, the
 * gated+denied binding with ZERO transport calls, gate-error fail-closed,
 * CONFIRMED and SUSPECTED health mixes, a durable-job-linked executing
 * binding, retracted and abandoned lifecycle cases, and unresolvable
 * production-request/artifact/verdict refs rendered as typed failures.
 *
 * This is NOT the production composition: the TL-owned root binds the same
 * port over the REAL @mos/integrations + @mos/distribution surfaces at the
 * service seam without touching the shell's `src/` tree.
 */

const directory: ProviderDirectoryVm = {
  authority: 'provider-integrations',
  availability: { kind: 'available' },
  providers: [
    {
      providerId: 'prov-a',
      providerLabel: 'Provider A',
      providerKind: 'social-publisher',
      authority: 'provider-integrations',
      implementations: [
        {
          implementationId: 'impl-a1',
          implementationLabel: 'Provider A — HTTP adapter',
          status: 'available',
          transports: [{ transport: 'https', available: true }],
          capabilityMatrix: [
            { capability: 'publish', status: 'supported', statusNote: 'adapter claims' },
            { capability: 'direct-message', status: 'unknown', statusNote: 'not claimed by adapter' },
          ],
        },
      ],
      clientInstances: [
        {
          instanceId: 'inst-a-m1',
          merchantLabel: 'Merchant One',
          // REAL layer reference: the double's own implementation record
          // (the TL adapter injects the authority's layer record at the
          // production seam — here the disclosed fixture is the target).
          implementationRef: {
            resolvable: true,
            label: 'impl-a1',
            target: {
              implementationId: 'impl-a1',
              implementationLabel: 'Provider A — HTTP adapter',
              status: 'available',
              transports: [{ transport: 'https', available: true }],
              capabilityMatrix: [
                { capability: 'publish', status: 'supported', statusNote: 'adapter claims' },
                { capability: 'direct-message', status: 'unknown', statusNote: 'not claimed by adapter' },
              ],
            },
          },
          scopedToTenant: 'tenant-1',
        },
      ],
      availability: { kind: 'available' },
    },
    {
      providerId: 'prov-b',
      providerLabel: 'Provider B',
      providerKind: 'payment-connector',
      authority: 'provider-integrations',
      implementations: [
        {
          implementationId: 'impl-b1',
          implementationLabel: 'Provider B — registered only',
          status: 'unknown',
          transports: [],
          capabilityMatrix: [
            { capability: 'charge', status: 'unknown', statusNote: 'registration only — no capability claim' },
          ],
        },
      ],
      clientInstances: [
        {
          instanceId: 'inst-b-m2',
          merchantLabel: 'Merchant Two',
          implementationRef: {
            resolvable: false,
            kind: 'RefFailure',
            reason: 'implementation record not present in this snapshot',
          },
          scopedToTenant: 'tenant-2',
        },
      ],
      availability: { kind: 'available' },
    },
  ],
};

const bindings: readonly DistributionBindingVm[] = [
  {
    bindingId: 'bind-1',
    lifecycleStage: 'executing',
    productionRequestRef: { resolvable: true, label: 'pr-101', target: { requestId: 'pr-101' } },
    artifactSetVersions: [
      { artifactLabel: 'caption-set', version: 'v3', resolvable: true },
      { artifactLabel: 'media-set', version: 'v2', resolvable: true },
    ],
    rightsGate: { kind: 'granted', authority: 'rights', namedGrantOrConsent: 'consent:publish-scope', grantReason: 'tenant consent on file' },
    policyVerdict: { verdictRef: { resolvable: true, label: 'pv-9001', target: { verdictId: 'pv-9001', namedConstraint: 'distribution-policy-v2' } }, outcome: 'pass', namedConstraint: 'distribution-policy-v2' },
    durableSegment: {
      jobId: 'job-77',
      lastObservedState: 'running',
      recentEvents: [{ kind: 'job-started', occurredAt: 't1' }],
      claim: 'durable-job-queue',
    },
    healthObservations: [
      { platformSaid: true, sourceAttribution: 'platform probe', confidence: 'SUSPECTED', restrictionTyping: 'rate-limit-window', observedAt: 't2', rateLimitPosture: 'throttled' },
    ],
    tenantContext: 'tenant-1',
  },
  {
    bindingId: 'bind-2',
    lifecycleStage: 'gated',
    productionRequestRef: { resolvable: true, label: 'pr-102', target: { requestId: 'pr-102' } },
    artifactSetVersions: [{ artifactLabel: 'caption-set', version: 'v1', resolvable: true }],
    // THE zero-state: rights denial ⇒ 0 transport calls (criterion 5 provable).
    rightsGate: { kind: 'denied', authority: 'rights', namedRule: 'rule:tenant-lacks-publish-right', denialReason: 'tenant-2 has no publish right', transportCallsOccurred: 0 },
    policyVerdict: { verdictRef: { resolvable: false, kind: 'RefFailure', reason: 'policy verdict not reachable pre-gate' }, outcome: 'gate-error', namedConstraint: 'unreached' },
    durableSegment: null,
    healthObservations: [],
    tenantContext: 'tenant-2',
  },
  {
    bindingId: 'bind-3',
    lifecycleStage: 'retracted',
    productionRequestRef: { resolvable: false, kind: 'RefFailure', reason: 'production request archived beyond retention' },
    artifactSetVersions: [{ artifactLabel: 'caption-set', version: 'v0', resolvable: false, reason: 'artifact set evicted' }],
    rightsGate: { kind: 'gate-error', authority: 'policy', errorKind: 'verdict-unavailable', renderedFailClosed: true },
    policyVerdict: { verdictRef: { resolvable: false, kind: 'RefFailure', reason: 'no verdict record' }, outcome: 'gate-error', namedConstraint: 'unknown' },
    durableSegment: null,
    healthObservations: [
      { platformSaid: true, sourceAttribution: 'operator report', confidence: 'CONFIRMED', observedAt: 't3' },
    ],
    tenantContext: 'tenant-3',
  },
  {
    bindingId: 'bind-4',
    lifecycleStage: 'abandoned',
    productionRequestRef: { resolvable: true, label: 'pr-104', target: { requestId: 'pr-104' } },
    artifactSetVersions: [],
    rightsGate: { kind: 'granted', authority: 'rights', namedGrantOrConsent: 'grant:legacy', grantReason: 'legacy grant, since lapsed' },
    policyVerdict: { verdictRef: { resolvable: true, label: 'pv-8001', target: { verdictId: 'pv-8001', namedConstraint: 'distribution-policy-v1' } }, outcome: 'fail', namedConstraint: 'distribution-policy-v1' },
    durableSegment: null,
    healthObservations: [],
    tenantContext: 'tenant-1',
  },
];

/** The disclosed Connections surface double (UX-004 observability). */
export const connectionsCompositionDouble: ConnectionsViewPort = {
  async getConnectionsViewData(): Promise<ConnectionsViewData> {
    return {
      directory,
      bindings: {
        authority: 'social-distribution',
        bindings,
        availability: { kind: 'available' },
      },
    };
  },
};
