# ZCode Capability Parity Matrix — 2026-10-23

Delivery artifact of the desktop-UX rescue §7 (P0): a source-backed audit of
the inherited ZCode substrate's capabilities — where each one lives, whether
it still runs, what its MOS entry point is, and what an acceptance test must
prove before anything is deleted or declared retired.

**Method.** Every row was verified against the actual tree (branch
`worker-c/uxr-composer`, on top of `main @ 273e081` + the UXR waves) by the
UXR-CAP recon (see `/home/z/my-project/worklog.md`, Task UXR-CAP): the boot
chain, the full preload IPC contract (`packages/desktop/src/preload/index.ts`
+ `packages/shared/src/channels.ts`), the main/host process modules, and
exhaustive searches for voice/mic APIs. No runtime claim below is inferred
from code presence alone; where a surface is unmounted, the row says so.

**Status vocabulary** (per the §7 rules):

- `preserved` — the substrate machinery still boots/executes in the shipped
  MOS desktop, reachable or not yet surfaced.
- `integrated` — an MOS-owned surface or port reaches it today.
- `planned` — an MOS-owned binding is designed but not built.
- `pending-transport` — waiting on the P2 MOS service transport.
- `intentionally retired` — removed by decision; this matrix records why.

The MOS web/desktop packages import **zero** `@zcode/*` modules (the frozen
boundary harness `harness/mos-boundary-check.mjs` enforces this on every
build). Substrate capabilities reach MOS only through narrow, MOS-owned
adapters or the raw preload contract.

---

## Summary

| # | Capability | Status | MOS entry point today |
|---|------------|--------|----------------------|
| 1 | Conversational agent/session lifecycle + context history | planned | none — the Ask MOS composer declares intents; it is not a chat runtime |
| 2 | Model/provider selection + provisioning | planned | none in MOS (the `/connections` surface is the distribution/provider domain, NOT model providers) |
| 3 | Embedded browser + authorized browser control | planned (most reuse-ready) | none yet; the preload contract is callable from the MOS renderer |
| 4 | Voice input/chat | not inherited — new-build decision pending | honest-unavailable row in the composer |
| 5 | File/image/media attachments | planned | none — the composer takes structured text fields only |
| 6 | Skills, tool execution, MCP/plugins | preserved (substrate); planned (MOS UX) | none |
| 7 | Background tasks, realtime events, notifications | preserved (substrate); partial (MOS) | Activity & Approvals rail row → honest-unavailable Notifications surface |
| 8 | Session persistence / resume / reattach | preserved (substrate); pending-transport (MOS) | none — session-scoped state is disclosed everywhere |
| 9 | Permissions/authorization dialogs | preserved (substrate); integrated (MOS authorities) | the rights/§27 gates + the composer's confirm step |
| 10 | Native menu, shortcuts, deep links, window management | preserved (native); partial (MOS) | window §4.1 fix in flight (TL); Ask MOS Ctrl+J is renderer-scoped |
| — | Pay / payment authority | **no payment authority exists in MOS-2.0** | the composer clarifies intents only; no Pay action is rendered |

---

## 1. Conversational agent / session lifecycle and context history

- **Real source + callers.** `packages/services/src/zcode-agent/zcodeAgent.ts`
  (agent interfaces); the process manager that spawns
  `apps/zcode-cli/packages/cli/dist/zcode.cjs`;
  `packages/services/src/zcode-session/` (session lifecycle, SQLite
  session-store repositories, claude-native session import);
  `packages/ui/src/App.tsx` + the v4 workspace surfaces (UNMOUNTED in the
  MOS shell).
- **Runtime evidence.** The host utility process and the service-port RPC
  namespaces still register at boot (`packages/shared/src/channels.ts`,
  ServiceChannels); the React conversational UI never mounts in the MOS
  renderer (`packages/desktop/src/renderer/src/main.tsx` mounts
  `@mos/desktop/mos-desktop-entry.jsx` only).
- **MOS entry point.** Planned. The Ask MOS universal composer
  (`packages/mos-web/src/shell/*`, §6) is a **structured-intent** composer,
  not a conversational LLM runtime: it asks the declared field set, builds a
  typed declaration through the existing parsers, and routes it to the real
  authorities. A true multi-turn chat over the substrate agent runtime is a
  deliberate future decision — the substrate `AgentRuntimePort` mirror
  (`@mos/agent-runtime`, AGT-002) exists but is unwired into any web
  composition.
- **Permission boundary.** The substrate agent runtime's tool approvals are
  the permission engine's (row 9). The MOS composer itself holds no
  authority and executes nothing.
- **Acceptance test.** Existing: `view-composer.test.tsx` pins the
  intent-composer path (declaration parity with the dedicated forms).
  **Named gap:** an MOS chat-session surface over the substrate runtime has
  no test because it has no surface; building one requires a new MOS-owned
  decision, recorded here rather than smuggled in.

## 2. Model / provider selection and provisioning

- **Real source + callers.** `packages/provider/src/` (provider accounts,
  config overlay), `packages/model-option-map/src/` (option evaluation),
  `packages/services/src/model-provider/` (provisioning + connectivity),
  `packages/desktop/src/host/remoteProviderProvisioningService.ts`;
  UI: `packages/ui/src` ModelProviderSection + model-selection toolbar
  (unmounted).
- **Runtime evidence.** Provisioning/coordinators register at boot; no MOS
  surface calls them.
- **MOS entry point.** Planned. **Important disambigulation:** the MOS
  `/connections` route is the *distribution/integrations* provider domain
  (frozen `@mos/distribution` provider profiles) — it is NOT a model-provider
  surface and must never present itself as one. Model selection becomes an
  MOS-owned surface only when a conversational capability (row 1) lands.
- **Permission boundary.** Substrate credential storage
  (`packages/services/src/credential/`) stays inside the substrate; an MOS
  adapter would have to declare its own boundary.
- **Acceptance test.** **Named gap:** none exists for an MOS model picker;
  the honest bar is a new surface + tests, not a reskin of the ZCode UI.

## 3. Embedded browser, navigation, authorized browser control / computer-use

- **Real source + callers.**
  `packages/desktop/src/main/browserView/` (BrowserGuestManager — CDP on
  the guest webview, command executor, screenshot surface, residency/
  restore, webm recorder), `packages/desktop/src/main/browserDataManager.ts`
  + the `browserCommand*` modules, `packages/desktop/src/host/browserControlMainBridge.ts`,
  preload contract `window.zcode.browserViewAttachGuest` (+ the rest of the
  browser IPC namespace), renderer bridge
  `packages/desktop/src/renderer/src/desktopBrowserPlatformBridge.ts`;
  `webviewTag: true` on the main window
  (`packages/desktop/src/main/desktopWindowChrome.ts`).
- **Runtime evidence.** The full chain (main → host → preload) still
  registers at boot. The preload bridge is callable from the MOS renderer
  process today; only the React pane components live behind the `@zcode/ui`
  import boundary.
- **MOS entry point.** Planned — this is the **most reuse-ready** substrate
  capability (the §8 social workspace's integrated-browser journeys ride
  it). The Social Media workspace's guided browser pane
  (`packages/mos-web/src/views/social-guided-browser.tsx`) renders its
  honest non-Electron fallback until an MOS-owned pane binds the contract.
- **Permission boundary.** Browser control/computer-use in the substrate is
  permission-brokered (CUA permission panel/positioner modules in
  `packages/desktop/src/main/`). Any MOS binding must keep the approval gate
  — never auto-drive a browser without it.
- **Acceptance test.** Existing: the social views pin the honest fallback.
  **Named gap:** an MOS-owned `<webview>` pane over
  `browserViewAttachGuest` + a CDP smoke of the packaged app.

## 4. Voice input / chat

- **Real source + callers.** None. Exhaustive search (voice | mic |
  microphone | speech | getUserMedia | MediaRecorder | SpeechRecognition)
  across `packages/ui`, `packages/desktop`, and the mos-* packages: the only
  audio capability anywhere is the task-notification sound
  (`packages/ui/src/lib/taskNotificationSound.ts`); the only MediaRecorder
  use is browser-page video recording (webm) in the browser-view recorder.
- **Status.** **Not inherited — new-build decision pending.** There is no
  substrate voice path to restore; a future voice input is a new build, and
  asking for microphone permission must happen only when that build exists.
- **MOS entry point.** The composer renders the honest-unavailable row
  verbatim: *"Voice input — not available in this build (nothing inherited
  the substrate voice path; text is fully supported)"*
  (`COMPOSER_VOICE_UNAVAILABLE_NOTE`, pinned by `view-composer.test.tsx`).
  No microphone affordance is rendered anywhere.
- **Acceptance test.** Existing: `view-composer.test.tsx` asserts the
  honest row and that no mic/start-voice control exists.

## 5. File, image, and media attachment flows

- **Real source + callers.** `packages/ui/src/v4/composer/useComposerAttachments.ts`
  (the ~1100-line attachment queue),
  `packages/services/src/prompt-attachment-transfer/`, and the preload file
  IPC (selectFiles / createTempTextAttachment / saveFile / printPageToPdf /
  getPathForFile).
- **Runtime evidence.** IPC and services register at boot; the MOS composer
  has no attachment surface.
- **MOS entry point.** Planned. The Ask MOS composer's inputs are the
  declared text/number/JSON fields of the owning intent forms — attachments
  are a §6.2.2 allowance ("where the existing substrate supports them") and
  the substrate does; an MOS binding is future work behind a narrow adapter.
- **Permission boundary.** File-system access in the substrate is
  permission-gated; an MOS adapter must keep the gates.
- **Acceptance test.** **Named gap:** an MOS attachment flow + tests.

## 6. Skills, tool execution, MCP/plugins, and visible permission requirements

- **Real source + callers.** `packages/services/src/skills/` +
  `skill-sync/`, `official-mcp/` + `mcp-sync/`,
  `packages/desktop/src/main/mcpUserDirectory/` (user-directory IPC still
  registered); UI: settings sections + `ToolCallBlocks` renderers
  (unmounted).
- **Runtime evidence.** Services and the MCP user-directory IPC boot; no
  MOS surface calls them; no MOS business authority consumes skills/tools.
- **MOS entry point.** Planned. Per the rescue rules, skills/MCP may only
  return behind MOS-owned presentation and narrow adapters — never as MOS
  business authorities, and never as parallel tool registries.
- **Permission boundary.** Tool execution approvals ride the permission
  engine (row 9). The MOS authorities' own gates (rights §27, policy
  verdicts) are the MOS-native equivalents for marketing actions.
- **Acceptance test.** **Named gap.**

## 7. Background / long-running agent tasks, task activity, realtime events, notifications

- **Real source + callers.** `packages/services/src/session/tasksDatabase/`,
  `packages/desktop/src/main/taskRealtimeBus.ts`, `broadcastHub.ts`,
  desktopNotifications + unreadBadge, the cron/off-peak scheduler
  (`automationCron*.ts`, `offPeak*` in `packages/services/src/session/`),
  subagents/workflow side panes (unmounted UI).
- **Runtime evidence.** The task/notification machinery boots in the host;
  the notification sound is still wired, but notification click routing has
  no MOS subscriber.
- **MOS entry point.** Partial — honest. MOS has its OWN durable-job
  authority (`@mos/jobs`: JobQueuePort, DurableJobRecord, the polling-only
  no-scheduling discipline — `no-scheduling-authority.test.ts`) and its own
  task-shaped receipts (the console intent ledger, the composer's task
  card). The **Activity & Approvals** rail row (§5, this wave) navigates to
  the Notifications surface, which the production composition binds as an
  honest-unavailable verdict (NOTIFY-CS) pending the transport. The
  substrate task list is NOT an MOS surface and must not be faked as one.
- **Permission boundary.** Long-running marketing work waits on approvals
  through the real authorities (run arm() §27 gate); the composer's waiting
  card names the authority it waits on and fabricates nothing.
- **Acceptance test.** Existing: mos-web/mos-desktop composition tests pin
  the unavailable notifications verdicts, the §30 run trail, and the
  composer receipt/waiting cards. **Named gap:** realtime event push (the
  substrate TaskRealtimeBus or a transport-era MOS equivalent) has no MOS
  binding.

## 8. Session persistence, resume / reattach, recovery after restart

- **Real source + callers.** Substrate: `useTabPersistence`
  (AppSettings.lastWorkspaceSession), SQLite session-store repositories,
  claude-native session import. MOS: per-load in-process compositions
  (`packages/mos-desktop/composition/compose-production-mos-web.ts`) — the
  disclosed session-scoped state.
- **Runtime evidence.** Substrate persistence works for substrate surfaces
  (unmounted). MOS state (missions, experiments, ledger, runs) is honest
  session-scoped: a restart starts a fresh composition.
- **MOS entry point.** Pending-transport. Every session-scoped surface
  discloses it; the composer's context line carries the verbatim disclosure
  *"Session-scoped workspace state — durable persistence arrives with the
  MOS service transport"* (pinned by `view-composer.test.tsx`).
- **Permission boundary.** n/a (transport-era concern: tenant-scoped reads).
- **Acceptance test.** Existing: the disclosure pins above; the wave-22/24
  packaged-app smokes re-verified fresh-profile boots. **Named gap:**
  restart-resume once the transport lands.

## 9. Permissions / authorization dialogs and user-facing confirmation surfaces

- **Real source + callers.** Substrate: the permission engine (core tool /
  executor approval-gate / permission-rules) + `packages/ui/src/PermissionDialog.tsx`
  (via V4InteractionDialogs — unmounted). MOS: the REAL rights authority
  (`@mos/rights` §27), the policy verdict gates, and the run arm() approval
  transition.
- **Runtime evidence.** Both engines run: the substrate dialog machinery
  boots with no MOS subscriber; the MOS authorities gate every declare
  path fail-closed (verified by the composition tests with verbatim
  rejection relays).
- **MOS entry point.** Integrated (MOS-native). The composer's STEP 3 is
  the marketing-work confirmation surface: the structured-intent summary +
  *"No consequential side effect occurs on this step"* + Declare intent —
  then the authority's own rights/policy verdict decides and is relayed
  verbatim.
- **Permission boundary.** No MOS side effect occurs before the correct
  authorization and explicit user approval — pinned by the fail-closed
  tests (no-explicit-grant, ILLEGAL_TRANSITION, rights denials).
- **Acceptance test.** Existing: mos-desktop composition tests (verbatim
  REAL rejection relays), `view-composer.test.tsx` (confirm plan + refusals,
  receipt card, no-side-effect line).

## 10. Native application menu, shortcuts, deep links, window management

- **Real source + callers.** `packages/desktop/src/main/desktopApplicationMenu.ts`
  (+ DesktopCommandIds/handlers), `desktopDeepLinkUrl.ts` /
  `desktopOAuthDeepLink.ts` / `desktopLinuxDeepLinkRegistration.ts` /
  `desktopSecondInstanceDeepLink.ts`, `desktopWindowLifecycle.ts`,
  `desktopTray.ts`, zoom/chrome modules; renderer: shortcutCommands /
  useAppKeyboard / CommandCenter (unmounted).
- **Runtime evidence.** Menu, tray, deep links and window lifecycle boot
  natively and keep working (the shared menu catalog's About/tray strings
  carry MOS identity since wave 23). Renderer-routed commands (NewTask /
  NewTab / FocusTab / …) dead-end with no subscriber in the MOS shell —
  disclosed, not hidden.
- **MOS entry point.** Partial. The §4.1 native-window fix (frame +
  opaque background on Linux — min/max/close, drag-resize, tiling) is the
  TL's in-flight work on this rescue and is tracked there, not claimed
  here. The §6 composer hotkey (Ctrl+J / Cmd+J) is deliberately
  **renderer-scoped** (a capture-phase document listener — no
  globalShortcut/menu accelerator registration), so it can never conflict
  with the native menu accelerators.
- **Permission boundary.** Deep links (`zcode://`) host oauth/payment/
  workspace/share routes; none of those are MOS business authorities — an
  MOS deep-link surface is a future, separately-reviewed decision.
- **Acceptance test.** Existing: the wave-22/24 packaged-app CDP smokes
  (window behavior, zero console errors); `view-composer.test.tsx` pins the
  hotkey install/dispose/matcher table. **Named gap:** the TL's §4.1/§4.3
  window matrix on the packaged app.

---

## Pay / payment authority (the §6 Pay-specific boundary)

**No payment authority exists in MOS-2.0.** The composer records the
absence instead of inventing an entry: the action catalog carries no Pay
action (`COMPOSER_ACTIONS` = 16 declared write intents; pinned by
`view-composer.test.tsx`), and the picker's disclosure states verbatim that
no payment authority is bound. The substrate's PaySwap billing surfaces are
ZCode-domain (unmounted) and are NOT MOS authorities; no money movement, no
transfer initiation, and no payment task card can be produced by this
build. When a real Pay action is ever provided through a connected payment
authority, the composer may clarify and create the task intent while all
money movement stays with that owner and its policy/approval process —
until then the matrix row is an honest absence.

---

## Standing rules this matrix enforces

1. Reuse substrate capabilities behind narrow MOS-owned presentation and
   adapters when valid — no broad `@zcode/*` imports, ever (the frozen
   boundary harness enforces this on every build).
2. No parallel sessions, agent runtime, job scheduler, workflow authority,
   provider registry, or permission ledger is created for UI convenience —
   MOS has exactly one of each (`@mos/jobs`, `@mos/agent-runtime`,
   `@mos/rights`, …) and the substrate equivalents stay substrate.
3. Nothing useful is removed without a destination or a recorded
   retirement reason — no row above is `intentionally retired` today; the
   unmounted substrate UI is `preserved` machinery awaiting MOS-owned
   surfaces or a recorded retirement decision.
4. An unavailable capability says so truthfully — voice, Pay, attachments,
   chat, and durable persistence all render honest-unavailable or absent
   affordances, never fake ones.

---

## Amendment — 2026-10-24: the AGENT WORKBENCH integration (build-ON-ZCode)

The owner's directive (post-rescue): *MOS builds ON ZCode to use its best
features for ads and virality discovery across social platforms — both
products' features stay apparent.* Implemented on `main` (the desktop-UX
rescue branch line) as the **Agent Workbench rail group** + the
**two-surface desktop host**:

- The MOS rail now carries an **AGENT WORKBENCH** group (Workbench /
  Automations / Settings) between Social Media and Studio — real available
  links, not `soon` rows (`packages/mos-desktop/composition/production-app-shell.ts`).
- `/workbench`, `/workbench/automations`, `/workbench/settings` are answered
  by the desktop renderer host (`packages/desktop/src/renderer/src/substrateSurface.tsx`
  + `main.tsx`): it mounts the ORIGINAL `@zcode/ui` `Root` — with the exact
  pre-swap mount contract (`ZCodeIntlProvider` + launch flags) — into a
  dedicated `#substrate-surface` container beside the MOS shell's
  `#mos-surface`. Both surfaces stay mounted; switching is instant and
  state survives on both sides. A floating **← MOS** control returns to the
  MOS shell at its last route (`mos-desktop-entry.jsx`'s resume controller).
- Deep entries drive the substrate's OWN affordances (never forked):
  Automations waits for and clicks the sidebar's real
  `[data-testid="automations-open"]` entry; Settings dispatches the
  substrate's OS-convention shortcut (Ctrl+, / ⌘,) bound to the same
  `openSettingsTab` its header uses.
- The scroll contract is surface-aware: `html.mos-desktop-shell` applies
  while MOS is visible (§4.2 viewport scrolling) and is removed while the
  substrate is visible (its own pinned-viewport policy, exactly as before
  the shell swap).

**Matrix status changes (this amendment):**

| # | Capability | Previous status | Status now | MOS entry point today |
|---|------------|-----------------|------------|----------------------|
| 1 | Conversational agent/session lifecycle + context history | planned | **integrated (workbench)** | `/workbench` — the substrate workspace (sessions, GROUPS/PROJECTS sidebar) mounted behind the MOS rail |
| 2 | Model/provider selection + provisioning | planned | **integrated (workbench)** | `/workbench` → substrate Settings (model provider section) — plus its in-composer model menu |
| 5 | File/image/media attachments | planned | **integrated (workbench)** | the substrate chat composer's real attachment affordances at `/workbench` |
| 7 | Terminal / git / developer tooling | preserved (unmounted) | **integrated (workbench)** | the substrate workspace's terminal + git panes at `/workbench` |
| Automations (scheduled tasks / cron) | preserved (unmounted) | **integrated** | `/workbench/automations` — the Automations main view |
| Substrate settings (MCP, skills, commands, hooks, browser, computer use) | preserved (unmounted) | **integrated** | `/workbench/settings` |

Rows 3 (embedded browser), 4 (voice — not inherited), 6 (Pay — absent) and
the transport-bound rows are unchanged by this amendment. The frozen
boundary still holds: `packages/mos-*` import zero `@zcode/*` modules — the
substrate mounts ONLY through the desktop renderer host
(`packages/desktop`), which the boundary harness does not scan and which
always owned that seam.

**Verified (packaged app, CDP):** the three rail entries render and
navigate; the substrate surface mounts (its own login gate in this
credential-less sandbox — the owner's real session carries through on
their machine); the ← MOS control restores the MOS shell (title, scroll
class, last route); `?route=/workbench*` deep links boot straight into the
substrate surface; mos-web 498/498, mos-desktop 37/37, desktop policy
16/16, boundary harness clean.
