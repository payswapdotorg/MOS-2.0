/**
 * The MOS NEW TASK section (W35 — the substrate's New Task page, EMERGED
 * as a native MOS console surface, "exactly as is" per the owner's
 * directive).
 *
 * WHAT THIS REPLICATES (the substrate's draft workspace surface, verbatim
 * structure + copy): the time-of-day greeting over the watermark mark,
 * the centered composer card (the context header with the workspace-style
 * mission switcher, the prompt textarea with the @/#-mention placeholder,
 * the toolbar with the add-context menu + the mode switch [Plan mode +
 * the three permission modes] + the model select [provider header +
 * connection-mode select + radio roster with Vision/context badges +
 * Manage models] + the send button), the suggested-prompt chip row, and
 * the task-title-from-prompt derivation. Product-name substitution is the
 * one disclosed adaptation (ZCode → MOS in the placeholder); the mission
 * context menu adapts the substrate's workspace switcher to MOS's domain
 * (the payswap noun-swap pattern).
 *
 * HOOK-FREE like every console section: the draft arrives as a prop, the
 * changes leave through onDraftChange (the entry owns the state and
 * re-mounts), the textarea is UNCONTROLLED (typing never re-renders —
 * the send button's disabled state updates through the DOM), and the
 * menus are native <details> popovers (their open state is DOM-local,
 * items close them explicitly). The submit composes a REAL workspace
 * task record (the store's recordAgentTask) — the emerged surface's
 * honest write.
 */

import type { MosConsoleSectionId, MosConsoleSectionRecord } from '../console-nav.js';
import type { MosAgentTaskIntakeInput, MosWorkspaceSnapshot } from '../workspace-store.js';
import type { MosNewTaskDraft, MosNewTaskMode } from '../new-task-draft.js';
import {
  MOS_NEW_TASK_MODES,
  MOS_NEW_TASK_SUGGESTED_PROMPTS,
  mosNewTaskGreeting,
  mosNewTaskTitleFromPrompt,
  mosNewTaskDraftForConnectionMode,
  mosNewTaskDraftForModel,
} from '../new-task-draft.js';
import type { MosModelConnectionModeId } from '../model-catalog.js';
import {
  MOS_MODEL_CONNECTION_MODES,
  mosAgentModel,
  mosModelContextBadge,
  mosModelVisionBadgeVisible,
  mosModelsForConnectionMode,
} from '../model-catalog.js';
import { ReceiptLine } from './shared.js';

type ViewNode = unknown;

/* --------------------------------------------------------------------
 * The DOM-local helpers (uncontrolled-input law: typing never re-renders)
 * -------------------------------------------------------------------- */

function sendButton(form: HTMLFormElement | null): HTMLButtonElement | null {
  return form?.querySelector('button[data-testid="mosnt-send"]') ?? null;
}

function updateSendState(textarea: HTMLTextAreaElement): void {
  const send = sendButton(textarea.closest('form'));
  if (send !== null) {
    send.disabled = textarea.value.trim().length === 0;
  }
}

function closeDetails(node: Element): void {
  const details = node.closest('details');
  if (details !== null) {
    details.open = false;
  }
}

function insertToken(textarea: HTMLTextAreaElement, token: string): void {
  const at = textarea.selectionStart ?? textarea.value.length;
  const before = textarea.value.slice(0, at);
  const after = textarea.value.slice(at);
  const pad = before.length === 0 || before.endsWith(' ') ? '' : ' ';
  textarea.value = `${before}${pad}${token}${after}`;
  const caret = (before + pad + token).length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
  updateSendState(textarea);
}

function fillPrompt(textarea: HTMLTextAreaElement, prompt: string): void {
  textarea.value = prompt;
  textarea.setSelectionRange(prompt.length, prompt.length);
  textarea.focus();
  updateSendState(textarea);
}

function composerTextarea(form: HTMLFormElement): HTMLTextAreaElement | null {
  return form.querySelector('textarea[data-testid="mosnt-input"]');
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

const PLUS_GLYPH = icon(<><path d="M12 5v14M5 12h14" /></>);
const LIGHTBULB_GLYPH = icon(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z" /></>);
const PACKAGE_GLYPH = icon(<><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></>);
const CHEVRON_GLYPH = icon(<><path d="m6 9 6 6 6-6" /></>);
const ARROW_UP_GLYPH = icon(<><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>);
const SPARK_GLYPH = icon(<><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>);
const FOLDER_GLYPH = icon(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>);
const MODE_GLYPH = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 8.2v7.6M8.2 12h7.6" /></>);
const SEARCH_GLYPH = icon(<><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></>);
const CHECK_SQUARE_GLYPH = icon(<><path d="M9 11.5 11.5 14 16 8.5" /><rect x="4" y="4" width="16" height="16" rx="3" /></>);
const FILE_GLYPH = icon(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>);
const WAND_GLYPH = icon(<><path d="m4 20 12-12" /><path d="M14 4v4h4" /><path d="M19 9v3M17.5 10.5 21 7M8 4l.9 2.1L11 7l-2.1.9L8 10l-.9-2.1L5 7l2.1-.9z" /></>);

/** The suggested-prompt chip glyphs (rotating set, presentation-only). */
const CHIP_GLYPHS: readonly never[] = [SEARCH_GLYPH, CHECK_SQUARE_GLYPH, FILE_GLYPH, WAND_GLYPH];

/* --------------------------------------------------------------------
 * The section
 * -------------------------------------------------------------------- */

export function NewTaskSection({
  section,
  workspace,
  draft,
  receipt,
  onDraftChange,
  onSubmit,
  onManageModels,
  onNavigate,
}: {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  readonly draft: MosNewTaskDraft;
  readonly receipt: string | null;
  readonly onDraftChange: (partial: Partial<MosNewTaskDraft>) => void;
  readonly onSubmit: (input: MosAgentTaskIntakeInput) => void;
  readonly onManageModels: () => void;
  readonly onNavigate: (section: MosConsoleSectionId) => void;
}) {
  const greeting = mosNewTaskGreeting(new Date().getHours());
  const model = mosAgentModel(draft.modelId);
  const modeDescriptor = MOS_NEW_TASK_MODES.find((candidate) => candidate.id === draft.mode);
  const activeMission =
    draft.missionId === null
      ? undefined
      : workspace.missions.find((mission) => mission.id === draft.missionId);
  const contextLabel =
    activeMission === undefined ? 'Home' : truncate(activeMission.statement, 36);
  const connectionMode = MOS_MODEL_CONNECTION_MODES.find((candidate) => candidate.id === draft.connectionMode);
  const disabledModels = workspace.modelSettings.disabledModelIds;
  const roster = mosModelsForConnectionMode(draft.connectionMode).filter(
    (candidate) => !disabledModels.includes(candidate.id) || candidate.id === draft.modelId,
  );

  return (
    <section
      aria-labelledby="mosc-new-task-heading"
      className="mosc-section mosc-nt"
      data-testid="mosc-section-new-task"
    >
      <h1 id="mosc-new-task-heading" className="mosc-sr-only">
        {section.title}
      </h1>

      <div className="mosc-nt-stage">
        <div className="mosc-nt-hero">
          <span className="mosc-nt-watermark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="320" height="256" aria-hidden="true" focusable="false">
              <path d="M8 9h16M8 16h11M12 23h7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            </svg>
          </span>
          <p className="mosc-nt-greeting" data-testid="mosnt-greeting">
            {greeting}
          </p>
        </div>

        <form
          className="mosc-nt-composer"
          data-testid="mosnt-composer"
          onSubmit={(event) => {
            event.preventDefault();
            const textarea = composerTextarea(event.currentTarget);
            if (textarea === null) {
              return;
            }
            const prompt = textarea.value.trim();
            if (prompt.length === 0) {
              return;
            }
            onSubmit({
              title: mosNewTaskTitleFromPrompt(prompt),
              prompt,
              modelId: draft.modelId,
              connectionMode: draft.connectionMode,
              mode: draft.mode,
              planEnabled: draft.planEnabled,
              reasoningLevel: draft.reasoningLevel,
              missionId: draft.missionId,
            });
            event.currentTarget.reset();
          }}
        >
          <div className="mosc-nt-composer-head">
            <details className="mosc-nt-details">
              <summary
                className="mosc-nt-summary mosc-nt-summary--context"
                data-testid="mosnt-context-trigger"
                title="Choose mission"
              >
                {FOLDER_GLYPH}
                <span className="mosc-nt-summary-label">{contextLabel}</span>
                {CHEVRON_GLYPH}
              </summary>
              <div className="mosc-nt-menu mosc-nt-menu--context" role="menu" aria-label="Mission context">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={draft.missionId === null}
                  data-testid="mosnt-context-home"
                  className={draft.missionId === null ? 'mosc-nt-menuradio is-selected' : 'mosc-nt-menuradio'}
                  onClick={(event) => {
                    onDraftChange({ missionId: null });
                    closeDetails(event.currentTarget);
                  }}
                >
                  <span className="mosc-nt-radiodot" aria-hidden="true" />
                  Home
                </button>
                {workspace.missions.slice(0, 6).map((mission) => (
                  <button
                    key={mission.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={draft.missionId === mission.id}
                    data-testid={`mosnt-context-mission`}
                    data-mission-id={mission.id}
                    className={draft.missionId === mission.id ? 'mosc-nt-menuradio is-selected' : 'mosc-nt-menuradio'}
                    onClick={(event) => {
                      onDraftChange({ missionId: mission.id });
                      closeDetails(event.currentTarget);
                    }}
                  >
                    <span className="mosc-nt-radiodot" aria-hidden="true" />
                    {truncate(mission.statement, 44)}
                  </button>
                ))}
                <div className="mosc-nt-menu-divider" aria-hidden="true" />
                <button
                  type="button"
                  role="menuitem"
                  data-testid="mosnt-context-create"
                  className="mosc-nt-menuaction"
                  onClick={(event) => {
                    closeDetails(event.currentTarget);
                    onNavigate('missions');
                  }}
                >
                  {PLUS_GLYPH}
                  Create mission
                </button>
              </div>
            </details>
          </div>

          <textarea
            className="mosc-nt-input"
            data-testid="mosnt-input"
            rows={4}
            placeholder="Ask MOS anything, @ to add context, / for commands or capabilities"
            aria-label="Task prompt"
            onInput={(event) => {
              updateSendState(event.currentTarget);
            }}
          />

          <div className="mosc-nt-toolbar">
            <div className="mosc-nt-toolbar-lead">
              <details className="mosc-nt-details">
                <summary className="mosc-nt-summary mosc-nt-summary--icon" data-testid="mosnt-add-trigger" title="Add">
                  {PLUS_GLYPH}
                </summary>
                <div className="mosc-nt-menu mosc-nt-menu--add" role="menu" aria-label="Add context">
                  <button
                    type="button"
                    role="menuitem"
                    className="mosc-nt-menuaction"
                    onClick={(event) => {
                      const textarea = composerTextarea(closestForm(event.currentTarget));
                      if (textarea !== null) {
                        insertToken(textarea, '@');
                      }
                      closeDetails(event.currentTarget);
                    }}
                  >
                    {AT_CONTEXT_GLYPH}
                    Add context
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="mosc-nt-menuaction"
                    onClick={(event) => {
                      const textarea = composerTextarea(closestForm(event.currentTarget));
                      if (textarea !== null) {
                        insertToken(textarea, '/');
                      }
                      closeDetails(event.currentTarget);
                    }}
                  >
                    {WAND_GLYPH}
                    Choose capabilities
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="mosc-nt-menuaction"
                    onClick={(event) => {
                      const textarea = composerTextarea(closestForm(event.currentTarget));
                      if (textarea !== null) {
                        insertToken(textarea, '$');
                      }
                      closeDetails(event.currentTarget);
                    }}
                  >
                    {SPARK_GLYPH}
                    Choose skills
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="mosc-nt-menuaction mosc-nt-menuaction--muted"
                    aria-disabled="true"
                    title="Not wired in this release"
                    onClick={(event) => {
                      closeDetails(event.currentTarget);
                    }}
                  >
                    {FILE_GLYPH}
                    Workflow
                  </button>
                </div>
              </details>

              <details className="mosc-nt-details">
                <summary
                  className="mosc-nt-summary mosc-nt-summary--mode"
                  data-testid="mosnt-mode-trigger"
                  title="Switch mode"
                >
                  {MODE_GLYPH}
                  <span className="mosc-nt-summary-label">{modeDescriptor === undefined ? draft.mode : modeDescriptor.label}</span>
                  {CHEVRON_GLYPH}
                </summary>
                <div className="mosc-nt-menu mosc-nt-menu--mode" role="menu" aria-label="Permission mode">
                  <label className="mosc-nt-planrow" data-testid="mosnt-plan-toggle">
                    <input
                      type="checkbox"
                      checked={draft.planEnabled}
                      onChange={() => {
                        onDraftChange({ planEnabled: !draft.planEnabled });
                      }}
                    />
                    {LIGHTBULB_GLYPH}
                    <span className="mosc-nt-planlabel">
                      <span className="mosc-nt-planname">Plan mode</span>
                      <span className="mosc-nt-plandesc">Plan before editing.</span>
                    </span>
                  </label>
                  <div className="mosc-nt-menu-divider" aria-hidden="true" />
                  {MOS_NEW_TASK_MODES.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={draft.mode === candidate.id}
                      data-testid="mosnt-mode-item"
                      data-mode={candidate.id}
                      className={
                        draft.mode === candidate.id
                          ? `mosc-nt-moderow is-selected${candidate.id === 'yolo' ? ' mosc-nt-moderow--warning' : ''}`
                          : `mosc-nt-moderow${candidate.id === 'yolo' ? ' mosc-nt-moderow--warning' : ''}`
                      }
                      onClick={(event) => {
                        onDraftChange({ mode: candidate.id as MosNewTaskMode });
                        closeDetails(event.currentTarget);
                      }}
                    >
                      <span className="mosc-nt-radiodot" aria-hidden="true" />
                      <span className="mosc-nt-modelabel">
                        <span className="mosc-nt-modename">{candidate.label}</span>
                        <span className="mosc-nt-modedesc">{candidate.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </details>

              {model !== undefined && model.reasoning !== null ? (
                <button
                  type="button"
                  className="mosc-nt-toolbtn"
                  data-testid="mosnt-reasoning"
                  title="Reasoning effort"
                  onClick={() => {
                    const levels = model.reasoning ?? [];
                    const index = levels.indexOf(draft.reasoningLevel);
                    const next = levels[(index + 1) % Math.max(levels.length, 1)] ?? levels[0] ?? '';
                    onDraftChange({ reasoningLevel: next });
                  }}
                >
                  {SPARK_GLYPH}
                  <span className="mosc-nt-toolbtn-label">{capitalize(draft.reasoningLevel)}</span>
                </button>
              ) : null}
            </div>

            <div className="mosc-nt-toolbar-trail">
              <details className="mosc-nt-details">
                <summary
                  className="mosc-nt-summary mosc-nt-summary--model"
                  data-testid="mosnt-model-trigger"
                  data-model-current-value={draft.modelId}
                  title={draft.modelId}
                >
                  {PACKAGE_GLYPH}
                  <span className="mosc-nt-summary-label">{draft.modelId}</span>
                  {CHEVRON_GLYPH}
                </summary>
                <div className="mosc-nt-menu mosc-nt-menu--model" role="menu" aria-label="Model">
                  <div className="mosc-nt-modelmenu-head">
                    <span className="mosc-nt-modelmenu-family">Z.ai</span>
                    <select
                      className="mosc-nt-modeselect"
                      data-testid="mosnt-connection-mode"
                      value={draft.connectionMode}
                      aria-label="Connection mode"
                      onChange={(event) => {
                        onDraftChange(
                          mosNewTaskDraftForConnectionMode(
                            draft,
                            event.currentTarget.value as MosModelConnectionModeId,
                          ),
                        );
                      }}
                    >
                      {MOS_MODEL_CONNECTION_MODES.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.label}
                          {candidate.badge !== null ? ` · ${candidate.badge}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {connectionMode !== undefined && connectionMode.badge !== null ? (
                    <p className="mosc-nt-modelmenu-badge">Plan badge: {connectionMode.badge}</p>
                  ) : null}
                  {roster.length === 0 ? (
                    <p className="mosc-nt-menu-empty">No models are configured. Add a model to use it in chat.</p>
                  ) : (
                    roster.map((candidate) => {
                      const selected = candidate.id === draft.modelId;
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          data-testid="mosnt-model-item"
                          data-model-id={candidate.id}
                          data-checked={selected ? 'true' : undefined}
                          className={selected ? 'mosc-nt-modelrow is-selected' : 'mosc-nt-modelrow'}
                          onClick={(event) => {
                            onDraftChange(mosNewTaskDraftForModel(draft, candidate.id));
                            closeDetails(event.currentTarget);
                          }}
                        >
                          <span className="mosc-nt-radiodot" aria-hidden="true" />
                          <span className="mosc-nt-modelname">{candidate.id}</span>
                          {mosModelVisionBadgeVisible(candidate.id, draft.connectionMode) ? (
                            <span className="mosc-badge mosc-badge--vision">Vision</span>
                          ) : null}
                          <span className="mosc-badge mosc-badge--context">
                            {mosModelContextBadge(candidate.contextTokens)}
                          </span>
                        </button>
                      );
                    })
                  )}
                  <div className="mosc-nt-menu-divider" aria-hidden="true" />
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="mosnt-manage-models"
                    className="mosc-nt-menuaction"
                    onClick={(event) => {
                      closeDetails(event.currentTarget);
                      onManageModels();
                    }}
                  >
                    {PACKAGE_GLYPH}
                    Manage models
                  </button>
                </div>
              </details>

              <button
                type="submit"
                className="mosc-nt-send"
                data-testid="mosnt-send"
                disabled
                title="Send"
                aria-label="Send"
              >
                {ARROW_UP_GLYPH}
              </button>
            </div>
          </div>
        </form>

        <div className="mosc-nt-suggested" data-testid="mosnt-suggested">
          {MOS_NEW_TASK_SUGGESTED_PROMPTS.map((prompt, index) => (
            <button
              key={prompt.id}
              type="button"
              className="mosc-nt-chip"
              data-testid={`mosnt-chip`}
              data-draft-suggested-prompt={prompt.id}
              style={{ '--mosc-nt-chip-delay': `${index * 65}ms` } as never}
              onClick={(event) => {
                const textarea = composerTextarea(closestForm(event.currentTarget));
                if (textarea !== null) {
                  fillPrompt(textarea, prompt.prompt);
                }
              }}
            >
              {CHIP_GLYPHS[index % CHIP_GLYPHS.length]}
              <span>{prompt.label}</span>
            </button>
          ))}
        </div>

        {receipt !== null ? <ReceiptLine tone="ok">{receipt}</ReceiptLine> : null}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------
 * Small local helpers
 * -------------------------------------------------------------------- */

const AT_CONTEXT_GLYPH = icon(<><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>);

function closestForm(node: Element): HTMLFormElement {
  const form = node.closest('form');
  return form ?? ({ querySelector: () => null } as unknown as HTMLFormElement);
}

function truncate(value: string, cap: number): string {
  return value.length <= cap ? value : `${value.slice(0, cap - 1).trimEnd()}…`;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
