# @mos/contracts — MOS v2.0 shared contracts (CORE-001)

The complete TypeScript projection of **spec/contracts/core-contracts-v2.0.yaml**
(the frozen contract manifest, 25 contracts), plus the shared value-type
vocabulary and the machine-readable required-field index.

- **Zero runtime dependencies.** Types + three runtime guards and three frozen
  constants; no `@zcode/*` imports, no engine/provider SDK imports, no
  substrate import (the module-registry dependency on `zcode-substrate-adapters`
  was intentionally NOT used — contracts need nothing from the substrate).
- Every `required` field of every YAML contract exists as a **non-optional,
  `readonly`** property of the matching interface.

## Layout

| File | Contents |
| --- | --- |
| `src/value-types.ts` | Branded ids/refs, `Version`, `TenantId`/`TenantScope`, `StorageRef`/`RightsRef`/`ProvenanceRef`, digests, money/cost/latency models, uncertainty summaries, budgets, JSON-schema objects |
| `src/capability.ts` | `Capability` |
| `src/engine.ts` | `Engine`, `EngineBenchmark`, three-layer `EngineLicense` (§29), `ResourceProfile`, `EngineSecurity` |
| `src/engine-job.ts` | `EngineJob`, `EngineResult`, `RunProvenance`, `ResourceLimits`/`ResourceUsage`, typed failure path |
| `src/transform.ts` | `Transform` |
| `src/artifact.ts` | `Artifact`, `ArtifactRef` |
| `src/production-graph.ts` | `ProductionGraph` + nodes/edges/stopping policy |
| `src/agent.ts` | `AgentBody`, `AgentInstance`, `AgentOrganization` |
| `src/production-request.ts` | `ProductionRequest`, `RightsContext`, `DelayPolicy` |
| `src/studio.ts` | `StudioSession`, `StudioArtifactPackage`, `StudioFormat` |
| `src/human-task.ts` | `HumanProductionTask`, `BottleneckDecision` |
| `src/lab.ts` | `LabScenario`, `LabRun`, `CalibrationRecord`, `RealExperimentBinding` |
| `src/integration.ts` | `SocialAdapter`, `ConnectorProvider`, `PlatformHealthObservation` |
| `src/contracts-by-name.ts` | `ContractsByName` mapping, `ContractName`, `CONTRACT_MANIFEST_VERSION` |
| `src/contract-required-fields.ts` | `CONTRACT_REQUIRED_FIELDS`, `CONTRACT_NAMES`, `getRequiredFields`, `hasRequiredFields`, `assertRequiredFields` |
| `src/fixtures/core-contracts-required-fields.json` | Vendored, hand-derived field index of the frozen YAML |
| `src/type-tests.ts` | Compile-time validation (non-optionality + name-set equality) |
| `src/contracts.test.ts` | Runtime CONTRACT VALIDATION TEST (node:test) |

## Contract validation — how a missing required field fails tests

Three independent layers, any of which fails the build/test battery when a
required field goes missing:

1. **`satisfies` clause (compile time).** `CONTRACT_REQUIRED_FIELDS` is
   declared `as const satisfies { readonly [K in ContractName]: readonly
   (keyof ContractsByName[K] & string)[] }` — every field name in the index
   must be a key of the matching interface. Removing a field from
   `Capability` (say) breaks `tsc --noEmit` here.
2. **Type tests (compile time, `src/type-tests.ts`).** For each of the 25
   contracts: `Expect<AllFieldsRequired<T, typeof CONTRACT_REQUIRED_FIELDS.T>>`
   — `Pick<T, K> extends Required<Pick<T, K>>` fails the moment any listed
   field becomes optional. Plus strict name-set equality between
   `ContractsByName` and the index.
3. **Runtime test (`src/contracts.test.ts`).** Deep-compares
   `CONTRACT_REQUIRED_FIELDS` against the vendored JSON fixture
   hand-derived from the frozen YAML — catches drift in either direction
   (field removed from the const, field added, name typo, order change,
   contract added/missing).

### Fixture derivation (documented, reproducible)

`src/fixtures/core-contracts-required-fields.json` was hand-derived from
`spec/contracts/core-contracts-v2.0.yaml` at repository commit `f1ec0a9`:
each `contracts.<Name>.required` list was copied verbatim, in YAML order,
with no additions, removals, or renames; the fixture records the source,
status (`FROZEN`), spec version (`2.0`) and contract count (25) for
self-verification. The YAML itself is frozen (AGENTS.md) — if it ever
changes, the fixture must be re-derived and the projection updated in
lockstep, and the runtime test will refuse anything less.

## Projection decisions (where the YAML left shapes open)

The frozen YAML specifies required field NAMES only. Where the architecture
documents imply richer shapes, the projection encodes them; significant
decisions, each traceable to spec:

- **Branded nominal types** (`Branded<T, B>`) for all ids and opaque
  cross-authority references — compile-time only, erased at runtime. Fields
  named `*Ref` whose target is itself a core contract use that contract's id
  type (e.g. `StudioSession.sessionRef: StudioSessionId`); refs to
  non-contract authorities (rights, policy, strategy, model, ...) are opaque
  branded strings owned by their future modules.
- **`Version` is a branded integer.** Contracts are explicitly versioned
  (requireExplicitVersionedContracts); versions are monotonic integers.
- **`Engine.license` is the three-layer record** `{ code, model, data }` with
  per-layer `LicenseRecord { identifier, status }` — architecture §29 (three
  layers reviewed separately; commercial compatibility cannot be inferred
  from the code license alone).
- **`Engine.benchmark` is an `EngineBenchmark`** whose `metrics` carry a
  canonical scalar `score` — the engine policy's deterministic tie-break
  (benchmarkScore) needs one number; further metrics ride alongside.
- **`EngineResult.failure` is a required field typed `EngineJobFailure |
  null`** — the failure path is typed, and failed invocations still return
  auditable result records. `RunProvenance` records engine/capability
  identity and `modelIdentity` per run (modelIdentityRecordedPerRun).
- **`AgentInstance` is projected exactly as the frozen list** (bodyVersion,
  modelRef, runtimeRef, toolRefs, capabilityRefs — no id field).
- **`StudioSession.formatVersion` pairs with the request's `studioFormat`
  id** (the session pins the format version it runs).
- **`StudioEvaluation.verdict` separates `quality-rejected` from
  `rights-rejected`** (spec §19: a quality rejection is distinct from a
  rights/policy rejection).
- **`SessionParticipant` separates identity / account / authorization /
  consent references** (spec §15 multi-account discipline; aligned with the
  W0-C studio spike vocabulary for reconciliation).
- Field vocabulary otherwise aligned with the `@mos/studio` spike
  (`CreationMethod`, session lifecycle states) and `@mos/identity`
  (`TenantId`, `WorkspaceId`) to minimize Wave-1 reconciliation. **This
  package is now the canonical authority** for those shared types; the
  sibling packages' local mirrors are theirs to retire.

## Sibling-package reconciliation notes (for the Tech Lead)

- `@mos/identity` (W0-A) should re-export or alias `TenantId`/`WorkspaceId`
  from here instead of its local `domain/ids.ts` brands (its README already
  plans CORE-001 reconciliation).
- `@mos/studio` (W0-C spike) planned to import `StudioSession`,
  `StudioArtifactPackage`, `StudioFormat`, `ArtifactRef`, `ProductionRequest`
  from `@mos/contracts`; its local `refs.ts` mirrors and
  `StudioProductionRequestView` retire in favor of these projections. The
  spike's `ContractVersion`/`MosRef` map to `Version`/`Branded`.
- `@mos/engines` (ENG-001/002, this wave) and `@mos/capabilities`
  (CAP-001, this wave) consume this package directly.

## Verification

```bash
pnpm --filter @mos/contracts exec tsc --noEmit   # compile-time validation incl. type-tests.ts
pnpm --filter @mos/contracts test                # tsc -b && node --test 'dist/**/*.test.js'
pnpm exec oxlint packages/mos-contracts
```
