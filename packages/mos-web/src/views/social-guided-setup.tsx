import type { SocialPlatformView } from '../ports/social-workspace.js';
import {
  SOCIAL_AGENT_GUIDE_QUOTE,
  SOCIAL_AGENT_GUIDE_TITLE,
  SOCIAL_ASK_FOLLOWUP_DISCLOSURE,
  SOCIAL_ASK_FOLLOWUP_LABEL,
  SOCIAL_ASK_FOLLOWUP_NOTE,
  SOCIAL_GUIDED_SETUP_NOTE,
  SOCIAL_GUIDED_SETUP_TITLE,
  SOCIAL_STEP_STATE_LABELS,
} from './social-presentation.js';

/**
 * The guided-setup checklist + AGENT GUIDE panel (the UXR social wave): the
 * target design's five steps with their DERIVED states — the read model
 * decides `not-started` / `in-progress` / `complete`, and this component
 * NEVER advances a step on its own (steps advance only on real completion
 * signals: navigation to the owning surface plus an authority receipt where
 * a declare exists). The `?step=` anchor highlights a step for deep links;
 * highlighting is presentation, never completion.
 */

const STEP_BADGE_CLASSES: Readonly<Record<'not-started' | 'in-progress' | 'complete', string>> =
  Object.freeze({
    'not-started': 'bg-slate-200 text-slate-600 border border-slate-300',
    'in-progress': 'bg-sky-100 text-sky-800 border border-sky-300',
    complete: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  });

function StepBadge({
  state,
  position,
}: {
  readonly state: 'not-started' | 'in-progress' | 'complete';
  readonly position: number;
}) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${STEP_BADGE_CLASSES[state]}`}
      data-state={state}
      data-testid={`social-step-badge-${position}`}
      aria-hidden="true"
    >
      {state === 'complete' ? '✓' : String(position)}
    </span>
  );
}

/** The guided-setup checklist panel (left pane of the target layout). */
export function SocialGuidedSetupPanel({
  platform,
  stepAnchor,
}: {
  readonly platform: SocialPlatformView;
  /** The `?step=` deep-link anchor (1..5), when given — highlight only. */
  readonly stepAnchor: number | null;
}) {
  const setup = platform.guidedSetup;
  return (
    <section
      aria-labelledby="social-guided-setup-title"
      className="rounded-lg border border-slate-200 bg-white p-4"
      data-testid="social-guided-setup"
    >
      <h3 id="social-guided-setup-title" className="text-base font-semibold text-slate-900">
        {SOCIAL_GUIDED_SETUP_TITLE}
      </h3>
      <p className="mt-1 text-xs text-slate-500">{SOCIAL_GUIDED_SETUP_NOTE}</p>
      <ol className="mt-3 flex flex-col gap-3">
        {setup.guidedSteps.map((step) => {
          const anchored = stepAnchor !== null && stepAnchor === step.position;
          return (
            <li
              key={step.position}
              className={`flex gap-3 rounded-md p-2 ${anchored ? 'bg-sky-50 ring-1 ring-sky-200' : ''}`}
              data-testid={`social-guided-step-${step.position}`}
            >
              <StepBadge state={step.state} position={step.position} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p
                  className={`text-sm font-semibold ${step.state === 'complete' ? 'text-emerald-700' : 'text-slate-800'}`}
                >
                  {step.label}
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {SOCIAL_STEP_STATE_LABELS[step.state]}
                  </span>
                </p>
                <p className="text-xs text-slate-500">{step.hint}</p>
                <p className="text-[11px] leading-snug text-slate-400" data-testid={`social-step-signal-${step.position}`}>
                  Advances when: {step.completionSignal}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 border-t border-slate-200 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {SOCIAL_AGENT_GUIDE_TITLE}
        </p>
        <blockquote
          className="mt-1 border-l-2 border-mos-navy pl-2 text-xs italic leading-relaxed text-slate-600"
          data-testid="social-agent-guide-quote"
        >
          {SOCIAL_AGENT_GUIDE_QUOTE}
        </blockquote>
        {setup.missionContext === null ? (
          <p className="mt-2 text-[11px] text-slate-500" data-testid="social-mission-context-none">
            No mission context resolved yet — the setup-details form below declares one when its
            intent is recorded.
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">
            Mission context:{' '}
            <a
              href={setup.missionContext.route}
              className="text-mos-navy underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
              data-testid="social-mission-context-link"
            >
              {setup.missionContext.note}
            </a>
          </p>
        )}
        <a
          href="/console?mode=direct"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          data-testid="social-ask-followup"
        >
          {SOCIAL_ASK_FOLLOWUP_LABEL} ↗
        </a>
        <p className="mt-1 text-[11px] text-slate-400">{SOCIAL_ASK_FOLLOWUP_NOTE}</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">
          {SOCIAL_ASK_FOLLOWUP_DISCLOSURE}
        </p>
      </div>
    </section>
  );
}
