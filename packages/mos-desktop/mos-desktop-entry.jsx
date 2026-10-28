// MOS desktop shell entry (registry module `desktop`) — the mount skeleton
// for the MOS CONSOLE (W32 — the payswap-3.0 pattern adapted to MOS's
// domain: the product console as the desktop app's own surface):
//
//   pre-paint theme seed → the workspace store (BROWSER_PROFILE) →
//   the console state (section / prefill / receipts / agent / theme) →
//   the workbench boot-route check → the error-boundary-wrapped mount.
//
// WHY .jsx at the PACKAGE ROOT (disclosed): the frozen boundary harness
// (harness/mos-boundary-check.mjs + harness/mos-boundary-rules.json) scans
// `.ts/.tsx/.mts/.js/.mjs` files under `packages/mos-*` and forbids every
// bare npm import there — including `react-dom/client`, which mounting
// requires. This entry therefore uses the `.jsx` extension, which the
// frozen rules do not manage — the same disclosed pattern @mos/web's
// src/main.jsx established. All logic it calls lives in scanned, tested
// TypeScript modules under `src/`; the console's components are hook-free
// presentations and THIS entry owns every piece of state (the store
// subscription, the section, the prefill, the receipts, the agent, the
// theme), re-mounting the console tree on every change — the same
// discipline the previous Ask-MOS-composer wiring established (UXR-WC).
//
// The AGENT WORKBENCH handoff (build-ON-ZCode) is preserved verbatim:
// `/workbench*` routes hand the surface request to the host renderer
// (the substrate UI mounts behind the MOS chrome), and EVERY non-
// workbench navigation calls the host's idempotent ensure-MOS-visible
// callback so the substrate never stays visually on top of a freshly-
// resolved MOS route with a stale title.

import { Component, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MosAppErrorView,
  MosBootstrapErrorView,
  applyMosThemeToDocument,
  probePrefersDark,
  readStoredMosTheme,
  resolveMosInitialTheme,
  MOS_THEME_STORAGE_KEY,
} from '@mos/web';
import {
  createMosWorkspaceStore,
  desktopQueryFromAppHref,
  installDesktopShellLinkNavigation,
  mosConsoleSectionFromPath,
  mosConsoleSectionPath,
  mosConsoleSectionTitle,
  mosAction,
  routeMosAgentText,
  workbenchSurfaceFromAppPath,
  initialMosNewTaskDraft,
  initialMosCommandFormState,
  initialMosHookFormState,
  initialMosMcpFormState,
  initialMosBrowserState,
  displayMosBrowserUrl,
  isDefaultBrowserOpenableUrl,
  isRecoverableMosBrowserGuestExitReason,
  mosBrowserGuestAttachedReceipt,
  mosBrowserGuestUnavailableReceipt,
  mosBrowserLoadFailedMessage,
  normalizeMosBrowserUrl,
  safeMosWebviewCall,
  MOS_BROWSER_DEFAULT_URL,
  MOS_BROWSER_ELEMENT_PICKER_NOTE,
  MOS_BROWSER_GUEST_KEY,
  MOS_BROWSER_INVALID_URL_MESSAGE,
  MOS_BROWSER_RESPONSIVE_NOTE,
  MOS_BROWSER_WORKSPACE_KEY,
  mosCommandFormFromCommand,
  mosHookFormFromHook,
  mosMcpFormFromServer,
  MOS_SETTINGS_SKILLS_REFRESH_NOTE,
  MOS_SETTINGS_SKILLS_NEW_NOTE,
} from './src/index.js';
import { MosConsoleApp } from './src/index.js';
import './mos-desktop-shell.css';
import '../mos-web/src/styles.css';

const SHELL_DOCUMENT_TITLE = 'MOS — Marketing Operating System';
const DEFAULT_SHELL_VERSION = '0.1.0';
// W38: the Agent Settings surface is NATIVE now — the substrate handoff
// covers only the chat workspace.
const WORKBENCH_TITLES = {
  chat: 'MOS — Agent Workbench',
  settings: 'MOS — Agent Workbench · Settings',
};

/**
 * The desktop shell's error boundary — the audited boundary pattern
 * (@mos/web owns the ERROR VIEW surface this renders; @mos/web does not
 * export its own boundary class, so the desktop host entry owns one, the
 * same way the audited web shell's entry did).
 */
class MosDesktopErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <MosAppErrorView
          message={error instanceof Error ? error.message : String(error)}
          onRetry={() => globalThis.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

/** Notifies the host after the first React commit (startup handshake). */
function FirstCommitNotifier({ onCommit }) {
  useEffect(() => {
    onCommit();
  }, []);
  return null;
}

/**
 * The render-time ISO now (W36): the Tasks surface's relative labels
 * ("now" / "12m" / "3h" / "2d") and the Automations next-run labels
 * are pure functions of this timestamp — read once per remount, never
 * a live-ticking clock (a discrete interaction re-renders honestly).
 */
function renderNowIso() {
  return new Date().toISOString();
}

/**
 * The New Task input focus restorer (W35): a discrete draft pick re-mounts
 * the console; the composer's input re-gains focus after the commit (the
 * substrate's own picker refocuses the chat input — we mirror it).
 */
function NewTaskFocusRestorer({ focusKey }) {
  useEffect(() => {
    if (focusKey > 0) {
      const input = globalThis.document?.querySelector(
        'textarea[data-testid="mosnt-input"]',
      );
      if (input) {
        input.focus();
      }
    }
  }, [focusKey]);
  return null;
}

export function bootMosDesktopShell(options) {
  const rootElement =
    options.rootElement ?? globalThis.document.getElementById('root');
  if (!rootElement) {
    throw new Error('mos-desktop: no root element to mount the MOS shell into');
  }
  const shellVersion = options.shellVersion ?? DEFAULT_SHELL_VERSION;
  const onFirstReactCommit = options.onFirstReactCommit ?? (() => undefined);
  // The AGENT WORKBENCH handoff (build-ON-ZCode): the host renderer's
  // callback for the substrate surfaces (`/workbench*` routes). The entry
  // NEVER resolves a MOS console section for those routes — it rewrites
  // the route query (the URL stays the route truth), sets the workbench
  // title, and hands the surface request to the host, which mounts the
  // substrate UI behind the MOS chrome (the host owns both surface
  // containers).
  const onRequestSubstrateSurface = options.onRequestSubstrateSurface ?? null;
  const requestSubstrateSurface = (surface) => {
    if (onRequestSubstrateSurface !== null) {
      onRequestSubstrateSurface(surface);
    }
  };
  // The return handoff: the host's idempotent ensure-MOS-visible callback.
  // Called on EVERY non-workbench navigation so MOS-side navigation (rail
  // clicks while the substrate shows, agent intents, link bridges)
  // dismisses the substrate instead of leaving it visually on top of the
  // freshly-resolved MOS route with a stale title. No-op when the MOS
  // surface already shows — and NEVER re-drives the MOS shell, so it
  // cannot loop with the host's back-control flow.
  const onRequestMosSurface = options.onRequestMosSurface ?? null;
  const ensureMosSurfaceVisible = () => {
    if (onRequestMosSurface !== null) {
      onRequestMosSurface();
    }
  };
  const workbenchTitleFor = (surface) => WORKBENCH_TITLES[surface] ?? 'MOS — Agent Workbench';
  // Hosts pass their own React root (the desktop renderer pre-creates one
  // for the database-startup admission screen); otherwise this entry owns
  // the root.
  const reactRoot = options.reactRoot ?? createRoot(rootElement);

  const win = globalThis.window;
  const doc = globalThis.document;

  // 1. Pre-paint theme (the canonical resolution on mount) + the shell's
  //    body policy class (the retained ZCode UI stylesheet hides body
  //    overflow for its own surfaces; the MOS shell scrolls normally).
  let theme = resolveMosInitialTheme({
    storedTheme: readStoredMosTheme(win ? win.localStorage : null),
    prefersDark: probePrefersDark(win ?? null),
  });
  applyMosThemeToDocument(theme, doc ?? null);
  if (doc && doc.documentElement) {
    doc.documentElement.classList.add('mos-desktop-shell');
  }

  // 2. Product identity + the desktop platform bits the console needs
  //    (the document title; the query route truth).
  if (doc && doc.title !== SHELL_DOCUMENT_TITLE) {
    doc.title = SHELL_DOCUMENT_TITLE;
  }

  // 3. The WORKSPACE STORE (BROWSER_PROFILE — the payswap store law):
  //    demand-side intent records only, localStorage persistence,
  //    quarantine + fail-closed writes. The entry owns the subscription
  //    and re-mounts the console on every change.
  const store = createMosWorkspaceStore();

  // 4. The console state (the entry owns it; the components stay
  //    hook-free — this is the UXR-WC discipline the composer wiring
  //    established, now carrying the whole console).
  const bootRouteParam = new URLSearchParams(
    (win && win.location && win.location.search) || '',
  ).get('route');
  const bootPath = bootRouteParam === null || bootRouteParam.length === 0 ? '/' : bootRouteParam;
  const bootWorkbenchSurface = workbenchSurfaceFromAppPath(bootPath);
  let currentSection = mosConsoleSectionFromPath(bootPath);
  let missionPrefill = null;
  let prefillKey = 0;
  let receipts = {
    overviewIntake: null,
    mission: null,
    post: null,
    campaign: null,
    connection: null,
    task: null,
    model: null,
    tasks: null,
    automation: null,
    marketplace: null,
    agentSettings: null,
    browser: null,
  };
  let agent = {
    open: false,
    guidanceVisible: true,
    transcript: [],
  };
  let agentTranscriptSeq = 1;
  let committed = false;
  // The W35 emerged-surface state: the New Task draft (the composer's
  // model/mode/plan/context selection — the entry owns it, the hook-free
  // section composes it), the Model Settings provider family, and the
  // focus key (a discrete pick re-mounts; the restorer refocuses input).
  let newTaskDraft = initialMosNewTaskDraft();
  let modelProviderFamily = 'zai';
  let newTaskFocusKey = 0;
  // The W36 emerged-surface state: the Tasks surface's selected
  // conversation + archived-view toggle, and the Automations surface's
  // status filter (the entry owns it all; the sections stay hook-free).
  let selectedTaskId = null;
  let tasksShowArchived = false;
  let automationStatusFilter = 'all';
  // The W37 emerged-surface state: the Marketplace surface's segment
  // pill + the Installed management view toggle (the entry owns it;
  // the section stays hook-free).
  let marketplaceSegment = 'public';
  let marketplaceInstalledView = false;
  // The W38 emerged-surface state: the Agent Settings hub's active
  // settings section + the three form drafts (null = the list view —
  // the entry owns it all; the section stays hook-free).
  let activeSettingsSection = 'general';
  let mcpForm = null;
  let commandForm = null;
  let hookForm = null;
  // The last MOS section the console showed (the workbench handoff
  // excludes itself) — the resume controller returns here when the host
  // switches back from a substrate surface.
  let lastMosSection = currentSection;

  const setSection = (section) => {
    currentSection = section;
    lastMosSection = section;
    const appPath = mosConsoleSectionPath(section);
    const query = desktopQueryFromAppHref(appPath);
    if (win && win.history && typeof win.history.replaceState === 'function') {
      win.history.replaceState(null, '', query);
    }
    if (doc) {
      doc.title = mosConsoleSectionTitle(section);
    }
    ensureMosSurfaceVisible();
  };

  const remount = () => {
    const element = (
      <StrictMode>
        <MosDesktopErrorBoundary onError={(error) => console.error('[mos-desktop]', error)}>
          <FirstCommitNotifier
            onCommit={() => {
              if (!committed) {
                committed = true;
                onFirstReactCommit();
              }
            }}
          />
          <MosConsoleApp
            sectionId={currentSection}
            workspace={store.getSnapshot()}
            health={store.health()}
            quarantineCount={store.quarantineEntries().length}
            theme={theme}
            shellVersion={shellVersion}
            prefill={missionPrefill}
            prefillKey={prefillKey}
            receipts={receipts}
            agent={agent}
            newTaskDraft={newTaskDraft}
            modelProviderFamily={modelProviderFamily}
            selectedTaskId={selectedTaskId}
            tasksShowArchived={tasksShowArchived}
            automationStatusFilter={automationStatusFilter}
            marketplaceSegment={marketplaceSegment}
            marketplaceInstalledView={marketplaceInstalledView}
            activeSettingsSection={activeSettingsSection}
            mcpForm={mcpForm}
            commandForm={commandForm}
            hookForm={hookForm}
            browserState={browserState}
            browserAddressValue={browserAddressValue}
            browserWebviewGeneration={browserWebviewGeneration}
            browserGuestAttach={browserGuestAttach}
            renderNow={renderNowIso()}
            controller={controller}
          />
          <NewTaskFocusRestorer focusKey={newTaskFocusKey} />
        </MosDesktopErrorBoundary>
      </StrictMode>
    );
    reactRoot.render(element);
  };

  const storeSubscription = () => {
    remount();
  };
  store.subscribe(storeSubscription);

  /** A store call wrapped in the honest receipt echo (typed errors surface verbatim). */
  const withReceipt = (receiptKey, run) => {
    try {
      run();
    } catch (error) {
      receipts = {
        ...receipts,
        [receiptKey]:
          error instanceof Error ? error.message : String(error),
      };
      remount();
      return;
    }
    remount();
  };

  /* ------------------------------------------------------------------
   * W39 — THE BROWSER PANE (the substrate's embedded browser, emerged).
   *
   * The entry owns the browser chrome (the address draft, the
   * substrate's BrowserState shape, the guest generation) AND the
   * webview node itself: the section renders the element and hands the
   * node back through the STABLE ref callback below, so the guest is
   * never re-created by a console re-mount (the substrate's own webview
   * stability law — re-renders reconcile; only the section switch or a
   * renderer-failure rebuild replaces the node).
   *
   * The guest report rides the substrate's own preload contract:
   * window.zcode.browserViewAttachGuest (an unknown key takes main's
   * documented legacy path — an unclaimed, user-scoped tab the main
   * process CDP-attaches and can later hand to an authorized session).
   * ------------------------------------------------------------------ */
  let browserState = { ...initialMosBrowserState() };
  let browserAddressValue = '';
  let browserWebviewGeneration = 0;
  /** 'idle' → 'pending' → 'attached' | 'rejected:<reason>' | 'unavailable'. */
  let browserGuestAttach = 'idle';
  let browserWebviewNode = null;
  let browserWebviewWired = false;
  /** The navigation queued before dom-ready (first nav / rebuild restore). */
  let browserPendingUrl = null;
  /** The last webContentsId reported to main (the detach-before-rebuild contract). */
  let browserLastReportedGuestId = 0;

  const browserRecordUrl = () => {
    const session = store.getSnapshot().browserSession;
    return session === null ? '' : session.url;
  };

  const browserSyncChrome = (node) => {
    const canGoBack = safeMosWebviewCall(() => node.canGoBack(), false);
    const canGoForward = safeMosWebviewCall(() => node.canGoForward(), false);
    const currentUrl = safeMosWebviewCall(() => node.getURL(), browserState.currentUrl);
    browserState = {
      ...browserState,
      canGoBack,
      canGoForward,
      currentUrl,
      title: safeMosWebviewCall(() => node.getTitle(), browserState.title),
    };
    browserAddressValue = displayMosBrowserUrl(currentUrl);
    remount();
  };

  /** Persist a confirmed navigation (fail-closed; the guest only commits loadable URLs). */
  const browserOnNavigated = (url) => {
    if (typeof url === 'string' && url !== '' && url !== MOS_BROWSER_DEFAULT_URL) {
      try {
        const record = store.recordBrowserUrl(url);
        receipts = { ...receipts, browser: `RECORDED — ${record.url} is the workspace browser record now. The pane restores it on the next visit.` };
      } catch (error) {
        receipts = {
          ...receipts,
          browser: `STORE ERROR — ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    if (browserWebviewNode !== null) browserSyncChrome(browserWebviewNode);
  };

  /** Report the guest to the substrate's main process (deduped per webContentsId). */
  const browserReportGuest = (node) => {
    const bridge = win && win.zcode ? win.zcode : null;
    const attach = bridge ? bridge.browserViewAttachGuest : undefined;
    if (typeof attach !== 'function') {
      if (browserGuestAttach !== 'unavailable') {
        browserGuestAttach = 'unavailable';
        receipts = { ...receipts, browser: mosBrowserGuestUnavailableReceipt() };
        remount();
      }
      return;
    }
    const webContentsId = safeMosWebviewCall(() => node.getWebContentsId(), 0);
    if (webContentsId <= 0 || webContentsId === browserLastReportedGuestId) return;
    browserLastReportedGuestId = webContentsId;
    browserGuestAttach = 'pending';
    remount();
    attach({
      key: MOS_BROWSER_GUEST_KEY,
      webContentsId,
      active: true,
      workspaceKey: MOS_BROWSER_WORKSPACE_KEY,
    })
      .then((result) => {
        if (result === undefined || result === null || result.ok) {
          browserGuestAttach = 'attached';
          receipts = { ...receipts, browser: mosBrowserGuestAttachedReceipt(MOS_BROWSER_GUEST_KEY) };
        } else {
          browserGuestAttach = `rejected:${result.reason ?? 'unknown'}`;
        }
        remount();
      })
      .catch(() => {
        browserGuestAttach = 'unavailable';
        remount();
      });
  };

  /** The renderer-failure rebuild (the substrate's detach-before-replacement law). */
  const rebuildBrowserGuest = async () => {
    const bridge = win && win.zcode ? win.zcode : null;
    const detach = bridge ? bridge.browserViewDetachGuest : undefined;
    if (browserLastReportedGuestId > 0 && typeof detach === 'function') {
      try {
        const detached = await detach({
          key: MOS_BROWSER_GUEST_KEY,
          webContentsId: browserLastReportedGuestId,
        });
        if (!detached) return; // main 未确认旧 CDP 断开 — 取消重建
      } catch {
        return;
      }
    }
    browserLastReportedGuestId = 0;
    browserWebviewWired = false;
    const restorable =
      browserState.currentUrl !== MOS_BROWSER_DEFAULT_URL
        ? browserState.currentUrl
        : browserRecordUrl();
    browserPendingUrl = restorable !== '' ? restorable : null;
    browserWebviewGeneration += 1;
    browserState = {
      ...initialMosBrowserState(),
      currentUrl: restorable !== '' ? restorable : MOS_BROWSER_DEFAULT_URL,
      isLoading: restorable !== '',
    };
    remount();
  };

  /** Wire one webview node's events (once per node — the ref hands every new node here). */
  const wireBrowserWebview = (node) => {
    if (browserWebviewWired) return;
    browserWebviewWired = true;

    node.addEventListener('did-attach', () => {
      browserReportGuest(node);
    });

    node.addEventListener('dom-ready', () => {
      browserState = { ...browserState, isReady: true };
      browserReportGuest(node);
      const pending = browserPendingUrl;
      browserPendingUrl = null;
      const current = safeMosWebviewCall(() => node.getURL(), '');
      const restorable =
        browserState.currentUrl !== MOS_BROWSER_DEFAULT_URL
          ? browserState.currentUrl
          : browserRecordUrl();
      const target =
        pending !== null
          ? pending
          : current === '' || current === MOS_BROWSER_DEFAULT_URL
            ? restorable !== '' && restorable !== current
              ? restorable
              : null
            : null;
      if (target !== null) {
        browserState = { ...browserState, isLoading: true };
        remount();
        node.loadURL(target).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes('ERR_ABORTED')) {
            browserState = {
              ...browserState,
              errorMessage: mosBrowserLoadFailedMessage(message),
              isLoading: false,
            };
            remount();
          }
        });
        return;
      }
      browserSyncChrome(node);
    });

    node.addEventListener('did-start-loading', () => {
      if (!browserState.isLoading) {
        browserState = { ...browserState, isLoading: true };
        remount();
      }
    });

    node.addEventListener('did-stop-loading', () => {
      browserState = { ...browserState, isLoading: false };
      browserSyncChrome(node);
    });

    node.addEventListener('did-navigate', (event) => {
      browserOnNavigated(event.url);
    });

    node.addEventListener('did-navigate-in-page', (event) => {
      browserOnNavigated(event.url);
    });

    node.addEventListener('page-title-updated', (event) => {
      if (browserState.title !== event.title) {
        browserState = { ...browserState, title: event.title };
        remount();
      }
    });

    node.addEventListener('did-fail-load', (event) => {
      if (!event.isMainFrame || event.errorCode === -3) return;
      browserState = {
        ...browserState,
        currentUrl: event.validatedURL || browserState.currentUrl,
        errorMessage: mosBrowserLoadFailedMessage(event.errorDescription),
        loadErrorCode: event.errorCode,
        isLoading: false,
      };
      browserAddressValue = displayMosBrowserUrl(
        event.validatedURL || browserState.currentUrl,
      );
      remount();
    });

    node.addEventListener('render-process-gone', (event) => {
      const reason = event.details ? event.details.reason : 'unknown';
      const exitCode = event.details ? event.details.exitCode : 0;
      if (isRecoverableMosBrowserGuestExitReason(reason)) {
        void rebuildBrowserGuest();
        return;
      }
      browserState = {
        ...browserState,
        guestFailure: { reason: String(reason), exitCode: Number(exitCode) },
        isLoading: false,
        isReady: false,
      };
      remount();
    });
  };

  /** The STABLE webview ref callback (the section's onWebviewRef prop). */
  const onBrowserWebviewRef = (node) => {
    browserWebviewNode = node === null || node === undefined ? null : node;
    browserWebviewWired = false;
    if (browserWebviewNode !== null) {
      wireBrowserWebview(browserWebviewNode);
    }
  };

  const deliverMissionPrefill = (direction, statement) => {
    missionPrefill = { direction, statement: statement ?? '' };
    prefillKey += 1;
    receipts = { ...receipts, mission: null };
    setSection('missions');
    remount();
  };

  const agentAppend = (role, text) => {
    agent = {
      ...agent,
      transcript: [
        ...agent.transcript,
        { id: agentTranscriptSeq, role, text, at: new Date().toISOString() },
      ],
    };
    agentTranscriptSeq += 1;
  };

  const controller = {
    onNavigateSection(section) {
      receipts = { ...receipts, overviewIntake: null };
      setSection(section);
      remount();
    },

    onWorkbenchSurface(surface) {
      const appPath = surface === 'settings' ? '/workbench/settings' : '/workbench';
      const query = desktopQueryFromAppHref(appPath);
      if (win && win.history && typeof win.history.replaceState === 'function') {
        win.history.replaceState(null, '', query);
      }
      if (doc) {
        doc.title = workbenchTitleFor(surface);
      }
      requestSubstrateSurface(surface);
    },

    onNewTaskDraftChange(partial) {
      newTaskDraft = { ...newTaskDraft, ...partial };
      newTaskFocusKey += 1;
      remount();
    },

    onNewTaskSubmit(input) {
      withReceipt('task', () => {
        const task = store.recordAgentTask(input);
        receipts = {
          ...receipts,
          task: `TASK_RECORDED — task ${task.id} "${task.title}" on ${task.modelId} (${task.mode} mode${task.planEnabled ? ' · plan' : ''}). A workspace record; the substrate runs it when an account is connected.`,
        };
      });
    },

    onManageModels() {
      receipts = { ...receipts, model: null };
      setSection('model-settings');
      remount();
    },

    onSelectModelProviderFamily(family) {
      modelProviderFamily = family;
      remount();
    },

    onToggleModelEnabled(modelId, enabled) {
      withReceipt('model', () => {
        store.setModelDisabled(modelId, !enabled);
        receipts = {
          ...receipts,
          model: `${modelId} ${enabled ? 'enabled' : 'disabled'} in the model list — the composer picker follows this workspace record.`,
        };
      });
    },

    onModelSettingsNote(note) {
      receipts = { ...receipts, model: note };
      remount();
    },

    /* ---- W36 — the Tasks surface (the emerged task list + conversation) ---- */

    onSelectTask(id) {
      selectedTaskId = id;
      receipts = { ...receipts, tasks: null };
      remount();
    },

    onToggleTasksArchived() {
      tasksShowArchived = !tasksShowArchived;
      remount();
    },

    onTaskPinned(id, pinned) {
      withReceipt('tasks', () => {
        const task = store.setTaskPinned(id, pinned);
        receipts = {
          ...receipts,
          tasks: `Task ${task.id} ${pinned ? 'pinned' : 'unpinned'} — the Pinned section follows this workspace decision.`,
        };
      });
    },

    onTaskArchived(id, archived) {
      withReceipt('tasks', () => {
        const task = store.setTaskArchived(id, archived);
        if (archived && selectedTaskId === id) {
          selectedTaskId = null;
        }
        receipts = {
          ...receipts,
          tasks: `Task ${task.id} ${archived ? 'archived — the record is kept in the Archived view' : 'restored to the active task list'}.`,
        };
      });
    },

    onRenameTask(id, title) {
      withReceipt('tasks', () => {
        const task = store.renameTask(id, title);
        receipts = {
          ...receipts,
          tasks: `Renamed — task ${task.id} is now "${task.title}".`,
        };
      });
    },

    onAppendTaskFollowUp(id, prompt) {
      withReceipt('tasks', () => {
        const task = store.appendTaskFollowUp(id, prompt);
        receipts = {
          ...receipts,
          tasks: `FOLLOW_UP_RECORDED — the turn is on task ${task.id}'s conversation. A workspace record; the substrate runs it when an account is connected.`,
        };
      });
    },

    /* ---- W36 — the Automations surface (the emerged schedule records) ---- */

    onAutomationFilter(filter) {
      automationStatusFilter = filter;
      remount();
    },

    onAutomationPaused(id, paused) {
      withReceipt('automation', () => {
        const automation = store.setAutomationPaused(id, paused);
        receipts = {
          ...receipts,
          automation: `Automation ${automation.id} (${automation.title}) ${paused ? 'paused — the schedule holds with no next run' : 'continued — the schedule record resumes'}.`,
        };
      });
    },

    onAutomationRun(id) {
      withReceipt('automation', () => {
        const automation = store.requestAutomationRun(id);
        receipts = {
          ...receipts,
          automation: `RUN_REQUESTED — automation ${automation.id} (${automation.title}). The substrate dispatches it when an account is connected; runCount stays the honest ${automation.runCount}.`,
        };
      });
    },

    onAutomationDeleted(id) {
      withReceipt('automation', () => {
        const automation = store.deleteAutomation(id);
        receipts = {
          ...receipts,
          automation: `Deleted — automation ${automation.id} (${automation.title}). This cannot be undone.`,
        };
      });
    },

    onAutomationKeepAwake(enabled) {
      withReceipt('automation', () => {
        store.setAutomationKeepAwake(enabled);
        receipts = {
          ...receipts,
          automation: `Keep-awake ${enabled ? 'on' : 'off'} — the workspace record the app follows while a chat runs.`,
        };
      });
    },

    onAutomationNote(note) {
      receipts = {
        ...receipts,
        automation:
          note === 'refresh'
            ? 'Refreshed — the automations are workspace records in this profile; there is no remote list to re-fetch.'
            : null,
      };
      remount();
    },

    /* ---- W37 — the Marketplace surface (the emerged plugin inventory) ---- */

    onMarketplaceSegment(segment) {
      marketplaceSegment = segment;
      marketplaceInstalledView = false;
      receipts = { ...receipts, marketplace: null };
      remount();
    },

    onToggleMarketplaceInstalledView() {
      marketplaceInstalledView = !marketplaceInstalledView;
      receipts = { ...receipts, marketplace: null };
      remount();
    },

    onInstallMarketplacePlugin(pluginId) {
      withReceipt('marketplace', () => {
        const record = store.installMarketplacePlugin(pluginId);
        receipts = {
          ...receipts,
          marketplace: `INSTALLED — ${record.name} is a workspace record now. The substrate syncs its skills and MCP servers when an account is connected.`,
        };
      });
    },

    onUninstallMarketplacePlugin(pluginId) {
      withReceipt('marketplace', () => {
        const record = store.uninstallMarketplacePlugin(pluginId);
        receipts = {
          ...receipts,
          marketplace: `Uninstalled — ${record.name}'s workspace record was removed.`,
        };
      });
    },

    onMarketplaceAddNote() {
      receipts = {
        ...receipts,
        marketplace:
          'The catalog is frozen to the official marketplace listing captured in this build. Adding marketplace sources arrives with a connected substrate account.',
      };
      remount();
    },

    onMarketplaceInstalledNote() {
      receipts = {
        ...receipts,
        marketplace:
          'Installed plugins are workspace records in this profile — the substrate syncs their skills and MCP servers when an account is connected.',
      };
      remount();
    },

    /* ---- W38 — the Agent Settings surface (the emerged settings hub) ---- */

    onSelectSettingsSection(id) {
      activeSettingsSection = id;
      mcpForm = null;
      commandForm = null;
      hookForm = null;
      receipts = { ...receipts, agentSettings: null };
      remount();
    },

    onOpenMcpForm() {
      mcpForm = initialMosMcpFormState();
      receipts = { ...receipts, agentSettings: null };
      remount();
    },

    onEditMcpForm(recordId) {
      const record = store.getSnapshot().mcpServers.find((entry) => entry.id === recordId);
      if (record === undefined) {
        receipts = {
          ...receipts,
          agentSettings: `no MCP server ${recordId} exists in this workspace`,
        };
        remount();
        return;
      }
      mcpForm = mosMcpFormFromServer(record);
      receipts = { ...receipts, agentSettings: null };
      remount();
    },

    onMcpFormChange(partial) {
      if (mcpForm === null) return;
      mcpForm = { ...mcpForm, ...partial };
      remount();
    },

    onMcpFormCancel() {
      mcpForm = null;
      receipts = { ...receipts, agentSettings: null };
      remount();
    },

    onMcpFormSubmit() {
      withReceipt('agentSettings', () => {
        const form = mcpForm;
        if (form === null) return;
        const record = store.upsertMcpServer({
          id: form.editingId,
          name: form.name,
          storageLevel: form.storageLevel,
          type: form.type,
          command: form.command,
          args: form.args,
          envJson: form.envJson,
          url: form.url,
          headersJson: form.headersJson,
          timeoutMs: form.timeoutMs,
          protocolVersion: form.protocolVersion,
        });
        mcpForm = null;
        receipts = {
          ...receipts,
          agentSettings: `SAVED — MCP server "${record.name}" is a workspace record now. The substrate connects it when an account is connected.`,
        };
      });
    },

    onToggleMcpServer(id, enabled) {
      withReceipt('agentSettings', () => {
        const record = store.setMcpServerEnabled(id, enabled);
        receipts = {
          ...receipts,
          agentSettings: `MCP server "${record.name}" ${enabled ? 'enabled' : 'disabled'} — the workspace record the substrate follows when an account is connected.`,
        };
      });
    },

    onDeleteMcpServer(id) {
      withReceipt('agentSettings', () => {
        const record = store.deleteMcpServer(id);
        receipts = {
          ...receipts,
          agentSettings: `Deleted — MCP server "${record.name}"'s workspace record was removed; this cannot be undone.`,
        };
      });
    },

    onOpenCommandForm() {
      commandForm = initialMosCommandFormState();
      receipts = { ...receipts, agentSettings: null };
      remount();
    },

    onEditCommandForm(recordId) {
      const record = store.getSnapshot().userCommands.find((entry) => entry.id === recordId);
      if (record === undefined) {
        receipts = {
          ...receipts,
          agentSettings: `no command ${recordId} exists in this workspace`,
        };
        remount();
        return;
      }
      commandForm = mosCommandFormFromCommand(record);
      receipts = { ...receipts, agentSettings: null };
      remount();
    },

    onCommandFormChange(partial) {
      if (commandForm === null) return;
      commandForm = { ...commandForm, ...partial };
      remount();
    },

    onCommandFormCancel() {
      commandForm = null;
      receipts = { ...receipts, agentSettings: null };
      remount();
    },

    onCommandFormSubmit() {
      withReceipt('agentSettings', () => {
        const form = commandForm;
        if (form === null) return;
        const record = store.upsertUserCommand({
          id: form.editingId,
          name: form.name,
          description: form.description,
          argumentHint: form.argumentHint,
          prompt: form.prompt,
        });
        commandForm = null;
        receipts = {
          ...receipts,
          agentSettings: `SAVED — command /${record.name} is a workspace record now. The substrate's command picker reads it when an account is connected.`,
        };
      });
    },

    onDeleteUserCommand(id) {
      withReceipt('agentSettings', () => {
        const record = store.deleteUserCommand(id);
        receipts = {
          ...receipts,
          agentSettings: `Deleted — command /${record.name}'s workspace record was removed; this cannot be undone.`,
        };
      });
    },

    onOpenHookForm() {
      hookForm = initialMosHookFormState();
      receipts = { ...receipts, agentSettings: null };
      remount();
    },

    onEditHookForm(recordId) {
      const record = store.getSnapshot().hooks.find((entry) => entry.id === recordId);
      if (record === undefined) {
        receipts = {
          ...receipts,
          agentSettings: `no hook ${recordId} exists in this workspace`,
        };
        remount();
        return;
      }
      hookForm = mosHookFormFromHook(record);
      receipts = { ...receipts, agentSettings: null };
      remount();
    },

    onHookFormChange(partial) {
      if (hookForm === null) return;
      hookForm = { ...hookForm, ...partial };
      remount();
    },

    onHookFormCancel() {
      hookForm = null;
      receipts = { ...receipts, agentSettings: null };
      remount();
    },

    onHookFormSubmit() {
      withReceipt('agentSettings', () => {
        const form = hookForm;
        if (form === null) return;
        const record = store.upsertHook({
          id: form.editingId,
          event: form.event,
          matcher: form.matcher,
          type: form.type,
          command: form.command,
          timeoutSeconds: form.timeoutSeconds,
        });
        hookForm = null;
        receipts = {
          ...receipts,
          agentSettings: `SAVED — the ${record.event} hook is a workspace record now. The substrate executes it on the real event when an account is connected.`,
        };
      });
    },

    onToggleHook(id, enabled) {
      withReceipt('agentSettings', () => {
        const record = store.setHookEnabled(id, enabled);
        receipts = {
          ...receipts,
          agentSettings: `${record.event} hook ${enabled ? 'enabled' : 'disabled'} — the workspace record the substrate follows.`,
        };
      });
    },

    onDeleteHook(id) {
      withReceipt('agentSettings', () => {
        const record = store.deleteHook(id);
        receipts = {
          ...receipts,
          agentSettings: `Deleted — the ${record.event} hook's workspace record was removed; this cannot be undone.`,
        };
      });
    },

    onOpenModelSettings() {
      receipts = { ...receipts, agentSettings: null };
      setSection('model-settings');
      remount();
    },

    onOpenMarketplace() {
      receipts = { ...receipts, agentSettings: null };
      setSection('marketplace');
      remount();
    },

    onSkillsNote(note) {
      receipts = {
        ...receipts,
        agentSettings:
          note === 'refresh' ? MOS_SETTINGS_SKILLS_REFRESH_NOTE : MOS_SETTINGS_SKILLS_NEW_NOTE,
      };
      remount();
    },

    /* ---- W39 — the Browser surface ---- */
    onBrowserAddressChange(value) {
      browserAddressValue = value;
      remount();
    },

    onBrowserSubmitAddress() {
      const normalized = normalizeMosBrowserUrl(browserAddressValue);
      if (normalized === null) {
        browserState = {
          ...browserState,
          errorMessage: MOS_BROWSER_INVALID_URL_MESSAGE,
          loadErrorCode: null,
        };
        remount();
        return;
      }
      browserAddressValue = displayMosBrowserUrl(normalized);
      browserState = {
        ...browserState,
        errorMessage: null,
        loadErrorCode: null,
        guestFailure: null,
        currentUrl: normalized,
        isLoading: true,
      };
      if (browserWebviewNode === null || !browserState.isReady) {
        // The guest is not mounted/ready yet (first navigation or a
        // rebuild in flight): queue to dom-ready — the substrate's law.
        browserPendingUrl = normalized;
        remount();
        return;
      }
      remount();
      browserWebviewNode.loadURL(normalized).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('ERR_ABORTED')) {
          browserState = {
            ...browserState,
            errorMessage: mosBrowserLoadFailedMessage(message),
            isLoading: false,
          };
          remount();
        }
      });
    },

    onBrowserGoBack() {
      if (browserWebviewNode === null || !browserState.canGoBack) return;
      safeMosWebviewCall(() => { browserWebviewNode.goBack(); }, undefined);
    },

    onBrowserGoForward() {
      if (browserWebviewNode === null || !browserState.canGoForward) return;
      safeMosWebviewCall(() => { browserWebviewNode.goForward(); }, undefined);
    },

    onBrowserReload() {
      if (browserWebviewNode === null || !browserState.isReady) return;
      safeMosWebviewCall(() => { browserWebviewNode.reload(); }, undefined);
    },

    onBrowserOpenExternal() {
      if (browserWebviewNode === null || !browserState.isReady) return;
      const currentUrl = safeMosWebviewCall(() => browserWebviewNode.getURL(), '');
      if (!isDefaultBrowserOpenableUrl(currentUrl)) return;
      const bridge = win && win.zcode ? win.zcode : null;
      if (bridge && typeof bridge.openExternal === 'function') {
        bridge.openExternal(currentUrl);
      }
    },

    onBrowserOpenDevTools() {
      if (browserWebviewNode === null || !browserState.isReady) return;
      safeMosWebviewCall(() => { browserWebviewNode.openDevTools(); }, undefined);
    },

    onBrowserRetryGuest() {
      void rebuildBrowserGuest();
    },

    onBrowserRetryLoad() {
      const retryUrl =
        browserState.currentUrl !== MOS_BROWSER_DEFAULT_URL
          ? browserState.currentUrl
          : browserRecordUrl();
      if (retryUrl === '') return;
      browserAddressValue = displayMosBrowserUrl(retryUrl);
      browserState = {
        ...browserState,
        errorMessage: null,
        loadErrorCode: null,
        currentUrl: retryUrl,
        isLoading: true,
      };
      if (browserWebviewNode === null || !browserState.isReady) {
        browserPendingUrl = retryUrl;
        remount();
        return;
      }
      remount();
      browserWebviewNode.loadURL(retryUrl).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('ERR_ABORTED')) {
          browserState = {
            ...browserState,
            errorMessage: mosBrowserLoadFailedMessage(message),
            isLoading: false,
          };
          remount();
        }
      });
    },

    onBrowserPickerNote() {
      receipts = { ...receipts, browser: MOS_BROWSER_ELEMENT_PICKER_NOTE };
      remount();
    },

    onBrowserResponsiveNote() {
      receipts = { ...receipts, browser: MOS_BROWSER_RESPONSIVE_NOTE };
      remount();
    },

    // The STABLE webview node callback — the section's onWebviewRef prop.
    // Its identity never changes across re-mounts, so React never churns
    // the node's ref (the substrate's webview stability law).
    onBrowserWebviewRef,

    onIntake(statement) {
      receipts = {
        ...receipts,
        overviewIntake: `Mission declaration prefilled — finish the intent on Missions. Recording the intent is all this does.`,
      };
      deliverMissionPrefill('promote', statement);
    },

    onAction(actionId) {
      const action = mosAction(actionId);
      const direction = action === undefined ? 'promote' : action.direction;
      receipts = {
        ...receipts,
        overviewIntake: null,
      };
      deliverMissionPrefill(direction, '');
    },

    onDeclareMission(input) {
      withReceipt('mission', () => {
        const mission = store.recordMissionIntent(input);
        receipts = {
          ...receipts,
          mission: `INTENT_RECORDED — mission ${mission.id} "${mission.statement}" (reward metric: ${mission.metric}). The Missions authority owns the lifecycle rungs after this.`,
        };
        missionPrefill = null;
      });
    },

    onComposePost(input) {
      withReceipt('post', () => {
        const post = store.recordPostDraft(input);
        receipts = {
          ...receipts,
          post:
            post.status === 'SCHEDULED'
              ? `SCHEDULED — post ${post.id} on ${post.platform} for ${post.scheduledFor}. A workspace record; no live transport is bound.`
              : `DRAFT recorded — post ${post.id} on ${post.platform}. A workspace record; no live transport is bound.`,
        };
      });
    },

    onSchedulePost(id, when) {
      withReceipt('post', () => {
        const post = store.schedulePost(id, when);
        receipts = {
          ...receipts,
          post: `SCHEDULED — post ${post.id} on ${post.platform} for ${post.scheduledFor}.`,
        };
      });
    },

    onDraftCampaign(input) {
      withReceipt('campaign', () => {
        const campaign = store.recordCampaignDraft(input);
        receipts = {
          ...receipts,
          campaign: `DRAFT recorded — campaign ${campaign.id} "${campaign.objective}" (budget ${campaign.budget}, cap ${campaign.dailyCap}/day). Nothing spends before the arm gate.`,
        };
      });
    },

    onCompileCampaign(id) {
      withReceipt('campaign', () => {
        const campaign = store.compileCampaign(id);
        receipts = {
          ...receipts,
          campaign: `COMPILED — campaign ${campaign.id} carries the Lab's SIMULATION-labelled counterfactual; the arm gate is pending human approval in Activity.`,
        };
      });
    },

    onDecideApproval(id, decision) {
      withReceipt('campaign', () => {
        const approval = store.decideApproval(id, decision);
        receipts = {
          ...receipts,
          campaign:
            approval.status === 'APPROVED'
              ? `Arm gate ${approval.id} APPROVED — the campaign is ARMED in this workspace. Live spend still awaits a connected ad transport.`
              : `Arm gate ${approval.id} DENIED — the denial is relayed verbatim; the campaign stays un-armed.`,
        };
      });
    },

    onConnectProvider(providerId) {
      withReceipt('connection', () => {
        const account = store.beginProviderSetup(providerId);
        receipts = {
          ...receipts,
          connection: `SETUP_REQUIRED — the setup request for ${account.providerId} is recorded (${account.id}). This release binds no live transport, so this is a record, not a connection.`,
        };
      });
    },

    onToggleTheme() {
      theme = theme === 'light' ? 'dark' : 'light';
      applyMosThemeToDocument(theme, doc ?? null);
      try {
        if (win && win.localStorage) {
          win.localStorage.setItem(MOS_THEME_STORAGE_KEY, theme);
        }
      } catch {
        // A broken store must not break the toggle — the session theme still applies.
      }
      remount();
    },

    onAgentToggle() {
      agent = { ...agent, open: !agent.open };
      remount();
    },

    onAgentSubmitText(text) {
      agentAppend('user', text);
      const reply = routeMosAgentText(text);
      agentAppend('mos', reply.reply);
      if (reply.kind === 'action') {
        const action = mosAction(reply.action);
        const direction = action === undefined ? reply.action : action.direction;
        agent = { ...agent, open: true };
        deliverMissionPrefill(direction, '');
        return;
      }
      if (reply.kind === 'connect') {
        agent = { ...agent, open: true };
        withReceipt('connection', () => {
          const account = store.beginProviderSetup(reply.providerId);
          receipts = {
            ...receipts,
            connection: `SETUP_REQUIRED — setup request for ${account.providerId} recorded (${account.id}); awaiting the transport.`,
          };
        });
        return;
      }
      if (reply.kind === 'navigate') {
        setSection(reply.section);
      }
      remount();
    },

    onAgentDismissGuidance() {
      agent = { ...agent, guidanceVisible: false };
      remount();
    },
  };

  // The link bridge: internal anchors route through the console's
  // section navigation instead of reloading the document.
  installDesktopShellLinkNavigation((href) => {
    const workbenchSurface = workbenchSurfaceFromAppPath(href);
    if (workbenchSurface !== null) {
      controller.onWorkbenchSurface(workbenchSurface);
      return;
    }
    setSection(mosConsoleSectionFromPath(href));
    remount();
  });

  const bootstrapError = (message) => {
    reactRoot.render(
      <MosBootstrapErrorView
        message={message}
        onRetry={() => globalThis.location.reload()}
      />,
    );
  };

  // 5. Boot: mount the console immediately (the store snapshot is
  //    synchronous — the BROWSER_PROFILE law), then hand a workbench
  //    boot route to the host (the MOS chrome still mounts underneath,
  //    hidden by the host, so returning needs no re-boot).
  try {
    remount();
    if (bootWorkbenchSurface !== null) {
      if (doc) {
        doc.title = workbenchTitleFor(bootWorkbenchSurface);
      }
      requestSubstrateSurface(bootWorkbenchSurface);
    }
  } catch (error) {
    bootstrapError(error instanceof Error ? error.message : String(error));
  }

  // The RESUME controller: the host calls this when switching back from
  // a substrate surface (the floating back control) — the console
  // re-shows its last section with the title and the MOS surface
  // ensured visible (soft, no document reload).
  return {
    resumeMosSurface() {
      setSection(lastMosSection);
      remount();
    },
  };
}
