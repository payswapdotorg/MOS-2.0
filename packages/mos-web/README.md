# @mos/web

MOS v2.0 browser shell — **Wave 4: WEB-001 (shell scaffolding) + UX-001 (MOS
Home / Missions surface)**, worker-c lane, built per
`docs/architecture/BROWSER-SHELL-REPLACEMENT-PLAN-v1.md` (the Wave-1 plan
that expands `docs/architecture/UX-SUBSTRATE-AUDIT-v1.md` §5).

A Vite React shell that REPLACES the Zcode coding web surface
(`packages/web` + `@zcode/ui` `Root`) as the MOS browser product surface —
**presentation-only**: it renders state that view ports provide and declares
intent; it owns no business authority, computes no rewards, mutates no
lifecycle, and decides no rights/policy. The Zcode substrate is reused ONLY
as ported shell PATTERNS (theme seed, error boundary, bootstrap-error screen,
OAuth state codec, web platform port, vite dev proxy) — zero `@zcode/*`
imports, no git/terminal/preview coding panes.

Module registry (frozen): `web` → `packages/mos-web`, owner `worker-c`,
authority **presentation-only**, dependencies `[contracts]`. Dependency
matrix: web/desktop forbidden `direct DB/domain mutation`; allowed direction
`UI → contracts` projections only.

## What is in this wave (UX-001)

- **Home** (`/`): narrates the architecture §2 complete loop — Mission →
  Lab → Program → Studio → Artifact graph → Quality/Rights/Policy →
  Experiment → Measurement → Learning → next run — plus the four
  cooperating loops and the §1 product thesis. Presentation of the loop,
  not implementation of it: every stage names its owning authority and
  links only where a surface exists in this build.
- **Missions** (`/missions`): lists missions (id, title, lifecycle state,
  record version, versioned reward-spec summary, tenant context) read
  through the `MissionCatalogPort` view port; mission detail (objective,
  target metrics, constraints, lifecycle transitions reconstructed from
  append-only record history, reward-spec versions); **create-mission
  INTENT declaration only** — the form folds into an intent declaration
  routed through the port; the composition double RECORDS the intent and
  returns a receipt. No mission is created by the web package.
- **Shell chrome**: navigation (Home and Missions first; Studio/Lab/
  Connections present as explicit `not-yet-available` verdicts naming
  their UX-002..004 dependencies — never placeholder content), tenant
  context display (spec §31), loading + error states, skip link,
  `aria-current` markers, focus-visible rings, responsive layout.
- **Bootstrap pattern** (plan §2.3 KEEP table): pre-paint theme seed
  (`index.html` inline mirror + canonical `src/platform/theme-seed.ts`),
  app error boundary + bootstrap-error screen with retry as the only
  action, hand-rolled route dispatch (no router dependency), boot loading
  surface until the first page model lands.

## Layout

| Area | Files | Contents |
|---|---|---|
| Entry + build shell | `src/main.jsx`, `index.html`, `vite.config.cts`, `src/styles.css`, `src/env.d.ts` | The audited bootstrap skeleton with MOS tokens: pre-paint theme, composition → app-shell read model → route dispatch → route page model → boundary-wrapped mount. Vite react+tailwind build, `/ws` + `/api` dev proxy to the MOS server, `__MOS_SHELL_VERSION__` define, hidden prod sourcemaps. Tailwind v4 (`@import "tailwindcss" source(".")`) |
| View ports | `src/ports/**` | `AppShellPort` (sections, availability verdicts, tenant context — 1 method) and `MissionCatalogPort` (summaries, detail, reward vocabulary, create-mission intent declaration, receipt load — 5 methods). Presentation-shaped view models only, never domain records; async because the production binding is a service round-trip |
| Composition interface | `src/ports/composition.ts` | `MosWebComposition` — the two view ports the shell runs on |
| Route model | `src/routes/route.ts`, `route-scope.ts`, `route-loading.ts`, `intent-declaration.ts` | Hand-rolled route parsing (home / missions / section / unknown), tenant-scope + branded-id presentation coercions, the one-pass page-model loader with honest degradation (route-error views, named selection/intent markers), the intent-declaration flow (port call → receipt/failure location) |
| Views | `src/routes/home-view.tsx`, `missions-view.tsx`, `missions-list.tsx`, `mission-detail.tsx`, `mission-intent-form.tsx`, `src/views/home-loop.ts`, `mission-intent-form-data.ts` | The Home loop narration data + view; the Missions list/detail/intent-form views (uncontrolled form, native validation as presentation affordance only); the pure `FormData` → intent-declaration parser |
| Shell chrome | `src/shell/mos-app-shell.tsx`, `status-views.tsx`, `route-fallbacks.tsx`, `error-boundary.jsx` | Header + nav + tenant badge + footer; loading/bootstrap-error/app-error surfaces; route-error, section-not-available, unknown-route and no-tenant fallbacks; the React class error boundary |
| Platform patterns | `src/platform/theme-seed.ts`, `oauth-state-codec.ts`, `web-platform.ts` | MOS-owned ports of the audited shell patterns: theme seed (`mos-theme` key, dark default), OAuth state codec (encode/parse + safe same-origin returnTo, carried for the Phase 2 MOS identity sign-in), web platform port (host capability seam, `mos-desktop` parity later) |
| Service transport (declared, types only) | `src/services/mos-services.ts` | `MosServiceTransport` — the declared seam the TL production composition implements over the `@mos/substrate-adapters` RPC facade (BOOT-003). The shell never touches a socket |
| Composition seam (DISCLOSED, outside `src/`) | `testing/**` | `compose-in-memory-mos-web.ts` (REAL `@mos/identity` + `@mos/missions` repositories behind the view ports, seeded demo tenant/workspace), `in-memory-app-shell.ts` (section table per plan §2.2 readiness), `in-memory-mission-catalog.ts` (read models derived from the REAL mission repository; intent ledger with receipts — the double records intents, never executes them), `render-tree.ts` (static render-tree walker for hook-free component tests) |
| Tests | `testing/*.test.{ts,tsx}` | Route model, theme seed, OAuth codec, web platform, page-model loading, intent-form parsing, Home narration data, port contracts (app shell + mission catalog over the REAL sibling repositories), component render tests (split: `view-shell` nav/tenant/a11y, `view-home-missions` loop + list/detail/intent panels, `view-status-fallbacks` error/loading surfaces), and the presentation-only structural pins (`presentation-only-pins` imports + `presentation-only-hygiene` vocabulary/no-publish/port-budget over the shared `pin-scan.ts` substrate) |

## Presentation-only discipline (test-enforced)

`testing/presentation-only-pins.test.ts` pins the package's authority
boundaries mechanically:

- **Import pins**: every `.ts`/`.tsx` file under `src/` imports ONLY
  relative modules and `@mos/contracts` — no domain package
  (`@mos/missions`, `@mos/identity`, studio/lab/content/rights/engines/
  agents/jobs/…), no `@zcode/*`, no engine/provider SDK, and no bare npm
  import at all (not even `react` — the JSX runtime import is emitted by
  the compiler, never written in scanned source). The two `.jsx` mounting
  shims (`src/main.jsx`, `src/shell/error-boundary.jsx`) may add exactly
  `react` + `react-dom/client`; `vite.config.cts` may add exactly the
  build tooling (`vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`,
  node builtins). The `testing/` seam may import only `@mos/contracts`,
  `@mos/identity`, `@mos/missions` (the UX-001 dependency set), relative
  modules and node builtins.
- **Vocabulary pins**: comment-and-string-stripped `src/` code contains no
  business-logic identifiers (reward computation, lifecycle transition
  execution, mission validation, consent/permission mutation, policy or
  rights decisions, publishing). Narrative TEXT may name authorities
  (strings are stripped before the scan), but the code may not BE them.
- **No-publish pin**: `private: true`, no publish script, no `files`/
  `publishConfig` surface.

The frozen boundary harness (`harness/mos-boundary-check.mjs`) scans the
package's managed extensions (`.ts/.tsx/.mts/.js/.mjs`) with the same
import rule set; the `.jsx`/`.cts` extension disclosures below close the
gap the frozen rules leave.

## Firewall disclosures (.jsx / .cts — read before touching these files)

The frozen boundary harness forbids every bare npm import in the managed
extensions under `packages/mos-*`. A browser shell fundamentally needs
`react` + `react-dom/client` (mounting) and a Vite config needs `vite` +
plugins. The package therefore:

- keeps ALL logic in scanned, tested TypeScript under `src/` (which stays
  100 % `@mos/contracts` + relative);
- confines the two unavoidable React import sites to `.jsx` mounting shims
  (`src/main.jsx`, `src/shell/error-boundary.jsx`) — an extension the
  frozen rules do not manage; the package's OWN structural pins cover
  these files (no `@zcode/*`, no domain packages, no engine SDKs, and no
  other bare imports beyond the mounting pair);
- keeps the Vite config in `vite.config.cts` (first-class Vite config
  form, CommonJS kind) with the same own-package pin coverage.

The TL-owned `MOS-WEB-PRESENTATION-ONLY` boundary-rule extension
(BROWSER-SHELL-REPLACEMENT-PLAN §5 step 3) is the vehicle to bring these
extensions under the FROZEN firewall formally; until then the package's
own test-enforced pins hold the line. This is disclosed, not hidden.

## Composition disclosure (UX-001 build)

The shell this wave boots on is the DISCLOSED in-memory composition
(`testing/compose-in-memory-mos-web.ts`): the REAL `@mos/identity` +
`@mos/missions` repositories (their in-memory adapters are the siblings'
own disclosed ephemeral scaffolds) behind the declared view ports, seeded
with a demo tenant/workspace. Runtime imports of the siblings use their
BUILT dist by relative path (their exports maps point the runtime
condition at untranspiled `src/index.ts`, which node cannot execute) —
the same disclosed pattern `@mos/studio`'s testing seam uses; type imports
stay on the package names.

This is NOT the production composition root. The TL-owned root binds the
same ports over the MOS service transport (`MosServiceTransport`) without
touching the port, the views or the entry structure. Full browser
acceptance over a real server is UX-006 — NOT claimed by this wave; the
runtime evidence here is `vite build` + local serve + HTTP fetch of the
built shell.

One honest consequence of the per-load in-memory composition: the
redirect-after-declare receipt read-back (`/missions?intent=<id>` after a
successful declaration) cannot resolve its receipt — the double that
recorded it is gone with the previous page load. The shell renders the
distinct `receipt-unavailable` panel for that state (a read-back miss is
NOT a refused declaration — the two render differently); a refused
declaration (`?intent-error=<code>`) renders the refusal panel. The
production server-backed composition resolves receipts here unchanged.

## Commands

```sh
pnpm --filter @mos/web exec tsc -b . --force   # build + typecheck (needs siblings built)
pnpm --filter @mos/web test                    # tsc -b (both projects) && node --test 'out/**/*.test.js'
pnpm --filter @mos/web exec vite build         # browser bundle → dist/web
pnpm --filter @mos/web exec vite preview       # serve the built bundle
pnpm --filter @mos/web run dev                 # vite dev server (proxy /ws + /api → :3030)
pnpm exec oxlint packages/mos-web              # lint
node harness/mos-boundary-check.mjs            # substrate firewall
```

## Future seams (not in this wave)

- UX-002 Studio surface (`/studio`) once STUDIO-014; UX-003 Lab (`/lab`)
  once LAB-017; UX-004 Connections once PROD-001 — each arrives by
  extending the section table + route views; the `not-yet-available`
  verdicts are first-class until then.
- Phase 2 MOS identity sign-in over `packages/mos-identity` using the
  ported OAuth state codec; the codec is scaffolded + tested, no flow yet.
- The service transport binding (`MosServiceTransport` over the
  `@mos/substrate-adapters` RPC facade) at the TL composition root.
- `packages/mos-desktop` mounts the SAME route component tree through the
  platform port pattern (registry: presentation-only, owner worker-c).
