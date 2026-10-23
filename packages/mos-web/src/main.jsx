// MOS browser shell entry (WEB-001) — the bootstrap skeleton pattern ported
// from the audited Zcode web shell (`packages/web/src/main.tsx`; UX substrate
// audit KEEP table) with MOS naming and zero Zcode imports:
//   pre-paint theme seed → composition → app-shell read model →
//   hand-rolled route dispatch → route view-model load →
//   error-boundary-wrapped mount (loading surface while the page model loads).
//
// WHY .jsx (disclosed): the frozen boundary harness
// (harness/mos-boundary-check.mjs + harness/mos-boundary-rules.json) scans
// `.ts/.tsx/.mts/.js/.mjs` files under `packages/mos-*` and forbids every
// bare npm import there — including `react-dom/client`, which mounting
// requires. This entry therefore uses the `.jsx` extension, which the frozen
// rules do not manage; the package's own presentation-only structural test
// covers it (no @zcode/*, no domain-package imports, no engine SDKs). All
// logic it calls lives in scanned, tested TypeScript modules under `src/`.
//
// Composition disclosure (the CONSOLE wave / FINAL TL HANDOFF §2): the
// shell's DEFAULT composition is the PRODUCTION root — the REAL
// @mos/identity + @mos/missions + @mos/lab + console authority chain
// behind the view ports, no demo seeds, honest-unavailable verdicts for
// the surfaces awaiting the service transport (P2). The in-memory testing
// composition with its demo missions is an EXPLICIT opt-in demo mode
// (`?demo=1` on any first load — persisted for the browser session via
// sessionStorage so full navigations keep it) — never the implicit
// product runtime (the FINAL TL HANDOFF's discrepancy #2, closed).
//
// WHY the relative reach into mos-desktop (disclosed): the production
// composition root lives at packages/mos-desktop/composition/ (the
// composition seam outside every package's src/, the disclosed depth-matching
// invariant) — the same bootstrap-reach pattern the desktop entry already
// uses for this shell's styles (mos-desktop-entry.jsx imports
// ../mos-web/src/styles.css). This entry (.jsx, outside the frozen
// boundary harness's managed extensions) is the only place the two
// composition roots are selected; everything downstream consumes the
// composition through the declared ports.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  applyMosThemeToDocument,
  probePrefersDark,
  readStoredMosTheme,
  resolveMosInitialTheme,
} from './platform/theme-seed.js';
import { createWebMosPlatform } from './platform/web-platform.js';
import { mosRouteTitle, parseMosRoute } from './routes/route.js';
import { loadMosRouteView } from './routes/route-loading.js';
import {
  declareMissionIntentThroughPort,
  missionIntentOutcomeHref,
} from './routes/intent-declaration.js';
import {
  declareConsoleIntentThroughPort,
  consoleIntentOutcomeHref,
} from './routes/console-intent-declaration.js';
import { missionScopeFromTenantContext } from './routes/route-scope.js';
import { installMosComposerHotkey } from './shell/composer-hotkey.js';
import { subscribeMosComposerOpen } from './shell/composer-bridge.js';
import {
  composerConfirmPlan,
  composerReducer,
  initialComposerState,
} from './shell/composer-state.js';
import { MosAppErrorBoundary } from './shell/error-boundary.jsx';
import { MosAppShell } from './shell/mos-app-shell.js';
import { MosBootstrapErrorView } from './shell/status-views.js';
import {
  declareLabIntentThroughPort,
  labIntentOutcomeHref,
} from './routes/lab-intent-declaration.js';
import { createInMemoryMosWebComposition } from '../testing/compose-in-memory-mos-web.js';
import { createProductionMosWebComposition } from '../../mos-desktop/composition/compose-production-mos-web.js';
import './styles.css';

const SHELL_VERSION = __MOS_SHELL_VERSION__;

function bootMosWebShell() {
  // 1. Pre-paint theme (index.html applied the inline mirror before the
  //    bundle executed; this is the canonical resolution on mount).
  const win = globalThis.window;
  applyMosThemeToDocument(
    resolveMosInitialTheme({
      storedTheme: readStoredMosTheme(win ? win.localStorage : null),
      prefersDark: probePrefersDark(win ?? null),
    }),
    globalThis.document ?? null,
  );

  const platform = createWebMosPlatform();
  // The composition selection (the CONSOLE wave): PRODUCTION by default —
  // the REAL authority chain, no demo seeds. `?demo=1` (any first load of
  // the session) opts into the disclosed testing composition with its demo
  // missions; the flag persists in sessionStorage so the one-route-per-load
  // full navigations of the acceptance harness keep the demo mode.
  const isDemoSession = (() => {
    try {
      if (win && win.sessionStorage && win.sessionStorage.getItem('mos-demo-shell') === '1') {
        return true;
      }
      const search = win && win.location ? win.location.search : '';
      if (typeof search === 'string' && /[?&]demo=1(&|$)/.test(search)) {
        if (win && win.sessionStorage) {
          win.sessionStorage.setItem('mos-demo-shell', '1');
        }
        return true;
      }
    } catch {
      // Storage unavailable (private modes): the production default stands.
    }
    return false;
  })();
  const composition = isDemoSession
    ? createInMemoryMosWebComposition({ seedDemoMissions: true })
    : createProductionMosWebComposition();
  const rootElement = globalThis.document.getElementById('root');
  let reactRoot = null;
  // The shell read model ref — the soft post-declaration refresh (below)
  // re-resolves the page model against the SAME shell view without a
  // document reload.
  const shellViewRef = { current: null };
  // The current route-view bundle — the composer re-renders the shell in
  // place when its overlay state changes (the entries own the composer's
  // module-level UI state; the components stay hook-free).
  let currentRouteViewBundle = null;

  // THE UNIVERSAL AGENT COMPOSER (§6 P0, UXR-WC): the entry owns the
  // composer's UI state (the PURE reducer in shell/composer-state.ts) and
  // re-mounts the shell on every event — the same render-only remount the
  // soft navigations use. The `confirm` event is consumed HERE: the plan's
  // declaration is built by the EXISTING form parsers over the SAME field
  // names and routed through the EXISTING onDeclare* callbacks; when a
  // callback returns its outcome promise (console/lab), the authority's
  // verdict folds back into the receipt card. The composer never executes
  // anything itself.
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

  const mountShell = (routeView) => {
    currentRouteViewBundle = routeView;
    const element = (
      <StrictMode>
        <MosAppErrorBoundary onError={(error) => console.error('[mos-web]', error)}>
          <MosAppShell
            shellView={routeView.shellView}
            routeView={routeView.routeView}
            onDeclareMissionIntent={routeView.onDeclareMissionIntent}
            onDeclareLabIntent={onDeclareLabIntent}
            onDeclareConsoleIntent={onDeclareConsoleIntent}
            composer={{ state: composerState, onEvent: dispatchComposerEvent }}
            shellVersion={SHELL_VERSION}
          />
        </MosAppErrorBoundary>
      </StrictMode>
    );
    if (reactRoot === null) {
      reactRoot = createRoot(rootElement);
    }
    reactRoot.render(element);
  };

  const onDeclareMissionIntent = (declaration) => {
    declareMissionIntentThroughPort(composition, declaration).then((outcome) => {
      // The receipt/failure marker is carried by the next full load —
      // one route per load, real navigation, no client route state.
      globalThis.location.assign(missionIntentOutcomeHref(outcome));
    });
  };

  const onDeclareLabIntent = (declaration) => {
    // The lab write-intent transport (UX-003 wave 3): the declaration routes
    // through the composition's lab-intents port. The refresh after the
    // declaration is SOFT — `history.replaceState` lands the receipt marker
    // in the URL without a document reload, then the SAME composition's
    // page model is re-resolved and remounted (the in-process runtimes and
    // the intent ledger are per-load; a hard navigation would wipe the very
    // records the declaration just wrote — the testing seam's composition
    // included). The outcome is RETURNED so the Ask MOS composer can render
    // the authority's verdict in its receipt card (UXR-WC).
    return declareLabIntentThroughPort(composition, declaration).then((outcome) => {
      const win = globalThis.window;
      const href = labIntentOutcomeHref(outcome);
      if (win && win.history && typeof win.history.replaceState === 'function') {
        win.history.replaceState(null, '', href);
      }
      const route = parseMosRoute(globalThis.location.pathname, globalThis.location.search);
      platform.setDocumentTitle(mosRouteTitle(route));
      loadMosRouteView(composition, route, shellViewRef.current)
        .then((routeView) => {
          mountShell({ shellView: shellViewRef.current, routeView, onDeclareMissionIntent, onDeclareLabIntent, onDeclareConsoleIntent });
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
      return outcome;
    });
  };

  const onDeclareConsoleIntent = (declaration) => {
    // The console write-intent transport (the CONSOLE wave): the declaration
    // routes through the composition's console-intents port, and the refresh
    // after the declaration is SOFT for the same reason as the lab flow —
    // the per-load authority records (plans, strategies, runs, the ledger)
    // the declaration just wrote survive the mode navigation. The outcome is
    // RETURNED so the Ask MOS composer can render the authority's verdict in
    // its receipt card (UXR-WC).
    const currentRoute = parseMosRoute(globalThis.location.pathname, globalThis.location.search);
    const missionId =
      declaration.action === 'compose-plan'
        ? declaration.missionId
        : currentRoute.kind === 'console'
          ? currentRoute.missionId
          : null;
    return declareConsoleIntentThroughPort(composition, declaration).then((outcome) => {
      const win = globalThis.window;
      const href = consoleIntentOutcomeHref(outcome, missionId);
      if (win && win.history && typeof win.history.replaceState === 'function') {
        win.history.replaceState(null, '', href);
      }
      const route = parseMosRoute(globalThis.location.pathname, globalThis.location.search);
      platform.setDocumentTitle(mosRouteTitle(route));
      loadMosRouteView(composition, route, shellViewRef.current)
        .then((routeView) => {
          mountShell({ shellView: shellViewRef.current, routeView, onDeclareMissionIntent, onDeclareLabIntent, onDeclareConsoleIntent });
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
      return outcome;
    });
  };

  const routeLoadFailureView = (error) => ({
    kind: 'route-error',
    code: 'route-load-failed',
    message: error instanceof Error ? error.message : String(error),
    retryHref: '/',
  });

  // SOFT LINK NAVIGATION (the CONSOLE wave — the desktop link bridge's
  // browser twin): plain-left-click navigations on app-internal anchors
  // re-resolve the page model against the SAME composition instead of a
  // document reload. This is what keeps the console workflow usable
  // end-to-end in the browser shell — the per-load authority state (the
  // grants, experiments, intelligence records, plans, strategies, runs and
  // the intent ledger) survives mode switches and mission selection; a
  // hard reload (address bar, restart) still starts a fresh composition
  // (the disclosed session-scoped state — durable persistence is the P2
  // service transport's).
  const softNavigateTo = (href) => {
    const navWin = globalThis.window;
    if (navWin && navWin.history && typeof navWin.history.replaceState === 'function') {
      navWin.history.replaceState(null, '', href);
    }
    const route = parseMosRoute(globalThis.location.pathname, globalThis.location.search);
    platform.setDocumentTitle(mosRouteTitle(route));
    mountShell({
      shellView: shellViewRef.current,
      routeView: { kind: 'loading', label: 'Loading the MOS surface' },
      onDeclareMissionIntent,
    });
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

  const isAppInternalHref = (href) => typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
  const installSoftLinkNavigation = () => {
    const doc = globalThis.document;
    if (!doc || typeof doc.addEventListener !== 'function') {
      return () => undefined;
    }
    const handler = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      const anchor = target && target.closest ? target.closest('a') : null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.rel === 'external') {
        return;
      }
      const href = anchor.getAttribute('href');
      if (!isAppInternalHref(href)) {
        return;
      }
      event.preventDefault();
      softNavigateTo(href);
    };
    doc.addEventListener('click', handler, true);
    return () => doc.removeEventListener('click', handler, true);
  };
  installSoftLinkNavigation();

  // THE COMPOSER ENTRY POINTS (§6 P0, UXR-WC): the global Ctrl+J toggle and
  // the action-aware open bridge (views call openMosComposer from their
  // affordance buttons; the composer overlay itself is shell-owned).
  installMosComposerHotkey(() => dispatchComposerEvent({ kind: 'toggle' }));
  subscribeMosComposerOpen((entry) => dispatchComposerEvent({ kind: 'open', entry }));

  // 2. Bootstrap: load the app-shell read model first…
  composition.appShell
    .loadAppShell()
    .then((shellResult) => {
      if ('error' in shellResult) {
        // Bootstrap failure: the explicit bootstrap-error screen (audited
        // `renderWebBootstrapError` pattern) with retry as the only action.
        createRoot(rootElement).render(
          <MosBootstrapErrorView
            message={shellResult.message}
            onRetry={() => globalThis.location.reload()}
          />,
        );
        return;
      }

      const route = parseMosRoute(globalThis.location.pathname, globalThis.location.search);
      platform.setDocumentTitle(mosRouteTitle(route));
      shellViewRef.current = shellResult;

      // …mount the chrome with the loading surface while the page model loads…
      mountShell({
        shellView: shellResult,
        routeView: { kind: 'loading', label: 'Loading the MOS surface…' },
        onDeclareMissionIntent,
      });

      // …then resolve the page model and mount it (one pass per load).
      return loadMosRouteView(composition, route, shellResult)
        .then((routeView) => {
          mountShell({ shellView: shellResult, routeView, onDeclareMissionIntent });
        })
        .catch((error) => {
          mountShell({
            shellView: shellResult,
            routeView: routeLoadFailureView(error),
            onDeclareMissionIntent,
          });
        });
    })
    .catch((error) => {
      createRoot(rootElement).render(
        <MosBootstrapErrorView
          message={error instanceof Error ? error.message : String(error)}
          onRetry={() => globalThis.location.reload()}
        />,
      );
    });
}

if (globalThis.document && globalThis.document.getElementById('root')) {
  bootMosWebShell();
}
