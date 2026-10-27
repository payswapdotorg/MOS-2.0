/**
 * The MOS AUTOMATIONS section (W36 — the substrate's Automations main
 * view, EMERGED as a native MOS console surface, "exactly as is" per
 * the owner's directive).
 *
 * WHAT THIS REPLICATES (the substrate's AutomationsSection list mode,
 * verbatim structure + copy): the max-w-5xl content column; the page
 * header (the flat `<h1>` "Automations" + the populated/empty
 * description line); the tabs row with the single "Scheduled tasks"
 * pill (the idle-time tab stays gray-off — the substrate's own
 * resolveVisibleAutomationTabs collapse) + the Refresh action + the
 * "Create scheduled task" affordance; the status-filter pill row
 * ("All / In progress / Completed / Failed"); the "Task created"
 * section label over the two-column card grid (auto-rows-[132px],
 * lg:grid-cols-2); the automation cards (title, line-clamp-2 prompt,
 * the "{schedule} · Next run {when}" success badge, the "Ran {count}
 * times" chip, the hover actions menu: Run now / Pause|Continue /
 * Delete with the two-click confirm); the keep-awake notice row with
 * its switch; and the empty state card ("No scheduled tasks yet." +
 * the create affordances). The delete confirm copy ("Delete “{title}”?
 * This cannot be undone.") is verbatim.
 *
 * HOOK-FREE like every console section: the snapshot + the status
 * filter + the receipts arrive as props, the commands leave through
 * the callbacks (the entry owns every piece of state and re-mounts).
 *
 * THE HONEST WRITES: Run now records a run REQUEST (the substrate
 * dispatches it when an account is connected); Pause/Continue and
 * keep-awake are REAL workspace decisions; Delete removes the record.
 * runCount stays the honest count of dispatched runs — always zero in
 * this release.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import type { MosWorkspaceSnapshot, MosWorkspaceAutomation } from '../workspace-store.js';
import {
  MOS_AUTOMATIONS_CREATED_LABEL,
  MOS_AUTOMATIONS_DESCRIPTION_EMPTY,
  MOS_AUTOMATIONS_DESCRIPTION_POPULATED,
  MOS_AUTOMATIONS_EMPTY_TITLE,
  MOS_AUTOMATIONS_CREATE_IN_CHAT,
  MOS_AUTOMATIONS_CREATE_LABEL,
  MOS_AUTOMATIONS_FILTER_EMPTY,
  MOS_AUTOMATIONS_KEEP_AWAKE_LINE,
  MOS_AUTOMATIONS_TAB,
  MOS_AUTOMATIONS_TITLE,
  MOS_AUTOMATION_STATUS_WORDS,
  MOS_AUTOMATION_FILTERS,
  mosAutomationRunCountLabel,
  mosAutomationScheduleBadge,
  mosAutomationsForFilter,
  type MosAutomationStatusFilter,
} from '../automation-presentation.js';
import { ReceiptLine } from './shared.js';

type ViewNode = unknown;

/* --------------------------------------------------------------------
 * The DOM-local helpers (the two-click delete confirm — the substrate's
 * destructive second-click law; the armed state resets after 2.5s)
 * -------------------------------------------------------------------- */

function armDeleteButton(button: HTMLButtonElement, commit: () => void): void {
  if (button.dataset.armed === 'true') {
    delete button.dataset.armed;
    commit();
    return;
  }
  button.dataset.armed = 'true';
  const reset = (): void => {
    delete button.dataset.armed;
  };
  window.setTimeout(reset, 2500);
}

function closeDetails(node: Element): void {
  const details = node.closest('details');
  if (details !== null) {
    details.open = false;
  }
}

/* --------------------------------------------------------------------
 * The inline glyph kit (presentation-only, stroke = currentColor)
 * -------------------------------------------------------------------- */

function icon(children: ViewNode): never {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children as never}
    </svg>
  ) as never;
}

const CLOCK_GLYPH = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 2" /></>);
const REFRESH_GLYPH = icon(<><path d="M20 11.5A8 8 0 1 0 18.4 16" /><path d="M20 5v6.5h-6.5" /></>);
const PLAY_GLYPH = icon(<><path d="M7 5.5v13l11-6.5z" /></>);
const PAUSE_GLYPH = icon(<><path d="M9 5.5v13M15 5.5v13" /></>);
const TRASH_GLYPH = icon(<><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7l1 13h9l1-13" /></>);
const MORE_GLYPH = icon(<><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>);
const PLUS_GLYPH = icon(<><path d="M12 5v14M5 12h14" /></>);

/* --------------------------------------------------------------------
 * One automation card (the substrate's AutomationCard replica)
 * -------------------------------------------------------------------- */

function AutomationCard({
  automation,
  now,
  onPauseToggle,
  onRun,
  onDelete,
}: {
  readonly automation: MosWorkspaceAutomation;
  /** The render-time ISO now (the next-run label is a pure function of it). */
  readonly now?: string;
  readonly onPauseToggle: (id: string, paused: boolean) => void;
  readonly onRun: (id: string) => void;
  readonly onDelete: (id: string) => void;
}) {
  const paused = automation.lifecycleStatus === 'paused';
  const terminal = automation.lifecycleStatus === 'completed' || automation.lifecycleStatus === 'failed';
  return (
    <div
      className={paused || terminal ? 'mosc-atm-card is-dimmed' : 'mosc-atm-card'}
      data-testid="mosatm-card"
      data-automation-id={automation.id}
    >
      <div className="mosc-atm-card-body">
        <span className="mosc-atm-card-title">{automation.title}</span>
        <p className="mosc-atm-card-prompt">{automation.prompt}</p>
        <div className="mosc-atm-card-status">
          {automation.lifecycleStatus === 'active' && automation.nextRunAt !== null ? (
            <span className="mosc-atm-badge">{mosAutomationScheduleBadge(automation, now)}{CLOCK_GLYPH}</span>
          ) : (
            <span className="mosc-atm-statusword">{MOS_AUTOMATION_STATUS_WORDS[automation.lifecycleStatus]}</span>
          )}
          <span className={paused || terminal ? 'mosc-atm-runcount is-dimmed' : 'mosc-atm-runcount'}>
            {mosAutomationRunCountLabel(automation)}
          </span>
        </div>
      </div>
      <div className="mosc-atm-card-actions">
        <details className="mosc-atm-details">
          <summary className="mosc-atm-more" data-testid="mosatm-menu-trigger" aria-label="More actions" title="More actions">
            {MORE_GLYPH}
          </summary>
          <div className="mosc-atm-menu" role="menu" aria-label={`Actions for ${automation.title}`}>
            <button
              type="button"
              role="menuitem"
              className="mosc-atm-menuitem"
              data-testid="mosatm-run-now"
              onClick={(event) => {
                closeDetails(event.currentTarget);
                onRun(automation.id);
              }}
            >
              {PLAY_GLYPH}
              Run now
            </button>
            {terminal ? null : (
              <button
                type="button"
                role="menuitem"
                className="mosc-atm-menuitem"
                data-testid="mosatm-toggle"
                onClick={(event) => {
                  closeDetails(event.currentTarget);
                  onPauseToggle(automation.id, !paused);
                }}
              >
                {paused ? PLAY_GLYPH : PAUSE_GLYPH}
                {paused ? 'Continue' : 'Pause'}
              </button>
            )}
            <div className="mosc-atm-menu-divider" aria-hidden="true" />
            <button
              type="button"
              role="menuitem"
              className="mosc-atm-menuitem mosc-atm-menuitem--destructive"
              data-testid="mosatm-delete"
              title={`Delete “${automation.title}”? This cannot be undone.`}
              onClick={(event) => {
                armDeleteButton(event.currentTarget, () => {
                  closeDetails(event.currentTarget);
                  onDelete(automation.id);
                });
              }}
            >
              {TRASH_GLYPH}
              Delete
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------
 * The section
 * -------------------------------------------------------------------- */

export function AutomationsSection({
  section,
  workspace,
  statusFilter,
  receipt,
  now,
  onFilter,
  onPauseToggle,
  onRun,
  onDelete,
  onKeepAwake,
  onRefresh,
  onCreate,
}: {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** The active status-filter pill (the entry owns it). */
  readonly statusFilter: MosAutomationStatusFilter;
  readonly receipt: string | null;
  /** The render-time ISO now (the next-run labels are pure functions of it). */
  readonly now?: string;
  readonly onFilter: (filter: MosAutomationStatusFilter) => void;
  readonly onPauseToggle: (id: string, paused: boolean) => void;
  readonly onRun: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onKeepAwake: (enabled: boolean) => void;
  /** Refresh answers honestly (no remote list exists to re-fetch). */
  readonly onRefresh: () => void;
  /** Create routes to the New Task composer (the substrate's create-in-chat). */
  readonly onCreate: () => void;
}) {
  const populated = workspace.automations.length > 0;
  const filtered = mosAutomationsForFilter(workspace.automations, statusFilter);
  const keepAwake = workspace.automationSettings.keepAwake;

  return (
    <section
      aria-labelledby="mosc-automations-heading"
      className="mosc-section mosc-atm"
      data-testid="mosc-section-automations"
    >
      <h1 id="mosc-automations-heading" className="mosc-sr-only">
        {section.title}
      </h1>

      <div className="mosc-atm-frame">
        <h2 className="mosc-atm-title">{MOS_AUTOMATIONS_TITLE}</h2>
        <p className="mosc-atm-description">
          {populated ? MOS_AUTOMATIONS_DESCRIPTION_POPULATED : MOS_AUTOMATIONS_DESCRIPTION_EMPTY}
        </p>

        <div className="mosc-atm-tabsrow">
          <div className="mosc-atm-tabs" role="tablist" aria-label="Automations page">
            <span className="mosc-atm-tab is-active" role="tab" aria-selected="true">
              {MOS_AUTOMATIONS_TAB}
            </span>
          </div>
          <div className="mosc-atm-actions">
            <button
              type="button"
              className="mosc-atm-iconbtn"
              data-testid="mosatm-refresh"
              aria-label="Refresh"
              title="Refresh"
              onClick={() => {
                onRefresh();
              }}
            >
              {REFRESH_GLYPH}
            </button>
            <button
              type="button"
              className="mosc-atm-create"
              data-testid="mosatm-create"
              onClick={() => {
                onCreate();
              }}
            >
              {PLUS_GLYPH}
              <span>{MOS_AUTOMATIONS_CREATE_LABEL}</span>
            </button>
          </div>
        </div>

        <div className="mosc-atm-filters" role="group" aria-label="Status filter">
          {MOS_AUTOMATION_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={statusFilter === filter.id ? 'mosc-atm-filter is-active' : 'mosc-atm-filter'}
              aria-pressed={statusFilter === filter.id}
              data-testid="mosatm-filter"
              data-filter={filter.id}
              onClick={() => {
                onFilter(filter.id);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <label className="mosc-atm-keepawake">
          <input
            type="checkbox"
            data-testid="mosatm-keepawake"
            checked={keepAwake}
            onChange={() => {
              onKeepAwake(!keepAwake);
            }}
          />
          <span>{MOS_AUTOMATIONS_KEEP_AWAKE_LINE}</span>
        </label>

        {populated ? (
          <h3 className="mosc-atm-sectionlabel">{MOS_AUTOMATIONS_CREATED_LABEL}</h3>
        ) : null}
        {populated ? (
          filtered.length > 0 ? (
            <div className="mosc-atm-grid" data-testid="mosatm-grid">
              {filtered.map((automation) => (
                <AutomationCard
                  key={automation.id}
                  automation={automation}
                  now={now}
                  onPauseToggle={onPauseToggle}
                  onRun={onRun}
                  onDelete={onDelete}
                />
              ))}
            </div>
          ) : (
            <p className="mosc-atm-filterempty" role="status">
              {MOS_AUTOMATIONS_FILTER_EMPTY}
            </p>
          )
        ) : (
          <div className="mosc-atm-empty" role="status">
            <p className="mosc-atm-empty-title">{MOS_AUTOMATIONS_EMPTY_TITLE}</p>
            <div className="mosc-atm-empty-actions">
              <button
                type="button"
                className="mosc-atm-create"
                data-testid="mosatm-empty-create"
                onClick={() => {
                  onCreate();
                }}
              >
                {PLUS_GLYPH}
                <span>{MOS_AUTOMATIONS_CREATE_LABEL}</span>
              </button>
              <button
                type="button"
                className="mosc-atm-inchat"
                data-testid="mosatm-empty-create-in-chat"
                onClick={() => {
                  onCreate();
                }}
              >
                {MOS_AUTOMATIONS_CREATE_IN_CHAT}
              </button>
            </div>
          </div>
        )}
      </div>

      {receipt !== null ? <ReceiptLine tone="ok">{receipt}</ReceiptLine> : null}
    </section>
  );
}
