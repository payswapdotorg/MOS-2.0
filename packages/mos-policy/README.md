# @mos/policy — Policy Authority (MOS v2.0, POLICY-001)

The **policy authority** of MOS v2.0 (registry: `packages/mos-policy`, owner
worker-a, authority `policy`, dependencies exactly `[contracts, identity]`).

Policy sits on the real boundary chain (spec §2/§24):
`Lab candidate → Mission → Policy/Rights/Assets → Production/Studio →
Distribution/Integration → …`. The canonical `PolicyRef` vocabulary it owns is
already carried by the frozen core contracts (`Transform.policyRequirements`,
`RealExperimentBinding.policyRef`) — this package is the authority those
references resolve through.

## What this package owns

- **`PolicyRule`** — versioned, tenant-scoped, APPEND-ONLY policy rules:
  - `id` (`PolicyRuleId`, an alias of the canonical `PolicyRef` brand — the
    stable identity across the version chain), `version` (v1 on registration,
    v+1 per revision; prior versions stay bit-for-bit and resolvable);
  - a **declared scope** over the CLOSED action-kind vocabulary aligned with
    the boundary chain: `production-request-approval`, `distribution`,
    `experiment-launch`, `transform-application`, `engine-invocation`,
    `human-task-fulfillment` (+ optional subject/actor narrowing);
  - **structured typed constraint declarations** — data, never free text:
    `action-kind-allowlist` / `action-kind-denylist` (compound actions),
    `budget-ceiling` (currency + maximum), `deadline-floor` (minimum lead ms),
    `modality-restriction` (allowed modalities of the frozen
    text/audio/image/video vocabulary). An unstructurable constraint is
    rejected at registration;
  - an **effect** — `allow` / `deny` / `require-approval` (the approver role
    is required exactly when the effect is require-approval);
  - a **named rationale** (audit) and **provenance** (creating authority,
    acting principal, registeredAt, supersedes).
- **`PolicyEvaluationPort`** (3 methods ≤ 12) — `evaluate(policy refs, action
  descriptor)` → ONE immutable append-only **`PolicyEvaluationRecord`** with
  the full §30-style context (which rules were consulted, which matched —
  scope-match facets —, per-constraint outcomes, timing), whose verdict is:
  - `allowed` (citing the rule whose allow effect permitted the action);
  - `denied` — naming the RULE and, when constraint-driven, the exact
    CONSTRAINT declaration that denied it (effect-driven denials cite the
    rule's own deny effect + rationale);
  - `approval-required` (naming the approver role that must approve);
  - `insufficient-policy` — **FAIL CLOSED**: no cited rule matched the
    action. Never a silent allow; there is no permissive default.
- **`PolicyRegistryPort`** (5 methods ≤ 12) — the standard MOS registry
  discipline (the W5-A/W6-A pattern): `register` mints v1 and fails
  closed with `duplicate-policy-rule` when the id already exists in the
  tenant (an accidental re-registration never silently appends);
  `revise` appends v+1 to a known in-tenant id (full re-validation) and
  fails closed with `policy-rule-not-found` otherwise (unknown ≡
  cross-tenant); exact-version get, list-latest / list-versions by
  scope, tenant-scoped reads where cross-tenant ≡ unknown (**no
  existence leaks**), stored records deep-frozen and caller input cloned
  (never frozen in place — including the caller's `scope` object).

## Evaluation semantics (documented, test-pinned)

Deterministic precedence among matched rules ("first" = the citation order of
the request's policy refs — the caller controls consultation order):

1. a matched **deny-effect** rule whose constraints are all satisfied denies
   (explicit prohibition is the strongest signal);
2. otherwise any matched rule with a **violated constraint** denies citing
   (rule, constraint) — bounds are bounds. Missing context data (no declared
   spend / deadline / modalities) is a violation, never a silent pass;
3. otherwise a matched **require-approval** rule yields approval-required
   naming the approver role;
4. otherwise the action is **allowed** citing the first matched allow rule;
5. no matched rule at all → **insufficient-policy** (fail closed).

Caller errors (malformed request, unresolvable exact-version citation —
unknown or cross-tenant ≡ unknown) are typed `PolicyError`s thrown at the
boundary that append **no** audit record (nothing attributable happened).

## Authority discipline (test-pinned)

- **Policy NEVER decides rights** (§505: policy ≠ rights): no rights
  vocabulary exists in this package — no grant/consent types, no rights
  evaluation, no rights verdict semantics. A policy verdict is orthogonal to
  a rights verdict (and to a quality verdict, §19).
- **Policy never originates actions**: the public surfaces are exactly
  register/get/list and evaluate/get/list — there is structurally no
  submit/execute/invoke surface; the action descriptor is caller-declared
  data the authority vets against declared rules.
- **No sibling-domain implementation imports**: `src/**` imports ONLY
  relative paths, `@mos/contracts`, `@mos/identity` and node builtins
  (registry-exact). The boundary-chain action-kind vocabulary is DATA (the
  frozen const), never an import of the engines/missions/studio/…
  implementations.

## The W6-C distribution PolicyGatePort seam (zero-drift mirror)

`@mos/distribution` declared a fail-closed `PolicyGatePort` seam in W6-C
(frozen contract shape; disclosed in-memory double until the policy authority
exists). This package satisfies that seam:

- `src/testing/distribution-policy-gate.ts` — the composition-seam adapter
  over the **mirrored** frozen shape (`DistributionPolicyCheckRequest` /
  `DistributionPolicyVerdict` / `DistributionPolicyGatePort`). Distribution
  is not a registry dependency of policy, so the shape is mirrored and pinned
  **mutually assignable** against the REAL distribution port at compile time
  (`compat/distribution-policy-gate-compat.ts`, relative TYPE-ONLY imports —
  no runtime dependency edge) — zero drift is compiler-enforced on every
  build. The runtime half (`compat/distribution-policy-gate.test.ts`) wires
  the gate into the REAL distribution pipeline and proves every verdict class
  end-to-end (permitted publish reaching the transport with the canonical
  PolicyRef cited; deny/constraint/approval/insufficient denials with the
  authority's reasons verbatim and the transport NEVER reached).
- Verdict mapping (documented): `allowed` → permitted; `denied` → denied with
  the attribution detail verbatim; `approval-required` → denied naming the
  role (the seam has no pending state); `insufficient-policy` → denied
  `insufficient-policy` (the fail-closed twin of the W6-C double's
  `no-matching-policy`); evaluation errors → denied `policy-evaluation-error`
  (the gate is TOTAL — never throws into the pipeline, never permits on
  error).
- Default policy resolution: the tenant's LATEST distribution-scoped rules in
  registration order (the composition seam's binding decision — the real
  composition root may inject any exact-version ref set).
- **The real composition-root wiring is TL-later work.**

## Surface

| Surface | Kind | Notes |
| --- | --- | --- |
| `POLICY_ACTION_KINDS` / `POLICY_MODALITIES` | const | frozen closed vocabularies |
| `PolicyRule`, `PolicyScope`, constraint union, effect, provenance, registration input | type | contracts |
| `PolicyActionDescriptor`, evaluation request, consultations, verdict, evaluation record | type | contracts |
| `PolicyRegistryPort` (5), `PolicyEvaluationPort` (3) | type | ports ≤ 12 methods |
| `createInMemoryPolicyRegistry`, `createInMemoryPolicyEvaluation` | factory | disclosed in-memory doubles |
| `PolicyError` + closed code vocabulary | class | typed boundary errors |
| `src/testing/compose-policy-stack.ts`, `src/testing/distribution-policy-gate.ts` | composition seam | not exported from the index (import-site seams; W5-C/W6-C precedent) |
| `compat/distribution-policy-gate-compat.ts` + `.test.ts` | compat | zero-drift pins + the REAL-pipeline runtime half |

## Disclosed limits

- The in-memory registry/evaluation adapters are **disclosed deterministic
  doubles** (ephemeral, process-local; no durability claim) — durable stores
  are TL-owned later work behind the same ports.
- The REAL W6-C pipeline's §30 distribution record carries `policyRef`
  `null` on the policy-gate-denied path (its record cites PERMITTING rules;
  the denial attribution rides verbatim in `failure.details.denialReason`) —
  pinned as-is in the compat battery; a possible distribution follow-up is
  citing the denying rule's ref there too (TL decision, frozen sibling
  source untouched by this wave).
- The distribution-gate default resolution binds "latest rules governing
  distribution" — a composition-seam decision, not a production policy
  binding; the real composition root injects the exact-version ref set.
- The gate's modality context is derived from DECLARED presentation/artifact
  types by a documented coarse mapping (never content inference); the W6-C
  seam carries no spend/deadline context, so matched budget/deadline
  constraints fail closed there (disclosed).
- `tsc -p tsconfig.compat.json` requires the sibling dists
  (contracts/identity/rights/content/capabilities/integrations/distribution)
  to be built — the package `test` script does this (the W7-B precedent).

## Verification

```
pnpm --filter @mos/policy test     # tsc -b + node --test dist + compat battery
pnpm --filter @mos/policy lint     # oxlint (0/0)
node harness/mos-boundary-check.mjs
pnpm run architecture:check
```
