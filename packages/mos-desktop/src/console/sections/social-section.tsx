/**
 * The SOCIAL section (running social media): the channel list with
 * honest account states, the composer (platform / schedule / mission /
 * content), the calendar queue (scheduled + drafts), and the
 * five-platform capability matrix — support verdicts verbatim from the
 * frozen provider profiles (supported / unknown — observation pending /
 * unsupported — fails closed). Presentation-only, hook-free.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import {
  MOS_SOCIAL_CAPABILITY_MATRIX,
  MOS_SOCIAL_PLATFORMS,
  type MosPostComposerInput,
  type MosWorkspaceSnapshot,
} from '../workspace-store.js';
import { ConsoleCard, Field, HonestyLine, ReceiptLine, SectionScaffold, StatusPill, formatWhen } from './shared.js';

const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  'facebook-pages': 'Facebook Pages',
  tiktok: 'TikTok',
  x: 'X',
};

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

export interface SocialSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** The composer submit (draft or schedule — the store routes it). */
  readonly onCompose: (input: MosPostComposerInput) => void;
  /** Schedule an existing draft. */
  readonly onSchedule: (id: string, when: string) => void;
  /** The most recent composer receipt. */
  readonly receipt: string | null;
}

export function SocialSection({ section, workspace, onCompose, onSchedule, receipt }: SocialSectionProps) {
  const scheduled = workspace.posts.filter((post) => post.status === 'SCHEDULED');
  const drafts = workspace.posts.filter((post) => post.status === 'DRAFT');
  return (
    <SectionScaffold
      section={section}
      headerAside={<StatusPill tone="neutral">{workspace.posts.length} posts</StatusPill>}
    >
      <ConsoleCard
        id="mosc-social-channels"
        title="Channels"
        note="The five-platform workspace. Account states are honest: nothing is connected until a real transport exists."
        aside={<StatusPill tone="unknown">no live transport bound</StatusPill>}
      >
        <ul className="mosc-channel-list">
          {MOS_SOCIAL_PLATFORMS.map((platform) => {
            const account = workspace.accounts.find((entry) => entry.providerId === platform);
            const status = account === undefined ? 'NOT_CONNECTED' : account.status;
            return (
              <li key={platform} className="mosc-channel-row" data-testid={`mosc-channel-${platform}`}>
                <span className="mosc-channel-name">{platformLabel(platform)}</span>
                <StatusPill tone={account === undefined ? 'neutral' : 'attention'}>{status}</StatusPill>
              </li>
            );
          })}
        </ul>
        <HonestyLine>
          No live social accounts are connected — publishing awaits the production MOS service transport. Drafts and schedules
          are workspace records, never platform actions.
        </HonestyLine>
      </ConsoleCard>

      <ConsoleCard
        id="mosc-social-composer"
        title="Composer"
        note="Draft now, or schedule for a slot. The post lands in the queue as a workspace record with its platform and mission link."
      >
        <form
          className="mosc-form"
          data-testid="mosc-social-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const scheduledFor = String(data.get('scheduledFor') ?? '').trim();
            onCompose({
              platform: String(data.get('platform') ?? ''),
              missionId: String(data.get('missionId') ?? '') || null,
              content: String(data.get('content') ?? ''),
              scheduledFor: scheduledFor.length === 0 ? null : scheduledFor,
            });
            event.currentTarget.reset();
          }}
        >
          <div className="mosc-form-grid">
            <Field label="Platform" htmlFor="mosc-social-platform">
              <select id="mosc-social-platform" name="platform" className="mosc-input mosc-select" defaultValue="youtube">
                {MOS_SOCIAL_PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platformLabel(platform)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mission link" htmlFor="mosc-social-mission" hint="Optional — ties the post to a declared objective.">
              <select id="mosc-social-mission" name="missionId" className="mosc-input mosc-select" defaultValue="">
                <option value="">— none —</option>
                {workspace.missions.map((mission) => (
                  <option key={mission.id} value={mission.id}>
                    {mission.id} · {mission.statement.slice(0, 42)}
                    {mission.statement.length > 42 ? '…' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Content" htmlFor="mosc-social-content">
            <textarea
              id="mosc-social-content"
              name="content"
              className="mosc-input mosc-textarea"
              rows={3}
              placeholder="Pop-up teaser 01 — the venue reveal. Accra, mark the date."
              data-testid="mosc-social-content"
            />
          </Field>
          <div className="mosc-form-grid mosc-form-grid--tail">
            <Field label="Schedule (optional)" htmlFor="mosc-social-when" hint="Empty = a draft; a slot = SCHEDULED in the queue.">
              <input
                id="mosc-social-when"
                name="scheduledFor"
                className="mosc-input"
                placeholder="2026-10-27T18:00"
                data-testid="mosc-social-when"
              />
            </Field>
            <div className="mosc-field mosc-field--actions">
              <button type="submit" className="mosc-button mosc-button--primary" data-testid="mosc-social-submit">
                Record post
              </button>
            </div>
          </div>
        </form>
        {receipt !== null ? <ReceiptLine>{receipt}</ReceiptLine> : null}
        <HonestyLine>Recording is all this does — the composer never publishes and never simulates a platform response.</HonestyLine>
      </ConsoleCard>

      <ConsoleCard
        id="mosc-social-queue"
        title="Calendar queue"
        note={`Scheduled first, then drafts. ${scheduled.length} scheduled · ${drafts.length} drafts.`}
      >
        {workspace.posts.length === 0 ? (
          <p className="mosc-line">The queue is empty — the composer above records the first post.</p>
        ) : (
          <ul className="mosc-registry" data-testid="mosc-social-queue">
            {[...scheduled, ...drafts].map((post) => (
              <li key={post.id} className="mosc-registry-row" data-testid={`mosc-post-${post.id}`}>
                <span className="mosc-registry-main">
                  <strong>
                    {platformLabel(post.platform)}
                    {post.missionId !== null ? ` · ${post.missionId}` : ''}
                  </strong>
                  <span className="mosc-registry-meta">{post.content}</span>
                  <span className="mosc-registry-meta mosc-registry-meta--dim">
                    {post.id} · recorded {formatWhen(post.createdAt)}
                    {post.scheduledFor !== null ? ` · slot ${post.scheduledFor}` : ''}
                  </span>
                  {post.status === 'DRAFT' ? (
                    <form
                      className="mosc-inline-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const when = String(data.get('when') ?? '').trim();
                        if (when.length > 0) {
                          onSchedule(post.id, when);
                        }
                      }}
                    >
                      <input name="when" className="mosc-input mosc-input--sm" placeholder="2026-10-27T18:00" aria-label={`Schedule ${post.id} for`} />
                      <button type="submit" className="mosc-button mosc-button--ghost mosc-button--sm">
                        Schedule
                      </button>
                    </form>
                  ) : null}
                </span>
                <StatusPill tone={post.status === 'SCHEDULED' ? 'attention' : 'neutral'}>{post.status}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </ConsoleCard>

      <ConsoleCard
        id="mosc-social-matrix"
        title="Capability matrix"
        note="The frozen provider profiles' support verdicts, verbatim — this release binds no live transport, so the matrix is the capability truth."
        aside={<StatusPill tone="neutral">Reference</StatusPill>}
      >
        <div className="mosc-matrix-scroll">
          <table className="mosc-matrix">
            <caption className="mosc-sr-only">Social platform capability verdicts by operation</caption>
            <thead>
              <tr>
                <th scope="col">Platform</th>
                <th scope="col">publish</th>
                <th scope="col">schedule</th>
                <th scope="col">read-observations</th>
                <th scope="col">delete</th>
                <th scope="col">list-restrictions</th>
              </tr>
            </thead>
            <tbody>
              {MOS_SOCIAL_CAPABILITY_MATRIX.map((row) => (
                <tr key={row.platform} data-testid={`mosc-matrix-${row.platform}`}>
                  <th scope="row">{platformLabel(row.platform)}</th>
                  {row.verdicts.map((verdict) => (
                    <td key={verdict.operation} className={`mosc-matrix-cell mosc-matrix-cell--${verdict.support}`}>
                      <span className="mosc-sr-only">{verdict.operation}: </span>
                      {verdict.support === 'supported' ? 'supported' : verdict.support === 'unknown' ? 'unknown — observation pending' : 'unsupported — fails closed'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <HonestyLine>
          `unknown` is a first-class verdict — never coerced to supported. An unsupported operation fails closed before any
          provider interaction.
        </HonestyLine>
      </ConsoleCard>
    </SectionScaffold>
  );
}
