/**
 * The MISSIONS section: the full mission intake (direction, statement,
 * reward metric from the CLOSED 17-metric vocabulary, target + horizon,
 * audience, constraints) and the mission registry with status pills.
 * The intake supports PREFILL (the convergence law — the overview's
 * intake and the typed outcome actions land here with the form keyed to
 * the prefill so the defaults take). Presentation-only, hook-free.
 */

import {
  MOS_ACTION_SET,
  type MosConsoleSectionRecord,
} from '../console-nav.js';
import {
  MOS_MISSION_DIRECTIONS,
  MOS_REWARD_METRIC_VOCABULARY,
  type MosMissionIntakeInput,
  type MosWorkspaceSnapshot,
} from '../workspace-store.js';
import { ConsoleCard, Field, HonestyLine, ReceiptLine, SectionScaffold, StatusPill, formatWhen } from './shared.js';

/** The prefill the convergence law delivers (absent = a clean form). */
export interface MosMissionPrefill {
  readonly direction: string;
  readonly statement: string;
}

export interface MissionsSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** The declared-intent submit (the shell routes it to the workspace store). */
  readonly onDeclare: (input: MosMissionIntakeInput) => void;
  /** The prefill from the outcome-first entries (keyed remount applies it). */
  readonly prefill: MosMissionPrefill | null;
  /** Bumped on every prefill delivery so the form remounts with new defaults. */
  readonly prefillKey: number;
  /** The most recent declaration receipt (echoed under the intake). */
  readonly receipt: string | null;
}

export function MissionsSection({ section, workspace, onDeclare, prefill, prefillKey, receipt }: MissionsSectionProps) {
  const defaultDirection = prefill === null ? 'promote' : prefill.direction;
  const defaultStatement = prefill === null ? '' : prefill.statement;
  return (
    <SectionScaffold
      section={section}
      headerAside={<StatusPill tone="neutral">{workspace.missions.length} recorded</StatusPill>}
    >
      <ConsoleCard
        id="mosc-missions-intake"
        title="Declare a mission"
        note="Every field is explicit — the reward metric comes from the closed vocabulary, the target is what success means, and the audience is who this is for."
      >
        <form
          key={prefillKey}
          className="mosc-form"
          data-testid="mosc-missions-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            onDeclare({
              direction: String(data.get('direction') ?? ''),
              statement: String(data.get('statement') ?? ''),
              metric: String(data.get('metric') ?? ''),
              target: String(data.get('target') ?? ''),
              horizon: String(data.get('horizon') ?? ''),
              audience: String(data.get('audience') ?? ''),
              constraints: String(data.get('constraints') ?? ''),
            });
            event.currentTarget.reset();
          }}
        >
          <div className="mosc-form-grid">
            <Field label="Direction" htmlFor="mosc-missions-direction" hint="The typed action the mission serves.">
              <select id="mosc-missions-direction" name="direction" className="mosc-input mosc-select" defaultValue={defaultDirection}>
                {MOS_ACTION_SET.map((action) => (
                  <option key={action.id} value={action.direction}>
                    {action.label} — {action.line}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reward metric" htmlFor="mosc-missions-metric" hint="The closed 17-metric vocabulary — never a free-text metric.">
              <select id="mosc-missions-metric" name="metric" className="mosc-input mosc-select" defaultValue="qualified-reach">
                {MOS_REWARD_METRIC_VOCABULARY.map((metric) => (
                  <option key={metric.id} value={metric.id}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Objective statement" htmlFor="mosc-missions-statement">
            <textarea
              id="mosc-missions-statement"
              name="statement"
              className="mosc-input mosc-textarea"
              rows={2}
              defaultValue={defaultStatement}
              placeholder="Sell out the Accra pop-up through TikTok teasers"
              data-testid="mosc-missions-statement"
            />
          </Field>
          <div className="mosc-form-grid">
            <Field label="Target" htmlFor="mosc-missions-target" hint="What success means, measurably.">
              <input
                id="mosc-missions-target"
                name="target"
                className="mosc-input"
                placeholder="Sold-out show — 600 tickets"
                data-testid="mosc-missions-target"
              />
            </Field>
            <Field label="Horizon" htmlFor="mosc-missions-horizon">
              <input id="mosc-missions-horizon" name="horizon" className="mosc-input" placeholder="3 weeks" />
            </Field>
          </div>
          <div className="mosc-form-grid">
            <Field label="Audience" htmlFor="mosc-missions-audience">
              <input id="mosc-missions-audience" name="audience" className="mosc-input" placeholder="Accra 18–30, afrobe and night-life" />
            </Field>
            <Field label="Constraints" htmlFor="mosc-missions-constraints">
              <input id="mosc-missions-constraints" name="constraints" className="mosc-input" placeholder="No paid boost before the arm gate" />
            </Field>
          </div>
          <button type="submit" className="mosc-button mosc-button--primary" data-testid="mosc-missions-submit">
            Declare mission
          </button>
        </form>
        {receipt !== null ? <ReceiptLine>{receipt}</ReceiptLine> : null}
        <HonestyLine>
          The declaration lands INTENT_RECORDED — an append-only record. The Missions authority owns validation and the lifecycle
          rungs after that; this workspace never rewrites a declared mission.
        </HonestyLine>
      </ConsoleCard>

      <ConsoleCard id="mosc-missions-registry" title="Mission registry" note="Newest first — status pills carry the lifecycle truth.">
        {workspace.missions.length === 0 ? (
          <p className="mosc-line">No missions recorded yet — the intake above is the honest first step.</p>
        ) : (
          <ul className="mosc-registry" data-testid="mosc-missions-registry">
            {workspace.missions.map((mission) => (
              <li key={mission.id} className="mosc-registry-row" data-testid={`mosc-mission-${mission.id}`}>
                <span className="mosc-registry-main">
                  <strong>{mission.statement}</strong>
                  <span className="mosc-registry-meta">
                    {mission.direction} · reward {mission.metric} · target {mission.target}
                    {mission.horizon.length > 0 ? ` · ${mission.horizon}` : ''}
                    {mission.audience.length > 0 ? ` · ${mission.audience}` : ''}
                  </span>
                  <span className="mosc-registry-meta mosc-registry-meta--dim">
                    {mission.id} · declared {formatWhen(mission.createdAt)}
                    {mission.constraints.length > 0 ? ` · constraint: ${mission.constraints}` : ''}
                  </span>
                </span>
                <StatusPill tone={mission.status === 'INTENT_RECORDED' ? 'info' : 'ok'}>{mission.status}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </ConsoleCard>

      <ConsoleCard
        id="mosc-missions-vocabulary"
        title="The reward vocabulary"
        note="The closed 17-metric vocabulary the Missions authority accepts — rendered as reference, never as live data."
        aside={<StatusPill tone="neutral">Reference</StatusPill>}
      >
        <ul className="mosc-vocab-list">
          {MOS_REWARD_METRIC_VOCABULARY.map((metric) => (
            <li key={metric.id} className="mosc-vocab-row">
              {metric.label}
            </li>
          ))}
        </ul>
        <p className="mosc-honesty-line">
          Directions: {MOS_MISSION_DIRECTIONS.join(' / ')} — the typed action set. A metric outside this vocabulary is a
          validation failure, not a silent default.
        </p>
      </ConsoleCard>
    </SectionScaffold>
  );
}
