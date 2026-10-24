// MOS desktop shell entry (registry module `desktop`) — the mount skeleton
// mirroring @mos/web's src/main.jsx bootstrap pattern with the desktop
// platform port and the file:// route bridge:
//   pre-paint theme seed → production composition → app-shell read model →
//   query-param route dispatch → route view-model load →
//   error-boundary-wrapped mount (loading surface while the page model loads).
//
// WHY .jsx at the PACKAGE ROOT (disclosed): the frozen boundary harness
// (harness/mos-boundary-check.mjs + harness/mos-boundary-rules.json) scans
// `.ts/.tsx/.mts/.js/.mjs` files under `packages/mos-*` and forbids every
// bare npm import there — including `react-dom/client`, which mounting
// requires. This entry therefore uses the `.jsx` extension, which the
// frozen rules do not manage — the same disclosed pattern @mos/web's
// src/main.jsx established. All logic it calls lives in scanned, tested
// TypeScript modules under `src/` and the composition seam under
// `composition/`; the package's own presentation-only structural test
// covers this file (no Zcode-substrate imports, no domain-runtime
// imports, no engine SDKs).
//
// Composition disclosure: this entry boots the shell on the PRODUCTION
// composition root (composition/compose-production-mos-web.ts) — REAL
// @mos/identity + @mos/missions + @mos/lab runtimes behind the shell's
// view ports, honest-unavailable bindings for the surfaces awaiting the
// MOS service transport (P2), no demo seeds.

import { Component, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MosAppErrorView,
  MosAppShell,
  MosBootstrapErrorView,
  applyMosThemeToDocument,
  composerConfirmPlan,
  composerReducer,
  declareConsoleIntentThroughPort,
  consoleIntentOutcomeHref,
  declareLabIntentThroughPort,
  declareMissionIntentThroughPort,
  initialComposerState,
  installMosComposerHotkey,
  labIntentOutcomeHref,
  loadMosRouteView,
  missionIntentOutcomeHref,
  missionScopeFromTenantContext,
  mosRouteTitle,
  probePrefersDark,
  readStoredMosTheme,
  resolveMosInitialTheme,
  subscribeMosComposerOpen,
} from '@mos/web';
import {
  createDesktopMosPlatform,
  desktopQueryFromAppHref,
  desktopRouteFromSearch,
  installDesktopShellLinkNavigation,
  navigateDesktopAppHref,
  workbenchSurfaceFromAppPath,
} from './src/index.js';
import { createProductionMosWebComposition } from './composition/compose-production-mos-web.js';
import './mos-desktop-shell.css';
import '../mos-web/src/styles.css';

const SHELL_DOCUMENT_TITLE = 'MOS — Marketing Operating System';
const DEFAULT_SHELL_VERSION = '0.1.0';

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
  // NEVER resolves a MOS page model for those routes — it rewrites the
  // route query (the URL stays the route truth), sets the workbench title,
  // and hands the surface request to the host, which mounts the substrate
  // UI behind the MOS chrome (the host owns both surface containers).
  const onRequestSubstrateSurface = options.onRequestSubstrateSurface ?? null;
  const requestSubstrateSurface = (surface) => {
    if (onRequestSubstrateSurface !== null) {
      onRequestSubstrateSurface(surface);
    }
  };
  const workbenchTitleFor = (surface) =>
    surface === 'new-task'
      ? 'MOS — Agent Workbench · New Task'
      : surface === 'automations'
        ? 'MOS — Agent Workbench · Automations'
        : surface === 'settings'
          ? 'MOS — Agent Workbench · Settings'
          : 'MOS — Agent Workbench';
  // Hosts pass their own React root (the desktop renderer pre-creates one
  // for the database-startup admission screen); otherwise this entry owns
  // the root.
  const reactRoot = options.reactRoot ?? createRoot(rootElement);

  // 1. Pre-paint theme (the canonical resolution on mount) + the shell's
  //    body policy class (the retained ZCode UI stylesheet hides body
  //    overflow for its own surfaces; the MOS shell scrolls normally).
  const win = globalThis.window;
  applyMosThemeToDocument(
    resolveMosInitialTheme({
      storedTheme: readStoredMosTheme(win ? win.localStorage : null),
      prefersDark: probePrefersDark(win ?? null),
    }),
    globalThis.document ?? null,
  );
  const doc = globalThis.document;
  if (doc && doc.documentElement) {
    doc.documentElement.classList.add('mos-desktop-shell');
  }

  // 2. Product identity + the desktop platform port + the file:// link
  //    bridge (app-internal anchors become query-param navigation).
  if (doc && doc.title !== SHELL_DOCUMENT_TITLE) {
    doc.title = SHELL_DOCUMENT_TITLE;
  }
  const platform = createDesktopMosPlatform();
  platform.setDocumentTitle(SHELL_DOCUMENT_TITLE);

  // 3. The PRODUCTION composition (REAL domain runtimes, honest verdicts).
  const composition = createProductionMosWebComposition({});
  // The shell read model ref — the soft refresh paths (below) re-resolve the
  // page model against the SAME shell view without a document reload.
  const shellViewRef = { current: null };
  // The current route-view bundle — the composer re-renders the shell in
  // place when its overlay state changes (the entries own the composer's
  // module-level UI state; the components stay hook-free). Mirrors
  // @mos/web's src/main.jsx composer wiring verbatim (UXR-WC).
  let currentRouteViewBundle = null;
  // THE UNIVERSAL AGENT COMPOSER (§6 P0, UXR-WC): the entry owns the
  // composer's UI state (the PURE reducer) and re-mounts the shell on every
  // event; the `confirm` event is consumed HERE — the plan's declaration is
  // built by the EXISTING form parsers and routed through the EXISTING
  // onDeclare* callbacks, and a returned outcome promise folds the
  // authority's verdict back into the receipt card.
  let composerState = initialComposerState();
  const remountForComposer = () => {
    if (currentRouteViewBundle !== null && shellViewRef.current !== null) {
      mountShell(currentRouteViewBundle);
    }
  };
  const dispatchComposerEvent = (event) => {
    if (event.kind === 'confirm') {
      const tenant = shellViewRef.current === null ? null : shellViewRef.current.tenant;
      const plan = composerConfirmPlan(composerState, missionScopeFromTenantContext(tenant));
      composerState = composerReducer(composerState, plan.followUp);
      remountForComposer();
      if (plan.declaration === null || plan.declareRoute === null) {
        return;
      }
      const declare =
        plan.declareRoute === 'mission'
          ? onDeclareMissionIntent
          : plan.declareRoute === 'console'
            ? onDeclareConsoleIntent
            : onDeclareLabIntent;
      const result = declare(plan.declaration);
      if (result !== undefined && result !== null && typeof result.then === 'function') {
        result.then((outcome) => {
          const view =
            plan.declareRoute === 'console'
              ? { kind: 'console', record: outcome.record }
              : plan.declareRoute === 'lab'
                ? { kind: 'lab', record: outcome.record }
                : { kind: 'mission', outcome };
          composerState = composerReducer(composerState, { kind: 'outcome', outcome: view });
          remountForComposer();
        });
      }
      return;
    }
    composerState = composerReducer(composerState, event);
    remountForComposer();
  };
  // The loading surface shown while a soft refresh resolves.
  const loadingRouteView = () => ({
    shellView: shellViewRef.current,
    routeView: { kind: 'loading', label: 'Loading the MOS surface…' },
    onDeclareMissionIntent,
    onDeclareLabIntent,
    onDeclareConsoleIntent,
  });

  /**
   * SOFT navigation (UX-003 wave 3): `history.replaceState` rewrites the
   * query (the URL stays the route truth — no client route state), then the
   * SAME composition's page model is re-resolved and remounted WITHOUT a
   * document reload. The per-load composition (the in-process lab runtimes
   * + the intent ledger) therefore survives BOTH declared-intent refreshes
   * AND internal link navigation for the whole document session; a hard
   * reload or app restart starts a fresh composition (the disclosed
   * session-scoped workspace state — durable persistence is the P2
   * service transport's).
   */
  const softNavigateTo = (appHref) => {
    const win = globalThis.window;
    // The AGENT WORKBENCH routes: hand the surface to the host instead of
    // resolving a MOS page model (the substrate UI mounts behind the MOS
    // chrome; the query still records the route truth for reload boot).
    const workbenchSurface = workbenchSurfaceFromAppPath(appHref);
    if (workbenchSurface !== null) {
      const query = desktopQueryFromAppHref(appHref);
      if (win && win.history && typeof win.history.replaceState === 'function') {
        win.history.replaceState(null, '', query);
      }
      platform.setDocumentTitle(workbenchTitleFor(workbenchSurface));
      requestSubstrateSurface(workbenchSurface);
      return;
    }
    lastMosAppHref = appHref;
    const query = desktopQueryFromAppHref(appHref);
    if (win && win.history && typeof win.history.replaceState === 'function') {
      win.history.replaceState(null, '', query);
    }
    const route = desktopRouteFromSearch(win ? win.location.search : query);
    platform.setDocumentTitle(mosRouteTitle(route));
    if (shellViewRef.current) {
      mountShell(loadingRouteView());
    }
    loadMosRouteView(composition, route, shellViewRef.current)
      .then((routeView) => {
        mountShell({
          shellView: shellViewRef.current,
          routeView,
          onDeclareMissionIntent,
          onDeclareLabIntent,
          onDeclareConsoleIntent,
        });
      })
      .catch((error) => {
        mountShell({
          shellView: shellViewRef.current,
          routeView: routeLoadFailureView(error),
          onDeclareMissionIntent,
          onDeclareLabIntent,
          onDeclareConsoleIntent,
        });
      });
  };

  // The link bridge with the SOFT navigator: internal anchors refresh the
  // page model in place instead of reloading the document.
  installDesktopShellLinkNavigation((href) => softNavigateTo(href));

  // THE COMPOSER ENTRY POINTS (§6 P0, UXR-WC): the global Ctrl+J toggle and
  // the action-aware open bridge — mirrored from @mos/web's src/main.jsx.
  installMosComposerHotkey(() => dispatchComposerEvent({ kind: 'toggle' }));
  subscribeMosComposerOpen((entry) => dispatchComposerEvent({ kind: 'open', entry }));

  let committed = false;
  // The last MOS route the shell showed (the workbench handoff excludes
  // itself) — the resume controller returns here when the host switches
  // back from a substrate surface.
  let lastMosAppHref = '/';
  const mountShell = (routeView) => {
    currentRouteViewBundle = routeView;
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
          <MosAppShell
            shellView={routeView.shellView}
            routeView={routeView.routeView}
            onDeclareMissionIntent={routeView.onDeclareMissionIntent}
            onDeclareLabIntent={routeView.onDeclareLabIntent}
            onDeclareConsoleIntent={routeView.onDeclareConsoleIntent}
            composer={{ state: composerState, onEvent: dispatchComposerEvent }}
            shellVersion={shellVersion}
          />
        </MosDesktopErrorBoundary>
      </StrictMode>
    );
    reactRoot.render(element);
  };

  const onDeclareMissionIntent = (declaration) => {
    declareMissionIntentThroughPort(composition, declaration).then((outcome) => {
      // The receipt/failure marker is carried by the next full load —
      // one route per load, real navigation, no client route state.
      navigateDesktopAppHref(missionIntentOutcomeHref(outcome));
    });
  };

  // UX-003 wave 3: the Lab surfaces DECLARE write intents; the production
  // composition routes them to the lab authority runtimes and the ledger
  // carries every verdict. The refresh after a declaration is SOFT:
  // `history.replaceState` rewrites the query (the receipt marker lands in
  // the URL without a document reload), then the SAME composition's page
  // model is re-resolved and remounted — the in-process runtimes and the
  // intent ledger are per-load (the one-route-per-load discipline), so a
  // hard navigation would wipe the very records the declaration just
  // wrote. A deep link to a receipt id from a PREVIOUS load resolves to
  // the outcome panel's honest not-found state.
  const onDeclareLabIntent = (declaration) => {
    // The outcome is RETURNED so the Ask MOS composer can render the
    // authority's verdict in its receipt card (UXR-WC).
    return declareLabIntentThroughPort(composition, declaration).then((outcome) => {
      softNavigateTo(labIntentOutcomeHref(outcome));
      return outcome;
    });
  };

  // The CONSOLE wave: the Agent Console surfaces DECLARE write intents;
  // the production composition routes them to the OWNING authority runtimes
  // (planner / compiler / engine / rights / intelligence / experiments)
  // and the ledger carries every verdict verbatim. The refresh after a
  // declaration is SOFT for the same reason as the lab flow — the
  // per-load authority records the declaration just wrote survive.
  const onDeclareConsoleIntent = (declaration) => {
    // The outcome is RETURNED so the Ask MOS composer can render the
    // authority's verdict in its receipt card (UXR-WC).
    const currentRoute = desktopRouteFromSearch(globalThis.location.search);
    const missionId =
      currentRoute.kind === 'console' ? currentRoute.missionId : null;
    return declareConsoleIntentThroughPort(composition, declaration).then((outcome) => {
      softNavigateTo(consoleIntentOutcomeHref(outcome, missionId));
      return outcome;
    });
  };

  const routeLoadFailureView = (error) => ({
    kind: 'route-error',
    code: 'route-load-failed',
    message: error instanceof Error ? error.message : String(error),
    retryHref: '/',
  });

  const bootstrapError = (message) => {
    reactRoot.render(
      <MosBootstrapErrorView
        message={message}
        onRetry={() => globalThis.location.reload()}
      />,
    );
  };

  // 4. Bootstrap: load the app-shell read model first…
  composition.appShell
    .loadAppShell()
    .then((shellResult) => {
      if ('error' in shellResult) {
        // Bootstrap failure: the explicit bootstrap-error screen with
        // retry as the only action — never guessed data.
        bootstrapError(shellResult.message);
        return;
      }

      const route = desktopRouteFromSearch(globalThis.location.search);
      platform.setDocumentTitle(mosRouteTitle(route));
      shellViewRef.current = shellResult;

      // AGENT WORKBENCH boot: a `?route=/workbench*` load (deep link or
      // reload while a substrate surface is showing) hands the surface to
      // the host immediately — the MOS chrome still mounts underneath
      // (hidden by the host), so returning needs no re-boot.
      const bootWorkbenchSurface =
        route.kind === 'unknown' ? workbenchSurfaceFromAppPath(route.path) : null;

      // …mount the chrome with the loading surface while the page model
      // loads…
      mountShell({
        shellView: shellResult,
        routeView: { kind: 'loading', label: 'Loading the MOS surface…' },
        onDeclareMissionIntent,
        onDeclareLabIntent,
        onDeclareConsoleIntent,
      });

      if (bootWorkbenchSurface !== null) {
        platform.setDocumentTitle(workbenchTitleFor(bootWorkbenchSurface));
        requestSubstrateSurface(bootWorkbenchSurface);
        return undefined;
      }

      // …then resolve the page model and mount it (one pass per load).
      return loadMosRouteView(composition, route, shellResult)
        .then((routeView) => {
          mountShell({ shellView: shellResult, routeView, onDeclareMissionIntent, onDeclareLabIntent, onDeclareConsoleIntent });
        })
        .catch((error) => {
          mountShell({
            shellView: shellResult,
            routeView: routeLoadFailureView(error),
            onDeclareMissionIntent,
            onDeclareLabIntent,
            onDeclareConsoleIntent,
          });
        });
    })
    .catch((error) => {
      bootstrapError(error instanceof Error ? error.message : String(error));
    });

  // The RESUME controller: the host calls this when switching back from a
  // substrate surface (the floating back control) — the shell re-resolves
  // the last MOS route's page model against the SAME composition and
  // remounts in place (soft navigation, no document reload).
  return {
    resumeMosSurface() {
      softNavigateTo(lastMosAppHref);
    },
  };
}
