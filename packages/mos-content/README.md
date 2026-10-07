# @mos/content

MOS v2.0 **Content Artifact + Artifact Graph** domain package — `CORE-004` (Wave 1, W1-A).

Module registry entry: `content → packages/mos-content`, owner `worker-a`, dependencies
`[contracts, identity, rights]`.

## Status

Wave-1 implementation of the artifact authority: immutable versioned artifacts, the
lineage-preserving artifact graph, an in-package object-storage port, and rights-gated
registration. RECONCILED in Wave 2 (W2-A / RECONCILE-A): the shared artifact vocabulary —
`ArtifactId`, `ArtifactType`, `StorageRef`, `ContentDigest`, `Version`, `TenantId`, `TenantScope`,
`RightsRef`, `ProvenanceRef` and the whole `ArtifactRef` reference record — is imported from
`@mos/contracts` (CORE-001 canonical authority), giving artifact references TRUE type identity
across content, lab, engines and studio packages. `Artifact` extends the contracts base locally
with the content-domain `CreationMethod` vocabulary. `@mos/identity` and `@mos/rights` are still
imported **type-only** (ids and the `RightsRepository` shape used by the injected rights gate)
per the module registry dependency chain.

## What exists

| Path | Contents |
|---|---|
| `src/contracts/artifact.ts` | `Artifact` + `ArtifactRef` (frozen YAML shapes, field-for-field), `ArtifactId`, `ArtifactType`, `StorageRef`, `ContentDigest`, `CreationMethod` |
| `src/ports/artifact-repository.ts` | `ArtifactRepository` + `ArtifactGraph` ports, `RightsSource` (injected rights gate view), inputs, error codes |
| `src/ports/artifact-storage.ts` | `ArtifactStorage` port (object storage stays behind a MOS-domain port) + put/get request/result types |
| `src/adapters/in-memory-artifact-repository.ts` | In-memory repository + graph adapter (`createInMemoryArtifactRepository`) |
| `src/adapters/in-memory-artifact-storage.ts` | In-memory storage **disclosed test double** (`createInMemoryArtifactStorage`) |
| `src/index.ts` | Public surface: types + the two factories only |

Tests (`node:test`, zero test-framework dependencies): contract-shape exactness (YAML fields),
version-chain immutability, lineage transitivity (a→b→c, diamonds), rights gate, tenant scoping,
object-store refs, storage double behavior.

## Contract alignment (CORE-001 reconciliation: DONE in W2-A)

`spec/contracts/core-contracts-v2.0.yaml`:

| Contract | This package |
|---|---|
| `Artifact` required: [id, version, tenantId, type, digest, storageRef, provenanceRef, rightsRef, lineage, creationMethod] | `Artifact` — **exactly** these 10 fields (test-pinned via `Object.keys`) |
| `ArtifactRef` required: [artifactId, version, tenantId, digest, type, storageRef, rightsRef, provenanceRef] | `ArtifactRef` — **exactly** these 8 fields (test-pinned); `Artifact.lineage` entries |
| `Transform.lineageRules` consumers | lineage edges validated at registration (DAG by construction) |
| `EngineJob.inputArtifactRefs` / `EngineResult.outputArtifactRefs` | `ArtifactRef` shape |
| `StudioArtifactPackage.raw/intermediate/final` stages | artifacts enter as `raw-capture` records and are never silently final (§6) |

`CreationMethod` is a local superset of the contracts `CreationMethod` vocabulary: the frozen
YAML pins only the field NAME, so the content-domain provenance methods (`reference`,
`acquisition`, `raw-capture`, `transform`, `human-contribution`) extend the contracts base;
unifying the two vocabularies is a disclosed TL decision (see the W2-A report).

## Public surface budget

Architecture policy `maxPublicMethods: 12`. This package exports:
`ArtifactRepository` (4): `registerArtifact`, `registerArtifactVersion`, `getArtifact`,
`listArtifacts`; `ArtifactGraph` (2): `getAncestors`, `getDescendants`; `ArtifactStorage` (2):
`put`, `get`; plus 2 module-level factories — **10 total**.

## Design rules honored

- **Immutability by construction** (architecture §6): the ports expose **no update and no
  delete**. A new version is a new record (`version` = latest + 1) whose lineage links its
  predecessor; a transformation is a new artifact whose lineage links its parents. Returned
  records (and their lineage arrays and refs) are deep-`Object.freeze`d. The runtime method set
  of the adapter is test-pinned to exactly the six port methods.
- **Lineage preserved across transformation steps**: parents are validated to exist in the same
  tenant at registration, so lineage edges always point from newer to older records — the graph
  is acyclic by construction. `getAncestors`/`getDescendants` walk it transitively (oldest
  generation first / closest first; diamonds deduplicated; deterministic ordering).
- **Object-store references, never media bytes** (`forbidMediaOverControlRpc`): artifact records
  carry `storageRef` **strings** only (test-pinned: no byte array ever appears in a record).
  Bytes move only through the `ArtifactStorage` port, which stays OUTSIDE the control-plane
  record path.
- **THE rights gate** (CORE-004 acceptance, §27 "Public URLs do not imply rights"): every
  registration names a `rightsRef` that must resolve — through the injected
  `RightsSource` — to an explicit, tenant-matching, **active** grant. Unresolvable ref ⇒
  `no-explicit-grant` (regardless of how public the `storageRef` is); revoked ⇒
  `rights-grant-revoked`; expired ⇒ `rights-grant-expired`; other tenant ⇒
  `rights-grant-tenant-mismatch`.
- **Tenant scoping** (`requireTenantScopeOnMutableArtifacts`): records carry `tenantId`; every
  operation takes an explicit `TenantScope`; cross-tenant parents and chain extensions are
  denied (`cross-tenant-reference`); cross-tenant reads are indistinguishable from unknown
  (no existence leaks).
- **Explicit versioned records** (`requireExplicitVersionedContracts`): every record carries
  `version`; version chains are monotonic.
- **Failures are typed values, not thrown classes**: mutating methods return
  `Record | ContentRepositoryError`, discriminated with `'error' in result`.
- **Zero runtime dependencies**: no `@zcode/*`, no external packages, no Node-builtin imports in
  runtime code (the storage double hashes with the ECMAScript-global Web Crypto API; tests use
  `node:test`/`node:assert`). Identifiers are caller-supplied; the clock is injectable.

## The ArtifactStorage port (why it lives here)

CORE-004 acceptance requires "object-store references instead of control-plane media transport".
The module registry declares content's dependencies as `[contracts, identity, rights]` — the
substrate adapters package is NOT among them, so the object-storage port is declared **in this
package** (MOS-owned), and a substrate-backed adapter (`@zcode/substrate-adapters`'
`ObjectStoragePort` satisfies the shape after a thin structural bridge) is wired at the
composition root in a later wave. The in-package adapter (`createInMemoryArtifactStorage`) is a
**disclosed test double**, not production storage: content-addressed `sha256:<hex>` digests,
`mem://<tenant>/<digest>` refs, idempotent puts, private byte copies both directions, and
cross-tenant denial — enough to pin the port contract. `digest-mismatch` exists in the error
model for future read-path verification adapters.

## Disclosed limitations

- Both in-memory adapters are **ephemeral process-local scaffolds** — no database, migrations, or
  durability. The repository adapter does not verify that bytes behind a `storageRef` exist or
  match the recorded digest. Durable persistence and the central schema are TL-owned; the ports
  are the stable contracts.
- The rights gate is exercised in tests through a **structural double** implementing the
  `Pick<RightsRepository, 'getRights'>` view (real grant records, fake resolver): contract
  testing per AGENTS.md ("mocks/doubles can test contracts but cannot be represented as live
  provider or production proof"). A real `@mos/rights` repository is wired by the composition
  root — this package imports `@mos/rights` type-only because runtime cross-imports of workspace
  packages whose `exports.default` is `./src/index.ts` do not resolve under plain Node ESM.
- The gate checks grant *validity* (resolves, tenant-matching, active). Full
  action/subject/grantee evaluation at *use* time is `@mos/rights`' pure `evaluateRights`.
- Objective editing is out of scope here; artifact corrections are new records by design.
