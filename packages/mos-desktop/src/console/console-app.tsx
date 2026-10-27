/**
 * The MOS CONSOLE APP — the console root (the payswap
 * PaySwapAgentWorkspace pattern adapted to MOS): the chrome (the iconed
 * sidebar with the WORKSPACE sections + the AGENT WORKBENCH group + the
 * pinned Settings; the mobile horizontal section row; the honest
 * workspace footer), the section switch over the thirteen sections, and
 * the floating agent experience. Presentation-only, hook-free — the
 * shell ENTRY owns every piece of state (the workspace store
 * subscription, the section, the prefill, the receipts, the agent, the
 * theme) and re-mounts this tree on change.
 *
 * The parallel-token law: everything renders mosc-* under
 * mosc-theme-light / mosc-theme-dark — never cross-wired with the host's
 * or the substrate's design tokens.
 */

import './mos-console.css';
import {
  MOS_CONSOLE_SECTIONS,
  MOS_WORKBENCH_NAV_ITEMS,
  type MosActionId,
  type MosConsoleSectionId,
  type MosConsoleSectionRecord,
} from './console-nav.js';
import type {
  MosAgentTaskIntakeInput,
  MosCampaignIntakeInput,
  MosMissionIntakeInput,
  MosPostComposerInput,
  MosWorkspaceSnapshot,
  MosWorkspaceStoreHealth,
} from './workspace-store.js';
import type { MosNewTaskDraft } from './new-task-draft.js';
import type { WorkbenchSurface } from '../routes/workbench-route.js';
import { MosAgentRail, type MosAgentTranscriptEntry } from './agent-rail.js';
import { OverviewSection } from './sections/overview-section.js';
import { MissionsSection, type MosMissionPrefill } from './sections/missions-section.js';
import { SocialSection } from './sections/social-section.js';
import { AdsSection } from './sections/ads-section.js';
import { ConnectionsSection } from './sections/connections-section.js';
import { ActivitySection } from './sections/activity-section.js';
import { SettingsSection } from './sections/settings-section.js';
import { LabSection } from './sections/lab-section.js';
import { ConsoleSection } from './sections/console-section.js';
import { StudioSection } from './sections/studio-section.js';
import { DistributionSection } from './sections/distribution-section.js';
import { ExperimentsSection } from './sections/experiments-section.js';
import { MeasurementSection } from './sections/measurement-section.js';
import { NewTaskSection } from './sections/new-task-section.js';
import {
  ModelSettingsSection,
  type MosModelProviderFamilyId,
} from './sections/model-settings-section.js';
import { MOS_WORKSPACE_DURABILITY_FACT } from './workspace-store.js';

/* --------------------------------------------------------------------
 * Section icons (PRESENTATION-ONLY: inline SVG, aria-hidden, stroke =
 * currentColor — never contract data, never a substitute for the label)
 * -------------------------------------------------------------------- */

function glyph(children: unknown): never {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children as never}
    </svg>
  ) as never;
}

const SECTION_ICONS: Readonly<Record<MosConsoleSectionId, never>> = {
  overview: glyph(<><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>),
  missions: glyph(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5.5A2.5 2.5 0 0 1 11.5 3h1A2.5 2.5 0 0 1 15 5.5V7" /><path d="M3 12.5h18" /></>),
  social: glyph(<><circle cx="12" cy="12" r="8.5" /><path d="M16.2 7.8 14.4 9.6M16.2 16.2 14.4 14.4M7.8 16.2 9.6 14.4M7.8 7.8 9.6 9.6" /></>),
  ads: glyph(<><path d="M3 12h12" /><path d="M15 8.5v7l5.5-3.5z" /><rect x="3" y="5" width="9" height="14" rx="2" /></>),
  lab: glyph(<><path d="M9.8 2.8h4.4M10 2.8v6.1l-5.4 9A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-3.1L14 8.9V2.8" /><path d="M7.4 15.2h9.2" /></>),
  console: glyph(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M12.5 15h4.5" /></>),
  studio: glyph(<><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10.5 21 8v8l-5-2.5" /><circle cx="9.5" cy="12" r="2.2" /></>),
  distribution: glyph(<><path d="M12 3v11" /><path d="M8.5 10.5 12 14l3.5-3.5" /><path d="M4 17.5v2A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-2" /></>),
  experiments: glyph(<><path d="M8 3h8M9 3v5l-4.5 8A2.4 2.4 0 0 0 6.6 20h10.8a2.4 2.4 0 0 0 2.1-3.6L15 8V3" /><path d="M7 14h10" /></>),
  measurement: glyph(<><path d="M4 19 15.5 7.5a2.6 2.6 0 0 1 3.7 3.7L10 21H4z" /><path d="M13.5 9.5l1.2 1.2" /></>),
  connections: glyph(<><path d="M9 2.8v5.4M15 2.8v5.4" /><path d="M6.2 8.2h11.6v3.6a5.8 5.8 0 0 1-11.6 0z" /><path d="M12 17.6v3.6" /></>),
  activity: glyph(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.2v5l3.4 2" /></>),
  settings: glyph(<><path d="M3.5 7.2h9M17 7.2h3.5M3.5 16.8h3M11 16.8h9.5" /><circle cx="14.8" cy="7.2" r="2.2" /><circle cx="8.4" cy="16.8" r="2.2" /></>),
  'new-task': glyph(<><circle cx="12" cy="12" r="8.5" /><path d="M12 8.2v7.6M8.2 12h7.6" /></>),
  'model-settings': glyph(<><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></>),
};

/** The workbench nav glyphs, keyed by the descriptor's icon field. */
const WORKBENCH_ICONS: Readonly<Record<string, never>> = {
  'new-task': glyph(<><circle cx="12" cy="12" r="8.5" /><path d="M12 8.2v7.6M8.2 12h7.6" /></>),
  'model-settings': glyph(<><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></>),
  chat: glyph(<><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="M7.5 14.5h9M7.5 10.5h6" /></>),
  automations: glyph(<><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="14.8" cy="7" r="2.2" /><circle cx="8.4" cy="17" r="2.2" /></>),
  settings: glyph(<><circle cx="12" cy="12" r="2.8" /><path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M7.7 16.3 6 18" /></>),
};

/* --------------------------------------------------------------------
 * The controller contract (the entry implements it; the sections
 * consume it — commands leave through these callbacks only)
 * -------------------------------------------------------------------- */

export interface MosConsoleController {
  /** A MOS section navigation (the entry rewrites the route + title). */
  readonly onNavigateSection: (section: MosConsoleSectionId) => void;
  /** An Agent Workbench substrate entry (the host mounts the substrate surface). */
  readonly onWorkbenchSurface: (surface: WorkbenchSurface) => void;
  /** The overview intake submit (the convergence-law prefill). */
  readonly onIntake: (statement: string) => void;
  /** A typed outcome action (the chips, the cards, the agent). */
  readonly onAction: (action: MosActionId) => void;
  readonly onDeclareMission: (input: MosMissionIntakeInput) => void;
  readonly onComposePost: (input: MosPostComposerInput) => void;
  readonly onSchedulePost: (id: string, when: string) => void;
  readonly onDraftCampaign: (input: MosCampaignIntakeInput) => void;
  readonly onCompileCampaign: (id: string) => void;
  readonly onDecideApproval: (id: string, decision: 'approve' | 'deny') => void;
  readonly onConnectProvider: (providerId: string) => void;
  readonly onToggleTheme: () => void;
  readonly onAgentToggle: () => void;
  readonly onAgentSubmitText: (text: string) => void;
  readonly onAgentDismissGuidance: () => void;
  /** The New Task draft change (the entry owns the draft; a discrete pick). */
  readonly onNewTaskDraftChange: (partial: Partial<MosNewTaskDraft>) => void;
  /** The New Task composer submit (records the agent task). */
  readonly onNewTaskSubmit: (input: MosAgentTaskIntakeInput) => void;
  /** The composer picker's Manage models entry (navigates to Model Settings). */
  readonly onManageModels: () => void;
  /** The Model Settings provider family select. */
  readonly onSelectModelProviderFamily: (family: MosModelProviderFamilyId) => void;
  /** The Model Settings model-list enable toggle (a store write). */
  readonly onToggleModelEnabled: (modelId: string, enabled: boolean) => void;
  /** The Model Settings honest notes (Refresh / Add provider / Add model). */
  readonly onModelSettingsNote: (note: string) => void;
}

/** The receipts the entry echoes under the intakes (null = none yet). */
export interface MosConsoleReceipts {
  readonly overviewIntake: string | null;
  readonly mission: string | null;
  readonly post: string | null;
  readonly campaign: string | null;
  readonly connection: string | null;
  readonly task: string | null;
  readonly model: string | null;
}

export interface MosConsoleAppProps {
  readonly sectionId: MosConsoleSectionId;
  readonly workspace: MosWorkspaceSnapshot;
  readonly health: MosWorkspaceStoreHealth;
  readonly quarantineCount: number;
  readonly theme: 'light' | 'dark';
  readonly shellVersion: string;
  readonly prefill: MosMissionPrefill | null;
  readonly prefillKey: number;
  readonly receipts: MosConsoleReceipts;
  readonly agent: {
    readonly open: boolean;
    readonly transcript: readonly MosAgentTranscriptEntry[];
    readonly guidanceVisible: boolean;
  };
  /** The New Task draft (the entry owns it; the emerged surface composes it). */
  readonly newTaskDraft: MosNewTaskDraft;
  /** The Model Settings provider family the detail pane shows. */
  readonly modelProviderFamily: MosModelProviderFamilyId;
  readonly controller: MosConsoleController;
}

function sectionRecord(id: MosConsoleSectionId): MosConsoleSectionRecord {
  const record = MOS_CONSOLE_SECTIONS.find((section) => section.id === id);
  if (record === undefined) {
    throw new Error(`mosc: section ${id} is not in the vocabulary`);
  }
  return record;
}

/** The MOS wordmark (the brand square + the emerald mark). */
function MosMark() {
  return (
    <span className="mosc-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="9" fill="#0e8066" />
        <path d="M10 11h12M10 16h8M13 21h6" stroke="#f7f9fb" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );
}

export function MosConsoleApp({
  sectionId,
  workspace,
  health,
  quarantineCount,
  theme,
  shellVersion,
  prefill,
  prefillKey,
  receipts,
  agent,
  newTaskDraft,
  modelProviderFamily,
  controller,
}: MosConsoleAppProps) {
  // The Workspace group lists the console sections EXCEPT the pinned
  // Settings and the two W35 native workbench surfaces (those render in
  // the Agent Workbench group — their home, with is-active state).
  const workspaceSections = MOS_CONSOLE_SECTIONS.filter(
    (section) => section.id !== 'settings' && section.id !== 'new-task' && section.id !== 'model-settings',
  );
  const settingsSection = MOS_CONSOLE_SECTIONS.find((section) => section.id === 'settings');
  const activeSection = sectionRecord(sectionId);
  const section = (id: MosConsoleSectionId): MosConsoleSectionRecord => sectionRecord(id);

  const navItem = (record: MosConsoleSectionRecord, pinned: boolean) => (
    <li key={record.id} className={pinned ? 'mosc-nav-item mosc-nav-item--pinned' : 'mosc-nav-item'}>
      <button
        type="button"
        className={record.id === sectionId ? 'mosc-nav-link is-active' : 'mosc-nav-link'}
        aria-current={record.id === sectionId ? 'page' : undefined}
        data-testid={`mosc-nav-${record.id}`}
        onClick={() => controller.onNavigateSection(record.id)}
      >
        <span className="mosc-nav-icon" aria-hidden="true">
          {SECTION_ICONS[record.id]}
        </span>
        <span className="mosc-nav-label">{record.title}</span>
      </button>
    </li>
  );

  return (
    <div className={theme === 'dark' ? 'mosc-root mosc-theme-dark' : 'mosc-root mosc-theme-light'}>
      <div className="mosc-shell">
        <aside className="mosc-sidebar" aria-label="MOS workspace sections">
          <p className="mosc-brand">
            <MosMark />
            <span className="mosc-brand-name">MOS</span>
            <span className="mosc-brand-frame">Agent Workspace</span>
          </p>
          <p className="mosc-nav-group-label">Workspace</p>
          <ul className="mosc-nav-list">
            {workspaceSections.map((record) => navItem(record, false))}
          </ul>
          <div className="mosc-nav-divider" aria-hidden="true" />
          <p className="mosc-nav-group-label">Agent Workbench</p>
          <ul className="mosc-nav-list">
            {MOS_WORKBENCH_NAV_ITEMS.map((item) => {
              // NATIVE entries (W35): console sections with is-active state;
              // SUBSTRATE entries: the host-mounted surfaces behind the chrome.
              const nativeActive =
                item.kind === 'native' && item.section === sectionId;
              return (
                <li key={item.testId} className="mosc-nav-item">
                  <button
                    type="button"
                    className={
                      item.kind === 'native'
                        ? nativeActive
                          ? 'mosc-nav-link mosc-nav-link--workbench is-active'
                          : 'mosc-nav-link mosc-nav-link--workbench'
                        : 'mosc-nav-link mosc-nav-link--workbench'
                    }
                    aria-current={nativeActive ? 'page' : undefined}
                    data-testid={item.testId}
                    onClick={() => {
                      if (item.kind === 'native') {
                        controller.onNavigateSection(item.section);
                      } else {
                        controller.onWorkbenchSurface(item.surface);
                      }
                    }}
                  >
                    <span className="mosc-nav-icon" aria-hidden="true">
                      {WORKBENCH_ICONS[item.icon]}
                    </span>
                    <span className="mosc-nav-label">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mosc-nav-divider" aria-hidden="true" />
          {settingsSection !== undefined ? (
            <ul className="mosc-nav-list">{navItem(settingsSection, true)}</ul>
          ) : null}
          <p className="mosc-sidebar-foot">
            v{shellVersion} · {health.missionCount} missions · {health.durability}
          </p>
        </aside>

        <nav className="mosc-sectionnav" aria-label="MOS workspace sections">
          <ul className="mosc-sectionnav-list">
            {MOS_CONSOLE_SECTIONS.map((record) => (
              <li key={record.id} className="mosc-sectionnav-item">
                <button
                  type="button"
                  className={record.id === sectionId ? 'mosc-sectionnav-link is-active' : 'mosc-sectionnav-link'}
                  aria-current={record.id === sectionId ? 'page' : undefined}
                  onClick={() => controller.onNavigateSection(record.id)}
                >
                  <span className="mosc-nav-icon" aria-hidden="true">
                    {SECTION_ICONS[record.id]}
                  </span>
                  <span className="mosc-nav-label">{record.title}</span>
                </button>
              </li>
            ))}
            {MOS_WORKBENCH_NAV_ITEMS.map((item) => {
              const nativeActive =
                item.kind === 'native' && item.section === sectionId;
              return (
                <li key={item.testId} className="mosc-sectionnav-item">
                  <button
                    type="button"
                    className={
                      item.kind === 'native'
                        ? nativeActive
                          ? 'mosc-sectionnav-link mosc-sectionnav-link--workbench is-active'
                          : 'mosc-sectionnav-link mosc-sectionnav-link--workbench'
                        : 'mosc-sectionnav-link mosc-sectionnav-link--workbench'
                    }
                    aria-current={nativeActive ? 'page' : undefined}
                    data-testid={`row-${item.testId}`}
                    onClick={() => {
                      if (item.kind === 'native') {
                        controller.onNavigateSection(item.section);
                      } else {
                        controller.onWorkbenchSurface(item.surface);
                      }
                    }}
                  >
                    <span className="mosc-nav-icon" aria-hidden="true">
                      {WORKBENCH_ICONS[item.icon]}
                    </span>
                    <span className="mosc-nav-label">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mosc-main-column">
          <main className="mosc-main" id="mosc-main">
            {sectionId === 'overview' ? (
              <OverviewSection
                section={section('overview')}
                workspace={workspace}
                onIntake={controller.onIntake}
                onAction={controller.onAction}
                onNavigate={controller.onNavigateSection}
                onDecideApproval={controller.onDecideApproval}
                intakeReceipt={receipts.overviewIntake}
              />
            ) : sectionId === 'missions' ? (
              <MissionsSection
                section={section('missions')}
                workspace={workspace}
                onDeclare={controller.onDeclareMission}
                prefill={prefill}
                prefillKey={prefillKey}
                receipt={receipts.mission}
              />
            ) : sectionId === 'social' ? (
              <SocialSection
                section={section('social')}
                workspace={workspace}
                onCompose={controller.onComposePost}
                onSchedule={controller.onSchedulePost}
                receipt={receipts.post}
              />
            ) : sectionId === 'ads' ? (
              <AdsSection
                section={section('ads')}
                workspace={workspace}
                onDraft={controller.onDraftCampaign}
                onCompile={controller.onCompileCampaign}
                receipt={receipts.campaign}
              />
            ) : sectionId === 'connections' ? (
              <ConnectionsSection
                section={section('connections')}
                workspace={workspace}
                onConnect={controller.onConnectProvider}
                receipt={receipts.connection}
              />
            ) : sectionId === 'activity' ? (
              <ActivitySection
                section={section('activity')}
                workspace={workspace}
                onDecideApproval={controller.onDecideApproval}
              />
            ) : sectionId === 'settings' ? (
              <SettingsSection
                section={section('settings')}
                workspace={workspace}
                health={health}
                quarantineCount={quarantineCount}
                theme={theme}
                onToggleTheme={controller.onToggleTheme}
                shellVersion={shellVersion}
              />
            ) : sectionId === 'new-task' ? (
              <NewTaskSection
                section={section('new-task')}
                workspace={workspace}
                draft={newTaskDraft}
                receipt={receipts.task}
                onDraftChange={controller.onNewTaskDraftChange}
                onSubmit={controller.onNewTaskSubmit}
                onManageModels={controller.onManageModels}
                onNavigate={controller.onNavigateSection}
              />
            ) : sectionId === 'model-settings' ? (
              <ModelSettingsSection
                section={section('model-settings')}
                workspace={workspace}
                draft={newTaskDraft}
                providerFamily={modelProviderFamily}
                receipt={receipts.model}
                onSelectFamily={controller.onSelectModelProviderFamily}
                onDraftChange={controller.onNewTaskDraftChange}
                onToggleModel={controller.onToggleModelEnabled}
                onNote={controller.onModelSettingsNote}
              />
            ) : sectionId === 'lab' ? (
              <LabSection section={section('lab')} workspace={workspace} />
            ) : sectionId === 'console' ? (
              <ConsoleSection section={section('console')} workspace={workspace} />
            ) : sectionId === 'studio' ? (
              <StudioSection section={section('studio')} workspace={workspace} />
            ) : sectionId === 'distribution' ? (
              <DistributionSection section={section('distribution')} workspace={workspace} />
            ) : sectionId === 'experiments' ? (
              <ExperimentsSection section={section('experiments')} workspace={workspace} />
            ) : (
              <MeasurementSection section={section('measurement')} workspace={workspace} />
            )}
          </main>

          <footer className="mosc-footer">
            <p className="mosc-footer-line">
              MOS Agent Workspace — {MOS_WORKSPACE_DURABILITY_FACT} No live social accounts or ad platforms are connected;
              nothing here publishes content or spends budget.
            </p>
            <p className="mosc-footer-meta" data-testid="mosc-footer-missions">
              {workspace.missions.length} mission{workspace.missions.length === 1 ? '' : 's'} recorded in this workspace
            </p>
          </footer>
        </div>
      </div>

      <MosAgentRail
        workspace={workspace}
        onToggleOpen={controller.onAgentToggle}
        onDismissGuidance={controller.onAgentDismissGuidance}
        guidanceVisible={agent.guidanceVisible}
        open={agent.open}
        transcript={agent.transcript}
        onSubmitText={controller.onAgentSubmitText}
      />
    </div>
  );
}
