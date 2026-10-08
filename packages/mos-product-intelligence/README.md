# @mos/product-intelligence — Product Source Intelligence (MOS v2.0, W11-A)

The **product-source-intelligence authority** of MOS v2.0 (registry:
`packages/mos-product-intelligence`, owner worker-a, authority
`product-source-intelligence`, dependencies exactly
`[contracts, identity, rights]` — spec/mos-module-registry-v2.0.yaml).

This package was **deferred from W10-A** (the Wave 10 time-critical-delivery
mandate) and landed in Wave 11 as the first Wave-11 package. It is the
evidence-linked source material a **MARKETING-001** marketing-mission
planner consumes — it is NOT MARKETING-001 itself (backlog: *"evidence-linked
platform/metric/experiment plan; no second Mission authority"* — the planner
stays in the missions lane).

## §25 boundary (pinned by construction, test-pinned verbatim)

Architecture §25: *"Product Intelligence can inform marketing planning but
remains a separate authority. Commerce truth remains external authority
through the existing commerce domain. The Lab may simulate or forecast
commerce outcomes but cannot turn simulated orders/inventory into
authoritative state."* This package applies it as:

- **Informs planning only** — the port's read surfaces (search / list /
  resolve-with-versioned-citations) are the declared seams a planner reads;
  there is structurally NO plan/mission/decision method (the port-surface
  battery pins the exact 7-method list and bans mission/plan/decision/
  commerce-authority vocabulary in method names).
- **Commerce truth stays external** — records CITE external commerce
  observations as provenance-carrying `CommerceObservationCitation`s
  (observationRef + observedAspect + sourceSystem + observedAt). A record
  sourced from `external-commerce-system` MUST carry at least one citation
  (fail-closed `commerce-citation-required`). Nothing here can turn a
  citation into orders, inventory or listing state — no such surface exists.
- **Forecasts explicitly counterfactual-labeled** — the basis union is typed
  with literal pins: `CitedEvidenceBasis` requires `counterfactual: false`,
  `ForecastBasis` requires `counterfactual: true` (compile-time), and the
  adapter re-validates both literals at runtime (the double-cast guard) for
  untyped callers, plus two coherence rules: a `forecast-model` source can
  never produce cited-external-evidence basis, and an
  `external-commerce-system` source is never a forecast authority.
- Every record carries the pinned §24-style boundary statement
  (`intelligenceOnly`) naming itself analysis material, never reality
  authority — verbatim-asserted by the authority battery.

## What this package owns

- **`ProductIntelligenceRecord`** — versioned, tenant-scoped, APPEND-ONLY,
  digest-sealed records of product-side intelligence about a
  `ProductSubjectRef`:
  - **content union** — `product-fact` (statement + evidence refs),
    `product-metric` (metric/value/unit/window + evidence refs, finite-value
    guard), `product-observation` (narrative + evidence refs). Every kind
    requires ≥ 1 evidence ref — an evidence-linked record with no evidence
    is a fabrication, not intelligence;
  - **explicit source attribution** — `source.sourceKind` ∈ the frozen
    vocabulary `platform-analytics | external-commerce-system | human-report
    | derived-analysis | forecast-model` + ≥ 1 `sourceRefs` (intelligence
    without source attribution is unverifiable and fails closed);
  - **basis** — cited external evidence vs counterfactual forecast (above);
  - **cited commerce observations** (§25 citations, above);
  - **rights-respect** — every record names the explicit `RightsRef` of the
    ACTIVE tenant-matching grant under which the analysis was recorded;
  - provenance stamps (`recordedBy` identity, `recordedAt` on the injectable
    clock, optional `note`) and the §25/§24 pinned labels
    (`recordKind: 'product-intelligence-analysis'`, `disclosure`,
    `intelligenceOnly`).
- **`ProductIntelligencePort`** (7 methods ≤ the 12-method policy budget) —
  the ONLY write path is the append-only `recordProductIntelligence` (a new
  record is always a NEW version of its `(tenant, id)` chain; no
  update/delete surface exists). The planning-facing reads:
  `getProductIntelligenceRecord` (exact version or latest),
  `listProductIntelligenceVersions` (immutable history),
  `listProductIntelligenceForSubject` (latest-per-chain),
  `searchProductIntelligence` (exact-equality filters — subject / kinds /
  basis / sourceKinds — deterministic `(subject, recordId)` order, finite
  limit guard), `resolveProductIntelligenceCitations` (the planner's
  fail-closed provenance resolution: every versioned citation must resolve —
  `citation-not-found` otherwise), `verifyProductIntelligenceIntegrity`
  (bit-for-bit digest report: intact | tampered).

## The rights gate (fail-closed ladder, test-pinned)

Recording passes `adapters/rights-gate.ts` BEFORE anything is stored:

1. `no-explicit-grant` — the `rightsRef` does not resolve (URL/storage
   accessibility never implies rights, §27);
2. `rights-grant-tenant-mismatch` — the grant belongs to another tenant;
3. `rights-grant-revoked` / 4. `rights-grant-expired` — append-only
   revocation / expiry;
5. `analyze-action-not-granted` — the closed `@mos/rights` action
   vocabulary must include `analyze` in the grant's actions;
6. `attribution-required` — the grant's terms demand attribution and the
   request carries none (the record must name the source/rights holder);
7. `cited-ref-not-covered-by-grant` — some cited ref (evidence refs ∪
   source refs ∪ cited commerce observation refs) is not covered by the
   grant's subject set. The coverage check is **element-wise on the union**
   (the W9-B D6 discipline — never a delimiter-joined set comparison).

`@mos/rights` is imported TYPE-ONLY: the gate runs over the injected
`ProductIntelligenceRightsSource` (a `Pick<RightsRepository, 'getRights'>`
view — the `@mos/content` precedent); the composition root wires a real
rights repository at TL integration time.

## Security disciplines by construction (W9-B/W10-B defect classes)

- **D1** — composite keys are `JSON.stringify([tenantId, recordId])` array
  keys: injective over the tuple; hostile delimiter-laden tenant ids can
  never alias another tenant's chain (pinned with the true W3-A collision
  shape — the honest tenant id itself contains the delimiter).
- **D2** — listings (search/subject/version lists) compare the STORED
  record's tenant EXACTLY while iterating every chain — never a prefix scan.
- **D3/F1** — clone-then-deep-freeze: the store keeps private structural
  clones (own-property-safe via `Object.defineProperty`, so
  `__proto__`-carrying payloads persist as inert own properties and never
  pollute `Object.prototype`); the caller's objects are never aliased and
  never frozen in place; the stored record is deep-frozen and
  bit-for-bit stable under re-read.
- **D4** — the record owns a FROZEN COPY of the caller's `TenantScope`; a
  post-hoc mutation of the caller's scope cannot move the stored record's
  tenant identity.
- **D5/F2** — finite-number guards on every numeric recording: metric
  values (`non-finite-metric-value`) and search limits (`invalid-input`,
  integer 1..10000).
- **D6** — element-wise set comparison for rights coverage (join-colliding
  cited-ref sets are recognized as NOT covered; order-insensitivity holds).
- **Append-only** — `recordProductIntelligence` is the only write path; a
  later record never rewrites an earlier version (bit-for-bit pinned);
  records are digest-sealed (canonical JSON + FNV-1a — a change detector,
  never a security claim) and verified through the integrity port.

## Surface

| Surface | Kind | Notes |
| --- | --- | --- |
| `PRODUCT_INTELLIGENCE_KINDS` / `PRODUCT_INTELLIGENCE_SOURCE_KINDS` | const | frozen closed vocabularies |
| `ProductIntelligenceId`, `ProductSubjectRef`, `ProductIntelligenceVersionRef` | type | branded ids + the versioned citation shape mission planning consumes |
| content union (fact/metric/observation), source, basis union, commerce citation, record | type | contracts |
| `ProductIntelligenceSearchQuery` | type | planner-facing exact-equality filters |
| `ProductIntelligencePort` (7), `RecordProductIntelligenceInput`, error/code types, `ProductIntelligenceRightsSource` | type | port ≤ 12 methods |
| `createInMemoryProductIntelligence` | factory | disclosed in-memory double (injectable rights source + clock) |

Runtime exports are exactly THREE (1 factory + 2 frozen vocabularies) —
pinned by the authority battery. Sibling packages import this package
TYPE-ONLY and receive runtime implementations through injection
(hexagonal; the `@mos/rights`/`@mos/policy` precedent).

## Disclosed limits

- The in-memory adapter is a **disclosed deterministic double** (ephemeral,
  process-local; no durability claim) — durable stores are TL-owned later
  work behind the same port. The rights source in tests is a disclosed
  structural double of `Pick<RightsRepository, 'getRights'>`.
- The port method budget deliberately leaves headroom (7 of 12) for the
  durable adapter's needs; MARKETING-001 consumes the port — it does not
  extend it.
- Records key chains per `(tenant, recordId)`: the workspace id is carried
  on the record as frozen scope context, while tenant equality is THE
  visibility boundary (documented decision; cross-tenant ≡ unknown on
  reads — no existence leaks).
- The MARKETING-001 planner itself is NOT in this package (no plan/mission
  vocabulary exists here by construction); the commerce domain
  (`packages/mos-commerce`, not yet built) owns commerce discovery — this
  package only records intelligence that CITES external commerce
  observations.

## Verification

```
pnpm --filter @mos/product-intelligence test   # tsc -b + node --test dist (47 tests)
pnpm --filter @mos/product-intelligence lint   # oxlint (0/0)
node harness/mos-boundary-check.mjs            # 18 mos packages, PASSED
pnpm run architecture:check                    # 0 violations
```
