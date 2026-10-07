# @mos/lab

MOS v2.0 **Marketing Lab** package — `LAB-001` **SCAFFOLD ONLY** (Wave 1, W1-A).

Module registry entry: `lab → packages/mos-lab`, owner `worker-a`, dependencies
`[contracts, content, production, agents, capabilities, engines, jobs]`.

## Status: scaffold — no runtime

`LAB-001` ("Reference-First Niche Corpus", deps `CORE-004 + CORE-005`) is grounded in this wave
by pinning the corpus **vocabulary only**. This package contains:

- `src/contracts/corpus.ts` — `ReferenceDocument` (id, version, tenantId, sourceRefs,
  acquiredAt, **rightsRef**, provenanceRef, contentDigest, modality), `CorpusVersion`
  (immutable snapshot), `CorpusIngestPort` / `CorpusQueryPort` (future runtime boundaries),
  draft/input/error types;
- `src/index.ts` — types-only public surface (test-pinned: the compiled package exports NO
  runtime API);
- `src/contracts/corpus.test.ts` — type-level invariant tests (constructibility, exact field
  sets, full modality vocabulary, types-only emission).

There is deliberately **no corpus storage, no ingest runtime, no query engine, no simulator**
here — the reference-first corpus implementation (acquisition pipelines, rights-gated ingest,
versioned snapshots at scale) and everything built on top of it (LAB-002 multimodal feature
bundles, LAB-003 idea graph, LAB-004 social simulator, LAB-005+ dynamics) are **later waves**.
This scaffold exists so those waves extend a pinned contract instead of inventing one.

## Design notes encoded in the sketch

- **Rights are structural, not incidental**: `ReferenceDocument.rightsRef` is a REQUIRED field —
  a document without an explicit rights grant cannot exist in the corpus model at all. The
  ingest port's error model carries `no-explicit-grant` (the CORE-003/CORE-004 rule: URL
  accessibility never implies rights). `sourceRefs` describe provenance of acquisition; the
  rights grant is the only rights authority.
- **Object-store discipline**: documents are pinned by `contentDigest`
  (`sha256:<hex>`, aligned with `@mos/content`'s `ContentDigest`); bytes live in object storage
  and are never inlined into corpus records.
- **Immutable snapshots**: a `CorpusVersion` is a frozen membership snapshot; changes produce a
  new version, mirroring CORE-004's artifact version chains. `LabScenario.corpusVersion` (frozen
  contracts YAML) points at exactly this kind of versioned snapshot so simulations are
  reproducible.
- **Async ports**: `CorpusIngestPort`/`CorpusQueryPort` are `Promise`-returning because real
  ingest crosses storage/process boundaries — the same shape as `@mos/content`'s async
  `ArtifactStorage` port.
- **Dependency hygiene**: types come from `@mos/content` (a declared registry dependency that
  exists in this wave, which re-exports the shared id/ref vocabulary), not from
  `@mos/identity`/`@mos/rights` directly. The remaining declared dependencies (`production`,
  `agents`, `capabilities`, `engines`, `jobs`) bind as those packages land.

## LAB rules honored (architecture policy `specialRules.lab`)

- no direct publication — nothing here publishes anywhere (no runtime at all);
- no direct provider calls — no provider SDK imports (boundary-check enforced);
- counterfactuals labeled / delayed-mode leakage prevention — future simulator concerns, to be
  built on these versioned, reproducible corpus snapshots.

## Disclosed limitations

- Types-only: no storage, ingest, query, or calibration runtime (by design for this wave).
- `CorpusIngestPort`/`CorpusQueryPort` are declared but UNIMPLEMENTED — implementors arrive in
  later waves and must honor the documented error model (including the rights gate).
- The `@mos/contracts` reconciliation (CORE-001, Wave 2) applies to these types like every
  other MOS domain package.
