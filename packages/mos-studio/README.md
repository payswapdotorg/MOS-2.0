# @mos/studio

MOS v2.0 Content Studio — **Wave 9: STUDIO-009 reaction format + STUDIO-012
video podcast** (the §16 reaction production flow — rights-gated source
import, reactor capture through the REAL §15 gates, the org's
reaction-composition decisions composed through the W8-C editing surface —
and the video-podcast flow with mandatory video capture rounds and the
avatar-modality adaptive interviewer), on top of the Wave 8 STUDIO-008 AI
editing/composition (the W7-B Editor Pawn composed through the REAL
`@mos/production` surfaces, closed-vocabulary edit kinds, §12 interoperable
edit graphs, treatment-versioned packages), the Wave 3 STUDIO-004 adaptive
interviewer (REAL `@mos/agent-runtime` agent-instance binding) + STUDIO-010
podcast formats + STUDIO-011 audio-podcast end-to-end flow, the Wave 2
RECONCILE-C + STUDIO-006 multi-account sessions (REAL identity/rights
bindings) + STUDIO-003 intent→script/question graphs + STUDIO-007
organization loader binding, and the Wave 1 STUDIO-001 runtime +
STUDIO-002 pluggable format framework + STUDIO-005 capture ports (worker-c).

ONE runtime, MANY formats (spec/mos-architecture-v2.0.md §13). The package
contains the single session lifecycle runtime, the format registry with the
three initial format descriptors (`reaction`, `audio-podcast`,
`video-podcast`), the capture source port with a disclosed in-memory test
double, the versioned script/question graph system (§14), the adaptive
interviewer bound to the REAL agent stack, the audio-podcast end-to-end flow
(conversation graph, edit graph, packaged artifact), the AI editing /
composition surface (STUDIO-008: editing sessions over packaged artifacts or
intermediates → NEW immutable package versions with recorded,
§12-interoperable edit graphs), the reaction format flow (STUDIO-009) and
the video-podcast flow (STUDIO-012), and the studio-owned dependency ports
bound to REAL sibling packages where they exist and disclosed in-memory
doubles where they do not.

**THE STUDIO NEVER PUBLISHES** (architecture policy
`studio.noDirectPublication`): there is no distribution/provider/publish
code path in this package at all — asserted by
`src/runtime/no-publish.test.ts` (exported-surface + source + manifest
scan). The Studio hands artifact packages back to the caller (user or Lab);
distribution is a separate module/authority.

**THE STUDIO NEVER SELECTS MODELS** (architecture lock rule 9: no second
model router): the interviewer agent's model is chosen exclusively behind
`@mos/agent-runtime`'s single model boundary; no studio surface carries a
model identity or preference — asserted four ways by
`src/runtime/interviewer/no-model-selection.test.ts` (exported-surface scan,
production-source scan, compile-time type pins, behavioral pin). **The W3-C
pin EXTENDS to the editing surface** (`src/runtime/editing/
editing-no-model-selection.test.ts`): the W7-B Editor Pawn is DETERMINISTIC
— instantiated without any model binding, every execution records
`modelBinding: null`, and the editing contracts cannot express a model
preference at all.

Workspace dependencies (Wave 9, ZERO lockfile delta this wave): `@mos/contracts`,
`@mos/identity`, `@mos/rights`, `@mos/agents`, `@mos/agent-runtime`,
`@mos/production`, `@mos/engines` (all `workspace:*`, all within the studio's
frozen registry dependency list — production and engines are registry-listed
studio deps since W7-B; the Editor Pawn and the engines runner seam are
composed through them, and the W9-C format flows ride the same surfaces). No
`@zcode/*`, no engine/provider SDKs — substrate firewall in
`spec/mos-architecture-policy-v2.0.yaml`, enforced by
`harness/mos-boundary-check.mjs`.

Module registry (frozen): `packages/mos-studio`, owner `worker-c`, authority
`studio-session-production-artifacts`, dependencies
`[contracts, content, production, agents, capabilities, engines, jobs, rights]`.

## Layout

| Area | Files | Contents |
|---|---|---|
| Contracts (canonical where frozen, aligned with `spec/contracts/core-contracts-v2.0.yaml`) | `src/contracts/**` | **RECONCILE-C:** true duplicates of the W0-C mirror are now IMPORTED from `@mos/contracts` (branded ids/refs via `refs.ts` re-exports; `StudioSessionLifecycleState`/`SessionStateTransition`; canonical `ArtifactRef` extended by `StudioArtifactRef`; canonical `CreationMethod`; canonical `AgentOrganization` fields in `StudioOrganizationDescriptor`); studio-specific extensions (plugin contracts, capture specifics, treatment contracts, lifecycle audit fields, decimal-string `MoneyAmount`) stay local. Plus: `StudioSession` + §15 participant model; `StudioFormat`/`StudioFormatPlugin`; interviewer representations with provenance labels; **`script-graph.ts` (STUDIO-003): `IntentRecord`, versioned `ScriptGraph` (question/prompt/beat nodes, answer-keyed branch edges, mandatory synthetic/generated provenance per §14)**; capture requirements/receipts; §19 treatment contracts |
| Studio-owned ports | `src/ports/**` | `StudioArtifactFactoryPort` (content seam, CORE-004 — next wave); `ParticipantIdentityPort` + `ParticipantConsentPort` (STUDIO-006 — REAL `@mos/identity`/`@mos/rights` behind narrow studio ports); `ScriptGraphGeneratorPort` (STUDIO-003 — engine-backed generation in a later wave); `AdaptiveSequencerPort` (STUDIO-003); **`InterviewerAgentPort` (STUDIO-004 — question presentation through agent-instance execution, provenance carried forward)**; **`InterviewerAgentBindingPort` (STUDIO-004 — narrow studio surface of the REAL agent-instance lifecycle: instantiate + bind through the single model boundary, release at completion; no model identity crosses the port)** |
| Runtime (STUDIO-001) | `src/runtime/studio-runtime.ts`, `lifecycle.ts`, `session-state.ts`, `participant-intake.ts`, `intake-types.ts`, `intake-validation.ts`, `package-assembly.ts`, `review-handling.ts`, `runtime-outcomes.ts`, `errors.ts`, `runtime-error-helpers.ts` | `StudioRuntime` — createSession (ProductionRequest OR standalone intent), loadOrganization (versioned, explicit verdicts), joinParticipant (**STUDIO-006: admission through the REAL identity + rights authorities — identity existence, active tenant membership, consent coverage DERIVED from real records**), **importSourceArtifact (STUDIO-009: the §6 acquired-input stage — rights-gated on the format's declarations, typed failures, never silent)**, openCapture (**live consent re-resolution — mid-session revocation blocks capture**), beginProcessing (**live processing-consent re-resolution**), completeProcessing, submitReview (§19), applyTreatment (§19), closeSession, abandonSession, getSession (12 methods = the policy `maxPublicMethods` budget) |
| Format framework (STUDIO-002/010) | `src/runtime/format-registry.ts`, `src/runtime/formats/**` | `FormatRegistry` — registers complete `StudioFormatPlugin` instances at RUNTIME (pluggable is live, not compile-time), fails closed on malformed plugins with enumerated reasons; the three initial descriptors as data + hooks, no hard-coded studio behavior. **STUDIO-010 (v2): the podcast descriptors declare the §16-style PODCAST EDIT decision points (`podcast-edit-points`, `podcast-edit-pacing`; video adds `participant-framing`) — edit points/pacing are organization-owned production-program variables, the format never encodes concrete edit choices** |
| Capture (STUDIO-005) | `src/runtime/capture/**` | `CaptureSourcePort` (enumerate/validate/open), `StudioCaptureSession` (start/stop/abort; emits raw artifact refs with provenance labeling), `openCaptureForSession` wiring (live consent gate), disclosed in-memory capture source double |
| Script/question graphs (STUDIO-003, §14) | `src/runtime/script-graph/**` | **REAL studio logic:** `createScriptGraphStore` (validate + version + deep-freeze; old versions stay resolvable; exact-version resolution, never silent latest) and `createAdaptiveSequencer` (deterministic answer→next-question selection over DECLARED branch edges, with explicit node fallbacks; unknown version = explicit failure) |
| Organization loader (STUDIO-007) | `src/runtime/organization-loading/**` | **REAL studio loader** over an `OrganizationSourcePort`: validates the frozen `AgentOrganization` descriptor structure (id/version/nodes/edges/modelAssignments/memoryPolicy/budgetPolicy/terminationPolicy/evaluator), computes compatibility verdicts (required capabilities + minimum version), caches BY VERSION, never silently substitutes (a version change is an explicit new session binding); the W1-C loader double is superseded by a thin in-memory SOURCE double |
| Adaptive interviewer (STUDIO-004, §14) | `src/runtime/interviewer/**` | **REAL `@mos/agent-runtime` binding:** `interviewer-agent-body.ts` (the studio's interviewer `AgentBody` data record — role contract for adaptive interviewing, §9 Podcast Interviewer Pawn duties, §14 provenance rules, AGENTS.md safety prohibitions; pins NO model); `agent-instance-interviewer.ts` (two adapters over the REAL `AgentInstanceRegistry` + `InstanceExecutorPort`: lifecycle binding with NO model preference, question presentation by EXECUTING the bound instance with an audit trace); `interviewer-session.ts` (the adaptive loop: bind agent → present sequencer-selected question → record typed answer → declared branch selection → repeat until terminal; beats are walked over; declared cycles fail loudly; mid-session representation switch preserves session + provenance; completion RELEASES the agent instance) |
| Audio-podcast flow (STUDIO-010/011) | `src/runtime/podcast/audio-podcast-flow.ts`, `conversation-graph.ts`, `edit-graph.ts` | `audio-podcast-flow.ts` (full orchestration: createSession(format='audio-podcast') → loadOrganization → joinParticipant through the REAL authorities → adaptive interview with one capture round per question/answer → transcripts through `StudioArtifactFactoryPort` → conversation graph → edit graph → final audio artifact → completeProcessing → submitReview accept → packaged `StudioArtifactPackage`); `conversation-graph.ts` (question/answer nodes from the adaptive loop, interviewer provenance + agent traces end-to-end, synthetic-material disclosure); `edit-graph.ts` (organization edit decisions RECORDED as versioned refs — the org decides, the studio records; decisions outside the format's declared points are rejected) |
| **Reaction format flow (STUDIO-009, §16)** | `src/runtime/reaction/**`, `src/runtime/source-import.ts` | **The FULL reaction plugin runtime on the STUDIO-002 framework.** `source-import.ts` + `StudioRuntime.importSourceArtifact` (the §6 ACQUIRED-INPUT stage: the format's `allowsMediaImport` + `requiresRightsClearedSources` declarations gate the import — an uncleared source is the typed failure `source-rights-not-cleared`, missing rights/provenance refs are typed failures, NEVER silent); `reaction-plan.ts` (the production plan: sources + reactors + rounds + the org's §16 composition-choice BUILDER + the typed result/error surface); `reaction-flow.ts` (createSession(format='reaction') → loadOrganization → joinParticipant through the REAL §15 authorities → importSourceArtifact → CAPTURE ROUNDS (one audio + one video take per round, STUDIO-005) → §16 ENTRY (every raw take versioned into the organization as an INTERMEDIATE artifact; synthetic reactor personas labeled `engine-generated` with the generating capability named) → TRANSCRIPTS of the spoken reaction → the org's reaction-composition decisions (reaction-layout / reaction-timing / source-presentation) through the W8-C `EditingCompositionPort` → completeProcessing + submitReview accept → the packaged `StudioArtifactPackage` with ALL required fields) |
| **Video-podcast flow (STUDIO-012)** | `src/runtime/podcast/video-podcast-flow.ts`, `video-podcast-plan.ts`, `video-capture-rounds.ts` | **The FULL video-podcast plugin runtime completing the W3-C structure** on the audio-podcast architecture: FORMAT VALIDATION (the flow only runs the video-podcast plugin; the plugin must declare MANDATORY video capture — audio-only plans are rejected with `video-capture-required`; the interviewer representation must be one the format declares); VIDEO CAPTURE ROUNDS (each interview round records the answering participant's VIDEO take AND audio take — the runtime's device-requirement gate surfaces an insufficient camera as a typed capture failure); the ADAPTIVE INTERVIEW (STUDIO-004 binding, video modality — avatar/prerecorded/generated/hybrid); TRANSCRIPTS via the ArtifactFactoryPort + the CONVERSATION GRAPH from the adaptive loop (§14 labels end-to-end); the FINAL VIDEO composed through the W8-C `EditingCompositionPort` (the org's choices at `participant-framing` / `podcast-edit-points` / `podcast-edit-pacing`) → the packaged `StudioArtifactPackage` with video artifact refs + full provenance |
| **AI editing / composition (STUDIO-008)** | `src/runtime/editing/**`, `src/contracts/editing-composition.ts`, `src/contracts/edit-graph-interop.ts`, `src/ports/editing-composition.port.ts` | **`EditingCompositionPort` (8 methods ≤12): the editing SESSION — packaged artifact (or intermediates) + organization → NEW IMMUTABLE package version (treatment-versioned like W3-C: same id at version+1, or a new id for intermediates sources) with a recorded edit graph.** Contracts: the CLOSED edit-kind vocabulary (`cut/trim/reorder/overlay/caption/dub-track/scale` — unknown kinds are typed failures; `EDIT_KIND_TRANSFORM_ALIGNMENT` declares the §5 transform-kind alignment as data) + org edit choices at the format's DECLARED decision points (§16-style: the ORG decides, the studio records — every choice carries the org's provenance) + typed §30 engine-invocation summaries (verbatim typed failures) + the versioned append-only `EditingCompositionGraph`. Runtime: `editing-composition-runtime.ts` (7-phase session flow: validation gate → editor pawn composition → operation execution → final assembly → graph recording → new package version → §30 record + release), `editor-pawn-binding.ts` (the W7-B Editor Pawn via the REAL `@mos/production` `PawnExecutionPort` — deterministic, NO model binding; engine invocations are EngineJobs through the REAL `@mos/engines` runner seam behind production's runner port), `editing-validation.ts` (the W3-C org-decision pin extended: undeclared points, duplicate points, malformed choices, unknown kinds, unresolved inputs, cross-tenant sources, §15 consent gates), `editing-graph-store.ts` (tenant-scoped append-only graph registry + the §12 interchange operations), `edit-graph-interop.ts` (the ONE declared export format `mos-edit-graph-interchange/1` — complete record, nothing projected away; import validates + re-versions; no silent lossy conversion), `editing-graph-comparison.ts` (structural comparison of two versions — comparable shapes, no conversion), `editing-package-assembly.ts` (the new immutable version assembly) |
| Test doubles (DISCLOSED) | `src/testing/**` | in-memory organization SOURCE / artifact factory / treatment executor / capture source / script-graph generator (deterministic, provenance-labeled) / interviewer agent (echo-only, for tests that do not exercise the agent runtime) + deterministic composition for tests. NOT production bindings and NOT real device capture. **`compose-editing-stack.ts` (STUDIO-008 disclosed seam): the REAL `@mos/production` pawn execution runtime (all ten W7-B pawn bodies registered) over the REAL `@mos/agents` body registry + the REAL `@mos/agent-runtime` instance registry + the REAL `@mos/engines` runner (registry + artifact store + job event sink + the disclosed test-double timeline-renderer adapter) + the REAL `@mos/rights` repository/evaluation behind BOTH gates (§15 participant consent + the pawn rights gate — the W9-C `rightsRepository` option lets the studio runtime and the editing surface share the ONE rights authority)**; `editing-fixtures.ts` (org/transform citations, session-input builders, REAL session-consent seeding); **`compose-format-flows.ts` + `format-flow-fixtures.ts` (W9-C disclosed seam): the ONE shared reaction + video-podcast scenario — the REAL identity/rights authorities behind the runtime's §15 ports AND the editing stack's gates, the editing stack's wrapped artifact factory shared with the runtime (every artifact registers in the REAL engines sandbox artifact store + records a REAL derived-work grant for the chained pawn executions), and the session organization registered BOTH as the studio-loaded organization and an editor-node pawn organization (one citation everywhere)** |
| REAL authority composition (STUDIO-006/004) | `src/testing/participant-authority-adapters.ts`, `src/testing/real-participant-authorities.ts`, `src/testing/real-interviewer-agent.ts` | **The REAL `@mos/identity` `IdentityRepository` + `@mos/rights` `RightsRepository` behind the studio ports**; **the REAL `@mos/agents` body registry (interviewer body registered) + `@mos/agent-runtime` instance registry over THE single model boundary + the REAL substrate instance executor over the DISCLOSED in-memory substrate double**. Composition at the studio testing seam; identity/rights/agents/agent-runtime remain the AUTHORITIES. Runtime import disclosure: identity/rights exports maps point the runtime condition at untranspiled `src/index.ts`, so those two keep the W2-C relative-dist imports; agents/agent-runtime export built `dist/index.js`, so bare specifiers work there |
| Tests | `src/**/*.test.ts` | 121 node:test cases: lifecycle happy path, invalid transitions, §15 consent/multi-account through the REAL authorities (two identities with separate consent records, join/refusal gates, mid-session revocation, per-participant provenance, credentials-never-merged structural test), org loader versioned cache/verdicts/no-substitution, processing-output validation, treatment version chains, rejection discrimination, capture lifecycle + provenance labeling, format pluggability/fail-closed, script-graph generation provenance + adaptive branch selection + version immutability, **STUDIO-004 adaptive-loop round-trip + agent-instance lifecycle + §14 provenance labels + representation switching + no-model-selection pins (4 ways)**, **STUDIO-010 podcast plugin validation + intake validation + decision points**, **STUDIO-011 one-person e2e + multi-account consent gates + revoked/missing-consent refusals + treatment immutability + fail-closed paths**, no-publish assertion, **STUDIO-008 (30 tests): editing-session round-trip (new immutable version + complete edit graph + versioned intermediates + §30 engine invocations through the REAL runner), treatment chain + no-op session, intermediates source, org edit-decision discipline (undeclared/duplicate/malformed/unknown-kind/unresolved-input/cross-tenant/§15 consent gates — no §30 record for validation failures), editor-pawn binding (REAL production surfaces, §30 audit trail, typed engine failure passthrough VERBATIM, rights-gate-precedes-invocation, service actors fail closed, tenant scoping), §12 edit-graph export/import round-trip (validated + re-versioned, enumerated import failures, format/tenant enforcement, structural comparison), no-model-selection pin (4 ways)**, **STUDIO-009 (11 tests): reaction round-trip (source + participant → org §16 decisions → editing → packaged ALL required fields, engine jobs through the REAL runner), synthetic-vs-real reactor labeling (engine-generated + capability-named vs organization-transform), multi-account consent never pooled, treatment → NEW immutable version, W8-C edit-graph resolution/re-versioning, fail-closed battery (uncleared source NEVER creates a session; the runtime + intake double gate; undeclared §16 points rejected with NO §30 record; capture-only consent blocks the editing session; format gate; format-forbidden import + missing rights/provenance refs)**, **STUDIO-012 (10 tests): video round-trip (script → interview → video capture rounds → transcripts + conversation + edit graphs → packaged all-fields + full provenance; avatar §14 labels end-to-end; cost = editing + declared processing), multi-account consent + contribution provenance, treatment → NEW immutable version, fail-closed battery (AUDIO-ONLY plan rejected `video-capture-required`; plugin without mandatory video refused; non-video-podcast plugin refused; representation not declared by the format rejected; INSUFFICIENT camera = typed capture failure with verbatim device reasons; undeclared edit points rejected; capture-only consent blocks the editing session)** |

## Dependency reconciliation (disclosed, updated Wave 9)

RECONCILE-C is DONE: the W0-C mirror types are replaced by canonical
`@mos/contracts` imports (see the contracts row above); `@mos/identity` and
`@mos/rights` are bound for REAL behind the STUDIO-006 participant ports
(see the authority-composition row above). STUDIO-004 binds the interviewer
to the REAL `@mos/agents` + `@mos/agent-runtime` stack (see the adaptive-
interviewer row above). The remaining ports cover modules that are NOT bound
to their final substrates yet (later waves):

| Missing module | Studio-owned port | Current binding | Rebind wave |
|---|---|---|---|
| `agents` organization source (AGT-001/003) | `OrganizationSourcePort` (`contracts/organization-loading.ts`) — the STUDIO-007 loader itself is REAL studio logic | `testing/in-memory-organization-source.ts` (disclosed source double) | later wave |
| Zcode AgentRuntime substrate (W0-B skeleton) | `InstanceExecutorPort` is @mos/agent-runtime's; the studio consumes the REAL executor — the substrate underneath is @mos/agent-runtime's DISCLOSED in-memory double | composed at `testing/real-interviewer-agent.ts` | when the substrate adapter binds the real runtime |
| `content`/CORE-004 | `StudioArtifactFactoryPort` (`ports/artifact-factory.ts`) | `testing/in-memory-artifact-factory.ts` | later wave |
| engine-backed script generation (ENG-002) | `ScriptGraphGeneratorPort` (`ports/script-graph-generator.ts`) | `testing/in-memory-script-graph-generator.ts` (deterministic, provenance-labeled) | later wave |
| capabilities/engines treatment execution | `StudioOutputTreatmentPort` (`contracts/treatment.ts`) | `testing/in-memory-treatment-executor.ts` | later wave |
| organization editing/composition execution (STUDIO-008) | **DELIVERED**: the editing executor composes the W7-B Editor Pawn through the REAL `@mos/production` `PawnExecutionPort` (registry-listed studio dependency); engine invocations run through the REAL `@mos/engines` runner seam behind production's runner port | `runtime/editing/**` + `testing/compose-editing-stack.ts` (the disclosed seam; production TL composition root binds durable stores/real engines) | — |
| browser/desktop media APIs | `CaptureSourcePort` (`runtime/capture/capture-source-port.ts`) | `runtime/capture/in-memory-capture-source.ts` | with the mos-web/mos-desktop shells |

The W9-C format flows introduce NO new missing-module seams: the reaction
flow (source import, capture rounds, §16 entry, composition) and the
video-podcast flow (video capture rounds, adaptive interview, final video
composition) are pure studio orchestration over the DELIVERED STUDIO-008
editing surface, the STUDIO-005 capture ports, the STUDIO-004 interviewer
binding and the studio runtime itself — the shared composition seam lives at
`testing/compose-format-flows.ts` (disclosed; the production TL composition
root binds the same ports over durable stores and real media capture).

Session/package state is in memory; durable persistence belongs to the
jobs/content modules.

## Architecture rules encoded

- One runtime, pluggable formats (§13; policy `formatsMustBePluggable`):
  any complete plugin registers at runtime; the reaction descriptor's
  layout/timing choices are `OrganizationDecisionPoint`s decided by the
  loaded organization (§16) — never Studio hard-codes.
- Organization must be versioned (policy `organizationMustBeVersioned`):
  loading produces explicit compatibility verdicts; incompatible → session
  `failed`, never a silent swap. STUDIO-007: the loader validates the frozen
  `AgentOrganization` descriptor structure, caches BY VERSION, and resolves
  EXACTLY the requested version — a version change is an explicit new
  session binding.
- Multi-account sessions (§15): identity / account boundary / authorization /
  participation grant / consent / contribution provenance stay separate on
  every participant; capture consent is enforced per participant (subjects
  must consent at join; every capture opener is consent-gated). STUDIO-006:
  all of it is answered by the REAL identity + rights authorities behind
  the studio ports (identity existence, active tenant membership, consent
  coverage DERIVED from real records; live re-resolution at capture-open and
  processing-start); participant credentials are NEVER supplied, stored or
  merged (structural test) — sessions keep refs + grants only.
- Script/question graphs (§14): intent-only generation produces a VERSIONED
  graph with mandatory synthetic/generated provenance on the graph AND every
  node; adaptive follow-ups select from DECLARED branch edges by answer ref
  (deterministic); graph edits create NEW versions — old versions stay
  resolvable and unchanged.
- Single model boundary (lock rule 9): the interviewer agent's model is
  selected ONLY behind `@mos/agent-runtime`'s `ModelRuntimePort`. The studio
  passes no model preference (the binding adapter calls `bind(scope,
  instanceId)` with exactly two arguments) and receives no model identity
  back — the studio-side handle carries instance + body identity only.
  Pinned four ways by `src/runtime/interviewer/no-model-selection.test.ts`.
- Interviewer representations (§14, lock rule 20): all six kinds carry a
  provenance label; synthetic/generated material stays labeled
  `synthetic-generated`/`mixed` END-TO-END (declaration → presentation →
  conversation graph → package); switching representations mid-session
  preserves the session, agent binding and per-presentation labels; the
  interviewer agent body pins NO model (bodies never pin models).
- Podcast edit discipline (STUDIO-010/011): the format DECLARES the edit
  decision points (§16-style, organization-owned); the studio RECORDS the
  organization's decisions into a versioned edit graph and rejects decisions
  for points it never exposed; OpenTimelineIO is interchange only, never the
  authority (`otioInterchange` marks export existence).
- **Reaction production (STUDIO-009, §16):** reaction is a FIRST-CLASS
  initial format (lock rule 18). The SOURCE material's rights context gates
  the WHOLE flow — at the flow gate (BEFORE any session exists), at the
  format's intake validation and at the runtime import
  (`importSourceArtifact` — an uncleared source is a typed failure at every
  layer, never silently admitted; a public URL never implies media rights,
  §27). Raw reaction capture ENTERS the loaded organization as an
  INTERMEDIATE artifact (§16 verbatim); the layout/timing/presentation
  composition is the organization's production-program variable at the three
  DECLARED decision points — the ORG decides, the studio records, and the
  composition executes through the W8-C EditingCompositionPort (the W7-B
  Editor Pawn with engine invocations through the REAL engines runner seam).
  Reactor labeling is truthful end-to-end: REAL humans join through the §15
  multi-account consent gates; synthetic reactor personas are recorded
  `engine-generated` with the generating capability NAMED (a synthetic
  persona without a named capability is a typed failure) and the packaged
  output carries `containsSyntheticMaterial: true`.
- **Video podcast (STUDIO-012, §14 + lock rule 18):** the video format's
  capture requirements are ENFORCED, never bypassed — the flow only runs a
  plugin that declares MANDATORY video capture, every participant's plan
  MUST declare a video capture source (audio-only plans are typed failures),
  and the runtime's device-requirement gate surfaces an insufficient camera
  as a typed capture failure with the verbatim reasons. The interviewer is
  the STUDIO-004 binding in a video modality with the §14 provenance labels
  traveling end-to-end into the conversation graph; the final video composes
  through the W8-C editing surface at the format's three declared points.
- **AI editing / composition (STUDIO-008, §12/§13/§16/§19):** the editing
  session takes a packaged artifact (or intermediates) + an organization
  and produces a NEW IMMUTABLE package version with a recorded edit graph —
  THE ORG DECIDES (choices only at the format's DECLARED decision points,
  recorded verbatim with the org's provenance), THE STUDIO RECORDS.
  Composition operations are the CLOSED edit-kind vocabulary
  (cut/trim/reorder/overlay/caption/dub-track/scale — unknown kinds are
  typed failures; the §5 transform-kind alignment is declared data); every
  operation declares its input artifact refs, parameters and output refs;
  intermediates are versioned through the ArtifactFactoryPort with parents =
  the declared inputs (CORE-004 discipline). The editor is the W7-B Editor
  Pawn composed through `@mos/production` (deterministic — NO model
  binding, the lock-rule-9 pin extends to the editing surface); its engine
  invocations are EngineJobs through the REAL engines runner seam with
  typed failures passing through VERBATIM into the §30 records. Edit graphs
  are INTEROPERABLE RECORDS (§12): ONE declared interchange format
  (`mos-edit-graph-interchange/1`) exports the COMPLETE record and import
  validates + re-versions returned records — no silent lossy conversion;
  foreign-tenant exports are rejected (§31). A zero-operation session is
  the honest no-op (lock rule 5). The rights gate precedes every engine
  invocation; §15 consent gates precede composition for multi-account
  sources.
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
