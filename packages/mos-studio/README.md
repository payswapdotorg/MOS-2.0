# @mos/studio

MOS v2.0 Content Studio — **STUDIO-001 interface spike**.

This package currently contains **TypeScript contracts only**: exported
types/interfaces with doc comments, zero runtime implementation, zero
constants, zero side effects, and **no dependencies** (no `@zcode/*`, no
engine packages, no provider SDKs — see the substrate firewall in
`spec/mos-architecture-policy-v2.0.yaml` and
`docs/architecture/ZCODE-SUBSTRATE-INVENTORY-v1.md`).

Module registry (frozen): `packages/mos-studio`, owner `worker-c`, authority
`studio-session-production-artifacts`, dependencies
`[contracts, content, production, agents, capabilities, engines, jobs, rights]`.
Those workspace packages do not exist yet at Wave 0, so cross-module
entities are referenced through opaque branded refs in
`src/contracts/refs.ts` instead of imports. When `@mos/contracts` lands in
Wave 1, the local mirror aliases are replaced by canonical imports; nothing
here is a second business authority.

## Spike scope

| File | Contents |
|---|---|
| `src/contracts/refs.ts` | Opaque cross-authority reference primitives + shared value types (tenant scope, storage refs, money, timestamps) |
| `src/contracts/studio-session.ts` | `StudioSession` + `SessionParticipant` (identity/account/authorization/grant/consent per §15) + lifecycle state machine + `StudioProductionRequestView` (consumption view) |
| `src/contracts/studio-format.ts` | `StudioFormat` + `StudioFormatPlugin` plug-in contract + `InitialStudioFormatId` literal union (`reaction` \| `audio-podcast` \| `video-podcast`) |
| `src/contracts/studio-artifact-package.ts` | `StudioArtifactPackage` + `StudioArtifactRef` with raw/intermediate/final stage distinction + transcript/conversation-graph/edit-graph refs |
| `src/contracts/interviewer.ts` | `InterviewerRepresentation` union (`voice` \| `text` \| `avatar` \| `prerecorded` \| `generated` \| `hybrid`) with mandatory synthetic/generated provenance labeling + adaptive question graph refs |
| `src/contracts/organization-loading.ts` | Versioned `StudioOrganizationRef` + organization loading contract with explicit compatibility verdicts (never silent swap) |
| `src/contracts/capture.ts` | Audio/video capture requirements, device classes, multi-account capture participant bindings, capture receipts |
| `src/contracts/treatment.ts` | Output treatment contracts: treatment creates NEW immutable linked artifact versions; `QualityRejection` is distinct from `RightsPolicyRejection` |

## Contract mapping — `spec/contracts/core-contracts-v2.0.yaml`

Required fields are matched **exactly** (names and presence):

| Core contract | Required fields (frozen) | TypeScript home |
|---|---|---|
| `StudioSession` | id, version, productionRequestRef, formatVersion, organizationRef, participants, lifecycle, artifactPackageRef | `StudioSession` in `src/contracts/studio-session.ts` |
| `StudioFormat` | id, version, inputRequirements, participantModel, captureRequirements, interviewerRequirements, organizationCompatibility, outputContract, provenanceRequirements, evaluationHooks | `StudioFormat` in `src/contracts/studio-format.ts` |
| `StudioArtifactPackage` | id, version, sessionRef, rawArtifacts, intermediateArtifacts, finalArtifacts, transcriptRefs, conversationGraphRef, editGraphRef, provenance, consent, evaluation, cost, duration | `StudioArtifactPackage` in `src/contracts/studio-artifact-package.ts` |
| `ProductionRequest` (studio consumes) | id, version, scope, objective, sourceArtifacts, strategyRef, transformGraphRef, organizationRef, studioFormat, capabilityRequirements, humanTasks, acceptanceCriteria, budget, deadline, delayPolicy, rightsContext, returnContract | `StudioProductionRequestView` in `src/contracts/studio-session.ts` (read-only consumption view; replaced by `@mos/contracts` import in Wave 1) |
| `ArtifactRef` (referenced by package fields) | artifactId, version, tenantId, digest, type, storageRef, rightsRef, provenanceRef | `StudioArtifactRef` in `src/contracts/studio-artifact-package.ts` (superset: + stage, parentArtifactRefs, creationMethod per architecture §6) |

Typing notes:

- `artifactPackageRef` is `ArtifactPackageRef | null` — the field is always
  present; it is `null` only before the lifecycle reaches `packaged`.
- `deadline` on the consumption view is `Timestamp | null` — the field is
  always present; null means "no deadline, delay policy governs" (§18).
- Version fields are monotonic immutable counters (`ContractVersion`).

## Architecture rules encoded in the types

- One runtime, pluggable formats (§13; policy `formatsMustBePluggable`):
  `StudioFormatPlugin` is a per-format contract loaded by the single Studio
  runtime; plugins declare capabilities, never concrete engines.
- Organization must be versioned (policy `organizationMustBeVersioned`):
  `StudioOrganizationRef` always pins a version; loading produces an
  explicit compatibility verdict — no silent substitution.
- Multi-account sessions (§15): every `SessionParticipant` carries separate
  identity, account boundary, authorization, participation grant, consent
  and contribution provenance. Credentials are never merged.
- Raw human output is intermediate (§6, §16): the `StudioArtifactStage`
  union (`raw` | `intermediate` | `final`) makes the stage explicit; raw
  capture is never silently final.
- Synthetic interviewer provenance (§14): `InterviewerProvenance.origin` is
  mandatory on every representation; generated material must be labeled
  `synthetic-generated`/`mixed` with the generating capability/engine.
- Treatment immutability (§19): `OutputTreatmentResult` requires new
  successor versions linked to immutable predecessors.
- Quality vs rights/policy rejection (§19): `QualityRejection` and
  `RightsPolicyRejection` are separate members of a discriminated union.
- Media never over control-plane RPC (AGENTS.md "Media"): captured bytes are
  referenced by `StorageRef`; only refs and digests cross the boundary.
- Studio never publishes directly (§13; policy `noDirectPublication`): there
  is no publish/distribute operation anywhere in these contracts — outputs
  are handed back as artifact packages for the caller (user or Lab).

## What Wave 1 STUDIO-001 implementation adds on top

Per `spec/mos-effective-backlog-v2.0.md` (STUDIO-001 "Content Studio
Runtime", deps AGT-001/CAP-001/ENG-001/CORE-004) and the Wave 1 plan in
`docs/handoff/EXECUTION-PLAN-V2.0.md`:

1. **Runtime services behind these contracts**: session lifecycle executor
   (state machine enforcement with append-only transition history), format
   plugin registry/ loader, organization loader bound to the `agents`
   module authority, capture orchestration bound to browser/desktop shell
   media APIs, artifact package assembler.
2. **Canonical contract imports**: replace `refs.ts` mirror aliases and the
   `StudioProductionRequestView` with imports from `@mos/contracts` /
   `@mos/production` once those packages land.
3. **Durable jobs integration** (§26): session processing stages run as
   durable jobs, not synchronous HTTP.
4. **Tests**: contract tests for every invariant listed above (lifecycle
   transition legality, treatment immutability, rejection discrimination,
   consent gating on capture, tenant scope on artifact refs).
5. **The first end-to-end session path**: standalone reaction session
   (intent → organization load → capture → processing → review → package),
   which is also the seed for STUDIO-005/STUDIO-009.

## Commands

```sh
pnpm --filter @mos/studio exec tsc --noEmit   # typecheck
pnpm exec oxlint packages/mos-studio          # lint
```
