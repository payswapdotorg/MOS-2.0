/**
 * The MOS BROWSER section (W39 — the substrate's embedded browser pane,
 * EMERGED as a native MOS console surface).
 *
 * WHAT THIS REPLICATES (the substrate's UnifiedBrowserView chrome,
 * verbatim structure + copy): the toolbar row (Back / Forward / Refresh
 * with the loading spin, the address input with the substrate's
 * placeholder, the free-size viewport toggle, the element picker, the
 * More menu with "Open in default browser" and "Open DevTools") and the
 * viewport surface — with THE REAL `<webview>`: the substrate's own
 * attribute idiom (partition `persist:zcode-embedded-browser`,
 * allowpopups, nodeintegrationinsubframes, the `browser-webview`
 * testid), mounted only once a navigation exists (the substrate's
 * white-first-frame law), keyed by the entry's guest generation.
 *
 * HOOK-FREE like every console section — with ONE disclosed seam: the
 * webview node leaves through the stable `onWebviewRef` callback so the
 * ENTRY owns the guest lifecycle (the substrate's own law: the webview
 * node must stay stable across re-renders, and the entry — not React
 * state inside the pane — wires the events and reports the guest to the
 * substrate's main process through `browserViewAttachGuest`).
 *
 * THE HONEST BOUNDARIES: element picking and the free-size viewport
 * render as affordances that answer honestly (they need the chat
 * workbench — a connected substrate account); the pane is ONE tab (the
 * substrate's tab strip stays with the chat workbench); the last URL
 * persists as a REAL workspace record and restores on the next visit.
 */

import type { MosConsoleSectionRecord } from '../console-nav.js';
import type { MosWorkspaceSnapshot } from '../workspace-store.js';
import {
  MOS_BROWSER_ADDRESS_PLACEHOLDER,
  MOS_BROWSER_BACK_TITLE,
  MOS_BROWSER_DEVTOOLS_LABEL,
  MOS_BROWSER_ELEMENT_PICKER_NOTE,
  MOS_BROWSER_EMPTY_LINE,
  MOS_BROWSER_FORWARD_TITLE,
  MOS_BROWSER_GUEST_FAILED_DESCRIPTION,
  MOS_BROWSER_GUEST_FAILED_RETRY,
  MOS_BROWSER_GUEST_FAILED_TITLE,
  MOS_BROWSER_LOAD_ERROR_RETRY,
  MOS_BROWSER_LOAD_ERROR_TITLE,
  MOS_BROWSER_MORE_TITLE,
  MOS_BROWSER_OPEN_EXTERNAL_LABEL,
  MOS_BROWSER_RELOAD_TITLE,
  MOS_BROWSER_RESPONSIVE_NOTE,
  MOS_BROWSER_TABS_NOTE,
  isCertificateMosBrowserLoadErrorCode,
  isDefaultBrowserOpenableUrl,
  mosBrowserGuestFailedDetail,
  type MosBrowserState,
} from '../browser-presentation.js';
import { HonestyLine, ReceiptLine, SectionScaffold } from './shared.js';

type ViewNode = unknown;

/* --------------------------------------------------------------------
 * The toolbar glyphs (PRESENTATION-ONLY inline SVG, aria-hidden,
 * stroke = currentColor — the substrate toolbar's lucide set redrawn).
 * -------------------------------------------------------------------- */

function BrowserGlyph({ kind, spin }: { readonly kind: 'back' | 'forward' | 'reload' | 'responsive' | 'picker' | 'more' | 'external' | 'devtools'; readonly spin?: boolean }) {
  const paths: Record<typeof kind, ViewNode> = {
    back: <><path d="M14.5 5.5 8 12l6.5 6.5" /></>,
    forward: <><path d="M9.5 5.5 16 12l-6.5 6.5" /></>,
    reload: <><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4h-4" /></>,
    responsive: <><rect x="3.5" y="6" width="13" height="12" rx="2" /><path d="M16 10.5 21 8v8l-5-2.5" /></>,
    picker: <><path d="m4 4 7.5 16 2-6.5L20 11.5z" /></>,
    more: <><circle cx="5.5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18.5" cy="12" r="1.4" /></>,
    external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
    devtools: <><path d="m7 8-3.5 4L7 16" /><path d="m17 8 3.5 4L17 16" /><path d="m13.5 6-3 12" /></>,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={spin ? 'mosc-browser-glyph is-spinning' : 'mosc-browser-glyph'}
    >
      {paths[kind] as never}
    </svg>
  );
}

function BrowserToolbarButton({
  title,
  testId,
  disabled,
  active,
  onClick,
  children,
}: {
  readonly title: string;
  readonly testId: string;
  readonly disabled?: boolean;
  readonly active?: boolean;
  readonly onClick: () => void;
  readonly children: ViewNode;
}) {
  const classes = ['mosc-browser-tool'];
  if (active === true) classes.push('is-active');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-testid={testId}
      title={title}
      aria-label={title}
      aria-pressed={active === true ? true : undefined}
      disabled={disabled === true}
      onClick={onClick}
    >
      {children as never}
    </button>
  );
}

/* --------------------------------------------------------------------
 * The section (hook-free: state arrives via props, commands leave
 * through the callbacks, the webview node leaves through the ref).
 * -------------------------------------------------------------------- */

export interface MosBrowserPaneProps {
  readonly section: MosConsoleSectionRecord;
  readonly workspace: MosWorkspaceSnapshot;
  /** The browser chrome state (the entry owns it; the substrate's shape). */
  readonly browserState: MosBrowserState;
  /** The address input draft (the entry owns it). */
  readonly addressValue: string;
  /** The webview generation (bumped only for guest renderer rebuilds). */
  readonly webviewGeneration: number;
  /** The guest attach verdict (the entry's browserViewAttachGuest result). */
  readonly guestAttach: 'idle' | 'pending' | 'attached' | 'unavailable' | `rejected:${string}`;
  /** The honest receipt (the pane's writes and honest answers). */
  readonly receipt: string | null;
  /** The address draft change. */
  readonly onAddressChange: (value: string) => void;
  /** The address form submit (the entry normalizes + loadURLs). */
  readonly onSubmitAddress: () => void;
  readonly onGoBack: () => void;
  readonly onGoForward: () => void;
  readonly onReload: () => void;
  readonly onOpenExternal: () => void;
  readonly onOpenDevTools: () => void;
  /** The guest failure's in-place rebuild (the substrate's recovery law). */
  readonly onRetryGuest: () => void;
  /** The load error's reload (the guest is alive — only the navigation failed). */
  readonly onRetryLoad: () => void;
  /**
   * The stable webview node callback (the entry wires the events and
   * reports the guest; the identity must stay stable across re-mounts
   * so React never churns the node).
   */
  readonly onWebviewRef: (node: ElectronWebviewTag | null) => void;
  /** The element-picker affordance answers honestly. */
  readonly onPickerNote: () => void;
  /** The free-size viewport affordance answers honestly. */
  readonly onResponsiveNote: () => void;
  /** The certificate hint's cross-link (real navigation, the W38 hub). */
  readonly onOpenAgentSettings: () => void;
}

export function BrowserSection({
  section,
  workspace,
  browserState,
  addressValue,
  webviewGeneration,
  guestAttach,
  receipt,
  onAddressChange,
  onSubmitAddress,
  onGoBack,
  onGoForward,
  onReload,
  onOpenExternal,
  onOpenDevTools,
  onRetryGuest,
  onRetryLoad,
  onWebviewRef,
  onPickerNote,
  onResponsiveNote,
  onOpenAgentSettings,
}: MosBrowserPaneProps) {
  const { guestFailure } = browserState;
  const loadError = guestFailure === null && browserState.errorMessage !== null ? browserState.errorMessage : null;
  const hasInitialNavigation =
    workspace.browserSession !== null && workspace.browserSession.url !== '';
  const hasNavigated = browserState.currentUrl !== 'about:blank';
  // The substrate's white-first-frame law: the guest is created only once
  // a navigation exists (persisted record or confirmed address submit).
  const shouldMountWebview = hasNavigated || hasInitialNavigation || browserState.isLoading;
  const surfaceCovered =
    guestFailure !== null || loadError !== null || (!hasNavigated && !browserState.isLoading);
  const certificateError = isCertificateMosBrowserLoadErrorCode(browserState.loadErrorCode);

  return (
    <SectionScaffold section={section}>
      <div className="mosc-browser-pane" data-testid="mosc-browser-pane">
        <form
          className="mosc-browser-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitAddress();
          }}
        >
          <BrowserToolbarButton
            title={MOS_BROWSER_BACK_TITLE}
            testId="browser-back-button"
            disabled={!browserState.canGoBack}
            onClick={onGoBack}
          >
            <BrowserGlyph kind="back" />
          </BrowserToolbarButton>
          <BrowserToolbarButton
            title={MOS_BROWSER_FORWARD_TITLE}
            testId="browser-forward-button"
            disabled={!browserState.canGoForward}
            onClick={onGoForward}
          >
            <BrowserGlyph kind="forward" />
          </BrowserToolbarButton>
          <BrowserToolbarButton
            title={MOS_BROWSER_RELOAD_TITLE}
            testId="browser-refresh-button"
            disabled={!browserState.isReady}
            onClick={onReload}
          >
            <BrowserGlyph kind="reload" spin={browserState.isLoading} />
          </BrowserToolbarButton>
          <input
            type="text"
            className="mosc-browser-address"
            data-testid="browser-address-input"
            value={addressValue}
            onChange={(event) => {
              onAddressChange(event.target.value);
            }}
            placeholder={MOS_BROWSER_ADDRESS_PLACEHOLDER}
            spellCheck={false}
            aria-label={MOS_BROWSER_ADDRESS_PLACEHOLDER}
          />
          <BrowserToolbarButton
            title="Free-size viewport"
            testId="browser-responsive-button"
            onClick={onResponsiveNote}
          >
            <BrowserGlyph kind="responsive" />
          </BrowserToolbarButton>
          <BrowserToolbarButton
            title="Select page element for chat"
            testId="browser-element-picker-button"
            disabled={!browserState.isReady}
            onClick={onPickerNote}
          >
            <BrowserGlyph kind="picker" />
          </BrowserToolbarButton>
          <details className="mosc-browser-more" data-testid="browser-more">
            <summary className="mosc-browser-tool" title={MOS_BROWSER_MORE_TITLE} aria-label={MOS_BROWSER_MORE_TITLE} data-testid="browser-more-button">
              <BrowserGlyph kind="more" />
            </summary>
            <div className="mosc-browser-more-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="mosc-browser-more-item"
                data-testid="browser-open-external-item"
                disabled={!browserState.isReady || !isDefaultBrowserOpenableUrl(browserState.currentUrl)}
                onClick={onOpenExternal}
              >
                <BrowserGlyph kind="external" />
                <span>{MOS_BROWSER_OPEN_EXTERNAL_LABEL}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="mosc-browser-more-item"
                data-testid="browser-devtools-button"
                disabled={!browserState.isReady}
                onClick={onOpenDevTools}
              >
                <BrowserGlyph kind="devtools" />
                <span>{MOS_BROWSER_DEVTOOLS_LABEL}</span>
              </button>
            </div>
          </details>
        </form>

        <div
          className="mosc-browser-surface"
          data-browser-guest-attach={guestAttach}
          data-browser-webview-state={shouldMountWebview ? (browserState.isReady ? 'ready' : 'starting') : 'unmounted'}
        >
          {guestFailure !== null ? (
            <div className="mosc-browser-state" role="alert" data-testid="browser-guest-failure">
              <p className="mosc-browser-state-title">{MOS_BROWSER_GUEST_FAILED_TITLE}</p>
              <p className="mosc-browser-state-line">{MOS_BROWSER_GUEST_FAILED_DESCRIPTION}</p>
              <p className="mosc-browser-state-detail">
                {mosBrowserGuestFailedDetail(guestFailure.reason, guestFailure.exitCode)}
              </p>
              <button type="button" className="mosc-button mosc-button--primary" onClick={onRetryGuest}>
                {MOS_BROWSER_GUEST_FAILED_RETRY}
              </button>
            </div>
          ) : loadError !== null ? (
            <div className="mosc-browser-state" role="alert" data-testid="browser-load-error">
              <p className="mosc-browser-state-title">{MOS_BROWSER_LOAD_ERROR_TITLE}</p>
              <p className="mosc-browser-state-line">{loadError}</p>
              {certificateError ? (
                <p className="mosc-browser-state-detail">
                  {'If you trust this address, enable "Ignore certificate errors" under the substrate Settings → Browser → Security, then restart the app.'}{' '}
                  <button type="button" className="mosc-inline-link" onClick={onOpenAgentSettings}>
                    Open Agent Settings
                  </button>
                </p>
              ) : null}
              <button type="button" className="mosc-button mosc-button--primary" onClick={onRetryLoad}>
                {MOS_BROWSER_LOAD_ERROR_RETRY}
              </button>
            </div>
          ) : surfaceCovered ? (
            <div className="mosc-browser-state mosc-browser-state--empty" role="status" data-testid="browser-empty">
              <p className="mosc-browser-state-line">{MOS_BROWSER_EMPTY_LINE}</p>
              <p className="mosc-browser-state-detail">
                {workspace.browserSession !== null && workspace.browserSession.url !== ''
                  ? `The workspace record restores ${workspace.browserSession.url} on entry.`
                  : 'No URL is recorded in this workspace yet — the first confirmed navigation writes the record.'}
              </p>
            </div>
          ) : null}
          {shouldMountWebview ? (
            <webview
              key={`mos-browser-webview:${webviewGeneration}`}
              ref={onWebviewRef}
              allowpopups={'' as unknown as boolean}
              src="about:blank"
              partition="persist:zcode-embedded-browser"
              nodeintegrationinsubframes="true"
              data-testid="browser-webview"
              className={surfaceCovered ? 'mosc-browser-webview is-covered' : 'mosc-browser-webview'}
              style={{ backgroundColor: '#fff' }}
            />
          ) : null}
        </div>

        <p className="mosc-browser-session" data-testid="mosc-browser-session">
          {workspace.browserSession !== null && workspace.browserSession.url !== ''
            ? `Workspace record · last URL ${workspace.browserSession.url}`
            : 'Workspace record · no URL recorded yet'}
        </p>

        <div className="mosc-browser-notes">
          <HonestyLine>{MOS_BROWSER_TABS_NOTE}</HonestyLine>
          <HonestyLine>{MOS_BROWSER_ELEMENT_PICKER_NOTE}</HonestyLine>
          <HonestyLine>{MOS_BROWSER_RESPONSIVE_NOTE}</HonestyLine>
        </div>

        {receipt !== null ? <ReceiptLine>{receipt}</ReceiptLine> : null}
      </div>
    </SectionScaffold>
  );
}
