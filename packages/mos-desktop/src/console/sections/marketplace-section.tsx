/**
 * The MOS PLUGIN MARKETPLACE section (W37 — the substrate's Plugin
 * Marketplace page, EMERGED as a native MOS console surface, "exactly
 * as is" per the owner's directive).
 *
 * WHAT THIS REPLICATES (the substrate's PluginStorePage store view,
 * verbatim structure + copy): the content column; the page header (the
 * `<h1>` "Plugin Marketplace" + the description line "Extend ZCode with
 * skills, commands, and MCP servers from plugins"); the header controls
 * (the "Add" affordance + the "Installed" management affordance + the
 * Public/Personal segment pills); the category sections (Developer
 * Tools / Productivity / Finance / Other / 游戏/3D — the store's own
 * headings and order) each holding the plugin cards (the CDN icon with
 * the initial-tile fallback, the name, the one-line truncated
 * description, the Install button); the per-category "Show less" /
 * "Show more" toggle (plugin-store-group-toggle); the installed strip
 * (the Installed view over the workspace's records); and the honest
 * empty states (the Personal segment, the Installed view).
 *
 * HOOK-FREE like every console section: the snapshot + the segment +
 * the receipts arrive as props, the commands leave through the callbacks
 * (the entry owns every piece of state and re-mounts).
 *
 * THE HONEST WRITES: Install records a REAL workspace decision (the
 * plugin enters the workspace inventory — the substrate syncs the
 * skills/MCP when an account is connected; nothing executes here);
 * Uninstall removes the record (the substrate's own two-click
 * destructive-confirm law); Add and the Installed strip management
 * affordance answer honestly (the Model Settings precedent — the
 * catalog is frozen, sources arrive with a connected substrate
 * account).
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import type { MosWorkspaceSnapshot } from '../workspace-store.js';
import {
  MOS_MARKETPLACE_CATEGORIES,
  MOS_MARKETPLACE_PLUGINS,
  mosMarketplacePluginsForCategory,
  type MosMarketplacePluginRecord,
} from '../marketplace-catalog.js';
import {
  MOS_MARKETPLACE_TITLE,
  MOS_MARKETPLACE_DESCRIPTION,
  MOS_MARKETPLACE_ADD_LABEL,
  MOS_MARKETPLACE_INSTALLED_LABEL,
  MOS_MARKETPLACE_SEGMENT_PUBLIC,
  MOS_MARKETPLACE_SEGMENT_PERSONAL,
  MOS_MARKETPLACE_INSTALL_LABEL,
  MOS_MARKETPLACE_INSTALLED_WORD,
  MOS_MARKETPLACE_SHOW_LESS,
  MOS_MARKETPLACE_SHOW_MORE,
  MOS_MARKETPLACE_INSTALLED_EMPTY,
  MOS_MARKETPLACE_PERSONAL_EMPTY,
  MOS_MARKETPLACE_INSTALLED_NOTE,
  MOS_MARKETPLACE_CATEGORY_COLLAPSE_AFTER,
  mosMarketplaceUninstallConfirm,
  type MosMarketplaceSegment,
} from '../marketplace-presentation.js';
import { ReceiptLine } from './shared.js';

type ViewNode = unknown;

/* --------------------------------------------------------------------
 * The DOM-local helpers (the two-click uninstall confirm — the
 * substrate's destructive second-click law; the armed state resets)
 * -------------------------------------------------------------------- */

function armUninstallButton(button: HTMLButtonElement, commit: () => void): void {
  if (button.dataset.armed === 'true') {
    delete button.dataset.armed;
    commit();
    return;
  }
  button.dataset.armed = 'true';
  window.setTimeout(() => {
    delete button.dataset.armed;
  }, 2500);
}

/* --------------------------------------------------------------------
 * The inline glyph kit (presentation-only, stroke = currentColor)
 * -------------------------------------------------------------------- */

function icon(children: ViewNode): never {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children as never}
    </svg>
  ) as never;
}

const PLUS_GLYPH = icon(
  <>
    <path d="M12 5v14M5 12h14" />
  </>,
);
const CHECK_GLYPH = icon(
  <>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </>,
);
const PACKAGE_GLYPH = icon(
  <>
    <path d="M12 3 4 7v10l8 4 8-4V7z" />
    <path d="M4 7l8 4 8-4M12 11v10" />
  </>,
);

/* --------------------------------------------------------------------
 * One plugin card (the substrate's plugin-store-card replica)
 * -------------------------------------------------------------------- */

function MarketplaceCard({
  record,
  installed,
  onInstall,
  onUninstall,
}: {
  readonly record: MosMarketplacePluginRecord;
  readonly installed: boolean;
  readonly onInstall: (id: string) => void;
  readonly onUninstall: (id: string) => void;
}) {
  const initial = record.name.trim().slice(0, 1).toLocaleUpperCase() || '?';
  return (
    <div
      className={installed ? 'mosc-mkt-card is-installed' : 'mosc-mkt-card'}
      data-testid="plugin-store-card"
      data-plugin-id={record.id}
    >
      <span className="mosc-mkt-card-icon" aria-hidden="true">
        <img
          alt=""
          draggable="false"
          src={record.iconUrl}
          onError={(event) => {
            const img = event.currentTarget;
            img.style.display = 'none';
            const parent = img.parentElement;
            if (parent !== null && parent.querySelector('.mosc-mkt-card-fallback') === null) {
              const tile = document.createElement('span');
              tile.className = 'mosc-mkt-card-fallback';
              tile.textContent = initial;
              parent.appendChild(tile);
            }
          }}
        />
      </span>
      <div className="mosc-mkt-card-body">
        <span className="mosc-mkt-card-name">{record.name}</span>
        <p className="mosc-mkt-card-description" title={record.description}>
          {record.description}
        </p>
      </div>
      <div className="mosc-mkt-card-actions">
        {installed ? (
          <button
            type="button"
            className="mosc-mkt-installedbtn"
            data-testid="plugin-store-uninstall"
            title={mosMarketplaceUninstallConfirm(record.name)}
            onClick={(event) => {
              armUninstallButton(event.currentTarget, () => {
                onUninstall(record.id);
              });
            }}
          >
            {CHECK_GLYPH}
            <span>{MOS_MARKETPLACE_INSTALLED_WORD}</span>
          </button>
        ) : (
          <button
            type="button"
            className="mosc-mkt-installbtn"
            data-testid="plugin-store-install"
            onClick={() => {
              onInstall(record.id);
            }}
          >
            <span>{MOS_MARKETPLACE_INSTALL_LABEL}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------
 * The section
 * -------------------------------------------------------------------- */

export function MarketplaceSection({
  section,
  workspace,
  segment,
  installedView,
  receipt,
  onSegment,
  onToggleInstalledView,
  onInstall,
  onUninstall,
  onAddNote,
  onInstalledNote,
}: {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** The active Public/Personal segment pill (the entry owns it). */
  readonly segment: MosMarketplaceSegment;
  /** Whether the Installed management view is open (the entry owns it). */
  readonly installedView: boolean;
  readonly receipt: string | null;
  readonly onSegment: (segment: MosMarketplaceSegment) => void;
  readonly onToggleInstalledView: () => void;
  readonly onInstall: (pluginId: string) => void;
  readonly onUninstall: (pluginId: string) => void;
  /** The Add affordance answers honestly (the Model Settings precedent). */
  readonly onAddNote: () => void;
  /** The Installed strip management affordance answers honestly. */
  readonly onInstalledNote: () => void;
}) {
  const installedIds = new Set(workspace.marketplacePlugins.map((entry) => entry.pluginId));

  return (
    <section
      aria-labelledby="mosc-marketplace-heading"
      className="mosc-section mosc-mkt"
      data-testid="mosc-section-marketplace"
    >
      <h1 id="mosc-marketplace-heading" className="mosc-sr-only">
        {section.title}
      </h1>

      <div className="mosc-mkt-frame">
        <h2 className="mosc-mkt-title" data-testid="plugin-store-title">
          {MOS_MARKETPLACE_TITLE}
        </h2>
        <p className="mosc-mkt-description">{MOS_MARKETPLACE_DESCRIPTION}</p>

        <div className="mosc-mkt-controls">
          <button
            type="button"
            className="mosc-mkt-add"
            data-testid="plugin-store-add"
            onClick={() => {
              onAddNote();
            }}
          >
            {PLUS_GLYPH}
            <span>{MOS_MARKETPLACE_ADD_LABEL}</span>
          </button>
          <button
            type="button"
            className={installedView ? 'mosc-mkt-installedtoggle is-active' : 'mosc-mkt-installedtoggle'}
            data-testid="plugin-store-installed"
            aria-pressed={installedView}
            onClick={() => {
              onToggleInstalledView();
            }}
          >
            {PACKAGE_GLYPH}
            <span>{MOS_MARKETPLACE_INSTALLED_LABEL}</span>
            <span className="mosc-mkt-installedcount" data-testid="plugin-store-installed-count">
              {String(workspace.marketplacePlugins.length)}
            </span>
          </button>
          <div className="mosc-mkt-segments" role="tablist" aria-label="Marketplace sources">
            <button
              type="button"
              className={segment === 'public' ? 'mosc-mkt-segment is-active' : 'mosc-mkt-segment'}
              data-testid="plugin-store-segment-public"
              role="tab"
              aria-selected={segment === 'public'}
              onClick={() => {
                onSegment('public');
              }}
            >
              {MOS_MARKETPLACE_SEGMENT_PUBLIC}
            </button>
            <button
              type="button"
              className={segment === 'personal' ? 'mosc-mkt-segment is-active' : 'mosc-mkt-segment'}
              data-testid="plugin-store-segment-personal"
              role="tab"
              aria-selected={segment === 'personal'}
              onClick={() => {
                onSegment('personal');
              }}
            >
              {MOS_MARKETPLACE_SEGMENT_PERSONAL}
            </button>
          </div>
        </div>

        {installedView ? (
          <div className="mosc-mkt-installedview" data-testid="plugin-store-installed-strip">
            <div className="mosc-mkt-installedhead">
              <h3 className="mosc-mkt-installedtitle">{MOS_MARKETPLACE_INSTALLED_LABEL}</h3>
              <button
                type="button"
                className="mosc-mkt-installedmanage"
                data-testid="plugin-store-installed-manage"
                onClick={() => {
                  onInstalledNote();
                }}
              >
                {MOS_MARKETPLACE_INSTALLED_NOTE}
              </button>
            </div>
            {workspace.marketplacePlugins.length > 0 ? (
              <div className="mosc-mkt-list">
                {MOS_MARKETPLACE_PLUGINS.filter((entry) => installedIds.has(entry.id)).map(
                  (entry) => (
                    <MarketplaceCard
                      key={entry.id}
                      record={entry}
                      installed={true}
                      onInstall={onInstall}
                      onUninstall={onUninstall}
                    />
                  ),
                )}
              </div>
            ) : (
              <p className="mosc-mkt-emptyline" role="status">
                {MOS_MARKETPLACE_INSTALLED_EMPTY}
              </p>
            )}
          </div>
        ) : segment === 'personal' ? (
          <p className="mosc-mkt-emptyline" role="status">
            {MOS_MARKETPLACE_PERSONAL_EMPTY}
          </p>
        ) : (
          MOS_MARKETPLACE_CATEGORIES.map((category) => {
            const items = mosMarketplacePluginsForCategory(category.id);
            return (
              <details key={category.id} className="mosc-mkt-category" data-testid="plugin-store-group" open>
                <summary className="mosc-mkt-categoryhead">
                  <h3 className="mosc-mkt-categorytitle">{category.label}</h3>
                  {items.length > MOS_MARKETPLACE_CATEGORY_COLLAPSE_AFTER ? (
                    <span className="mosc-mkt-grouptoggle" data-testid="plugin-store-group-toggle">
                      <span className="mosc-mkt-toggle-less">{MOS_MARKETPLACE_SHOW_LESS}</span>
                      <span className="mosc-mkt-toggle-more">{MOS_MARKETPLACE_SHOW_MORE}</span>
                    </span>
                  ) : null}
                </summary>
                <div className="mosc-mkt-list">
                  {items.map((entry) => (
                    <MarketplaceCard
                      key={entry.id}
                      record={entry}
                      installed={installedIds.has(entry.id)}
                      onInstall={onInstall}
                      onUninstall={onUninstall}
                    />
                  ))}
                </div>
              </details>
            );
          })
        )}

        {receipt !== null ? <ReceiptLine tone="ok">{receipt}</ReceiptLine> : null}
      </div>
    </section>
  );
}
