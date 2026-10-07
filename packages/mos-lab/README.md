# @mos/lab

MOS v2.0 **Marketing Lab** package — `LAB-001` (reference-first niche corpus runtime) +
`LAB-002` (multimodal feature bundles) + `LAB-003` (Idea Graph), delivered in Wave 2 (W2-A),
plus `LAB-004` (Social Simulator), `LAB-005` (User/Creator/Competition Dynamics) and
`LAB-006` (Time Machine), delivered in Wave 3 (W3-A), plus `LAB-007` (World Model Ensemble),
`LAB-008` (Offline / Off-Policy Evaluation) and `LAB-009` (Sequential Strategy Learning),
delivered in Wave 4 (W4-A), plus `LAB-010` (Agent Organization Search), delivered in Wave 5
(W5-B), and `LAB-011` (Transform Definitions + Transform Graph), delivered in Wave 5 (W5-A),
plus `LAB-012` (Transform Discovery — the §8 seven promotion gates) and `LAB-014` (Human
Production Task Packages), delivered in Wave 6 (W6-A), plus `LAB-015` (Production Delay
Economics — §18), delivered in Wave 7 (W7-A).

Module registry entry: `lab → packages/mos-lab`, owner `worker-a`, dependencies
`[contracts, content, production, agents, capabilities, engines, jobs]`.

## Status: corpus / features / idea-graph / simulator / dynamics / Time Machine / ensemble / off-policy evaluation / strategy learning / organization search / transform definitions + transform graph / transform discovery (seven §8 gates) / human production task packages / production delay economics (§18) (in-memory scaffolds)

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

- **LAB-011 — Transform Definitions + Transform Graph (§5, DECLARATIVE ONLY)**
  - `src/contracts/transform-definition.ts` — `TransformKind` (the frozen thirteen §5 kinds:
    no-op-repost, clip, crop-reframe, remix, compilation, reaction, podcast,
    translation-dubbing, voiceover, stylization-anime, ai-generated, human-contribution,
    hybrid) and the VERSIONED `TransformDefinition`: the canonical CORE-001 `Transform`
    contract (id, version, inputTypes, outputTypes, parameters, capabilityRequirements,
    evaluator, costModel, latencyModel, rightsRequirements, policyRequirements, lineageRules —
    `inputTypes`/`outputTypes` DERIVED from the declared constraints so the canonical contract
    is satisfied by construction, pinned by the contracts package's frozen required-field
    assertion in tests) extended with the declared kind, ONE NAMED
    `TransformInputConstraint` (accepted artifact types matched exactly against
    `ArtifactRef.type` — the `@mos/content` artifact vocabulary via `@mos/contracts` —
    accepted modalities, input cardinality bounds, and a `requiresRights` flag), the
    `TransformOutputContract` (output types + count), and the human-participation flag
    (`human-contribution` / `hybrid` kinds MUST declare it — typed failure otherwise);
  - **NO-OP/REPOST IS FIRST-CLASS (lock rule 5)**: a real definition with real constraints
    and ZERO capability requirements — zero requirements is a valid declared state for ANY
    kind, and the registry has NO kind-conditional special-casing (the no-op seed definition
    simply declares none; pinned by tests);
  - `TransformDefinitionRegistry` port (4 methods): register (v1) / revise (append-only v+1,
    prior versions bit-for-bit resolvable) / exact-version get (never a silent latest
    fallback) / list-latest; `unknown-transform-kind` is the typed failure for anything
    outside the frozen thirteen;
  - `src/contracts/transform-graph.ts` — the VERSIONED, TENANT-SCOPED, APPEND-ONLY
    `TransformGraph` DAG of transform applications over artifact refs: nodes =
    `TransformApplicationNode` (definition ref pinned to an EXACT version + external input
    artifact refs + declared parameterization), edges = `ArtifactFlowEdge` (artifact flow:
    the output of one node feeds the next); composite transforms (remix / compilation /
    hybrid) express naturally as multi-node graphs;
  - `TransformGraphPort` (6 methods): create / append (nodes+edges atomically, version + 1) /
    exact-version get / `validateTransformGraph` (structural + constraint) /
    `traceArtifactLineage` (direct consumers + downstream cone in topological order with the
    resolved definitions — which transforms produce which outputs) / `querySubgraph`
    (the production cone around an artifact: downstream + transitive upstream ancestors);
  - **Write-time invariants** (every stored version is a well-formed DAG over resolvable
    definitions): unique node/edge ids, one artifact-flow edge per node pair, edge endpoints
    exist, cycles rejected (`artifact-flow-cycle` — a production graph is a DAG), external
    artifact refs belong to the tenant scope (`cross-tenant-reference`), and every node's
    definition resolves at its EXACT cited version (`unknown-transform-definition` /
    `transform-definition-version-mismatch`);
  - **Constraint validation** (`validateTransformGraph`, on demand — graphs are built
    incrementally): input cardinality (external + upstream), external input artifact types /
    modalities / rights, and upstream output types, all against each node's definition at its
    CITED version, every failure NAMED with the constraint name;
  - `src/adapters/in-memory-transform-definition-registry.ts` +
    `in-memory-transform-graph.ts` (composed with the INTERNAL
    `transform-graph-write-checks.ts` + `transform-graph-validation.ts`) — disclosed
    scaffolds, clone-then-freeze ownership semantics;
  - **DECLARATIVE ONLY — the boundary**: a transform is a CONTRACT, not an engine (§5).
    Nothing in this item resolves engines, selects models, binds agents, executes a
    transform or materializes an output artifact. The capability requirements are declared
    refs in the `@mos/contracts` vocabulary; the Engines Registry satisfies them at
    EXECUTION time, which is Lab runs / production programs / the ENG runner (LAB-012
    transform discovery and LAB-016 production program search own the execution seams).

- `src/index.ts` — types + fourteen runtime factories (as merged from W5-A).
- **LAB-010 — Agent Organization Search (§23)**
  - `src/contracts/organization-features.ts` — the **TWELVE §23 search dimensions** as a
    frozen vocabulary (`agent-count`, `roles`, `topology`, `delegation`, `communication`,
    `memory-sharing`, `critics`, `tool-allocation`, `model-assignment`, `budget`,
    `execution-ordering`, `stopping-conditions` — compile-time pinned to exactly twelve),
    the `SearchedOrganizationCandidate` descriptor (an `@mos/agents`
    `AgentOrganizationRecord` passed **BY VALUE** — the agents module stays the
    organization authority) plus the `DeclaredOrganizationFeatures` the frozen record
    cannot express structurally (`criticNodeIds`, `toolAllocation`, `executionOrdering` —
    ALL THREE REQUIRED, no silent defaults), and the per-dimension
    `OrganizationFeatureFingerprint` (two candidates with equal fingerprints are the same
    point in the twelve-dimension search space); edge kinds map one-to-one onto dimensions
    (`delegates-to` → delegation, `communicates-with` → communication, `reports-to` →
    topology), so every edge belongs to exactly one dimension;
  - `src/contracts/organization-search.ts` — `OrganizationSearchPort` (SINGLE method
    `searchOrganizations`): scope + `LabScenario` + ensemble id/version (the world-model
    refs) + versioned reward spec + candidates + REQUIRED seed + declared policy →
    `OrganizationSearchResult`; **THE COMPARISON MANDATE (lock rule 33) is structural**:
    the input REQUIRES `baseline` (validated single-agent fail-closed —
    `baseline-not-single-agent`) and `handDesigned` slots, and the result carries a
    mandatory three-way `comparison` block (baseline + hand-designed + generated ≥ 1) —
    a result with only generated candidates is unrepresentable, and a search that cannot
    afford a generated evaluation fails closed (`budget-below-mandated-floor` /
    `comparison-mandate-violated`); every candidate evaluation carries the §22 set
    (expected reward, interval, ensemble disagreement, seed robustness, OOD aggregate,
    calibration placeholder) and is COUNTERFACTUAL-labeled (lock rule 29); the result
    carries the §24 lab-only statement — **NO deployment decision**;
  - `src/adapters/in-memory-organization-search.ts` + the INTERNAL
    `organization-{features,mutations,search-validation,search-estimation,simulation-mapping}`
    modules — a **DISCLOSED deterministic hill-climb** over the twelve dimensions:
    fixed-order mutation operators per dimension (every mutant re-validated fail-closed
    and deduplicated by twelve-dimension fingerprint), a DECLARED budget in member steps
    (with a fail-closed floor covering the comparison mandate), a DECLARED pruning rule
    (`none` | `interval-dominance` — pruned entries stay RANKED, never hidden, never
    generation parents), DECLARED stopping (budget → plateau → generation cap) and
    deterministic uncertainty-aware ranking (expected reward desc → interval width asc →
    candidate key asc → origin precedence → arrival order) with the interval overlap vs
    the rank-1 candidate DECLARED on every other entry; evaluation maps each candidate's
    twelve dimension features onto the LAB-004 simulator action knobs through a
    **DOCUMENTED synthetic mapping** (full equations in
    `organization-simulation-mapping.ts` — the same disclosure class as the LAB-004/007/009
    parametric adapters) and rolls it out through the LAB-007 `EnsemblePort` (whose members
    execute through the seed-required deterministic `SimulatorEnginePort`) over the
    declared evaluation seeds, with the horizon capped by the candidate's own stopping
    policy; provenance records which simulator/ensemble/member world-model/reward-spec
    versions evaluated each candidate, the full twelve-dimension fingerprint, the
    dimensions varied vs the parent, the generation index and the pruning verdict;
  - caller-supplied candidates are CLONED into lab-owned copies (caller data is never
    mutated or frozen in place — pinned by test); tenant scoping is fail-closed
    (candidate tenant mismatch, ensemble invisibility and cross-tenant reads all fail
    closed with named codes).

- **LAB-012 — Transform Discovery (§8; the KNOWN / COMPOSED / DISCOVERED surface + THE SEVEN PROMOTION GATES)**
  - `src/contracts/transform-candidate.ts` — the VERSIONED, TENANT-SCOPED, APPEND-ONLY
    `TransformCandidate` with the three §8 origins: **KNOWN** (cites a registered
    `TransformDefinition` at an EXACT version — resolution over the W5-A registry),
    **COMPOSED** (cites a multi-node `TransformGraph` version as a compositional TEMPLATE —
    the member definitions are resolved at their exact cited versions and frozen onto the
    candidate at proposal time, so the template is reproducible bit-for-bit even if the graph
    later gains new versions) and **DISCOVERED** (a NEW candidate carrying its own
    `ProposedTransformContract` — exactly the registry-shaped declaration minus scope/id —
    plus its `TransformCandidateDerivation` provenance: idea nodes / feature bundles /
    corpus snapshot / learned strategy candidates / organization search results, LAB-003
    Idea Graph references the natural surface; an empty derivation is rejected and idea
    references resolve against the wired Idea Graph view — candidates never float free of
    evidence);
  - `src/contracts/transform-promotion-gates.ts` — **THE SEVEN §8 GATES as explicit,
    fail-closed, test-pinned evidence records** (evaluated in §8 order, the first failing
    gate is the named failure): 1 contract validation (the SHARED structural rules — the
    same validator the W5-A registry applies, `adapters/transform-contract-validation.ts`:
    one validator, no drift between the surfaces), 2 capability feasibility (declarative:
    every `CapabilityRequirement` resolves in the REAL `@mos/capabilities` vocabulary;
    ZERO requirements is the valid declared no-op state), 3 rights/policy feasibility
    (STRUCTURAL declarations that must cover EXACTLY the contract's declared requirements;
    real rights/policy evaluation is composition-root wiring — the lab does not import the
    rights/policy modules), 4 evaluator (the bound ref must be the contract's own evaluator
    plus its declared input/output schema shape — evaluator EXECUTION is not this item),
    5 bounded benchmark evidence (a COMPLETE frozen `EngineBenchmark` record ONLY — the
    contracts package's required-field index names every missing field; incomplete records
    never attach and a complete-but-failed benchmark fails promotion by name), 6 immutable
    version (the freeze declaration cites the candidate's CURRENT version and the only legal
    promotion path: the registry's append-only register/revise), 7 provenance (the full
    derivation chain + citation re-resolution, snapshotted);
  - `src/contracts/transform-discovery.ts` — `TransformDiscoveryPort` (8 methods): propose /
    revise (append-only candidate versions, full re-validation, prior versions bit-for-bit
    resolvable) / exact-version get / list-latest / record-gate-evidence (append-only log;
    re-recording appends, latest-wins) / list-gate-evidence / **promote** (all seven gates
    fail-closed in §8 order) / list-promotion-attempts (the append-only audit trail);
  - **Promotion outcome**: a PROMOTED candidate is materialized as a NEW
    `TransformDefinition` version through the W5-A registry's append-only register path (a
    new target id) or revise path (an existing one — version + 1, prior versions
    bit-for-bit) — discovery NEVER mutates a definition in place; a candidate rejected at
    any gate STAYS RECORDED with the named gate failure in the attempt trail; gate evidence
    recorded against earlier candidate versions goes STALE after a revision (fail-closed
    staleness discipline); re-recording a gate APPENDS (never rewrites — latest wins, both
    directions test-pinned); the audit trail records gate evaluations and registry-write
    attempts only — `already-promoted` / unknown-candidate calls are caller errors and
    append no attempt (pinned);
  - **NO AUTO-PRODUCTION (§24)**: the port has no deploy/publish surface at all — promotion
    only makes a transform AVAILABLE to program search (LAB-016 consumes this seam);
    the no-op/repost candidate flows through discovery IDENTICALLY (first-class, zero
    capability requirements pass gate 2 as the valid declared no-op state — pinned);
  - `src/adapters/in-memory-transform-discovery.ts` (composed with the INTERNAL
    `transform-contract-validation.ts` + `transform-discovery-gates.ts` +
    `transform-discovery-writes.ts`) — disclosed scaffold; determinism via injectable
    clocks (identical stacks → bit-identical candidates and promotions, test-pinned).

- **LAB-014 — Human Production Task Packages (§17; fulfillment: project owner / authorized collaborator / Arena provider)**
  - `src/contracts/human-task-fields.ts` — the **TWELVE §17 fields, each an explicit typed
    record**: objective (statement + success criteria), source/reference (non-empty
    `ArtifactRef`s — reference-first), script/questions (script beats OR interview
    questions), capture instructions (brief + requirements), target modality
    (`ReferenceModality`), required artifacts (artifact types + minimum counts), consent
    (a `ConsentRef` record + what it covers), rights (non-empty `RightsRef`s), evaluator
    (bound ref + declared input/output schema shape — execution is not this item), deadline
    (ISO-8601), delay economics (the §2 delay-expectation FIRST-CLASS variable as DECLARED
    expectations — expected wait, expected incremental value, delay cost, acquisition cost,
    success probability, signed quality impact, all §18 dimensions, pinned
    `declared-expectations` disclosure) and acceptable substitutes (an ORDERED preference
    list of alternative fulfillment paths — strictly ascending); the §17 compound
    "consent/rights" field resolves into the TWO records consent + rights, both from the
    `@mos/contracts` vocabulary;
  - `src/contracts/human-task-lifecycle.ts` — the lifecycle **created → offered →
    accepted/in-progress → delivered → evaluated → completed | abandoned** (abandonment is
    a FIRST-CLASS §2/§18 outcome: `deadline-expiry` / `substitute-switch` /
    `caller-decision` causes, always with a reason, never silent) + the §19 verdict
    vocabulary (accepted / rejected-quality / rejected-strategy / treatment-requested) +
    the APPEND-ONLY `HumanTaskLifecycleEvent` audit log (every transition and every Arena
    interaction recorded — switches and provider outcomes are never silent);
  - `src/contracts/human-production-task.ts` — the VERSIONED, TENANT-SCOPED
    `LabHumanProductionTask` (every lifecycle transition appends version + 1; human output
    as INTERMEDIATE artifact refs, lock rule 15) + the `HumanProductionTaskPort` (10
    methods) + `canonicalHumanProductionTaskView` (the derived CORE-001
    `HumanProductionTask` projection — required-field-asserted in tests);
  - `src/contracts/arena-provider-seam.ts` — **Arena is a PROVIDER through Integration**
    (lock rule 27): the lab holds ONLY `ArenaProviderRef`s (INTEG-001 `ConnectorProvider`
    vocabulary via `@mos/contracts` — the lab NEVER imports `@mos/integrations`) and reaches
    the provider through the one-method `ArenaProviderPort` seam; the real adapter is
    composition-root wiring;
  - `src/adapters/in-memory-human-production-task.ts` (composed with the INTERNAL
    `human-task-field-validation.ts` + `human-task-store.ts`) +
    `in-memory-arena-provider.ts` — disclosed scaffolds; the Arena double is ZERO-I/O and
    SELF-LABELS every interaction reference (`arena-double:` prefix — double output can
    never masquerade as live provider evidence);
  - **Substitute semantics**: when a task is abandoned or its deadline breached, the ordered
    substitute list yields the next UNTRIED fulfillment path — the switch records original
    + substitute + reason (on the abandonment record AND the event log); deadline expiry
    uses the injectable clock and fails closed before expiry (`not-overdue`).

- **LAB-015 — Production Delay Economics (§18: the Expected Value of Delay is a first-class
  production strategy variable; WAITING IS A DECISION VARIABLE)**
  - `src/contracts/delay-economics.ts` — the §18 tracked dimensions as EXPLICIT TYPED
    RECORDS on the `DelayDecisionModel`: expected incremental value (reward-spec-
    denominated estimate + uncertainty interval + the §21 reward spec version it is
    denominated in + derivation), estimated wait, delay cost (per-unit-time price + time
    unit + DECLARED source), acquisition cost (`human-acquisition-cost` /
    `engine-acquisition-cost` — the §21 vocabulary), probability of success, quality impact
    (declared, signed, CARRIED never monetized) and alternative paths (ORDERED references
    to the other option kinds — self-references, duplicates, non-ascending orders and
    unknown kinds fail closed). **NEVER INVENTED PRECISION**: every estimate cites its
    derivation (`ensemble-output` with ensemble id + EXACT version /
    `historical-observation` / `declared-assumption`) — an estimate without provenance is a
    typed `estimate-without-provenance` failure NAMING the dimension. The TEN option kinds
    (the §18 nine plus the NO-OP baseline dimension already in the program space — §7 /
    lock rule 5) and the BY-REFERENCE `DelayOptionTarget` vocabulary (engine id + version,
    `CapabilityRequirement`, `ProviderId` + version, `AgentOrganizationId` + version,
    `TransformId` + EXACT version, `HumanProductionTaskId`, a declared scope reduction, or
    `none` for the targetless options) — nothing executes, nothing resolves, nothing
    instantiates;
  - `src/contracts/delay-policy.ts` — the EV-of-delay computation as **DECLARED VERSIONED
    POLICY, never hidden math**: `DELAY_DECISION_POLICY_V1` (`ev-delay-1`) documents the
    exact formula — `EV(option) = p × V − D − A` with `D` the total delay cost over the
    estimated wait, uncertainty carried as `EV.lower/upper = p × V.interval.lower/upper −
    D − A` (the §22 / LAB-007/008 interval discipline), ONE currency across all money
    terms (a mismatch fails closed — no invented exchange rates), quality impact carried
    not monetized, amounts quantized to 1e-10 — and declares the ranking policy
    (uncertainty-aware deterministic: EV descending → interval half-width ascending →
    option kind ascending, the W5-B discipline);
  - `src/contracts/delay-decision.ts` + `delay-decision-port.ts` + `delay-abandonment.ts` —
    `DelayDecisionPort` (SEVEN methods ≤ 12): `evaluateDelayDecision(state refs, decision
    context)` → ONE immutable tenant-scoped `DelayDecisionAnalysis` with ALL TEN analysis
    lines in §18 order (each: option kind, tracked dimensions, the EV computation with its
    exact recorded terms — or the NAMED inapplicability reason), the RANKED comparison
    (rank 1..n with interval-overlap-with-leader declarations — when an option's EV
    interval overlaps the leader's that is DECLARED, never hidden) and the rank-1
    RECOMMENDATION line carrying the §24 boundary statement (a recorded recommendation —
    executing goes through the owning authorities); `canonicalBottleneckDecisionView` —
    the derived CORE-001 `BottleneckDecision` projection (required-field-asserted in
    tests; `substitute-capability-provider` maps to `substitute-capability` /
    `substitute-provider` by its target kind; a NO-OP recommendation projects to `null` —
    the frozen canonical action vocabulary cannot express the program-space baseline,
    documented); and the AUDITABLE abandoned-path records —
    `recordDelayAbandonment(what + why + the analysis that justified it, snapshotted
    bit-for-bit)` + `recordDelayAbandonmentOutcome` (learning-relevant outcomes APPENDED
    when later known, version + 1, prior versions bit-for-bit; outcomes carry the SAME
    provenance discipline) — abandoned branches are learning data, the record SHAPE feeds
    LAB-017/018, NO learning is implemented here (pinned by the `learningFeed` literal);
  - `src/adapters/in-memory-delay-economics.ts` (composed with the INTERNAL
    `delay-decision-validation.ts` + `delay-target-validation.ts` +
    `delay-ev-computation.ts`) — the disclosed deterministic double implementing EXACTLY
    the declared policy's documented formula (no other EV-of-delay math exists in the
    package); the evaluation input PINS the declared policy version (a mismatch fails
    closed — never a silent default) and records the seed; an OPTIONAL narrow LAB-007
    ensemble view resolves `ensemble-output` derivations fail-closed at EXACT versions
    (`ensemble-derivation-unresolved`), and when unwired ensemble derivations stay
    STRUCTURAL declarations (the W6-A disclosed-seam discipline, pinned by test);
  - `src/testing/w7a-delay-fixtures.ts` + `w7a-delay-declarations.ts` — INTERNAL test
    fixtures; the numbers are chosen so the formula-pin tests assert EXACT equality
    (EV(wait) = 550 USD over [390, 710]; a known full ten-option ranking with an EV tie
    broken by interval half-width then option kind).

- `src/index.ts` — types + NINETEEN runtime factories (Wave-7 state: the Wave-6 union's
  eighteen plus the in-memory delay economics double).
- `src/adapters/parametric-support.ts` — INTERNAL helpers (seeded PRNG, clamps, validation,
  deep-freeze + deep-clone ownership helpers) shared by the adapters; deliberately NOT exported
  from the index.
- `src/adapters/reward-computation.ts` + `ensemble-aggregation.ts` — INTERNAL pure math
  (reward term resolution, ensemble aggregation); deliberately NOT exported from the index.
- `src/adapters/transform-graph-validation.ts` + `transform-graph-write-checks.ts` — INTERNAL
  pure logic for the transform graph (constraint validation + modality derivation; write-time
  structural invariants); deliberately NOT exported from the index.
- `src/adapters/transform-contract-validation.ts` — INTERNAL SHARED structural validator for
  transform contract declarations (used identically by the W5-A registry and LAB-012
  discovery — one validator, no drift); deliberately NOT exported from the index.
- `src/adapters/transform-discovery-gates.ts` + `transform-discovery-writes.ts` — INTERNAL
  gate evidence construction / promotion re-checks and candidate write rules for LAB-012;
  deliberately NOT exported from the index.
- `src/adapters/human-task-field-validation.ts` + `human-task-store.ts` — INTERNAL
  twelve-field validation and append-only store primitives for LAB-014; deliberately NOT
  exported from the index.
- `src/testing/w4a-lab-fixtures.ts` + `src/testing/w5a-transform-fixtures.ts` + `src/testing/w5b-lab-fixtures.ts` + `src/testing/w6a-lab-fixtures.ts` + `src/testing/w7a-delay-fixtures.ts` + `src/testing/w7a-delay-declarations.ts` — INTERNAL Wave-4/
  Wave-5/Wave-6/Wave-7 test fixtures; NOT exported from the index.

## Design rules encoded here

- **Reference-first**: corpus documents only ever reference acquired content artifacts
  (`@mos/contracts` `ArtifactRef`); no fabricated content, no bytes in the control plane.
- **Rights are structural, not incidental**: ingestion passes the injected
  `RightsCheckPort` and fails closed. URL/storageRef accessibility never implies rights.
- **Append-only history**: corpus snapshots, feature bundle versions, idea revisions, world
  model versions, dynamics model versions, the historical timeline, the branch registry,
  world model ensemble versions, transform definition versions and transform graph versions
  are versioned/append-only records; nothing is mutated in place and nothing is deleted
  (ensemble versions are immutable snapshots — freezing is an append too).
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
- **The comparison mandate (lock rule 33 / §23)**: every organization search result carries
  the generalist single-agent baseline, the caller's hand-designed organization AND
  search-generated organizations — structurally required on the result type, validated
  fail-closed on the input (missing slots → typed failure; multi-node baseline → typed
  failure), and netted out by the fail-closed budget floor + comparison guard; a
  generated-only result is unrepresentable.
- **Twelve explicit search dimensions (§23)**: every organization candidate carries ALL
  TWELVE dimension signatures in its provenance fingerprint (the three the frozen
  `AgentOrganization` record cannot express are REQUIRED declared features — no silent
  defaults); generated candidates record exactly the dimensions their generation step
  varied (verified against the parent fingerprint), and deduplication happens on the
  twelve-dimension fingerprint, never on organization identity.
- **No-op is a first-class candidate (lock rule 5)**: `no-op` produces zero simulated
  activity; in the dynamics model inaction still decays audience and loses ground to
  competitors (inaction has modeled consequences). In the transform layer the no-op/repost
  KIND is a first-class `TransformDefinition` with real constraints and ZERO capability
  requirements, validated by exactly the same machinery as every other kind — never
  special-cased (lock rule 5/6: transforms are atomic, composed or discovered).
- **Tenant scoping**: every record carries `tenantId`; every operation names its
  `TenantScope`; unknown and cross-tenant are indistinguishable on reads; version chains are
  per (tenant, id) — tenants never share or shift each other's version numbering.
- **Capabilities, not engines**: feature computation requirements are DECLARED; transform
  capability requirements are DECLARED refs in the `@mos/contracts` vocabulary; the lab
  never invokes engines or providers directly.
- **A transform is a contract, not an engine (§5, lock rule 14 adjacency)**: transform
  definitions declare input constraints / output contracts / capability requirements /
  human participation; transform graphs are DECLARATIVE DAGs over artifact refs whose
  nodes cite definitions at EXACT versions — lineage is preserved across every declared
  transformation and nothing executes inside this layer.
- **Discovered ≠ production-ready (§8, lock rule 7)**: a discovered transform is only a
  CANDIDATE until ALL SEVEN promotion gates carry explicit evidence — contract validation,
  capability feasibility, rights/policy feasibility, evaluator, bounded benchmark evidence,
  immutable version, provenance — each fail-closed and named; promotion appends a new
  definition version through the registry (never in place); rejected candidates stay
  recorded with the named gate failure; NO AUTO-PRODUCTION (§24) — the discovery surface
  has no deploy/publish method at all (test-pinned).
- **Human production is explicit and economically bounded (§17, lock rule 24)**: every
  human production task carries the TWELVE §17 fields as explicit typed records (a
  missing or malformed field fails closed NAMING the field); delay economics are DECLARED
  expectations (§2 first-class variable, never guarantees); waiting can be abandoned
  (first-class §2/§18 outcome, always recorded with cause + reason); substitute switches
  are ordered and recorded (original + substitute + reason — never silent); human output
  returns as INTERMEDIATE artifact refs only (lock rule 15).
- **The Expected Value of Delay is first-class and DECLARED (§18, lock rules 25/26)**: the
  TEN options (nine §18 actions + the no-op baseline) are each evaluated with ALL SEVEN
  tracked dimensions as explicit typed records; every estimate cites its derivation —
  NEVER invented precision (a bare number without provenance is rejected naming its
  dimension); the EV-of-delay computation is DECLARED VERSIONED POLICY (documented formula,
  recorded terms, carried uncertainty — not hidden math), the ranking is deterministic
  and uncertainty-aware, and ABANDONED BRANCHES stay auditable (what + why + the analysis
  that justified it + learning-relevant outcomes appended when later known — the record
  shape is the LAB-017/018 learning feed; no learning is implemented here).

## Lab rules honored (architecture policy `specialRules.lab`)

- no direct publication — nothing here publishes anywhere;
- no direct provider calls — no provider SDK imports (boundary-check enforced), and the
  Arena provider is reached only through the `ArenaProviderPort` seam (INTEG-001
  vocabulary refs — never `@mos/integrations`);
- counterfactuals labeled — enforced by type separation + runtime label re-validation;
- delayed-mode leakage prevention — enforced by the T−L cutoff + adversarial tests;
- no auto-production from discovery (§24) — promotion makes a transform AVAILABLE to
  program search; the discovery surface has no deploy/publish method (test-pinned);
- human work is explicit and economically bounded (§17/§18) — twelve-field task packages
  with declared delay economics; waiting can be abandoned (first-class, recorded);
- the expected value of delay is part of production strategy search (§18, lock rule 25) —
  the ten options evaluated under a DECLARED VERSIONED policy with provenance-carrying
  estimates, deterministically ranked, abandonment auditable and immutable.

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
- The LAB-010 organization search is a **disclosed deterministic hill-climb** (fixed move
  set per dimension, fixed tie-break, declared budget/pruning/stopping) standing in for
  real organization search; its evaluation mapping from organization structure to the
  simulator action knobs is a **DOCUMENTED SYNTHETIC MAPPING** (full equations in
  `organization-simulation-mapping.ts`) — it is NOT a claim about real organizational
  performance, and it rides on the disclosed LAB-007 ensemble-of-synthetic-functions
  stack. Organization candidates are `@mos/agents` descriptors passed BY VALUE — the lab
  never becomes the organization authority (no lab-side org registry, no body resolution:
  body refs stay opaque to the lab and the structural validation deliberately omits them).
  The horizon is evaluated as K STATIONARY steps capped by each organization's own stopping
  policy (cross-step world evolution is not modeled — same as LAB-008/009).
- Off-policy estimates are SIMULATED estimates, never experimental proof (§24); learned
  candidates and organization-search results are lab-only candidates, never deployment
  decisions — the §24 real-experiment boundary (Lab candidate → Mission → …) is the only
  path to deployment-grade evidence.
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
- LAB-011 is DECLARATIVE ONLY: no engine resolution, no model selection, no agent binding, no
  transform execution, no artifact materialization — execution is Lab runs / production
  programs / the ENG runner (LAB-012 transform discovery and LAB-016 production program
  search own those seams). Node parameterization is validated as a JSON OBJECT only;
  satisfaction of the definition's parameter JSON SCHEMA is an execution-time concern (no
  schema engine is bundled — deliberate).
- Transform input MODALITY is derived from the artifact's DECLARED type by a documented
  coarse mapping (`video/*`→video, `audio/*`→audio, `image/*`→image, `text/*`→text,
  `multipart/*`/`mixed`→mixed, anything else→structured) — classification of a declared
  type string, never inference from content or accessibility.
- One artifact-flow edge per node pair: a single edge carries the upstream output; binding a
  multi-output transform's additional outputs to specific downstream input positions is an
  execution-time concern (declared, not encoded in the graph structure).
- Transform graph stores take a narrow `definitions` registry view (get-by-exact-version
  only); the production module's `TransformGraphRef` binding (contracts opaque ref) is
  composition-root wiring for a later wave — the lab-local `TransformGraphId` brand is the
  record identity here.
- LAB-012 discovery is a CANDIDATE-management surface, not a benchmark producer: gate 5
  accepts COMPLETE frozen `EngineBenchmark` records (the ENG-004 shape) as STRUCTURAL
  evidence only — the lab does not execute benchmarks here (the ENG-004 golden-corpus
  stack and the ENG-001 activation gate own real benchmark runs); gate 2 resolves
  capability refs against the `@mos/capabilities` vocabulary (a DECLARATION, never an
  engine or quality claim); gate 3's rights/policy feasibility is STRUCTURAL declarations
  only — real rights/policy evaluation composes the `@mos/rights` / policy modules at the
  composition root (not lab registry deps); gate 4 records the evaluator REFERENCE plus
  its contract shape — evaluator EXECUTION is not this item. Promotion makes a transform
  AVAILABLE to program search (LAB-016) — it never deploys, never publishes (§24).
- LAB-012 derivation references: when NO Idea Graph view is wired, idea-node references in
  a candidate's derivation are validated STRUCTURALLY only (the composition root wires
  the real graph; disclosed on the port options and pinned by test). Organization-search
  and learned-strategy derivation references are structural declarations this wave (their
  registries are not lab-owned stores).
- LAB-014 delay economics are DECLARED EXPECTATIONS — the §2/§18 first-class variable as
  caller-supplied declarations; the lab does not compute expected value of waiting, delay
  cost trade-offs or bottleneck decisions (LAB-015 production delay economics owns that
  surface). The canonical CORE-001 projection drops owner/collaborator substitute entries
  (the frozen `AcceptableSubstitution` vocabulary expresses §18 escape equivalents only —
  arena-provider substitutes project as `provider`; documented, disclosed).
- The Arena provider seam is exercised by a DISCLOSED IN-MEMORY DOUBLE (zero-I/O,
  deterministic, self-labeled `arena-double:` interaction references) — the real adapter
  over `@mos/integrations` (INTEG-001: provider resolution, rights/policy gates preceding
  provider calls) is composition-root wiring; the lab never imports the integrations
  module. Unresolved Arena offer attempts produce an `arena-offer-rejected` event but no
  provider interaction record (disclosed).
- LAB-014 task deadlines are compared as ISO-8601 strings by the injectable clock
  (same-format UTC timestamps compare correctly); a durable adapter may normalize
  instant parsing without changing the port shape.
- LAB-015 is a RECORDED-RECOMMENDATION surface, not an execution surface (§24): the
  analysis recommends rank 1 under the declared policy — executing the selected option
  (actually waiting, retrying, substituting, switching, reducing, proceeding or
  abandoning) goes through the owning authorities (LAB-016 program search, the §17
  human-task lifecycle, the engine/capability/organization/transform registries); the
  state references and substitution targets are DECLARED BY REFERENCE — existence
  resolution against the live registries is composition-root wiring (the same W6-A
  structural-declaration discipline); the only resolved citation is the OPTIONAL LAB-007
  ensemble view (`ensemble-output` derivations resolve fail-closed at exact versions when
  wired, stay structural when not — pinned by test). The in-memory adapter is a DISCLOSED
  DETERMINISTIC DOUBLE implementing exactly the declared `ev-delay-1` formula; durability
  is TL-owned. The canonical CORE-001 `BottleneckDecision` projection bridges
  `DelayDecisionAnalysisId` to the canonical `BottleneckDecisionId` brand at compile time
  (the W2-C documented brand-bridge pattern — same string identity, distinct nominal
  brands) and returns `null` for a no-op recommendation (the frozen canonical action
  vocabulary has no no-op action — documented, the W6-A canonical-drop precedent). The
  v1 formula is closed-form, so the recorded seed is unused (recorded for determinism
  contract stability across future policy versions).
