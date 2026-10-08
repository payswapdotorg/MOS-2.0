# @mos/missions

MOS v2.0 **Missions / Objectives** domain package — `CORE-005` (Wave 1, W1-A) + the
`MARKETING-001` product marketing mission planner (Wave 12, W12-A).

Module registry entry: `missions → packages/mos-missions`, owner `worker-a`, dependencies
`[contracts, identity]` (UNCHANGED by MARKETING-001 — the planner's sibling seams are
type-only; see below).

## Status

Wave-1 implementation of the mission authority: structured objectives, mission-specific
versioned reward specs, and the strict lifecycle. RECONCILED in Wave 2 (W2-A / RECONCILE-A):
the shared vocabulary — `TenantId`, `TenantScope`, `StrategyRef` — is imported (type-only) from
`@mos/contracts`, and `MissionId` is an ALIAS of the contracts `MissionRef` (a
`RealExperimentBinding.missionRef` value from any package resolves directly through
`MissionRepository.getMission` with no adapter mapping). The contracts YAML has no standalone
`Mission` record — missions are referenced BY other contracts (`RealExperimentBinding.missionRef`,
experiment and bridge flows) while the reward model is specified by architecture §21 — so the
`Mission` record, objective and reward-spec types stay package-specific. The Wave-1
`@mos/identity` dependency was retired in W2-A (all its uses switched to `@mos/contracts`).

## What exists

| Path | Contents |
|---|---|
| `src/domain/mission.ts` | `Mission` record + `MissionObjective` (statement/targetMetrics/constraints), `MissionRewardSpec` + `RewardTerm` (the §21 multi-term model), `RewardMetricId` (the full §21 vocabulary), `MissionStatus`, `MissionId` |
| `src/ports/mission-repository.ts` | `MissionRepository` port + inputs + error codes |
| `src/adapters/in-memory-mission-repository.ts` | In-memory adapter (`createInMemoryMissionRepository`) |
| `src/index.ts` | Public surface: types + the factory only |

Tests (`node:test`, zero test-framework dependencies): creation validation, full lifecycle with
version bumps and append-only history, invalid transitions, rewardSpec versioning rules, tenant
scoping, port method-set pinning.

## Public surface budget

Architecture policy `maxPublicMethods: 12` (per port). `MissionRepository` port methods (7):
`createMission`, `getMission`, `activateMission`, `completeMission`, `archiveMission`,
`updateRewardSpec`, `listMissions`; `MarketingPlannerPort` methods (8): `composeMarketingPlan`,
`reviseMarketingPlan`, `getMarketingPlan`, `listMarketingPlanVersions`,
`listMarketingPlansForMission`, `listMarketingPlans`, `verifyMarketingPlanIntegrity`,
`listMarketingPlanCompositionRecords`. Runtime exports: 2 factories + 1 frozen source label.

## Design rules honored

- **Structured objective** (CORE-005): `objective` is `statement + targetMetrics + constraints`,
  never a free-text blob. Blank statements, empty target metrics, and blank constraint
  descriptions are rejected (`invalid-input`).
- **Mission-specific versioned reward** (architecture §21): `rewardSpec` is a per-mission,
  independently versioned spec (`version` starts at 1). The multi-term model carries the full §21
  vocabulary — business outcome, qualified reach, retention, audience growth, qualified traffic,
  conversion, revenue/contribution, cost, latency, human/engine acquisition cost,
  rights/policy risk, fatigue, quality, operational risk — each term with an explicit
  `maximize`/`minimize` direction and a **mandatory precise definition** (a term without a
  definition is invalid: "qualified reach" is only as good as its definition). Spec updates
  advance exactly one version at a time (`requireExplicitVersionedContracts`) and are
  **draft-only** — an active mission's reward is not silently rewired. Vanity metrics never
  silently replace the declared objective: the objective and the reward spec are separate,
  explicit structures.
- **Strict lifecycle**: `draft → active → completed → archived` as named forward transitions
  only. Skips, backs, and re-runs are rejected with `invalid-status-transition`.
- **Append-only history** (`requireAppendOnlyHistoryWhereDeclared`): every mutation writes a NEW
  frozen record version to the mission's chain; prior versions stay retrievable via
  `getMission(id, version)` and are never mutated or deleted.
- **Tenant scoping** (`requireTenantScopeOnMutableArtifacts`): records carry `tenantId`; every
  mutation takes an explicit `TenantScope` and validates the boundary
  (`cross-tenant-reference`); list queries filter by scope with empty misses (no existence
  leaks). Reads are global-by-id with `null` misses — the `@mos/identity` convention.
- **Frozen immutable records**: every stored record and all nested structures are
  `Object.freeze`d.
- **Failures are typed values, not thrown classes**: mutating methods return
  `Mission | MissionRepositoryError`, discriminated with `'error' in result`.
- **Zero runtime dependencies**: no `@zcode/*`, no external packages, no Node-builtin imports
  in runtime code. Identifiers are caller-supplied; the clock is injectable.

## Contract alignment (CORE-001 reconciliation: DONE in W2-A)

| Consumer | This package |
|---|---|
| `RealExperimentBinding.missionRef` | `MissionId` |
| `LabScenario.corpusVersion`-adjacent mission context | `MissionId` + `MissionObjective` |
| Architecture §21 reward model | `MissionRewardSpec` + `RewardTerm` + `RewardMetricId` |
| ProductionRequest objective flows | `MissionObjective` (structured statement/metrics/constraints) |

## Disclosed limitations

- The in-memory adapter is an **ephemeral process-local scaffold** — no database, migrations, or
  durability. Durable persistence and the central schema are TL-owned; the port is the stable
  contract.
- `updateRewardSpec` is draft-only by design; post-activation reward re-versioning (with full
  spec history audit) is a later-wave concern.
- Objective editing after creation is not offered (create-time objective + draft-phase reward
  updates only); a general mission-editing surface can be added behind the same port when a
  caller needs it.
- Strategy refs are the `@mos/contracts` `StrategyRef` type, carried for association only — the
  strategy authority is a separate module per the registry.

## MARKETING-001 — the product marketing mission planner (W12-A)

Backlog acceptance: *"evidence-linked platform/metric/experiment plan; no second Mission
authority."* The planner lives in this package (the registry-exact home — no new module, no
registry entry, no registry dependency) and composes `MarketingPlanRecord`s:

- **Mission linkage is a VERSIONED CITATION, not a mission copy** — every plan cites the exact
  `(missionId, recordVersion)` pair through the mission authority. The planner port owns NO
  mission lifecycle verb; it consumes missions through the injected READ view
  `Pick<MissionRepository, 'getMission'>` (pinned: a view with only `getMission` suffices; a
  hostile view whose other methods throw proves none is ever called; composing plans never
  creates or mutates a mission in the REAL repository).
- **Every plan element is evidence-linked** — platform choices, metric expectations and
  experiment expectations all cite `ProductIntelligenceVersionRef`s resolved through the
  product-intelligence authority's FAIL-CLOSED versioned-citation resolution (an unresolvable
  citation is the typed `evidence-citation-unresolvable` carrying the authority's cause — never
  a fabricated basis). Metric expectations carry the §25 basis union with TYPE-LEVEL literal
  pins (`cited-evidence` ⇒ `counterfactual: false`; `counterfactual-forecast` ⇒
  `counterfactual: true` + methodNote) re-validated at runtime, plus the coherence rule that a
  cited-evidence expectation backed only by counterfactual-forecast records rejects
  (`basis-evidence-mismatch`).
- **Health-respect (HEALTH-001)** — a plan element whose platform is under a
  provider-CONFIRMED restriction either acknowledges it (snapshotted BY VALUE from the ACTUAL
  health observation) or the composition fails closed with the typed reason
  (`platform-under-confirmed-restriction`, listing the unacknowledged restriction refs).
  Acknowledging a non-confirmed observation (unknown id, foreign tenant, or a SUSPECTED
  anomaly) rejects (`acknowledged-restriction-not-confirmed` — suspected is NEVER confirmed).
  SUSPECTED anomalies snapshot advisory-only (`suspectedNeverConfirmed: true`) and never gate.
  Revisions re-run the battery against CURRENT observations.
- **Records** — versioned tenant-scoped append-only (compose = v1; revise appends
  `supersedes.version + 1` with optimistic-concurrency conflict detection; prior versions stay
  bit-for-bit immutable and retrievable), digest-sealed (canonical JSON + FNV-1a — the LAB-017
  change-detector precedent, never a security claim) with an integrity read, and every
  attributable attempt appends a §30 composition record (success AND typed rejection — there is
  no unrecorded path; the adapter self-labels `in-memory-marketing-planner` so a disclosed
  double can never masquerade as a production planner).
- **Standard disciplines BY CONSTRUCTION** — fail-closed typed errors everywhere
  (result-union, `'error' in result`); JSON-array composite chain keys (D1); exact-tenant
  equality listings (D2); clone-then-deep-freeze with `__proto__`-safe cloning (D3/F1); frozen
  `TenantScope` copies (D4); finite/integer guards on every numeric input (D5/F2);
  element-wise acknowledgment-vs-confirmation id matching (the D6 posture).
- **Port budget**: `MarketingPlannerPort` is 8 methods ≤ the 12-method policy budget —
  compose, revise, get, listVersions, listForMission, listPlans, verifyIntegrity,
  listCompositionRecords. The `listMarketingPlansForMission` / `listMarketingPlans` reads are
  the seams COMMERCE-001 discovery extends from.

### The cross-authority seams (type-only; zero runtime coupling)

The planner consumes `@mos/product-intelligence` (citation resolution — §25) and
`@mos/distribution` (health observations — HEALTH-001) through injected `Pick<...>` views:
`MarketingPlannerMissionSource`, `MarketingPlannerIntelligenceSource`,
`MarketingPlannerHealthSource`. Both sibling packages are imported **TYPE-ONLY**; they appear
as devDependencies solely so the type-level seams resolve (a 7-line `pnpm-lock.yaml` importer
delta — disclosed), and the emitted code contains ZERO imports of them (pinned by inspection
of `dist/`). The real-stack compat battery runs the REAL in-memory authorities end-to-end
through the testing seam's relative built-dist runtime imports (the `@mos/web` / `@mos/studio`
precedent); the rights source inside the product-intelligence adapter remains its own
disclosed structural double (the composition root wires the real one).

| Path | Contents |
|---|---|
| `src/domain/marketing-plan.ts` | `MarketingPlanRecord` + `MissionCitation`, the expectation-basis union, health snapshots (by value, literal-pinned), the §30 composition record |
| `src/ports/marketing-planner.port.ts` | `MarketingPlannerPort` (8 methods) + inputs + error codes + the three injected view types |
| `src/adapters/marketing-plan-validation.ts` | structural validation (internal) |
| `src/adapters/marketing-planner-battery.ts` | the shared fail-closed battery (internal) |
| `src/adapters/marketing-planner-support.ts` | canonical JSON + FNV-1a digest + clone/freeze (internal, the per-package copy precedent) |
| `src/adapters/in-memory-marketing-planner.ts` | in-memory adapter (`createInMemoryMarketingPlanner`) |
| tests | functional battery + authority-discipline battery + adversarial (D1–D6/F1/F2) battery + real-stack compat battery — 49 new tests |

Planner-verb vocabulary discipline: mission-lifecycle verbs (`createMission`,
`activateMission`, `completeMission`, `archiveMission`, `updateRewardSpec`) are banned from
the planner surface (test-pinned), and every record carries the verbatim no-second-authority
boundary statement.
