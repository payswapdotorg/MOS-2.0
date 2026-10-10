# PROD-001 — Production-side Distribution / Integration

Placement: `packages/mos-distribution/src/production/**` (TL-approved §4 default).
Chain position (§24): Production/Studio → **Distribution/Integration (this
surface)** → Workflow/Execution (durable jobs, §26) → platform.

## What this is

The production surface that moves a produced-and-packaged artifact version to
real platforms by **composing the EXISTING authorities** — it never
re-implements transport (AC1). Transport happens only through
`DistributionAuthorityPort` (the `@mos/distribution` SocialAdapterContract:
publish / schedule / readObservations / delete / listRestrictions),
invoked exclusively inside a durable job on the `@mos/jobs` JobQueuePort.

## Law map

| Hard law | Mechanism | Pinned by |
| --- | --- | --- |
| AC1 no 2nd publishing authority | transport only via `DistributionAuthorityPort`, only in the job handler | compat surface pins + adversarial B* |
| AC2 gate ordering | rights → policy → provider; denial ⇒ zero sends; verbatim reasons; exactly one §30 record per attributable attempt; caller errors record nothing | adversarial B*/C* |
| AC3 artifact-refs only | strict schema, exact versions, inline-media rules | adversarial C* |
| AC4 credentials at boundary | `CredentialRef` handles only; exact-version capability resolution; undeclared ⇒ refusal | adversarial C*/D* |
| AC5 durable execution | all publishing rides `JobsPort`; typed failures; retries from declared backoff; six states | adversarial F* |
| AC6 health-respect | only literal `CONFIRMED` gates; SUSPECTED/UNKNOWN/unrecognized verbatim, never gate; context recorded | adversarial E* |
| AC7 observations by reference | only `ObservationRef` locators stored; payloads never | adversarial I* |
| AC8 tenant-scoped, append-only, immutable, UNKNOWN preserved | frozen store, tenant-keyed lookups, defensive clones, verbatim passthrough | adversarial G*/H* |
| AC9 compat over REAL twins | `compat/authority-surfaces.ts` zero-drift pins | compat battery |

## Disclosed doubles

Everything in `adapters/in-memory.ts` is an in-memory test twin, disclosed as
such: gates, health, integrations directory, observability sink, distribution
authority, jobs authority, time sources. Production wiring binds REAL adapters
to the ports (a small TL-side task — the port surfaces are pinned in
`compat/authority-surfaces.ts`).

## Deliberate isolation

This subtree imports no `@mos/*` package. The real authority APIs are reached
through local ports so the composition logic compiles standalone and the
real-authority reconciliation happens in exactly one place: the compat pins.

## Design decisions (see COMPLETION REPORT for the full list)

- Immediate AND scheduled publishing both enqueue on the jobs authority; the
  authority's `schedule` method is parity-only (a transport-side schedule
  would be a synchronous-HTTP durability claim).
- Undeclared-capability and shape violations are caller-error shapes: they
  record nothing (per AC2's "caller-error shapes record nothing").
- Health-empty-maneuver denial reasons are synthesized from consulted
  restriction ids; gate denial reasons are verbatim.
- Retraction composes authority `delete` through the same gate chain; it is not a
  long-running segment, so it does not ride the jobs authority.
