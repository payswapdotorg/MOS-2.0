# UX Substrate Audit — ZCode Web Shell → MOS Browser Shell

Status: v1 (Wave 0 seed — W0-C / STUDIO-001 interface spike + UX substrate audit)
Author: worker-c
Scope: source inspection of `packages/web` (the ZCode web shell) plus the
`@zcode/ui` surface it mounts, as input to the future `packages/mos-web`
product shell (UX-001..UX-006). Every KEEP/REPLACE/RETIRE claim below cites
real repository files; paths were verified to exist at the time of writing
(branch `worker-c/wave0`, base 31d9ef9).
Authority context: `spec/mos-module-registry-v2.0.yaml` (web module:
`packages/mos-web`, owner worker-c, authority `presentation-only`,
dependencies `[contracts]`), `spec/mos-module-dependency-matrix-v2.0.md`
(web/desktop forbidden: direct DB/domain mutation),
`docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md` (web shell row: "retain
shell patterns; replace product surface").

This document is an audit of the inherited substrate, NOT a frozen
architecture file. The full browser shell replacement plan is the Wave 1
worker-c deliverable; §5 seeds it.

## 1. Inventory of `packages/web`

The web shell is thin by design: 3,325 lines total (17 source/config files)
— the shell bootstraps, then mounts the real product surface (`Root` from
`@zcode/ui`). Composition:

| Area | Files (verified) | Lines | Role |
|---|---|---|---|
| Entry/bootstrap | `packages/web/src/main.tsx` | 478 | theme seeding before first paint, route dispatch, web platform service, WebSocket bootstrap, `<Root>` mount |
| Auth (Zai OAuth) | `packages/web/src/auth/WebCallbackPage.tsx`, `webAuthService.ts`, `zaiWebOAuthProvider.ts`, `oauthStateCodec.ts`, `browserOAuthCredentialRepo.ts`, `webZaiOAuthConfig.ts`, `webAuthLocale.ts` | 980 | ZCode account sign-in over Zai OAuth |
| Conversation share | `packages/web/src/share/ConversationShareLandingPage.tsx`, `conversationSharePreviewClient.ts`, `conversationShareRoute.ts`, `mockConversationSharePreviewClient.ts`, `shareHeaderLayout.ts`, `conversationShareLandingPage.css` | 1,441 | public landing page for shared ZCode coding conversations |
| Shell utilities | `packages/web/src/webThemeSeed.ts`, `src/communityUrl.ts`, `src/env.d.ts` | 103 | theme seed resolution, ZCode community/help URL resolution, env typing |
| Build shell | `packages/web/vite.config.ts`, `tsconfig.json`, `index.html`, `public/` | 320+ | Vite react+tailwind build, dev proxy, pre-render theme shell, favicon + material-icons |

### 1.1 Route/page inventory

There is no router library. Routing is hand-rolled dispatch inside
`bootstrapWebApp()` in `packages/web/src/main.tsx`:

| Route | Handler | Renders | Notes |
|---|---|---|---|
| `/share/callback`, `/cn/share/callback` (with `state` + `code`/`error` query) | `isWebOAuthCallback()` → `renderWebAuthCallbackPage()` (main.tsx) | `packages/web/src/auth/WebCallbackPage.tsx` | OAuth callback page; on success redirects to safe `app_return_to`; state parsed by `parseOAuthState` from `packages/web/src/auth/oauthStateCodec.ts` |
| `/share`, `/share/:code`, `/cn/share`, `/cn/share/:code` | `isConversationSharePath()` (`packages/web/src/share/conversationShareRoute.ts`) → `renderConversationSharePage()` (main.tsx) | `packages/web/src/share/ConversationShareLandingPage.tsx` | locale derived from path prefix (`resolveConversationShareRouteLocale`); preview client fetches `/api/v1` (`conversationSharePreviewClient.ts`); dev mock mode via `mockConversationSharePreviewClient.ts` |
| `?remote=<id>` query | `resolveWebBootstrap()` (main.tsx) | main app with `wsUrl = /ws/remote/<id>` | remote workspace transport mode |
| everything else | `bootstrapWebApp()` final block (main.tsx) | `<AppErrorBoundary><ZCodeIntlProvider><Root …/></ZCodeIntlProvider></AppErrorBoundary>` from `@zcode/ui` | fetches `/api/server-info` for initial workspace; WebSocket to `/ws` |
| bootstrap failure | `renderWebBootstrapError()` (main.tsx) | `WebBootstrapErrorScreen` (in main.tsx) | retry-only error screen, zh/en by `navigator.language` |

### 1.2 Major product surfaces (coding-oriented UI)

The web shell itself renders only auth + share + error screens. The coding
product surface arrives through `<Root>` from `@zcode/ui` — all of it
ZCode-product semantics:

- Workspace/chat shell: `packages/ui/src/Root.tsx` (1,089 lines) orchestrates
  startup, provider state, OAuth effects, tabs and remote workspace
  sessions; it mounts `packages/ui/src/root/RootShell.tsx` and
  `packages/ui/src/root/RootWorkspaceContent.tsx`.
- Task/session list: `packages/ui/src/TaskList.tsx`, `TaskListItem.tsx`,
  `WorkspaceSidebar.tsx`, `WorkspaceGroupedTasksSection.tsx`.
- Coding tools surface: `packages/ui/src/GitPane.tsx`, `GitBranchSwitcher.tsx`,
  `Terminal.tsx`, `PreviewPane.tsx`, `WorkspaceFileTree.tsx`,
  `DeveloperToolsPane.tsx`, `WhiteboardPane.tsx`, `ModelTrajectoryPane.tsx`.
- Onboarding/login: `packages/ui/src/WelcomeScreen.tsx`,
  `packages/ui/src/onboarding/`, `packages/ui/src/login/`.
- Settings: `packages/ui/src/SettingsPage.tsx` + `packages/ui/src/settings/`
  (provider/coding-plan settings).
- Conversation UI: `packages/ui/src/v4/` (composer, message rows, tool-call
  rows — e.g. `ConversationComposer.tsx`, `ConversationAgentToolCallRow.tsx`).

The desktop shell mounts the SAME surface — `packages/desktop/src/renderer/src/main.tsx`
imports `Root` and `AppErrorBoundary` from `@zcode/ui` — so any MOS shell
strategy must be shared web/desktop, not web-only.

### 1.3 State/data-flow patterns

- **Server IPC**: `connectViaWebSocket(wsUrl)` from
  `packages/client/src/websocket.ts` (line 62) connects to `/ws`; service
  accessors are built through `RemoteServiceAccess` in
  `packages/client/src/remoteServiceAccess.ts`, which imports the full ZCode
  typed service surface (`IFileService`, `IGitService`, `IZCodeTaskService`,
  `IZCodeAgentService`, …) over `@zcode/rpc` ProxyChannel mechanics
  (`packages/rpc/src/proxy-channel.ts`). The server side lives in
  `packages/server/src/` (`entry-http.ts`, `http.ts`, `index.ts`).
- **Platform port**: `createWebPlatform()` in `packages/web/src/main.tsx`
  implements `IPlatformService` (from `@zcode/shared`) with explicit web
  no-ops (no file dialogs, no native window tabs, no desktop updater,
  notification fallbacks) — a clean capability-parity seam between web and
  desktop hosts.
- **Theming**: pre-paint theme resolution in `main.tsx` using
  `resolveWebInitialTheme` (`packages/web/src/webThemeSeed.ts`,
  `WEB_DEFAULT_THEME: "zai-dark"`, localStorage key `zcode-theme`) toggling
  `dark` / `theme-zai-light` / `theme-zai-dark` classes on
  `document.documentElement`; `useTheme` hook (`packages/ui/src/useTheme.ts`)
  takes over after mount. `index.html` carries a pre-render background shell
  keyed on `data-zcode-browser-theme-surface` so dark theme never flashes
  white.
- **Bootstrap data**: `resolveWebBootstrap()` (main.tsx) fetches
  `/api/server-info` for the initial workspace path/identity before first
  render; `setStreamClientId(generateMobileDeviceFingerprint())` stabilizes
  stream ids pre-render (both in main.tsx).
- **Env/config injection**: `packages/web/vite.config.ts` `define` block
  injects `VITE_ZCODE_BASE_URL`, `VITE_ZAI_OAUTH_CLIENT_ID`,
  `VITE_ZAI_OAUTH_ORIGIN`, `__ZCODE_VERSION__`/`__ZCODE_COMMIT__`/`__ZCODE_ENV__`
  (endpoint resolution imported from `@zcode/shared/zcodeEndpoint`); dev
  proxy routes `/api/v1/oauth/token` to the ZCode endpoint origin and
  `/ws` + `/api` to the local server (ports 3030/5173).
- **i18n**: `ZCodeIntlProvider` from `@zcode/ui` wraps the app; the share
  route sets `document.documentElement.lang` from the path locale
  (`/cn` prefix → zh-CN) in main.tsx.

## 2. KEEP / REPLACE / RETIRE classification

Per `docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md`: "retain shell
patterns; replace product surface". Concretely:

### KEEP — shell primitives, layout/theming, IPC-to-server patterns

| Item | Evidence (paths verified) | Why keep |
|---|---|---|
| Entry bootstrap skeleton: pre-paint theme seed, stream client id, error boundary, bootstrap-error screen, service bootstrap → shell mount | `packages/web/src/main.tsx` (`resolveWebThemePreference`, `setStreamClientId(generateMobileDeviceFingerprint())`, `WebBootstrapErrorScreen`, `bootstrapWebApp`) | exactly the browser-shell bootstrapping pattern `mos-web` needs; product-agnostic |
| Web platform service port (capability parity with explicit no-ops) | `packages/web/src/main.tsx` `createWebPlatform()` implementing `IPlatformService` from `@zcode/shared` | the seam that keeps web/desktop honest about host capabilities; reuse the pattern for a MOS platform port |
| Theme seed + pre-render theme background | `packages/web/src/webThemeSeed.ts`; `packages/web/index.html` (`data-zcode-browser-theme-surface` styles, `#root` sizing) | generic theming mechanics; rebrand tokens only |
| OAuth state codec (encode/parse state, safe returnTo validation) | `packages/web/src/auth/oauthStateCodec.ts` (`parseOAuthState`, `resolveSafeAppReturnTo`) | identity-flow plumbing independent of the Zai provider; reusable behind MOS identity (CORE-002) |
| Vite shell: react + tailwind build, `/ws` + `/api` dev proxy, env define gating, hidden prod sourcemaps | `packages/web/vite.config.ts` (proxy block, `define` block, `build.sourcemap`) | same transport shape for mos-web against the MOS server |
| Generic UI primitives + app-level providers | `packages/ui/src/components/ui/` (`button.tsx`, `dialog.tsx`, `tabs.tsx`, `tooltip.tsx`, `select.tsx`, …); `packages/ui/src/ErrorBoundary.tsx` (exports `AppErrorBoundary` via `packages/ui/src/index.ts`); `ZCodeIntlProvider`; `packages/ui/src/useTheme.ts` | substrate inventory row "Shared types/UI — retain only generic primitives"; consumed by the web shell in main.tsx |
| WebSocket service bootstrap + typed service access mechanics | `packages/client/src/websocket.ts` (`connectViaWebSocket`), `packages/client/src/remoteServiceAccess.ts`, `packages/rpc/src/` (ProxyChannel/IPC core), `packages/server/src/entry-http.ts` | registry substrate row "RPC / remote transport — retain; adapter boundary"; MOS services ride the same mechanics behind adapters |

### REPLACE — coding product surfaces

| Item | Evidence (paths verified) | MOS replacement |
|---|---|---|
| Workspace/chat/task shell mounted as the main app | `packages/ui/src/Root.tsx`, `root/RootShell.tsx`, `root/RootWorkspaceContent.tsx`, `TaskList.tsx`, `WorkspaceSidebar.tsx`, `v4/ConversationComposer.tsx` | MOS app shell with Missions Home / Studio / Lab / Connections navigation (UX-001..004); new MOS-owned shell package, not a fork of Root |
| Onboarding/welcome + login product flow | `packages/ui/src/WelcomeScreen.tsx`, `packages/ui/src/onboarding/`, `packages/ui/src/login/` | MOS identity onboarding (CORE-002) |
| Settings surface (providers/coding plan) | `packages/ui/src/SettingsPage.tsx`, `packages/ui/src/settings/` | MOS settings (identity, connections, rights) |
| Coding tools panes (git/terminal/preview/file tree/whiteboard/model trajectory) | `packages/ui/src/GitPane.tsx`, `GitBranchSwitcher.tsx`, `Terminal.tsx`, `PreviewPane.tsx`, `WorkspaceFileTree.tsx`, `WhiteboardPane.tsx`, `ModelTrajectoryPane.tsx` | out of MOS critical business model (architecture §4: "ZCode coding-specific capabilities remain available as substrate where useful but are out of the MOS critical business model"); not part of mos-web product surface |
| Conversation share landing page | `packages/web/src/share/ConversationShareLandingPage.tsx` (+ client/route/mock/layout files in `packages/web/src/share/`) | MOS artifact/share surfaces (read-only artifact-package preview) with MOS rights/consent semantics |

### RETIRE — ZCode-specific product semantics

| Item | Evidence (paths verified) | Disposition |
|---|---|---|
| Zai OAuth provider + ZCode account branding | `packages/web/src/auth/webZaiOAuthConfig.ts`, `zaiWebOAuthProvider.ts`, `webAuthService.ts`, `browserOAuthCredentialRepo.ts`, `webAuthLocale.ts`, `WebCallbackPage.tsx` | retire at cutover; MOS identity (worker-a CORE-002) owns auth; only the `oauthStateCodec.ts` pattern carries forward |
| ZCode community/help URL resolution | `packages/web/src/communityUrl.ts` (imports `@zcode/shared` help-app config + `config/default.json`) | retire; MOS owns its own links/config |
| Conversation-share product semantics (coding-conversation sharing, share auth, mock owner tokens) | `packages/web/src/share/conversationSharePreviewClient.ts`, `mockConversationSharePreviewClient.ts`, `shareHeaderLayout.ts`, `conversationShareRoute.ts` | retire; replaced by MOS artifact projections, not ported |
| ZCode product telemetry/endpoint env semantics in the shell | `packages/web/vite.config.ts` `define` block (`__ZCODE_ENDPOINT_ENV__`, `VITE_ZAI_OAUTH_*`) | retire; replaced by MOS endpoint/env injection |
| ZCode web identity strings | `packages/web/index.html` (`<title>ZCode</title>`), `main.tsx` titles ("ZCode - Sign In", "ZCode - Web + Server") | rebrand at cutover |

## 3. MOS product surface map (future `packages/mos-web`)

Registry authority: `web` module = `packages/mos-web`, owner worker-c,
authority **presentation-only**, dependencies `[contracts]`. Dependency
matrix: `web/desktop` forbidden `direct DB/domain mutation`; allowed
direction `UI → contracts` projections only; every mutation flows through
server-side MOS services over the retained RPC/WS substrate.

| Surface | Backlog item (deps) | Lives at | Consumes (presentation-only) |
|---|---|---|---|
| Missions Home | UX-001 (deps CORE-002, CORE-005) | `packages/mos-web` route `/` (missions-first home) | read projections of missions + identity modules (`packages/mos-missions`, `packages/mos-identity`); mission/objective state, zero mutation |
| Content Studio Surface | UX-002 (deps STUDIO-014) | `packages/mos-web` route `/studio` | `@mos/studio` contract projections: StudioSession lifecycle states, capture bindings/participant consent states, artifact-package previews (raw/intermediate/final stages), treatment/rejection outcomes; all studio actions issued as service calls, never local |
| Lab Surface | UX-003 (deps LAB-017) | `packages/mos-web` route `/lab` | `packages/mos-lab` projections: scenarios, runs, candidates, predictions vs observations (historical/counterfactual visibly distinct), calibration records |
| Connections / Integrations | UX-004 (deps PROD-001) | `packages/mos-web` route `/connections` | `packages/mos-integrations` + `packages/mos-distribution` projections: connector/provider availability with explicit UNKNOWN states, account health signals, rights/policy gate outcomes |
| Progressive disclosure polish | UX-005 (deps UX-001..004) | across all routes | ShareNet-inspired layering applied to the four surfaces above |
| Complete browser acceptance | UX-006 (deps PROD-004, UX-005) | whole shell | closed-loop proof surfaces; browser evidence per acceptance gates |

Desktop parity: `packages/mos-desktop` (registry: presentation-only, owner
worker-c) must mount the same MOS shell components as `mos-web` — mirroring
how `packages/desktop/src/renderer/src/main.tsx` and
`packages/web/src/main.tsx` both mount `Root` from `@zcode/ui` today, with
host capability differences expressed through the platform port
(`createWebPlatform()` pattern).

## 4. What the audit means for the substrate firewall

- The thin-shell/thick-UI split is GOOD news: `packages/web` already
  demonstrates the pattern MOS needs (thin host shell + mounted app shell +
  platform port + WS service access). The ZCode PRODUCT semantics live
  almost entirely in `@zcode/ui`'s Root tree and the auth/share subtrees —
  replaceable without touching transport substrate.
- The danger is `@zcode/ui` being imported wholesale: `Root.tsx` drags in
  the entire ZCode service surface (`packages/client/src/remoteServiceAccess.ts`
  lists IFileService/IGitService/IZCodeTaskService/…). mos-web must import
  only generic primitives (`components/ui`, `AppErrorBoundary`,
  `ZCodeIntlProvider`, `useTheme`) and never `Root`/`root/`/`v4/`/
  coding panes — this needs an explicit guard (see step 3 below).

## 5. Browser shell replacement plan — seed

(Full plan is the Wave 1 worker-c deliverable, per
`docs/handoff/EXECUTION-PLAN-V2.0.md` Wave 1 item "browser shell replacement
plan".)

Phased approach:

- **Phase 0 (done, this document)**: inventory + KEEP/REPLACE/RETIRE
  classification with cited sources; surface map fixed.
- **Phase 1 — MOS shell skeleton (Wave 1)**: create `packages/mos-web` as a
  parallel app (ZCode web untouched): Vite react+tailwind shell cloned from
  `packages/web/vite.config.ts` patterns (dev proxy `/ws`+`/api` → MOS
  server, env defines), entry modeled on `packages/web/src/main.tsx`
  (pre-paint theme seed, error boundary, bootstrap error screen), MOS
  navigation skeleton (Missions / Studio / Lab / Connections), generic
  primitives imported from the retained substrate only.
- **Phase 2 — Missions Home + identity login (UX-001)**: first real surface
  against missions/identity read projections; MOS OAuth state handling via
  the `oauthStateCodec.ts` pattern with MOS provider config.
- **Phase 3 — Studio surface (UX-002)**: grows with STUDIO-001..014 (session
  creation → capture UX → review/treatment UX); largest surface, delivered
  incrementally per studio backlog items.
- **Phase 4 — Lab + Connections (UX-003/UX-004), polish (UX-005), ZCode web
  retirement**: retire `packages/web` ZCode routes (auth/share) once MOS
  equivalents exist; delete or archive the RETIRE list; rebrand shell
  identity strings.

Risks:

1. **Deep-import gravity**: `Root` and the service-access layer encode the
   full ZCode product; a rushed "just mount Root" shortcut would import
   ZCode business semantics into MOS — forbidden by the registry
   (`zcode-substrate-adapters` retained as substrate only) and
   `spec/mos-architecture-policy-v2.0.yaml` (`forbidSecondAuthorities`).
   Mitigation: allowlist imports + architecture guard before first surface.
2. **Web/desktop coupling**: both shells mount the same UI tree today;
   MOS must build one shared MOS shell (consumed by `mos-web` and
   `mos-desktop`) to avoid forking surfaces — worker-c owns both modules.
3. **Auth authority**: MOS identity (CORE-002, worker-a) must land before
   UX-001; the Zai OAuth flow cannot be rebranded into MOS identity.
4. **i18n defaults**: existing shell hard-codes zh/en locale switching
   (`main.tsx` `navigator.language` checks; `/cn` share prefix); MOS needs
   an explicit locale strategy early.
5. **Service surface cutover**: MOS server services appear incrementally
   (Wave 1+); the shell must tolerate partial service availability without
   pretending capabilities exist (no placeholder UI).

First three concrete steps (Wave 1):

1. **Scaffold `packages/mos-web`** — package.json (private, react+tailwind,
   vite), `vite.config.ts` modeled on `packages/web/vite.config.ts` (react
   + tailwindcss plugins, `/ws` + `/api` dev proxy to the MOS server),
   `index.html` pre-render theme shell, entry `src/main.tsx` modeled on
   `packages/web/src/main.tsx` bootstrap skeleton (pre-paint theme,
   error boundary, bootstrap error screen) rendering a MOS shell with
   Missions/Studio/Lab/Connections navigation placeholders.
2. **Port shell patterns as MOS-owned utilities** — theme seed
   (`webThemeSeed.ts` pattern), OAuth state codec (`oauthStateCodec.ts`
   pattern), web platform port (`createWebPlatform()` pattern) into
   `packages/mos-web/src/platform/` with MOS naming and no ZCode imports.
3. **Add the presentation-only guard** — an architecture-check/oxlint rule
   (TL-owned, since it touches central checks) forbidding `packages/mos-web`
   from importing `@zcode/ui` product surfaces (`Root`, `root/`, `v4/`,
   coding panes) and from any direct DB/domain mutation, enforcing the
   registry's presentation-only authority BEFORE the first MOS surface
   lands.

## 6. Verification of this audit

- All cited paths were inspected in the working clone at branch
  `worker-c/wave0` (base 31d9ef9); file existence spot-checked with
  repository listing and full-text search during the audit.
- Line counts: `wc -l` over `packages/web` source (3,325 total across
  src + configs) and `packages/ui/src/Root.tsx` (1,089).
- No file under `packages/web` (or anywhere outside `packages/mos-studio`
  and this document) was modified by W0-C.
