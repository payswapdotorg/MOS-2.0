/**
 * The MOS MODEL SETTINGS section (W35 — the substrate's Model settings,
 * EMERGED as a native MOS console surface with the FULL roster).
 *
 * WHAT THIS REPLICATES (the substrate settings' modelProvider section,
 * verbatim structure + copy): the split card with the provider-family
 * navigation on the left (Z.ai / BigModel preset cards + the empty
 * custom-providers group) and the family detail on the right — the
 * connection-mode select (Individual Plan / Start Plan / Team Plan / API),
 * and the MODEL LIST: every model in the frozen builtin roster as a row
 * (mono id + context-window badge + Vision badge + the reasoning option
 * line) with an enable Switch per row. The header carries the substrate's
 * own description line ("Manage custom model providers…") with Refresh /
 * Add provider actions — answered honestly (the roster is frozen; preset
 * families only).
 *
 * WHAT IS REAL: the enable state persists through the workspace store
 * (the New Task composer's model picker follows it — disabled models
 * drop out of the picker roster), and the connection-mode select drives
 * the same draft state the composer's picker reads (one selection, two
 * surfaces — the substrate's own coupling). HOOK-FREE like every console
 * section; state arrives via props, commands leave through callbacks.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import type { MosWorkspaceSnapshot } from '../workspace-store.js';
import type { MosNewTaskDraft } from '../new-task-draft.js';
import { mosNewTaskDraftForConnectionMode } from '../new-task-draft.js';
import type { MosModelConnectionModeId } from '../model-catalog.js';
import {
  MOS_AGENT_MODEL_CATALOG,
  MOS_MODEL_CONNECTION_MODES,
  MOS_MODEL_PROVIDER_FAMILIES,
  mosAgentModel,
  mosModelContextBadge,
  mosModelReasoningLine,
  mosModelVisionBadgeVisible,
} from '../model-catalog.js';
import { SectionScaffold, StatusPill, ReceiptLine, HonestyLine } from './shared.js';

/** The provider family the detail pane shows. */
export type MosModelProviderFamilyId = 'zai' | 'bigmodel';

type ViewNode = unknown;

function icon(children: ViewNode): never {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children as never}
    </svg>
  ) as never;
}

const REFRESH_GLYPH = icon(<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>);
const PLUS_GLYPH = icon(<><path d="M12 5v14M5 12h14" /></>);
const FAMILY_GLYPH = icon(<><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></>);

export function ModelSettingsSection({
  section,
  workspace,
  draft,
  providerFamily,
  receipt,
  onSelectFamily,
  onDraftChange,
  onToggleModel,
  onNote,
}: {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  readonly draft: MosNewTaskDraft;
  readonly providerFamily: MosModelProviderFamilyId;
  readonly receipt: string | null;
  readonly onSelectFamily: (family: MosModelProviderFamilyId) => void;
  readonly onDraftChange: (partial: Partial<MosNewTaskDraft>) => void;
  readonly onToggleModel: (modelId: string, enabled: boolean) => void;
  readonly onNote: (note: string) => void;
}) {
  const family =
    MOS_MODEL_PROVIDER_FAMILIES.find((candidate) => candidate.id === providerFamily) ??
    MOS_MODEL_PROVIDER_FAMILIES[0];
  const disabledModels = workspace.modelSettings.disabledModelIds;
  const enabledCount = MOS_AGENT_MODEL_CATALOG.filter(
    (model) => !disabledModels.includes(model.id),
  ).length;
  const connectionMode = MOS_MODEL_CONNECTION_MODES.find(
    (candidate) => candidate.id === draft.connectionMode,
  );

  return (
    <SectionScaffold
      section={section}
      headerAside={<StatusPill tone="neutral">Catalog</StatusPill>}
    >
      <div className="mosc-models">
        <div className="mosc-models-header">
          <p className="mosc-models-description">
            Manage custom model providers. Once configured, they can be selected during chat.
          </p>
          <div className="mosc-models-actions">
            <button
              type="button"
              className="mosc-button mosc-button--ghost"
              data-testid="mosms-refresh"
              onClick={() => {
                onNote('The catalog is frozen to the substrate builtin roster — GLM-5.3 through GLM-4V-Flash. Nothing to refresh.');
              }}
            >
              {REFRESH_GLYPH}
              Refresh
            </button>
            <button
              type="button"
              className="mosc-button mosc-button--ghost"
              data-testid="mosms-add-provider"
              onClick={() => {
                onNote('Preset providers only in this release — Z.ai and BigModel are built in. Custom providers arrive with a connected substrate account.');
              }}
            >
              {PLUS_GLYPH}
              Add provider
            </button>
          </div>
        </div>

        {receipt !== null ? <ReceiptLine tone="attention">{receipt}</ReceiptLine> : null}

        <div className="mosc-models-split">
          <nav className="mosc-models-nav" aria-label="Model providers">
            <p className="mosc-models-nav-group">Providers</p>
            {MOS_MODEL_PROVIDER_FAMILIES.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                data-testid={`mosms-family-${candidate.id}`}
                aria-current={candidate.id === family?.id ? 'true' : undefined}
                className={
                  candidate.id === family?.id
                    ? 'mosc-models-family is-active'
                    : 'mosc-models-family'
                }
                onClick={() => {
                  onSelectFamily(candidate.id);
                }}
              >
                {FAMILY_GLYPH}
                <span className="mosc-models-family-name">{candidate.display}</span>
                <span className="mosc-models-family-host">{candidate.host}</span>
              </button>
            ))}
            <p className="mosc-models-nav-group">Custom providers</p>
            <p className="mosc-models-nav-empty" data-testid="mosms-custom-empty">
              No custom providers.
            </p>
          </nav>

          <div className="mosc-models-detail" data-testid="mosms-detail">
            <div className="mosc-models-family-header">
              <h2 className="mosc-models-family-title">{family?.display}</h2>
              <p className="mosc-models-family-line">{family?.line}</p>
              <div className="mosc-models-mode">
                <label
                  className="mosc-models-mode-label"
                  htmlFor="mosms-connection-mode"
                >
                  Connection mode
                </label>
                <select
                  id="mosms-connection-mode"
                  className="mosc-nt-modeselect"
                  data-testid="mosms-connection-mode"
                  value={draft.connectionMode}
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
                {connectionMode !== undefined && connectionMode.badge !== null ? (
                  <span className="mosc-badge mosc-badge--plan">{connectionMode.badge}</span>
                ) : null}
              </div>
            </div>

            <div className="mosc-models-listcard" data-testid="mosms-model-list">
              <div className="mosc-models-listcard-head">
                <h3 className="mosc-models-listcard-title">Model list</h3>
                <span className="mosc-models-count" data-testid="mosms-count">
                  {MOS_AGENT_MODEL_CATALOG.length} models · {enabledCount} enabled
                </span>
                <button
                  type="button"
                  className="mosc-button mosc-button--ghost"
                  data-testid="mosms-add-model"
                  onClick={() => {
                    onNote('The roster is frozen to the substrate builtin catalog — GLM-5.3 through GLM-4V-Flash. Models arrive with substrate catalog updates, not workspace adds.');
                  }}
                >
                  {PLUS_GLYPH}
                  Add model
                </button>
              </div>

              {enabledCount === 0 ? (
                <p className="mosc-models-empty">
                  No models are configured. Add a model to use it in chat.
                </p>
              ) : (
                <ul className="mosc-models-rows">
                  {MOS_AGENT_MODEL_CATALOG.map((model) => {
                    const enabled = !disabledModels.includes(model.id);
                    const inCurrentMode =
                      connectionMode?.modelIds.includes(model.id) ?? false;
                    return (
                      <li
                        key={model.id}
                        className={enabled ? 'mosc-models-row' : 'mosc-models-row is-disabled'}
                        data-testid="mosms-model-row"
                        data-model-id={model.id}
                      >
                        <span className="mosc-models-row-name">{model.id}</span>
                        <span className="mosc-badge mosc-badge--context" aria-label={`Context window: ${mosModelContextBadge(model.contextTokens)}`}>
                          {mosModelContextBadge(model.contextTokens)}
                        </span>
                        {mosModelVisionBadgeVisible(model.id, draft.connectionMode) ? (
                          <span className="mosc-badge mosc-badge--vision">Vision</span>
                        ) : null}
                        <span className="mosc-models-row-reasoning">
                          {mosModelReasoningLine(model)}
                        </span>
                        {model.plans.length > 0 ? (
                          <span className="mosc-models-row-plans">{model.plans.join(' · ')}</span>
                        ) : null}
                        {draft.modelId === model.id ? (
                          <span className="mosc-models-row-current" data-testid="mosms-current-model">
                            in composer
                          </span>
                        ) : null}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          aria-label={enabled ? `Disable ${model.id}` : `Enable ${model.id}`}
                          data-testid="mosms-model-toggle"
                          data-model-id={model.id}
                          className={enabled ? 'mosc-switch is-on' : 'mosc-switch'}
                          onClick={() => {
                            onToggleModel(model.id, !enabled);
                          }}
                        >
                          <span className="mosc-switch-knob" aria-hidden="true" />
                        </button>
                        {!inCurrentMode && enabled ? (
                          <span className="mosc-models-row-scope">not on {connectionMode?.label ?? 'this mode'}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <HonestyLine>
              The roster mirrors the substrate's frozen builtin catalog (config/provider/zcode-builtin.json).
              Enable state and the composer selection are workspace records; no live provider account is
              connected in this release — {mosAgentModel('GLM-5.3') !== undefined ? 'GLM-5.3' : 'the flagship'} through
              GLM-4V-Flash, exactly as the substrate ships them.
            </HonestyLine>
          </div>
        </div>
      </div>
    </SectionScaffold>
  );
}
