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

---

## 8. Wave 9 surface sweep addendum (W10-B)

- **Task**: W10-B — adversarial probe sweep over the Wave 9 surfaces (second attempt — recovery over the first attempt's uncommitted 17-file partial)
- **Branch**: `worker-b/wave10` (base `d171c84`, the Wave 9 TL acceptance commit)
- **Swept surfaces**: the W9-A LAB-017 robust marketing benchmark (`mos-lab`) + the W9-C STUDIO-009/012 reaction/video format flows and the stores/registries they run through (`mos-studio`)
- **Date**: 2026-06 (session W10-B/2)
- **Status**: COMPLETE — this section closes §5.7 (the residual risk that W9-A/W9-C branches were outside the W9-B audited tree).

### 8.1 Methodology recap

Same discipline as §1, applied to the two Wave 9 branches after their merge: frozen-spec-first reading (architecture §6/§12/§15/§16/§22/§24/§27/§30/§31, lock rules, core-contracts YAML), recovery audit of the first attempt's partial file-by-file, attack-shaped probes (caller-aliased declaration objects mutated after the authority took them, hostile delimiter-laden ids, NaN/±Infinity/negative numeric shapes, hostile money, consent-handle smuggling, plugin-mutation-after-flow-creation), root-cause fixes with a pinning probe each, held surfaces recorded WITH their probes. Scope stayed inside `packages/mos-lab/**` + `packages/mos-studio/**` (zero lockfile delta, zero @zcode/*, no frozen files touched).

### 8.2 Defects found and FIXED (root cause + pinning probe)

All three defect classes below were found by the probes against the W9-C/W2-C-era sources; the fixes were authored in the recovered partial and verified root-sound in this session (see §8.4 for the one defect found IN the partial).

**W10-F1 — Caller-aliased studio declarations (the W9-B D3 class over the studio surfaces).**
Root cause: the `FormatRegistry` stored the caller's plugin object by reference; the three flow drivers read `deps.formatPlugin` LIVE at run time; the editing-graph store recorded caller-aliased choice/operation objects (and shallow-froze them in place — the W4-B/W8-A nested-mutation shape); the script-graph store's shallow-copy-then-deep-freeze froze the CALLER's nested node provenance in place while aliasing it into the stored graph; the runtime pushed the caller's `additionalCost` object by reference into session cost lines. Exploit shapes: post-registration plugin mutation rewrites the declared requirements every future session runs under; post-flow-creation mutation re-brands or weakens the format gates mid-flight; post-record mutation rewrites the append-only ORG decision chain; post-submission cost mutation rewrites the packaged total (post-hoc cost forgery — pinned end-to-end: caller mutates `{ amount: "1.25" }` to `"0.01"` after `completeProcessing`, packaged total stays `"1.25"`).
Fix: clone-then-deep-freeze everywhere — new `runtime/ownership-support.ts` (`deepFreezeValue`, `cloneThenFreezeValue`, and the FUNCTION-AWARE `cloneThenFreezeFormatPlugin`: `structuredClone` throws on functions, so plugins are structurally cloned with `validateSessionInput` kept by reference); the registry and all three flows keep PRIVATE frozen clones; the built-in format factories now return deeply frozen plugins; the runtime stores a frozen copy of each declared cost line. Pinning probes: `w10b-adversarial-probes.test.ts` (weakened video gates still reject audio-only plans before any session exists; re-branded reaction id cannot re-brand a run; stored declarations bit-for-bit; caller objects never frozen in place; duplicate id@version still collides on the declared key, not object identity).

**W10-F2 — Hostile money flowed silently (the W9-C dropped-cost class + the W9-B §5.4 residual, studio side).**
Root cause: `sumStudioMoney` had NO input validation — `"-5.00"` summed silently (negative cost lines in packaged output); `"0.5.5"` silently truncated to `0.5` (the split-then-BigInt path drops the second fraction); `"abc"`/`"1e3"` crashed untyped deep inside BigInt parsing AFTER capture/editing had already run; `a.currency ?? b.currency` silently took the first currency on mismatch (currency confusion); and NO gate validated the declared `processingCost` or the runtime's `additionalCost` anywhere — a hostile declared cost entered the package total unvalidated.
Fix: fail-closed `validateStudioMoneyAmount` (non-negative plain decimal string, non-blank currency) at EVERY intake — all three flow gates reject `invalid-processing-cost` TYPED before ANY session exists (including the audio flow's own recorder path); the runtime's `completeProcessing` intake rejects hostile `additionalCost` + non-finite/negative `processingSeconds` as typed `invalid-processing-output` with reasons (session state stays unpoisoned — a valid completion still succeeds after rejections); second cost lines in a foreign currency are rejected (costs never mix currencies; same-currency second lines still accepted through the treatment branch — not over-strict); `sumStudioMoney` itself gains the NAMED `InvalidStudioMoneyError` defense-in-depth (never a silent mis-sum, never a deep untyped crash). Pinning probes: `w10b-money-probes.test.ts` (10 probes incl. the honest-declared-cost-still-lands pins on all three flows — the anti-over-strictness discipline).

**W10-F3 — Non-cloneable interchange payloads crashed the import untyped.**
Root cause: the W8-C edit-graph import assumed pure data; a hostile interchange record carrying a function (or any non-cloneable value) escaped the typed error surface as a raw `structuredClone` throw.
Fix: the import fails closed as the typed `edit-graph-import-invalid` with an enumerated reason ("edit graphs are pure data (§12)"); the pure-data counterpart still imports. Pinned in `w10b-adversarial-probes.test.ts`.

### 8.3 Surfaces audited and HELD (probe recorded as verified-held)

- **LAB-017 composite-key injectivity (D1/D2)**: hostile delimiter-laden tenant ids (`\u0000`, `::`, `:`, `|`, quote, `__proto__`, embedded space) and benchmark ids cannot alias another tenant's/benchmark's record chains — reads, listings, latest-resolution and integrity verification see nothing; hostile runs fail closed on the unknown-ensemble wall (no write path either); hostile benchmark ids get their OWN chains at version 1 with distinct digests. The W9-A JSON-array keys held as designed.
- **LAB-017 caller-aliased inputs (D3/D4)**: records are digest-stable bit-for-bit under post-submission mutation of the caller's candidates/policy/seeds/rewardSpec/worldModelSet; the caller's scope object forged after the run moves nothing; the caller's objects are never frozen in place.
- **LAB-017 numeric integrity (D5)**: NaN/±Infinity/fractional/negative seed budgets, policy versions, world refs, candidate knobs/horizons/producer pins, and scenario lag all fail closed TYPED (`seed-budget-mismatch` / `invalid-input` / `invalid-candidate`) with NOTHING recorded; successful records carry finite bench-additive-v1 interval math end-to-end (no NaN poisoning).
- **LAB-017 no-op baseline + fairness + calibration**: empty declared candidate sets still run the always-present synthesized baseline alone; a caller claiming the reserved `no-op-baseline` identity fails closed (`caller-claimed-noop-baseline`, nothing appended); the (world, seed) evaluation grid is IDENTICAL across hostile candidate-set variations (spy-pinned at the ensemble port); the LAB-018-bound `pending-reality` calibration declaration is present, immutable and digest-sealed on every record.
- **§15 consent/session scoping (studio, REAL rights authority)**: cross-session consent handles smuggled into a join cover nothing (session-subject exact binding); consent never crosses tenants and never pools across participants; hostile consent SUBJECT shapes (suffixed session subjects, bare session ids) match no session; end-to-end, a foreign-session consent ref fails the reaction flow at the join gate (`consent-required-for-join` / `missing-consent-refs`) with nothing packaged.
- **§16 entry-intermediate discipline**: synthetic reactor personas without a named generating capability remain typed failures (nothing packaged) — the W9-C gate held.
- **Format-gate integrity (re-pins of the W9-C battery under the new ownership regime)**: audio-only video-podcast plans rejected BEFORE any session exists (re-pinned both through the honest plugin and through a HOSTILELY MUTATED caller plugin — the frozen-private-clone discipline is what makes the second shape pass); plugin-without-mandatory-video, representation and the triple §6 source-rights gates remain green in the W9-C battery (110 tests, all passing on rebuild).

### 8.4 Recovery audit of the first attempt's partial (disclosed)

The 17-file partial (13 modified studio files + 4 new files incl. the three probe batteries) was audited file-by-file against the frozen specs: the source hardening (W10-F1/F2/F3) and the probe batteries were SOUND and are KEPT as-authored. TWO defects were found in the partial itself (the W9-B D7 class): (1) `packages/mos-lab/src/adapters/w10b-probes.test.ts(239)` — TS2532 `Object is possibly 'undefined'` under `noUncheckedIndexedAccess` (`candidates[0].action` → `candidates[0]!.action`); root cause: the first attempt verified coherence with `tsc -b packages/mos-studio` only and never built `packages/mos-lab` — the probe test was the wrong shape, not the source. (2) The same file imported the type `MarketingBenchmarkInput` without using it (the exact W9-B D7.2 shape — oxlint 0/0 restored by removing it). Both fixed in the probe; no partial file discarded.

### 8.5 Audio-podcast edit-graph recorder migration assessment (the W9-C follow-up)

**Classification: a DECLARED FLAG with bounded, probe-pinned drift — not an uncontrolled hazard.** W9-C disclosed the follow-up explicitly ("its own recorder still stands — no drift introduced"); W10-C is migrating the recorder onto the W8-C editing surface in parallel. What this sweep establishes for the TL's harvest reconciliation:

1. **The seams where the two composition paths could silently diverge are now SHARED and PINNED.** All three flows (the audio flow's own recorder path included) sum costs through ONE `sumStudioMoney` with the same fail-closed validation (pinned: hostile declared costs fail typed before any session on the audio path too; the honest declared cost still lands in the packaged total — the W9-C defect class re-pinned on the recorder path); all three keep PRIVATE frozen plugin clones; all three pass through the same `validateProcessingOutput` intake (money + duration integrity); and the packaged `editGraphRef` contract shape is identical.
2. **The un-shared remainder is precisely scoped.** The audio flow records a conversation-node-scoped `PodcastEditGraph` (org decisions over interview conversation nodes, kinds keep/trim/cut/reorder, version minted from the plan's `ContractVersion` input) instead of routing composition through the W8-C `EditingCompositionPort` (artifact-scoped choices + engine-executed operations, append-only store chain, §12 interchange seal, §30 event trail through the engines runner). No engine jobs run at audio composition today — the drift is capability/observability, not integrity.
3. **W10-C migration reconciliation checklist** (what the TL should verify at harvest, all W10-B-pinned — a regression in any of these fails this wave's probes on W10-C's branch): (a) the shared money sum + fail-closed validation must survive; (b) the frozen-private plugin reads must be kept; (c) the keep/trim/cut/reorder vocabulary must map onto the W8-C edit-kind vocabulary through DECLARED DATA alignment (the §5 transform-kind pattern), never a silent drop, and `conversation-node-not-found` validation must find an equivalent or remain a podcast-side pre-validation; (d) the `otioInterchange` flag semantics must stay consistent (the W8-C §12 interchange export is the sealed path); (e) the packaged `editGraphRef` must keep resolving through the same contract shape.
4. **If the migration does not land this wave**: the flag stays declared and probe-pinned — safe to hold; keep it on the follow-up list.

### 8.6 Updated residual risks

1. **Same carrier as §5.1**: the W10-B fixes live in the studio runtime + in-memory adapters; durable stores and the TL composition-root must replicate the clone-then-freeze + money fail-closed discipline. BRIDGE/PROD action: carry the w10b probe batteries (adversarial + money) into every durable adapter's test suite alongside the w9b batteries.
2. **The engine-side §5.4 residual is UNCHANGED and now half-scoped**: `validateStudioMoneyAmount` guards the STUDIO money surfaces end-to-end (this wave); engine runner §30 records still carry unguarded `cost.amount` — no consumer compares it today, so no bypass exists, but the future cost-enforcing consumer must add its own finite-number guard (unchanged recommendation).
3. **`cloneThenFreezeFormatPlugin` keeps `validateSessionInput` by reference** — a registrant whose validator closes over mutable external state can still vary validation behavior. The frozen declaration DATA cannot move, but the function's closure remains the registrant's own responsibility (the plugin contract makes the validator the registrant's own — documented in `ownership-support.ts`). Registry duplication keys on declared `id@version`, never object identity, so a swapped-validator re-registration still collides.
4. **Session currency discipline is single-session scoped**: the intake rejects cost lines that MIX currencies within one session; a session whose first line is EUR simply records EUR (no cross-session or plan-level currency contract exists to violate — a declared gap, not a defect).
5. **`__proto__` inert persistence (§5.5) and existence-leak side channels (§5.6)** — unchanged; studio stores inherit the same posture.
6. **Probe files are evidence, not runtime surface** (§5.8): the three w10b batteries compile into `dist/` and run in the standard battery; no exports added; the studio `no-second-runtime` pins are unaffected.

### 8.7 Verification (W10-B)

`pnpm --filter @mos/studio test` → 145/145 (121 baseline + 24 probes: 14 adversarial + 10 money), 0 fail. `pnpm --filter @mos/lab test` → 387/387 in-package (378 baseline + 9 probes) + 4/4 compat, 0 fail. Full-battery results (all 18 packages + boundary + architecture:check) are recorded in the W10-B worklog entry and report; the merged-battery expectation is 1482 baseline + 33 probes = 1515, 0 fail. Zero lockfile delta; zero `@zcode/*`; scope exactly `packages/mos-lab/**` + `packages/mos-studio/**` + this document.
