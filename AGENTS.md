# MOS v2.0 Agent Instructions

This repository is the sole source of truth for MOS v2.0.

## Before any implementation

Read:
1. README.md
2. spec/mos-architecture-v2.0.md
3. spec/mos-architecture-lock-v2.0.md
4. spec/mos-frozen-manifest-v2.0.json
5. spec/contracts/core-contracts-v2.0.yaml
6. spec/mos-module-registry-v2.0.yaml
7. spec/mos-architecture-policy-v2.0.yaml
8. spec/mos-engine-policy-v2.0.yaml
9. spec/mos-engine-catalog-v2.0.yaml
10. spec/mos-effective-backlog-v2.0.md
11. spec/mos-module-dependency-matrix-v2.0.md
12. docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md
13. docs/handoff/IMPLEMENTATION-STATE-V2.0.md
14. docs/handoff/WORKER-CONTRACT-V2.0.md
15. docs/handoff/EXECUTION-PLAN-V2.0.md
16. docs/handoff/FINAL-TECH-LEAD-HANDOFF-V2.0.md
17. the exact assigned Work Item.

## Authority

- MOS architecture files define architecture.
- Module registry defines topology/ownership.
- Backlog defines Work Items.
- Implementation state records evidence.
- Worker reports/PR descriptions/screenshots are evidence only.
- Chat context is not authority.

## ZCode substrate

Keep ZCode as infrastructure:
RPC, UI, web/desktop shells, sessions/events, permissions, tools, AgentRuntime, dynamic workflow mechanics, MCP/skills/plugins and packaging.

Do not promote ZCode coding-service semantics into MOS authorities.

Use narrow adapters.

## MOS boundaries

- Lab ≠ Experiment.
- Studio ≠ Workflow.
- Studio ≠ Publisher.
- Studio ≠ Rights/Policy.
- Engine Registry ≠ Marketplace.
- Organization ≠ Workflow Engine.
- Agent Runtime ≠ Strategy Engine.
- Capability ≠ Engine.

## OSS

Concrete OSS packages are never imported by MOS domain modules.

Always:
capability contract → engine registry → engine adapter → sandbox.

Every engine needs:
- manifest;
- exact revision;
- capability contract;
- benchmark;
- evaluator;
- code/model/data license review;
- security review;
- provenance.

## Media

Do not pass large media through control-plane RPC.

Use object/media storage references.

Do not infer rights from URL accessibility.

## Studio

Initial formats:
reaction, audio podcast, video podcast.

Support:
- standalone sessions;
- Lab requests;
- arbitrary compatible organizations;
- one-person adaptive interviewer;
- multi-account sessions;
- raw human artifact treatment;
- output treatment/retry.

Studio never publishes directly.

## Lab

Search:
ideas + no-op + transforms + organizations + engines + human participation + production graph + cost/delay.

Human waiting is optional and economically bounded.

Historical and counterfactual data are distinct.

## Safety

Never optimize for:
- fake engagement;
- coordinated inauthentic behavior;
- anti-abuse bypass;
- impersonation;
- fabricated testimonials;
- deceptive attribution;
- rights circumvention.

## Verification

A green claim requires repository-backed evidence:
source + tests + runtime + browser/deployment as applicable.

Mocks/doubles can test contracts but cannot be represented as live provider or production proof.

## Worker discipline

Maximum concurrent workers: 3.

Do not concurrently edit:
- frozen architecture/manifest/policy files;
- module registry;
- core contract manifest;
- central schema/migrations;
- shared composition root.

Workers stay inside assigned module subtrees. The Tech Lead owns central reconciliation and final acceptance.
