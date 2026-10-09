import type { ConsentRef, StudioArtifactPackageId, StudioSessionId, StudioSessionLifecycleState, TenantScope, Version } from '@mos/contracts';
import type {
  StudioArtifactPackage,
  StudioOutputReview,
  StudioPackageSummary,
  StudioSessionSummaryRecord,
} from '@mos/studio';
import type {
  StudioConsentRequirementView,
  StudioConsentStateView,
  StudioDecisionActorView,
  StudioDirectoryFailure,
  StudioReviewRecordView,
  StudioSessionDetailView,
  StudioSessionSummaryView,
} from '../dist/src/ports/studio-directory.js';
import type {
  StudioArtifactLabelView,
  StudioPackageLibraryFailure,
  StudioPackageSummaryView,
  StudioPackageVersionView,
  StudioVersionChainView,
} from '../dist/src/ports/studio-packages.js';

/**
 * REAL-shape → view-model adapter for the Studio surface (UX-002).
 *
 * Composition seam (OUTSIDE `src/`): this module adapts records in the REAL
 * STUDIO-014 shapes — `StudioSessionSummaryRecord` (the session-directory
 * observation port), `StudioArtifactPackage` / `StudioPackageSummary` (the
 * packaging authority's browsing surface) and `StudioOutputReview` (the
 * §30-attributable review records) — into the web package's presentation
 * view models. The `@mos/studio` imports are TYPE-ONLY (erased at compile
 * time): the REAL studio runtime is node-side (it imports `node:crypto`) and
 * can never run inside the browser bundle, so the composition double feeds
 * REAL-shaped data through THIS adapter, and the node-only compat battery
 * (`studio-real-shape-compat.test.ts`) drives the REAL exported runtime and
 * feeds its actual outputs through the same functions — zero drift between
 * the double's shapes and the authority's.
 *
 * The adapter is derived, never creative: every view-model field is a
 * projection, count, or verbatim relay of a REAL record field. When a
 * summary carries a lifecycle state outside the canonical union, the adapter
 * fails LOUD (`adaptUnknownLifecycleState`) rather than guessing.
 */

/** The session-detail projection the adapter consumes (satisfied by REAL session views). */
export interface StudioSessionDetailSource {
  /** The directory's latest summary of the session. */
  readonly summary: StudioSessionSummaryRecord;
  /** The session's append-only lifecycle (state + transitions). */
  readonly lifecycle: {
    readonly state: StudioSessionLifecycleState;
    readonly transitions: readonly {
      readonly from: StudioSessionLifecycleState;
      readonly to: StudioSessionLifecycleState;
      readonly at: string;
      readonly reason?: string;
    }[];
  };
  /** §15 participants, projected flat (identity/account/roles/consent coverage). */
  readonly participants: readonly {
    readonly participantId: string;
    readonly identityRef: string;
    readonly accountRef: string;
    readonly roles: readonly string[];
    readonly consentRefs: readonly string[];
    readonly coversCapture: boolean;
    readonly coversProcessingIntoArtifacts: boolean;
  }[];
  /** §30-attributable review records, in REAL shape. */
  readonly reviews: readonly StudioOutputReview[];
  /** The §15 raw-artifact consent coverage projection (holder identities for re-resolution). */
  readonly consentEntries: readonly {
    readonly artifactId: string;
    readonly consentRefs: readonly ConsentRef[];
    readonly holderIdentityRef?: string;
  }[];
  /**
   * Live §15 re-resolution outcomes per known holder, as resolved at read
   * time through the rights authority (the same resolution the studio
   * runtime runs at its operator gates). Holders absent from this list have
   * no recorded resolution — their recorded refs stand as-is (disclosed).
   */
  readonly holderResolutions: readonly {
    readonly holderIdentityRef: string;
    readonly coversProcessingIntoArtifacts: boolean;
  }[];
}

function adaptUnknownLifecycleState(state: string): never {
  throw new Error(
    `studio-shape-adapter: the studio authority reported a lifecycle state outside the canonical union: ${String(state)}`,
  );
}

/** REAL session summary → directory listing view model. */
export function sessionSummaryViewOf(summary: StudioSessionSummaryRecord): StudioSessionSummaryView {
  const lifecycleState = summary.lifecycleState as StudioSessionLifecycleState;
  switch (lifecycleState) {
    case 'requested':
    case 'loading':
    case 'capturing':
    case 'processing':
    case 'review':
    case 'packaged':
    case 'closed':
    case 'abandoned':
    case 'failed':
      break;
    default:
      adaptUnknownLifecycleState(summary.lifecycleState);
  }
  return {
    sessionId: summary.sessionRef,
    tenantId: summary.tenantId,
    formatId: summary.formatId,
    formatVersion: summary.formatVersion,
    lifecycleState,
    createdAt: String(summary.createdAt),
    participantCount: summary.participantCount,
    organizationRef: { ...summary.organizationRef },
    artifactPackageRef:
      summary.artifactPackageRef === null
        ? null
        : {
            // The REAL summary record carries the package id loosely typed;
            // the view pins it to the canonical branded id (compile-time only).
            packageId: summary.artifactPackageRef.packageId as StudioArtifactPackageId,
            version: summary.artifactPackageRef.version as Version,
          },
  };
}

/** REAL decision actor → presentation actor. */
export function decisionActorViewOf(actor: StudioOutputReview['decidedBy']): StudioDecisionActorView {
  switch (actor.kind) {
    case 'lab':
      return { kind: 'lab', ref: String(actor.labCandidateRef) };
    case 'standalone-user':
      return { kind: 'standalone-user', ref: String(actor.identityRef) };
    case 'studio-operator':
      return { kind: 'studio-operator', ref: String(actor.identityRef) };
  }
}

/** REAL §30 review record → presentation review record. */
export function reviewRecordViewOf(review: StudioOutputReview): StudioReviewRecordView {
  let rejection: StudioReviewRecordView['rejection'] = null;
  if (review.rejection !== undefined) {
    if (review.rejection.kind === 'quality-rejection') {
      rejection = {
        kind: 'quality-rejection',
        detail:
          review.rejection.failedCriteria.length === 0
            ? 'no failed criteria recorded'
            : `failed: ${review.rejection.failedCriteria.join(', ')}`,
      };
    } else {
      rejection = {
        kind: 'rights-policy-rejection',
        detail:
          review.rejection.violations.length === 0
            ? 'no violation records cited'
            : `violations: ${review.rejection.violations.map(String).join(', ')}`,
      };
    }
  }
  return {
    outcome: review.outcome,
    decidedBy: decisionActorViewOf(review.decidedBy),
    decidedAt: String(review.decidedAt),
    targetArtifactId: String(review.targetArtifact.artifactId),
    rejection,
  };
}

function consentStateOf(
  participant: StudioSessionDetailSource['participants'][number],
  resolution: { readonly coversProcessingIntoArtifacts: boolean } | undefined,
): StudioConsentStateView {
  if (resolution !== undefined && !resolution.coversProcessingIntoArtifacts) {
    return 'consent-required';
  }
  return participant.coversCapture && participant.coversProcessingIntoArtifacts
    ? 'granted'
    : 'pending';
}

/** REAL session-detail projection → session detail view model. */
export function sessionDetailViewOf(source: StudioSessionDetailSource): StudioSessionDetailView {
  const summary = sessionSummaryViewOf(source.summary);
  const participantIdentities = new Set(source.participants.map((p) => p.identityRef));
  const resolutionByHolder = new Map(
    source.holderResolutions.map((resolution) => [resolution.holderIdentityRef, resolution]),
  );

  const consentRequirements: StudioConsentRequirementView[] = [];
  for (const entry of source.consentEntries) {
    if (entry.holderIdentityRef === undefined) {
      continue;
    }
    const resolution = resolutionByHolder.get(String(entry.holderIdentityRef));
    if (resolution === undefined || resolution.coversProcessingIntoArtifacts) {
      continue;
    }
    const subjectKind = participantIdentities.has(String(entry.holderIdentityRef))
      ? ('participant' as const)
      : ('imported-source' as const);
    consentRequirements.push({
      subjectKind,
      subjectIdentityRef: String(entry.holderIdentityRef),
      artifactId: entry.artifactId,
      consentRefs: entry.consentRefs.map(String),
      message: `Consent no longer covers processing into artifacts — ${
        subjectKind === 'participant' ? 'the participant' : 'the imported source holder'
      } must re-consent before the session can move forward.`,
    });
  }

  return {
    summary,
    transitions: source.lifecycle.transitions.map((transition) => ({
      from: transition.from,
      to: transition.to,
      at: String(transition.at),
      reason: transition.reason === undefined ? null : transition.reason,
    })),
    participants: source.participants.map((participant) => ({
      participantId: participant.participantId,
      identityRef: participant.identityRef,
      accountRef: participant.accountRef,
      roles: [...participant.roles],
      consentState: consentStateOf(participant, resolutionByHolder.get(participant.identityRef)),
      coversCapture: participant.coversCapture,
      coversProcessingIntoArtifacts: participant.coversProcessingIntoArtifacts,
      consentRefs: participant.consentRefs.map(String),
    })),
    reviews: source.reviews.map(reviewRecordViewOf),
    consentRequirements,
  };
}

/** REAL package version → package version view model (§14 labels included). */
export function packageVersionViewOf(pkg: StudioArtifactPackage): StudioPackageVersionView {
  const finalArtifacts: StudioArtifactLabelView[] = pkg.finalArtifacts.map((artifact) => ({
    artifactId: artifact.artifactId,
    type: artifact.type,
    stage: artifact.stage,
    creationMethod: artifact.creationMethod,
    synthetic: artifact.creationMethod === 'engine-generated',
    parentCount: artifact.parentArtifactRefs.length,
  }));
  return {
    packageId: pkg.id,
    version: pkg.version,
    sessionRef: pkg.sessionRef,
    createdAt: String(pkg.createdAt),
    evaluation: {
      status: pkg.evaluation.status,
      outcome: pkg.evaluation.outcome,
      evaluationRef: pkg.evaluation.evaluationRef === undefined ? null : pkg.evaluation.evaluationRef,
    },
    provenance: {
      containsSyntheticMaterial: pkg.provenance.containsSyntheticMaterial,
      lineageComplete: pkg.provenance.lineageComplete,
      provenanceRefCount: pkg.provenance.provenanceRefs.length,
    },
    consent: {
      allRawArtifactsCovered: pkg.consent.allRawArtifactsCovered,
      participantConsentCount: pkg.consent.participantConsentRefs.length,
    },
    finalArtifacts,
    artifactCounts: {
      raw: pkg.rawArtifacts.length,
      intermediate: pkg.intermediateArtifacts.length,
      final: pkg.finalArtifacts.length,
    },
    transcriptCount: pkg.transcriptRefs.length,
    editGraph: {
      graphId: String(pkg.editGraphRef.graphId),
      version: pkg.editGraphRef.version,
      otioInterchange: pkg.editGraphRef.otioInterchange,
    },
    cost: { ...pkg.cost.total },
    durationSeconds: {
      capture: pkg.duration.captureSeconds,
      processing: pkg.duration.processingSeconds,
      totalWallClock: pkg.duration.totalWallClockSeconds,
    },
  };
}

/** REAL package summary → library listing view model. */
export function packageSummaryViewOf(summary: StudioPackageSummary): StudioPackageSummaryView {
  return {
    packageId: summary.packageId,
    sessionRef: summary.sessionRef,
    latestVersion: summary.latestVersion,
    versionCount: summary.versionCount,
  };
}

/** REAL package chain (ascending) → version chain view model. */
export function packageChainViewOf(
  chain: readonly StudioArtifactPackage[],
): StudioVersionChainView {
  if (chain.length === 0) {
    throw new Error('studio-shape-adapter: a version chain cannot be empty');
  }
  const versions = [...chain]
    .sort((a, b) => a.version - b.version)
    .map(packageVersionViewOf);
  return {
    packageId: versions[0]?.packageId as StudioArtifactPackageId,
    sessionRef: versions[0]?.sessionRef as StudioSessionId,
    versions,
  };
}

/** Directory failure constructors (typed, never thrown). */
export function studioDirectoryFailure(
  error: StudioDirectoryFailure['error'],
  message: string,
): StudioDirectoryFailure {
  return { error, message };
}

/** Package-library failure constructors (typed, never thrown). */
export function studioPackageLibraryFailure(
  error: StudioPackageLibraryFailure['error'],
  message: string,
): StudioPackageLibraryFailure {
  return { error, message };
}

/** Exact-tenant scope check for the seam's read guards (§31, no existence leaks). */
export function sameTenant(scope: TenantScope, tenantId: string): boolean {
  return scope.tenantId === tenantId;
}
