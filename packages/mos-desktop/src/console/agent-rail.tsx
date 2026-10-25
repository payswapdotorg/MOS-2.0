/**
 * The MOS agent EXPERIENCE (the floating rail + dock + panel — the
 * payswap AgentExperience pattern beside the console): the entry rail
 * with the typed action chips (PROMOTE / PUBLISH / GROW / MEASURE) plus
 * the "Connect YouTube" affordance and the dismissible guidance note;
 * the gradient dock with the live task badge; and the panel with the
 * transcript log, the Enter-sends composer, and the pinned
 * zero-authority footer. Presentation-only, hook-free — the shell entry
 * owns the open state, the transcript, and the guidance-dismissal state.
 */

import { MOS_ACTION_SET } from './console-nav.js';
import type { MosWorkspaceSnapshot } from './workspace-store.js';
import { formatWhen } from './sections/shared.js';

/** One transcript entry (the entry appends; the panel renders). */
export interface MosAgentTranscriptEntry {
  readonly id: number;
  readonly role: 'user' | 'mos';
  readonly text: string;
  readonly at: string;
}

export interface MosAgentRailProps {
  readonly workspace: MosWorkspaceSnapshot;
  /** The typed action chip activation — routes through the SAME typed-intent controller as free text. */
  readonly onSubmitText: (text: string) => void;
  /** Open/close the panel (the dock toggle). */
  readonly onToggleOpen: () => void;
  /** The guidance note's dismissal. */
  readonly onDismissGuidance: () => void;
  /** Whether the guidance note still shows. */
  readonly guidanceVisible: boolean;
  /** Whether the panel is open. */
  readonly open: boolean;
  /** The transcript (rendered top-down, oldest first). */
  readonly transcript: readonly MosAgentTranscriptEntry[];
}

export function MosAgentRail({
  workspace,
  onSubmitText,
  onToggleOpen,
  onDismissGuidance,
  guidanceVisible,
  open,
  transcript,
}: MosAgentRailProps) {
  const pendingGates = workspace.approvals.filter((approval) => approval.status === 'PENDING').length;
  const latestMission = workspace.missions[0] ?? null;
  return (
    <aside className="mosc-agent" aria-label="MOS agent" data-testid="mosc-agent-rail">
      {guidanceVisible ? (
        <div className="mosc-agent-guidance" data-testid="mosc-agent-guidance">
          <p className="mosc-agent-guidance-line">
            I record requests and progress only — I never publish, never spend, never enter credentials. Try an outcome below
            or just type.
          </p>
          <button
            type="button"
            className="mosc-agent-guidance-dismiss"
            aria-label="Dismiss the guidance note"
            onClick={onDismissGuidance}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="mosc-agent-chips" role="group" aria-label="Typed outcome actions">
        {MOS_ACTION_SET.map((action) => (
          <button
            key={action.id}
            type="button"
            className="mosc-agent-chip"
            data-testid={`mosc-agent-chip-${action.id}`}
            onClick={() => onSubmitText(action.label)}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className="mosc-agent-chip mosc-agent-chip--connect"
          data-testid="mosc-agent-chip-connect"
          onClick={() => onSubmitText('Connect YouTube')}
        >
          + Connect YouTube
        </button>
      </div>

      <button
        type="button"
        className="mosc-agent-dock"
        data-testid="mosc-agent-dock"
        aria-expanded={open ? 'true' : 'false'}
        onClick={onToggleOpen}
      >
        <span className="mosc-agent-dock-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" focusable="false">
            <rect width="32" height="32" rx="9" fill="#0e8066" />
            <path
              d="M10 11h12M10 16h8M13 21h6"
              stroke="#f7f9fb"
              strokeWidth="2.6"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </span>
        <span className="mosc-agent-dock-label">Ask MOS</span>
        {pendingGates > 0 ? (
          <span className="mosc-agent-dock-badge" data-testid="mosc-agent-dock-badge">
            {pendingGates}
          </span>
        ) : null}
      </button>

      {open ? (
        <section className="mosc-agent-panel" aria-label="The MOS agent panel" data-testid="mosc-agent-panel">
          <header className="mosc-agent-panel-head">
            <h2 className="mosc-agent-panel-title">MOS agent</h2>
            <button type="button" className="mosc-agent-panel-close" aria-label="Close the agent panel" onClick={onToggleOpen}>
              ×
            </button>
          </header>
          <div className="mosc-agent-tasks">
            {pendingGates > 0 ? (
              <div className="mosc-agent-task mosc-agent-task--attention">
                <strong>{pendingGates} arm gate(s) pending</strong>
                <span>Your authorization is the transition — Activity carries the decisions.</span>
              </div>
            ) : null}
            {latestMission !== null ? (
              <div className="mosc-agent-task">
                <strong>Latest mission</strong>
                <span>
                  {latestMission.statement} — {latestMission.status}
                </span>
              </div>
            ) : (
              <div className="mosc-agent-task">
                <strong>No missions yet</strong>
                <span>Declare one from Home — I record it, the authorities take it from there.</span>
              </div>
            )}
          </div>
          <div className="mosc-agent-transcript" data-testid="mosc-agent-transcript">
            {transcript.length === 0 ? (
              <p className="mosc-agent-transcript-empty">
                Nothing asked yet. A typed outcome (promote / publish / grow / measure) or a connection request lands here with
                my honest reply.
              </p>
            ) : (
              transcript.map((entry) => (
                <div key={entry.id} className={`mosc-agent-bubble mosc-agent-bubble--${entry.role}`}>
                  <span className="mosc-agent-bubble-role">{entry.role === 'user' ? 'You' : 'MOS'}</span>
                  <p className="mosc-agent-bubble-text">{entry.text}</p>
                  <span className="mosc-agent-bubble-when">{formatWhen(entry.at)}</span>
                </div>
              ))
            )}
          </div>
          <form
            className="mosc-agent-composer"
            data-testid="mosc-agent-composer"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem('text');
              if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
                const text = input.value.trim();
                if (text.length > 0) {
                  onSubmitText(text);
                  input.value = '';
                }
              }
            }}
          >
            <label className="mosc-sr-only" htmlFor="mosc-agent-input">
              Ask MOS
            </label>
            <input
              id="mosc-agent-input"
              name="text"
              className="mosc-input mosc-agent-input"
              placeholder="promote the pop-up on TikTok…"
              autoComplete="off"
              data-testid="mosc-agent-input"
            />
            <button type="submit" className="mosc-button mosc-button--primary mosc-button--sm" data-testid="mosc-agent-send">
              Send
            </button>
          </form>
          <p className="mosc-agent-zero-authority">
            Zero authority: I record requests and progress only — never publish, never spend, never credentials.
          </p>
        </section>
      ) : null}
    </aside>
  );
}
