# @mos/missions

MOS v2.0 **Missions / Objectives** domain package — `CORE-005` (Wave 1, W1-A).

Module registry entry: `missions → packages/mos-missions`, owner `worker-a`, dependencies
`[contracts, identity]`.

## Status

Wave-1 implementation of the mission authority: structured objectives, mission-specific
versioned reward specs, and the strict lifecycle. `@mos/contracts` (CORE-001, Worker B, same
wave) is not in this branch base; the contracts YAML has no standalone `Mission` record —
missions are referenced BY other contracts (`RealExperimentBinding.missionRef`, experiment and
bridge flows) while the reward model is specified by architecture §21. Types are therefore
defined locally against the architecture and switch to `@mos/contracts` at TL reconciliation
(Wave 2). `@mos/identity` is imported type-only (`TenantId`, `TenantScope`).

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

Architecture policy `maxPublicMethods: 12`. This package exports: `MissionRepository` port
methods (7): `createMission`, `getMission`, `activateMission`, `completeMission`,
`archiveMission`, `updateRewardSpec`, `listMissions`; plus 1 module-level factory — **8 total**.

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

## Contract alignment (CORE-001 reconciliation, pending Wave 2)

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
- Strategy refs are opaque strings carried for association only — the strategy authority is a
  separate module per the registry.
