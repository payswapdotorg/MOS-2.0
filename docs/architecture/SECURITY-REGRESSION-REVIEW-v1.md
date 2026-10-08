# MOS v2.0 Security Regression Review v1

- **Task**: W9-B — production/engine/security adversarial regression sweep (Wave 9, Worker B lane; second attempt — recovery over the first attempt's uncommitted partial)
- **Branch**: `worker-b/wave9` (base `a3fff49`, the Wave 8 TL acceptance commit)
- **Audited tree**: the 18-package MOS set @ `a3fff49`
- **Date**: 2026-06 (session W9-B/2)
- **Status**: COMPLETE — every finding below is backed by repository evidence (probe test files + the verification battery), per AGENTS.md "A green claim requires repository-backed evidence".

## 1. Methodology

1. **Frozen-spec-first**: the audit list was derived from the frozen authority set — `AGENTS.md`, `docs/handoff/WORKER-CONTRACT-V2.0.md`, `spec/mos-architecture-v2.0.md` §9/§11/§26/§27/§28/§30/§31, `spec/mos-architecture-lock-v2.0.md` (rules 5/8/9/13/14/25/29/33/37/38), `spec/mos-engine-policy-v2.0.yaml` (runner: defaultNetwork denied, databaseCredentials none, providerCredentials none, filesystem scoped-artifacts-only, resourceQuotasRequired, timeoutRequired, seedRequiredWhenSupported), `spec/mos-module-registry-v2.0.yaml` + dependency matrix + `docs/handoff/IMPLEMENTATION-STATE-V2.0.md`.
2. **Recovery audit of the first attempt's partial** (disclosed): the timed-out session left 35 modified files (+413/−124) and 9 untracked `w9b-adversarial-probes.test.ts` files, never committed. Every diff was re-derived attack-first ("what does a hostile caller get from this?") and audited against the specs; sound architecture was KEPT, real defects were fixed at the root with a pinning test each. Three defects were found in the partial itself (see §4 class D7).
3. **Attack-shaped probes, not feature tests**: each probe file shapes inputs the way a hostile caller or a future bug would (mutating caller-retained declarations after the authority took them; hostile id factories whose components collide under delimiter concatenation; NaN/poisoned numbers; `__proto__`-carrying payloads; forged lease tokens; unresolvable rights contexts) and asserts the authority holds — "no defect found" is itself a recorded finding (the held surfaces in §3).
4. **Fix discipline**: real defects only — root-cause fix + pinning regression probe + per-package disclosure. No speculative refactors, no new features, no frozen-file edits (spec-contradiction findings go to §6 for TL decision instead).
5. **Battery discipline**: ALL GREEN required three consecutive full runs (flaky = defect); per-package `tsc -b` + `tsc --noEmit` + compat typechecks + `node --test` + oxlint + boundary harness + `architecture:check`.

## 2. Defect classes found and FIXED (root cause + pinning test)

### D1 — Delimiter-injectable composite keys (the W3-A hostile-id-factory class)

**Root cause**: tenant-composite Map keys built as string concatenation with a delimiter (`::`, `:`, `|`, `\u0000`). Concatenation is not injective over string tuples: a hostile tenant id containing the delimiter aliases another tenant's key — cross-tenant record bleed, idempotency-index eviction, replay-ledger aliasing, version-chain corruption.

**Fix**: `JSON.stringify([tenantId, …])` array keys — injective over the tuple by construction (JSON escaping makes component boundaries unambiguous). No delimiter can blur.

**Surfaces fixed + pinned**:
- `mos-engines` assignment lane key (`::`) — probe: tenant id containing `::` cannot alias another tenant's assignment lane.
- `mos-jobs` `(tenant, jobId)` / `(tenant, jobKey)` / `(tenant, notificationId)` / `(tenant, dedupKey)` / `(tenant, recipient)` / `(tenant, receiptId)` keys (`:`) — probes: hostile tenant id cannot alias the honest tenant's job-key idempotency (a duplicate would otherwise execute TWICE), cannot read/claim another tenant's job history, notification dedup index, receipt lookup.
- `mos-lab` version-chain keys (`\u0000`) in dynamics, ensemble, world-model, corpus, transform-definition, transform-candidate, transform-graph, human-task, time-machine branch stores — probes: hostile write must NOT append into the honest tenant's chain (pre-fix it became version 2 of the honest chain / corrupted the honest latest).
- `mos-integrations` availability `byImplementation` index (`\u0000`) — probe: per-implementation listings stay exact per tenant.
- `mos-distribution` provider replay-ledger key (`|`) — probe: a hostile tuple colliding under the OLD key cannot replay another tenant's recorded provider answer (and the honest tenant's retry still replays its own).
- `mos-production` transform-source + pawn-organization registries (`\u0000`) — probes incl. the true collision shape (honest id CONTAINS the delimiter; hostile tenant id carries its prefix).

### D2 — Prefix-scan tenant listings (existence/bleed corollary of D1)

**Root cause**: `list*` implementations prefix-scanned the composite key space; a delimiter-laden tenant id widened another tenant's listing.

**Fix**: exact `tenantId` equality on the STORED record (never a prefix scan). Pinned in `mos-lab` (human tasks, transform definitions, transform candidates) and `mos-production` (pawn organizations, transform source).

### D3 — Shallow-freeze / caller-aliased records (the W5-A/W6-A/W8-A nested-mutation class)

**Root cause**: stores froze a SHALLOW spread of the caller's declaration — nested objects (role contracts, schemas, cost/latency models, policies, capability matrices, transport declarations) stayed aliased AND were frozen in place as a side effect. Mutating the caller's object after registration rewrote the STORED record bit-for-bit (append-only violation), and the authority mutated the caller's objects (ownership violation).

**Fix**: clone-then-deep-freeze (the W4-B/W8-A discipline): the store keeps a PRIVATE structural copy; the caller's objects are never aliased and never frozen in place. Pinned by bit-for-bit re-read + `Object.isFrozen` ownership assertions on both sides.

**Surfaces fixed + pinned**: `mos-engines` registered manifests + activation evidence (a mutable manifest is a sandbox-escape enabler — pre-flight policy reads it) and the runner's §30 observability records + RETURNED results (caller and adapter can no longer rewrite history after the fact); `mos-agents` body registry + organization registry (nested memoryPolicy/budgetPolicy/terminationPolicy); `mos-capabilities` registry (inputSchema/outputSchema/costModel/latencyModel); `mos-distribution` channel registry (capabilityMatrix), health surface (suspected-anomaly derivation), social pipeline §30 records, provider-operation records; `mos-integrations` provider definitions, implementations (incl. evidenceRefs on correction), merchant instances (incl. append-only rebind), availability records, §30 provider-interaction records; `mos-production` pawn bodies, pawn organizations, transform definitions (`registry-support.cloneThenFreezeRecord`).

### D4 — Caller-aliased `TenantScope` objects (post-hoc tenant-identity corruption, §31)

**Root cause**: stored records embedded the CALLER's live scope object by reference; mutating it after `instantiate`/`register`/`record` moved the STORED record's tenant identity in place — a post-hoc cross-tenant identity forgery.

**Fix**: the record owns a frozen COPY of the caller's scope. Pinned in `mos-agent-runtime` (`freezeInstance` — mutating the caller's scope cannot move the stored instance to another tenant; bind/release inherit the discipline), `mos-production` pawn instance registry (same pin through the full lifecycle incl. release), `mos-integrations` secret escrow handles, `mos-distribution` health observations.

### D5 — NaN/Infinity/negative reported resource usage defeats quota enforcement (engine sandbox)

**Root cause**: the post-flight quota comparison `usage > limit` is FALSE when usage is NaN — a rogue adapter reporting NaN usage sailed through `usageQuotaViolations` with quotas effectively unenforced.

**Fix**: `invalidReportedUsage` (finite, non-negative, all three dimensions) checked in post-flight validation BEFORE the quota comparison; violation fails closed as a typed `invalid-resource-usage` sandbox failure with the offending dimensions named. Pinned: NaN, `NEGATIVE_INFINITY`, and −1 all fail closed; output refs empty; `job-failed` emitted.

### D6 — Delimiter-join set comparison (validation-integrity aliasing)

**Root cause**: `mos-production` pawn-body validation compared the body's capability set against the role's served set by sorting and joining with `\u0000` — two DIFFERENT sets can produce IDENTICAL joins (e.g. `["cap_a", "cap_b\u0000cap_c"]` vs `["cap_a\u0000cap_b", "cap_c"]`), slipping a mismatched body past the agreement check.

**Fix**: element-wise comparison on the sorted arrays. Pinned: join-colliding sets are recognized as UNEQUAL; order-insensitive equality still holds (not over-strict).

### D7 — Defects in the recovered partial itself (fixed during recovery)

1. `packages/mos-production/src/w9b-adversarial-probes.test.ts(175)`: TS2345 — the transform-seed fixture's `costModel.basis` widened to `string`. Fixed at the ROOT with the frozen `CostBasis` vocabulary literal, const-asserted (`"per-invocation" as const`), no cast to an unrelated type.
2. `packages/mos-lab/src/adapters/w9b-adversarial-probes.test.ts`: two unused type imports (`TenantScope`, `Timestamp`) — oxlint 0/0 restored.
3. The production organization-listing probe was SEMANTICALLY WRONG: both organizations were registered under the SAME organizationId, so the asserted `undefined` cross-tenant reads were each tenant's OWN record (the code was correct; the probe's expectations were not). Rewritten into the true W3-A composite-key collision shape (honest id contains the delimiter; hostile tenant id carries its prefix) — the probe now pins both the chain-aliasing and the listing-bleed properties.

## 3. Surfaces audited and HELD (probe recorded as verified-held)

- **Engine runner sandbox posture** (`mos-engines`, existing W1-B/W3-B battery re-verified): network denied unless manifest AND explicit grant AND transport align (incl. ambient-fetch guard); explicit CPU/GPU/memory/time quotas with pre-flight adequacy vs the manifest; timeout enforcement with typed `engine-job-timeout`; seed policy (`seed-required` / `seed-not-supported`); manifest posture re-gated at execution time (unsandboxed / credential-injected manifests cannot run); malformed `EngineJob` shape fails closed; rogue adapter results rejected (wrong jobId, fabricated outputs). **Re-entrant adapters held by design**: per-run stateless `submit` + depth-counted fetch guard (verified by inspection of `fetch-guard.ts`; no shared run state to corrupt).
- **Engine runner adversarial shapes** (new probes, held): double-cast adapter identity (string engineVersion rejected at registration; string-version job fails closed as `unknown-engine` before any adapter lookup); `__proto__`-carrying job payloads never touch `Object.prototype`; a hostile throwing event sink surfaces as a REJECTED submit (observable), never a silent success.
- **Jobs lease/idempotency discipline** (W4-B core battery + new probes, held): claim grants a lease, second claimer loses; heartbeat renews, stale token / expired lease fail closed; lease expiry re-claims (crash recovery); forged lease token completion fails closed; repeated failures cap at `maxAttempts` → terminal dead-letter (no retry storm — pinned with a 10-iteration attack loop that stops at exactly 3 attempts); notification dedup idempotency and per-tenant receipt scoping; `__proto__`-carrying submissions never pollute and never propagate into reads.
- **Agent-runtime instance registry** (held): flat id map with exact tenant-equality reads — delimiter-laden tenant ids cannot alias; lifecycle records bit-for-bit immutable across bind/release.
- **Agents registries** (held): organization registry uses nested maps (organizationId → tenantId → version) with insertion-order keyed by exact tenant — hostile ids cannot bleed; body version chains append-only.
- **Capabilities registry** (held, scope note): the capability catalog is a GLOBAL versioned contract vocabulary (no per-tenant keying exists to attack — §10 shared vocabulary); ownership/immutability pinned.
- **Distribution rights/policy gate ordering** (new adversarial probe, held): an unresolvable rights context fails closed as `rights-gate-denied` with ZERO transport calls (the denial never reaches the provider), exactly ONE attributable failed §30 record, and no poisoned state (a follow-up with the REAL context completes and the transport answers exactly that one call).
- **Policy authority** (POLICY-001 battery, held): fail-closed `insufficient-policy`, verdict immutability, tenant scoping, determinism, authority discipline (63 dist + 6 compat tests).
- **Production gate ordering + no-second-runtime** (W7-B/W8-B pins, held): the rights gate PRECEDES every engine/agent invocation (zero engine submissions + empty engineInvocations + `execution-started → rights-evaluated → execution-failed` audit trail on denial); structural pins — banned model-selection/router vocabulary, exactly one `.bindModel(` call-site, modelRef file allowlist, exactly one `.execute(`/`.submit(` call-site, registry-exact imports, exact exported surface, port budgets ≤ 12. The new probe test files are `.test.ts` and thus outside the pin's scan set (verified).
- **Lab freeze discipline** (spot-pins, held): returned ensemble records are deep-frozen (nested member mutation throws); bit-for-bit stable under re-serialization.
- **Integrations append-only rebind** (held): prior instance versions stay bit-for-bit resolvable after a rebind; escrow handles are scope-owned.

## 4. Verification battery (three consecutive full runs — flaky = defect)

Run per package: `pnpm install --frozen-lockfile` (exit 0, ZERO lockfile delta); `tsc -b` exit 0 ×18 MOS packages + `rpc` prerequisite + mos-web testing composites; `tsc --noEmit` exit 0 ×16; compat typechecks exit 0 ×4 (agent-runtime, jobs, production, policy); `node --test` per package; oxlint 0 warnings 0 errors ×19 (incl. substrate); `node harness/mos-boundary-check.mjs` PASSED (626 source files, 17 domain packages, 4 rules); `pnpm run architecture:check` 0 violations.

Test counts (dist + compat per package): contracts 9 · identity 25 · rights 29 · content 22 · missions 8 · capabilities 11 (8 + 3 probes) · substrate 30 · engines 106 (94 + 12) · agents 25 (19 + 6) · agent-runtime 28 + 3 compat (23 + 5) · lab 346 (336 + 10) · jobs 108 + 2 compat (101 + 7) · integrations 76 (69 + 7) · distribution 192 (186 + 6) · production 100 + 10 compat (94 + 6) · policy 63 + 6 compat · studio 100 · web 126 — **1425 total = the 1363 main baseline + 62 W9-B probe tests, 0 fail**.

Three consecutive runs executed after the final commit (results recorded in the W9-B worklog entry; any flake would have been fixed and re-committed — none appeared).

## 5. Residual risks (no sugarcoating)

1. **The fixes live in the disclosed in-memory adapters/doubles.** Every D1–D6 fix targets `adapters/in-memory-*` implementations. The real durable stores (substrate wave: `DurableJobStorePort` real adapter, Zcode task-infra binding, durable registries) MUST replicate the injective-key + clone-then-freeze + NaN-guard discipline; the probes are written against the ports' public surfaces, so they port, but nothing forces a future adapter to pass them until the probes are re-pointed. **BRIDGE/PROD action**: carry the w9b probe batteries into every durable adapter's own test suite.
2. **`structuredClone`-per-registration is a runtime cost tradeoff** — acceptable for in-memory doubles; high-volume durable paths should measure before adopting blindly.
3. **Tenant-id grammar is unconstrained by the frozen specs.** No spec defines a tenant-id format, so NUL/`:|::`-laden ids remain representable and every new composite key must re-defend. A spec-level tenant-id grammar (Architecture Change Record) would collapse the whole D1/D2 class — TL decision (no contradiction found in the frozen specs; this is a gap, not a violation).
4. **`invalidReportedUsage` covers cpu/gpu/memory dimensions, not `cost.amount`.** A NaN cost would flow into §30 records; no runner-side enforcement compares cost today (no bypass exists), but a future cost-enforcing consumer must add its own finite-number guard. Recorded, deliberately not fixed (no consumer to pin).
5. **`__proto__`-carrying payloads are not deeply sanitized** — they may persist as inert own-properties on stored records (pinned: no `Object.prototype` pollution, no propagation into reads). A durable adapter with JSON round-trips behaves equivalently for own-properties, but exotic serialization layers should re-probe.
6. **Existence-leak probes assert value indistinguishability (undefined-vs-undefined), not timing/error-shape side channels** — out of scope for in-memory doubles; relevant only once real stores with observable latency exist.
7. **Scope boundary**: this sweep audited the 18-package set @ `a3fff49` only. The parallel W9-A (`worker-a/wave9` — LAB-017 benchmark surfaces) and W9-C (`worker-c/wave9` — STUDIO-009/012 reaction/video flows) branches were NOT in this tree; their new surfaces need the same probe discipline at harvest (or a Wave 10 mini-sweep). The W9-C money-sum defect class (dropped declared cost) suggests format-flow cost aggregation is a recurring hazard worth a probe.
8. **Probe files live beside the adapters they attack** (`src/adapters/w9b-adversarial-probes.test.ts` + one at `src/` in production) — they compile into `dist/` and run in the standard battery; they are evidence, not runtime surface (no exports added; `no-second-runtime` pin unaffected).

## 6. Spec-contradiction findings for TL decision

None. Every frozen requirement audited (§9 no-second-runtime, §11 sandbox posture, §26 durable semantics, §27 rights context on every step, §28 OSS replacement discipline, §30 observability completeness, §31 tenant scoping; lock rules 5/8/9/13/14/25/29/33/37/38; engine policy runner block) was satisfiable within `packages/mos-*/**` without touching frozen files. The tenant-id grammar gap (§5.3) is the only spec-level observation, and it is a gap rather than a contradiction.

## 7. BRIDGE/PROD recommendations

1. Port the nine w9b probe batteries to every durable substrate adapter as acceptance criteria (they attack PORT surfaces, not implementations).
2. Adopt a frozen tenant-id grammar via Architecture Change Record (then relax the defensive JSON-array keys only if the grammar provably excludes delimiters — recommend keeping them regardless: defense in depth is cheap).
3. Add the finite-number guard to any future cost-enforcing consumer before it trusts reported `cost.amount`.
4. Keep the no-second-runtime modelRef file-allowlist review discipline whenever new files touch model refs (the pin fails closed by design).
5. At harvest, TL should re-run this battery on merged main (the W9-A/W9-C merge will move the baseline to ~1425 + 57 sibling tests; the D1–D7 pins must stay green through the merge).
