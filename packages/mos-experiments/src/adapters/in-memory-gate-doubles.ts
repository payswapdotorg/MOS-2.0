/**
 * DISCLOSED in-memory doubles of the BRIDGE-003 declared seams —
 * deterministic, self-labeling test fixtures for the in-package battery.
 *
 * These are DOUBLES, never authorities: the REAL `@mos/lab` benchmark
 * reader, the REAL `@mos/missions` repository, the REAL `@mos/policy`
 * evaluation port and the REAL `@mos/rights` repository are wired behind
 * the same ports at the compat seam (compat/experiments-real-stack.test.ts
 * — the MARKETING-001/BRIDGE-001 compat pattern). Every double records
 * the requests it received so tests can assert the EXACT frames the
 * authority emitted (gate ordering, §30 context, invocation counting).
 */

import type { TenantScope } from "@mos/contracts";

import type {
  LabCandidateCitation,
  LabCandidateReaderPort,
  LabCandidateSnapshot,
} from "../contracts/lab-candidate-seam.js";
import type {
  ExperimentPolicyCheckRequest,
  ExperimentPolicyGatePort,
  ExperimentPolicyVerdict,
  ExperimentRightsFrameRequest,
  ExperimentRightsFrameVerdict,
  ExperimentRightsGatePort,
  ExperimentRightsFrameResolution,
} from "../contracts/authority-seams.js";
import type {
  DistributionObservationSource,
} from "../contracts/authority-seams.js";
import type { SocialObservationRecord, SocialPublicationRecord } from "@mos/distribution";
import type { TenantId } from "@mos/contracts";

// ---------------------------------------------------------------------------
// The lab-candidate reader double
// ---------------------------------------------------------------------------

/** Options of {@link createInMemoryLabCandidateReader}. */
export interface InMemoryLabCandidateReaderOptions {
  /** The resolvable candidate snapshots (tenant-scoped by the snapshot's own tenantId view). */
  readonly snapshots: readonly (LabCandidateSnapshot & { readonly tenantId: string })[];
}

/** Create the disclosed lab-candidate reader double (call log for assertions). */
export function createInMemoryLabCandidateReader(
  options: InMemoryLabCandidateReaderOptions,
): LabCandidateReaderPort & {
  /** Test inspection: every (scope, citation) lookup, in order. */
  readonly requestedLookups: readonly {
    readonly tenantId: string;
    readonly benchmarkId: string;
    readonly benchmarkVersion: number;
    readonly candidateKey: string;
  }[];
} {
  const requestedLookups: {
    tenantId: string;
    benchmarkId: string;
    benchmarkVersion: number;
    candidateKey: string;
  }[] = [];
  return {
    async getLabCandidate(scope: TenantScope, citation: LabCandidateCitation) {
      requestedLookups.push({
        tenantId: String(scope.tenantId),
        benchmarkId: citation.benchmarkId,
        benchmarkVersion: citation.benchmarkVersion,
        candidateKey: citation.candidateKey,
      });
      const snapshot = options.snapshots.find(
        (candidate) =>
          candidate.citation.benchmarkId === citation.benchmarkId &&
          candidate.citation.benchmarkVersion === citation.benchmarkVersion &&
          candidate.citation.candidateKey === citation.candidateKey &&
          // §31: cross-tenant ≡ unknown — no existence leaks.
          candidate.tenantId === String(scope.tenantId),
      );
      if (snapshot === undefined) {
        return null;
      }
      return {
        citation: { ...snapshot.citation },
        expectations: structuredClone(snapshot.expectations),
        disclosure: snapshot.disclosure,
        benchmarkedAt: snapshot.benchmarkedAt,
      };
    },
    requestedLookups,
  };
}

// ---------------------------------------------------------------------------
// The policy gate double (scriptable, fail-closed default)
// ---------------------------------------------------------------------------

/** Options of {@link createInMemoryExperimentPolicyGate}. */
export interface InMemoryExperimentPolicyGateOptions {
  /**
   * The scripted verdicts, consumed in order; the LAST entry repeats.
   * Defaults to a fail-closed `insufficient-policy` denial — a double with
   * no script never permits (the W6-C no-permissive-default discipline).
   */
  readonly script?: readonly ExperimentPolicyVerdict[];
}

/** Create the disclosed policy-gate double (call log for assertions). */
export function createInMemoryExperimentPolicyGate(
  options: InMemoryExperimentPolicyGateOptions = {},
): ExperimentPolicyGatePort & {
  /** Test inspection: every check request the authority emitted, in order. */
  readonly receivedRequests: readonly ExperimentPolicyCheckRequest[];
} {
  const receivedRequests: ExperimentPolicyCheckRequest[] = [];
  const script = options.script ?? [
    {
      decision: "denied",
      outcome: "insufficient-policy",
      denialReason: "insufficient-policy (scripted default: no policy rule matched)",
      policyRef: null,
      evaluationRef: null,
    },
  ];
  let cursor = 0;
  return {
    check(request) {
      receivedRequests.push(structuredClone(request));
      const verdict = script[Math.min(cursor, script.length - 1)];
      cursor += 1;
      return verdict === undefined
        ? {
            decision: "denied",
            outcome: "insufficient-policy",
            denialReason: "insufficient-policy (scripted default: no policy rule matched)",
            policyRef: null,
            evaluationRef: null,
          }
        : { ...verdict };
    },
    receivedRequests,
  };
}

// ---------------------------------------------------------------------------
// The rights gate double (scriptable frame)
// ---------------------------------------------------------------------------

/** Options of {@link createInMemoryExperimentRightsGate}. */
export interface InMemoryExperimentRightsGateOptions {
  /** The scripted frame verdicts, in order (last repeats; default: nothing active). */
  readonly frameScript?: readonly ExperimentRightsFrameVerdict[];
}

/** Create the disclosed rights-gate double (call log for assertions). */
export function createInMemoryExperimentRightsGate(
  options: InMemoryExperimentRightsGateOptions = {},
): ExperimentRightsGatePort & {
  /** Test inspection: every frame request the authority emitted, in order. */
  readonly receivedFrameRequests: readonly ExperimentRightsFrameRequest[];
} {
  const receivedFrameRequests: ExperimentRightsFrameRequest[] = [];
  const nothingActive: ExperimentRightsFrameVerdict = { resolutions: [], frameActive: false };
  const frameScript = options.frameScript ?? [nothingActive];
  let cursor = 0;
  return {
    resolveFrame(request) {
      receivedFrameRequests.push(structuredClone(request));
      const verdict = frameScript[Math.min(cursor, frameScript.length - 1)] ?? nothingActive;
      cursor += 1;
      return {
        resolutions: verdict.resolutions.map((resolution: ExperimentRightsFrameResolution) => ({
          ...resolution,
        })),
        frameActive: verdict.frameActive,
      };
    },
    receivedFrameRequests,
  };
}

// ---------------------------------------------------------------------------
// The distribution observation source double
// ---------------------------------------------------------------------------

/** Options of {@link createInMemoryDistributionObservationSource}. */
export interface InMemoryDistributionObservationSourceOptions {
  /** The platform-confirmed publications (the tenant-scoped log double). */
  readonly publications: readonly SocialPublicationRecord[];
  /** The platform-said observation log (tenant-scoped, ascending order). */
  readonly observations: readonly SocialObservationRecord[];
}

/**
 * Create the disclosed distribution observation source double. Every read
 * is recorded so the battery can assert the EXACT reads the authority
 * performed (the invocation-counting spy over the REAL surfaces' shape).
 */
export function createInMemoryDistributionObservationSource(
  options: InMemoryDistributionObservationSourceOptions,
): DistributionObservationSource & {
  /** Test inspection: every (tenantId, publicationId) read, in order. */
  readonly publicationReads: readonly { readonly tenantId: string; readonly publicationId: string }[];
  /** Test inspection: every (tenantId, subjectRef) observation read, in order. */
  readonly observationReads: readonly { readonly tenantId: string; readonly subjectRef?: string }[];
} {
  const publicationReads: { tenantId: string; publicationId: string }[] = [];
  const observationReads: { tenantId: string; subjectRef?: string }[] = [];
  return {
    getPublication(tenantId: TenantId, publicationId: string) {
      publicationReads.push({ tenantId: String(tenantId), publicationId });
      const publication = options.publications.find(
        (candidate) =>
          String(candidate.id) === publicationId &&
          String(candidate.scope.tenantId) === String(tenantId),
      );
      return publication === undefined ? undefined : structuredClone(publication);
    },
    listObservations(tenantId: TenantId, filter?: { subjectRef?: string }) {
      observationReads.push({ tenantId: String(tenantId), subjectRef: filter?.subjectRef });
      return options.observations
        .filter(
          (observation) =>
            String(observation.scope.tenantId) === String(tenantId) &&
            (filter?.subjectRef === undefined ||
              String(observation.subjectRef) === String(filter.subjectRef)),
        )
        .map((observation) => structuredClone(observation));
    },
    publicationReads,
    observationReads,
  };
}
