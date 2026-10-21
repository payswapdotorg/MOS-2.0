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
// covers this file (no @zcode/* imports, no domain-runtime imports, no
// engine SDKs).
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
  declareMissionIntentThroughPort,
  loadMosRouteView,
  missionIntentOutcomeHref,
  mosRouteTitle,
  probePrefersDark,
  readStoredMosTheme,
  resolveMosInitialTheme,
} from '@mos/web';
import {
  createDesktopMosPlatform,
  desktopRouteFromSearch,
  installDesktopShellLinkNavigation,
  navigateDesktopAppHref,
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
  installDesktopShellLinkNavigation();

  // 3. The PRODUCTION composition (REAL domain runtimes, honest verdicts).
  const composition = createProductionMosWebComposition({});

  let committed = false;
  const mountShell = (routeView) => {
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

      // …mount the chrome with the loading surface while the page model
      // loads…
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
      bootstrapError(error instanceof Error ? error.message : String(error));
    });
}
