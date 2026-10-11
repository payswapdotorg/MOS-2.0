# @mos/commerce — the commerce-discovery authority (COMMERCE-001)

MOS v2.0 Wave 18 (worker-a). Registry authority `commerce-discovery`,
runtime deps EXACTLY [@mos/contracts, @mos/missions,
@mos/product-intelligence] (spec/mos-module-registry-v2.0.yaml);
@mos/experiments is a devDependency (type + compat surfaces only).

## Boundary

- Discovery candidates carry PROVENANCE: every record cites ≥1 EXACT
  product-intelligence record version (external commerce observations
  cited with provenance — never authored).
- Demand tests use the REAL Experiment authority through the declared
  `DemandExperimentPort` seam: the REAL binding (createBinding over the
  exact-version citation frame) is composed at the integration root; the
  compat battery pins the REAL authority surface + the seam's structural
  satisfiability. Denials return verbatim attribution and append ZERO
  experiment state.
- NO listing/order/inventory authority: no vocabulary, record kind, or
  state for orders/inventory/listings anywhere (source-scan pinned).
  Commerce truth stays external — candidates INFORM, they never transact.

## Disclosed limits

- `createInMemoryDemandExperimentPort` is the disclosed self-labeling
  test double (every minted ref carries the `test-double:` prefix);
  the durable binding is TL-side composition (the hexagonal law).
- The in-memory service is the composition double; the durable store is
  the integration root's responsibility.
- Rights enforcement is delegated to the consumed authorities (the
  product-intelligence reads are their own rights-gated surfaces);
  records are tenant-scoped with frozen TenantScope copies (D4).

## House discipline

Append-only versioned records (corrections append, never mutate); D1
composite tenant+id keys; D2 exact-tenant listings (no prefix scans, no
existence leaks); D3/F1 own-property-safe clone-then-deep-freeze; D5/F2
finite guards that THROW (never clamp); injectable clock + id factory
for deterministic tests; frozen error vocabulary (fail-closed typed
errors, first-error-out).

## Test

`pnpm --filter @mos/commerce test` — tsc -b + node --test over dist
(records battery, authority-discipline scans, the compat battery over
the REAL experiments authority's dist build).
