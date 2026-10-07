# MOS — Marketing Operating System

**Architecture v2.0 — FROZEN**

This repository is the sole source of truth for MOS v2.0.

MOS is rebuilt from the fork of `zai-org/zcode`. The inherited ZCode codebase is retained as a reusable substrate for transport, UI, sessions, permissions, tools, agent execution, events, background work and packaging. MOS owns the product/domain authorities.

> **ZCode is infrastructure. MOS is the authority.**

## Canonical reading order

1. `AGENTS.md`
2. `spec/mos-architecture-v2.0.md`
3. `spec/mos-architecture-lock-v2.0.md`
4. `spec/mos-frozen-manifest-v2.0.json`
5. `spec/contracts/core-contracts-v2.0.yaml`
6. `spec/mos-module-registry-v2.0.yaml`
7. `spec/mos-architecture-policy-v2.0.yaml`
8. `spec/mos-engine-policy-v2.0.yaml`
9. `spec/mos-engine-catalog-v2.0.yaml`
10. `spec/mos-effective-backlog-v2.0.md`
11. `spec/mos-module-dependency-matrix-v2.0.md`
12. `docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md`
13. `docs/handoff/IMPLEMENTATION-STATE-V2.0.md`
14. `docs/handoff/WORKER-CONTRACT-V2.0.md`
15. `docs/handoff/EXECUTION-PLAN-V2.0.md`
16. `docs/handoff/FINAL-TECH-LEAD-HANDOFF-V2.0.md`

The conversation that created this architecture is deliberately not required for implementation.

## Product loop

mission
→ Marketing Engineering Lab
→ idea + strategy + organization + engine search
→ production program
→ Content Studio and/or automated production
→ Artifact Graph
→ quality / rights / policy
→ Lab accept / treatment / retry / substitute / abandon
→ real MOS experiment
→ measurement
→ learning / calibration
→ next run.

## Content Studio

Initial formats:
- reaction
- audio podcast
- video podcast

Supports:
- standalone user creation;
- Lab-generated production requests;
- user-provided scripts/questions or intent-driven scripts;
- one-person AI/synthetic/prerecorded/hybrid interviewer;
- multi-account sessions;
- arbitrary compatible organizations;
- raw human media entering organizations for treatment.

## Replaceable open-source engines

MOS never hard-codes business logic to a concrete OSS implementation.

Architecture:
`Capability → Engine Registry → Engine Adapter → Sandbox → Artifact`.

Candidate engines include OpenTimelineIO, FFmpeg, PySceneDetect, WhisperX, OpenCLIP, SAM 2, LiveKit and mediasoup, subject to exact revision, benchmark, security and independent code/model/data license review.

See `spec/mos-engine-catalog-v2.0.yaml`.

## ZCode substrate

Current source remains ZCode-derived. It is intentionally not being mechanically transformed into MOS domain architecture.

Useful inherited infrastructure is wrapped through narrow MOS adapters. MOS domain modules may not import broad ZCode internals or concrete third-party engines.

## Development

The existing ZCode build/bootstrap commands remain available during migration. MOS implementation work is governed by the new MOS v2.0 specification set.

Do not:
- declare a feature complete from a report alone;
- turn mocks into production evidence;
- bypass the Engine Registry;
- call providers directly from Lab/Studio;
- create alternate workflow/experiment/model-router/marketplace authorities.

## Completion

A v2.0 Work Item is green only when repository source, tests, runtime and applicable browser/deployment evidence agree. The final release requires the complete closed-loop proof in `docs/handoff/EXECUTION-PLAN-V2.0.md`.
