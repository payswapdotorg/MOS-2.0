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

## ATTRIB-001 — the social-to-commerce attribution subtree (src/attribution/)

The last carried-forward Phase 5 item. Attribution records link social
observations (@mos/distribution SocialObservationRecords) to commerce
discovery candidates (this package's CommerceDiscoveryRecords):

- DISTINCT FROM CAUSALITY (the hard law): an attribution declares an
  ASSOCIATION on the frozen basis vocabulary
  ("platform-reported-association") — never an effect claim. The
  causality-vocabulary guard (16 frozen effect-language patterns) scans
  every free-text field fail-closed; the record type structurally carries
  no effect/impact fields.
- REFERENCES AUTHORITATIVE OBSERVATIONS: both ends are opaque typed refs —
  the social side cites the authority's OWN observation id (the REAL
  record is never re-authored, its `reported` payload never travels into
  the attribution — pinned); the commerce side cites an EXACT discovery
  record version. The compat battery pins the REAL observation shape over
  @mos/distribution dist (devDep).
- House discipline throughout: versioned tenant-scoped append-only
  records; corrections append (only the basis note is correctable — the
  cited refs are immutable); D1/D2/D3/F1/D4; injectable clock/id;
  frozen 7-code error vocabulary.
