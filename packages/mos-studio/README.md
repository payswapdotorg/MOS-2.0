# @mos/studio

MOS v2.0 Content Studio — **Wave 3: STUDIO-004 adaptive interviewer (REAL
`@mos/agent-runtime` agent-instance binding) + STUDIO-010 podcast formats +
STUDIO-011 audio-podcast end-to-end flow**, on top of the Wave 2 RECONCILE-C +
STUDIO-006 multi-account sessions (REAL identity/rights bindings) + STUDIO-003
intent→script/question graphs + STUDIO-007 organization loader binding, and
the Wave 1 STUDIO-001 runtime + STUDIO-002 pluggable format framework +
STUDIO-005 capture ports (worker-c).

ONE runtime, MANY formats (spec/mos-architecture-v2.0.md §13). The package
contains the single session lifecycle runtime, the format registry with the
three initial format descriptors (`reaction`, `audio-podcast`,
`video-podcast`), the capture source port with a disclosed in-memory test
double, the versioned script/question graph system (§14), the adaptive
interviewer bound to the REAL agent stack, the audio-podcast end-to-end flow
(conversation graph, edit graph, packaged artifact), and the studio-owned
dependency ports bound to REAL sibling packages where they exist and
disclosed in-memory doubles where they do not.

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
production-source scan, compile-time type pins, behavioral pin).

Workspace dependencies (Wave 3): `@mos/contracts`, `@mos/identity`,
`@mos/rights`, `@mos/agents`, `@mos/agent-runtime` (all `workspace:*`, all
within the studio's frozen registry dependency list). No `@zcode/*`, no
engine/provider SDKs — substrate firewall in
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
| Runtime (STUDIO-001) | `src/runtime/studio-runtime.ts`, `lifecycle.ts`, `session-state.ts`, `participant-intake.ts`, `intake-types.ts`, `intake-validation.ts`, `package-assembly.ts`, `review-handling.ts`, `runtime-outcomes.ts`, `errors.ts`, `runtime-error-helpers.ts` | `StudioRuntime` — createSession (ProductionRequest OR standalone intent), loadOrganization (versioned, explicit verdicts), joinParticipant (**STUDIO-006: admission through the REAL identity + rights authorities — identity existence, active tenant membership, consent coverage DERIVED from real records**), openCapture (**live consent re-resolution — mid-session revocation blocks capture**), beginProcessing (**live processing-consent re-resolution**), completeProcessing, submitReview (§19), applyTreatment (§19), closeSession, abandonSession, getSession |
| Format framework (STUDIO-002/010) | `src/runtime/format-registry.ts`, `src/runtime/formats/**` | `FormatRegistry` — registers complete `StudioFormatPlugin` instances at RUNTIME (pluggable is live, not compile-time), fails closed on malformed plugins with enumerated reasons; the three initial descriptors as data + hooks, no hard-coded studio behavior. **STUDIO-010 (v2): the podcast descriptors declare the §16-style PODCAST EDIT decision points (`podcast-edit-points`, `podcast-edit-pacing`; video adds `participant-framing`) — edit points/pacing are organization-owned production-program variables, the format never encodes concrete edit choices** |
| Capture (STUDIO-005) | `src/runtime/capture/**` | `CaptureSourcePort` (enumerate/validate/open), `StudioCaptureSession` (start/stop/abort; emits raw artifact refs with provenance labeling), `openCaptureForSession` wiring (live consent gate), disclosed in-memory capture source double |
| Script/question graphs (STUDIO-003, §14) | `src/runtime/script-graph/**` | **REAL studio logic:** `createScriptGraphStore` (validate + version + deep-freeze; old versions stay resolvable; exact-version resolution, never silent latest) and `createAdaptiveSequencer` (deterministic answer→next-question selection over DECLARED branch edges, with explicit node fallbacks; unknown version = explicit failure) |
| Organization loader (STUDIO-007) | `src/runtime/organization-loading/**` | **REAL studio loader** over an `OrganizationSourcePort`: validates the frozen `AgentOrganization` descriptor structure (id/version/nodes/edges/modelAssignments/memoryPolicy/budgetPolicy/terminationPolicy/evaluator), computes compatibility verdicts (required capabilities + minimum version), caches BY VERSION, never silently substitutes (a version change is an explicit new session binding); the W1-C loader double is superseded by a thin in-memory SOURCE double |
| Adaptive interviewer (STUDIO-004, §14) | `src/runtime/interviewer/**` | **REAL `@mos/agent-runtime` binding:** `interviewer-agent-body.ts` (the studio's interviewer `AgentBody` data record — role contract for adaptive interviewing, §9 Podcast Interviewer Pawn duties, §14 provenance rules, AGENTS.md safety prohibitions; pins NO model); `agent-instance-interviewer.ts` (two adapters over the REAL `AgentInstanceRegistry` + `InstanceExecutorPort`: lifecycle binding with NO model preference, question presentation by EXECUTING the bound instance with an audit trace); `interviewer-session.ts` (the adaptive loop: bind agent → present sequencer-selected question → record typed answer → declared branch selection → repeat until terminal; beats are walked over; declared cycles fail loudly; mid-session representation switch preserves session + provenance; completion RELEASES the agent instance) |
| Audio-podcast flow (STUDIO-010/011) | `src/runtime/podcast/**` | `audio-podcast-flow.ts` (full orchestration: createSession(format='audio-podcast') → loadOrganization → joinParticipant through the REAL authorities → adaptive interview with one capture round per question/answer → transcripts through `StudioArtifactFactoryPort` → conversation graph → edit graph → final audio artifact → completeProcessing → submitReview accept → packaged `StudioArtifactPackage`); `conversation-graph.ts` (question/answer nodes from the adaptive loop, interviewer provenance + agent traces end-to-end, synthetic-material disclosure); `edit-graph.ts` (organization edit decisions RECORDED as versioned refs — the org decides, the studio records; decisions outside the format's declared points are rejected) |
| Test doubles (DISCLOSED) | `src/testing/**` | in-memory organization SOURCE / artifact factory / treatment executor / capture source / script-graph generator (deterministic, provenance-labeled) / interviewer agent (echo-only, for tests that do not exercise the agent runtime) + deterministic composition for tests. NOT production bindings and NOT real device capture |
| REAL authority composition (STUDIO-006/004) | `src/testing/participant-authority-adapters.ts`, `src/testing/real-participant-authorities.ts`, `src/testing/real-interviewer-agent.ts` | **The REAL `@mos/identity` `IdentityRepository` + `@mos/rights` `RightsRepository` behind the studio ports**; **the REAL `@mos/agents` body registry (interviewer body registered) + `@mos/agent-runtime` instance registry over THE single model boundary + the REAL substrate instance executor over the DISCLOSED in-memory substrate double**. Composition at the studio testing seam; identity/rights/agents/agent-runtime remain the AUTHORITIES. Runtime import disclosure: identity/rights exports maps point the runtime condition at untranspiled `src/index.ts`, so those two keep the W2-C relative-dist imports; agents/agent-runtime export built `dist/index.js`, so bare specifiers work there |
| Tests | `src/**/*.test.ts` | 70 node:test cases: lifecycle happy path, invalid transitions, §15 consent/multi-account through the REAL authorities (two identities with separate consent records, join/refusal gates, mid-session revocation, per-participant provenance, credentials-never-merged structural test), org loader versioned cache/verdicts/no-substitution, processing-output validation, treatment version chains, rejection discrimination, capture lifecycle + provenance labeling, format pluggability/fail-closed, script-graph generation provenance + adaptive branch selection + version immutability, **STUDIO-004 adaptive-loop round-trip + agent-instance lifecycle + §14 provenance labels + representation switching + no-model-selection pins (4 ways)**, **STUDIO-010 podcast plugin validation + intake validation + decision points**, **STUDIO-011 one-person e2e + multi-account consent gates + revoked/missing-consent refusals + treatment immutability + fail-closed paths**, no-publish assertion |

## Dependency reconciliation (disclosed, updated Wave 3)

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
| organization editing/composition execution (STUDIO-008) | edit decisions arrive as caller-supplied recorded data standing in for the organization's decision output; the recorder/validation/versioning are REAL | `runtime/podcast/edit-graph.ts` | STUDIO-008 |
| browser/desktop media APIs | `CaptureSourcePort` (`runtime/capture/capture-source-port.ts`) | `runtime/capture/in-memory-capture-source.ts` | with the mos-web/mos-desktop shells |

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
