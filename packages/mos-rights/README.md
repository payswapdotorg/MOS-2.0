# @mos/rights

MOS v2.0 **Rights / Consent / Provenance** domain package — `CORE-003` (Wave 1, W1-A).

Module registry entry: `rights → packages/mos-rights`, owner `worker-a`, dependencies `[contracts, identity]`.

## Status

Wave-1 implementation of the rights authority: explicit grants, participant consent, immutable
provenance records, and the pure rights evaluation rule. `@mos/contracts` (CORE-001, Worker B,
same wave) is not in this branch base, so contract-shaped types are defined **locally** and aligned
field-for-field to `spec/contracts/core-contracts-v2.0.yaml` (the frozen authority). Imports switch
to `@mos/contracts` at TL reconciliation (Wave 2). `@mos/identity` is imported type-only
(`TenantId`, `IdentityId`, `TenantScope`) — it exists on main per the module registry dependency.

## What exists

| Path | Contents |
|---|---|
| `src/domain/ids.ts` | Branded IDs `RightsGrantId`/`ConsentRecordId`/`ProvenanceRecordId` + stable opaque refs `RightsRef`/`ProvenanceRef`/`ConsentRef` (aliases of the record ids — refs ARE ids) |
| `src/domain/rights-grant.ts` | `RightsGrant` record + `RightsAction`/`RightsScope`/`RightsTerms` |
| `src/domain/consent.ts` | `ConsentRecord` (participant, purpose, scope) + `ConsentScope` |
| `src/domain/provenance.ts` | `ProvenanceRecord` (creationMethod, actor union, lineage refs) |
| `src/ports/rights-repository.ts` | `RightsRepository` port + inputs + error codes |
| `src/evaluation/rights-evaluation.ts` | **`evaluateRights`** — the pure evaluation rule (see below) |
| `src/adapters/in-memory-rights-repository.ts` | In-memory adapter (`createInMemoryRightsRepository`) |
| `src/index.ts` | Public surface: types + `evaluateRights` + the factory only |

Tests (`node:test`, zero test-framework dependencies): domain record shapes/freezing, repository
lifecycles (grant/consent/provenance), and the evaluation suite.

## THE rule: rights are never inferred from URL accessibility

Architecture §27: *“Public URLs do not imply rights.”* This package encodes it **structurally**:

- `evaluateRights(request)` is a **pure function**. Its request type carries the tenant, grantee,
  action, subject ref, the **explicit grant records as data**, and an ISO `now`. There is no field
  through which accessibility could even be expressed — no storage handle, no fetcher, no clock
  service, no environment.
- A request with no covering explicit grant is **denied** with reason `'no-explicit-grant'` —
  including (and especially) when the subject ref is a public, reachable URL. The subject ref is
  used exclusively to match against `grant.scope.subjectRefs`.
- Deterministic denial cascade: `no-explicit-grant` → `subject-not-covered` →
  `grantee-not-covered` → `action-not-covered` → `grant-revoked` / `grant-expired`.

The core test (`src/evaluation/rights-evaluation.test.ts`, `CRITICAL:` cases) pins: zero grants ⇒
denied `no-explicit-grant` for https/s3/file/plain-path subject refs alike; the same URL becomes
rights-relevant **only** when an explicit grant names it as a subject; revoked/expired grants deny.

## Public surface budget

Architecture policy `maxPublicMethods: 12`. This package exports:
`RightsRepository` port methods (10): `grantRights`, `getRights`, `revokeRights`, `recordConsent`,
`getConsent`, `revokeConsent`, `recordProvenance`, `getProvenance`, `listRightsGrants`,
`listConsentRecords`; plus 2 module-level functions: `createInMemoryRightsRepository`,
`evaluateRights` — **12 total** (at the limit; no further exports without a policy change).

## Design rules honored

- **Explicit grants only** (`requireExplicitVersionedContracts`, §27): every `RightsGrant` cites at
  least one `sourceRefs` entry (license/consent/contract ref); empty actions/subjects/sources are
  rejected as `invalid-input`. There is no grant-without-a-source shape.
- **Append-only revocation** (`requireAppendOnlyHistoryWhereDeclared`): revoking a grant or consent
  sets `revokedAt`, bumps `version`, never deletes; revoked records stay readable and listed;
  double revocation is rejected; re-granting creates a NEW record (new id).
- **Provenance immutability by construction**: the port exposes **no update or delete** for
  provenance records — `version` is always 1; corrections are new records.
- **Tenant scoping** (`requireTenantScopeOnMutableArtifacts`): records carry `tenantId`; every
  mutation takes an explicit `TenantScope`; cross-tenant revocations are denied
  (`cross-tenant-reference`); list queries filter by scope and return empty for unknown tenants
  (no existence leaks).
- **Frozen immutable records**: every stored record (and nested scope/terms/array fields) is
  `Object.freeze`d at creation; the adapter never mutates in place.
- **Failures are typed values, not thrown classes** (`@mos/identity` convention): mutating methods
  return `Record | RightsRepositoryError`, discriminated with `'error' in result`.
- **Zero runtime dependencies**: no `@zcode/*`, no external packages, no Node-builtin imports in
  runtime code (tests use `node:test`/`node:assert`). Identifiers are caller-supplied; the clock is
  injectable on the adapter.

## Contract alignment (CORE-001 reconciliation, pending Wave 2)

| Frozen YAML field (consumer) | This package |
|---|---|
| `Artifact.rightsRef` (CORE-004) | `RightsRef` (resolves via `RightsRepository.getRights`) |
| `Artifact.provenanceRef` (CORE-004) | `ProvenanceRef` (resolves via `getProvenance`) |
| `HumanProductionTask.rightsConsent` | `ConsentRef` → `ConsentRecord` |
| `Transform.rightsRequirements` | `RightsScope` vocabulary (actions over subject refs) |
| `RealExperimentBinding.rightsRef` | `RightsRef` |
| `LabScenario` rights context | `RightsRef` / `ConsentRef` |

`RightsAction`, `ProvenanceCreationMethod` and the structured terms are provisional vocabularies
defined here; they unify with `@mos/contracts` when CORE-001 is reconciled (adopt/re-export vs
adapter mapping is a TL-owned decision).

## Disclosed limitations

- The in-memory adapter is an **ephemeral process-local scaffold** — no database, migrations,
  durability, or cryptographic verification of grant authenticity. Durable persistence is TL-owned
  (central schema); the port is the stable contract.
- Cross-package runtime imports are **type-only** by design (see `src/index.ts` header note):
  workspace packages whose `exports.default` points at `./src/index.ts` do not resolve under plain
  Node ESM (internal `.js` specifiers). Sibling packages receive rights implementations through
  injection; the composition root wires real adapters at TL integration time.
- Tenant existence is NOT validated here (no identity repository is injected): the gate for
  “does this tenant exist” belongs to identity/composition. Within rights, tenancy is enforced on
  every mutation and query instead.
