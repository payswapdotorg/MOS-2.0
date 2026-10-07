# @mos/agents

MOS v2.0 agent body + agent organization registries — **AGT-001** and **AGT-003**
(Worker B, Agent/Engine/Production Backend lane). Authority: `agent-body-organization`
per `spec/mos-module-registry-v2.0.yaml` (deps: `[contracts, identity]`).

## What this package provides

### AGT-001 — AgentBody registry

- `AgentBodyRegistryPort` + `createInMemoryAgentBodyRegistry()`
- Bodies are the reusable MOS-owned role/tool/permission/memory contracts
  (architecture §5). A body record carries every frozen required field
  (`id, version, roleContract, inputContract, outputContract, tools,
  permissions, memory, communication, actionInterface, capabilities, budget,
  latency, evaluator, safety` — validated at registration against
  `@mos/contracts` `CONTRACT_REQUIRED_FIELDS`, the frozen YAML authority).
- **Immutable versioned bodies**: registering an existing id+version is an
  error; versions append monotonically; an edit is a NEW version and every
  old version stays resolvable (`get`/`require` by exact version).
- **Capability ref validation**: `capabilities` entries must resolve through
  the injected `CapabilityRefSource` (fail-closed unknowns). The port is
  declared in this package because the module registry does not allow an
  `@mos/capabilities` dependency; it is structurally satisfied by
  `@mos/capabilities`'s `CapabilityRegistryPort.getLatest`, so the
  composition root wires the real registry with no adapter shim.
- **Fail-closed unknowns**: `get`/`getLatest` return `undefined`,
  `require` throws `UnknownAgentBodyError`.

### AGT-003 — AgentOrganization registry

- `OrganizationRegistryPort` + `createInMemoryOrganizationRegistry()`
- Organizations are versioned, immutable, **tenant-scoped** graphs of agent
  bodies (architecture §5/§23; Studio loads an exact version explicitly).
  Every §23 search dimension is explicit record data — number of agents,
  roles, topology, delegation, communication, memory sharing, model
  assignment, budget, stopping conditions.
- **Typed edges**: `delegates-to | communicates-with | reports-to`
  (`ORGANIZATION_EDGE_KINDS`). Delegation is functional (one outgoing
  `delegates-to` per node) and acyclic; reporting is acyclic — so
  delegation chains are well-defined linear queries.
- **Model assignments are data, not selection**: `modelAssignments` carry
  per-node `ModelRef` records resolved ONLY at instance binding through the
  single model boundary in `@mos/agent-runtime` (AGT-002, lock rule 9).
- **Validation fails closed with EVERY named reason**
  (`InvalidAgentOrganizationError.reasons[]`, codes like `unknown-node-body`,
  `unknown-edge-endpoint`, `invalid-edge-kind`, `delegation-cycle`,
  `missing-model-assignment`, `budget-per-node-exceeds-organization`, ...):
  node body refs resolve, edge endpoints exist, no self edges, budgets are
  consistent (per-node ≤ organization on cost and duration), termination
  policy is sane.
- **Topology queries**: `neighbors(...)` (all edges touching a node) and
  `delegationChain(...)` (the linear `delegates-to` chain from a node), both
  versioned and fail-closed on unknown organization/node.
- **Tenant scope** (policy `requireTenantScopeOnMutableArtifacts`): records
  carry `tenantId`; registering/mutating operations take an explicit
  `TenantScope`; cross-tenant reads fail closed with no existence leaks.
- Records are frozen and JSON-serializable (§23: organizations are
  searchable objects — no hidden state).

## Design decisions (for Tech-Lead review)

- **Types come from `@mos/contracts`** (RECONCILE-B): no local contract-type
  duplicates in this package. `TenantId`/`TenantScope` are the contracts
  vocabulary (the CORE-001 canonical authority); `@mos/identity` is on the
  allowed dependency list but is not imported — W2-A reconciles identity to
  the contracts brands in the same wave, and importing identity's
  pre-reconciliation brands here would create NEW reconciliation debt.
- **Bodies are not tenant-scoped** (like capabilities — shared contract
  vocabulary); **organizations are** (user/Lab-supplied, mutable registries).
- Node `role` labels are required (explicit §23 search dimension) and extend
  the frozen `AgentOrganizationNode` shape; `OrganizationMemoryPolicy`
  extends the contracts `MemoryPolicy` with the §23 sharing mode
  (`shared | isolated | hybrid`) — both remain assignable to the frozen
  contract field types.
- Organizations require FULL per-node model assignment coverage
  (`missing-model-assignment` otherwise): an organization is a complete,
  explicit unit; nodes without assignments would push model selection
  outside the recorded contract.

## Disclosed limitations

- The in-memory adapters are ephemeral scaffolds; durable persistence and
  the composition root (wiring `@mos/capabilities` as the capability
  source) are Tech-Lead owned later waves.
- Body semantic validation is structural; deeper JSON-Schema validation of
  `inputContract`/`outputContract`/`actionInterface` contents is future work.
- No public seed catalog: example bodies live in the test suite only
  (architecture §9 pawn names are the vocabulary source).

## Scripts

`pnpm --filter @mos/agents build | test | lint | typecheck`
