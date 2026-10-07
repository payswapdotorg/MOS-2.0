# MOS v2.0 Tech Lead Execution Plan

Architecture: MOS v2.0 FROZEN
Maximum concurrent workers: 3
Canonical architecture: spec/mos-architecture-v2.0.md
Canonical topology: spec/mos-module-registry-v2.0.yaml
Canonical implementation backlog: spec/mos-effective-backlog-v2.0.md
Canonical implementation state: docs/handoff/IMPLEMENTATION-STATE-V2.0.md

## 1. Takeover procedure

The fresh Tech Lead MUST:
1. inspect current main HEAD;
2. compare current fork source against docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md;
3. read all frozen MOS manifests/contracts;
4. inspect actual source before honoring any completed claim;
5. compute the next executable wave from the frozen dependency graph;
6. dispatch at most three workers;
7. keep central topology/migration/composition changes under TL control.

No chat context is required.

## 2. Worker graph

Worker A — Marketing/Data/Lab
- identity, missions, policy, rights, content
- product intelligence/commerce
- Lab corpus/features/Idea Graph/simulator/time machine/world models/learning
- Transform Definitions/Discovery.

Worker B — Agent/Engine/Backend
- Agent Bodies/Instances/Organizations
- Capability registry
- Engine registry/adapters/runner/benchmarks/replacement
- Transform Pawns
- Human task packages
- Delay economics
- durable jobs.

Worker C — Studio/Integrations/UX/Proof
- Content Studio
- all initial formats
- capture/realtime/session UX
- Lab↔Studio bridge
- Integration/Distribution/Experiment surfaces
- browser/product proof.

TL:
- architecture;
- central contracts;
- repository policy;
- substrate firewall;
- central DB/migration registration;
- composition root;
- final acceptance.

## 3. Initial waves

### Wave 0 — freeze substrate boundary
A: BOOT-001 + CORE-002 groundwork
B: BOOT-003 + AGT-001 groundwork
C: STUDIO-001 interface spike + UX substrate audit
TL: BOOT-002, manifests, architecture gates.

### Wave 1 — contracts and engine foundation
A: CORE-003..005 + LAB-001
B: CORE-001 + AGT-002/003 + CAP-001 + ENG-001/002
C: STUDIO-001 + STUDIO-002 + STUDIO-005 + browser shell replacement plan.

### Wave 2 — Lab + media production foundation
A: LAB-002..006
B: ENG-003/004 + LAB-010 + LAB-013
C: STUDIO-003..009.

### Wave 3 — learning + complete Studio
A: LAB-007..012
B: ENG-005 + LAB-014/015/016
C: STUDIO-010..014 + multi-account + treatment foundation.

### Wave 4 — reality bridge
A: LAB-017/018 + product/commerce
B: backend/capability/engine regressions + durable jobs
C: BRIDGE-001..003 + PROD-001/002.

### Wave 5 — product surface / proof
A: benchmark and model regression
B: production/engine/security regression
C: PROD-003/004 + UX-001..006 + browser/deployment proof.

## 4. Hard concurrency rules

- No two workers edit the same central contract or package.
- No worker edits architecture/manifest/topology files.
- TL resolves central migration/schema/composition-root collisions.
- Studio worker owns only mos-studio and presentation/bridge files.
- Engine worker owns engine registry and engine adapters; concrete engines remain outside domain packages.
- Lab worker owns simulation/search; Lab never calls providers.

## 5. Engine adoption gate

A new OSS engine is not "implemented" when its package is installed.

Green requires:
manifest
→ adapter
→ contract tests
→ golden benchmark
→ evaluator
→ sandbox
→ code/model/data license review
→ provenance
→ activation
→ replacement/rollback proof.

## 6. Studio acceptance gate

Green requires:
standalone reaction
standalone audio podcast
standalone video podcast
one-person adaptive interviewer
multi-account podcast
user-supplied organization
Lab-supplied organization
raw human input → organization → output
Lab reject → treatment
engine replacement inside production graph.

## 7. Final closed-loop proof

At least one real scenario must demonstrate:
mission
→ corpus
→ Idea Graph
→ no-op vs transform
→ transform discovery
→ organization/engine search
→ Studio production
→ human task where useful
→ delay-based abandonment
→ Lab acceptance/treatment
→ real experiment
→ measurement
→ calibration
→ improved second run.

The proof must include a zero-human alternative and a prohibited-strategy rejection.

## 8. Release acceptance

Source/tests/runtime/browser/deployment evidence must agree.

Production promotion is a separate gate.

