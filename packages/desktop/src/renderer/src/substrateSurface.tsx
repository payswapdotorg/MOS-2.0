import { createRoot, type Root } from "react-dom/client";
import { useEffect } from "react";
import {
  AppErrorBoundary,
  Root as ZCodeRoot,
  ZCodeIntlProvider,
} from "@zcode/ui";
import type { IServiceAccessor } from "@zcode/services";
import type { createDesktopPlatform } from "./desktopPlatform.js";

/**
 * The AGENT WORKBENCH host surface (the owner's build-ON-ZCode directive).
 *
 * The desktop renderer hosts TWO product surfaces side by side:
 *
 *  - the MOS shell (mounted by `@mos/desktop`'s entry into the
 *    `mos-surface` container — missions, console, social, lab, composer);
 *  - the ORIGINAL substrate UI (`@zcode/ui`'s `Root`, mounted lazily into
 *    the `substrate-surface` container on the first workbench request —
 *    the full agent workspace with sessions, GROUPS/PROJECTS, the
 *    Automations main view, Settings, MCP/skills/commands, terminal, git,
 *    and every other substrate capability).
 *
 * BOTH surfaces stay mounted once created — switching is instant and
 * state on either side survives (the MOS composition keeps its per-load
 * runtimes; the substrate keeps its zustand stores, sessions and tabs).
 * The MOS rail's Agent Workbench group navigates here through the entry's
 * `onRequestSubstrateSurface` handoff (see mos-desktop-entry.jsx).
 *
 * Surface policy (mirrors the shell-swap scroll contract):
 *  - while the SUBSTRATE surface is visible, `html.mos-desktop-shell` is
 *    REMOVED so the substrate's own viewport-pinned document chain applies
 *    (its UI manages internal scrolling exactly as it did before the MOS
 *    conversion);
 *  - while the MOS surface is visible, the class is re-applied so the MOS
 *    document scrolls on the viewport (§4.2).
 *
 * Deep entries are driven through the substrate's OWN affordances — never
 * by forking its internals:
 *  - `/workbench/automations` waits for the sidebar's real
 *    `[data-testid="automations-open"]` button and clicks it (the app's own
 *    navigation path);
 *  - `/workbench/settings` dispatches the substrate's OS-convention
 *    settings shortcut (Ctrl+, / ⌘,) that `useAppKeyboard` binds to
 *    `openSettingsTab` — the same action the app's own UI uses.
 */

/** The substrate surface a workbench route names. */
export type WorkbenchSurface = "chat" | "automations" | "settings";

/** How long the deep-entry driver waits for the substrate UI to boot. */
const DEEP_ENTRY_TIMEOUT_MS = 30_000;
const DEEP_ENTRY_POLL_INTERVAL_MS = 250;

type DesktopPlatform = ReturnType<typeof createDesktopPlatform>;

export interface SubstrateSurfaceHostOptions {
  /** The renderer's `#root` element — the host appends both containers. */
  readonly rootElement: HTMLElement;
  /** The substrate service accessor (the renderer's MessagePort connection). */
  readonly services: IServiceAccessor;
  /** The desktop platform port the substrate Root renders with. */
  readonly platform: DesktopPlatform;
  readonly isMacDesktop: boolean;
  readonly isWindowsDesktop: boolean;
  readonly restoreSession: boolean;
  readonly supportsSettings: boolean;
  readonly initialWorkspaceAbsPath: string | undefined;
  readonly initialWorkspacePurpose: "conversation" | "project";
  readonly unavailableWorkspacePath: string | undefined;
  /**
   * Called when the user activates the floating back control — the host
   * (main.tsx) hides this surface, re-applies the MOS scroll policy and
   * resumes the MOS shell at its last route.
   */
  readonly onBackToMos: () => void;
}

/** The floating control that returns to the MOS surface. */
function SubstrateBackControl({ onBackToMos }: { readonly onBackToMos: () => void }) {
  useEffect(() => {
    // Nothing to tear down — the control is presentation-only.
    return undefined;
  }, []);
  return (
    <button
      type="button"
      data-testid="substrate-back-to-mos"
      aria-label="Back to MOS"
      title="Back to MOS"
      onClick={onBackToMos}
      style={{
        position: "fixed",
        top: 10,
        right: 14,
        zIndex: 2147483000,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        borderRadius: 9999,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "#1b3b68",
        color: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.02,
        cursor: "pointer",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.35)",
      }}
    >
      <span aria-hidden="true">←</span> MOS
    </button>
  );
}

/** Polls (and observes) the DOM until `selector` matches; resolves the element. */
function waitForSelector(selector: string, timeoutMs: number): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const doc = globalThis.document;
    if (!doc) {
      reject(new Error("no document to drive the substrate deep entry"));
      return;
    }
    const startedAt = Date.now();
    const tick = (): void => {
      const element = doc.querySelector<HTMLElement>(selector);
      if (element !== null) {
        observer.disconnect();
        window.clearInterval(poll);
        resolve(element);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        observer.disconnect();
        window.clearInterval(poll);
        reject(new Error(`substrate deep entry timed out waiting for ${selector}`));
      }
    };
    const observer = new MutationObserver(tick);
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    const poll = window.setInterval(tick, DEEP_ENTRY_POLL_INTERVAL_MS);
    tick();
  });
}

/** Drives the substrate's OWN affordances to open the requested surface. */
function driveSubstrateEntry(surface: WorkbenchSurface, isMacDesktop: boolean): void {
  if (surface === "automations") {
    // The substrate sidebar's real Automations entry (the app's own
    // navigation path — workspaceMainView "automations").
    void waitForSelector('[data-testid="automations-open"]', DEEP_ENTRY_TIMEOUT_MS)
      .then((button) => {
        button.click();
      })
      .catch((error: unknown) => {
        console.error("[substrate-surface] automations deep entry failed", error);
      });
    return;
  }
  if (surface === "settings") {
    // The substrate's OS-convention settings shortcut (CmdOrCtrl+Comma) —
    // `useAppKeyboard` binds it to the same `openSettingsTab` action its own
    // header/menu entries use. Verified by the settings-page test id below.
    const dispatchSettingsShortcut = (): boolean => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: ",",
          code: "Comma",
          ctrlKey: !isMacDesktop,
          metaKey: isMacDesktop,
          bubbles: true,
          cancelable: true,
        }),
      );
      return globalThis.document.querySelector('[data-testid="settings-page"]') !== null;
    };
    dispatchSettingsShortcut();
    // The substrate may still be mid-boot on the first request (the Root
    // mounts its keyboard listener after React commits) — retry once the
    // settings surface exists, keeping the shortcut semantics.
    window.setTimeout(() => {
      if (globalThis.document.querySelector('[data-testid="settings-page"]') === null) {
        dispatchSettingsShortcut();
      }
    }, 1200);
  }
  // "chat" needs no deep entry — the Root boots into the workspace view
  // (sessions, groups and projects) by default.
}

export interface SubstrateSurfaceHost {
  /** The element the MOS shell entry mounts into (created by this host). */
  readonly mosSurfaceElement: HTMLElement;
  /** Shows (lazily mounting) the substrate surface; drives its deep entry. */
  showSubstrateSurface(surface: WorkbenchSurface): void;
  /** Hides the substrate surface and re-applies the MOS document policy. */
  hideSubstrateSurface(): void;
}

/**
 * Creates the two-surface layout inside `options.rootElement` and returns
 * the host controller. The layout is rendered ONCE through the caller's
 * React root (never re-rendered — the two child roots own their trees).
 */
export function createSubstrateSurfaceHost(
  options: SubstrateSurfaceHostOptions,
): SubstrateSurfaceHost {
  const doc = options.rootElement.ownerDocument;

  const mosSurface = doc.createElement("div");
  mosSurface.id = "mos-surface";
  const substrateSurface = doc.createElement("div");
  substrateSurface.id = "substrate-surface";
  substrateSurface.style.display = "none";
  options.rootElement.append(mosSurface, substrateSurface);

  let substrateRoot: Root | null = null;
  let substrateVisible = false;

  const applyDocumentPolicy = (): void => {
    // The shell-swap scroll contract (§4.2): the MOS document chain scrolls
    // on the viewport under `html.mos-desktop-shell`; the substrate's own
    // pinned viewport policy applies when the class is absent.
    doc.documentElement.classList.toggle("mos-desktop-shell", !substrateVisible);
  };

  const mountSubstrateRootOnce = (): void => {
    if (substrateRoot !== null) {
      return;
    }
    substrateRoot = createRoot(substrateSurface);
    const settingService = options.supportsSettings
      ? options.services.settingService
      : undefined;
    substrateRoot.render(
      <AppErrorBoundary
        isDesktop
        isMacDesktop={options.isMacDesktop}
        isWindowsDesktop={options.isWindowsDesktop}
      >
        <SubstrateBackControl onBackToMos={options.onBackToMos} />
        <ZCodeIntlProvider
          settingService={settingService}
          broadcastService={options.services.broadcastService}
          resolveSystemLocale={options.platform.getSystemLocale}
        >
          <ZCodeRoot
            services={options.services}
            platform={options.platform}
            isDesktop
            assistantCodeCommentCardsEnabled
            isMacDesktop={options.isMacDesktop}
            isWindowsDesktop={options.isWindowsDesktop}
            restoreSession={options.restoreSession}
            supportsSettings={options.supportsSettings}
            initialWorkspaceAbsPath={options.initialWorkspaceAbsPath}
            initialWorkspacePurpose={options.initialWorkspacePurpose}
            unavailableWorkspacePath={options.unavailableWorkspacePath}
          />
        </ZCodeIntlProvider>
      </AppErrorBoundary>,
    );
  };

  const showSubstrateSurface = (surface: WorkbenchSurface): void => {
    mountSubstrateRootOnce();
    substrateVisible = true;
    mosSurface.style.display = "none";
    substrateSurface.style.display = "block";
    applyDocumentPolicy();
    driveSubstrateEntry(surface, options.isMacDesktop);
  };

  const hideSubstrateSurface = (): void => {
    substrateVisible = false;
    substrateSurface.style.display = "none";
    mosSurface.style.display = "block";
    applyDocumentPolicy();
  };

  return {
    mosSurfaceElement: mosSurface,
    showSubstrateSurface,
    hideSubstrateSurface,
  };
}
