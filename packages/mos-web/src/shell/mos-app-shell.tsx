import type { AppShellView, ShellSectionView } from '../ports/app-shell.js';
import type { MosRouteView } from '../routes/route-loading.js';
import type { CreateMissionIntentDeclaration } from '../ports/mission-catalog.js';
import { HomeView } from '../routes/home-view.js';
import { LabView } from '../routes/lab-view.js';
import { MissionsView } from '../routes/missions-view.js';
import { StudioView } from '../routes/studio-view.js';
import { MosLoadingView } from './status-views.js';
import {
  MosRouteErrorView,
  MosSectionNotAvailableView,
  MosUnknownRouteView,
} from './route-fallbacks.js';

/**
 * The MOS app shell chrome (WEB-001): header with brand + tenant context
 * (spec §31), section navigation (Home and Missions first), the route
 * surface, and a footer carrying the shell version and the
 * presentation-only disclosure.
 *
 * Presentation-only by construction: every piece of state arrives through
 * the {@link AppShellView} read model and every command leaves through the
 * `onDeclareMissionIntent` callback — the component itself holds no state,
 * owns no authority and computes nothing.
 */

export interface MosAppShellProps {
  readonly shellView: AppShellView;
  readonly routeView: MosRouteView;
  /**
   * Called when the Missions surface declares the intent to create a mission
   * (the shell routes the declaration to the owning domain via the port; the
   * component never records it itself).
   */
  readonly onDeclareMissionIntent: (declaration: CreateMissionIntentDeclaration) => void;
  /** Shell build version shown in the footer. */
  readonly shellVersion: string;
}

function TenantContextBadge({ tenant }: { tenant: AppShellView['tenant'] }) {
  if (tenant === null) {
    return (
      <p className="text-xs text-slate-400" data-testid="tenant-context-none">
        No tenant context resolved
      </p>
    );
  }
  return (
    <div className="flex flex-col items-end text-xs" data-testid="tenant-context">
      <span>
        <span className="text-slate-400">Tenant </span>
        <span className="font-semibold" data-testid="tenant-context-name">
          {tenant.tenantDisplayName}
        </span>
      </span>
      <span className="text-slate-400">
        {tenant.workspaceDisplayName === null ? (
          'No workspace selected'
        ) : (
          <span>
            Workspace <span className="font-semibold">{tenant.workspaceDisplayName}</span>
          </span>
        )}
      </span>
    </div>
  );
}

function sectionHref(section: ShellSectionView): string {
  return section.route;
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
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-500"
        aria-disabled="true"
        data-testid={`nav-${section.id}-unavailable`}
        title={`Not yet available — waiting on ${section.availability.dependsOn}`}
      >
        {section.label}
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
          soon
        </span>
      </span>
    );
  }
  return (
    <a
      href={sectionHref(section)}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
        active
          ? 'bg-sky-500/15 font-semibold text-sky-300'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
      data-testid={`nav-${section.id}`}
    >
      {section.label}
    </a>
  );
}

function ShellNav({
  sections,
  activeRoute,
}: {
  readonly sections: readonly ShellSectionView[];
  readonly activeRoute: string;
}) {
  return (
    <nav aria-label="MOS sections" className="flex flex-wrap items-center gap-1">
      {sections.map((section) => (
        <SectionNavItem
          key={section.id}
          section={section}
          active={section.route === activeRoute}
        />
      ))}
    </nav>
  );
}

function RouteSurface({
  routeView,
  onDeclareMissionIntent,
}: {
  readonly routeView: MosRouteView;
  readonly onDeclareMissionIntent: MosAppShellProps['onDeclareMissionIntent'];
}) {
  switch (routeView.kind) {
    case 'loading':
      return <MosLoadingView label={routeView.label} />;
    case 'home':
      return <HomeView />;
    case 'missions':
      return (
        <MissionsView data={routeView.data} onDeclareMissionIntent={onDeclareMissionIntent} />
      );
    case 'studio':
      return <StudioView data={routeView.data} />;
    case 'lab':
      return <LabView data={routeView.data} />;
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
  shellVersion,
}: MosAppShellProps) {
  const activeRoute =
    routeView.kind === 'missions'
      ? '/missions'
      : routeView.kind === 'studio'
        ? '/studio'
        : routeView.kind === 'lab'
          ? '/lab'
          : routeView.kind === 'home'
            ? '/'
            : '';
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <a
        href="#mos-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded focus:bg-sky-500 focus:px-3 focus:py-1.5 focus:text-sm focus:text-white"
      >
        Skip to main content
      </a>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/70 px-4 py-3">
        <div className="flex items-center gap-3">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 text-sky-400"
            role="img"
            aria-label="MOS logo"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 17c3-6 6-9 9-9s6 3 9 9" />
            <circle cx="12" cy="5" r="2" />
          </svg>
          <span className="text-lg font-semibold tracking-tight">MOS</span>
        </div>
        <TenantContextBadge tenant={shellView.tenant} />
      </header>
      <div className="border-b border-slate-800 bg-slate-900/40 px-4 py-2">
        <ShellNav sections={shellView.sections} activeRoute={activeRoute} />
      </div>
      <main id="mos-main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <RouteSurface routeView={routeView} onDeclareMissionIntent={onDeclareMissionIntent} />
      </main>
      <footer className="border-t border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-500">
        <p>
          MOS browser shell <span data-testid="shell-version">v{shellVersion}</span> —
          presentation-only surface: it renders state from MOS services and declares intent; it
          holds no business authority.
        </p>
      </footer>
    </div>
  );
}
