# Final Tech Lead Handoff — MOS v2.0

Repository: payswapdotorg/MOS-2.0

You can implement MOS v2.0 without access to any prior conversation. The repository is the sole source of truth.

## Read in order

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
15. docs/handoff/WORKER-CONTRACT-V2.0.md
16. exact assigned Work Item.

## Mission

Turn the ZCode fork into MOS, preserving useful ZCode execution/transport/UI substrate while preventing ZCode product semantics from becoming MOS authorities.

MOS must ultimately support:
- company/marketing missions;
- Marketing Engineering Lab;
- idea and transform discovery;
- Agent Body/Organization search;
- capability/engine selection;
- Content Studio;
- human+AI production;
- social/commerce integrations;
- real experimentation;
- learning and calibration.

## Critical architectural boundaries

ZCode:
- substrate only.

MOS:
- business/domain authority.

Content Studio:
- production sessions/artifacts;
- not workflow;
- not experiment;
- not publisher;
- not rights/policy;
- not model router.

Lab:
- simulation/search/calibration;
- not publisher;
- not Experiment.

Engine Registry:
- implementation selection;
- not Marketplace.

Agent Organization:
- graph of roles/agents;
- not Workflow.

## Production model

Production Strategy
→ Production Graph
→ capability requirements
→ engine portfolio
→ organization
→ Studio/automated execution
→ Artifact Graph
→ evaluation
→ treatment
→ real experiment
→ calibration.

The production search space includes:
no-op/repost, clipping, reframing, reaction, anime/stylization, podcasting, generation, human contribution and hybrids.

## Human path

Lab may generate a Human Production Task Package containing script/questions, source material, capture instructions, rights/consent, evaluator, deadline and delay economics.

The task can be routed to project owner, authorized collaborator or Arena/provider.

Raw human output goes back through the selected organization before finalization.

## Studio path

Studio is standalone or Lab-invoked.

Initial formats:
reaction, audio podcast, video podcast.

One-person interviewer:
voice / text / avatar / prerecorded / generated / hybrid.

Multi-person:
multiple authorized accounts/devices with separate identity, authorization and consent.

## OSS path

Every OSS implementation is an Engine.

Domain code depends on Capability contracts.

The registry chooses among engines.

Replacement:
new engine
→ adapter
→ contract tests
→ benchmark
→ license/security review
→ activation.

Never:
Studio → OpenCLIP
Studio → WhisperX
Studio → FFmpeg

Instead:
Studio → capability → engine registry → engine adapter.

## Verification standard

A Work Item is green only when its repository implementation and evidence satisfy the frozen acceptance criteria.

Never accept:
- placeholder implementations;
- fake success;
- hard-coded demo-only behavior presented as production;
- hidden direct provider calls;
- unverified license assumptions;
- screenshots without runtime evidence.

## Final outcome

Do not stop at isolated components.

Complete the closed loop:
Mission
→ Lab
→ Strategy
→ Production Program
→ Studio/engines/humans
→ quality/treatment
→ real MOS experiment
→ measurement
→ calibration
→ improved next strategy.

