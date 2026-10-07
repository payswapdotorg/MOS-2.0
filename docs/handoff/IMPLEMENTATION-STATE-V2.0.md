# MOS v2.0 Implementation State

Repository: payswapdotorg/MOS-2.0
Architecture: 2.0 FROZEN
Status: bootstrap architecture only; application implementation has not yet started under MOS v2.0.

## Verified substrate baseline

- ZCode-derived main commit observed: 29628c9acdb81b703bbd4080c207a0e7ce5e276e
- ZCode version: 3.14.3
- Existing root architecture-policy.yaml is ZCode's legacy managed-module policy and is not MOS v2.0 topology authority.
- New MOS topology authority is spec/mos-architecture-policy-v2.0.yaml and the paired module registry.

## MOS v2.0

☑ BOOT-001 (TL-verified 2026-10-07: substrate inventory committed at cac7987 — verified fork baseline 29628c9 / ZCode 3.14.3; all nine inventory source paths confirmed present in fork; keep/adapt/legacy classification with substrate firewall rules; no MOS business authority assigned to ZCode service code. Residual note: packages/{formal-proof,model-option-map,provider,provider-node,zcode-cua,zcode-server-cli} are not individually enumerated — classified under existing adapt/contain rows; to be re-verified at BOOT-003 boundary-test time.)
☑ BOOT-002 (TL-verified 2026-10-07: all governance deliverables present and machine-readable in-repo — manifests/spec yaml+json parse clean; module registry + architecture policy + worker contract + acceptance gates + source-of-truth rules all committed at cac7987. Workers were dispatched with repository-only context and required no external/chat context, satisfying the BOOT-002 acceptance criterion.)
☑ BOOT-003 (TL-verified 2026-10-07 @ merge 173a87e: packages/zcode-substrate-adapters with six narrow ports + working object-storage adapter + rpc facade + disclosed AGT-001..003 skeletons; harness/mos-boundary-check.mjs enforces 4 rules — self-test 12/12 fixtures, real-tree scan clean across mos-identity/mos-studio/zcode-substrate-adapters; 30/30 node:test; tsc+oxlint green. Prerequisite: build @zcode/rpc dist once (gitignored) before typechecking the adapters package.)
☑ STUDIO-001 interface spike + UX substrate audit (TL-verified 2026-10-07 @ merge 173a87e: packages/mos-studio types-only spike matching core-contracts-v2.0.yaml required fields; docs/architecture/UX-SUBSTRATE-AUDIT-v1.md with cited file paths; tsc+oxlint green. STUDIO-001 full runtime remains ☐ in Wave 1.)

☑ CORE-001 (TL-verified 2026-10-07 @ merge 0868fa3: packages/mos-contracts — full TypeScript projection of all 25 frozen contracts, 3-layer validation: satisfies-keyof const + compile-time type tests + vendored YAML-derived JSON fixture cross-check; 9/9 tests)
☑ CORE-002 (packages/mos-identity — domain types + repository port + in-memory adapter; 25/25 tests, tenant isolation + append-only revocation verified @ f3e8004; import reconciliation to @mos/contracts tracked in Wave 2 RECONCILE)
☑ CORE-003 (packages/mos-rights — grants/consent/provenance, append-only revocation, URL-never-implies-rights test-pinned; 29/29 tests)
☑ CORE-004 (packages/mos-content — immutable versioned artifacts + lineage graph + rights gate + in-package storage port; 22/22 tests)
☑ CORE-005 (packages/mos-missions — structured objectives + versioned mission-specific reward specs + lifecycle; 8/8 tests)
☑ AGT-001 (packages/mos-agents — AgentBody 14-field frozen-contract-pinned registry, immutable versions, capability ref validation)
☑ AGT-002 (packages/mos-agent-runtime — AgentInstance lifecycle + ModelRuntimePort as THE single model boundary; no-second-router structurally pinned by six tests; InstanceExecutorPort over substrate AgentRuntimePort with disclosed double; real ZCode binding = future)
☑ AGT-003 (packages/mos-agents — AgentOrganization versioned immutable registry, typed delegation edges, budget/memory/termination policies, 19 named validation rejections)
☑ CAP-001 (packages/mos-capabilities — registry port + in-memory adapter, version history preserved, fail-closed unknowns, §5 seed fixtures; 8/8 tests)
☑ ENG-001 (packages/mos-engines — fail-closed 9-item activation evidence gate, deterministic policy tie-break with one-dimension tests, tenant overrides, silent-replacement forbidden, historical resolvability + rollback)
☑ ENG-002 (EngineAdapter invoke contract EngineJob→EngineResult + disclosed test double)
☐ ENG-003..005 (Wave 3 — runner sandbox, golden benchmark, replacement proof)

☑ LAB-001 (corpus runtime: rights-gated ingestion, append-only CorpusVersion snapshots, tenant-scoped queries; 29 tests in mos-lab)
☑ LAB-002 (FeatureBundle registry + FeatureComputationPort requirement declaration)
☑ LAB-003 (Idea Graph: derivation-mandatory nodes, typed weighted versioned edges, chain tracing)
☐ LAB-004..018 (Wave 3: LAB-004..006)

☑ STUDIO-001 (runtime: session lifecycle, multi-account consent gates, treatment version chains, no-publish asserted 4 ways; 32/32 tests incl. 002+005)
☑ STUDIO-002 (pluggable format framework + three initial format descriptors; reaction exposes §16 org decision points, no hard-coded layout)
☑ STUDIO-005 (capture ports + disclosed in-memory double)
☑ STUDIO-003 (intent → versioned script/question graphs with §14 synthetic provenance + deterministic adaptive sequencer + InterviewerAgentPort)
☐ STUDIO-004 (Wave 3 — deps now all satisfied incl. AGT-003)
☑ STUDIO-006 (REAL @mos/identity + @mos/rights bindings behind studio ports; §15 multi-account, live consent re-resolution, credentials never merged)
☑ STUDIO-007 (versioned organization loader over frozen AgentOrganization descriptors, compatibility verdicts, no silent substitution)
☐ STUDIO-008..014 (008 gated on LAB-013; Wave 3 targets 010/011)

☐ BRIDGE-001..003
☐ PROD-001..004

☐ UX-001..006

## Source-of-truth rule

This file records implementation evidence. It does not define architecture or dependencies.

A green Work Item requires:
source + tests + runtime + browser/deployment evidence as applicable.

No chat transcript, worker report or screenshot can override a repository contradiction.

## Reconciliation debt
- RESOLVED 2026-10-07 (Wave 2): all packages import canonical @mos/contracts types; remaining local types are documented package-specific extensions.
