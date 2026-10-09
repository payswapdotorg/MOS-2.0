# @mos/web

MOS v2.0 browser shell — **Wave 12: UX-002 (Content Studio surface) on top of
WEB-001 (shell scaffolding) + UX-001 (MOS Home / Missions surface)**,
worker-c lane, built per `docs/architecture/BROWSER-SHELL-REPLACEMENT-PLAN-v1.md`
(the Wave-1 plan that expands `docs/architecture/UX-SUBSTRATE-AUDIT-v1.md` §5).

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

## What is in this wave (UX-002)

- **Studio** (`/studio`, over the delivered STUDIO-014 standalone studio
  product): the READ-SIDE surface over the studio's operator ports —
  - **Session directory** (`StudioDirectoryPort`): every session the tenant
    scope sees, in the §13 lifecycle state the authority reports (all nine
    states render), with explicit tenant context (§31), the loaded
    organization version and the packaged artifact version when one exists.
  - **Session detail**: append-only lifecycle history, §15 multi-account
    participants (identity, OWN account boundary, roles, consent refs),
    §30-attributable review records (quality vs rights/policy rejections
    distinct), and the §15 live re-resolution verdicts — `consent-required`
    renders as an actionable alert panel naming the subject (participant or
    imported-source holder); `granted` / `pending` render as state badges.
  - **Package library** (`StudioPackageLibraryPort`): immutable version
    chains — §14 synthetic provenance disclosed per version AND per final
    artifact (engine-generated material is VISIBLY labeled synthetic;
    human-only packages say so), §15 consent coverage, §19 evaluation with
    the §30 citation, §6 stage counts, §12 edit-graph record with OTIO
    interchange, cost/duration.
  - **NO operator actions**: reviews, treatments, captures and packaging are
    studio-authority actions; the studio never publishes — the standing
    hand-off disclosure renders instead (read-only surface, zero buttons).
- **Home**: the §2 loop's Studio stage now links the Studio surface.
- **Shell chrome**: Studio turns ON as an available section (Lab and
  Connections keep their explicit `not-yet-available` verdicts — UX-003/004
  untouched).

## What carried over (WEB-001 / UX-001)

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
- **Shell chrome**: navigation (Home, Missions and Studio first; Lab and
  Connections present as explicit `not-yet-available` verdicts naming
  their UX-003/UX-004 dependencies — never placeholder content), tenant
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
| View ports | `src/ports/**` | `AppShellPort` (1 method), `MissionCatalogPort` (5 methods), `StudioDirectoryPort` (session listing + detail — 2 methods), `StudioPackageLibraryPort` (package listing + version chain — 2 methods). Presentation-shaped view models only (importing ONLY `@mos/contracts` types), never domain records; async because the production binding is a service round-trip |
| Composition interface | `src/ports/composition.ts` | `MosWebComposition` — the four view ports the shell runs on |
| Route model | `src/routes/route.ts`, `route-scope.ts`, `route-loading.ts`, `intent-declaration.ts` | Hand-rolled route parsing (home / missions / studio with `?session=` + `?package=` / section / unknown), tenant-scope + branded-id presentation coercions, the one-pass page-model loader with honest degradation (route-error views, named selection/chain markers, the explicit library-unavailable marker), the intent-declaration flow (port call → receipt/failure location) |
| Views | `src/routes/home-view.tsx`, `missions-view.tsx`, `studio-view.tsx`, `src/views/home-loop.ts`, `mission-intent-form-data.ts`, `studio-presentation.ts`, `studio-session-directory.tsx`, `studio-session-detail.tsx`, `studio-packages.tsx` | The Home loop narration; the Missions list/detail/intent-form views; the Studio page + section views (directory, detail, package library, version chain) with the §14/§15/§19/§30 presentation data (labels, badges, hand-off note) |
| Shell chrome | `src/shell/mos-app-shell.tsx`, `status-views.tsx`, `route-fallbacks.tsx`, `error-boundary.jsx` | Header + nav + tenant badge + footer; loading/bootstrap-error/app-error surfaces; route-error, section-not-available, unknown-route and no-tenant fallbacks; the React class error boundary |
| Platform patterns | `src/platform/theme-seed.ts`, `oauth-state-codec.ts`, `web-platform.ts` | MOS-owned ports of the audited shell patterns: theme seed (`mos-theme` key, dark default), OAuth state codec (encode/parse + safe same-origin returnTo, carried for the Phase 2 MOS identity sign-in), web platform port (host capability seam, `mos-desktop` parity later) |
| Service transport (declared, types only) | `src/services/mos-services.ts` | `MosServiceTransport` — the declared seam the TL production composition implements over the `@mos/substrate-adapters` RPC facade (BOOT-003). The shell never touches a socket |
| Composition seam (DISCLOSED, outside `src/`) | `testing/**` | `compose-in-memory-mos-web.ts` (REAL `@mos/identity` + `@mos/missions` repositories behind the view ports, seeded demo tenant/workspace, plus the disclosed Studio surface double), `in-memory-app-shell.ts` (section table per plan §2.2 readiness — Studio ON), `in-memory-mission-catalog.ts`, `studio-shape-adapter.ts` (REAL STUDIO-014 shapes → view models), `studio-fixture-*.ts` (REAL-shaped fixture records: every lifecycle state, synthetic + human provenance, granted/pending/consent-required, §30 reviews), `in-memory-studio-surface.ts` (the Studio ports over the fixtures), `render-tree.ts` (static render-tree walker) |
| Browser evidence | `scripts/browser-smoke.cjs` | The UX-002 headless-browser smoke (the WEB-001 pattern): serves `dist/web` via `vite preview` and drives the shell with the workspace-provided `playwright-core` — navigates Home → Studio, opens a session detail, opens a package chain, verifies §14 synthetic marks, §15 consent states, §30 citations, the no-buttons read-only pin and the mobile layout; zero console/page errors required |
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
  `@mos/identity`, `@mos/missions`, `@mos/studio` and node builtins — with
  `@mos/studio` TYPE-ONLY outside the node-only compat battery (the REAL
  studio runtime imports `node:crypto` and can never enter the browser
  bundle; a dedicated pin enforces the erased-type-only rule). The
  `scripts/` browser-smoke exception (`.cjs`) may import exactly node
  builtins + `playwright-core`.
- **Vocabulary pins**: comment-and-string-stripped `src/` code contains no
  business-logic identifiers (reward computation, lifecycle transition
  execution, mission validation, consent/permission mutation, policy or
  rights decisions, publishing, STUDIO OPERATOR ACTIONS — submitReview,
  applyTreatment, packaging, capture, joins). Narrative TEXT may name
  authorities (strings are stripped before the scan), but the code may not
  BE them.
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

## Composition disclosure (UX-001 + UX-002 build)

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
runtime evidence here is `vite build` + `vite preview` + the headless
browser smoke (`scripts/browser-smoke.cjs`).

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
node scripts/browser-smoke.cjs                 # UX-002 headless browser evidence (serves dist/web itself)
pnpm --filter @mos/web exec vite preview       # serve the built bundle
pnpm --filter @mos/web run dev                 # vite dev server (proxy /ws + /api → :3030)
pnpm exec oxlint packages/mos-web              # lint
node harness/mos-boundary-check.mjs            # substrate firewall
```

## Future seams (not in this wave)

- UX-003 Lab surface (`/lab`); UX-004 Connections (`/connections`) — each
  arrives by extending the section table + route views; the
  `not-yet-available` verdicts are first-class until then.
- Phase 2 MOS identity sign-in over `packages/mos-identity` using the
  ported OAuth state codec; the codec is scaffolded + tested, no flow yet.
- The service transport binding (`MosServiceTransport` over the
  `@mos/substrate-adapters` RPC facade) at the TL composition root.
- `packages/mos-desktop` mounts the SAME route component tree through the
  platform port pattern (registry: presentation-only, owner worker-c).
