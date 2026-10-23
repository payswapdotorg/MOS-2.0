import type {
  AppShellView,
  ShellRecentMissionView,
  ShellSectionView,
} from '../ports/app-shell.js';
import type { MosRouteView } from '../routes/route-loading.js';
import type { CreateMissionIntentDeclaration } from '../ports/mission-catalog.js';
import type { LabIntentDeclaration } from '../ports/lab-intents.js';
import type { ConsoleIntentDeclaration } from '../ports/console-intents.js';
import type { ComposerUiEvent, ComposerUiState } from './composer-state.js';
import { MosComposerOverlay } from './mos-composer.js';
import { HomeView } from '../routes/home-view.js';
import { LabView } from '../routes/lab-view.js';
import { ConsoleView } from '../views/console-view.js';
import { ConnectionsView } from '../routes/connections-view.js';
import { SocialView } from '../routes/social-view.js';
import { NotificationsSurfaceView } from '../routes/notifications-view.js';
import { MissionsView } from '../routes/missions-view.js';
import { StudioView } from '../routes/studio-view.js';
import { MosLoadingView } from './status-views.js';
import {
  MosRouteErrorView,
  MosSectionNotAvailableView,
  MosUnknownRouteView,
} from './route-fallbacks.js';

/**
 * The MOS app shell chrome (WEB-001; wave-24 target-design conversion): the
 * light three-zone chrome measured off the supplied MOS Agent Console
 * mockups — a header band (navy logo square, "MOS Agent Console" title +
 * "Mission-aware agent orchestration" subtitle, the mission-activity badge
 * and the tenant context), a left navigation rail (NAVIGATION sections +
 * RECENT MISSIONS), the route surface, and a footer carrying the shell
 * version and the presentation-only disclosure.
 *
 * Presentation-only by construction: every piece of state arrives through the
 * {@link AppShellView} read model and every command leaves through a
 * declared-intent callback (`onDeclareMissionIntent`,
 * `onDeclareLabIntent`, `onDeclareConsoleIntent`) — the component itself
 * holds no state, owns no authority and computes nothing.
 */

/**
 * The shell-owned Ask MOS composer chrome (the §6 P0 universal-composer
 * wave — UXR-WC): the entries own the {@link ComposerUiState} value (the
 * composer state machine is PURE — `shell/composer-state.ts`) and pass its
 * projection in as this prop, exactly like every other shell read model;
 * every composer interaction leaves through the single `onEvent` callback
 * and the entry folds it through the reducer. Absent ⇒ no composer chrome
 * (the shell renders exactly what it is given).
 */
export interface ComposerChromeProps {
  /** The composer's current UI state (a plain value; the entry owns it). */
  readonly state: ComposerUiState;
  /** The single event sink the composer chrome emits through. */
  readonly onEvent: (event: ComposerUiEvent) => void;
}

export interface MosAppShellProps {
  readonly shellView: AppShellView;
  readonly routeView: MosRouteView;
  /**
   * Called when the Missions surface declares the intent to create a mission
   * (the shell routes the declaration to the owning domain via the port; the
   * component never records it itself).
   */
  readonly onDeclareMissionIntent: (declaration: CreateMissionIntentDeclaration) => void;
  /**
   * Called when a Lab surface declares a write intent (UX-003 wave 3: the
   * lab-intent forms route their declaration through the shell to the
   * composition's lab-intents port — the component never executes it).
   */
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
  /**
   * Called when an Agent Console surface declares a write intent (the
   * CONSOLE wave: the console intent forms route their declaration through
   * the shell to the composition's console-intents port — the component
   * never executes it).
   */
  readonly onDeclareConsoleIntent: (declaration: ConsoleIntentDeclaration) => void;
  /** Shell build version shown in the footer. */
  readonly shellVersion: string;
  /**
   * The Ask MOS composer chrome (optional): the header control + the
   * fixed bottom-right overlay dock. Presentation-only — state arrives via
   * this prop, commands leave through `onEvent` (the entry routes them).
   */
  readonly composer?: ComposerChromeProps;
}

function TenantContextBadge({ tenant }: { tenant: AppShellView['tenant'] }) {
  if (tenant === null) {
    return (
      <p className="text-xs text-slate-500" data-testid="tenant-context-none">
        No tenant context resolved
      </p>
    );
  }
  return (
    <div className="flex flex-col items-end text-xs" data-testid="tenant-context">
      <span>
        <span className="text-slate-500">Tenant </span>
        <span className="font-semibold text-slate-700" data-testid="tenant-context-name">
          {tenant.tenantDisplayName}
        </span>
      </span>
      <span className="text-slate-500">
        {tenant.workspaceDisplayName === null ? (
          'No workspace selected'
        ) : (
          <span>
            Workspace <span className="font-semibold text-slate-700">{tenant.workspaceDisplayName}</span>
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * The mission-activity badge (target design: the mint "Mission active"
 * pill). Renders the honest verdict the composition derived; `null` status
 * (failed read) renders NO badge — never a guess.
 */
function MissionStatusBadge({ status }: { status: AppShellView['missionStatus'] }) {
  if (status === null) {
    return null;
  }
  if (status.active) {
    return (
      <span
        className="rounded-full bg-mos-mint px-3 py-1 text-xs font-medium text-mos-mint-ink"
        data-testid="mission-status-active"
      >
        Mission active
      </span>
    );
  }
  return (
    <span
      className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600"
      data-testid="mission-status-idle"
    >
      No active mission
    </span>
  );
}

function sectionHref(section: ShellSectionView): string {
  return section.route;
}

/** Decorative rail icons (inline SVG, aria-hidden — labels carry meaning). */
const SECTION_ICON_PATHS: Record<string, readonly string[]> = {
  home: ['M3 9.5 12 3l9 6.5', 'M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10'],
  missions: ['M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7'],
  lab: ['M9.5 3h5', 'M10 3v5.5L4.8 18.2A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.8L14 8.5V3', 'M7.5 15h9'],
  console: ['M21 12a9 9 0 1 1-9-9c2.4 0 4.7 1 6.4 2.6L21 8', 'M21 3v5h-5'],
  studio: ['M2 8.5A1.5 1.5 0 0 1 3.5 7h11A1.5 1.5 0 0 1 16 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 15.5z', 'M16 10.5 22 7v10l-6-3.5'],
  distribution: ['M12 15V4', 'M7 9l5-5 5 5', 'M5 20h14'],
  experiments: ['M9 3h6', 'M10 3v5.5L5.8 17A2.5 2.5 0 0 0 8 21h8a2.5 2.5 0 0 0 2.2-4L14 8.5V3'],
  measurement: ['M3 3v16a2 2 0 0 0 2 2h16', 'M7 15v-4', 'M12 15V7', 'M17 15v-2'],
  connections: ['M9.5 13.5a4 4 0 0 0 6 .5l2.5-2.5a4 4 0 0 0-5.7-5.7l-1.4 1.4', 'M14.5 10.5a4 4 0 0 0-6-.5L6 12.5a4 4 0 0 0 5.7 5.7l1.4-1.4'],
  social: ['M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z', 'M10 9l6 3-6 3z'],
  notifications: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
};

function SectionIcon({ sectionId }: { readonly sectionId: string }) {
  const paths = SECTION_ICON_PATHS[sectionId];
  if (paths === undefined) {
    return null;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function SectionNavItem({
  section,
  active,
}: {
  readonly section: ShellSectionView;
  readonly active: boolean;
}) {
  const unavailable = section.availability.kind === 'not-yet-available';
  if (unavailable) {
    return (
      <span
        className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm text-slate-500"
        aria-disabled="true"
        data-testid={`nav-${section.id}-unavailable`}
        title={`Not yet available — waiting on ${section.availability.dependsOn}`}
      >
        <SectionIcon sectionId={section.id} />
        {section.label}
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
          soon
        </span>
      </span>
    );
  }
  return (
    <a
      href={sectionHref(section)}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy ${
        active
          ? 'bg-mos-navy font-semibold text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
      data-testid={`nav-${section.id}`}
    >
      <SectionIcon sectionId={section.id} />
      {section.label}
    </a>
  );
}

/**
 * The shell's left navigation rail (target design): NAVIGATION sections and
 * RECENT MISSIONS. Below the lg: breakpoint the rail reflows into stacked
 * wrapping rows above the route surface (the small-viewport smoke target).
 */
function ShellNav({
  sections,
  activeRoute,
  recentMissions,
}: {
  readonly sections: readonly ShellSectionView[];
  readonly activeRoute: string;
  readonly recentMissions: readonly ShellRecentMissionView[];
}) {
  return (
    <nav
      aria-label="MOS sections"
      className="flex flex-col gap-5 border-b border-slate-200 bg-white px-3 py-3 lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-4 lg:py-6"
    >
      <div className="flex flex-col gap-1">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Navigation
        </p>
        <ul className="flex flex-row flex-wrap gap-1 lg:flex-col">
          {sections.map((section) => (
            <li key={section.id} className="lg:w-full">
              <SectionNavItem section={section} active={section.route === activeRoute} />
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Recent missions
        </p>
        {recentMissions.length === 0 ? (
          <p className="px-3 text-xs text-slate-500" data-testid="shell-recent-missions-empty">
            No recent missions
          </p>
        ) : (
          <ul className="flex flex-row flex-wrap gap-1 lg:flex-col" data-testid="shell-recent-missions">
            {recentMissions.map((mission) => (
              <li key={mission.missionId} className="lg:w-full">
                <a
                  href={mission.route}
                  className="block truncate rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
                  data-testid={`shell-recent-mission-${mission.missionId}`}
                  title={mission.title}
                >
                  {mission.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}

function RouteSurface({
  routeView,
  shellView,
  onDeclareMissionIntent,
  onDeclareLabIntent,
  onDeclareConsoleIntent,
}: {
  readonly routeView: MosRouteView;
  readonly shellView: AppShellView;
  readonly onDeclareMissionIntent: MosAppShellProps['onDeclareMissionIntent'];
  readonly onDeclareLabIntent: MosAppShellProps['onDeclareLabIntent'];
  readonly onDeclareConsoleIntent: MosAppShellProps['onDeclareConsoleIntent'];
}) {
  switch (routeView.kind) {
    case 'loading':
      return <MosLoadingView label={routeView.label} />;
    case 'home':
      // The Home empty state (§5 discoverability): the rail's recent-missions
      // read decides onboarding vs overview — the same read model, never a
      // second missions query.
      return <HomeView recentMissions={shellView.recentMissions} />;
    case 'missions':
      return (
        <MissionsView data={routeView.data} onDeclareMissionIntent={onDeclareMissionIntent} />
      );
    case 'studio':
      return <StudioView data={routeView.data} />;
    case 'lab':
      return <LabView data={routeView.data} onDeclareLabIntent={onDeclareLabIntent} />;
    case 'console':
      return (
        <ConsoleView data={routeView.data} onDeclareConsoleIntent={onDeclareConsoleIntent} />
      );
    case 'connections':
      return <ConnectionsView data={routeView.data} />;
    case 'social':
      return <SocialView data={routeView.data} onDeclareMissionIntent={onDeclareMissionIntent} />;
    case 'notifications':
      return <NotificationsSurfaceView data={routeView.data} />;
    case 'route-error':
      return (
        <MosRouteErrorView
          code={routeView.code}
          message={routeView.message}
          retryHref={routeView.retryHref}
        />
      );
    case 'section':
      return <MosSectionNotAvailableView section={routeView.section} />;
    case 'unknown-route':
      return <MosUnknownRouteView path={routeView.path} />;
  }
}

/** The MOS app shell. Home and Missions come first in the section order. */
export function MosAppShell({
  shellView,
  routeView,
  onDeclareMissionIntent,
  onDeclareLabIntent,
  onDeclareConsoleIntent,
  shellVersion,
  composer,
}: MosAppShellProps) {
  const activeRoute =
    routeView.kind === 'missions'
      ? '/missions'
      : routeView.kind === 'studio'
        ? '/studio'
        : routeView.kind === 'lab'
          ? '/lab'
          : routeView.kind === 'console'
            ? '/console'
            : routeView.kind === 'connections'
              ? '/connections'
              : routeView.kind === 'social'
                ? '/social'
                : routeView.kind === 'notifications'
                  ? '/notifications'
                  : routeView.kind === 'home'
                    ? '/'
                    : '';
  const composerRouteLabel =
    activeRoute === ''
      ? 'MOS'
      : shellView.sections.find((section) => section.route === activeRoute)?.label ?? 'MOS';
  const composerActiveMissionTitle = shellView.recentMissions[0]?.title ?? null;
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <a
        href="#mos-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded focus:bg-mos-navy focus:px-3 focus:py-1.5 focus:text-sm focus:text-white"
      >
        Skip to main content
      </a>
      <header className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mos-navy-deep">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 text-white"
                role="img"
                aria-label="MOS logo"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M3 17c3-6 6-9 9-9s6 3 9 9" />
                <circle cx="12" cy="5" r="2" />
              </svg>
            </span>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900">MOS Agent Console</p>
              <p className="text-xs text-slate-500">Mission-aware agent orchestration</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {composer === undefined ? null : (
              <button
                type="button"
                onClick={() => composer.onEvent({ kind: 'toggle' })}
                title="Ask MOS (Ctrl+J — or Cmd+J on macOS)"
                aria-keyshortcuts="Control+J"
                aria-expanded={composer.state.open}
                className="inline-flex items-center gap-2 rounded-md bg-mos-navy px-4 py-2 text-sm font-semibold text-white hover:bg-mos-navy-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
                data-testid="composer-ask-mos-button"
              >
                Ask MOS
                <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium" aria-hidden="true">
                  Ctrl+J
                </span>
              </button>
            )}
            <MissionStatusBadge status={shellView.missionStatus} />
            <TenantContextBadge tenant={shellView.tenant} />
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col lg:flex-row">
        <ShellNav
          sections={shellView.sections}
          activeRoute={activeRoute}
          recentMissions={shellView.recentMissions}
        />
        <main id="mos-main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <RouteSurface
            routeView={routeView}
            shellView={shellView}
            onDeclareMissionIntent={onDeclareMissionIntent}
            onDeclareLabIntent={onDeclareLabIntent}
            onDeclareConsoleIntent={onDeclareConsoleIntent}
          />
        </main>
      </div>
      <footer className="mt-auto border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        <p>
          MOS shell <span data-testid="shell-version">v{shellVersion}</span> —
          presentation-only surface: it renders state from MOS services and declares intent; it
          holds no business authority.
        </p>
      </footer>
      {composer === undefined ? null : (
        <MosComposerOverlay
          state={composer.state}
          routeLabel={composerRouteLabel}
          activeMissionTitle={composerActiveMissionTitle}
          onEvent={composer.onEvent}
        />
      )}
    </div>
  );
}
