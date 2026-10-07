# @mos/identity

MOS v2.0 **Identity / Tenant / Workspace** domain package — `CORE-002` **Wave-0 groundwork**.

Module registry entry: `identity → packages/mos-identity`, owner `worker-a`, dependencies `[contracts]`.

## Status

Wave-0 groundwork scaffold. `@mos/contracts` (CORE-001, Wave 1) does **not** exist yet, so this package
currently depends on nothing at runtime. **Reconciliation with `@mos/contracts` happens when CORE-001
lands (Wave 1)** — see the mapping table below. Until then the types here are the provisional
identity vocabulary, not frozen contract types.

## What exists

| Path | Contents |
|---|---|
| `src/domain/ids.ts` | Branded nominal ID types: `TenantId`, `WorkspaceId`, `IdentityId`, `MembershipId` |
| `src/domain/tenant.ts` | `Tenant` record type |
| `src/domain/workspace.ts` | `Workspace` record type (carries `tenantId`) |
| `src/domain/identity.ts` | `Identity` record type (`kind: 'user' \| 'service'`) |
| `src/domain/membership.ts` | `Membership` record type (carries `tenantId`; append-only revocation) |
| `src/ports/identity-repository.ts` | `IdentityRepository` port + scope/input/error types |
| `src/adapters/in-memory-identity-repository.ts` | In-memory adapter (`createInMemoryIdentityRepository`) |
| `src/index.ts` | Public surface: **types + the factory only** |

Tests (`node:test`, zero test-framework dependencies): `src/domain/*.test.ts` +
`src/adapters/in-memory-identity-repository.test.ts`, covering CRUD round-trips, tenant isolation,
append-only membership revocation, and version bumps.

## Public surface

```ts
export type { Tenant, Workspace, Identity, Membership, /* ... ids, kinds, roles */ };
export type { IdentityRepository, IdentityRepositoryError, /* ... inputs, scopes */ };
export { createInMemoryIdentityRepository };
```

Public method budget (architecture policy `maxPublicMethods: 12`): the port exposes **9 methods**
(`createTenant`, `getTenant`, `createWorkspace`, `listWorkspaces`, `upsertIdentity`, `getIdentity`,
`grantMembership`, `listMemberships`, `revokeMembership`) plus **1** module-level factory — 10 total.

## Design rules honored

- **Tenant scoping** (`requireTenantScopeOnMutableArtifacts`): `Workspace` and `Membership` carry
  `tenantId` explicitly; every mutable operation takes an explicit scope object — there is no
  ambient "current tenant". `Tenant` is the scope root itself; `Identity` is a global principal whose
  tenancy linkage is expressed only through tenant-scoped memberships.
- **Append-only history** (`requireAppendOnlyHistoryWhereDeclared`): revoking a membership sets
  `revokedAt` and bumps `version`; records are never deleted. Re-granting creates a new membership
  record, preserving the full grant/revoke history. Double revocation is rejected.
- **Explicit versioned records** (`requireExplicitVersionedContracts`): every record carries a
  monotonic `version` starting at 1, bumped on every mutation.
- **Cross-tenant references are denied** (architecture §31): mutating operations validate the
  tenant boundary and return `cross-tenant-reference`; list queries filter by scope and return
  empty results rather than leaking existence.
- **Failures are typed values, not thrown classes**: mutating methods return
  `Record | IdentityRepositoryError` (discriminate with `'error' in result`). This keeps the runtime
  public surface at exactly one export as required by the Wave-0 assignment.
- **Zero runtime dependencies**: no `@zcode/*` imports, no external packages, no Node-builtin
  imports in runtime code (tests use `node:test` / `node:assert` builtins). Identifiers are
  caller-supplied; the clock is injectable.

## CORE-001 reconciliation mapping (pending, Wave 1)

When `@mos/contracts` (CORE-001) lands, the contract fields below are the consumers of this
package's types (source: `spec/contracts/core-contracts-v2.0.yaml`):

| Contract field | Identity type |
|---|---|
| `Artifact.tenantId` | `TenantId` |
| `ArtifactRef.tenantId` | `TenantId` |
| `ProductionRequest.scope` | tenant/workspace scope (`TenantId` / `WorkspaceId`) |
| `StudioSession.participants` | `IdentityId` references |
| `HumanProductionTask.rightsConsent` | consent records referencing `IdentityId` (CORE-003) |
| `RealExperimentBinding.*Ref` chain | scope/refs carrying `TenantId` (CORE-005 / BRIDGE) |
| every contract's `id` + `version` | aligned with the explicit-version discipline here |

Reconciliation is a Tech-Lead-owned decision at CORE-001 merge time: identity branded types will
either be adopted by / re-exported from `@mos/contracts`, or mapped through an explicit adapter.
This package must not be treated as contract-frozen until that reconciliation is recorded.

## Verification (commands run green in this repo)

```bash
pnpm install --frozen-lockfile                                  # workspace install
pnpm --filter @mos/identity exec tsc -b .                       # typecheck (composite build, emits dist/)
node --test 'dist/**/*.test.js'                                 # tests, run inside packages/mos-identity after tsc -b
pnpm exec oxlint packages/mos-identity                          # lint
```

The `test` script bundles the last two: `pnpm --filter @mos/identity test` =
`tsc -b && node --test 'dist/**/*.test.js'`.

Note: the package tsconfig sets `"types": ["node"]` — required by the repo's
TypeScript 6 toolchain to resolve `node:` builtin imports in the test files
(TypeScript 6 no longer resolves them through implicit `@types` inclusion).

## Disclosures / limitations

- The in-memory repository is a **Wave-0 groundwork adapter** — an ephemeral, process-local scaffold
  used to pin the domain model and port contract. It is **not** production persistence and must not
  be represented as such.
- **No database migrations or central schema** are created here; the central schema/migration story
  is owned by the Tech Lead (per the worker contract).
- No durable adapter, no event log, no pagination, no concurrency control beyond single-threaded
  in-process semantics — all deferred to the CORE-002 full implementation.
