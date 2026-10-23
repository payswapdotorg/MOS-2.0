# MOS Desktop UX Rescue — Final TL Handoff
**Date:** 2026-10-23  
**Priority:** P0 / release-blocking product-quality work  
**Repository:** `payswapdotorg/MOS-2.0`  
**Baseline main SHA when this handoff was prepared:** `79f1a82c061d21ca343063f5d4e2a3734bb6dab0`  
**Architecture:** MOS v2.0 frozen; no silent architecture or authority changes.

## 0. TL: this is an implementation task, not a design discussion

The owner has used the installed Ubuntu desktop and reported these release-blocking UX defects:

- There is no usable scrolling.
- The window cannot be minimized, closed, or resized as expected.
- Parts of pages are clipped/cropped.
- Most user journeys are not discoverable.
- The app feels like a website forced into a desktop wrapper.
- Useful ZCode capabilities appear to have disappeared instead of being integrated into MOS's ideal UX.
- Social-media content strategy creation—especially for YouTube—and Research Lab flows are not sufficiently discoverable, connected, or proven by tests.
- The owner expects two consistent interaction patterns:
  1. **Social Media → YouTube → guided setup in an integrated browser → create a clearly labelled simulated content-strategy environment.**
  2. **From any appropriate action or “Pay” entry: toggle the agent-chat composer → answer clarifying questions by voice or text → confirm an intent → start a durable long-running task.**

The work must be implemented and tested in the actual packaged Electron desktop application on Ubuntu. A browser dev server, mockup, passing build, visible home screen, or report by itself is not acceptance.

## 1. Baseline evidence and source-of-truth discipline

The current-main desktop installation report and live screen captures are recorded here:

- [Local desktop verification report](../../inspection/MOS-DESKTOP-REPORT-2026-10-23.md)
- [Current Home screenshot](../../inspection/mos-home-live.png)
- [Current Agent Console screenshot](../../inspection/mos-agent-console-live.png)
- [Current Research Lab screenshot](../../inspection/mos-research-lab-live.png)

Those images are **baseline evidence from the previous build**, not the desired visual design and not proof that scrolling, resizing, minimization, all journeys, or production side effects work. The earlier acceptance verified that the app launched and the Home, Agent Console, and Lab screens rendered. It explicitly did not run the full repository suite. Reproduce every reported defect in the live packaged app before fixing it, then capture before/after evidence.

Source areas already confirmed in the repository include:

- Native Electron window/lifecycle: `packages/desktop/src/main/desktopWindowChrome.ts`, `desktopWindowLifecycle.ts`, `desktopWindowSize.ts`, `primaryWindowCoordinator.ts`, `desktopApplicationMenu.ts`, `desktopWindowChromeState.ts`.
- MOS desktop mount and shell policy: `packages/mos-desktop/mos-desktop-entry.jsx`, `packages/mos-desktop/mos-desktop-shell.css`.
- MOS shell/navigation: `packages/mos-web/src/shell/mos-app-shell.tsx`.
- Agent Console: `packages/mos-web/src/views/console-*.tsx`, `packages/mos-web/src/ports/agent-console.ts`, `console-intents.ts`, and `packages/mos-web/src/routes/console-intent-declaration.ts`.
- Research Lab: `packages/mos-web/src/routes/lab-view.tsx`, `packages/mos-web/src/views/lab-*.tsx`, `packages/mos-web/src/ports/lab-*.ts`, and `packages/mos-lab`.
- Connections/provider read model: `packages/mos-web/src/routes/connections-view.tsx`, `packages/mos-web/src/views/connections/`, `packages/mos-web/src/ports/connections-views.ts`.
- Provider and social authorities: `packages/mos-integrations`, `packages/mos-distribution`, `packages/mos-capabilities`, `packages/mos-engines`, and the existing `SOCIAL-001` / `SOCIAL-002..006` backlog definitions.
- Agent runtime and durable tasks: `packages/mos-agent-runtime`, `packages/mos-agents`, `packages/mos-jobs`, and the existing desktop task/event infrastructure.
- Existing ZCode desktop capabilities to audit rather than rebuild: `packages/desktop/src/main/browserView/`, `desktopBrowserViewIpc.ts`, `packages/desktop/src/host/browserControlMainBridge.ts`, plus the actual session, provider/model, tools, skills, MCP, media attachment, voice, permission, and long-running task paths.

The desktop shell stylesheet currently contains a scoped `body { overflow: auto }` rule. Do **not** “fix scrolling” by blindly repeating that declaration. Trace the actual layout, route containers, fixed-height elements, flex/grid min-size behavior, native window configuration, and the live DOM/window bounds to find why content is inaccessible or clipped.

Read the repository canonical architecture/instruction set first, then inspect source, callers, tests, and packaged runtime. Do not treat worker reports or screenshots as architecture authority. Keep the module registry and frozen architecture files unchanged unless the established architecture-change process requires and approves a change.

## 2. Required result

Ship a production-grade MOS desktop experience with:

1. Working native desktop window management and reliable scroll/overflow behavior.
2. Complete responsive layouts without cropped content, overlapping controls, or inaccessible bottom actions.
3. Clear navigation, onboarding, empty states, and “what can I do next?” guidance.
4. A single discoverable, mission-aware agent composer that can be toggled from anywhere, accepts typed and supported voice input, asks follow-up questions, and starts durable work.
5. A Social Media workspace where YouTube and other supported platforms enter the same guided setup pattern while honestly reflecting provider capability and availability.
6. A Research Lab experience that connects research, evidence, Idea Graph, simulations, strategy comparison, robust benchmarks, calibration, and a lawful next-step handoff.
7. A source-verified inventory showing which useful ZCode substrate capabilities are preserved and where each one is surfaced in MOS.
8. End-to-end tests against the real production composition and actual Linux desktop package.

The product loop stays: **intent → clarify → mission/task plan → research/simulation → candidate strategy → human approval when required → authorized production/distribution/experiment → measurement → learning**.

## 3. Visual references (source-controlled)

Use these three source-controlled vector illustrations as interaction/structure targets. They are illustrative design guidance, not screenshots, domain authority, or a requirement to copy every pixel.

![MOS desktop shell and Agent Console target](assets/mos-desktop-shell-target.svg)

![Social Media / YouTube guided setup target](assets/mos-social-youtube-setup-target.svg)

![Universal intent composer and long-running task target](assets/mos-intent-to-task-target.svg)

Keep the MOS visual identity coherent across Home, Console, Lab, Social Media, Studio, Distribution, Experiments, Measurement, and Connections. The current live screenshots above are regression baselines; these target illustrations show the intended interaction structure.

## 4. P0 — Fix the native desktop before polishing the web surface

### 4.1 Window controls and lifecycle

Inspect the actual `BrowserWindow` options and lifecycle path. On the normal Ubuntu desktop, the primary window must be:

- Visible and normally decorated by the OS window manager, unless MOS deliberately implements and tests its own complete custom titlebar.
- Minimizable/restorable, resizable, maximizable/restorable, and closable by keyboard and visible controls.
- Not accidentally launched in kiosk, fullscreen, always-on-top, or frameless mode without an explicit product reason.
- Able to be resized by dragging window edges/corners; preserve native resize cursors and hit regions if a custom chrome is used.
- Correctly restored after hide/minimize and after application restart.
- Reasonably bounded by the actual display work area and minimum dimensions; distinguish **minimize** from **resize smaller**.
- State-persistent for normal size and maximized state, without writing excessive state updates or losing the last normal bounds.

Audit the existing minimum size in `desktopWindowSize.ts` rather than assuming it is appropriate. The current source declares a 1200×800 default and 480×640 minimum; verify behavior on the actual GNOME/Wayland/X11 paths and with the existing window chrome. Do not lower safety or usability constraints blindly, but do not prevent ordinary window management.

Test keyboard/window-manager controls: minimize, restore, maximize, restore from maximize, drag-resize, close, reopen, and restore state. On Linux verify the actual package and window, not only mocks of Electron's BrowserWindow.

### 4.2 Scrolling, layout and clipping

Create an explicit layout contract for every screen:

- Native window chrome remains visible.
- The MOS shell header/navigation do not disappear behind content.
- Main route content can scroll vertically when taller than the viewport.
- Long forms, detail sections, research graphs, tables, task timelines, connection directories, dialogs, and embedded browser pages remain reachable.
- Flex/grid children that are expected to scroll have correct min-size behavior (including `min-height: 0` where appropriate); their scroll containers have bounded available height.
- Fixed/sticky headers and footers do not cover the last list row, button, composer, or form submit action.
- Horizontal overflow is intentional and locally managed for tables/graphs, not the entire application window.
- Side panels can collapse/expand, are independently scrollable where appropriate, and do not make the central content unusable.
- At compact widths, panels become drawers or stacked regions; navigation remains discoverable and content is not squeezed into unreadable columns.
- Zoom/high-DPI and system scaling do not crop labels or make controls unreachable.

Do not use screenshot-only styling to conceal layout defects. Verify DOM bounding boxes, scroll heights, hit targets, focus order, and actual pointer/keyboard behavior.

### 4.3 Required responsive matrix

Run and record the following viewport/window configurations against the **packaged desktop** and the applicable web renderer tests:

- 1200×800 baseline.
- 1366×768 short laptop viewport.
- 1024×768 narrow desktop/tablet-like viewport.
- A smaller restored window that respects the chosen minimum size.
- Maximized desktop window.
- OS display scaling/zoom supported by the test environment, including a high-DPI or 125%/150% equivalent when available.

For each route, scroll to the bottom and back to the top; reach the final action; open/close drawers and dialogs; resize the window while a route is open; and verify no content is clipped or lost. Save screenshots and automated results for every failure and final pass.

## 5. P0 — Make journeys discoverable

The app must teach users where to begin without a walkthrough from the developer.

Primary navigation should expose, where implemented, **Home, Missions, Research Lab, Agent Console, Social Media, Studio, Distribution, Experiments, Measurement/Learning, Connections, and Activity/Approvals**. Do not show dead navigation or falsely imply unavailable capabilities are connected. If Social Media is routed through Distribution/Connections today, introduce the user-facing workspace as a presentation layer over the existing authorities; do not invent a new provider or distribution authority.

Every primary page needs:

- A clear page title and one-sentence purpose.
- One primary next action and a small number of contextual secondary actions.
- Useful empty states with an obvious way to start, resume, or inspect work.
- Visible current mission/context and how to switch it.
- Working help or just-in-time explanation for specialized terms.
- Observable loading, empty, success, partial, unavailable, permission-denied, and error states.
- Stable back/forward navigation and preserved task context.
- No button/link that looks enabled but does nothing. Disabled states explain why and how to satisfy the prerequisite.

Build the UI around outcomes and work, not package names, lifecycle enums, API terminology, or diagnostic records. Advanced evidence and technical provenance remain inspectable on demand.

## 6. P0 — Universal agent composer and intent-to-task flow

A single MOS agent entry point must be available from the shell and relevant workspaces. Users should not have to find the special Console page just to ask MOS to do something.

### 6.1 Entry points

Implement both:

- **Global composer toggle:** persistent but unobtrusive button/shortcut available from Home, Missions, Social Media, Lab, Studio, Connections and other principal workspaces.
- **Action-aware composer:** actions such as **Pay** (only if a real Pay action is present in the product integration), Connect YouTube, Research an audience, Simulate a strategy, Create content, or Compare channels open the same composer preloaded with that action's context.

The composer should open as a dock/drawer or focused workspace that can expand into the full Agent Console. It must not obscure the current context; users can close it, reopen it, or return to the source action.

### 6.2 Clarification by typed and voice interaction

The user describes the flow as: click the action → toggle agent chat text field → MOS asks clarifying questions → answer with voice chat or text → start long-running task.

Implement this as a genuine multi-turn flow:

1. Carry the clicked action and current mission/platform/Lab context into the intent composer.
2. Accept normal-language instructions with attachments where the existing substrate supports them.
3. Ask only the questions needed to resolve missing mission constraints, one concise question at a time or a compact progressive form.
4. Support voice input/chat where the inherited voice/runtime path permits it. Ask for microphone permission only when needed; show live transcription clearly, permit correction before submission, and retain text input as a fully usable alternative.
5. Summarize the interpreted intent in plain language before launch: objective, scope, deliverables, platforms, audience, timeframe, resources/budget limits, relevant permissions, and stop/approval conditions.
6. Let the user amend the summary or start the task.
7. Create the appropriate durable mission/job/plan records through the owning authorities—not an ephemeral UI-only chat transcript.
8. Return a persistent task card immediately after the authority confirms creation, with task ID, status, timeline/events, output, blockers, and useful next action.
9. Let the user navigate elsewhere or quit/reopen the app without losing the task. On restart, reload state from the authority/transport; do not imply persistence if only session-scoped state is available.
10. Handle long-running work with event-backed status updates, retries that are safe/idempotent, pause/cancel/resume only where the real authority supports those operations, and a clear error/recovery surface.
11. Never mark the task complete because a model emitted a completion sentence. Completion and business-outcome verification are separate states.

**Pay-specific boundary:** If the actual product exposes a Pay action through a connected PaySwap/payment authority, the generic composer may clarify and create the task intent, but all money movement must remain with that existing owner and its policy/approval process. Do not add a new payment authority to MOS. Do not initiate a transfer merely by opening the composer or answering clarifying questions.

## 7. P0 — Restore the useful ZCode capabilities inside MOS

The owner should regain the valuable inherited desktop/agent functionality without MOS reverting to a coding-app reskin. Perform a source-backed capability-parity audit before deleting or hiding existing substrate surfaces.

Inspect the actual runtime and call sites for at least:

- Conversational agent/session lifecycle and context history.
- Model/provider selection and provider provisioning.
- Browser view, browser navigation and authorized browser control/computer-use.
- Voice input/chat capabilities, where implemented.
- File, image, and media attachment flows.
- Skills, tool execution, MCP/plugins and the visible permission requirements around them.
- Background/long-running agent tasks, task activity, realtime events and notifications.
- Session persistence, resume/reattach, and recovery after window/app restart.
- Permissions/authorization dialogs and user-facing confirmation surfaces.
- Native application menu, shortcuts, deep links, and window management.

Create `docs/handoff/ZCODE-CAPABILITY-PARITY-MATRIX-2026-10-23.md` as a delivery artifact during implementation (not as a replacement for the implementation). For every capability, include: real source path and caller, current runtime evidence, MOS entry point, existing/new binding, permission boundary, status (preserved / integrated / intentionally retired), reason, and acceptance test.

Rules:

- Reuse reliable substrate capabilities behind narrow MOS-owned presentation and adapters when valid.
- No coding-service concepts or broad ZCode imports become MOS business authorities.
- Do not remove a useful feature until the matrix records where it now lives or why it is intentionally retired and the owning user journey has been tested.
- Do not create parallel sessions, agent runtime, job scheduler, workflow authority, provider registry, or permission ledger solely for UI convenience.
- A tool/skill/provider marked unavailable must say so truthfully; do not make a visual affordance appear connected when its backend isn't bound.

## 8. P1 — Social Media workspace and guided platform setup

### 8.1 Entry UX: both paths must converge

**Path A:** Social Media → choose YouTube → select an explicit task (Connect account/source, Set up strategy simulation, Research a channel/audience, Compare content strategies) → MOS opens its integrated browser/guided workspace and walks through the required steps.

**Path B:** From the global/action-aware composer, type or speak “Connect YouTube” / “Research the best YouTube content strategy for my product” → MOS asks clarifying questions → opens the same guided flow with the correct mission, platform and intent preselected.

Both paths must converge on the same implementation and record model. There must not be one fake clickable social card and a second unconnected chat-only implementation.

### 8.2 Integrated browser and simulated environment

Build a real split workspace, not an iframe-shaped decoration:

- MOS owns the left-side agent guide/context and setup checklist.
- The integrated browser surface uses the existing audited desktop browser substrate where suitable, with visible navigation/back/forward/reload, loading/error state, and a clear way to return to MOS.
- Agent guidance stays next to the browser. Progress advances only after the corresponding step or authority confirms it.
- Preserve the current task, platform, session, and form state when the user returns from the browser.
- Distinguish **connecting to a real platform account/source** from **creating a simulated strategy environment**.
- A simulated environment must be explicitly named and labelled SIMULATION; synthetic/counterfactual values must never be presented as platform facts.
- Use official provider authorization/API routes and existing security conventions. Some identity providers prohibit or restrict embedded sign-in: when embedded OAuth is unsupported or insecure, use the supported secure system-browser/deep-link return path instead. Never request passwords in MOS chat, scrape auth pages, bypass 2FA/anti-abuse, or collect user tokens from page contents.
- No external post, comment, message, spend, campaign launch, or account mutation occurs without the owning authority, applicable rights/policy checks and explicit approval.

### 8.3 YouTube content-strategy journey

The YouTube journey must be end-to-end and useful even when no account has been connected:

1. User selects **YouTube** from Social Media or asks MOS to start through the global composer.
2. MOS asks for the business/product, objective, target audience/market, language/region, timeframe, available assets, constraints/budget, and whether they intend to research their own channel, competitors/public content, or simulate a strategy. Reuse any already-known mission context rather than asking the user to repeat it.
3. MOS explains which steps require authorization and what can be done with publicly accessible/licensed or user-provided inputs.
4. Guide the user through the appropriate source/account connection, if required, using the existing integration/capability contract.
5. Create a versioned, clearly-labelled simulated environment with explicit assumptions, sources, time horizon, and available/unknown data.
6. In Research Lab, inspect audience/source evidence, content themes and question clusters, idea graph, potential formats/series, distribution constraints, and competing hypotheses. Keep provenance and rights.
7. Generate candidate strategies—e.g. format/topic/cadence/creative hypotheses—with a no-op/baseline comparison, costs/resources, uncertainty, and measurable success criteria. Do not invent channel analytics or claims about provider API access.
8. Compare candidates in the simulator/time-machine where appropriate. Label outputs as simulated, preserve uncertainty and time cutoff, and show why the candidates differ.
9. Hand the selected candidate into the existing Studio/Production path for drafts/assets and the real Experiment/Measurement path for actual tests.
10. Before distribution, run rights/policy/quality checks and request explicit approval for the exact platform action. Track provider-confirmed results distinctly from observed metrics and counterfactual predictions.
11. Feed actual measurement and valid provenance into the existing learning/calibration path; do not train on simulation as if it were real outcome evidence.

The flow should support research-first mode, simulation-only mode, and connected-account mode, all with honest prerequisites and no dead ends.

### 8.4 Same pattern across providers and Lab

Implement a capability-driven provider pattern for the social networks supported by actual contracts, including YouTube, Instagram, Facebook Pages, TikTok, and X where their existing backlog/adapters permit. Do not assume every platform has identical analytics, content mutation, OAuth scopes, experiment, or publication capabilities.

The UI must render each capability as supported, unsupported, unknown, unavailable, permission-required, or connected only according to the actual authority response. Unknown must stay unknown; unsupported operations fail closed.

Use the same *intent → clarification → evidence/guide → simulation or authorized operation → result* interaction pattern for Research Lab journeys: corpus/evidence, Idea Graph, simulation/Time Machine, strategy comparison, benchmarks, calibration, and handoff. Reuse Lab's existing presentation sections and ports. Do not make Lab actions direct provider calls or bypass the Lab/Experiment/Distribution authorities.

## 9. Production UX expectations

- Use a coherent visual system and native desktop conventions. MOS must feel like a well-made desktop workspace, not an arbitrary web page inside a shell.
- Keep native window management and a stable application frame; use deliberate resizable/collapsible work panels where they add value.
- Avoid excessive nested cards, crowded three-column layouts at small sizes, fixed-height panes without scroll, and sticky UI covering the last action.
- The task composer remains easy to reach but doesn't permanently cover mission content.
- Provide a useful Home empty state and contextual “start here” paths for new users.
- Preserve mission, selected platform, research context, task IDs and navigation on panel changes.
- Use a global search/action launcher without conflicting shortcuts, and document the shortcut in the app menu or help surface.
- Keyboard focus order, accessible labels, contrast, touch/pointer targets, and keyboard alternatives for voice controls are required.
- All user-facing actions have working event handlers connected to the real declared intent flow. Tests must assert the resulting record/event, not just the click.

## 10. Work allocation — max three concurrent workers

**Worker A — Native desktop and layout integrity**
Own `packages/desktop/src/main/desktopWindowChrome.ts`, `desktopWindowLifecycle.ts`, size/state/menu paths, `packages/mos-desktop/mos-desktop-shell.css`, and required shell layout changes. Diagnose why the user cannot manage the window or reach content; build a viewport/layout test matrix and verify the actual Linux package.

**Worker B — Social Media, embedded browser and strategy journey**
Own the user-facing Social Media workspace and integration to existing Connections/Integrations, Distribution, Lab and Studio authorities. Audit current BrowserView/browser-control substrate and the existing provider contracts before wiring it in. Implement YouTube first, then the capability-driven provider pattern for the other supported networks. Cover secure auth fallback and simulation-vs-real boundaries.

**Worker C — Universal intent composer, voice and long-running task UX**
Own the global/action-aware composer, follow-up clarification by text and supported voice, durable task/job card and recovery UI. Produce the ZCode capability-parity matrix and map real session/model/tool/skill/MCP/attachments/runtime features into the MOS UX without surfacing a cloned coding app.

**TL owns** shared composition, contract or topology changes, cross-surface mission state, authorization boundaries, final integration, source verification and packaged acceptance. Do not exceed three active workers; do not have workers concurrently modify frozen architecture/manifest/policy, the module registry, central composition root, or shared schema/migrations.

## 11. Required end-to-end test journeys

Create/update tests in the existing applicable suites rather than building a separate test-only product. Use mocks/doubles for isolated contract tests only; they are not live provider proof. If a live OAuth/provider sandbox is unavailable, record that limitation, test the safe authorization/return boundary, and clearly distinguish simulated tests from a verified live connection.

### A. Native window and scrolling
- Installed app opens in a normal window with native controls.
- Minimize → restore works.
- Maximize → restore works.
- Drag-resize works and persists.
- Close exits/hides according to documented OS behavior, and reopening works.
- Window resize while Console, Lab, a long form, Connections, Social Media, and embedded browser are open never loses content.
- Scroll every long page to the last item/action, then back to top, via wheel/touchpad and keyboard.
- Test the required matrix in §4.3 and check clipped/overlapping elements with bounding boxes and screenshots.
- Check no dead-zone blocks scroll, no modal captures scroll incorrectly, and no fixed composer/footer obscures the bottom action.

### B. Discoverability/navigation
- Fresh profile: user can identify what MOS does and start a mission/task without documentation.
- Every visible nav entry opens an implemented route or an explicit unavailable state.
- Global composer opens/closes from multiple routes, preserves source context and focus, and returns to the prior work.
- Browser history, internal navigation and app restart preserve the current task/context as the existing transport permits.

### C. Universal intent / Pay entry
- Start from a real existing Pay entry (only if one exists; otherwise document the absence instead of inventing it) and from other action buttons.
- Composer preloads that action and current tenant/mission/platform context.
- Missing required details cause clarification rather than guessed execution.
- Submit both text and supported voice input; verify the transcription can be corrected and that keyboard-only users can complete the task.
- Confirmed intent produces the expected authoritative mission/job/task record.
- Long-running status changes render from authoritative event/state updates; navigation and restart preserve state.
- Denied, interrupted, failed, timed-out and retry paths are tested. Retries do not duplicate consequential effects.
- No side effect before the correct authorization and explicit user approval.

### D. YouTube and other social platforms
- Open Social Media → YouTube → select Research/Connect/Simulate; verify integrated browser or secure auth fallback is invoked as appropriate.
- Confirm that step guidance advances only after real completion signals.
- Complete a simulation with an explicit SIMULATED label and stated assumptions.
- Verify strategy candidates link to sources, a baseline/no-op comparator, uncertainty and success metrics.
- Hand candidate to Studio/Production and Experiment/Distribution only through existing authorities.
- No real publish/message/spend can be triggered by simulation mode.
- Data-driven tests cover each provider adapter/capability matrix with unsupported/unknown/unavailable/permission-required states.
- A provider with no connected/live capability must produce an honest limitation and useful next step.

### E. Research Lab
- Launch Lab from navigation and from a contextual assistant request.
- Test overview, corpus/evidence, Idea Graph, simulator/Time Machine, strategies, transforms/benchmarks, calibration and the existing Lab bridge routes.
- Distinguish historical measured evidence from counterfactual predictions; preserve source/time cutoff and uncertainty.
- Failures, permission requirements, empty datasets and missing services all render explicit states.
- The selected candidate remains connected to the originating intent and mission.

### F. ZCode capability retention
- Exercise each row of the parity matrix in the packaged app or state an evidence-backed exclusion.
- Ensure agent sessions, context, browser control, attachments, provider/model selection, task progress, permissions, tools/skills/MCP and notifications have correct MOS entry points when the underlying feature is supported.
- Ensure no existing useful capability was removed without a mapped destination and test.
- Ensure the visible interface remains MOS-owned and is not reverted to ZCode coding UI.

## 12. Acceptance commands and evidence

Use the repository's current scripts and exact package-manager lock. At minimum, run applicable:

- Targeted unit/component tests for window state, scrolling/layout, social onboarding, intent clarification, task persistence and permissions.
- `packages/mos-web`, `packages/mos-desktop`, `packages/mos-integrations`, `packages/mos-distribution`, `packages/mos-lab`, `packages/mos-agent-runtime`, and `packages/mos-jobs` type/lint/test suites as relevant.
- Frozen boundary/architecture checks.
- Desktop bundle/package build and bundle audit.
- Real Electron/Playwright or equivalent browser automation on the built desktop package.
- Launch and visually inspect the app in a fresh profile and an existing profile on Ubuntu; retain logs and screenshots.

Report actual commands, commit SHA, outcomes and test counts. A run against a dev server is supplemental, not a substitute for package acceptance.

## 13. Definition of done

The owner can open the installed MOS app, minimize/maximize/close/resize it normally, scroll every page and reach every action. At first glance the product is clearly MOS. Journeys are discoverable without an engineer walking the user through them.

From Social Media → YouTube or the global composer, the owner can ask MOS to connect a source, create a simulated strategy environment, research evidence, compare content strategies, and hand a selected candidate to authorized downstream workflows. Other platforms use the same pattern to the extent their verified capabilities permit it.

From a contextual action—including a real Pay action if provided—the owner can converse by text or supported voice, answer clarifying questions, approve the intent summary, and launch a durable long-running task whose state survives navigation/restart. Useful inherited ZCode capabilities remain available through an intentional MOS experience. No fake progress, dead controls, misleading provider status, unauthorized side effects, or simulated numbers presented as reality.

**The TL must implement, package, launch, interact with, test, and document this actual experience. Do not stop at the handoff or the target SVGs.**
