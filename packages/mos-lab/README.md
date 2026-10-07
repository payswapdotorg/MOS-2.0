# @mos/lab

MOS v2.0 **Marketing Lab** package — `LAB-001` (reference-first niche corpus runtime) +
`LAB-002` (multimodal feature bundles) + `LAB-003` (Idea Graph), delivered in Wave 2 (W2-A),
on top of the W1-A types-only scaffold.

Module registry entry: `lab → packages/mos-lab`, owner `worker-a`, dependencies
`[contracts, content, production, agents, capabilities, engines, jobs]`.

## Status: corpus / features / idea-graph runtime (in-memory scaffolds)

All shared vocabulary is imported from **`@mos/contracts`** (W2-A / RECONCILE-A — the W1-A
scaffold's `@mos/content` re-export path is retired). The package now contains:

- **LAB-001 — reference-first niche corpus**
  - `src/contracts/corpus.ts` — `ReferenceDocument` (id, version, tenantId, niche, platform,
    modality, **`artifact: ArtifactRef`** — a reference to one acquired content artifact, never
    content bytes, sourceRefs, acquiredAt, **rightsRef**, provenanceRef), `CorpusVersion`
    (immutable append-only snapshot), `CorpusQuery` (niche / platform / modality / inclusive
    acquisition time window), `RightsCheckPort` (the injected acquisition rights gate) and the
    **`CorpusStore`** port (6 methods ≤ 12 policy budget: ingest, get, query, snapshot,
    get-version, list-versions);
  - `src/adapters/in-memory-corpus-store.ts` — in-memory `CorpusStore` (disclosed scaffold).

- **LAB-002 — multimodal feature bundles**
  - `src/contracts/feature-bundle.ts` — `FeatureDescriptor` (feature kind + **computed
    `ArtifactRef` + scalar manifest metadata — raw vectors are not representable by type**),
    `FeatureBundle` (versioned, attach/detach append-only), `FeatureBundleRegistry` port
    (5 methods), and `FeatureComputationPort` (**declaration only**: the capability contract
    each feature kind requires, e.g. `semantic_video_relevance` from the
    `@mos/capabilities` §5 seed catalog — no engine is selected or invoked here);
  - `src/adapters/in-memory-feature-bundle-registry.ts` + `static-feature-computation.ts`.

- **LAB-003 — Idea Graph**
  - `src/contracts/idea-graph.ts` — `IdeaNode` (statement, embedding as artifact ref,
    **mandatory `derivation` to corpus documents / feature bundles**, provenanceRef),
    `IdeaEdge` (typed relations `supports | contradicts | derives-from | combines-with |
    competes-with`, signed weight in [-1, 1], versioned), `IdeaGraph` port (8 methods:
    node add/get/revise, edge add/get/update, neighborhood query, derivation-chain tracing)
    and `DerivationStep` (idea → feature-bundle → corpus-document → acquired artifact ref);
  - `src/adapters/in-memory-idea-graph.ts` — in-memory `IdeaGraph` (disclosed scaffold).

- `src/index.ts` — types + four runtime factories
  (`createInMemoryCorpusStore`, `createStaticFeatureComputationPort`,
  `createInMemoryFeatureBundleRegistry`, `createInMemoryIdeaGraph`).

## Design rules encoded here

- **Reference-first**: corpus documents only ever reference acquired content artifacts
  (`@mos/contracts` `ArtifactRef` — versioned, digest-pinned, object-store-backed); no
  fabricated content, no bytes in the control plane (AGENTS.md "Media").
- **Rights are structural, not incidental**: ingestion passes the injected
  `RightsCheckPort` and fails closed with `no-explicit-grant` / `rights-grant-revoked` /
  `rights-grant-expired` / `rights-grant-tenant-mismatch`. URL/storageRef accessibility never
  implies rights. The port is lab-owned and STRUCTURAL because the module registry does not
  list `rights` among lab's dependencies — a composition-root adapter over `@mos/rights`'
  `RightsRepository.getRights` satisfies the shape (tests use a disclosed double).
- **Append-only history**: corpus snapshots, feature bundle versions (attach → update →
  detach) and idea node/edge revisions are versioned records; nothing is mutated in place and
  nothing is hard-deleted.
- **Ideas are derived artifacts**: an idea without derivation refs is rejected
  (`empty-derivation`); every derivation ref must resolve in the tenant corpus
  (`unknown-derivation-ref`); `traceDerivation` walks ideas → bundles → documents → artifact
  refs, following `derives-from` edges transitively.
- **Tenant scoping**: every record carries `tenantId`; every operation names its
  `TenantScope`; unknown and cross-tenant are indistinguishable on reads (no existence leak).
- **Capabilities, not engines**: feature computation requirements are DECLARED
  (`CapabilityRequirement` from `@mos/contracts`, pinned to exact versions); engines are
  resolved through the Engine Registry (ENG-001/ENG-002) in a later wave — the lab never
  invokes engines or providers directly.

## Lab rules honored (architecture policy `specialRules.lab`)

- no direct publication — nothing here publishes anywhere;
- no direct provider calls — no provider SDK imports (boundary-check enforced);
- counterfactuals labeled / delayed-mode leakage prevention — future simulator concerns
  (LAB-004+), to be built on these versioned, reproducible corpus snapshots
  (`LabScenario.corpusVersion` in the frozen contracts YAML points at exactly this snapshot
  kind).

## Disclosed limitations

- In-memory adapters are ephemeral scaffolds (no durable persistence; central schema is
  TL-owned) — a durable adapter replaces them without touching the ports.
- `RightsCheckPort` is exercised by a DISCLOSED STRUCTURAL TEST DOUBLE in tests; the real
  `@mos/rights` adapter is composition-root wiring (TL-owned).
- `FeatureComputationPort` is a declaration carrier only — no engine binding, no computation.
- `@mos/capabilities` is imported for the §5 seed catalog ids used as test fixtures
  (registry-declared dependency); the seed catalog makes no engine claims.
- No idea/edge hard-delete by design (versioned corrections only); neighborhood queries
  return the induced subgraph within the hop radius.
