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
// Composition disclosure (UX-001 build): the shell runs on the DISCLOSED
// in-memory composition seam (`testing/`) — in-memory doubles over
// `@mos/identity` + `@mos/missions` behind the declared view ports. The
// production composition root (TL-owned) binds the same ports over the MOS
// service transport later without touching this file's structure.

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
import { MosAppErrorBoundary } from './shell/error-boundary.jsx';
import { MosAppShell } from './shell/mos-app-shell.js';
import { MosBootstrapErrorView } from './shell/status-views.js';
import {
  declareLabIntentThroughPort,
  labIntentOutcomeHref,
} from './routes/lab-intent-declaration.js';
import { createInMemoryMosWebComposition } from '../testing/compose-in-memory-mos-web.js';
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
  // seedDemoMissions (UX-006): the browser shell boots with three REAL demo
  // missions so the whole-shell acceptance pass demonstrates the front door.
  const composition = createInMemoryMosWebComposition({ seedDemoMissions: true });
  const rootElement = globalThis.document.getElementById('root');
  let reactRoot = null;
  // The shell read model ref — the soft post-declaration refresh (below)
  // re-resolves the page model against the SAME shell view without a
  // document reload.
  const shellViewRef = { current: null };

  const mountShell = (routeView) => {
    const element = (
      <StrictMode>
        <MosAppErrorBoundary onError={(error) => console.error('[mos-web]', error)}>
          <MosAppShell
            shellView={routeView.shellView}
            routeView={routeView.routeView}
            onDeclareMissionIntent={routeView.onDeclareMissionIntent}
            onDeclareLabIntent={onDeclareLabIntent}
            onDeclareConsoleIntent={onDeclareConsoleIntent}
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
    // included).
    declareLabIntentThroughPort(composition, declaration).then((outcome) => {
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
    });
  };

  const onDeclareConsoleIntent = (declaration) => {
    // The console write-intent transport (the CONSOLE wave): the declaration
    // routes through the composition's console-intents port, and the refresh
    // after the declaration is SOFT for the same reason as the lab flow —
    // the per-load authority records (plans, strategies, runs, the ledger)
    // the declaration just wrote survive the mode navigation.
    const currentRoute = parseMosRoute(globalThis.location.pathname, globalThis.location.search);
    const missionId =
      declaration.action === 'compose-plan'
        ? declaration.missionId
        : currentRoute.kind === 'console'
          ? currentRoute.missionId
          : null;
    declareConsoleIntentThroughPort(composition, declaration).then((outcome) => {
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
    });
  };

  const routeLoadFailureView = (error) => ({
    kind: 'route-error',
    code: 'route-load-failed',
    message: error instanceof Error ? error.message : String(error),
    retryHref: '/',
  });

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
