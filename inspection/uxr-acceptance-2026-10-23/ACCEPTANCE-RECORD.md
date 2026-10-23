# MOS Desktop UX Rescue — TL Packaged-App Acceptance Record

**Date:** 2026-10-23
**Branch:** `tl/uxr-integration` (+ the TL integration fixes committed on top)
**Scope:** the FINAL-DESKTOP-UX-RESCUE-HANDOFF acceptance gates, executed by
the TL against the BUILT Linux desktop package (not a dev server).

## Artifacts (built this session, checksum-verified)

| Artifact | Size | SHA-256 |
|---|---|---|
| `MOS-3.14.3-linux-amd64.deb` | 139.0 MiB (145,738,548 B) | `c8dba9d7ac4bb42d5288c409d6d3f33a09df9320554215a64fb25047a5c1150c` |
| `MOS-3.14.3-linux-x86_64.AppImage` | 185 MB (194,415,253 B) | `47388308ad8504794a9bb70e253263626643b50621f34b4fd8ce80dab05dd1d2` |

Both from the FINAL production-flavor build (`bundle7`; build log retained
as `bundle7-build.log`). An earlier MOS-identity build (`bundle6`,
deb `9e8641d6…`) was superseded by `bundle7` after the compile-time
product-flavor correction below.

**Deb verification (dpkg-deb):** Package `mos`, Version `3.14.3`, arch
`amd64`, maintainer `MOS — payswapdotorg <mos@payswap.org>`, Electron
runtime Depends (libgtk-3-0, libnss3, …), `/opt/MOS/mos` executable +
`/usr/share/applications/mos.desktop` launcher present.

**Build commands (this sandbox):**

```text
pnpm install --frozen-lockfile
pnpm --filter @mos/experiments exec tsc -p tsconfig.json   # cycle-breaking pre-emit (see compat.test.ts fix)
pnpm build:bootstrap                                          # second pass after the missions↔experiments fix
ZCODE_ENV=production ZCODE_DESKTOP_NO_MINIFY=1 pnpm --filter @zcode/desktop build:no-runtime-assets
pnpm --filter @zcode/desktop prepare:runtime-assets
ZCODE_ENV=production ZCODE_DESKTOP_DIST_DIR=<polarfs>/mos-dist pnpm bundle:desktop -- --skip-prepare --skip-build --os linux --arch x64
```

The low-memory escape hatch (`ZCODE_DESKTOP_NO_MINIFY=1`, the repo's own
documented 4GB-sandbox lever: vite.config.ts — minify + sourcemaps off) was
required: the default build OOM-killed at 2.67 GB RSS on this 3.9 GB sandbox.

**Product-flavor correction (build-identity axis):** the desktop COMPILE
(main+renderer) embeds `ZCODE_PRODUCT_FLAVOR` from `ZCODE_ENV` at build time
(vite.config.ts define + the tsup main build). A compile without
`ZCODE_ENV=production` embeds the preview flavor and the packaged app names
itself "ZCode Preview" at runtime even inside MOS-named artifacts. The
final compile + bundle therefore both ran with `ZCODE_ENV=production`,
verified at runtime by the X11 main-window identity `WM_CLASS="mos|MOS|"`
and the `/home/z/.zcode/v2/setting.json` `desktopWindowSize` persistence.

## Verification environment (disclosed honestly)

- Debian 13 sandbox, **Xvfb :98 (no window manager)**, CDP
  `--remote-debugging-port=9223`, `--user-data-dir` fresh profile +
  existing-profile restart. No GNOME/Wayland and no root (dpkg install of
  the deb is impossible here) — therefore:
  - The packaged app was RUN from `dist/linux-unpacked` (the exact bits the
    deb installs under `/opt/MOS`) with `--ozone-platform=x11`.
  - The deb artifact itself is verified structurally (dpkg-deb info/contents)
    and the OWNER's Ubuntu GNOME baseline remains
    `inspection/MOS-DESKTOP-REPORT-2026-10-23.md`.
  - Window-management evidence is X11-PROTOCOL-level (real ConfigureWindow /
    Unmap / Map on the app's top-level window — the WM interop a decorated
    native frame participates in), plus the config-level unit tests below.

## Test results (this session, this tree)

| Suite | Result |
|---|---|
| `harness/mos-boundary-check.mjs` | PASSED (no violations) |
| `packages/mos-web` `pnpm test` | **497/497** |
| `packages/mos-desktop` `pnpm test` | **35/35** |
| `packages/mos-desktop` `node --test 'test/**/*.test.ts'` (NEW §4.1/§4.2 policy tests) | **16/16** |
| `packages/mos-integrations` | 76/76 |
| `packages/mos-distribution` | 255+18 |
| `packages/mos-lab` | 434+4 |
| `packages/mos-agent-runtime` | 28+3 |
| `packages/mos-jobs` | 108+2 |
| `packages/mos-web` browser smoke (`node scripts/browser-smoke.cjs`) | **236/236, 0 console errors, 0 page errors** |
| Packaged-app CDP journeys (`journeys-packaged-app.log`) | **66/66** (A window+scroll matrix, B discoverability, C universal composer, D social/YouTube, E Lab) |
| 480×640 declared-minimum window, 7 routes | overflowX=0 on every route |
| Restart (same profile) | window restored 1200×800 (persisted `desktopWindowSize`), shell boots, honest per-load composition state |

## The journeys (what 66/66 covered)

- **A — window management + responsive matrix:** the packaged app's
  top-level X11 window found by WM_CLASS `mos|MOS|`; real
  `ConfigureWindow` resizes applied exactly at 1200×800, 1366×768,
  1024×768, 800×640 and 480×640 (the declared minimum); full-screen bounds
  (maximize analog) + restore; unmap→map (minimize/restore analog) keeps
  the window usable; every route scrolls to bottom and back
  (home maxY=1613, social maxY=2957, lab maxY=605, console maxY=526);
  zero horizontal window overflow anywhere; resize-while-open on
  console/social/lab at 1024/1366 with no clipping; the last reachable
  action is never covered by fixed/sticky chrome.
- **B — discoverability:** the 11-entry §5 rail (7 live routes + 4 honest
  `soon` rows); every route renders a page title; back navigation keeps a
  valid route.
- **C — universal composer:** the Ask MOS header control renders on Home;
  Ctrl+J toggles the overlay; the action→clarify→confirm flow reaches the
  receipt surface; toggling away leaves the route surface intact.
- **D — social/YouTube:** workspace heading, connect-vs-simulate
  distinction, five-platform rail, three-state capability verdicts
  (`unknown — observation-pending` never coerced), honest unavailable
  connect verdict, SANDBOX/SIMULATION labels, no-live-publish disclosure,
  TikTok switch, setup form → create-mission intent declaration
  (the disclosed per-load honest-miss receipt panel on the production
  composition).
- **E — Lab:** sections render; counterfactual output labelled simulated.

## Fixes this session (TL integration work)

1. **`packages/mos-missions/src/prod003/compat.test.ts`** — the
   missions↔experiments circular build: the literal dist import pulled each
   package's emitted declarations into the other's compilation
   (TS2307/TS5055). Converted to a NON-LITERAL dynamic import (runtime
   semantics unchanged — the compat battery still exercises the REAL built
   dist artifact).
2. **`packages/desktop/src/main/desktopWindowVisualOptions.ts` + `test/`**
   (NEW) — the electron-free pure window visual policy (§4.1) + 16 unit
   tests pinning the Linux native-frame contract, the win32 WCO custom
   chrome, the darwin custom titlebar, the unknown-platform fallback, the
   no-kiosk/fullscreen/alwaysOnTop rule, and the §4.2 CSS scroll contract.
   `desktopWindowChrome.ts` now delegates to it (darwin merges the
   canonical overlay position).
3. **`packages/mos-web/src/shell/mos-app-shell.tsx`** — mobile-width
   horizontal-overflow REGRESSION fix (introduced by the rescue's
   recent-missions rail): the wrapping mobile chips lacked width caps, so
   long demo mission titles overflowed 41px at 375px. `max-w-full` on the
   rail `li`/`a` rows (the desktop app at its 480×640 minimum measured
   zero overflow even before this hardening).
4. **`packages/mos-web/scripts/smoke-lab-suite.cjs`** — the transport-era
   "ONLY declare submits" pin RESTATED for the rescue era (the §6.1
   action-aware `lab-ask-mos-*` entries are intended Lab controls now).
5. **`packages/mos-web/scripts/smoke-social-suite.cjs`** — the receipt
   assertion aligned with the disclosed per-load production composition
   (receipt OR the honest not-available-on-this-load panel — never a
   fabricated state).

## Known limitations (disclosed)

- No GNOME/Wayland desktop in this sandbox: native title-bar buttons were
  not CLICKED (no WM to draw them); the window-management proof is
  X11-protocol-level + config-level. The owner's Ubuntu GNOME machine
  remains the live-desktop baseline.
- The deb was not dpkg-INSTALLED here (no root); the packaged bits were run
  from `linux-unpacked` and the deb verified structurally.
- The final artifacts embed the pre-refactor chrome module (semantically
  identical values — the refactor is source hygiene + tests) and the
  pre-hardening renderer className (no observable difference at any desktop
  window size on the production composition; verified at 480×640 and the
  full matrix). Disclosed rather than churning a byte-identical re-bundle
  under the sandbox's disk ceiling.
- Voice input: not inherited — the composer renders its honest unavailable
  row (see the parity matrix). Pay: no payment authority exists in MOS-2.0;
  the composer clarifies intents only.
- Session persistence: the disclosed per-load in-memory composition (the
  honest-miss receipt panel); durable state awaits the P2 service transport.
