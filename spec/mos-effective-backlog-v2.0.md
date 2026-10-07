# MOS v2.0 Effective Implementation Backlog
Status: FROZEN
Architecture: 2.0
Maximum concurrent workers: 3
Canonical execution authority: docs/handoff/EXECUTION-PLAN-V2.0.md

## Phase 0 — Fork archaeology / substrate firewall

### BOOT-001 — ZCode Substrate Inventory
Dependencies: none
Deliver:
- verified upstream/fork baseline;
- package inventory;
- runtime/session/transport/tool/permission/event inventory;
- keep/adapt/legacy/remove classification.
Acceptance:
- no MOS business authority is assigned to ZCode service code;
- inventory has source paths;
- legacy substrate can be consumed through adapters.

### BOOT-002 — MOS Governance Bootstrap
Dependencies: BOOT-001
Deliver:
- MOS manifests;
- module registry;
- architecture policy;
- worker contract;
- acceptance gates;
- source-of-truth rules.
Acceptance:
- architecture and topology are machine-readable;
- workers can start without external context.

### BOOT-003 — Substrate Adapter Firewall
Dependencies: BOOT-002
Deliver narrow ports over:
- ZCode AgentRuntime;
- sessions/events;
- permissions;
- tools;
- RPC;
- object/artifact storage where reusable.
Acceptance:
- MOS domain modules do not import broad ZCode internals;
- boundary tests enforce allowlisted imports.

## Phase 1 — MOS contracts and identity

### CORE-001 — MOS Contracts
Dependencies: BOOT-002
Build shared contracts from spec/contracts/core-contracts-v2.0.yaml.

### CORE-002 — Identity / Tenant / Workspace
Dependencies: CORE-001
### CORE-003 — Rights / Consent / Provenance
Dependencies: CORE-001, CORE-002
### CORE-004 — Content Artifact + Artifact Graph
Dependencies: CORE-001, CORE-003
Acceptance:
- immutable/versioned artifacts;
- source/reference provenance;
- no public-URL-to-rights inference;
- object-store references instead of control-plane media transport.

### CORE-005 — Missions / Objectives
Dependencies: CORE-001, CORE-002

## Phase 2 — Agent/capability/engine substrate

### AGT-001 — Agent Body
Dependencies: CORE-001, BOOT-003
### AGT-002 — Agent Instance / Model Boundary
Dependencies: AGT-001
Acceptance:
- one model/runtime boundary;
- interchangeable models;
- no second router.

### AGT-003 — Agent Organization
Dependencies: AGT-001, AGT-002
Acceptance:
- topology/version/budget/communication are explicit.

### CAP-001 — Capability Registry
Dependencies: CORE-001
### ENG-001 — Engine Registry
Dependencies: CAP-001, CORE-004
### ENG-002 — Engine Adapter Contract
Dependencies: ENG-001
### ENG-003 — Engine Runner Sandbox
Dependencies: ENG-002
### ENG-004 — Golden Corpus / Engine Benchmark
Dependencies: ENG-001, ENG-002, CORE-004
### ENG-005 — Engine Replacement / Rollback
Dependencies: ENG-004
Acceptance:
- swap implementation without domain changes;
- historical runs retain engine identity.

## Phase 3 — Marketing Lab

### LAB-001 — Reference-First Niche Corpus
Dependencies: CORE-004, CORE-005
### LAB-002 — Multimodal Feature Bundles
Dependencies: LAB-001, ENG-001
### LAB-003 — Idea Graph
Dependencies: LAB-002
### LAB-004 — Social Simulator
Dependencies: LAB-002
### LAB-005 — User/Creator/Competition Dynamics
Dependencies: LAB-004
### LAB-006 — Time Machine
Dependencies: LAB-004, LAB-005
### LAB-007 — World Model Ensemble
Dependencies: LAB-004, LAB-005, LAB-006, ENG-004
### LAB-008 — Offline / Off-Policy Evaluation
Dependencies: LAB-007
### LAB-009 — Sequential Strategy Learning
Dependencies: LAB-008
### LAB-010 — Organization Search
Dependencies: AGT-003, LAB-009
### LAB-011 — Transform Definitions + Transform Graph
Dependencies: LAB-003, ENG-001
### LAB-012 — Transform Discovery
Dependencies: LAB-011, LAB-009, LAB-010
### LAB-013 — Transform Pawn Agents
Dependencies: AGT-003, LAB-012, ENG-002
### LAB-014 — Human Production Task Packages
Dependencies: LAB-012, CORE-003
### LAB-015 — Production Delay Economics
Dependencies: LAB-009, LAB-014
### LAB-016 — Production Program Search
Dependencies: LAB-010, LAB-012, LAB-013, LAB-014, LAB-015, ENG-004
### LAB-017 — Robust Marketing Benchmark
Dependencies: LAB-007, LAB-008, LAB-009, LAB-010, LAB-016
### LAB-018 — Online Calibration
Dependencies: LAB-017
Acceptance:
- simulation-to-reality prediction error recorded;
- historical evidence never rewritten.

## Phase 4 — Content Studio

### STUDIO-001 — Content Studio Runtime
Dependencies: AGT-001, CAP-001, ENG-001, CORE-004
### STUDIO-002 — Pluggable Format Framework
Dependencies: STUDIO-001
### STUDIO-003 — Intent → Script / Question Graph
Dependencies: STUDIO-002, AGT-002
### STUDIO-004 — Adaptive Interviewer
Dependencies: STUDIO-003, AGT-003, ENG-002
### STUDIO-005 — Audio/Video Capture
Dependencies: STUDIO-001
### STUDIO-006 — Multi-Account Sessions
Dependencies: STUDIO-001, CORE-002, CORE-003
### STUDIO-007 — Organization Loader
Dependencies: STUDIO-001, AGT-003
### STUDIO-008 — AI Editing / Composition
Dependencies: STUDIO-005, LAB-013, ENG-002, CORE-004
### STUDIO-009 — Reaction Format
Dependencies: STUDIO-002, STUDIO-005, STUDIO-008
### STUDIO-010 — Podcast Format
Dependencies: STUDIO-002, STUDIO-003, STUDIO-004
### STUDIO-011 — Audio Podcast
Dependencies: STUDIO-010, STUDIO-005
### STUDIO-012 — Video Podcast
Dependencies: STUDIO-010, STUDIO-005, STUDIO-008
### STUDIO-013 — Artifact Package / Provenance
Dependencies: STUDIO-009, STUDIO-011, STUDIO-012, CORE-004
### STUDIO-014 — Standalone Studio Product
Dependencies: STUDIO-009, STUDIO-011, STUDIO-012

## Phase 5 — Reality bridge and productization

### BRIDGE-001 — Lab → Studio
Dependencies: LAB-016, STUDIO-007, STUDIO-013
### BRIDGE-002 — Studio Output Evaluation / Treatment
Dependencies: BRIDGE-001, LAB-017
### BRIDGE-003 — Lab → MOS Experiment
Dependencies: BRIDGE-002, CORE-005
### PROD-001 — Distribution / Integration
Dependencies: CORE-003, CORE-004, BRIDGE-003
### PROD-002 — Experiment / Evidence / Learning
Dependencies: PROD-001
### PROD-003 — Strategy Compiler / Marketing Automation Surface
Dependencies: BRIDGE-003, AGT-003
### PROD-004 — Complete Closed-Loop Proof
Dependencies: PROD-002, PROD-003, LAB-018

## Phase 6 — UX and release

### UX-001 — MOS Home / Missions
Dependencies: CORE-002, CORE-005
### UX-002 — Content Studio Surface
Dependencies: STUDIO-014
### UX-003 — Lab Surface
Dependencies: LAB-017
### UX-004 — Connections / Integrations
Dependencies: PROD-001
### UX-005 — Progressive Disclosure / ShareNet-inspired polish
Dependencies: UX-001..UX-004
### UX-006 — Complete Browser Acceptance
Dependencies: PROD-004, UX-005

## Parallel worker map

Worker A — Lab/Data/Domain
- BOOT-001/002 (with TL ownership)
- CORE-002..005
- LAB-001..009
- LAB-011/012
- LAB-014/015/017/018
- Product Intelligence / Commerce

Worker B — Agent/Engine/Production Backend
- BOOT-003 (TL boundary)
- CORE-001/003/004 support
- AGT-001..003
- CAP-001
- ENG-001..005
- LAB-010
- LAB-013/016
- durable jobs

Worker C — Studio/Integrations/UX
- STUDIO-001..014
- BRIDGE-001..003
- PROD-001..004
- UX-001..006

Tech Lead
- architecture/manifest/policy changes;
- central schema/migration ownership;
- substrate firewall;
- composition-root collisions;
- final acceptance.

## Non-negotiable acceptance gates

Every Work Item requires:
- source implementation evidence;
- tests;
- migration/database evidence where applicable;
- runtime/API evidence where applicable;
- browser evidence for UI;
- deployment evidence for production;
- no placeholder/mocked claim as production completeness;
- exact limitations disclosed.

Engine activation requires:
- engine manifest;
- adapter tests;
- golden benchmark;
- security sandbox;
- license/model/data review.

v2.0 final proof requires the full mission → lab → production → real experiment → calibration loop.
