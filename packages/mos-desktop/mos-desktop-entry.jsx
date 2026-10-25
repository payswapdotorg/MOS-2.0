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
} from './src/index.js';
import { MosConsoleApp } from './src/index.js';
import './mos-desktop-shell.css';
import '../mos-web/src/styles.css';

const SHELL_DOCUMENT_TITLE = 'MOS — Marketing Operating System';
const DEFAULT_SHELL_VERSION = '0.1.0';
const WORKBENCH_TITLES = {
  'new-task': 'MOS — Agent Workbench · New Task',
  chat: 'MOS — Agent Workbench',
  automations: 'MOS — Agent Workbench · Automations',
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
  };
  let agent = {
    open: false,
    guidanceVisible: true,
    transcript: [],
  };
  let agentTranscriptSeq = 1;
  let committed = false;
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
            controller={controller}
          />
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
      const appPath =
        surface === 'new-task'
          ? '/workbench/new-task'
          : surface === 'automations'
            ? '/workbench/automations'
            : surface === 'settings'
              ? '/workbench/settings'
              : '/workbench';
      const query = desktopQueryFromAppHref(appPath);
      if (win && win.history && typeof win.history.replaceState === 'function') {
        win.history.replaceState(null, '', query);
      }
      if (doc) {
        doc.title = workbenchTitleFor(surface);
      }
      requestSubstrateSurface(surface);
    },

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
