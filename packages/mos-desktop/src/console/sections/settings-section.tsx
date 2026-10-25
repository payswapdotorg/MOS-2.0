/**
 * The SETTINGS section (pinned at the nav end, the payswap §8 law): the
 * theme toggle (light/dark — the shell entry owns the theme state), the
 * workspace facts (the store's honest health report — quarantines
 * surfaced, never dropped), and the honest durability disclosure.
 * Presentation-only, hook-free.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import {
  MOS_WORKSPACE_DURABILITY_FACT,
  type MosWorkspaceSnapshot,
  type MosWorkspaceStoreHealth,
} from '../workspace-store.js';
import { ConsoleCard, HonestyLine, SectionScaffold, StatusPill } from './shared.js';

export interface SettingsSectionProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  readonly health: MosWorkspaceStoreHealth;
  readonly quarantineCount: number;
  readonly theme: 'light' | 'dark';
  /** The theme toggle — the shell entry applies it to the document. */
  readonly onToggleTheme: () => void;
  readonly shellVersion: string;
}

export function SettingsSection({ section, workspace, health, quarantineCount, theme, onToggleTheme, shellVersion }: SettingsSectionProps) {
  return (
    <SectionScaffold section={section} headerAside={<StatusPill tone="neutral">MOS v{shellVersion}</StatusPill>}>
      <ConsoleCard id="mosc-settings-theme" title="Appearance" note="The workspace theme — applied immediately, remembered across launches.">
        <button
          type="button"
          className="mosc-button mosc-button--primary"
          data-testid="mosc-theme-toggle"
          onClick={onToggleTheme}
        >
          {theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        </button>
        <p className="mosc-line">Current: {theme}</p>
      </ConsoleCard>

      <ConsoleCard
        id="mosc-settings-facts"
        title="Workspace facts"
        note="The store's own health report — counts and the durability class, rendered as they are."
        aside={<StatusPill tone="neutral">{health.durability}</StatusPill>}
      >
        <dl className="mosc-facts-list">
          <div className="mosc-facts-row">
            <dt className="mosc-facts-term">Missions recorded</dt>
            <dd className="mosc-facts-value">{health.missionCount}</dd>
          </div>
          <div className="mosc-facts-row">
            <dt className="mosc-facts-term">Posts recorded</dt>
            <dd className="mosc-facts-value">{health.postCount}</dd>
          </div>
          <div className="mosc-facts-row">
            <dt className="mosc-facts-term">Campaigns recorded</dt>
            <dd className="mosc-facts-value">{health.campaignCount}</dd>
          </div>
          <div className="mosc-facts-row">
            <dt className="mosc-facts-term">Timeline events</dt>
            <dd className="mosc-facts-value">{health.eventCount}</dd>
          </div>
          <div className="mosc-facts-row">
            <dt className="mosc-facts-term">Quarantined snapshots</dt>
            <dd className="mosc-facts-value" data-testid="mosc-quarantine-count">
              {quarantineCount}
            </dd>
          </div>
          <div className="mosc-facts-row">
            <dt className="mosc-facts-term">Store key</dt>
            <dd className="mosc-facts-value">
              <code>{health.key}</code>
            </dd>
          </div>
        </dl>
        <HonestyLine>
          {MOS_WORKSPACE_DURABILITY_FACT} A snapshot that fails validation is quarantined and the store starts empty —
          fail-closed, never guessed back. {workspace.missions.length} missions, {workspace.posts.length} posts and{' '}
          {workspace.campaigns.length} campaigns are live in this session's snapshot.
        </HonestyLine>
      </ConsoleCard>

      <ConsoleCard
        id="mosc-settings-agent-settings"
        title="Agent Workbench settings"
        note="The workbench's own settings — the substrate surface behind the Agent Workbench nav group."
      >
        <p className="mosc-line">
          The Agent Workbench group in the rail carries the workbench's settings surface (sessions, providers, and the
          workspace-level options the substrate owns). This console's settings carry the workspace facts and theme only — the
          two never blur.
        </p>
      </ConsoleCard>
    </SectionScaffold>
  );
}
