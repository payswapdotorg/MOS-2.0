# @mos/agent-runtime

MOS v2.0 agent instance runtime — **AGT-002** (Worker B,
Agent/Engine/Production Backend lane). Authority: `agent-runtime` per
`spec/mos-module-registry-v2.0.yaml` (deps: `[contracts, agents,
zcode-substrate-adapters]`).

## What this package provides

### AgentInstance lifecycle

- `AgentInstanceRegistry` port + `createInMemoryAgentInstanceRegistry()`
  (requires a `@mos/agents` `AgentBodyRegistryPort` AND a
  `ModelRuntimePort` — without the boundary there is no path to a bound
  instance: constructing the registry without one fails closed with
  `missing-model-boundary`).
- `instantiate → bind → release` over frozen, immutable record snapshots
  (`AgentInstanceRecord`): instantiate resolves the body version fail-closed
  and defaults tool/capability bindings to the body's declarations (explicit
  bindings must be subsets of them); bind records a port-issued
  `ModelBinding`; release is terminal and retains the last binding.
- Tenant-scoped mutable runtime state (policy
  `requireTenantScopeOnMutableArtifacts`): records carry their creating
  `TenantScope`; cross-tenant access fails closed with no existence leaks.
- A bound record carries every frozen `AgentInstance` required field
  (`bodyVersion, modelRef, runtimeRef, toolRefs, capabilityRefs` — pinned
  against `@mos/contracts` `CONTRACT_REQUIRED_FIELDS`).

### THE SINGLE MODEL/RUNTIME BOUNDARY (`ModelRuntimePort`)

Architecture lock rule 9: *no second model router; model selection stays
behind a single model-runtime boundary.* This port IS that boundary:

- `bindModel(request)` is the ONLY model-selection surface in the agent
  stack. A caller's `requestedModelRef` is a **preference** the port may
  honor or override — it can never force a selection (unknown refs fail
  closed with `unknown-model`, never bypass the catalog; no request and no
  configured default fails closed with `no-model-requested`).
- **Interchangeable models**: the same body binds different `modelRef`s
  through the port — swap the request, get another instance of the same
  body; re-binding an instance swaps its model, still via the port.
- The boundary is pinned **structurally**, not just by convention
  (`src/single-model-boundary.test.ts`): a vocabulary ban
  (no `selectModel`/`modelRouter`/`router`/… in any non-test source), the
  single `.bindModel(` call-site pin, the `modelRef` token file-set pin,
  the exact exported-runtime-surface pin, and the no-boundary construction
  guard.

### Execution through the substrate (`InstanceExecutorPort`)

- `createSubstrateInstanceExecutor(substratePort)` drives the substrate
  `AgentRuntimePort` (start → execute → stop) for a bound instance. The
  instance's port-issued `modelRef` is **passed through** into the substrate
  spec (`agentBodyRef: "<bodyId>@<bodyVersion>"`) — the executor performs
  NO model selection.
- Fail-closed typed failures: `instance-not-bound`, `invalid-execution-input`,
  and every substrate failure (start/execute/stop) surfaces as
  `substrate-execution-failed` (phase-named, original message preserved);
  after an execute failure the runtime is still stopped best-effort.

## The substrate port mirror (disclosed design decision)

`src/types/substrate-agent-runtime.ts` is a field-for-field **pinned mirror**
of `@mos/substrate-adapters`' `AgentRuntimePort`. The substrate adapters
package is a typecheck-only SOURCE package (its `exports` map points at
`./src/index.ts`, sources import each other with `.ts` specifiers under
`allowImportingTsExtensions`), so an emitting `moduleResolution: nodenext`
consumer — which this package must be (`tsc -b` → `dist/` for
`node --test`) — cannot compile its sources (TS5097 on every internal
`.ts` import; empirically verified during W2-B). Two compatibility pins
close the gap:

- `compat/substrate-port-compat.ts` (compiled by `tsconfig.compat.json`,
  part of the `test` script) asserts the mirror and the REAL
  `@mos/substrate-adapters` port surface are **mutually assignable** — any
  drift on either side fails the build.
- `compat/substrate-skeleton.test.ts` runs the REAL package (via Node's
  native type-stripping loader) against the built executor: the disclosed
  W0-B `UnboundAgentRuntimeAdapter` skeleton fails closed on construction
  and prototype bypass with `SubstrateAdapterNotBoundError` naming the
  AGT-002 binding, and that real error class surfaces typed through the
  executor's `substrate-execution-failed` path.

`@mos/substrate-adapters` remains a declared dependency (used by `compat/`);
the emitting `src/` surface intentionally stays on the pinned mirror.

## Disclosed limitations

- **The real Zcode AgentRuntime binding is FUTURE WORK** (deep zcode-cli
  integration): the W0-B substrate adapter is a disclosed skeleton that
  throws `SubstrateAdapterNotBoundError`. Until it is bound, tests drive
  execution through the DISCLOSED in-memory double
  (`createInMemoryAgentRuntimeSubstrateDouble`) implementing the same
  port. Never represent the double as a working Zcode runtime.
- The in-memory instance registry and model runtime are ephemeral
  scaffolds; durable model catalogs, provider configuration and the
  composition root are later-wave work.
- Records are immutable snapshots: a caller holding an older bound record
  can still execute it after `release` (the registry rejects re-binds, but
  the executor is stateless over record snapshots by design).
- Shipping declaration output from `@mos/substrate-adapters` (so consumers
  could import it directly instead of a pinned mirror) is a Tech-Lead
  decision outside this wave's ownership.

## Scripts

`pnpm --filter @mos/agent-runtime build | test | lint | typecheck`

The `test` script = build + `node --test dist/**` + compat typecheck +
compat skeleton test (23 + 3 tests).
