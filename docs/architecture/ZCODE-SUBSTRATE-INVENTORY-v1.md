# ZCode Substrate Inventory — MOS v2.0

Verified fork: payswapdotorg/MOS-2.0
Verified main baseline observed at takeover: 29628c9acdb81b703bbd4080c207a0e7ce5e276e
ZCode version: 3.14.3

## Retain as substrate

| Area | Current source paths | MOS treatment |
|---|---|---|
| RPC / remote transport | packages/rpc, packages/client, packages/server | retain; adapter boundary |
| Shared types/UI | packages/shared, packages/ui | retain only generic primitives |
| Web shell | packages/web | retain shell patterns; replace product surface |
| Desktop shell | packages/desktop | retain shell/packaging; replace product surface |
| Session/eventing | packages/services + zcode-cli contracts/runtime | retain mechanics; MOS session authority remains separate |
| Agent runtime | apps/zcode-cli/packages/core, contracts | wrap behind mos-agent-runtime |
| Tools/permissions | zcode-cli runtime/contracts | wrap behind narrow ports |
| Dynamic workflow | zcode dynamic-workflow packages | substrate execution mechanics only |
| MCP/skills/plugins | zcode-cli packages | substrate extension mechanism only |
| Packaging/release | root scripts / desktop / CLI packaging | retain and MOS-brand later |

## Adapt / contain

These areas have useful mechanics but coding-product semantics:
- workflow task semantics;
- coding commands/tools;
- ZCode provider concepts;
- ZCode marketplace/plugin semantics;
- coding-oriented UI copy;
- Git-specific business flows.

They must be behind adapters or progressively replaced.

## MOS must own

- mission/objective;
- marketing lab;
- production graph;
- transforms;
- content artifacts/lineage;
- capabilities;
- engine registry;
- Studio;
- human production;
- social distribution;
- rights/policy;
- experiments/evidence/learning;
- commerce/product intelligence.

## Substrate firewall

MOS managed packages MUST NOT import:
- `@zcode/core` implementation internals;
- `@zcode/services` business implementations;
- concrete MCP plugin implementations;
- concrete engine packages;
- provider SDKs.

Allowed imports are recorded in `spec/mos-architecture-policy-v2.0.yaml` and the package dependency matrix.
