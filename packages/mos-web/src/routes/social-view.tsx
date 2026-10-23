import type { SocialPageData } from '../routes/route-loading.js';
import type { CreateMissionIntentDeclaration } from '../ports/mission-catalog.js';
import type { SocialPlatformView } from '../ports/social-workspace.js';
import { SocialPlatformRail } from '../views/social-platform-rail.js';
import { SocialCapabilityMatrix } from '../views/social-capability-matrix.js';
import { SocialGuidedSetupPanel } from '../views/social-guided-setup.js';
import { SocialGuidedBrowser } from '../views/social-guided-browser.js';
import { SocialSandboxPanel, SocialTaskPathsPanel } from '../views/social-task-paths.js';
import { SocialSetupForm } from '../views/social-setup-form.js';
import {
  SOCIAL_DISTINCTION_TITLE,
  SOCIAL_WORKSPACE_PURPOSE,
  socialDistinctionBody,
} from '../views/social-presentation.js';

/**
 * The Social Media workspace route view (the UXR social wave): the target
 * design's three-pane guided workspace over the frozen provider profiles —
 * the guided-setup checklist + AGENT GUIDE (left), the guided browser pane
 * with the task-first paths and the simulation SANDBOX (centre), and the
 * setup-details form (right), above the platform picker rail and the
 * "Important distinction" callout.
 *
 * Presentation-only: every verdict, step state and sandbox status arrives
 * through the workspace read model; the ONLY write-shaped action is the
 * setup form's create-mission INTENT declaration through the existing
 * shell callback (the Missions authority owns the record). The view never
 * fabricates a provider state and never advances a step on its own.
 */

function DistinctionCallout({ platform }: { readonly platform: SocialPlatformView }) {
  return (
    <aside
      className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4"
      data-testid="social-distinction-callout"
    >
      <svg
        viewBox="0 0 24 24"
        className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
      <div>
        <h2 className="text-sm font-semibold text-emerald-800">{SOCIAL_DISTINCTION_TITLE}</h2>
        <p className="mt-0.5 text-xs leading-snug text-emerald-700" data-testid="social-distinction-body">
          {socialDistinctionBody(platform.displayName)}
        </p>
      </div>
    </aside>
  );
}

function SelectionErrorPanel({ slug }: { readonly slug: string }) {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800"
      data-testid="social-platform-selection-error"
    >
      No supported platform matches the selection “{slug}” — the workspace renders the default
      platform instead of guessing a provider the frozen profiles do not declare.
    </aside>
  );
}

function EmptyWorkspacePanel() {
  return (
    <aside
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800"
      data-testid="social-workspace-empty"
    >
      The workspace read model carries no platforms on this load — an honest empty state, never a
      fabricated provider rail.
    </aside>
  );
}

/** The Social Media page view over the loaded page model. */
export function SocialView({
  data,
  onDeclareMissionIntent,
}: {
  readonly data: SocialPageData;
  readonly onDeclareMissionIntent: (declaration: CreateMissionIntentDeclaration) => void;
}) {
  const platforms = data.data.platforms;
  if (platforms.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">Social Media</h1>
        <EmptyWorkspacePanel />
      </div>
    );
  }

  const bySlug = new Map(platforms.map((platform) => [platform.slug, platform]));
  const requested =
    data.selectedPlatformSlug !== null ? (bySlug.get(data.selectedPlatformSlug) ?? null) : null;
  const selectionError =
    data.selectedPlatformSlug !== null && requested === null && !bySlug.has(data.selectedPlatformSlug);
  const effective =
    requested ??
    (platforms.find((platform) => platform.selected) ?? platforms[0] ?? null);
  if (effective === null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">Social Media</h1>
        <EmptyWorkspacePanel />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Social media / {effective.displayName}
        </p>
        <h1 className="mt-1 text-xl font-bold" data-testid="social-workspace-heading">
          Set up your {effective.displayName} workspace
        </h1>
        <p className="mt-1 text-sm text-slate-500">{SOCIAL_WORKSPACE_PURPOSE}</p>
      </header>

      <DistinctionCallout platform={effective} />

      {selectionError ? <SelectionErrorPanel slug={data.selectedPlatformSlug ?? ''} /> : null}

      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[240px_minmax(0,1fr)_320px] xl:items-start">
        <div className="flex flex-col gap-6">
          <SocialPlatformRail
            platforms={platforms}
            selectedSlug={effective.slug}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <SocialGuidedBrowser platform={effective} />
          <SocialTaskPathsPanel platform={effective} />
          <SocialSandboxPanel sandbox={effective.guidedSetup.simulationSandbox} />
          <SocialCapabilityMatrix platform={effective} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <SocialGuidedSetupPanel platform={effective} stepAnchor={data.step} />
          <div id="social-setup-details" className="scroll-mt-4">
            <SocialSetupForm
              platform={effective}
              scope={data.scope}
              metricVocabulary={data.metricVocabulary}
              onDeclareMissionIntent={onDeclareMissionIntent}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
