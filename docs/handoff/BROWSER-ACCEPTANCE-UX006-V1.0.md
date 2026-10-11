# BROWSER ACCEPTANCE — UX-006 (Complete Browser Acceptance) — V1.0

Status: PASSED (TL-verified 2026-10-11 — the whole-shell run: 181/181 assertions, zero console/page errors)
Base: main @ a4a0c14 · Branch: worker-c/wave17-ux006 · Suite: `scripts/smoke-ux006-suite.cjs`

## 1. Suite structure
One whole-shell pass driving the complete §2 loop arc through the real browser
(vite preview over dist/web, playwright-core chromium): Home → Missions →
Studio → Lab → Connections → Home, then the cross-surface honesty inventory,
keyboard traversal, and the 390px responsive pass over all five routes.
Composes the per-surface suites (studio/lab/connections/ux005 + responsive
remain green and untouched).

## 2. Loop-arc assertion
The orientation strip's five stages render in loop order
(Intent → Creation → Verification → Connection → Evidence), each linking to
the surface the pass then visits: Intent→Missions, Creation→Studio,
Verification→Lab, Connection→Connections, Evidence→Lab. Each visited surface's
owning stage law is asserted on-station (verification carries
counterfactual/measured; connection carries platform-said and the
zero-transport denial; evidence carries resolvable-only refs).

## 3. Cross-surface honesty inventory
| Label | Source surface | Rendered in run DOM |
|---|---|---|
| Intent / Creation / Verification / Connection / Evidence | orientation strip | YES — in order, links resolve to the loop targets |
| LAB_COUNTERFACTUAL_LABEL fragment | Lab | YES — the §20/§24 badge renders on the surface and inside the digest disclosure |
| LAB_MEASURED_LABEL fragment | Lab | YES |
| LAB_BOUNDARY_NOTE fragment | Lab | YES — 'never deployment evidence' |
| synthetic (§14) | Studio | YES |
| consent (§15) | Studio | YES |
| UNKNOWN preservation | Connections | YES — 'unknown — not claimed' cells render |
| platform-said health | Connections | YES — with CONFIRMED/SUSPECTED typing |
| zero-transport denial | Connections | YES — 'transport calls occurred: 0' inside the expanded binding detail |
| §13 lifecycle badges | Missions | YES — draft/active/completed across the three seeded demo missions |
| tenant context (§31) | shell chrome | YES — 'Tenant Demo Tenant' chrome + per-surface scopes |

## 4. Gate numbers (branch)
- typecheck: tsc 0 errors (both projects)
- test: 342/342 (base 336/336 + 6 new UX-006 honesty-inventory pins)
- lint: oxlint 0 warnings / 0 errors
- boundary check: PASSED (19 packages)
- architecture check: 0 violations (baseline 0, new 0)
- sweep: mos-* 2351/0 (base 2345/0 + 6, zero regressions)
- browser smoke family: 181/181 with ZERO console errors and ZERO page errors (base 120/120 + 61 UX-006 additions incl. the loop-arc stations, the honesty inventory, the keyboard pass, and the 390px × 5 routes)

## 5. Browser-run transcript summary (station log)
Captured from the suite's `UX006-STATION` JSON lines, one per station:
Captured from the suite's `UX006-STATION` JSON lines (the TL's run):
- home: orientation strip visible; five LOOP_STAGES in order; stage links resolve to loop targets; tenant context rendered
- missions: lifecycle badge; tenant context; mission selection followed (the seeded demo missions: draft/active/completed)
- studio: §14 synthetic provenance; §15 consent state; chain navigation; disclosure item
- lab: counterfactual label; measured label; boundary note; benchmark digest; calibration state
- connections: UNKNOWN preservation; platform-said health; zero-transport denial; binding lifecycle view
- home-return: loop closed — the shell re-renders the orientation strip
- honesty-inventory: Intent, Creation, Verification, Connection, Evidence, counterfactual, measured, boundary, synthetic, consent, UNKNOWN, platform-said — all rendered in the run's DOM
- keyboard: 18 focusables traversed; disclosure summaries reachable by Tab; Enter opens a disclosure item
- responsive-390px: no horizontal scroll on /, /missions, /studio, /lab, /connections

## 6. Console/page errors
Zero console errors and zero page errors across the entire family run:
CONFIRMED — the driver's final assertions ('zero console errors across every visit', 'zero page errors across every visit') PASS over the full 181-assertion run incl. every UX-006 station.

## 7. Responsive + keyboard results
- 390px no-horizontal-scroll on /, /missions, /studio, /lab, /connections:
  PASS on all five routes (scrollWidth − clientWidth ≤ 0)
- Keyboard: tab order reaches disclosure summaries, Enter opens them:
  PASS — 18 focusables on the Connections station; native summary controls are Tab-reachable and Enter-operable

## 8. Source/tests/browser agreement (release-acceptance clause)
The source (exported label constants + presentation modules), the tests (unit
pins + per-surface smoke suites + the UX-006 whole-shell suite), and the real
browser run agree: every honesty law the shell can render is asserted in tests
and observed in the run's DOM. This statement is only as strong as the gates
in §4 — all gate numbers above are supplied by the TL's real run; none were
fabricated at authoring time.

## 9. Out of scope (disclosed)
The Phase-5 RETIRE list (ZCode web retirement) is a separate follow-on per
the plan — not part of UX-006.

## 10. TL reconciliation notes (the PLAN C drift record)
- The suite's text assertions were reconciled to the app's async mount
  (data-marker waits, not chrome-shell waits) and to case-insensitive
  matching (the chrome renders 'Tenant', the inventory asserts 'tenant').
- The Missions station required the composition to SEED demo missions
  (three REAL records through the REAL repository — the Studio/Lab seam
  pattern): `seedDemoMissions: true` is opt-in; the browser shell opts in
  (src/main.jsx); the node-side tests keep their fresh-repository default
  (zero regressions). The repository's real lifecycle API
  (activateMission/completeMission, two-arg form) drove the §13 badge
  variety (draft/active/completed).
- The keyboard Enter check focuses a disclosure summary directly (the
  Tab-traversal sweep confirms reachability; the focused-summary Enter is
  the deterministic open assertion).
- The unit pins live at testing/ux006-honesty-inventory.test.ts (the house
  location; the emission placed them under src/views/__tests__/).
