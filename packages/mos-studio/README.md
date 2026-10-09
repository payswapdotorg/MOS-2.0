# @mos/studio

MOS v2.0 Content Studio — **Wave 12: BRIDGE-002 the §19 Studio-output
evaluation/treatment authority** (the Lab-side verdict over produced studio
output recorded through the bridge: the closed TEN-kind §19 decision
vocabulary — accept; reject-quality; reject-strategy; request-treatment;
require-human-action; switch-organization; switch-transform; switch-engine;
accept-alternate-output; abandon — with quality rejection DISTINCT from
rights/policy rejection (§19: those belong to the §24 gate chain, never this
surface); treatment creating a NEW IMMUTABLE LINKED version through the
reserve→cite linkage over STUDIO-013's successor chains (the bridge never
packages by itself); counterfactual-labeled declared-expectations citations
(lock rule 29); §30-attributable append-only tenant-scoped records with
caller errors recording NOTHING; decisions drive the chain, never execute
it — no runtime/engine/organization/provider surface; abandon first-class
with its justifying analysis snapshot), on top of the Wave 11 BRIDGE-001
Lab→Studio bridge (the §24 boundary chain segment: gate-ordered entry
through the REAL mission/policy/rights authorities with the studio's own
runtime surfaces never bypassed), the Wave 10 STUDIO-013 artifact
package/provenance authority + STUDIO-014 standalone studio product
surface (the ONE canonical packaging path every format flow composes
through — required fields by construction, fail-closed typed failures,
provenance/consent consolidation incl. imported sources and cited
transcripts, immutable append-only versioned packages; the operator product
surfaces as PORTS — session directory with live summary publication, §15
live consent re-resolution at every operator action, immutable package
browsing; the audio-podcast recorder migrated onto the W8-C editing
composition surface), on top of the Wave 9 reaction + video-podcast formats
(STUDIO-009/012), the Wave 8 STUDIO-008 AI
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
the video-podcast flow (STUDIO-012), the canonical artifact
packaging/provenance authority (STUDIO-013: every session accept, treatment
successor and editing-composition version goes through the ONE authority),
and the standalone product surfaces (STUDIO-014: the session-directory
observation port + the packaging browsing surface — the studio never
publishes), and the studio-owned dependency ports
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

Workspace dependencies (Wave 10, ZERO lockfile delta this wave): `@mos/contracts`,
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
| Runtime (STUDIO-001) | `src/runtime/studio-runtime.ts`, `lifecycle.ts`, `session-state.ts`, `participant-intake.ts`, `intake-types.ts`, `intake-validation.ts`, `review-handling.ts`, `operator-consent.ts`, `treatment-application.ts`, `runtime-outcomes.ts`, `errors.ts`, `runtime-error-helpers.ts` | `StudioRuntime` — createSession (ProductionRequest OR standalone intent), loadOrganization (versioned, explicit verdicts), joinParticipant (**STUDIO-006: admission through the REAL identity + rights authorities — identity existence, active tenant membership, consent coverage DERIVED from real records**), **importSourceArtifact (STUDIO-009: the §6 acquired-input stage — rights-gated on the format's declarations, typed failures, never silent)**, openCapture (**live consent re-resolution — mid-session revocation blocks capture**), beginProcessing (**live processing-consent re-resolution**), completeProcessing, submitReview (§19, **STUDIO-014: §15 LIVE consent re-resolution at every forward-moving operator action — a revoked participant OR imported-source-holder consent surfaces as the typed failure `consent-required-for-operator-action`, fail-closed with nothing recorded**), applyTreatment (§19, the §15 gate + the packaged-state successor composed through THE canonical packaging authority), closeSession, abandonSession, getSession (12 methods = the policy `maxPublicMethods` budget; the STUDIO-014 operator surfaces ride NEW ports — `sessionDirectory` observation + packaging browsing, NO new runtime methods) |
| Format framework (STUDIO-002/010) | `src/runtime/format-registry.ts`, `src/runtime/formats/**` | `FormatRegistry` — registers complete `StudioFormatPlugin` instances at RUNTIME (pluggable is live, not compile-time), fails closed on malformed plugins with enumerated reasons; the three initial descriptors as data + hooks, no hard-coded studio behavior. **STUDIO-010 (v2): the podcast descriptors declare the §16-style PODCAST EDIT decision points (`podcast-edit-points`, `podcast-edit-pacing`; video adds `participant-framing`) — edit points/pacing are organization-owned production-program variables, the format never encodes concrete edit choices** |
| Capture (STUDIO-005) | `src/runtime/capture/**` | `CaptureSourcePort` (enumerate/validate/open), `StudioCaptureSession` (start/stop/abort; emits raw artifact refs with provenance labeling), `openCaptureForSession` wiring (live consent gate), disclosed in-memory capture source double |
| Script/question graphs (STUDIO-003, §14) | `src/runtime/script-graph/**` | **REAL studio logic:** `createScriptGraphStore` (validate + version + deep-freeze; old versions stay resolvable; exact-version resolution, never silent latest) and `createAdaptiveSequencer` (deterministic answer→next-question selection over DECLARED branch edges, with explicit node fallbacks; unknown version = explicit failure) |
| Organization loader (STUDIO-007) | `src/runtime/organization-loading/**` | **REAL studio loader** over an `OrganizationSourcePort`: validates the frozen `AgentOrganization` descriptor structure (id/version/nodes/edges/modelAssignments/memoryPolicy/budgetPolicy/terminationPolicy/evaluator), computes compatibility verdicts (required capabilities + minimum version), caches BY VERSION, never silently substitutes (a version change is an explicit new session binding); the W1-C loader double is superseded by a thin in-memory SOURCE double |
| Adaptive interviewer (STUDIO-004, §14) | `src/runtime/interviewer/**` | **REAL `@mos/agent-runtime` binding:** `interviewer-agent-body.ts` (the studio's interviewer `AgentBody` data record — role contract for adaptive interviewing, §9 Podcast Interviewer Pawn duties, §14 provenance rules, AGENTS.md safety prohibitions; pins NO model); `agent-instance-interviewer.ts` (two adapters over the REAL `AgentInstanceRegistry` + `InstanceExecutorPort`: lifecycle binding with NO model preference, question presentation by EXECUTING the bound instance with an audit trace); `interviewer-session.ts` (the adaptive loop: bind agent → present sequencer-selected question → record typed answer → declared branch selection → repeat until terminal; beats are walked over; declared cycles fail loudly; mid-session representation switch preserves session + provenance; completion RELEASES the agent instance) |
| Artifact packaging authority (STUDIO-013) | `src/runtime/packaging/**`, `src/contracts/artifact-packaging.ts`, `src/ports/artifact-packaging.port.ts` | **The ONE canonical packaging path** (5 public methods on the port): `composeSessionPackage` (the STRICT battery — raw artifacts, transcripts, a REAL edit-graph ref, provenance on every artifact, closed root→final lineage, full consent coverage incl. imported sources, an evaluation record, finite one-currency cost/duration — gaps are TYPED failures, never caller goodwill), `composeSuccessorVersion` (editing/treatment successors: NEW immutable versions, predecessors never rewritten), `getArtifactPackage` / `listPackageVersions` / `listPackages` (the STUDIO-014 browsing surface: exact-version reads, ascending chains, tenant-scoped summaries). W9-B disciplines by construction: clone-then-deep-freeze stored packages (D3), exact-tenant two-level maps (D1/D2), finite-number guards (D5). `packaging-validation.ts` + `packaging-store.ts` hold the pure battery helpers and the append-only version store |
| Operator product surfaces (STUDIO-014) | `src/ports/session-directory.port.ts`, `src/testing/in-memory-session-directory.ts`, `src/runtime/operator-consent.ts` | **The studio as a STANDALONE product** (not just a lab adjunct): the session-directory observation PORT (the runtime publishes a frozen session summary on EVERY state change — creation, lifecycle transitions, joins, package attachments; exact-tenant listing, no cross-tenant existence leak; composition-ready for the mos-web UX lane) + the §15 live re-resolution helper behind the operator gates + the packaging browsing surface above. The no-publish discipline STANDS (distribution stays @mos/distribution; the studio hands OFF packaged artifacts through its ports) |
| **Lab → Studio bridge (BRIDGE-001, §24)** | `src/bridge/**`, `src/testing/real-bridge-authorities.ts`, `src/testing/bridge-fixtures.ts`, `compat/**` | **The §24 boundary chain's Lab→Mission→Policy/Rights/Assets→Production/Studio segment.** `contracts/lab-to-studio-entry.ts` (the versioned tenant-scoped append-only entry record family + the typed failure union — caller-shape failures append NOTHING, gate/studio failures append ONE record with the authority's denial attribution VERBATIM; the §24 boundary statement rides every record; the BRIDGE-002 consumption surface: the candidate's declared expectations + studio session/package refs); `contracts/bridge-authority-ports.ts` (the declared mission/policy/rights gate seams — registry-exact: @mos/policy + @mos/missions are NOT studio registry dependencies, so the bridge reaches them through studio-owned ports whose mirrors are compat-pinned against the REAL shapes); `bridge-validation.ts` (fail-closed intake: the candidate must be the search result's OWN entry — identity-checked, never a lookalike — versioned + provenance'd + finite-guarded (D5) + pure-data (W10-F3: cyclic/throwing payloads fail typed); the studio input-kind vocabulary is compile-pinned to the REAL `StudioInputKind` union — no drift possible); `lab-to-studio-bridge.ts` (the core: mission linkage at the EXACT cited version → POLICY gate → RIGHTS frame → ASSETS coverage — every gate PRECEDES any studio invocation (invocation-counting spy pins ZERO createSession/loadOrganization on any denial) → the studio's OWN `createSession` + `loadOrganization` (STUDIO-007/013/014 authorities never bypassed; `recordStudioPackage` only CITES what the studio's own review path composed through the session directory + the canonical packaging authority); 4 public methods ≤ 12); `bridge-entry-store.ts` (append-only: v1 minted by the entry attempt, v2 `packaged` over an `entered` latest only; JSON-array keys (D1/D2), clone-then-deep-freeze (D3), frozen scope copies (D4), finite-guarded numerics (D5), `__proto__` payloads persist as inert own properties (§5.5 discipline)); `adapters/in-memory-bridge-authorities.ts` (disclosed doubles with call logs — the exact frames the bridge emitted); `testing/real-bridge-authorities.ts` (the REAL adapters: the policy evaluation port, the mission repository read surface, the REAL `evaluateRights` cascade over the REAL rights repository); `compat/bridge-authority-compat.ts` + `compat/bridge-real-authorities.test.ts` (the zero-drift compile-time pins + the REAL-authority end-to-end battery — the W7-B compat precedent, type-only relative imports, zero runtime dependency edge) |
| **Studio-output evaluation authority (BRIDGE-002, §19)** | `src/bridge/evaluation/**`, `src/testing/evaluation-fixtures.ts`, `compat/evaluation-*.ts` | **The §19 Studio-output evaluation/treatment authority.** `contracts/studio-output-evaluation.ts` (THE TEN §19 DECISION KINDS as a closed typed vocabulary — exact names, compile-pinned exact, unknown kinds fail closed typed `decision-kind-out-of-vocabulary` and record NOTHING; `reject-rights-policy` provably NOT a member — quality rejection ≠ rights/policy rejection, the §24 gate chain owns those; the versioned tenant-scoped append-only evaluation record family + the treatment-linkage union + the typed failure unions with kind↔stage correlation; the §24 boundary statement rides every record); `evaluation-validation.ts` (fail-closed intake: kind↔payload correlation for every one of the ten kinds, the treatment-kind vocabulary COMPILE-PINNED to the studio's own REAL `TreatmentKind` union, W9-B D5 finite guards on the §18 delay-economics figures, W10-F3 pure-data pins); `evaluation-store.ts` (append-only: v1 minted by the decision, v2 `treatment-linked` over an OPEN linkage only — exactly ONE successor completes a linkage; JSON-array keys (D1/D2), clone-then-deep-freeze (D3), frozen scope copies (D4), `__proto__`-keyed ids inert); `studio-output-evaluator.ts` (the core, 4 public methods ≤ 12: INTAKE → PACKAGE resolution through STUDIO-013 at the EXACT cited version → ENTRY/CANDIDATE citation through the BRIDGE-001 chain (status `packaged`, packageRef + session + organization cross-checks — the citation chain closes through REAL records, never caller claims) → EXPECTATIONS citation (the BRIDGE-002 consumption surface, counterfactual — never evidence) → SESSION observation through STUDIO-014 (fail closed) → decision cross-checks (switch-* routings cite the SAME mission; the alternate resolves through STUDIO-013) → RECORD exactly ONE immutable v1; a denial at ANY stage = ZERO store mutation; `recordTreatmentSuccessor` completes a reserved linkage by CITING the successor the studio's own path composed through STUDIO-013 — same package chain at a later immutable version (treatment successor) or the re-produced output's package after a switch (caller-cited with §30 attribution); the bridge NEVER packages by itself); `adapters/in-memory-evaluation-authorities.ts` (disclosed READ doubles for the failure shapes the REAL surfaces cannot produce + call logs) |
| Audio-podcast flow (STUDIO-010/011) | `src/runtime/podcast/audio-podcast-flow.ts`, `conversation-graph.ts` | `audio-podcast-flow.ts` (full orchestration: createSession(format='audio-podcast') → loadOrganization → joinParticipant through the REAL authorities → adaptive interview with one capture round per question/answer → transcripts through `StudioArtifactFactoryPort` → conversation graph → THE FINAL AUDIO COMPOSITION through the W8-C `EditingCompositionPort` (**STUDIO-013: the flow's own edit-graph recorder is GONE — ONE composition surface and ONE edit-graph record shape for every format**; the org's decisions at the declared podcast edit points) → completeProcessing → submitReview accept → packaged `StudioArtifactPackage`); `conversation-graph.ts` (question/answer nodes from the adaptive loop, interviewer provenance + agent traces end-to-end, synthetic-material disclosure) |
| **Reaction format flow (STUDIO-009, §16)** | `src/runtime/reaction/**`, `src/runtime/source-import.ts` | **The FULL reaction plugin runtime on the STUDIO-002 framework.** `source-import.ts` + `StudioRuntime.importSourceArtifact` (the §6 ACQUIRED-INPUT stage: the format's `allowsMediaImport` + `requiresRightsClearedSources` declarations gate the import — an uncleared source is the typed failure `source-rights-not-cleared`, missing rights/provenance refs are typed failures, NEVER silent); `reaction-plan.ts` (the production plan: sources + reactors + rounds + the org's §16 composition-choice BUILDER + the typed result/error surface); `reaction-flow.ts` (createSession(format='reaction') → loadOrganization → joinParticipant through the REAL §15 authorities → importSourceArtifact → CAPTURE ROUNDS (one audio + one video take per round, STUDIO-005) → §16 ENTRY (every raw take versioned into the organization as an INTERMEDIATE artifact; synthetic reactor personas labeled `engine-generated` with the generating capability named) → TRANSCRIPTS of the spoken reaction → the org's reaction-composition decisions (reaction-layout / reaction-timing / source-presentation) through the W8-C `EditingCompositionPort` → completeProcessing + submitReview accept → the packaged `StudioArtifactPackage` with ALL required fields) |
| **Video-podcast flow (STUDIO-012)** | `src/runtime/podcast/video-podcast-flow.ts`, `video-podcast-plan.ts`, `video-capture-rounds.ts` | **The FULL video-podcast plugin runtime completing the W3-C structure** on the audio-podcast architecture: FORMAT VALIDATION (the flow only runs the video-podcast plugin; the plugin must declare MANDATORY video capture — audio-only plans are rejected with `video-capture-required`; the interviewer representation must be one the format declares); VIDEO CAPTURE ROUNDS (each interview round records the answering participant's VIDEO take AND audio take — the runtime's device-requirement gate surfaces an insufficient camera as a typed capture failure); the ADAPTIVE INTERVIEW (STUDIO-004 binding, video modality — avatar/prerecorded/generated/hybrid); TRANSCRIPTS via the ArtifactFactoryPort + the CONVERSATION GRAPH from the adaptive loop (§14 labels end-to-end); the FINAL VIDEO composed through the W8-C `EditingCompositionPort` (the org's choices at `participant-framing` / `podcast-edit-points` / `podcast-edit-pacing`) → the packaged `StudioArtifactPackage` with video artifact refs + full provenance |
| **AI editing / composition (STUDIO-008)** | `src/runtime/editing/**`, `src/contracts/editing-composition.ts`, `src/contracts/edit-graph-interop.ts`, `src/ports/editing-composition.port.ts` | **`EditingCompositionPort` (8 methods ≤12): the editing SESSION — packaged artifact (or intermediates) + organization → NEW IMMUTABLE package version (treatment-versioned like W3-C: same id at version+1, or a new id for intermediates sources) with a recorded edit graph.** Contracts: the CLOSED edit-kind vocabulary (`cut/trim/reorder/overlay/caption/dub-track/scale` — unknown kinds are typed failures; `EDIT_KIND_TRANSFORM_ALIGNMENT` declares the §5 transform-kind alignment as data) + org edit choices at the format's DECLARED decision points (§16-style: the ORG decides, the studio records — every choice carries the org's provenance) + typed §30 engine-invocation summaries (verbatim typed failures) + the versioned append-only `EditingCompositionGraph`. Runtime: `editing-composition-runtime.ts` (7-phase session flow: validation gate → editor pawn composition → operation execution → final assembly → graph recording → new package version → §30 record + release), `editor-pawn-binding.ts` (the W7-B Editor Pawn via the REAL `@mos/production` `PawnExecutionPort` — deterministic, NO model binding; engine invocations are EngineJobs through the REAL `@mos/engines` runner seam behind production's runner port), `editing-validation.ts` (the W3-C org-decision pin extended: undeclared points, duplicate points, malformed choices, unknown kinds, unresolved inputs, cross-tenant sources, §15 consent gates), `editing-graph-store.ts` (tenant-scoped append-only graph registry + the §12 interchange operations), `edit-graph-interop.ts` (the ONE declared export format `mos-edit-graph-interchange/1` — complete record, nothing projected away; import validates + re-versions; no silent lossy conversion), `editing-graph-comparison.ts` (structural comparison of two versions — comparable shapes, no conversion), `editing-package-assembly.ts` (the new immutable version assembly) |
| Test doubles (DISCLOSED) | `src/testing/**` | in-memory organization SOURCE / artifact factory / treatment executor / capture source / script-graph generator (deterministic, provenance-labeled) / interviewer agent (echo-only, for tests that do not exercise the agent runtime) + deterministic composition for tests. NOT production bindings and NOT real device capture. **`compose-editing-stack.ts` (STUDIO-008 disclosed seam): the REAL `@mos/production` pawn execution runtime (all ten W7-B pawn bodies registered) over the REAL `@mos/agents` body registry + the REAL `@mos/agent-runtime` instance registry + the REAL `@mos/engines` runner (registry + artifact store + job event sink + the disclosed test-double timeline-renderer adapter) + the REAL `@mos/rights` repository/evaluation behind BOTH gates (§15 participant consent + the pawn rights gate — the W9-C `rightsRepository` option lets the studio runtime and the editing surface share the ONE rights authority)**; `editing-fixtures.ts` (org/transform citations, session-input builders, REAL session-consent seeding); **`compose-format-flows.ts` + `format-flow-fixtures.ts` (W9-C disclosed seam): the ONE shared reaction + video-podcast scenario — the REAL identity/rights authorities behind the runtime's §15 ports AND the editing stack's gates, the editing stack's wrapped artifact factory shared with the runtime (every artifact registers in the REAL engines sandbox artifact store + records a REAL derived-work grant for the chained pawn executions), and the session organization registered BOTH as the studio-loaded organization and an editor-node pawn organization (one citation everywhere)** |
| REAL authority composition (STUDIO-006/004) | `src/testing/participant-authority-adapters.ts`, `src/testing/real-participant-authorities.ts`, `src/testing/real-interviewer-agent.ts` | **The REAL `@mos/identity` `IdentityRepository` + `@mos/rights` `RightsRepository` behind the studio ports**; **the REAL `@mos/agents` body registry (interviewer body registered) + `@mos/agent-runtime` instance registry over THE single model boundary + the REAL substrate instance executor over the DISCLOSED in-memory substrate double**. Composition at the studio testing seam; identity/rights/agents/agent-runtime remain the AUTHORITIES. Runtime import disclosure: identity/rights exports maps point the runtime condition at untranspiled `src/index.ts`, so those two keep the W2-C relative-dist imports; agents/agent-runtime export built `dist/index.js`, so bare specifiers work there |
| Tests | `src/**/*.test.ts` + `compat/**` | 307 in-package node:test cases + 24 compat cases: lifecycle happy path, invalid transitions, §15 consent/multi-account through the REAL authorities (two identities with separate consent records, join/refusal gates, mid-session revocation, per-participant provenance, credentials-never-merged structural test), org loader versioned cache/verdicts/no-substitution, processing-output validation, treatment version chains, rejection discrimination, capture lifecycle + provenance labeling, format pluggability/fail-closed, script-graph generation provenance + adaptive branch selection + version immutability, **STUDIO-004 adaptive-loop round-trip + agent-instance lifecycle + §14 provenance labels + representation switching + no-model-selection pins (4 ways)**, **STUDIO-010 podcast plugin validation + intake validation + decision points**, **STUDIO-011 one-person e2e + multi-account consent gates + revoked/missing-consent refusals + treatment immutability + fail-closed paths**, no-publish assertion, **STUDIO-008 (30 tests): editing-session round-trip (new immutable version + complete edit graph + versioned intermediates + §30 engine invocations through the REAL runner), treatment chain + no-op session, intermediates source, org edit-decision discipline (undeclared/duplicate/malformed/unknown-kind/unresolved-input/cross-tenant/§15 consent gates — no §30 record for validation failures), editor-pawn binding (REAL production surfaces, §30 audit trail, typed engine failure passthrough VERBATIM, rights-gate-precedes-invocation, service actors fail closed, tenant scoping), §12 edit-graph export/import round-trip (validated + re-versioned, enumerated import failures, format/tenant enforcement, structural comparison), no-model-selection pin (4 ways)**, **STUDIO-009 (11 tests): reaction round-trip (source + participant → org §16 decisions → editing → packaged ALL required fields, engine jobs through the REAL runner), synthetic-vs-real reactor labeling (engine-generated + capability-named vs organization-transform), multi-account consent never pooled, treatment → NEW immutable version, W8-C edit-graph resolution/re-versioning, fail-closed battery (uncleared source NEVER creates a session; the runtime + intake double gate; undeclared §16 points rejected with NO §30 record; capture-only consent blocks the editing session; format gate; format-forbidden import + missing rights/provenance refs)**, **STUDIO-012 (10 tests): video round-trip (script → interview → video capture rounds → transcripts + conversation + edit graphs → packaged all-fields + full provenance; avatar §14 labels end-to-end; cost = editing + declared processing), multi-account consent + contribution provenance, treatment → NEW immutable version, fail-closed battery (AUDIO-ONLY plan rejected `video-capture-required`; plugin without mandatory video refused; non-video-podcast plugin refused; representation not declared by the format rejected; INSUFFICIENT camera = typed capture failure with verbatim device reasons; undeclared edit points rejected; capture-only consent blocks the editing session)**, **STUDIO-013 (19 tests): the authority battery — happy path with every contract-required field, fail-closed on every gap class (raw refs, transcripts, edit-graph ref, evaluation, provenance, lineage incl. root→final traceability, consent coverage incl. imported sources, cost-invalid NaN/negative/mixed-currency, duration-invalid), immutable version chains + version-conflict, clone-then-deep-freeze (D3), exact-tenant store (D1/D2), provenance consolidation incl. cited transcripts, successor composition + browsing surface, cost consolidation**, **STUDIO-014 (8 tests): the operator surface — session directory summary on every mutation + exact-tenant listing + frozen projections, package browsing through THE composed authority (immutable versions, exact reads, historical never rewritten), §30-attributable review/accept records, §15 live re-resolution (participant revocation refuses accept/treatment with nothing recorded; imported-source-holder revocation refused; terminal rejections stay decidable), the §15 coverage projection + the composition-handle identity pin** , **BRIDGE-001 (74 in-package + 12 compat): the intake validation battery (lookalike/no-op/modality/tenant/citation cross-checks, D5 NaN guards, W10-F3 cyclic/throwing pure-data pins, hostile non-string ids, the compile-pinned input-kind vocabulary); the entry-store adversarial battery (D1/D2 JSON-array keys vs hostile delimiter-laden tenant/entry ids, D3 clone-then-deep-freeze + never-freeze-caller, D4 scope forgery, `__proto__` inert-own-property payloads with NO prototype pollution, append-only v1→v2 chains, fail-loud id collisions); the bridge core battery (the ENTERED record with every §24 segment + verbatim authority data, the gate-ordering ladder with the invocation-counting runtime spy — ZERO studio calls on any denial —, verbatim denial reasons from the REAL rights cascade (revoked/expired/unresolved/subject-not-covered/grantee-not-covered/action-not-covered), mission/caller-shape failures recording NOTHING, studio-entry failures recorded with the failed studio segment, tenant isolation, caller-aliasing + scope-forgery probes, the `recordStudioPackage` v2 citation lifecycle through the studio's OWN review path (join→capture→process→review→packaged), the no-distribution-surface port-shape pin); the compat battery (the REAL policy authority mapping allow/deny/budget-ceiling/approval-required/insufficient-policy/thrown-error — each fail-closed with the authority's attribution VERBATIM and its §30 audit record resolvable; the REAL mission repository exact-version/cross-tenant/draft pins; the full §24 chain end-to-end over every REAL authority — entered AND denied with ZERO studio calls)** |, **BRIDGE-002 (61 in-package + 12 compat): the intake validation battery (the ten-kind vocabulary deep-equal pin, the reject-rights-policy SMUGGLING probe + BRIDGE-001 failure-kind shapes + case-variant probes all failing typed, kind↔payload correlation for each of the ten kinds, the studio treatment-kind vocabulary pin, D5 finite guards on §18 delay economics, W10-F3 cyclic pins, hostile frame shapes); the evaluation-store adversarial battery (D1/D2 JSON-array keys vs hostile delimiter-laden tenant/evaluation ids, D3 clone-then-deep-freeze, D4 scope forgery, append-only v1→v2 with prior versions bit-for-bit, linkage single-completion, same-chain LATER-version verification + the disclosed re-produced shape, fail-loud id collisions, `__proto__`-keyed ids inert); the evaluator core battery (every one of the TEN kinds recording ONE fully-cited record — package @ exact version through STUDIO-013, the entry citation chain verbatim, counterfactual expectations, §30 observability; the gate ladder package → entry → expectations → session → decision with ZERO store mutation on any denial; the ENTERED-only v1 + policy-DENIED entry probes (§19 distinct classes — the denial record never converts); the treatment-linkage lifecycle reserve → the studio's OWN runtime.applyTreatment composes the successor through STUDIO-013 → cite (v2) with prior versions bit-for-bit; single completion; the switch→re-produced completion; the structural spy + negative control — the §19 authority's own methods NEVER invoke the studio runtime; the port-shape + deps-shape pins (no runtime/engine/organization/provider seam); ABANDON first-class (never a deletion); tenant isolation + caller-aliasing probes); the compat battery (the ten-kind zero-drift pin at runtime; REAL accept/reject-quality/abandon/switch/accept-alternate over the REAL STUDIO-013/014 + REAL policy/missions behind the BRIDGE-001 gates; the REAL treatment linkage end-to-end — the studio's own path composes through STUDIO-013, the citation links it, the prior version stays bit-for-bit immutable in the REAL authority; the REAL denied-chain probe (a policy-denied entry has NO evaluable output); the smuggling probe over the REAL authorities; cross-tenant isolation; the gate ladder)** |

## Dependency reconciliation (disclosed, updated Wave 10)

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
pnpm --filter @mos/studio test                    # tsc -b && node --test 'dist/**/*.test.js' + sibling builds + tsc -p tsconfig.compat.json + node --test compat/bridge-real-authorities.test.ts compat/evaluation-real-authorities.test.ts
pnpm exec oxlint packages/mos-studio              # lint
node harness/mos-boundary-check.mjs               # substrate firewall
```

## BRIDGE-001 — the Lab → Studio bridge (§24 boundary chain segment)

The bridge takes a SELECTED LAB-016 production program search candidate (a
REAL `@mos/production` `RankedCandidateProgram` of a
`ProductionProgramSearchResult` — canonical `ProductionRequest`, versioned,
provenance'd, the no-op baseline structurally rejected) into real Studio
production through the §24 chain segment:

1. **INTAKE** (fail-closed, nothing recorded): the candidate must be the
   search result's OWN entry (identity-checked — a deep-equal lookalike is
   rejected); malformed/unversioned/unprovenance'd/caller-fabricated shapes
   are typed failures BEFORE any authority consultation.
2. **MISSION** linkage at the EXACT cited record version (unknown ≡
   cross-tenant, §31; only an active mission accepts entry).
3. **POLICY** gate (the W6-C/W8-A gate-ordering discipline at the bridge):
   the REAL policy authority behind the declared port vets the
   `production-request-approval` action over the caller's DECLARED citation
   set — fail-closed verdicts, denial reasons verbatim, approval-required
   and insufficient-policy both deny.
4. **RIGHTS** frame: every declared grant + consent ref resolves active
   in-tenant (revoked/expired/unresolved/foreign-tenant all deny).
5. **ASSETS** coverage: every source artifact explicitly covered under the
   DERIVED action (`transform` for chained candidates, `use` otherwise —
   never caller-claimed) by the REAL `evaluateRights` cascade (§27: no URL
   probing, explicit grants only).
6. **PRODUCTION/STUDIO** through the studio's OWN authorities only:
   `createSession` (production-request entry mode, supplier kind `lab`,
   `rightsCleared` DERIVED from the assets gate) + `loadOrganization`
   (STUDIO-007, the EXACT cited version). The bridge never writes artifacts,
   never touches session internals, never packages — `recordStudioPackage`
   only CITES what the runtime's session directory published and the
   canonical packaging authority (STUDIO-013) resolved.

Every attributable attempt (gate denial or studio failure included) appends
exactly ONE versioned tenant-scoped append-only record carrying the
authority data VERBATIM and the BRIDGE-002 consumption surface (the
candidate's declared expectations — expected reward, §22 interval, baseline
delta, §2 EV-of-delay, counterfactual-labeled — plus the studio
session/package refs). The output is a studio-side production entry, never
a distribution call (§24: Lab/Studio never call social providers directly —
pinned by the boundary statement on every record and by the port-surface
shape test).

Registry-exactness: the mission/policy seams are studio-owned DECLARED
ports; their structural mirrors are compat-pinned against the REAL
`@mos/policy` / `@mos/missions` shapes at compile time
(`compat/bridge-authority-compat.ts`, the W7-B/W8-A zero-drift precedent —
type-only relative imports, no runtime dependency edge) and proven
end-to-end at runtime (`compat/bridge-real-authorities.test.ts`: the REAL
policy evaluation authority with its §30 audit log, the REAL mission
repository, the REAL rights cascade, the REAL studio runtime, the REAL
production program search). The in-package battery (74 tests:
validation/store/bridge) runs the REAL search + REAL studio runtime + REAL
rights authority with disclosed mission/policy doubles.

## BRIDGE-002 — the §19 Studio-output evaluation/treatment authority

The §19 authority at the bridge: the Lab-side verdict over PRODUCED studio
output, recorded with full attribution. An evaluation consumes a BRIDGE-001
entry chain's packaged output — the entry's `packageRef` cited at EXACT
version, resolved through the canonical STUDIO-013 packaging authority —
together with the entry's DECLARED EXPECTATIONS (the BRIDGE-001 consumption
surface: expected reward, §22 interval, baseline delta, §2 EV-of-delay —
simulation-based, counterfactual-labeled, lock rule 29, never evidence).

**The ten §19 decision kinds** (closed typed vocabulary, exact names):
`accept`; `reject-quality`; `reject-strategy`; `request-treatment`;
`require-human-action`; `switch-organization`; `switch-transform`;
`switch-engine`; `accept-alternate-output`; `abandon`. No extension at call
sites, no stringly-typed decisions — unknown kinds fail closed with the
typed `decision-kind-out-of-vocabulary` and record NOTHING. The vocabulary
is compile-pinned exact against the frozen spec list, and pinned against
the studio's own operator review vocabulary (the nine shared literals are
identical strings; the one documented naming divergence is the §19 verb
`accept-alternate-output` vs the studio's legacy operator literal
`accept-alternate`; `reject-rights-policy` — a studio-side operator outcome —
is provably NOT a bridge kind).

**Quality rejection is DISTINCT from rights/policy rejection (§19).**
`reject-quality`/`reject-strategy` are §19 evaluation verdicts recorded
through THIS authority; rights/policy denials come from the §24 gate chain
(BRIDGE-001's typed entry failures). Different typed kinds, different record
shapes, never conflated, never converted — pinned by the smuggling probe
(`reject-rights-policy` and BRIDGE-001 failure-kind shapes through the
evaluation surface fail typed with nothing recorded) and by the denied-chain
probe (a policy-denied entry has NO evaluable output; its denial record
stays a §24 denial forever).

**Treatment creates a NEW immutable linked version (§19).** A
`request-treatment` or `switch-*` decision references the prior package
version and RESERVES an append-only linkage (`awaiting-successor`);
`recordTreatmentSuccessor` completes it by CITING the successor version the
studio's own path composed through STUDIO-013 — the same package chain's
next immutable version (a treatment successor: the studio's
`applyTreatment` runs the organization treatment executor and composes the
successor through the ONE packaging authority) or the re-produced output's
package after a switch (the Lab re-ran the search + production; a different
package id, caller-cited with §30 attribution). The bridge NEVER packages
by itself — the `recordStudioPackage` citation discipline. The linkage chain
(old version → new version, the decision record as the link reason) is
auditable and append-only; prior versions never mutate (bit-for-bit, pinned
against the REAL authority); exactly ONE successor completes a linkage.

**Decisions drive the chain, never execute it (§24).** The authority holds
NO runtime/engine/organization/provider surface of any kind — read-only
citation seams only (the BRIDGE-001 entry chain reads, STUDIO-013
exact-version reads, STUDIO-014 session summaries). Switch-* verdicts are
RECORDED routings back to the Lab/production search surface BY REFERENCE
(the routing cites the same mission the entry linked — cross-checked);
`require-human-action` references the LAB-014 human-production-task surface
by reference (never creating a task); `abandon` is FIRST-CLASS — a recorded
terminal verdict with its justifying analysis snapshot (the §18
delay-economics analysis cited by reference, feeding the LAB-017/018
learning surfaces) — never a deletion (the entry, the package and the
session all stay resolvable), never an exception.

**Gate ordering** (a denial at any stage = ZERO store mutation, the
invocation-counting spy discipline): INTAKE (fail-closed typed validation —
kind↔payload correlation, D5 finite guards, W10-F3 pure-data) → PACKAGE
resolution through STUDIO-013 at the EXACT cited version (cross-tenant ≡
unknown, §31) → ENTRY/CANDIDATE citation through the BRIDGE-001 chain (the
cited entry version must be `packaged`, its `packageRef` IS the cited
package, the session and organization close the chain) → EXPECTATIONS
citation (the cited entry version carries the surface — an evaluation never
proceeds expectations-blind) → SESSION observation through STUDIO-014 (fail
closed) → decision cross-checks → RECORD exactly ONE immutable v1 record
(W9-B D1–D5 by construction in the store). Every failure is a caller/citation
error that records NOTHING (the W8-A discipline — no authority denied
anything; the caller cited an unresolvable or malformed shape).

Registry-exactness: the evaluation consumes only studio-owned and
studio-registry surfaces (the BRIDGE-001 bridge port, the STUDIO-013
packaging authority port, the STUDIO-014 session directory) — no new
dependency edges, zero lockfile delta. The REAL mission/policy authorities
behind the BRIDGE-001 gates run in the compat battery
(`compat/evaluation-real-authorities.test.ts`, wired per
`compat/bridge-real-authorities.test.ts`); the compile-time zero-drift pins
live in `compat/evaluation-authority-compat.ts`. The in-package battery
(61 tests: validation/store/evaluator) runs the REAL search + REAL studio
runtime + REAL rights + REAL STUDIO-013/014 with the disclosed
mission/policy doubles.
