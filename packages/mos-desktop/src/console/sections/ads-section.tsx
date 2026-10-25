/**
 * The ADS section: paid promotion runs through missions — the budget
 * ledger cards, the campaign intake (platform, objective from the reward
 * vocabulary, EXPLICIT budget + daily cap, audience, mission link), the
 * campaign registry with the full lifecycle pills (DRAFT → COMPILED →
 * ARMED) and SIMULATION-labelled counterfactual results (measured
 * results stay absent until a live ad transport exists), and the
 * ad-platform catalogue. Presentation-only, hook-free.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import {
  MOS_AD_PLATFORMS,
  MOS_REWARD_METRIC_VOCABULARY,
  type MosCampaignIntakeInput,
  type MosWorkspaceSnapshot,
} from '../workspace-store.js';
import { ConsoleCard, Field, HonestyLine, ReceiptLine, SectionScaffold, StatusPill, formatWhen } from './shared.js';

const AD_PLATFORM_LABELS: Readonly<Record<string, string>> = {
  'google-ads': 'Google Ads',
  'meta-ads': 'Meta Ads',
  'tiktok-ads': 'TikTok Ads',
};

function adPlatformLabel(platform: string): string {
  return AD_PLATFORM_LABELS[platform] ?? platform;
}

const STATUS_TONES: Readonly<Record<string, 'neutral' | 'info' | 'ok' | 'failure'>> = {
  DRAFT: 'neutral',
  COMPILED: 'info',
  ARMED: 'ok',
  HALTED: 'failure',
};

export interface AdsSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** The campaign intake submit (a DRAFT — nothing spends). */
  readonly onDraft: (input: MosCampaignIntakeInput) => void;
  /** Compile a DRAFT campaign (opens the arm gate). */
  readonly onCompile: (id: string) => void;
  /** The most recent intake receipt. */
  readonly receipt: string | null;
}

export function AdsSection({ section, workspace, onDraft, onCompile, receipt }: AdsSectionProps) {
  const armed = workspace.campaigns.filter((campaign) => campaign.status === 'ARMED');
  const totalBudget = workspace.campaigns.reduce((sum, campaign) => sum + Number(campaign.budget.replace(/[^0-9.]/g, '')) || 0, 0);
  const totalCap = workspace.campaigns.reduce((sum, campaign) => sum + Number(campaign.dailyCap.replace(/[^0-9.]/g, '')) || 0, 0);
  return (
    <SectionScaffold
      section={section}
      headerAside={<StatusPill tone="neutral">{workspace.campaigns.length} campaigns</StatusPill>}
    >
      <div className="mosc-budget-row">
        <ConsoleCard id="mosc-ads-budget-total" title="Budget under management" testId="mosc-budget-total">
          <p className="mosc-budget-value" data-testid="mosc-budget-total-value">
            GH₵{totalBudget.toLocaleString()}
          </p>
          <p className="mosc-card-note">The sum of declared campaign budgets — workspace records, never platform truth.</p>
        </ConsoleCard>
        <ConsoleCard id="mosc-ads-budget-cap" title="Daily cap, summed">
          <p className="mosc-budget-value">GH₵{totalCap.toLocaleString()}</p>
          <p className="mosc-card-note">Every campaign declares an explicit daily cap; the sum is the ceiling this workspace records.</p>
        </ConsoleCard>
        <ConsoleCard id="mosc-ads-budget-armed" title="Armed campaigns">
          <p className="mosc-budget-value">{armed.length}</p>
          <p className="mosc-card-note">
            ARMED is a workspace verdict — the arm gate approved. Live spend still awaits a connected ad transport.
          </p>
        </ConsoleCard>
      </div>

      <ConsoleCard
        id="mosc-ads-intake"
        title="Draft a campaign"
        note="Paid promotion runs through missions: the objective names what the budget buys, and nothing spends before the arm gate."
      >
        <form
          className="mosc-form"
          data-testid="mosc-ads-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            onDraft({
              platform: String(data.get('platform') ?? ''),
              objective: String(data.get('objective') ?? ''),
              budget: String(data.get('budget') ?? ''),
              dailyCap: String(data.get('dailyCap') ?? ''),
              audience: String(data.get('audience') ?? ''),
              missionId: String(data.get('missionId') ?? '') || null,
            });
            event.currentTarget.reset();
          }}
        >
          <div className="mosc-form-grid">
            <Field label="Ad platform" htmlFor="mosc-ads-platform">
              <select id="mosc-ads-platform" name="platform" className="mosc-input mosc-select" defaultValue="tiktok-ads">
                {MOS_AD_PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {adPlatformLabel(platform)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Objective (reward metric)" htmlFor="mosc-ads-objective-metric" hint="The closed vocabulary — the objective is what the budget buys.">
              <select id="mosc-ads-objective-metric" name="objectiveMetric" className="mosc-input mosc-select" defaultValue="qualified-reach">
                {MOS_REWARD_METRIC_VOCABULARY.map((metric) => (
                  <option key={metric.id} value={metric.id}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Objective statement" htmlFor="mosc-ads-objective">
            <input
              id="mosc-ads-objective"
              name="objective"
              className="mosc-input"
              placeholder="Accra pop-up teasers — TikTok"
              data-testid="mosc-ads-objective"
            />
          </Field>
          <div className="mosc-form-grid">
            <Field label="Budget (total)" htmlFor="mosc-ads-budget" hint="Explicit and positive — a campaign without a budget is a validation failure.">
              <input id="mosc-ads-budget" name="budget" className="mosc-input" placeholder="GH₵3,000" data-testid="mosc-ads-budget" />
            </Field>
            <Field label="Daily cap" htmlFor="mosc-ads-cap">
              <input id="mosc-ads-cap" name="dailyCap" className="mosc-input" placeholder="GH₵250" data-testid="mosc-ads-cap" />
            </Field>
          </div>
          <div className="mosc-form-grid">
            <Field label="Audience" htmlFor="mosc-ads-audience">
              <input id="mosc-ads-audience" name="audience" className="mosc-input" placeholder="Accra 18–30, afrobe interest" />
            </Field>
            <Field label="Mission link" htmlFor="mosc-ads-mission" hint="Paid promotion runs through missions — the link is how.">
              <select id="mosc-ads-mission" name="missionId" className="mosc-input mosc-select" defaultValue="">
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
          <button type="submit" className="mosc-button mosc-button--primary" data-testid="mosc-ads-submit">
            Draft campaign
          </button>
        </form>
        {receipt !== null ? <ReceiptLine>{receipt}</ReceiptLine> : null}
        <HonestyLine>
          The draft is a workspace record with an explicit budget — nothing here places spend, and nothing spends later without
          the arm gate AND a connected ad transport.
        </HonestyLine>
      </ConsoleCard>

      <ConsoleCard id="mosc-ads-registry" title="Campaign registry" note="The full lifecycle: DRAFT → COMPILED → ARMED. Counterfactuals are the Lab's SIMULATION-labelled projections.">
        {workspace.campaigns.length === 0 ? (
          <p className="mosc-line">No campaigns recorded — the intake above drafts the first one.</p>
        ) : (
          <ul className="mosc-registry" data-testid="mosc-ads-registry">
            {workspace.campaigns.map((campaign) => {
              const pendingGate = workspace.approvals.find(
                (approval) => approval.campaignId === campaign.id && approval.status === 'PENDING',
              );
              return (
                <li key={campaign.id} className="mosc-registry-row" data-testid={`mosc-campaign-${campaign.id}`}>
                  <span className="mosc-registry-main">
                    <strong>
                      {campaign.objective} — {adPlatformLabel(campaign.platform)}
                    </strong>
                    <span className="mosc-registry-meta">
                      Budget {campaign.budget} · cap {campaign.dailyCap}/day
                      {campaign.audience.length > 0 ? ` · ${campaign.audience}` : ''}
                      {campaign.missionId !== null ? ` · ${campaign.missionId}` : ''}
                    </span>
                    <span className="mosc-registry-meta mosc-registry-meta--dim">
                      {campaign.id} · drafted {formatWhen(campaign.createdAt)}
                    </span>
                    {campaign.counterfactual !== null ? (
                      <span className="mosc-sim-line" data-testid={`mosc-campaign-sim-${campaign.id}`}>
                        {campaign.counterfactual}
                      </span>
                    ) : null}
                    {campaign.status === 'ARMED' ? (
                      <span className="mosc-registry-meta mosc-registry-meta--dim">
                        Measured results: none — no live ad transport is connected; only the simulation-labelled counterfactual
                        exists.
                      </span>
                    ) : null}
                  </span>
                  <span className="mosc-registry-side">
                    <StatusPill tone={STATUS_TONES[campaign.status] ?? 'neutral'}>{campaign.status}</StatusPill>
                    {campaign.status === 'DRAFT' ? (
                      <button
                        type="button"
                        className="mosc-button mosc-button--ghost mosc-button--sm"
                        data-testid={`mosc-campaign-compile-${campaign.id}`}
                        onClick={() => onCompile(campaign.id)}
                      >
                        Compile → arm gate
                      </button>
                    ) : null}
                    {pendingGate !== undefined ? <StatusPill tone="attention">gate pending</StatusPill> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </ConsoleCard>

      <ConsoleCard
        id="mosc-ads-catalogue"
        title="Ad platform catalogue"
        note="The paid-promotion surfaces — the secure setup lanes live in Connections."
        aside={<StatusPill tone="neutral">Reference</StatusPill>}
      >
        <ul className="mosc-vocab-list">
          {MOS_AD_PLATFORMS.map((platform) => (
            <li key={platform} className="mosc-vocab-row">
              {adPlatformLabel(platform)}
            </li>
          ))}
        </ul>
      </ConsoleCard>
    </SectionScaffold>
  );
}
