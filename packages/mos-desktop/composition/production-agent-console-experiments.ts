import type { IdentityRef, TenantScope, Timestamp } from '@mos/contracts';
import type { MarketingBenchmarkPort } from '@mos/lab';
import type { MissionRepository } from '@mos/missions';
import type {
  ExperimentsReadPort,
  ExperimentsUnresolved,
  RealExperimentBindingView,
} from '@mos/missions';
import type { RightsRepository } from '../../mos-rights/dist/index.js';
import type {
  DistributionObservationSource,
  ExperimentPolicyGatePort,
  ExperimentRightsGatePort,
  LabCandidateReaderPort,
  RealExperimentAuthorityPort,
  RealExperimentBindingFailure,
  RealExperimentBindingRequest,
  RealExperimentBindingOutcome,
} from '../../mos-experiments/dist/index.js';
import { createInMemoryRealExperimentAuthority } from '../../mos-experiments/dist/index.js';
import type { SocialPublicationRecord } from '../../mos-distribution/dist/index.js';
import type { JobQueuePort } from '../../mos-jobs/dist/index.js';
import { createDurableJobQueue, createInMemoryDurableJobStore } from '../../mos-jobs/dist/index.js';
import {
  createInMemoryPolicyEvaluation,
  createInMemoryPolicyRegistry,
} from '../../mos-policy/dist/index.js';

/**
 * The experiments half of the PRODUCTION Agent-Console binding (the CONSOLE
 * wave, Worker C) — the REAL BRIDGE-003 experiments authority behind both
 * the create-experiment intent and the compiler/engine ExperimentsReadPort.
 *
 * THE REAL AUTHORITY: `createInMemoryRealExperimentAuthority` — the shipped
 * disclosed in-memory RealExperimentAuthorityPort runtime. Its §24 binding
 * chain (the ONLY registration path) resolves, in order: the lab candidate
 * → the mission linkage → the policy verdict → the rights frame → the
 * production citation → the distribution binding → the experiment record +
 * the durable measurement job. Every gate's typed failure is relayed
 * VERBATIM as the console intent verdict (`lab-candidate-unresolved`,
 * `mission-not-active`, `policy-gate-denied`, `rights-gate-denied`, ...).
 *
 * SEAM WIRING (each disclosed in the file docblock of this module):
 *  - `missions` — the composition's REAL mission repository (the §24
 *    Mission segment resolves the exact cited record version through it).
 *  - `labCandidate` — a REAL adapter over the composition's REAL LAB-017
 *    benchmark runtime: the citation must resolve to a frozen benchmark
 *    record's own ranked entry (the compat-battery projection — never a
 *    re-run, never a rewrite). Unresolvable citations fail closed with the
 *    authority's own `lab-candidate-unresolved`.
 *  - `policyGate` — the REAL `@mos/policy` evaluation over a REAL registry
 *    carrying ONE composition-registered allow rule for the
 *    `experiment-launch` action kind (a disclosed composition decision:
 *    the console's capability contract, not business data — the
 *    agent-body-catalog precedent; the policy-admin transport supersedes
 *    it at P2).
 *  - `rightsGate` — the REAL rights repository behind the declared frame
 *    (verbatim per-reference statuses; the frame is active only when every
 *    cited grant/consent is active in-tenant — the same repository the
 *    grant-analysis-rights intent writes and the §25 intelligence gate
 *    reads: ONE shared rights authority).
 *  - `distribution` — a composition-held DECLARED publication log: the
 *    operator's declared publication citation registers per-declaration
 *    with the honest transport label `declared-console-composition` (the
 *    platform-confirmed publication transport is the disclosed P2
 *    boundary; the REAL distribution observation source replaces this seam
 *    without touching the authority).
 *  - `jobs` — the REAL `@mos/jobs` durable queue over the disclosed
 *    in-memory store (the §26 measurement segment rides it).
 *
 * DECLARED HYPOTHESIS JSON: the declaration's `hypothesisJson` carries the
 * binding citation frame the shell cannot derive — { labCandidate, policy,
 * rightsFrame, production { searchResult, selectedRank }, distribution,
 * measurement }. The composition parses it with the named parse codes,
 * selects the production candidate as the parsed result's OWN ranked entry
 * (the authority's identity comparison stays honest), registers the
 * declared publication, and routes the request. The declared experiment id
 * becomes the chain id through the authority's injectable id factory
 * (caller-driven allocation — the house pattern every other authority
 * here uses; a fresh auto id otherwise).
 */

/** The composition-resolved §30 operator principal (the device-local console operator). */
export const CONSOLE_OPERATOR_PRINCIPAL = 'principal:console-operator' as IdentityRef;

/** The composition's local experiment-launch policy rule id (disclosed). */
export const CONSOLE_EXPERIMENT_LAUNCH_POLICY_ID = 'policy:console-experiment-launch';

/** The honest transport source label on every declared publication. */
export const DECLARED_PUBLICATION_SOURCE = 'declared-console-composition';

// ---------------------------------------------------------------------------
// The runtime wiring
// ---------------------------------------------------------------------------

/** The REAL experiments runtime stack the console binding holds. */
export interface ConsoleExperimentsRuntime {
  /** The REAL experiments authority (the §24 registration + record reads). */
  readonly authority: RealExperimentAuthorityPort;
  /** The compiler/engine experiments read port over the authority. */
  readonly readPort: ExperimentsReadPort;
  /** The REAL durable job queue (the §26 measurement segment). */
  readonly jobsQueue: JobQueuePort;
  /** The composition-held declared publication log (disclosed seam state). */
  readonly declaredPublications: Map<string, SocialPublicationRecord>;
  /** Run one binding with the DECLARED experiment id as the chain id. */
  createBindingWithDeclaredId(
    declaredId: string,
    request: RealExperimentBindingRequest,
  ): Promise<RealExperimentBindingOutcome>;
}

/** Wire the REAL experiments authority over its disclosed seams. */
export function createConsoleExperimentsRuntime(options: {
  readonly scope: TenantScope;
  readonly now: () => string;
  readonly missions: MissionRepository;
  readonly labBenchmark: MarketingBenchmarkPort;
  readonly rightsRepository: RightsRepository;
}): ConsoleExperimentsRuntime {
  const scope = options.scope;
  const now = options.now;

  // — the REAL policy gate: registry + evaluation + the disclosed rule —
  const policyRegistry = createInMemoryPolicyRegistry({ now });
  policyRegistry.register({
    scope,
    id: CONSOLE_EXPERIMENT_LAUNCH_POLICY_ID as never,
    declaredScope: { actionKinds: ['experiment-launch'], subjectRefs: [], actorRefs: [] },
    constraints: [],
    effect: 'allow',
    rationale:
      "the console's local experiment-launch policy — a disclosed composition decision (the console's capability contract, not business data); the policy-admin transport supersedes it at P2",
    createdByAuthority: 'console-composition',
    createdBy: CONSOLE_OPERATOR_PRINCIPAL as never,
  });
  const policyEvaluation = createInMemoryPolicyEvaluation({ registry: policyRegistry, now });
  const policyGate: ExperimentPolicyGatePort = {
    check(request) {
      try {
        const record = policyEvaluation.evaluate({
          scope: request.scope,
          actor: request.actor,
          policy: request.policy.map((citation) => ({
            id: citation.id,
            version: citation.version,
          })),
          action: {
            actionKind: 'experiment-launch',
            subjectRef: request.subjectRef,
          } as never,
        });
        const verdict = record.verdict;
        if (verdict.outcome === 'allowed') {
          return {
            decision: 'permitted',
            outcome: 'allowed',
            denialReason: null,
            policyRef: verdict.byRule.id,
            evaluationRef: record.id,
          };
        }
        if (verdict.outcome === 'denied') {
          return {
            decision: 'denied',
            outcome: 'denied',
            denialReason: verdict.deniedBy.detail,
            policyRef: verdict.deniedBy.rule.id,
            evaluationRef: record.id,
          };
        }
        if (verdict.outcome === 'approval-required') {
          return {
            decision: 'denied',
            outcome: 'approval-required',
            denialReason: `approval-required: approver role "${verdict.approverRole}" must approve the experiment launch — ${verdict.rationale}`,
            policyRef: verdict.byRule.id,
            evaluationRef: record.id,
          };
        }
        return {
          decision: 'denied',
          outcome: 'insufficient-policy',
          denialReason:
            'insufficient-policy: no cited policy rule matched the experiment-launch action (fail closed)',
          policyRef: null,
          evaluationRef: record.id,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          decision: 'denied',
          outcome: 'denied',
          denialReason: `the REAL policy authority rejected the request (verbatim): ${reason}`,
          policyRef: null,
          evaluationRef: null,
        };
      }
    },
  };

  // — the REAL rights frame gate over the shared rights repository —
  const rightsRepository = options.rightsRepository;
  const rightsGate: ExperimentRightsGatePort = {
    resolveFrame(request) {
      const resolutions: {
        ref: string;
        kind: 'rights-grant' | 'consent-record';
        status: 'active' | 'unresolved' | 'revoked' | 'expired' | 'foreign-tenant';
      }[] = request.rightsRefs.map((ref) => {
        const grant = rightsRepository.getRights(ref as never);
        if (grant === null) {
          return { ref: String(ref), kind: 'rights-grant' as const, status: 'unresolved' as const };
        }
        if (String(grant.tenantId) !== String(request.scope.tenantId)) {
          return { ref: String(ref), kind: 'rights-grant' as const, status: 'foreign-tenant' as const };
        }
        if (grant.revokedAt !== null) {
          return { ref: String(ref), kind: 'rights-grant' as const, status: 'revoked' as const };
        }
        if (grant.expiresAt !== null && grant.expiresAt <= request.now) {
          return { ref: String(ref), kind: 'rights-grant' as const, status: 'expired' as const };
        }
        return { ref: String(ref), kind: 'rights-grant' as const, status: 'active' as const };
      });
      for (const ref of request.consentRefs) {
        const consent = rightsRepository.getConsent(ref as never);
        if (consent === null) {
          resolutions.push({ ref: String(ref), kind: 'consent-record' as const, status: 'unresolved' as const });
          continue;
        }
        if (String(consent.tenantId) !== String(request.scope.tenantId)) {
          resolutions.push({ ref: String(ref), kind: 'consent-record' as const, status: 'foreign-tenant' as const });
          continue;
        }
        if (consent.revokedAt !== null) {
          resolutions.push({ ref: String(ref), kind: 'consent-record' as const, status: 'revoked' as const });
          continue;
        }
        resolutions.push({ ref: String(ref), kind: 'consent-record' as const, status: 'active' as const });
      }
      return {
        resolutions,
        frameActive: resolutions.length > 0 && resolutions.every((entry) => entry.status === 'active'),
      };
    },
  };

  // — the REAL lab-candidate reader over the composition's LAB-017 runtime —
  const labCandidate: LabCandidateReaderPort = {
    async getLabCandidate(scope, citation) {
      const record = await options.labBenchmark.getBenchmarkRecord(
        scope,
        citation.benchmarkId as never,
        citation.benchmarkVersion,
      );
      if (record === null) {
        return null;
      }
      const ranked = record.ranked.find((entry: { readonly key?: unknown }) => entry.key === citation.candidateKey);
      if (ranked === undefined) {
        return null;
      }
      return {
        citation: { ...citation },
        expectations: {
          expectedReward: ranked.evaluation.expectedReward,
          interval: { ...ranked.evaluation.interval },
          uncertainty: ranked.evaluation.uncertainty,
          rewardSpecVersion: record.provenance.rewardSpecVersion,
          counterfactual: true,
        },
        disclosure: record.disclosure,
        benchmarkedAt: record.benchmarkedAt,
      };
    },
  };

  // — the composition-held DECLARED publication log (disclosed seam) —
  const declaredPublications = new Map<string, SocialPublicationRecord>();
  const distribution: DistributionObservationSource = {
    getPublication(tenantId, publicationId) {
      return declaredPublications.get(`${String(tenantId)}:${publicationId}`);
    },
    listObservations() {
      // Honest: no platform-said observations exist behind this seam yet —
      // the measurement segment's observation fold stays empty until the
      // REAL distribution observation transport lands (P2).
      return [];
    },
  };

  // — the REAL durable job queue (§26) —
  const jobsQueue = createDurableJobQueue({
    store: createInMemoryDurableJobStore(),
    clock: () => now() as Timestamp,
    now: () => Date.parse(now()),
  });

  // — the caller-driven experiment-id allocation (the house pattern) —
  let queuedExperimentId: string | null = null;
  let autoSequence = 0;

  const authority = createInMemoryRealExperimentAuthority({
    labCandidate,
    missions: options.missions,
    policyGate,
    rightsGate,
    distribution,
    jobs: jobsQueue,
    clock: () => now() as Timestamp,
    nextExperimentId: () => {
      const queued = queuedExperimentId;
      if (queued !== null) {
        return queued as never;
      }
      autoSequence += 1;
      return `exp-console-auto-${autoSequence}` as never;
    },
    nextAuditId: () => `expa-console-${(autoSequence += 1)}`,
  });

  const createBindingWithDeclaredId = (
    declaredId: string,
    request: RealExperimentBindingRequest,
  ): Promise<RealExperimentBindingOutcome> => {
    queuedExperimentId = declaredId;
    return authority.createBinding(request).finally(() => {
      queuedExperimentId = null;
    });
  };

  const readPort: ExperimentsReadPort = {
    async resolveExperimentBinding(ref, tenantId) {
      const record = authority.getExperiment(
        { tenantId: tenantId as never } as TenantScope,
        ref.experimentId as never,
      );
      if (record === undefined) {
        return {
          kind: 'experiment-not-found',
          experimentId: ref.experimentId,
        } satisfies ExperimentsUnresolved;
      }
      if (String(record.scope.tenantId) !== tenantId) {
        return {
          kind: 'experiment-tenant-mismatch',
          experimentId: ref.experimentId,
          bindingTenantId: String(record.scope.tenantId),
        } satisfies ExperimentsUnresolved;
      }
      if (record.status === 'closed' || record.status === 'abandoned') {
        return {
          kind: 'binding-inactive',
          experimentId: ref.experimentId,
          status: record.status,
        } satisfies ExperimentsUnresolved;
      }
      const binding: RealExperimentBindingView = {
        kind: 'real-experiment-binding',
        experimentId: String(record.id),
        bindingId: String(record.id),
        tenantId: String(record.scope.tenantId),
        status: 'active',
      };
      return binding;
    },
  };

  return { authority, readPort, jobsQueue, declaredPublications, createBindingWithDeclaredId };
}

/** Register one DECLARED publication citation into the seam's log. */
export function registerDeclaredPublication(options: {
  readonly scope: TenantScope;
  readonly now: () => string;
  readonly log: Map<string, SocialPublicationRecord>;
  readonly citation: {
    readonly publicationId: string;
    readonly expectedArtifact: { readonly artifactId: string; readonly version: number };
    readonly channelRef: string;
    readonly providerId: string;
    readonly postRef: string;
    readonly publishedAt: string;
    readonly rightsRef: string;
  };
}): SocialPublicationRecord {
  const { scope, now, log, citation } = options;
  const publication: SocialPublicationRecord = {
    id: citation.publicationId as never,
    scope: ({ ...scope } as never),
    channelRef: citation.channelRef as never,
    providerId: citation.providerId as never,
    artifact: {
      artifactId: citation.expectedArtifact.artifactId as never,
      version: citation.expectedArtifact.version as never,
      tenantId: scope.tenantId,
      digest: `declared-unverified:${citation.expectedArtifact.artifactId}` as never,
      type: 'reference-document',
      storageRef: `declared:${scope.tenantId}/${citation.expectedArtifact.artifactId}` as never,
      rightsRef: citation.rightsRef as never,
      provenanceRef: `declared:console/${citation.publicationId}` as never,
    },
    presentation: { kind: 'single-artifact' },
    postRef: citation.postRef as never,
    publishedAt: citation.publishedAt as never,
    recordedAt: now() as never,
    source: DECLARED_PUBLICATION_SOURCE,
  };
  log.set(`${String(scope.tenantId)}:${citation.publicationId}`, publication);
  return publication;
}

export { createExperimentIntentMethods } from './production-agent-console-experiment-intent.js';
