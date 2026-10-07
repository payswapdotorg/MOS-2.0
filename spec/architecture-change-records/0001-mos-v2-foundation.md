# Architecture Change Record 0001 — MOS v2 Foundation

Status: APPROVED / FROZEN
Architecture: MOS v2.0
Date: 2026-10-07

## Decision

Adopt the ZCode fork in payswapdotorg/MOS-2.0 as the infrastructure substrate for MOS, while defining MOS-owned domain/production architecture in the repository.

## Reasons

- reuse mature transport, session, event, tool, permission, agent-runtime and packaging infrastructure;
- avoid mechanical transplantation of the older MOS implementation;
- make media/ML/open-source implementations replaceable;
- isolate OSS implementation licensing and security from MOS domain contracts;
- make Content Studio, Marketing Engineering Lab, Agent Organizations, Engine Registry and Experiment/Evidence authorities explicit.

## Non-goals

- ZCode coding-product semantics are not MOS business semantics.
- No existing ZCode service is automatically a MOS authority.
- No OSS engine becomes a direct MOS dependency merely because it is useful.

## Evidence anchors

- fork baseline commit: 29628c9acdb81b703bbd4080c207a0e7ce5e276e
- fork version: ZCode 3.14.3
- source inventory: docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md
- research basis: docs/research/MOS-OSS-DESIGN-BASIS-v2.0.md

## Supersession

Any earlier ad hoc architecture notes are superseded by the v2.0 frozen specification set in this repository.

This record is audit history, not a second architecture authority.
