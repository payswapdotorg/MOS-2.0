import type {
  StudioConsentRequirementView,
  StudioParticipantView,
  StudioReviewRecordView,
  StudioSessionDetailView,
  StudioSessionTransitionView,
} from '../ports/studio-directory.js';
import {
  STUDIO_CONSENT_STATE_PRESENTATION,
  STUDIO_LIFECYCLE_BADGE_CLASSES,
  STUDIO_LIFECYCLE_DESCRIPTIONS,
  studioDecisionActorLabel,
} from './studio-presentation.js';

/**
 * The Studio session detail (UX-002): the operator-facing read view of ONE
 * session — its append-only lifecycle history, its §15 multi-account
 * participants with live consent states, the §15 consent-required verdicts
 * rendered as actionable states, and the §30-attributable review records.
 * Read-only: no review, treatment or capture control is offered here; those
 * are studio-authority actions behind operator ports.
 */

function ConsentStateBadge({ state }: { readonly state: StudioParticipantView['consentState'] }) {
  const presentation = STUDIO_CONSENT_STATE_PRESENTATION[state];
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${presentation.badgeClass}`}
      data-testid={`studio-consent-state-${state}`}
    >
      {presentation.label}
    </span>
  );
}

function ParticipantRow({ participant }: { readonly participant: StudioParticipantView }) {
  return (
    <li
      className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-3"
      data-testid={`studio-participant-${participant.participantId}`}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-300">{participant.identityRef}</span>
        <ConsentStateBadge state={participant.consentState} />
      </span>
      <span className="text-xs text-slate-500">
        account <span className="font-mono">{participant.accountRef}</span> ·{' '}
        {participant.roles.length === 0 ? 'no roles' : participant.roles.join(', ')}
      </span>
      <span className="font-mono text-[11px] text-slate-600">
        consent {participant.consentRefs.join(' · ') || '(no refs recorded)'}
      </span>
      <span className="text-[11px] text-slate-500">
        capture {participant.coversCapture ? 'covered' : 'not covered'} · processing{' '}
        {participant.coversProcessingIntoArtifacts ? 'covered' : 'not covered'} (§15)
      </span>
    </li>
  );
}

function ConsentRequirementPanel({ requirement }: { readonly requirement: StudioConsentRequirementView }) {
  return (
    <li
      role="alert"
      className="rounded-lg border border-red-900/60 bg-red-950/20 p-3"
      data-testid={`studio-consent-required-${requirement.subjectIdentityRef}`}
    >
      <p className="text-xs font-semibold text-red-300">
        Consent required — {requirement.subjectKind === 'participant' ? 'participant' : 'imported source holder'}{' '}
        <span className="font-mono">{requirement.subjectIdentityRef}</span>
      </p>
      <p className="mt-1 text-xs text-red-200/80">{requirement.message}</p>
      <p className="mt-1 font-mono text-[11px] text-red-200/60">
        artifact {requirement.artifactId} · consent {requirement.consentRefs.join(' · ')}
      </p>
      <p className="mt-1 text-[11px] text-red-200/60">
        Forward-moving operator actions are refused fail-closed (§15) until consent is restored. The
        consent change itself belongs to the rights authority — this surface only shows the verdict.
      </p>
    </li>
  );
}

function ReviewRow({ review }: { readonly review: StudioReviewRecordView }) {
  return (
    <li
      className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-3"
      data-testid="studio-review-record"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200">
          {review.outcome}
        </span>
        <span className="text-xs text-slate-400">
          decided by <span className="font-semibold text-slate-300">{studioDecisionActorLabel(review.decidedBy)}</span>
        </span>
        <span className="font-mono text-[11px] text-slate-600">{review.decidedAt}</span>
      </span>
      <span className="font-mono text-[11px] text-slate-500">
        target artifact {review.targetArtifactId}
      </span>
      {review.rejection === null ? null : (
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] ${
            review.rejection.kind === 'quality-rejection'
              ? 'bg-amber-500/15 text-amber-300'
              : 'bg-red-500/15 text-red-300'
          }`}
          data-testid="studio-review-rejection"
        >
          {review.rejection.kind === 'quality-rejection'
            ? 'Quality rejection'
            : 'Rights/policy rejection'}
          : {review.rejection.detail}
        </span>
      )}
    </li>
  );
}

function TransitionRow({ transition }: { readonly transition: StudioSessionTransitionView }) {
  return (
    <li className="flex flex-wrap items-baseline gap-2 text-xs text-slate-400">
      <span className="font-mono">
        <span className={STUDIO_LIFECYCLE_BADGE_CLASSES[transition.from]}>
          {transition.from}
        </span>{' '}
        → <span className={STUDIO_LIFECYCLE_BADGE_CLASSES[transition.to]}>{transition.to}</span>
      </span>
      <span className="font-mono text-[11px] text-slate-600">{transition.at}</span>
      {transition.reason === null ? null : (
        <span className="text-[11px] text-slate-500">— {transition.reason}</span>
      )}
    </li>
  );
}

/** The session detail panel over the loaded directory detail view model. */
export function StudioSessionDetailPanel({ detail }: { readonly detail: StudioSessionDetailView }) {
  const { summary } = detail;
  return (
    <article
      aria-labelledby="studio-session-detail-title"
      className="flex flex-col gap-5 rounded-lg border border-slate-800 bg-slate-900/30 p-4 sm:p-6"
      data-testid="studio-session-detail"
    >
      <header className="flex flex-col gap-1">
        <h3 id="studio-session-detail-title" className="text-base font-semibold text-slate-100">
          Session <span className="font-mono">{summary.sessionId}</span>
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              STUDIO_LIFECYCLE_BADGE_CLASSES[summary.lifecycleState]
            }`}
          >
            {summary.lifecycleState}
          </span>
          <span>{STUDIO_LIFECYCLE_DESCRIPTIONS[summary.lifecycleState]}</span>
        </p>
        <p className="font-mono text-xs text-slate-500">
          tenant {summary.tenantId} · created {summary.createdAt}
        </p>
        {summary.artifactPackageRef === null ? (
          <p className="text-xs text-slate-500" data-testid="studio-detail-package-none">
            No artifact package yet — packaging happens at review acceptance.
          </p>
        ) : (
          <p className="text-xs text-slate-400" data-testid="studio-detail-package">
            Artifact package{' '}
            <a
              href={`/studio?session=${encodeURIComponent(summary.sessionId)}&package=${encodeURIComponent(
                summary.artifactPackageRef.packageId,
              )}`}
              className="text-sky-400 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              {summary.artifactPackageRef.packageId} (chain)
            </a>{' '}
            — latest shown version v{summary.artifactPackageRef.version}
          </p>
        )}
      </header>

      <section aria-labelledby="studio-session-transitions-title">
        <h4 id="studio-session-transitions-title" className="text-sm font-semibold text-slate-200">
          Lifecycle history (append-only)
        </h4>
        {detail.transitions.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500" data-testid="studio-transitions-empty">
            No transitions recorded yet — the session is still in its created state.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5" data-testid="studio-transitions">
            {detail.transitions.map((transition, index) => (
              <TransitionRow key={`${transition.at}-${index}`} transition={transition} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="studio-session-participants-title">
        <h4 id="studio-session-participants-title" className="text-sm font-semibold text-slate-200">
          Participants (§15 multi-account — identity, account boundary and consent stay separate)
        </h4>
        {detail.participants.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500" data-testid="studio-participants-empty">
            No participants have joined yet.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="studio-participants">
            {detail.participants.map((participant) => (
              <ParticipantRow key={participant.participantId} participant={participant} />
            ))}
          </ul>
        )}
      </section>

      {detail.consentRequirements.length === 0 ? null : (
        <section aria-labelledby="studio-consent-requirements-title">
          <h4 id="studio-consent-requirements-title" className="text-sm font-semibold text-red-300">
            Consent required (§15 live re-resolution)
          </h4>
          <ul className="mt-2 flex flex-col gap-2" data-testid="studio-consent-requirements">
            {detail.consentRequirements.map((requirement) => (
              <ConsentRequirementPanel
                key={`${requirement.subjectIdentityRef}-${requirement.artifactId}`}
                requirement={requirement}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="studio-session-reviews-title">
        <h4 id="studio-session-reviews-title" className="text-sm font-semibold text-slate-200">
          Review records (§30-attributable, append-only)
        </h4>
        {detail.reviews.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500" data-testid="studio-reviews-empty">
            No review decision recorded yet.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" data-testid="studio-reviews">
            {detail.reviews.map((review, index) => (
              <ReviewRow key={`${review.decidedAt}-${index}`} review={review} />
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
