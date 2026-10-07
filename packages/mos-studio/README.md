# @mos/studio

MOS v2.0 Content Studio — **STUDIO-001 runtime + STUDIO-002 pluggable
format framework + STUDIO-005 audio/video capture ports** (Wave 1,
worker-c).

ONE runtime, MANY formats (spec/mos-architecture-v2.0.md §13). The package
contains the single session lifecycle runtime, the format registry with the
three initial format descriptors (`reaction`, `audio-podcast`,
`video-podcast`), the capture source port with a disclosed in-memory test
double, and the studio-owned dependency ports (organization loader, artifact
factory, treatment executor) bound in tests to DISCLOSED in-memory test
doubles.

**THE STUDIO NEVER PUBLISHES** (architecture policy
`studio.noDirectPublication`): there is no distribution/provider/publish
code path in this package at all — asserted by
`src/runtime/no-publish.test.ts` (exported-surface + source + manifest
scan). The Studio hands artifact packages back to the caller (user or Lab);
distribution is a separate module/authority.

Zero dependencies (no `@zcode/*`, no engine/provider SDKs — substrate
firewall in `spec/mos-architecture-policy-v2.0.yaml`, enforced by
`harness/mos-boundary-check.mjs`).

Module registry (frozen): `packages/mos-studio`, owner `worker-c`, authority
`studio-session-production-artifacts`, dependencies
`[contracts, content, production, agents, capabilities, engines, jobs, rights]`.

## Layout

| Area | Files | Contents |
|---|---|---|
| Contracts (W0-C spike, aligned with `spec/contracts/core-contracts-v2.0.yaml`) | `src/contracts/**` | `StudioSession` + §15 multi-account participant model + lifecycle state machine; `StudioFormat`/`StudioFormatPlugin`; `StudioArtifactPackage`/`StudioArtifactRef` (raw/intermediate/final); interviewer representations; versioned organization loading with explicit verdicts; capture requirements/receipts; §19 treatment contracts |
| Studio-owned ports | `src/ports/artifact-factory.ts` | `StudioArtifactFactoryPort` — artifact creation seam for the future `content` module (CORE-004); capture/treatment/organization seams live in `src/contracts/**` |
| Runtime (STUDIO-001) | `src/runtime/studio-runtime.ts`, `lifecycle.ts`, `session-state.ts`, `participant-intake.ts`, `intake-types.ts`, `intake-validation.ts`, `package-assembly.ts`, `review-handling.ts`, `runtime-outcomes.ts`, `errors.ts`, `runtime-error-helpers.ts` | `StudioRuntime` — createSession (ProductionRequest OR standalone intent), loadOrganization (versioned, explicit verdicts), joinParticipant (§15 consent enforcement), openCapture, beginProcessing, completeProcessing (lineage/tenant/output-contract validation), submitReview (§19 quality ≠ rights/policy), applyTreatment (NEW immutable linked package versions), closeSession, abandonSession, getSession |
| Format framework (STUDIO-002) | `src/runtime/format-registry.ts`, `src/runtime/formats/**` | `FormatRegistry` — registers complete `StudioFormatPlugin` instances at RUNTIME (pluggable is live, not compile-time), fails closed on malformed plugins with enumerated reasons; the three initial descriptors as data + hooks, no hard-coded studio behavior; the reaction descriptor exposes §16 organization decision points and encodes NO layout/timing |
| Capture (STUDIO-005) | `src/runtime/capture/**` | `CaptureSourcePort` (enumerate/validate/open), `StudioCaptureSession` (start/stop/abort; emits raw artifact refs with provenance labeling), `openCaptureForSession` wiring, disclosed in-memory capture source double |
| Test doubles (DISCLOSED) | `src/testing/**` | in-memory organization loader / artifact factory / treatment executor + deterministic composition for tests. NOT production bindings and NOT real device capture |
| Tests | `src/**/*.test.ts` | 32 node:test cases: lifecycle happy path, invalid transitions, §15 consent/multi-account, org loading verdicts, processing-output validation, treatment version chains, rejection discrimination, capture lifecycle + provenance labeling, format pluggability/fail-closed, no-publish assertion |

## Wave 1 dependency reconciliation (disclosed)

STUDIO-001's backlog deps (AGT-001, CAP-001, ENG-001, CORE-004) are NOT in
this branch base (parallel Wave 1 lanes). Per the worker contract the studio
declares narrow PORTS aligned to the frozen YAML and binds them to disclosed
in-memory test doubles:

| Missing module | Studio-owned port | Test double | Rebind wave |
|---|---|---|---|
| `agents` (AGT-001) | `StudioOrganizationLoader` (`contracts/organization-loading.ts`) | `testing/in-memory-organization-loader.ts` | later wave |
| `content`/CORE-004 | `StudioArtifactFactoryPort` (`ports/artifact-factory.ts`) | `testing/in-memory-artifact-factory.ts` | later wave |
| capabilities/engines (CAP-001/ENG-001) | `StudioOutputTreatmentPort` (`contracts/treatment.ts`) | `testing/in-memory-treatment-executor.ts` | later wave |
| browser/desktop media APIs | `CaptureSourcePort` (`runtime/capture/capture-source-port.ts`) | `runtime/capture/in-memory-capture-source.ts` | with the mos-web/mos-desktop shells |

`refs.ts` mirror aliases and `StudioProductionRequestView` are replaced by
canonical `@mos/contracts` imports when that package lands (TL
reconciliation). Session/package state is in memory; durable persistence
belongs to the jobs/content modules.

## Architecture rules encoded

- One runtime, pluggable formats (§13; policy `formatsMustBePluggable`):
  any complete plugin registers at runtime; the reaction descriptor's
  layout/timing choices are `OrganizationDecisionPoint`s decided by the
  loaded organization (§16) — never Studio hard-codes.
- Organization must be versioned (policy `organizationMustBeVersioned`):
  loading produces explicit compatibility verdicts; incompatible → session
  `failed`, never a silent swap.
- Multi-account sessions (§15): identity / account boundary / authorization /
  participation grant / consent / contribution provenance stay separate on
  every participant; capture consent is enforced per participant (subjects
  must consent at join; every capture opener is consent-gated).
- Raw human output is intermediate (§6, §16): raw capture enters packages as
  `raw` AND as lineage parents of intermediates; parentless finals are
  rejected; the pipeline stage is explicit on every artifact ref.
- Treatment immutability (§19): every treatment creates a NEW package version
  under the same package id; all earlier versions stay resolvable.
- Quality vs rights/policy rejection (§19): separate rejection kinds; review
  outcomes that need Lab/production orchestration fail closed.
- Media never over control-plane RPC: capture returns storage refs + digests
  only.
- Studio never publishes (§13; policy `noDirectPublication`): tested.

## Commands

```sh
pnpm --filter @mos/studio exec tsc -b . --force   # build + typecheck
pnpm --filter @mos/studio test                    # tsc -b && node --test 'dist/**/*.test.js'
pnpm exec oxlint packages/mos-studio              # lint
node harness/mos-boundary-check.mjs               # substrate firewall
```
