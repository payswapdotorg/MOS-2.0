import type { ShellSectionId } from '../ports/app-shell.js';

/**
 * Hand-rolled route dispatch (WEB-001) — the audited pattern
 * (`packages/web/src/main.tsx` route table; BROWSER-SHELL-REPLACEMENT-PLAN
 * §2.1: "routing stays hand-rolled dispatch … no router dependency").
 *
 * The shell renders ONE route per load and navigates with real links, so the
 * route model is a pure function of the URL — there is no client-side route
 * state, which keeps the presentation-only discipline structural: every
 * interaction is either a link (full load) or an intent declaration through
 * a view port.
 */

export interface MissionsRoute {
  readonly kind: 'missions';
  /** Selected mission id (`?mission=<id>`), when given. */
  readonly missionId: string | null;
  /** Receipt of a freshly declared intent (`?intent=<id>`), when given. */
  readonly intentId: string | null;
  /** Typed failure code from a failed intent declaration (`?intent-error=<code>`). */
  readonly intentError: string | null;
}

export interface StudioRoute {
  readonly kind: 'studio';
  /** Selected studio session id (`?session=<id>`), when given. */
  readonly sessionId: string | null;
  /** Selected studio package id (`?package=<id>`), when given. */
  readonly packageId: string | null;
}

/**
 * The Lab workspace's section ids (UX-003 wave 2): the §2 research loop's
 * stages as navigable workspace sections. `overview` is the default when
 * no `?section=` arrives — the workspace's landing read.
 */
export type LabSectionId =
  | 'overview'
  | 'corpus'
  | 'idea-graph'
  | 'simulator'
  | 'strategy'
  | 'transforms'
  | 'benchmarks'
  | 'calibration'
  | 'bridge';

/** The Lab workspace's known section ids (parse vocabulary). */
const LAB_SECTIONS: readonly LabSectionId[] = [
  'overview',
  'corpus',
  'idea-graph',
  'simulator',
  'strategy',
  'transforms',
  'benchmarks',
  'calibration',
  'bridge',
];

function labSectionFromParam(raw: string | null): LabSectionId {
  if (raw === null) {
    return 'overview';
  }
  return (LAB_SECTIONS as readonly string[]).includes(raw) ? (raw as LabSectionId) : 'overview';
}

/**
 * Deep-link section inference: a selection param without an explicit
 * `?section=` routes to the section that OWNS the selection (the accepted
 * UX-003 hrefs `/lab?benchmark=…` / `/lab?calibration=…` keep working —
 * they now land on their section instead of the overview). Explicit
 * `?section=` always wins; multiple selection params resolve in the
 * route's declared precedence (benchmark, then calibration, then the
 * workspace-specific selections).
 */
function inferLabSection(
  explicit: LabSectionId,
  selections: {
    readonly benchmarkId: string | null;
    readonly calibrationId: string | null;
    readonly corpusId: string | null;
    readonly ideaNodeId: string | null;
    readonly simulationRunId: string | null;
    readonly branchId: string | null;
    readonly strategyCandidateId: string | null;
    readonly transformCandidateId: string | null;
    readonly handoffId: string | null;
  },
): LabSectionId {
  if (explicit !== 'overview') {
    return explicit;
  }
  if (selections.benchmarkId !== null) {
    return 'benchmarks';
  }
  if (selections.calibrationId !== null) {
    return 'calibration';
  }
  if (selections.corpusId !== null) {
    return 'corpus';
  }
  if (selections.ideaNodeId !== null) {
    return 'idea-graph';
  }
  if (selections.simulationRunId !== null || selections.branchId !== null) {
    return 'simulator';
  }
  if (selections.strategyCandidateId !== null) {
    return 'strategy';
  }
  if (selections.transformCandidateId !== null) {
    return 'transforms';
  }
  if (selections.handoffId !== null) {
    return 'bridge';
  }
  return 'overview';
}

export interface LabRoute {
  readonly kind: 'lab';
  /** The workspace section (`?section=<id>`; default `overview`). */
  readonly section: LabSectionId;
  /** Selected benchmark chain id (`?benchmark=<id>`), when given. */
  readonly benchmarkId: string | null;
  /** Exact benchmark record version (`?version=<n>`); null = latest. */
  readonly benchmarkVersion: number | null;
  /** Selected calibration chain id (`?calibration=<id>` / `?chain=<id>`), when given. */
  readonly calibrationId: string | null;
  /** Selected corpus chain id (`?corpus=<id>`), when given. */
  readonly corpusId: string | null;
  /** Selected idea node id (`?node=<id>`), when given. */
  readonly ideaNodeId: string | null;
  /** Selected simulation run id (`?run=<id>`), when given. */
  readonly simulationRunId: string | null;
  /** Selected counterfactual branch id (`?branch=<id>`), when given. */
  readonly branchId: string | null;
  /** Selected strategy candidate id (`?candidate=<id>`), when given. */
  readonly strategyCandidateId: string | null;
  /** Selected transform candidate id (`?transform=<id>`), when given. */
  readonly transformCandidateId: string | null;
  /** Selected lab-candidate handoff id (`?handoff=<id>`), when given. */
  readonly handoffId: string | null;
}

export interface ConnectionsRoute {
  readonly kind: 'connections';
  /** Selected provider definition id (`?provider=<id>`), when given. */
  readonly providerId: string | null;
  /** Selected distribution binding id (`?binding=<id>`), when given. */
  readonly bindingId: string | null;
}

export interface NotificationsRoute {
  readonly kind: 'notifications';
  /** Selected notification record id (`?notification=<id>`), when given. */
  readonly notificationId: string | null;
}

export type MosRoute =
  | { readonly kind: 'home' }
  | MissionsRoute
  | StudioRoute
  | LabRoute
  | ConnectionsRoute
  | NotificationsRoute
  | { readonly kind: 'section'; readonly sectionId: ShellSectionId }
  | { readonly kind: 'unknown'; readonly path: string };

/*
 * `/connections` parses into its DEDICATED route kind (UX-004) — the surface
 * is on; the generic `section` fallback below stays for sections whose
 * product surfaces have not landed yet.
 */
const SECTION_ROUTES: Readonly<Record<string, ShellSectionId>> = {};

function firstParam(params: URLSearchParams, name: string): string | null {
  const value = params.get(name);
  return value === null || value.length === 0 ? null : value;
}

function versionParam(params: URLSearchParams, name: string): number | null {
  const raw = firstParam(params, name);
  if (raw === null) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 && String(parsed) === raw ? parsed : null;
}

/**
 * Parse a location into a route. Pure: `pathname` is the raw path, `search`
 * the raw query string (with or without a leading `?`). Unknown paths map to
 * the explicit `unknown` route — never to a silent fallback.
 */
export function parseMosRoute(pathname: string, search: string): MosRoute {
  const cleanPath =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (cleanPath === '/' || cleanPath === '') {
    return { kind: 'home' };
  }

  if (cleanPath === '/missions') {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return {
      kind: 'missions',
      missionId: firstParam(params, 'mission'),
      intentId: firstParam(params, 'intent'),
      intentError: firstParam(params, 'intent-error'),
    };
  }

  if (cleanPath === '/studio') {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return {
      kind: 'studio',
      sessionId: firstParam(params, 'session'),
      packageId: firstParam(params, 'package'),
    };
  }

  if (cleanPath === '/lab') {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    // `?chain=` is the calibration selection's section-scoped alias — the
    // legacy `?calibration=` param keeps working (same selection, same
    // route kind; the first present one wins).
    const selections = {
      benchmarkId: firstParam(params, 'benchmark'),
      calibrationId: firstParam(params, 'calibration') ?? firstParam(params, 'chain'),
      corpusId: firstParam(params, 'corpus'),
      ideaNodeId: firstParam(params, 'node'),
      simulationRunId: firstParam(params, 'run'),
      branchId: firstParam(params, 'branch'),
      strategyCandidateId: firstParam(params, 'candidate'),
      transformCandidateId: firstParam(params, 'transform'),
      handoffId: firstParam(params, 'handoff'),
    };
    return {
      kind: 'lab',
      section: inferLabSection(labSectionFromParam(firstParam(params, 'section')), selections),
      benchmarkVersion: versionParam(params, 'version'),
      ...selections,
    };
  }

  if (cleanPath === '/connections') {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return {
      kind: 'connections',
      providerId: firstParam(params, 'provider'),
      bindingId: firstParam(params, 'binding'),
    };
  }

  if (cleanPath === '/notifications') {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return {
      kind: 'notifications',
      notificationId: firstParam(params, 'notification'),
    };
  }

  const sectionId = SECTION_ROUTES[cleanPath];
  if (sectionId) {
    return { kind: 'section', sectionId };
  }

  return { kind: 'unknown', path: cleanPath };
}

/** Route display title used for the document title per route. */
export function mosRouteTitle(route: MosRoute): string {
  switch (route.kind) {
    case 'home':
      return 'MOS — Home';
    case 'missions':
      return route.missionId ? 'MOS — Missions · mission detail' : 'MOS — Missions';
    case 'studio':
      if (route.sessionId !== null && route.packageId !== null) {
        return 'MOS — Studio · session + package chain';
      }
      return route.sessionId !== null
        ? 'MOS — Studio · session detail'
        : route.packageId !== null
          ? 'MOS — Studio · package chain'
          : 'MOS — Studio';
    case 'lab': {
      const detail = route.benchmarkId !== null
        ? route.benchmarkVersion !== null
          ? 'benchmark record version'
          : 'benchmark digest'
        : route.calibrationId !== null
          ? 'calibration records'
          : route.ideaNodeId !== null
            ? 'idea detail'
            : route.simulationRunId !== null
              ? 'simulation run'
              : route.corpusId !== null
                ? 'corpus detail'
                : route.strategyCandidateId !== null
                  ? 'strategy candidate'
                  : route.transformCandidateId !== null
                    ? 'transform candidate'
                    : route.handoffId !== null
                      ? 'candidate handoff'
                      : route.section === 'overview'
                        ? null
                        : route.section;
      return detail === null ? 'MOS — Lab' : `MOS — Lab · ${detail}`;
    }
    case 'connections':
      return route.providerId !== null && route.bindingId !== null
        ? 'MOS — Connections · provider + binding'
        : route.providerId !== null
          ? 'MOS — Connections · provider directory entry'
          : route.bindingId !== null
            ? 'MOS — Connections · binding lifecycle'
            : 'MOS — Connections';
    case 'notifications':
      return route.notificationId !== null
        ? 'MOS — Notifications · record history'
        : 'MOS — Notifications';
    case 'section':
      return `MOS — ${route.sectionId}`;
    case 'unknown':
      return 'MOS — page not found';
  }
}
