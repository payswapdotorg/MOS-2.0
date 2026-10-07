# MOS v2.0 Unified Worker Contract

## Mandatory reading

1. README.md
2. AGENTS.md
3. docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md
4. spec/mos-architecture-v2.0.md
5. spec/mos-architecture-lock-v2.0.md
6. spec/mos-frozen-manifest-v2.0.json
7. spec/contracts/core-contracts-v2.0.yaml
8. spec/mos-module-registry-v2.0.yaml
9. spec/mos-architecture-policy-v2.0.yaml
10. spec/mos-engine-policy-v2.0.yaml
11. spec/mos-engine-catalog-v2.0.yaml
12. spec/mos-effective-backlog-v2.0.md
13. spec/mos-module-dependency-matrix-v2.0.md
14. docs/handoff/IMPLEMENTATION-STATE-V2.0.md
15. docs/handoff/EXECUTION-PLAN-V2.0.md
16. exact assigned Work Item.

## Core rules

- Repository is the only MOS implementation/architecture source of truth.
- Do not redesign frozen architecture.
- Actual source/tests/runtime evidence outrank reports.
- Do not introduce a second authority.
- Do not directly import concrete OSS engines into MOS domain modules.
- Do not call providers from Lab/Studio domain code.
- Do not pass large media through RPC/control-plane payloads.
- Do not use placeholders/mocks as production-complete claims.
- Keep tenant/rights/provenance boundaries explicit.
- Any architectural exception requires a repo Architecture Change Record.

## Engine rules

Ask for capabilities.
Resolve engines through Engine Registry.
Every engine needs an adapter.
Every activated engine needs contract tests, benchmark evidence, sandbox review and independent code/model/data license review.
Record exact engine versions in runs.
Historical reproducibility requires the old engine identity to remain resolvable.

## Studio rules

One runtime, pluggable formats.
Initial formats: reaction, audio podcast, video podcast.
Studio supports standalone and Lab invocation.
Studio may load any compatible versioned organization explicitly supplied by caller.
One-person interviewer representation is pluggable and provenance-labeled.
Multi-account participants maintain separate authorization and consent.
Raw human output is intermediate.
Treatment/retry creates new artifact versions.
Studio never publishes directly.

## Lab rules

Search the complete production program.
No-op/repost is valid.
Transforms may be discovered.
Transform Pawns use existing Agent Body runtime.
Human work is explicit and economically bounded.
Waiting can be abandoned.
Historical/counterfactual separation is mandatory.
Real experiments use existing MOS authorities.
Simulator calibration never rewrites history.

## Testing

For each Work Item:
- compile/typecheck;
- lint;
- unit tests;
- architecture/boundary tests;
- integration tests;
- runtime smoke tests where applicable;
- browser tests for UI;
- deployment proof for production claims.

For engine work also run the frozen golden benchmark and license/security gates.

## PR disclosure

Every PR must name exact Work Items, changed files, dependencies, acceptance criteria, exact evidence, limitations, engine/version/license metadata if relevant, and any central-file collision.

Workers may not modify frozen architecture/manifest/registry files without explicit TL direction.
