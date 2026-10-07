# @mos/lab

MOS v2.0 **Marketing Lab** package — `LAB-001` (reference-first niche corpus runtime) +
`LAB-002` (multimodal feature bundles) + `LAB-003` (Idea Graph), delivered in Wave 2 (W2-A),
plus `LAB-004` (Social Simulator), `LAB-005` (User/Creator/Competition Dynamics) and
`LAB-006` (Time Machine), delivered in Wave 3 (W3-A), plus `LAB-007` (World Model Ensemble),
`LAB-008` (Offline / Off-Policy Evaluation) and `LAB-009` (Sequential Strategy Learning),
delivered in Wave 4 (W4-A).

Module registry entry: `lab → packages/mos-lab`, owner `worker-a`, dependencies
`[contracts, content, production, agents, capabilities, engines, jobs]`.

## Status: corpus / features / idea-graph / simulator / dynamics / Time Machine / ensemble / off-policy evaluation / strategy learning (in-memory scaffolds)

All shared vocabulary is imported from **`@mos/contracts`** (W2-A / RECONCILE-A). The package
contains:

- **LAB-001 — reference-first niche corpus**
  - `src/contracts/corpus.ts` — `ReferenceDocument` (id, version, tenantId, niche, platform,
    modality, **`artifact: ArtifactRef`** — a reference to one acquired content artifact, never
    content bytes, sourceRefs, acquiredAt, **rightsRef**, provenanceRef), `CorpusVersion`
    (immutable append-only snapshot), `CorpusQuery`, `RightsCheckPort` (the injected acquisition
    rights gate) and the **`CorpusStore`** port (6 methods ≤ 12 policy budget);
  - `src/adapters/in-memory-corpus-store.ts` — in-memory `CorpusStore` (disclosed scaffold).

- **LAB-002 — multimodal feature bundles**
  - `src/contracts/feature-bundle.ts` — `FeatureDescriptor` (feature kind + computed
    `ArtifactRef` + scalar manifest metadata), `FeatureBundle` (versioned, attach/detach
    append-only), `FeatureBundleRegistry` port (5 methods), `FeatureComputationPort`
    (declaration only — capability contracts, no engine selection);
  - `src/adapters/in-memory-feature-bundle-registry.ts` + `static-feature-computation.ts`.

- **LAB-003 — Idea Graph**
  - `src/contracts/idea-graph.ts` — `IdeaNode` (statement, embedding as artifact ref,
    mandatory derivation to corpus documents / feature bundles), `IdeaEdge` (typed weighted
    versioned relations), `IdeaGraph` port (8 methods) and `DerivationStep`;
  - `src/adapters/in-memory-idea-graph.ts`.

- **LAB-004+ — historical evidence vs counterfactual predictions (`src/contracts/evidence.ts`)**
  - **TYPE SEPARATION (architecture lock rule 29)**: `HistoricalObservation`
    (`counterfactual: false` — real observed metric records from corpus/evidence) and
    `SimulationPrediction` (`counterfactual: true` + `disclosure: 'synthetic-response-function'`
    — synthetic simulator output, never ground truth, spec §22) are distinct branded types with
    opposite literal discriminants: **a `SimulationPrediction` can never be stored or returned
    where a `HistoricalObservation` is required** (and vice versa) — pinned by compile-time
    assertions inside the contract files and by runtime label tests;
  - `ObservedMetric` / `PredictedMetric` / `PredictionInterval` (§22 uncertainty envelopes).

- **LAB-004 — Social Simulator**
  - `src/contracts/simulator.ts` — `SocialWorldModel` (versioned **`worldModelVersion`**
    append-only chain — the exact version a `LabRun.worldModelVersion` pins; synthetic state:
    base audience, fatigue, competitor share, seasonal factor), `SocialWorldModelStore` port
    (4 methods), `StrategyActionCandidate` (canonical `StrategyRef` + sim-local action knobs;
    `no-op`/`repost` are first-class kinds per lock rule 5), and the deterministic
    **`SimulatorEnginePort`** (`simulateStep`: worldModelVersion + `LabScenario` + candidate +
    REQUIRED seed + step → `SocialSimulationResult` — a `SimulationPrediction` extended with
    reach/engagement-style metric deltas per the scenario objective, §22 uncertainty envelope,
    and the next world state);
  - `src/adapters/in-memory-social-simulator.ts` — world model store + **DISCLOSED
    deterministic synthetic response function** (parametric equations with mulberry32 seeded
    noise; full equations documented in the adapter; NOT a real platform model).

- **LAB-005 — User/Creator/Competition Dynamics**
  - `src/contracts/dynamics.ts` — `DynamicsModel` (versioned, tenant-scoped population
    records: `user-archetype` / `creator-archetype` / `competitor-profile` segments with
    synthetic trait knobs), `DynamicsModelStore` port (3 methods), `DynamicsState`
    (population-resolved world state: audience size, per-segment fatigue/affinity, competitor
    share), `PopulationResponse` (fatigue accumulation, audience growth/decay, competitive
    displacement, novelty effect) and the deterministic **`DynamicsStepPort`** (seeded;
    fatigue is non-decreasing by construction);
  - `src/adapters/in-memory-dynamics.ts` — model store + **DISCLOSED deterministic synthetic
    parametric population model** (equations documented in the adapter).

- **LAB-006 — Time Machine**
  - `src/contracts/time-machine.ts` — the **three §20 modes** on one port (8 methods):
    1. `replayHistorical` — historical replay, strictly `observedAt ≤ T`;
    2. `replayDelayedInformation` — delayed-information replay: at T under lag L (ms), only
       information available by T-L (**leakage prevention is lock rule 30** — records newer
       than T-L are never visible, adversarially test-pinned incl. a 1 ms boundary probe and
       shuffled append order);
    3. `createBranch` / `recordBranchPrediction` / `getBranch` / `getBranchRecords` /
       `listBranches` — counterfactual branching: machine-assigned NEW branch ids, auditable
       lineage (parent branch or historical timeline), and branch records that are
       `SimulationPrediction`s — **type- and label-separated from historical evidence**
       (the runtime re-validates `counterfactual === true`, so even a double-cast caller
       cannot smuggle historical records into a branch);
  - `appendHistoricalObservation` — the ONLY way data enters the timeline; the timeline is
    **append-only and immutable** (no update/delete method exists on the port at all —
    structural immutability test-pinned; appended records are deep-frozen; duplicates
    rejected);
  - `src/adapters/in-memory-time-machine.ts` (disclosed scaffold).

- **LAB-007 — World Model Ensemble**
  - `src/contracts/ensemble.ts` — versioned, tenant-scoped, **append-only** ensembles of
    world-model version members (`EnsemblePort`, 8 methods ≤ 12 policy budget): registration
    creates version 1, member addition appends the next version, freezing appends a `frozen`
    version that blocks further additions; empty and single-member ensembles are structurally
    rejected (no model disagreement is computable);
  - `EnsembleWeightingPolicy` — EXPLICIT and versioned (`uniform` or
    `declared-member-weights`); there is NO silent default weighting, and the aggregate
    interval is forced to COVER the member expected-value spread so weighting can never hide
    model disagreement (§22);
  - `evaluateEnsemble` → `EnsemblePrediction` — a counterfactual `SimulationPrediction`
    (never a `HistoricalObservation` — lock rule 29) carrying the full §22 uncertainty set
    where computable: expected value, interval, **model disagreement** (per-metric member
    spread), **OOD/novelty signal** vs member-DECLARED coverage (out-of-coverage inputs are
    FLAGGED, never silently extrapolated; undeclared coverage is a disclosed partial state),
    and the carried **calibration placeholder** (provenance-declared, never a number —
    calibration is LAB-018 territory);
  - `runSeedRobustnessSweep` — multi-seed robustness record (per-metric per-seed aggregates,
    spread + relative spread; counterfactual-labeled diagnostic);
  - `src/adapters/in-memory-ensemble{,-store,-evaluation}.ts` + `ensemble-aggregation.ts` —
    the composed disclosed scaffold (documented aggregation math: weighted mean, spread =
    max − min, interval widened to cover the spread).

- **LAB-008/LAB-009 — mission-compatible reward vocabulary (`src/contracts/reward.ts`)**
  - `LabRewardSpec` (versioned; the version is pinned against `LabScenario.rewardVersion`
    by every consumer — mismatch fails closed) with `LabRewardTerm` mirroring the §21 metric
    vocabulary EXACTLY as `@mos/missions` `RewardMetricId` (17 metrics; missions is not a
    registry dependency of the lab, so the composition root binds a real mission reward spec
    onto this structurally compatible local shape);
  - every term MUST declare `metricSource` — the concrete predicted/observed metric id it
    draws its value from; a source that resolves nowhere fails closed
    (`reward-term-not-derivable`), one that resolves ambiguously (predicted AND observed)
    fails closed (`reward-term-ambiguous`) — vanity metrics never silently replace the
    declared objective (§21);
  - `CandidateProgramDescriptor` — the candidate program (strategy knobs + horizon steps).

- **LAB-008 — Offline / Off-Policy Evaluation**
  - `src/contracts/off-policy-evaluation.ts` + `src/adapters/in-memory-off-policy-evaluation.ts`
    — `OffPolicyEvaluationPort.evaluateCandidate` (single method): candidate program +
    ensemble + Time Machine mode-2 history + reward spec → estimated reward with a
    DOCUMENTED finite-sample uncertainty interval (per-term Hoeffding bound on the
    observed-baseline means, summed conservatively, combined additively with the ensemble
    disagreement and seed-robustness half-widths — formula `ope-hoeffding-additive-v1`,
    fully derived in the adapter docblock) + per-term contribution provenance;
  - **LAG DISCIPLINE (lock rule 30)**: the basis is pulled ONLY through
    `replayDelayedInformation` with L = `scenario.informationLag` — records with
    `observedAt > T − L` can never reach the estimate (adversarially pinned: beyond-lag rows
    leave the score bit-identical; the replay query is spied to carry exactly the scenario
    lag);
  - insufficient history (empty or sub-minimum lagged basis) → the EXPLICIT
    `insufficient-history` verdict — never a silent zero;
  - **§24 validity disclosure** on every score: an off-policy estimate is a SIMULATED
    estimate, never experimental proof; the real-experiment boundary remains the only path
    to deployment-grade evidence.

- **LAB-009 — Sequential Strategy Learning**
  - `src/contracts/strategy-learning.ts` + `src/adapters/in-memory-strategy-learner.ts` —
    `StrategyLearningPort.learnStrategy` (single method): learn from SIMULATION EXPERIENCE
    ONLY (ensemble evaluation — the learner has NO Time Machine access), deterministic
    coordinate search over the candidate knobs with a DECLARED stopping policy
    (iteration cap / member-step budget / plateau window + tolerance);
  - output: `LearnedStrategyCandidate` — counterfactual-labeled
    (`counterfactual: true`, `disclosure: 'learned-in-simulation'`, lab-only §24 statement)
    with the FULL learning trace (per-iteration reward estimates with uncertainty, evaluated
    variants, chosen variant, cost dimensions) and FULL provenance (ensemble id/version,
    member world-model versions, simulator version, reward spec version, seed, parent
    strategy, stopping record);
  - determinism: same (initial program, seed, ensemble version, reward spec, stopping
    policy) → bit-identical learning trace (test-pinned incl. fresh stacks);
  - the §2 delay-expectation variable appears only as the declared `simulatedSteps` cost
    dimension of the trace (production delay economics is LAB-015's domain).

- `src/index.ts` — types + twelve runtime factories.
- `src/adapters/parametric-support.ts` — INTERNAL helpers (seeded PRNG, clamps, validation,
  deep-freeze) shared by the adapters; deliberately NOT exported from the index.
- `src/adapters/reward-computation.ts` + `ensemble-aggregation.ts` — INTERNAL pure math
  (reward term resolution, ensemble aggregation); deliberately NOT exported from the index.
- `src/testing/w4a-lab-fixtures.ts` — INTERNAL Wave-4 test fixtures; NOT exported from the
  index.

## Design rules encoded here

- **Reference-first**: corpus documents only ever reference acquired content artifacts
  (`@mos/contracts` `ArtifactRef`); no fabricated content, no bytes in the control plane.
- **Rights are structural, not incidental**: ingestion passes the injected
  `RightsCheckPort` and fails closed. URL/storageRef accessibility never implies rights.
- **Append-only history**: corpus snapshots, feature bundle versions, idea revisions, world
  model versions, dynamics model versions, the historical timeline, the branch registry and
  world model ensemble versions are versioned/append-only records; nothing is mutated in
  place and nothing is deleted (ensemble versions are immutable snapshots — freezing is an
  append too).
- **Historical vs counterfactual separation (lock rule 29)**: `HistoricalObservation`
  (`counterfactual: false`) and `SimulationPrediction`/`SocialSimulationResult`/
  `DynamicsStepResult`/`CounterfactualBranchRecord`/`EnsemblePrediction`/
  `SeedRobustnessSweep`/`OffPolicyEvaluationScore`/`LearnedStrategyCandidate`
  (`counterfactual: true`, disclosed synthetic) are mutually non-assignable types;
  simulator outputs are never ground truth. The OPE score references its historical basis
  by observation IDS only — historical records are never embedded into estimates.
- **Leakage prevention (lock rule 30)**: the Time Machine's delayed mode filters strictly on
  `observedAt ≤ T − L`; the invariant is pinned by adversarial tests (boundary probe 1 ms
  past the cutoff, lag sweeps, shuffled append order, malformed-query fail-closed), and the
  LAB-008 evaluator pulls its basis ONLY through that delayed mode (beyond-lag rows leave
  the estimate bit-identical — pinned).
- **Determinism**: every simulator/dynamics step is a pure function of its inputs —
  same seed + same inputs → bit-identical results (test-pinned across fresh engines too);
  seed robustness (positive variance across seeds) is asserted and reported; the same
  determinism holds for ensemble evaluations, seed-robustness sweeps, off-policy scores and
  whole learning traces.
- **Explicit reward binding (§21)**: every reward term declares its concrete metric source;
  non-derivable and ambiguous sources fail closed with typed errors — vanity metrics never
  silently replace the declared objective.
- **No-op is a first-class candidate (lock rule 5)**: `no-op` produces zero simulated
  activity; in the dynamics model inaction still decays audience and loses ground to
  competitors (inaction has modeled consequences).
- **Tenant scoping**: every record carries `tenantId`; every operation names its
  `TenantScope`; unknown and cross-tenant are indistinguishable on reads; version chains are
  per (tenant, id) — tenants never share or shift each other's version numbering.
- **Capabilities, not engines**: feature computation requirements are DECLARED; the lab
  never invokes engines or providers directly.

## Lab rules honored (architecture policy `specialRules.lab`)

- no direct publication — nothing here publishes anywhere;
- no direct provider calls — no provider SDK imports (boundary-check enforced);
- counterfactuals labeled — enforced by type separation + runtime label re-validation;
- delayed-mode leakage prevention — enforced by the T−L cutoff + adversarial tests.

## Disclosed limitations

- In-memory adapters are ephemeral scaffolds (no durable persistence; central schema is
  TL-owned) — a durable adapter replaces them without touching the ports.
- The LAB-004 simulator and LAB-005 dynamics adapters are **deterministic synthetic response
  functions** — real generative computation, but NOT real platform models; every result
  carries the `synthetic-response-function` disclosure and a §22 uncertainty envelope.
  The LAB-007 ensemble aggregates those disclosed functions (its disclosure says so
  explicitly); calibration against real outcomes is LAB-018 (LAB-016 production program
  search consumes this seam) — the ensemble carries a provenance-declared calibration
  PLACEHOLDER, never a number.
- The LAB-007 OOD signal is a **DECLARED-COVERAGE seam**: members self-declare their input
  coverage boxes; the signal measures distance against those declarations (a declaration,
  not a verified property) and flags out-of-coverage inputs rather than silently
  extrapolating.
- The LAB-008 finite-sample uncertainty is a **DOCUMENTED simple bound**
  (`ope-hoeffding-additive-v1`): per-term Hoeffding bounds on the observed-baseline means
  using observed-basis extremes as the per-term range (a conservative empirical envelope),
  summed by union bound and combined additively with the ensemble-disagreement and
  seed-robustness half-widths. No invented sophistication — the full derivation is in the
  adapter docblock. The horizon is evaluated as K STATIONARY steps (cross-step world
  evolution is not modeled this wave — same for LAB-009).
- The LAB-009 learner is a deterministic coordinate search over the candidate's numeric
  knobs (fixed moves, fixed tie-break) — a disclosed scaffold standing in for real
  sequential simulator learning; strategy KIND transitions are LAB-016 program-search
  territory.
- Off-policy estimates are SIMULATED estimates, never experimental proof (§24); learned
  candidates are lab-only candidates, never deployment decisions.
- Time Machine availability semantics: an observation is "available by X" iff
  `observedAt ≤ X`; a durable adapter may tighten this with an ingestion ledger
  (append-time availability) without changing the port shape.
- `RightsCheckPort` is exercised by a DISCLOSED STRUCTURAL TEST DOUBLE in tests; the real
  `@mos/rights` adapter is composition-root wiring (TL-owned).
- `FeatureComputationPort` is a declaration carrier only — no engine binding, no computation.
- `@mos/capabilities` is imported for the §5 seed catalog ids used as test fixtures
  (registry-declared dependency); the seed catalog makes no engine claims.
- No idea/edge hard-delete by design (versioned corrections only).
- Scenario `simulatorVersion` pinning: both synthetic engines implement version 1 and reject
  scenarios declared against a different simulator version (`simulator-version-mismatch`).
