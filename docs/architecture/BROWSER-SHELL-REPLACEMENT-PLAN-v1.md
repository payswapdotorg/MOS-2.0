# Browser Shell Replacement Plan — `packages/mos-web` (UX-001..UX-006)

Status: v1 (Wave 1 deliverable — W1-C; expands the seed planted in
`docs/architecture/UX-SUBSTRATE-AUDIT-v1.md` §5)
Author: worker-c (Studio/Integrations/UX lane)
Authority basis (frozen):

- `spec/mos-module-registry-v2.0.yaml`: module `web` → `packages/mos-web`,
  owner `worker-c`, authority **presentation-only**, dependencies
  `[contracts]`; module `desktop` → `packages/mos-desktop`, owner `worker-c`,
  presentation-only, `[contracts]`.
- `spec/mos-module-dependency-matrix-v2.0.md`: web/desktop forbidden direct
  DB/domain mutation; allowed direction UI → contracts projections only.
- `spec/mos-architecture-policy-v2.0.md`: `forbidDeepImports`,
  `forbidSecondAuthorities`, `requireExplicitVersionedContracts`;
  `legacySubstrate` UI/web-shell/desktop-shell retained as substrate only.
- `docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md`: web shell row —
  "retain shell patterns; replace product surface".
- `spec/mos-effective-backlog-v2.0.md`: UX-001 (deps CORE-002, CORE-005),
  UX-002 (deps STUDIO-014), UX-003 (deps LAB-017), UX-004 (deps PROD-001),
  UX-005 (deps UX-001..004), UX-006 (deps PROD-004, UX-005).
- `docs/handoff/EXECUTION-PLAN-V2.0.md` wave map: worker-c Wave 1 =
  STUDIO-001 + STUDIO-002 + STUDIO-005 + this plan; Wave 2 = STUDIO-003..009;
  Wave 3 = STUDIO-010..014; Wave 4 = BRIDGE/PROD-001/002; Wave 5 =
  PROD-003/004 + UX-001..006 + browser/deployment proof.

Input audit: every KEEP/REPLACE/RETIRE classification and cited source path
below comes from `docs/architecture/UX-SUBSTRATE-AUDIT-v1.md` (§1 inventory,
§2 classification, §3 MOS surface map, §4 firewall implications). This plan
is NOT a frozen architecture file; it is the phased execution plan the TL
and worker-c execute against.

---

## 1. Objective and shape

Replace the ZCode coding web shell (`packages/web`, 3,325 lines mounting the
`@zcode/ui` `Root` tree — audit §1) with a MOS-owned browser shell
(`packages/mos-web`) that presents the four MOS product surfaces (Missions
Home, Studio, Lab, Connections) as **presentation-only projections**: the
shell renders state and issues commands exclusively through server-side MOS
services; it owns no business authority, no direct DB/domain mutation, and
no distribution paths. The ZCode substrate is consumed ONLY through the
retained shell patterns (audit §2 KEEP) behind MOS-owned adapters.

`packages/web` and `packages/ui` are READ-ONLY for this migration until
cutover: the new shell is built in parallel (`packages/mos-web`), and the
ZCode shell is retired only after the MOS surfaces exist (audit §2 RETIRE).

## 2. Target package and route architecture

### 2.1 Package layout (`packages/mos-web`)

```
packages/mos-web/
  package.json              # private; vite + react + tailwind; scripts dev/build/test/lint
  vite.config.ts            # modeled on packages/web/vite.config.ts (audit KEEP): react+tailwind
                            #   plugins, dev proxy /ws + /api → MOS server, env define block,
                            #   hidden prod sourcemaps
  index.html                # pre-render theme shell modeled on packages/web/index.html
                            #   (audit KEEP: pre-paint background keyed on a theme-surface attr)
  tsconfig.json             # composite, strict; types from @mos/contracts only
  src/
    main.tsx                # entry modeled on packages/web/src/main.tsx bootstrap skeleton
                            #   (audit KEEP): pre-paint theme seed, stream client id,
                            #   AppErrorBoundary, bootstrap error screen, route dispatch
    routes/
      missions-home/        # UX-001: route "/" — missions-first home
      studio/               # UX-002: route "/studio" — session/capture/review/treatment UX
      lab/                  # UX-003: route "/lab" — scenarios/runs/candidates/calibration
      connections/          # UX-004: route "/connections" — connectors/providers/rights gates
    shell/                  # MOS app shell: navigation, layout, locale, theme hookup
    platform/               # MOS-owned web platform port + theme seed + oauth state codec
                            #   (patterns ported per audit KEEP, MOS naming, zero ZCode imports)
    services/               # typed MOS service access over the retained WS/RPC substrate
                            #   (connectViaWebSocket + RemoteServiceAccess patterns, audit KEEP)
    projections/            # read-model view-models per surface (UI → contracts only)
```

Routing stays hand-rolled dispatch in `src/main.tsx` (the audited pattern —
`packages/web/src/main.tsx` `bootstrapWebApp()` route table, audit §1.1);
no router dependency is introduced. `packages/mos-desktop`
(presentation-only, owner worker-c) mounts the SAME route components with a
desktop platform port, mirroring how `packages/desktop/src/renderer/src/main.tsx`
and `packages/web/src/main.tsx` both mount `Root` today (audit §3, desktop
parity note).

### 2.2 Route ↔ surface ↔ dependency readiness

| Route | Surface (backlog, deps) | Reads (projections only) | Writes (service calls only) | Backend readiness wave |
|---|---|---|---|---|
| `/` Missions Home | UX-001 (CORE-002 identity, CORE-005 missions) | identity/tenant/workspace read models, mission + objective state | sign-in, mission lifecycle commands | CORE-002 Wave 0 groundwork done (worker-a `packages/mos-identity`); CORE-005 Wave 1/2 |
| `/studio` Studio Surface | UX-002 (STUDIO-014 standalone studio product) | `@mos/studio` StudioSession lifecycle states, participant consent states, artifact-package stage previews (raw/intermediate/final), treatment/rejection outcomes | createSession, loadOrganization, joinParticipant, openCapture, submitReview, applyTreatment (`packages/mos-studio` runtime API, W1-C) | STUDIO-001/002/005 DONE (this wave); STUDIO-003..009 Wave 2; STUDIO-010..014 Wave 3 → UX-002 lands Wave 5 |
| `/lab` Lab Surface | UX-003 (LAB-017 robust benchmark) | scenarios, runs, candidates, predictions vs observations (historical vs counterfactual visibly distinct), calibration records | experiment run commands through lab services | LAB-001 Wave 1 (worker A); LAB-002..006/010/013 Wave 2; LAB-017 Wave 4 |
| `/connections` Connections | UX-004 (PROD-001 distribution/integrations) | connector/provider availability with explicit UNKNOWN states, account health, rights/policy gate outcomes | connection authorization flows via integrations/distribution services | PROD-001 Wave 4 |

UX-005 (progressive disclosure polish) layers across all four routes after
UX-001..004; UX-006 (complete browser acceptance) is the closed-loop proof
pass over the whole shell.

### 2.3 Substrate shell patterns reused (audit §2 KEEP, with sources)

| Pattern ported into `mos-web` | Audited source | Target file |
|---|---|---|
| Pre-paint theme seeding + pre-render background (no white flash) | `packages/web/src/webThemeSeed.ts`; `packages/web/index.html` theme-surface styles | `src/platform/theme-seed.ts`; `index.html` |
| Web platform service port with explicit no-ops (capability parity seam) | `packages/web/src/main.tsx` `createWebPlatform()` implementing `IPlatformService` (`@zcode/shared`) | `src/platform/web-platform.ts` (MOS platform port; desktop parity via `packages/mos-desktop`) |
| OAuth state codec (encode/parse + safe returnTo) behind MOS identity | `packages/web/src/auth/oauthStateCodec.ts` (`parseOAuthState`, `resolveSafeAppReturnTo`) | `src/platform/oauth-state-codec.ts` |
| Bootstrap error screen + app error boundary | `packages/web/src/main.tsx` `renderWebBootstrapError()` / `WebBootstrapErrorScreen`; `packages/ui/src/ErrorBoundary.tsx` `AppErrorBoundary` | `src/main.tsx`; `src/shell/error-boundary.tsx` |
| Vite dev proxy + env define gating | `packages/web/vite.config.ts` (proxy `/ws`+`/api` → 3030; `define` block) | `vite.config.ts` (MOS env names, no `VITE_ZAI_*`) |
| WS service bootstrap + typed service access mechanics | `packages/client/src/websocket.ts` `connectViaWebSocket`; `packages/client/src/remoteServiceAccess.ts`; `packages/rpc/src/proxy-channel.ts` (behind `@mos/substrate-adapters` RPC facade — BOOT-003) | `src/services/mos-services.ts` |
| Generic UI primitives + intl provider + theme hook | `packages/ui/src/components/ui/*`; `ZCodeIntlProvider`; `packages/ui/src/useTheme.ts` (substrate inventory: retain generic primitives only) | imported via an allowlisted entry, never `Root`/`root/`/`v4/`/coding panes (audit §4) |

## 3. Phased migration plan

### Phase 0 — audit (DONE, Wave 0)

`docs/architecture/UX-SUBSTRATE-AUDIT-v1.md`: inventory of
`packages/web` + `@zcode/ui` surface, KEEP/REPLACE/RETIRE tables with cited
paths, MOS surface map, firewall implications.

### Phase 1 — MOS shell skeleton (Wave 1/2 boundary; no product deps)

Scaffold `packages/mos-web` exactly as audit seed step 1: Vite
react+tailwind shell, entry bootstrap modeled on
`packages/web/src/main.tsx`, MOS navigation skeleton
(Missions/Studio/Lab/Connections placeholders), generic primitives only.
Adds the presentation-only import guard BEFORE any surface lands (audit
risk 1). Deliverable: the shell boots against a MOS server stub with the
platform port, theme seed and error screens working; zero `@zcode/ui`
product-surface imports (machine-checked).

### Phase 2 — Missions Home + MOS identity sign-in (UX-001)

First real surface: identity onboarding over MOS identity (CORE-002
`packages/mos-identity`), OAuth state handling via the ported codec
pattern, missions home read projections + mission commands through services.
Depends on CORE-005 (missions) landing (Wave 1/2).

### Phase 3 — Studio surface, incremental (UX-002; grows with the Studio waves)

The largest surface, delivered incrementally against the `@mos/studio`
runtime API as it grows:
- Wave 1 (now): session creation UX (standalone intent → format selection
  from the registry → organization version picker with explicit verdicts),
  lifecycle state projection (requested → loading → capturing → processing
  → review → packaged), participant join + consent UX (§15 multi-account
  surface: separate identity/account/authorization/consent panels), capture
  readiness UX (device enumeration/validation per format requirements) —
  all against the STUDIO-001/002/005 runtime and the CaptureSourcePort
  contract (browser media APIs bind the capture port in the shell).
- Wave 2 (STUDIO-003..009): script/question-graph UX, interviewer config,
  real editing/composition previews.
- Wave 3 (STUDIO-010..014): complete format UX (podcasts, reaction with
  organization-decided layout/timing surfaced as read-only organization
  decisions), treatment/rejection UX (quality vs rights/policy visually
  distinct), standalone studio product acceptance.

### Phase 4 — Lab + Connections surfaces (UX-003/UX-004; Waves 4–5)

`/lab` after LAB-017 readiness (Waves 2–4 build the lab modules);
`/connections` after PROD-001. Explicit UNKNOWN states for connector
availability (never placeholder green lights); counterfactual vs historical
lab evidence always visually distinct (lab policy).

### Phase 5 — polish, acceptance, ZCode web retirement (UX-005/UX-006)

Progressive disclosure layering; closed-loop browser acceptance evidence
(UX-006); then execute the audit RETIRE list: delete/archive
`packages/web/src/auth/*` (except the ported codec pattern),
`packages/web/src/share/*`, `packages/web/src/communityUrl.ts`, ZCode env
defines and identity strings; rebrand the shell. `packages/web` is deleted
or archived once no MOS route depends on it.

### Sequencing vs Studio/Lab wave readiness (summary)

| Wave | worker-c studio lane | Shell work possible |
|---|---|---|
| 1 (now) | STUDIO-001 runtime, STUDIO-002 formats, STUDIO-005 capture ports | Phase 1 skeleton + Phase 3 studio UX foundations against the runtime's session/capture API |
| 2 | STUDIO-003..009 | Phase 2 Missions Home (CORE-005 ready), studio surface growth |
| 3 | STUDIO-010..014 | full studio surface → UX-002 ready |
| 4 | BRIDGE/PROD-001/002 | Phase 4 Lab + Connections |
| 5 | PROD-003/004 + UX-001..006 | Phase 5 polish, acceptance, retirement |

## 4. Risks and mitigations

1. **Deep-import gravity** (audit §4): a rushed "just mount Root" shortcut
   imports the entire ZCode product surface and its service tree
   (`packages/ui/src/Root.tsx` → `packages/client/src/remoteServiceAccess.ts`
   → IFileService/IGitService/...). Mitigation: the Phase 1 import guard
   (machine-checked allowlist: `@zcode/ui` generic primitives entry only;
   forbid `Root`, `root/`, `v4/`, coding panes, `@zcode/client`) +
   `harness/mos-boundary-check.mjs` extension — BEFORE the first MOS surface
   lands.
2. **Web/desktop coupling** (audit risk 2): both current shells mount the
   same `Root` tree; MOS must not fork surfaces. Mitigation: one shared
   route-component tree in `packages/mos-web/src/routes/**` consumed by
   `packages/mos-desktop` through the platform port pattern
   (`createWebPlatform()` audit KEEP); worker-c owns both modules.
3. **Auth authority** (audit risk 3): the Zai OAuth flow cannot be
   rebranded into MOS identity. Mitigation: Phase 2 builds sign-in on MOS
   identity (`packages/mos-identity`, CORE-002) with the ported
   `oauthStateCodec.ts` pattern only; Zai provider files stay on the RETIRE
   list until cutover.
4. **i18n defaults** (audit risk 4): current shell hard-codes zh/en
   switching (`main.tsx` `navigator.language`; `/cn` share prefix).
   Mitigation: an explicit MOS locale strategy decided at Phase 1 (registry
   of locales on the MOS shell; no path-prefix locale semantics carried
   over except as a deliberate product decision).
5. **Partial service availability** (audit risk 5): MOS server services
   appear incrementally; the shell must not pretend capabilities exist.
   Mitigation: every route renders its dependency set's availability
   explicitly (UNKNOWN/unavailable states are first-class, matching the
   connections/evaluation explicit-verdict discipline); no placeholder UI.
6. **Presentation-only erosion**: convenience "one tiny direct mutation"
   creeping into the shell. Mitigation: dependency list stays `[contracts]`
   in the frozen registry; the boundary harness + import guard enforce it;
   mutations only as service commands over the RPC substrate.

## 5. First three concrete implementation steps (file-level targets)

1. **Scaffold the shell package** — create `packages/mos-web/package.json`
   (private, type module, scripts `dev/build/test/lint`), copy-adapt
   `packages/web/vite.config.ts` → `packages/mos-web/vite.config.ts`
   (react+tailwind plugins, dev proxy `/ws` + `/api` → MOS server, MOS env
   define block — `VITE_MOS_*` names only), `packages/web/index.html` →
   `packages/mos-web/index.html` (MOS title, pre-render theme shell), and
   write `packages/mos-web/src/main.tsx` modeled on the audited
   `packages/web/src/main.tsx` bootstrap skeleton (pre-paint theme seed,
   error boundary, bootstrap error screen, hand-rolled route dispatch to a
   `shell/MosAppShell.tsx` with Missions/Studio/Lab/Connections nav
   placeholders). Register the package in the workspace + lockfile importer
   (TL-disclosed central-file touch, same as the W0 importer entries).
2. **Port the shell patterns as MOS-owned utilities** — create
   `packages/mos-web/src/platform/theme-seed.ts` (pattern of
   `packages/web/src/webThemeSeed.ts`, MOS theme tokens + `mos-theme`
   storage key), `packages/mos-web/src/platform/web-platform.ts` (pattern of
   `createWebPlatform()` in `packages/web/src/main.tsx`: MOS platform port
   with explicit web no-ops), and
   `packages/mos-web/src/platform/oauth-state-codec.ts` (pattern of
   `packages/web/src/auth/oauthStateCodec.ts`: `parseOAuthState` +
   `resolveSafeAppReturnTo` with MOS naming and no Zai imports). Plus
   `packages/mos-web/src/services/mos-services.ts` over the
   `@mos/substrate-adapters` RPC facade (BOOT-003) using the
   `connectViaWebSocket` mechanics.
3. **Add the presentation-only guard BEFORE the first surface** — extend the
   boundary rules (TL-owned `harness/mos-boundary-rules.json`, disclosed
   central-file touch) with a `MOS-WEB-PRESENTATION-ONLY` rule: files under
   `packages/mos-web/src/**` may import only `@mos/contracts`,
   `@mos/substrate-adapters`, the allowlisted `@zcode/ui` generic
   primitives entry (`components/ui`, `ErrorBoundary`, intl provider,
   `useTheme`) and local modules; `@zcode/ui` product surfaces
   (`Root`, `root/**`, `v4/**`, coding panes) and `@zcode/client` are
   forbidden; fail the harness on any violation. Wire it into the Phase 1
   acceptance: guard green before any route component beyond the skeleton
   is merged.

## 6. Verification discipline for this plan

- Every audited path cited above was existence-verified in
  `docs/architecture/UX-SUBSTRATE-AUDIT-v1.md` §6 (branch `worker-c/wave0`,
  base 31d9ef9) and re-verified against the current clone for the KEEP table
  sources (`packages/web/src/main.tsx`, `webThemeSeed.ts`,
  `auth/oauthStateCodec.ts`, `vite.config.ts`, `index.html`,
  `packages/ui/src/components/ui/`, `packages/ui/src/ErrorBoundary.tsx`,
  `packages/ui/src/useTheme.ts`, `packages/client/src/websocket.ts`,
  `packages/client/src/remoteServiceAccess.ts`,
  `packages/desktop/src/renderer/src/main.tsx`).
- Wave readiness mapping cross-checked against
  `docs/handoff/EXECUTION-PLAN-V2.0.md` §Wave tables and
  `spec/mos-effective-backlog-v2.0.md` dependency lines.
- This plan touches no code and no frozen file; implementation starts at
  Phase 1 with TL dispatch (the plan is the deliverable of W1-C).
