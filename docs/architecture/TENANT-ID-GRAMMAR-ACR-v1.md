# Architecture Change Record — Tenant-id Grammar v1

- **Task**: W11-B — tenant-id grammar ACR + authority enforcement pins (the W9-B review §7.2 recommendation, TL-accepted as Wave 11 work)
- **Branch**: `worker-b/wave11` (base `e65b320`, the Wave 10 TL acceptance commit)
- **Author**: Worker B (Agent/Engine/Production Backend lane)
- **Status**: PROPOSED — **the ACR proposes; the Tech Lead decides.** The frozen specs (`spec/**`, including `spec/mos-architecture-lock-v2.0.md` and the frozen manifests) are NOT touched by this wave. This document is the proposal channel required by lock rule 42 ("Any architecture change requires an Architecture Change Record in the repo and a manifest revision") — the manifest revision is the TL's to make upon acceptance, not this wave's.
- **Origin**: `docs/architecture/SECURITY-REGRESSION-REVIEW-v1.md` §5.3 (residual risk: "Tenant-id grammar is unconstrained by the frozen specs. No spec defines a tenant-id format, so NUL/`:|::`-laden ids remain representable and every new composite key must re-defend. A spec-level tenant-id grammar (Architecture Change Record) would collapse the whole D1/D2 class — TL decision (no contradiction found in the frozen specs; this is a gap, not a violation)") and §7.2 (the recommendation this ACR implements).

## 1. Decision proposed

Adopt a **frozen tenant-id grammar**:

```text
^[a-z0-9][a-z0-9-]{0,63}$
```

— lowercase ASCII alphanumeric plus hyphen, 1–64 characters, first character alphanumeric (a DNS-label-shaped slug). The grammar is exported as a frozen machine-readable constant from `@mos/contracts` (`TENANT_ID_GRAMMAR` + `isValidTenantId`, §4 below) so every package can cite the exact same rule without inventing a second authority.

## 2. Why each exclusion (per D1/D2 attack shape collapsed)

The W9-B sweep (review §2) found two cross-tenant defect classes whose enabling condition is that hostile tenant ids remain **representable**:

- **D1 — delimiter-injectable composite keys**: tenant-composite Map keys built by delimiter concatenation (`::`, `:`, `|`, `\u0000`) are not injective over string tuples; a hostile tenant id containing the delimiter aliases another tenant's key (cross-tenant record bleed, idempotency-index eviction, replay-ledger aliasing, version-chain corruption).
- **D2 — prefix-scan tenant listings**: a delimiter-laden tenant id widened another tenant's listing (existence/bleed corollary of D1).

Every exclusion in the grammar maps to a concrete D1/D2 attack shape observed in the repo:

| Excluded shape | Attack shape it removes at the authority | Where it was actually attacked (W9-B/W10-B probes) |
|---|---|---|
| `:` and `::` | engines assignment-lane key (`::`), jobs `(tenant, …)` keys (`:`) | `mos-engines`, `mos-jobs` w9b probes |
| `\|` | distribution provider replay-ledger key (`\|`) | `mos-distribution` w9b probe |
| `\u0000` (NUL) | lab version-chain keys, integrations `byImplementation` index, production registries (`\u0000`) | `mos-lab`, `mos-integrations`, `mos-production` w9b probes |
| empty string | every composite key degenerates (`""` + delimiter aliases the other component alone) | lab "unknown-ensemble write wall" shapes |
| whitespace (` `, `\t`, …) | no observed delimiter role, but prefix-scan widening and human/tooling confusion; excluded for the same reason as other delimiters | — (cheap collapse) |
| uppercase A–Z | no observed delimiter role; excluded because the canonical form is the lowercase slug convention (and uppercase variants of the same id would otherwise be distinct tenants — a homoglyph-adjacent confusion class) | — |
| non-ASCII / unicode | `ténant`-vs-`tenant` and CJK homoglyph ids are indistinguishable to humans in logs and §30 records; excluded for auditability | — |
| `_` (underscore) | no delimiter role, but no value either; the DNS-label shape is the industry-standard tenant slug (Stripe/GitHub-style) and the shorter the alphabet, the smaller the confusion surface. **Migration cost disclosed in §6**: exactly one demo id (`tenant_demo`) moves | mos-web demo fixture |
| length > 64 | caps key material in every composite-key store and log line; 64 matches the DNS-label convention | — |
| leading hyphen | a leading `-` reads as a flag/prefix in tooling and is not a slug; first char must be alphanumeric | — |

Trailing hyphens are **tolerated** by the proposed grammar (`tenant-` matches); they carry no delimiter role and no known attack shape. TL may tighten to a full DNS-label rule (no leading/trailing hyphen) at adoption time — the enforcement point (§3) makes that a one-character change in exactly one exported constant.

## 3. Enforcement point — the single authority choke point

`@mos/identity` `createTenant` is the **only** place new tenant ids enter the system (the identity authority owns the `Tenant` record; every other package receives tenant ids through scopes). The grammar is enforced **there and only there**:

- **Fail-closed**: a `createTenant` call whose `id` violates the grammar returns a typed `IdentityRepositoryError` with new code `invalid-tenant-id` — nothing is recorded (`getTenant` on the rejected id stays `null`). The check runs **before** the duplicate check: the authority never admits a new invalid id, even one equal to a grandfathered legacy row (§5).
- **Typed and §30-attributable**: the failure is a machine-readable code (`invalid-tenant-id`) + a message that names the grammar and points at this ACR — exactly the shape an observability consumer records (actor, action `createTenant`, reason). The identity port's failure model is a result union (`Tenant | IdentityRepositoryError`), so the typed code IS the attributable channel at this authority; no thrown class is introduced (the port's documented discipline).
- **Reads never validate**: `getTenant`, `createWorkspace`, `listWorkspaces`, `grantMembership`, `listMemberships`, `revokeMembership` accept any tenant id they are handed — this is what makes grandfathering (§5) work, and it is deliberate: enforcement gates *creation*, never *resolution*. Scoping/equality semantics are unchanged.

## 4. The grammar export (registry-exact)

The grammar lives in `@mos/contracts` (`src/tenant-id-grammar.ts`) as:

- `TENANT_ID_GRAMMAR` — one frozen constant: `{ patternSource: "^[a-z0-9][a-z0-9-]{0,63}$", minLength: 1, maxLength: 64, description, acr }`;
- `isValidTenantId(id: string): boolean` — the single validation predicate, compiled from the exported pattern source (the exported source and the enforced predicate cannot drift).

Rationale: `@mos/contracts` is the canonical value-type authority for `TenantId`/`TenantScope` already (the W2-A/RECONCILE-A reconciliation), and it already exports runtime constants + guards (`CONTRACT_REQUIRED_FIELDS`, `assertRequiredFields`, …). Registry-exactness: `identity`'s registry dependencies are `[contracts]`, so identity importing the grammar adds **no new dependency edge**; every other MOS package that may later cite the predicate (§8) also already depends on contracts. The public-function budget grows from 3 to 4 (limit 12).

`@mos/identity` enforces via `isValidTenantId` — one import, one choke point, no local re-definition of the rule (no second authority).

## 5. Grandfathering and migration (append-only discipline — never rewrite history)

Existing tenants are **grandfathered**: only *new* tenant creation enforces the grammar. Stored tenants are immutable records; nothing rewrites, re-keys or deletes a stored tenant to conform. Concretely:

- The in-memory adapter gains a disclosed `grandfatheredTenants` seeding option that stores rows **verbatim without grammar validation** — it models durable rows that predate the constraint (a durable adapter with a new CHECK constraint behaves identically: existing rows keep resolving, new writes validate). It is a test/composition affordance, not an attacker surface: seeds are trusted repo-internal fixtures, exactly like every other fixture clock/seed in the repo's in-memory doubles.
- A `createTenant` attempt with an id equal to a grandfathered row returns `invalid-tenant-id` (grammar precedes duplicate) — the authority never *re-admits* an invalid id; the legacy row itself keeps resolving forever.
- The pin battery includes explicit grandfathering probes: a NUL-laden and a `::`-laden legacy tenant keep resolving through `getTenant`, keep accepting `createWorkspace`/`grantMembership` under their scope, and are never evicted by a failed re-create attempt.

## 6. Migration/compatibility analysis — what breaks, what does NOT

**What breaks (mechanical, migrated in this wave, disclosed):**

1. `packages/mos-studio/src/testing/editing-fixtures.ts` seeded the W8-C editing-stack tenant as `"tenant:studio-editing"` — a **colon-laden id** flowing into the real `@mos/identity` `createTenant` through `composeRealParticipantAuthorities.ensureIdentity` (STUDIO-006 real-authority seam). This is precisely the id shape the grammar exists to reject at the authority. Migrated to `"tenant-studio-editing"` (one constant; every consumer imports the constant — no assertion in the battery hardcodes the old literal).
2. `packages/mos-web/testing/compose-in-memory-mos-web.ts` demo id `'tenant_demo'` (underscore) → `'tenant-demo'`, plus the nine `tenant_demo` literals in the web test files that scope against the composed demo app. Mechanical renames in test/testing files only.

Both are **test/testing fixtures**, not production surfaces; the frozen specs and no production composition root are touched. This is the entire repo-wide breakage set — verified by auditing every `createTenant` call site in the tree (mos-identity's own tests, mos-studio's `ensureIdentity` seam, mos-web's compose + app-shell tests; all other ids are already grammar-conformant, e.g. `tenant-a`, `tenant-001`).

**What does NOT break — and must not:**

1. **The w9b/w10b hostile-id probes stay valid, by design.** They attack the *adapter* layer directly with delimiter-laden ids cast `as TenantId`, deliberately **bypassing the identity authority** — that is the defense-in-depth premise: the grammar gate is layer 1 (authority), the JSON-array composite keys + exact-equality listings are layer 2 (adapters). Layer 2 must keep holding even for ids that can no longer be *created*, because (a) grandfathered legacy ids remain live, (b) hostile values remain representable at the type level (a branded string is still a string at runtime), and (c) a future durable identity adapter is a new trust boundary. **The probe batteries were re-run green in this wave** — they are unaffected because they never call `createTenant`.
2. **The JSON-array-key discipline is NOT removed.** Per the review's own §7.2 recommendation, the defensive `JSON.stringify([...])` composite keys and exact-tenant-equality listings stay **regardless** of the grammar — defense in depth is cheap, and the grammar only constrains *new* ids at *one* authority. This ACR explicitly does NOT propose relaxing any D1/D2 fix.
3. **Workspace ids, identity ids, membership ids are NOT constrained** by this ACR — tenant-id only. A workspace-id grammar would be a separate, follow-up ACR if the TL wants it (workspace ids have no observed attack surface of their own; they ride inside tenant-scoped stores).

## 7. What the grammar does NOT do (non-goals)

- It does **not** make hostile tenant ids unrepresentable in the type system — `TenantId` remains a branded `string`; any adapter handed a hostile value by a bypassing caller must still defend (layer 2 stands).
- It does **not** validate ids at read/query time (§3) — reads stay grandfathering-compatible and O(1).
- It does **not** remove or weaken any W9-B/W10-B fix, probe, or named-error defense.
- It does **not** touch the frozen `spec/**` files — this document (in `docs/architecture/`, not frozen) is the proposal; upon TL acceptance the TL promotes the rule into the frozen authority set (manifest revision per lock rule 42 — the TL's edit, not a worker's).

## 8. Adapter-layer complement (optional, disclosure only)

`@mos/contracts` now exports `isValidTenantId` so adapters **MAY** cite the shared predicate when they want a cheap early rejection of scope ids they are handed. No adapter is migrated or forced in this wave — the adapters' own injective-key/equality discipline is the load-bearing defense and stays self-sufficient (§6.2). Citing the predicate is a quality-of-life option for future durable adapters (BRIDGE/PROD), where rejecting a hostile scope id up front is cheaper than carrying it through a store.

## 9. Verification (this wave, on `worker-b/wave11`)

- New grammar pin battery in `@mos/contracts` (pattern exactness, frozen constant, accept/reject boundary incl. 64/65 length boundary).
- New enforcement battery in `@mos/identity`: valid ids accepted; every D1/D2 attack shape rejected at the authority with typed `invalid-tenant-id` and nothing recorded (`:`, `::`, `|`, NUL, empty, whitespace, uppercase, unicode, underscore, over-length, leading hyphen); grandfathered tenants keep resolving; re-create of a grandfathered id fails grammar-first; the blank-name check still precedes nothing incorrectly (order pinned).
- w9b + w10b hostile-id probe batteries re-run green (engines/jobs/lab/integrations/distribution/production/agent-runtime/capabilities/agents + studio/lab w10b probes) — layer 2 pinned unchanged.
- Full battery re-run on the branch: baseline 1589 + new tests, 0 fail; oxlint 0/0; boundary harness PASSED; architecture:check 0 violations; zero lockfile delta.

## 10. Adjacent gaps noted (not this ACR's scope, for TL visibility)

1. **Single-session currency scope gap** (declared in the W10-B review §8.6.4): declared cost currency discipline is single-session scoped; cross-session currency confusion is a declared gap, not a defect. A currency-scope ACR would be the follow-up channel if the TL wants it closed at the authority level.
2. **`cost.amount` finite-number guard** (review §5.4): deliberately unfixed while no consumer enforces cost; any future cost-enforcing consumer must add its own guard (the grammar ACR pattern — gate at the authority that owns the value — is the template).
3. **Workspace-id grammar** (§6.3): unconstrained; no observed attack surface; separate ACR if ever wanted.

## 11. TL decision menu

1. **Accept as proposed** — grammar frozen as `^[a-z0-9][a-z0-9-]{0,63}$`, enforcement at `createTenant` (already implemented + pinned on this branch); TL promotes into the frozen authority set with the manifest revision.
2. **Accept with tightening** — e.g. full DNS-label (no trailing hyphen) or a shorter length cap; one-character change in the exported constant + the pin battery, enforcement site untouched.
3. **Amend the alphabet** — e.g. admit `_` (collapses the `tenant_demo` migration); same one-constant change.
4. **Reject** — the enforcement + pins on this branch revert cleanly; the adapter-layer defense (layer 2) is self-sufficient either way.

Whatever the decision, the adapter-layer probes and JSON-array keys stay (they are not conditioned on this ACR).
