/**
 * The ACTIVITY section: the approvals queue with REAL decisions (an
 * approval cascades the campaign to ARMED and records the event; a
 * denial is relayed verbatim) and the append-only event timeline. The
 * approvals queue is the arm-gate surface — THE human authorization
 * transition of the write-intent workflow. Presentation-only,
 * hook-free.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import type { MosWorkspaceSnapshot } from '../workspace-store.js';
import { ConsoleCard, HonestyLine, SectionScaffold, StatusPill, formatWhen } from './shared.js';

const APPROVAL_TONES: Readonly<Record<string, 'attention' | 'ok' | 'failure'>> = {
  PENDING: 'attention',
  APPROVED: 'ok',
  DENIED: 'failure',
};

export interface ActivitySectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** The REAL decisions — approve cascades ARMED; deny relays verbatim. */
  readonly onDecideApproval: (id: string, decision: 'approve' | 'deny') => void;
}

export function ActivitySection({ section, workspace, onDecideApproval }: ActivitySectionProps) {
  const pending = workspace.approvals.filter((approval) => approval.status === 'PENDING');
  const decided = workspace.approvals.filter((approval) => approval.status !== 'PENDING');
  const events = [...workspace.events].reverse();
  return (
    <SectionScaffold
      section={section}
      headerAside={<StatusPill tone={pending.length > 0 ? 'attention' : 'neutral'}>{pending.length} pending gates</StatusPill>}
    >
      <ConsoleCard
        id="mosc-activity-approvals"
        title="Approvals queue"
        note="Arm gates waiting on a human decision. Approving arms the campaign in this workspace — the live spend still awaits a connected ad transport; denying relays the denial verbatim."
      >
        {pending.length === 0 && decided.length === 0 ? (
          <p className="mosc-line">No approvals recorded — compile a campaign to open its arm gate.</p>
        ) : (
          <ul className="mosc-registry" data-testid="mosc-approvals">
            {[...pending, ...decided].map((approval) => {
              const campaign = workspace.campaigns.find((entry) => entry.id === approval.campaignId);
              return (
                <li key={approval.id} className="mosc-registry-row" data-testid={`mosc-approval-${approval.id}`}>
                  <span className="mosc-registry-main">
                    <strong>
                      Arm gate — {campaign === undefined ? approval.campaignId : campaign.objective}
                      {campaign !== undefined ? ` (${campaign.platform}, budget ${campaign.budget})` : ''}
                    </strong>
                    <span className="mosc-registry-meta mosc-registry-meta--dim">
                      {approval.id} · opened {formatWhen(approval.createdAt)}
                      {approval.decidedAt !== null ? ` · decided ${formatWhen(approval.decidedAt)}` : ''}
                    </span>
                  </span>
                  {approval.status === 'PENDING' ? (
                    <span className="mosc-attention-actions">
                      <button
                        type="button"
                        className="mosc-button mosc-button--primary mosc-button--sm"
                        data-testid={`mosc-approve-${approval.id}`}
                        onClick={() => onDecideApproval(approval.id, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="mosc-button mosc-button--ghost mosc-button--sm"
                        data-testid={`mosc-deny-${approval.id}`}
                        onClick={() => onDecideApproval(approval.id, 'deny')}
                      >
                        Deny
                      </button>
                    </span>
                  ) : (
                    <StatusPill tone={APPROVAL_TONES[approval.status] ?? 'neutral'}>{approval.status}</StatusPill>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <HonestyLine>
          Arm-run is THE human authorization transition — nothing arms itself, and no later rung reports progress without it.
        </HonestyLine>
      </ConsoleCard>

      <ConsoleCard
        id="mosc-activity-timeline"
        title="Timeline"
        note="The append-only event ledger, newest first — every workspace decision, verbatim."
      >
        {events.length === 0 ? (
          <p className="mosc-line">Nothing recorded yet.</p>
        ) : (
          <ul className="mosc-timeline mosc-timeline--long" data-testid="mosc-timeline">
            {events.map((event) => (
              <li key={event.id} className="mosc-timeline-row">
                <span className="mosc-timeline-when">{formatWhen(event.at)}</span>
                <span className="mosc-timeline-kind">{event.kind}</span>
                <span className="mosc-timeline-line">{event.line}</span>
              </li>
            ))}
          </ul>
        )}
      </ConsoleCard>
    </SectionScaffold>
  );
}
