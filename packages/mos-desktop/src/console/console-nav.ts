/**
 * The MOS console NAV VOCABULARY (W32 — the payswap-3.0 pattern adapted
 * to MOS's domain, per the owner's directive: payswap adapts zcode to
 * payments; MOS adapts it to ADS + RUNNING SOCIAL MEDIA + the full MOS
 * capability loop).
 *
 * This module is the console's single source of truth for the product IA:
 * the thirteen console sections (identity: id + title + purpose, rendered
 * verbatim by the section scaffold), the typed OUTCOME ACTION SET
 * (PROMOTE / PUBLISH / GROW / MEASURE — the PaySwap PAY/RECEIVE/MOVE/
 * CONVERT equivalent), the AGENT WORKBENCH group descriptors (the
 * substrate surfaces the desktop host mounts behind the MOS chrome), and
 * the section ↔ app-path mapping (the reload/deep-link query truth).
 *
 * Pure data + pure functions, dependency-free (only the workbench surface
 * type is imported): directly consumable by the node test runner through
 * the package's built dist.
 */

import type { WorkbenchSurface } from '../routes/workbench-route.js';

/** The MOS console section ids (the product IA, payswap-pattern). */
export type MosConsoleSectionId =
  | 'overview'
  | 'missions'
  | 'social'
  | 'ads'
  | 'lab'
  | 'console'
  | 'studio'
  | 'distribution'
  | 'experiments'
  | 'measurement'
  | 'connections'
  | 'activity'
  | 'settings';

/** One console section's identity (title + purpose render verbatim). */
export interface MosConsoleSectionRecord {
  readonly id: MosConsoleSectionId;
  /** The document-title short name (e.g. "MOS — Social"). */
  readonly title: string;
  /** The section purpose line — the honest one-sentence scope. */
  readonly purpose: string;
  /** The app-internal path (the reload/deep-link query truth). */
  readonly path: string;
}

/**
 * The thirteen console sections in pinned order. Settings renders
 * PINNED at the nav end (the payswap §8 law); everything else under the
 * "Workspace" group label.
 */
export const MOS_CONSOLE_SECTIONS: readonly MosConsoleSectionRecord[] = [
  {
    id: 'overview',
    title: 'Home',
    purpose:
      'What should MOS accomplish? Declare a goal — MOS records the intent, plans the work through the loop, and reports every verdict honestly.',
    path: '/',
  },
  {
    id: 'missions',
    title: 'Missions',
    purpose:
      'A mission is a declared objective with a reward spec and an explicit audience. Declare it, version it, and follow it through the lifecycle — append-only, never rewritten.',
    path: '/missions',
  },
  {
    id: 'social',
    title: 'Social',
    purpose:
      'Running social media across the five-platform workspace: channels, the composer, and the calendar queue. Nothing publishes until a transport is connected and an arm gate approves.',
    path: '/social',
  },
  {
    id: 'ads',
    title: 'Ads',
    purpose:
      'Paid promotion runs through missions: platforms, budgets, campaigns, creatives. Every campaign is a DRAFT until the arm gate approves it — nothing spends before that.',
    path: '/ads',
  },
  {
    id: 'lab',
    title: 'Lab',
    purpose:
      'The simulation authority: ideas, branch records, benchmarks, calibration. The Lab never touches live surfaces — it produces evidence the planner consumes.',
    path: '/lab',
  },
  {
    id: 'console',
    title: 'Agent Console',
    purpose:
      'The operator console over the seven-path write-intent workflow: plan, compile, and arm the work. Arm-run is THE human authorization transition.',
    path: '/console',
  },
  {
    id: 'studio',
    title: 'Studio',
    purpose:
      'The production authority: content formats, the engine registry, and rights-aware production runs. Studio renders when a production run is compiled.',
    path: '/studio',
  },
  {
    id: 'distribution',
    title: 'Distribution',
    purpose:
      'The delivery authority: adapters, scheduling, and the per-platform delivery contracts. Distribution renders when a delivery run is compiled.',
    path: '/distribution',
  },
  {
    id: 'experiments',
    title: 'Experiments',
    purpose:
      'The strategy authority: three-way strategy comparison with counterfactual baselines. Experiments render when a strategy experiment is compiled.',
    path: '/experiments',
  },
  {
    id: 'measurement',
    title: 'Measurement',
    purpose:
      'The evidence authority: the 17-metric reward vocabulary, calibration chains, and the vanity-metric guardrail. Measurement renders when a measurement run is compiled.',
    path: '/measurement',
  },
  {
    id: 'connections',
    title: 'Connections',
    purpose:
      'The provider catalogue and the secure setup lanes: social accounts and ad platforms. Credential handling follows the credentials law — YouTube-hosted onboarding, never a password field.',
    path: '/connections',
  },
  {
    id: 'activity',
    title: 'Activity',
    purpose:
      'The approvals queue and the append-only event timeline. Approving the arm gate is a REAL decision — it cascades the campaign lifecycle and records the event.',
    path: '/activity',
  },
  {
    id: 'settings',
    title: 'Settings',
    purpose:
      'The workspace settings: theme, workspace facts, and the honest durability disclosure. This is the MOS console settings — the workbench settings live in the Agent Workbench group.',
    path: '/settings',
  },
];

/** Resolve a section record by id (undefined when the id names no section). */
export function mosConsoleSection(
  id: string,
): MosConsoleSectionRecord | undefined {
  return MOS_CONSOLE_SECTIONS.find((section) => section.id === id);
}

/** The document title for a section ("MOS — Home"; honest default). */
export function mosConsoleSectionTitle(id: string): string {
  const section = mosConsoleSection(id);
  return section === undefined ? 'MOS' : `MOS — ${section.title}`;
}

/* --------------------------------------------------------------------
 * The typed OUTCOME ACTION SET (the PaySwap PAY/RECEIVE/MOVE/CONVERT
 * equivalent, adapted to MOS's domain): the four outcomes every entry
 * point converges on — the home shortcuts, the agent rail chips, the
 * mission directions.
 * -------------------------------------------------------------------- */

/** The four typed outcome actions. */
export type MosActionId = 'promote' | 'publish' | 'grow' | 'measure';

/** One outcome action descriptor (label + the honest one-line scope). */
export interface MosActionDescriptor {
  readonly id: MosActionId;
  readonly label: string;
  readonly line: string;
  /** The mission direction the action prefills (see the mission intake). */
  readonly direction: 'promote' | 'publish' | 'grow' | 'measure';
}

/** The typed outcome action set, pinned order. */
export const MOS_ACTION_SET: readonly MosActionDescriptor[] = [
  {
    id: 'promote',
    label: 'PROMOTE',
    line: 'Paid promotion for a declared objective — budget and platform up front, nothing spends before the arm gate.',
    direction: 'promote',
  },
  {
    id: 'publish',
    label: 'PUBLISH',
    line: 'Content out through a connected channel — scheduled, reviewed, never auto-posted without a transport.',
    direction: 'publish',
  },
  {
    id: 'grow',
    label: 'GROW',
    line: 'Audience and reach growth for a mission — discovery and virality exploration across platforms.',
    direction: 'grow',
  },
  {
    id: 'measure',
    label: 'MEASURE',
    line: 'Evidence against the reward spec — the 17-metric vocabulary, counterfactual baselines, no vanity metrics.',
    direction: 'measure',
  },
];

/** Resolve an action descriptor by id (undefined when unknown). */
export function mosAction(id: string): MosActionDescriptor | undefined {
  return MOS_ACTION_SET.find((action) => action.id === id);
}

/* --------------------------------------------------------------------
 * The AGENT WORKBENCH group (the substrate surfaces the desktop host
 * mounts behind the MOS chrome — build-ON-ZCode). The data-testids are
 * the stable verification hooks (the W28–W30 CDP drivers click these).
 * -------------------------------------------------------------------- */

/** One Agent Workbench nav descriptor. */
export interface MosWorkbenchNavDescriptor {
  readonly surface: WorkbenchSurface;
  readonly label: string;
  readonly path: string;
  readonly testId: string;
}

/** The Agent Workbench group items (the substrate surfaces, pinned order). */
export const MOS_WORKBENCH_NAV_ITEMS: readonly MosWorkbenchNavDescriptor[] = [
  { surface: 'new-task', label: 'New Task', path: '/workbench/new-task', testId: 'nav-workbench-new-task' },
  { surface: 'chat', label: 'Workbench', path: '/workbench', testId: 'nav-workbench' },
  { surface: 'automations', label: 'Automations', path: '/workbench/automations', testId: 'nav-workbench-automations' },
  { surface: 'settings', label: 'Agent Settings', path: '/workbench/settings', testId: 'nav-workbench-settings' },
];

/* --------------------------------------------------------------------
 * The section ↔ app-path mapping (the reload/deep-link query truth).
 * Pure: a `?route=` path resolves to a section id, or to the honest
 * overview default when it names no console section (workbench routes
 * are handled by the workbench handoff BEFORE this mapping runs).
 * -------------------------------------------------------------------- */

/** Resolve the console section an app path names (overview when none). */
export function mosConsoleSectionFromPath(path: string): MosConsoleSectionId {
  const normalized = (path.split('?', 1)[0] ?? path).replace(/\/+$/, '') || '/';
  const section = MOS_CONSOLE_SECTIONS.find(
    (candidate) => candidate.path === normalized,
  );
  return section === undefined ? 'overview' : section.id;
}

/** The app path a section id maps to (its canonical path). */
export function mosConsoleSectionPath(id: MosConsoleSectionId): string {
  return mosConsoleSection(id)?.path ?? '/';
}
