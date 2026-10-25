/**
 * The OVERVIEW section (the outcome-first home, payswap-pattern): "What
 * should MOS accomplish?" — the intake that prefills the mission
 * declaration (the convergence law: every entry point leads to ONE typed
 * intent controller), the four OUTCOME cards (PROMOTE / PUBLISH / GROW /
 * MEASURE), the live attention card (pending arm gates — REAL decisions),
 * missions in progress, and the recent activity tail. Presentation-only,
 * hook-free.
 */

import { MOS_ACTION_SET, type MosActionId, type MosConsoleSectionId, type MosConsoleSectionRecord } from '../console-nav.js';
import type { MosWorkspaceSnapshot } from '../workspace-store.js';
import { ConsoleCard, HonestyLine, ReceiptLine, SectionScaffold, StatusPill, formatWhen } from './shared.js';

export interface OverviewSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** The intake submit: the statement prefills the mission declaration. */
  readonly onIntake: (statement: string) => void;
  /** An outcome card activation (the typed action set). */
  readonly onAction: (action: MosActionId) => void;
  /** Cross-section navigation (missions registry rows, activity tail). */
  readonly onNavigate: (section: MosConsoleSectionId) => void;
  /** The attention card's REAL decisions (the pending arm gates). */
  readonly onDecideApproval: (id: string, decision: 'approve' | 'deny') => void;
  /** The most recent intake receipt (echoed under the intake card). */
  readonly intakeReceipt: string | null;
}

export function OverviewSection({
  section,
  workspace,
  onIntake,
  onAction,
  onNavigate,
  onDecideApproval,
  intakeReceipt,
}: OverviewSectionProps) {
  const pendingApprovals = workspace.approvals.filter((approval) => approval.status === 'PENDING');
  const missionsInProgress = workspace.missions.slice(0, 4);
  const recentEvents = workspace.events.slice(-6).reverse();
  return (
    <SectionScaffold section={section}>
      <div className="mosc-overview-grid">
        <ConsoleCard
          id="mosc-overview-intake"
          title="What should MOS accomplish?"
          note="Declare a goal in your own words. MOS records the intent, prefills the mission declaration, and takes it from there."
        >
          <form
            className="mosc-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const statement = String(data.get('statement') ?? '').trim();
              if (statement.length > 0) {
                onIntake(statement);
                event.currentTarget.reset();
              }
            }}
          >
            <div className="mosc-field">
              <label className="mosc-field-label" htmlFor="mosc-overview-intake-input">
                The objective
              </label>
              <textarea
                id="mosc-overview-intake-input"
                name="statement"
                className="mosc-input mosc-textarea"
                rows={3}
                placeholder="Sell out the Accra pop-up through TikTok teasers"
                data-testid="mosc-overview-intake-input"
              />
            </div>
            <button type="submit" className="mosc-button mosc-button--primary" data-testid="mosc-overview-intake-submit">
              Declare mission
            </button>
          </form>
          {intakeReceipt !== null ? <ReceiptLine>{intakeReceipt}</ReceiptLine> : null}
          <HonestyLine>
            Recording an intent is all this does — MOS never invents capability around it. The mission lands INTENT_RECORDED; the
            loop's next rungs are the authorities' to compute.
          </HonestyLine>
        </ConsoleCard>

        <div className="mosc-outcome-cards" role="list" aria-label="Outcome actions">
          {MOS_ACTION_SET.map((action) => (
            <button
              key={action.id}
              type="button"
              role="listitem"
              className="mosc-outcome-card"
              data-testid={`mosc-action-${action.id}`}
              onClick={() => onAction(action.id)}
            >
              <span className="mosc-outcome-label">{action.label}</span>
              <span className="mosc-outcome-line">{action.line}</span>
            </button>
          ))}
        </div>

        {pendingApprovals.length > 0 ? (
          <ConsoleCard
            id="mosc-overview-attention"
            title="Needs a decision"
            aside={<StatusPill tone="attention">{pendingApprovals.length} pending</StatusPill>}
            note="Arm gates waiting on a human authorization. Approving arms the campaign in this workspace — live spend still awaits a connected ad transport."
          >
            <ul className="mosc-attention-list">
              {pendingApprovals.map((approval) => {
                const campaign = workspace.campaigns.find((entry) => entry.id === approval.campaignId);
                return (
                  <li key={approval.id} className="mosc-attention-row" data-testid={`mosc-attention-${approval.id}`}>
                    <span className="mosc-attention-line">
                      Arm gate for <strong>{campaign === undefined ? approval.campaignId : campaign.objective}</strong>
                      {campaign !== undefined ? ` — ${campaign.platform}, budget ${campaign.budget}` : ''}
                    </span>
                    <span className="mosc-attention-actions">
                      <button
                        type="button"
                        className="mosc-button mosc-button--primary mosc-button--sm"
                        data-testid={`mosc-attention-approve-${approval.id}`}
                        onClick={() => onDecideApproval(approval.id, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="mosc-button mosc-button--ghost mosc-button--sm"
                        onClick={() => onDecideApproval(approval.id, 'deny')}
                      >
                        Deny
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </ConsoleCard>
        ) : null}

        <ConsoleCard
          id="mosc-overview-missions"
          title="Missions in progress"
          aside={<StatusPill tone="neutral">{workspace.missions.length} recorded</StatusPill>}
          note="The declared objectives, newest first."
        >
          {missionsInProgress.length === 0 ? (
            <p className="mosc-line">No missions recorded yet — the intake above is the honest first step.</p>
          ) : (
            <ul className="mosc-registry">
              {missionsInProgress.map((mission) => (
                <li key={mission.id} className="mosc-registry-row">
                  <span className="mosc-registry-main">
                    <strong>{mission.statement}</strong>
                    <span className="mosc-registry-meta">
                      {mission.direction} · {mission.metric} · target {mission.target}
                      {mission.horizon.length > 0 ? ` · ${mission.horizon}` : ''}
                    </span>
                  </span>
                  <StatusPill tone="info">{mission.status}</StatusPill>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="mosc-button mosc-button--ghost mosc-button--sm" onClick={() => onNavigate('missions')}>
            All missions →
          </button>
        </ConsoleCard>

        <ConsoleCard id="mosc-overview-activity" title="Recent activity" note="The append-only timeline, newest first.">
          {recentEvents.length === 0 ? (
            <p className="mosc-line">Nothing recorded yet — the timeline carries every workspace decision, verbatim.</p>
          ) : (
            <ul className="mosc-timeline">
              {recentEvents.map((event) => (
                <li key={event.id} className="mosc-timeline-row">
                  <span className="mosc-timeline-when">{formatWhen(event.at)}</span>
                  <span className="mosc-timeline-line">{event.line}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="mosc-button mosc-button--ghost mosc-button--sm" onClick={() => onNavigate('activity')}>
            Full activity →
          </button>
        </ConsoleCard>
      </div>
    </SectionScaffold>
  );
}
