# MOS — Marketing Operating System

This repository is the MOS v2.0 source of truth.

MOS is being rebuilt from the fork of `zai-org/zcode`. ZCode remains a reusable substrate; MOS owns the product/domain architecture.

Start with `README.md`, then read `AGENTS.md` and the frozen MOS v2.0 specification set under `spec/`.

The architecture deliberately keeps Content Studio, Marketing Engineering Lab, Agent Organizations, Capability contracts and the Engine Registry separate. Open-source implementations are replaceable engines behind capability contracts.

The full implementation plan and worker contract are in:
- `docs/handoff/EXECUTION-PLAN-V2.0.md`
- `docs/handoff/WORKER-CONTRACT-V2.0.md`
- `docs/handoff/FINAL-TECH-LEAD-HANDOFF-V2.0.md`

Do not use chat history as an architecture source.
