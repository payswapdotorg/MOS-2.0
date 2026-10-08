/**
 * @mos/studio — MOS v2.0 Content Studio.
 *
 * Wave 1 (STUDIO-001/002/005): contract types (W0-C spike, aligned with
 * spec/contracts/core-contracts-v2.0.yaml) + the single Studio runtime, the
 * pluggable format registry with the three initial format descriptors, the
 * capture source port with a disclosed in-memory test double, and the
 * disclosed in-memory doubles for the studio-owned ports (organization
 * loader, artifact factory, treatment executor).
 *
 * Wave 3 (STUDIO-004/010/011): the adaptive interviewer bound to the REAL
 * @mos/agent-runtime agent-instance lifecycle (model selection stays behind
 * the single model boundary — pinned by no-model-selection.test.ts), the
 * podcast format descriptors with organization edit decision points, and
 * the audio-podcast end-to-end flow (conversation graph, edit graph, packaged
 * StudioArtifactPackage with full provenance).
 *
 * Wave 9 (STUDIO-009/012): the reaction format flow (rights-gated source
 * import as the §6 acquired-input stage, human reactor capture through the
 * REAL §15 gates or synthetic-labeled personas, §16 entry intermediates and
 * the org's reaction-composition decisions composed through the W8-C editing
 * surface) and the video-podcast flow (the W3-C architecture with mandatory
 * video capture rounds and the final video composed through the same editing
 * surface).
 *
 * Wave 10 (STUDIO-013/014): the canonical artifact-packaging authority
 * (StudioArtifactPackagingPort — ONE packaging path for every format flow,
 * contract-required fields complete by construction, fail-closed typed
 * battery, immutable append-only versioned packages, truthful
 * provenance/consent consolidation incl. imported sources) with the
 * audio-podcast flow's final composition migrated onto the W8-C editing
 * surface, and the standalone operator product surface seams (the
 * session-directory observation port; package browsing/review/accept ride
 * the runtime + the authority's own port surface — §15 live consent
 * re-resolution at every operator action).
 *
 * THE STUDIO NEVER PUBLISHES (architecture policy studio.noDirectPublication):
 * there is no distribution/provider/publish surface in this package —
 * asserted by src/runtime/no-publish.test.ts. THE STUDIO NEVER SELECTS
 * MODELS (lock rule 9): there is no model-selection surface — asserted by
 * src/runtime/interviewer/no-model-selection.test.ts.
 */

// ——— Contracts (types only) ———
export type * from "./contracts/refs.js";
export type * from "./contracts/capture.js";
export type * from "./contracts/interviewer.js";
export type * from "./contracts/interviewer-session.js";
export type * from "./contracts/organization-loading.js";
export type * from "./contracts/podcast-graphs.js";
export type * from "./contracts/script-graph.js";
export type * from "./contracts/studio-artifact-package.js";
export type * from "./contracts/studio-format.js";
export type * from "./contracts/studio-session.js";
export type * from "./contracts/treatment.js";

// ——— Ports (studio-owned dependency seams) ———
export type {
  StudioArtifactCreationInput,
  StudioArtifactCreationResult,
  StudioArtifactFactoryPort,
} from "./ports/artifact-factory.js";
export type {
  ParticipantConsentPort,
  ParticipantConsentQuery,
  ParticipantConsentResolution,
} from "./ports/participant-consent.js";
export {
  STUDIO_CONSENT_CAPTURE_ACTION,
  STUDIO_CONSENT_PROCESSING_ACTION,
  studioSessionConsentSubject,
} from "./ports/participant-consent.js";
export type {
  ParticipantIdentityPort,
  ParticipantIdentityQuery,
  ParticipantIdentityResolution,
} from "./ports/participant-identity.js";
export type {
  AdaptiveSelectionError,
  AdaptiveSelectionInput,
  AdaptiveSelectionResult,
  AdaptiveSequencerPort,
} from "./ports/adaptive-sequencer.js";
export type {
  InterviewerAgentPort,
  InterviewerPresentationError,
  InterviewerQuestionPresentation,
  InterviewerQuestionPresentationInput,
  InterviewerQuestionPresentationResult,
} from "./ports/interviewer-agent.js";
export { derivePresentationProvenance } from "./ports/interviewer-agent.js";
export type {
  InterviewerAgentBindingError,
  InterviewerAgentBindingInput,
  InterviewerAgentBindingPort,
  InterviewerAgentBindingResult,
  InterviewerAgentReleaseResult,
} from "./ports/interviewer-agent-binding.js";
export type {
  ScriptGraphGenerationError,
  ScriptGraphGenerationInput,
  ScriptGraphGenerationResult,
  ScriptGraphGeneratorPort,
} from "./ports/script-graph-generator.js";

// ——— Runtime: lifecycle machine ———
export {
  TERMINAL_SESSION_STATES,
  isLegalTransition,
  legalTargets,
} from "./runtime/lifecycle.js";

// ——— Runtime: format registry (STUDIO-002) ———
export {
  createFormatRegistry,
  validateFormatPlugin,
  FormatRegistry,
} from "./runtime/format-registry.js";
export type {
  FormatRegistrationResult,
  FormatResolutionError,
  FormatResolutionResult,
} from "./runtime/format-registry.js";
export {
  createReactionFormatPlugin,
  REACTION_FORMAT_VERSION,
} from "./runtime/formats/reaction.js";
export {
  createAudioPodcastFormatPlugin,
  AUDIO_PODCAST_FORMAT_VERSION,
} from "./runtime/formats/audio-podcast.js";
export {
  createVideoPodcastFormatPlugin,
  VIDEO_PODCAST_FORMAT_VERSION,
} from "./runtime/formats/video-podcast.js";
export {
  createFormatRegistryWithInitialFormats,
  INITIAL_STUDIO_FORMAT_IDS,
  registerInitialStudioFormats,
} from "./runtime/formats/initial-formats.js";

// ——— Runtime: capture (STUDIO-005) ———
export type {
  CaptureSourceDescriptor,
  CaptureSourceDescriptorDeviceClass,
  CaptureSourceValidation,
  RawCaptureHandle,
  RawCaptureParams,
  CaptureSourcePort,
} from "./runtime/capture/capture-source-port.js";
export type {
  RawArtifactRecorder,
  StudioCaptureTakeError,
  StudioCaptureTakeOutcome,
  StudioCaptureTakeResult,
  StudioCaptureSessionDeps,
} from "./runtime/capture/studio-capture-session.js";
export { createStudioCaptureSession, StudioCaptureSession } from "./runtime/capture/studio-capture-session.js";
export { createInMemoryCaptureSourcePort } from "./runtime/capture/in-memory-capture-source.js";
export type { InMemoryCaptureSourceOptions } from "./runtime/capture/in-memory-capture-source.js";

// ——— Runtime: the single Studio runtime (STUDIO-001) ———
export { createStudioRuntime, StudioRuntime } from "./runtime/studio-runtime.js";
export type {
  CreateStudioSessionInput,
  ImportSourceArtifactRequest,
  JoinParticipantRequest,
  OpenCaptureRequest,
  StandaloneSessionIntent,
  StandaloneSessionIntentOrganizationRefInput,
  StudioProcessingOutput,
  SubmitReviewInput,
} from "./runtime/intake-types.js";
export type {
  CreatedSessionValue,
  ImportedSourceValue,
  JoinedParticipantValue,
  LoadedOrganizationValue,
  ReviewHandledValue,
  SessionSnapshotValue,
  StudioRuntimeDeps,
  TreatmentAppliedValue,
} from "./runtime/runtime-outcomes.js";
export type { StudioRuntimeError, StudioRuntimeOutcome } from "./runtime/errors.js";
export type { StudioSessionView } from "./runtime/session-state.js";

// ——— Runtime: organization loader binding (STUDIO-007) ———
export {
  createStudioOrganizationLoader,
  checkOrganizationCompatibility,
  validateOrganizationDescriptor,
} from "./runtime/organization-loading/studio-organization-loader.js";
export type {
  OrganizationInvalidReason,
  StudioOrganizationLoaderOptions,
} from "./runtime/organization-loading/studio-organization-loader.js";
export type {
  OrganizationSourceError,
  OrganizationSourcePort,
  OrganizationSourceResult,
  StudioOrganizationDescriptor,
  StudioOrganizationLoaderPort,
} from "./contracts/organization-loading.js";

// ——— Runtime: script/question graphs (STUDIO-003, §14) ———
export {
  createScriptGraphStore,
  validateScriptGraphDraft,
} from "./runtime/script-graph/script-graph-store.js";
export type {
  RegisteredScriptGraph,
  ScriptGraphStore,
  ScriptGraphStoreError,
  ScriptGraphStoreOptions,
} from "./runtime/script-graph/script-graph-store.js";
export { createAdaptiveSequencer } from "./runtime/script-graph/adaptive-sequencer.js";
export type { AdaptiveSequencerOptions } from "./runtime/script-graph/adaptive-sequencer.js";

// ——— Runtime: adaptive interviewer over the REAL agent runtime (STUDIO-004, §14) ———
export {
  createInterviewerSession,
  InterviewerSession,
  interviewerRepresentationIssues,
} from "./runtime/interviewer/interviewer-session.js";
export type { InterviewerSessionDeps } from "./runtime/interviewer/interviewer-session.js";
export {
  INTERVIEWER_AGENT_BODY,
  INTERVIEWER_AGENT_BODY_ID,
  INTERVIEWER_AGENT_BODY_VERSION,
} from "./runtime/interviewer/interviewer-agent-body.js";
export {
  createAgentInstanceInterviewerAgent,
  createAgentInstanceInterviewerBinding,
} from "./runtime/interviewer/agent-instance-interviewer.js";
export type {
  AgentInstanceInterviewerAgentOptions,
  AgentInstanceInterviewerBindingOptions,
} from "./runtime/interviewer/agent-instance-interviewer.js";

// ——— Runtime: audio-podcast flow + conversation graph (STUDIO-010/011) ———
// STUDIO-013 migrated the flow's final audio composition onto the W8-C
// EditingCompositionPort (ONE composition surface, ONE edit-graph record
// shape for every format) — the flow-local edit-graph recorder is gone.
export { createAudioPodcastFlow } from "./runtime/podcast/audio-podcast-flow.js";
export type {
  AudioPodcastFlowDeps,
  AudioPodcastFlowError,
  AudioPodcastFlowOutcome,
  AudioPodcastFlowResult,
  AudioPodcastProductionPlan,
  PodcastInterviewRound,
  PodcastParticipantPlan,
} from "./runtime/podcast/audio-podcast-flow.js";
export { buildConversationGraph } from "./runtime/podcast/conversation-graph.js";
export type { BuildConversationGraphInput } from "./runtime/podcast/conversation-graph.js";
export type { PodcastConversationGraph } from "./contracts/podcast-graphs.js";

// ——— Runtime: reaction flow (STUDIO-009, §16 reaction production) ———
// Rights-cleared source/reference artifacts imported as acquired inputs,
// human reactor capture through the REAL §15 gates (or synthetic-labeled
// personas with the generating capability named), §16 entry intermediates,
// and the organization's reaction-composition decisions composed through the
// W8-C EditingCompositionPort into the packaged output.
export { createReactionFlow } from "./runtime/reaction/reaction-flow.js";
export type { ReactionFlowDeps } from "./runtime/reaction/reaction-flow.js";
export type {
  ReactionFlowError,
  ReactionFlowOutcome,
  ReactionFlowResult,
  ReactionParticipantPlan,
  ReactionProductionPlan,
  ReactionSourcePlan,
} from "./runtime/reaction/reaction-plan.js";

// ——— Runtime: video-podcast flow (STUDIO-012, §14 + video capture) ———
// The W3-C audio-podcast architecture with MANDATORY video capture rounds
// (video + audio takes per round, the runtime's device gate enforcing the
// format's declared camera requirements), the adaptive interviewer in a video
// modality, transcripts + conversation graph, and the final video composed
// through the W8-C EditingCompositionPort.
export { createVideoPodcastFlow } from "./runtime/podcast/video-podcast-flow.js";
export type {
  VideoPodcastFlowDeps,
  VideoPodcastFlowError,
  VideoPodcastFlowOutcome,
  VideoPodcastFlowResult,
} from "./runtime/podcast/video-podcast-flow.js";
export type {
  VideoPodcastParticipantPlan,
  VideoPodcastProductionPlan,
} from "./runtime/podcast/video-podcast-plan.js";

// ——— Disclosed in-memory test doubles (NOT production bindings) ———
export { createInMemoryOrganizationSource, expandOrganizationSeed } from "./testing/in-memory-organization-source.js";
export type {
  InMemoryOrganizationSeed,
  InMemoryOrganizationSourceOptions,
} from "./testing/in-memory-organization-source.js";
export { createInMemoryArtifactFactory } from "./testing/in-memory-artifact-factory.js";
export type { InMemoryArtifactFactoryOptions } from "./testing/in-memory-artifact-factory.js";
export { createInMemoryTreatmentExecutor } from "./testing/in-memory-treatment-executor.js";
export type { InMemoryTreatmentExecutorOptions } from "./testing/in-memory-treatment-executor.js";
export { createInMemorySessionDirectory } from "./testing/in-memory-session-directory.js";
export type { InMemorySessionDirectoryOptions } from "./testing/in-memory-session-directory.js";
export {
  ANSWER_CONCLUDE,
  ANSWER_ELABORATE,
  createInMemoryScriptGraphGenerator,
  intentRecordFixture,
} from "./testing/in-memory-script-graph-generator.js";
export { createInMemoryInterviewerAgent } from "./testing/in-memory-interviewer-agent.js";
export type { InMemoryInterviewerAgentOptions } from "./testing/in-memory-interviewer-agent.js";

// ——— REAL interviewer agent stack over @mos/agents + @mos/agent-runtime (STUDIO-004) ———
// Composed at the disclosed testing seam: real body registry (interviewer
// AgentBody registered) + real instance registry over the single model
// boundary + the real substrate executor over the disclosed in-memory
// substrate double. The production TL composition root replaces the seam.
export { composeRealInterviewerAgentStack, TEST_INTERVIEWER_DEFAULT_MODEL } from "./testing/real-interviewer-agent.js";
export type {
  RealInterviewerAgentStack,
  RealInterviewerAgentStackOptions,
} from "./testing/real-interviewer-agent.js";

// ——— REAL participant-authority adapters + composition (STUDIO-006) ———
// The adapters compose the REAL @mos/identity / @mos/rights repositories
// behind the studio ports (identity/rights remain the authorities).
export {
  createParticipantIdentityPortFromRepository,
  createParticipantConsentPortFromRightsRepository,
} from "./testing/participant-authority-adapters.js";
export {
  composeRealParticipantAuthorities,
} from "./testing/real-participant-authorities.js";
export type {
  RealParticipantAuthorities,
  RealParticipantAuthoritiesOptions,
} from "./testing/real-participant-authorities.js";

// ——— AI editing / composition (STUDIO-008, §12/§13/§16/§19) ———
// The editing session: packaged artifact (or intermediates) + organization
// (whose Editor Pawn / §16-style edit decision points drive the choices —
// the ORG decides, the studio records) → NEW IMMUTABLE package version with
// a recorded edit graph. The W7-B Editor Pawn is composed through the
// production package's surfaces (registry-listed studio dependency); engine
// invocations run through the engines runner seam behind it (typed failures
// pass through verbatim); edit graphs interoperate through the ONE declared
// interchange format (§12).
export type * from "./contracts/editing-composition.js";
export type * from "./contracts/edit-graph-interop.js";
export { EDIT_COMPOSITION_KINDS, EDIT_KIND_TRANSFORM_ALIGNMENT } from "./contracts/editing-composition.js";
export {
  EDIT_GRAPH_INTERCHANGE_FORMAT,
  EDIT_GRAPH_INTERCHANGE_FORMAT_VERSION,
} from "./contracts/edit-graph-interop.js";
export type { EditingCompositionPort } from "./ports/editing-composition.port.js";
export { createEditingCompositionRuntime } from "./runtime/editing/editing-composition-runtime.js";
export type { EditingCompositionRuntimeOptions } from "./runtime/editing/editing-composition-runtime.js";
export {
  createEditorPawnBinding,
  EDITOR_PAWN_KIND,
  FINAL_ASSEMBLY_OPERATION_ID,
  executionFailureDetailOf,
  pawnOrganizationVersionOf,
} from "./runtime/editing/editor-pawn-binding.js";
export type {
  EditorCompositionRequest,
  EditorCompositionRun,
  EditorPawnBindingOptions,
} from "./runtime/editing/editor-pawn-binding.js";
export {
  validateEditChoices,
  validateOperationInputs,
} from "./runtime/editing/editing-validation.js";

// ——— DISCLOSED editing composition seam (STUDIO-008 testing) ———
// REAL agent-stack registries + the REAL engines runner + the REAL rights
// rule behind production's W7-B pawn surfaces, with the studio's disclosed
// in-memory artifact factory. NOT a production composition root.
export { composeEditingStack } from "./testing/compose-editing-stack.js";
export type {
  ComposeEditingStackOptions,
  EditingStack,
} from "./testing/compose-editing-stack.js";
export {
  EDITING_TRANSFORM_APPLICATION,
  EDITING_ORGANIZATION_REF,
  EDITING_ENGINE_RESOURCE_LIMITS,
  buildEditingSourcePackage,
  editingChoice,
  editingContributor,
  editingSessionInputOverPackage,
} from "./testing/editing-fixtures.js";

// ——— Artifact packaging authority + operator product surface (STUDIO-013/014, §6/§12/§14/§15/§19/§27/§30) ———
// THE canonical packaging path: every format flow (reaction, audio-podcast,
// video-podcast) composes its StudioArtifactPackage through the ONE authority
// behind StudioArtifactPackagingPort — contract-required fields complete BY
// CONSTRUCTION, gaps are typed failures (fail-closed battery), packages are
// immutable versioned append-only records (treatment → NEW version, historical
// versions never rewritten), provenance/consent consolidated truthfully
// (§14 labels, §15/§27 coverage of every raw artifact INCLUDING imported
// sources, §6 lineage traceable root→final). The session directory is the
// STUDIO-014 operator observation seam (session listing without a new runtime
// method — the runtime is at the 12-method policy budget).
export type * from "./contracts/artifact-packaging.js";
export type {
  StudioArtifactPackagingPort,
  StudioPackageSummary,
} from "./ports/artifact-packaging.port.js";
export type {
  StudioSessionDirectory,
  StudioSessionSummaryRecord,
} from "./ports/session-directory.port.js";
export { createStudioPackagingAuthority } from "./runtime/packaging/packaging-authority.js";
export type {
  StudioPackagingAuthorityOptions,
} from "./runtime/packaging/packaging-authority.js";


// ——— BRIDGE-001: the Lab → Studio bridge (the §24 boundary chain's
// Lab→Mission→Policy/Rights/Assets→Production/Studio segment) ———
// A SELECTED LAB-016 production program search candidate (a REAL
// @mos/production RankedCandidateProgram of a ProductionProgramSearchResult,
// identity-checked, versioned, provenance'd — never a raw caller-claimed
// shape) becomes a studio-side production entry through the gate ladder
// mission → policy → rights frame → assets coverage → the studio's OWN
// runtime surfaces (createSession + loadOrganization; STUDIO-007/013/014
// authorities never bypassed). Every attributable attempt appends ONE
// versioned tenant-scoped append-only record (W9-B D1–D5 by construction)
// carrying the authority verdicts VERBATIM and the BRIDGE-002 consumption
// surface (the candidate's declared expectations + the studio
// session/package refs). The mission/policy authority seams are studio-owned
// DECLARED PORTS (registry-exact: @mos/policy + @mos/missions are not studio
// registry dependencies) whose mirrors are compat-pinned against the REAL
// authority shapes (compat/bridge-authority-compat.ts — type-only relative
// imports, zero runtime edge; the REAL authorities run behind the ports in
// compat/bridge-real-authorities.test.ts). The bridge NEVER publishes and
// never calls providers: its output is a studio-side production entry (§24).
export type * from "./bridge/contracts/lab-to-studio-entry.js";
export { LAB_TO_STUDIO_BOUNDARY_STATEMENT } from "./bridge/contracts/lab-to-studio-entry.js";
export type * from "./bridge/contracts/bridge-authority-ports.js";
export { createLabToStudioBridge } from "./bridge/lab-to-studio-bridge.js";
export type {
  LabToStudioBridgeDeps,
  LabToStudioBridgePort,
  LabToStudioPackageRecordFailure,
} from "./bridge/lab-to-studio-bridge.js";
export { createLabToStudioEntryStore } from "./bridge/bridge-entry-store.js";
export type { LabToStudioEntryStore } from "./bridge/bridge-entry-store.js";
export { validateLabToStudioEntry } from "./bridge/bridge-validation.js";
export type {
  ValidatedEntryOutcome,
  ValidatedLabToStudioEntry,
} from "./bridge/bridge-validation.js";

// ——— DISCLOSED in-memory bridge authority doubles (BRIDGE-001 testing) ———
// Deterministic, self-labeling test seams for the mission/policy/rights gate
// ports — every double records the requests it received so tests can assert
// the EXACT frames the bridge emitted. NOT authorities: the REAL
// @mos/policy / @mos/missions / @mos/rights authorities are wired behind the
// same ports at the testing composition seam (real-bridge-authorities.ts +
// compat/bridge-real-authorities.test.ts).
export {
  createInMemoryBridgeMissionPort,
  createInMemoryProductionEntryPolicyGatePort,
  createInMemoryRightsGatePort,
} from "./bridge/adapters/in-memory-bridge-authorities.js";
export type {
  InMemoryBridgeMissionPortOptions,
  InMemoryProductionEntryPolicyGatePortOptions,
  InMemoryRightsGatePortOptions,
} from "./bridge/adapters/in-memory-bridge-authorities.js";

// ——— REAL authority adapters behind the bridge gate ports (BRIDGE-001
// testing/composition seam — the W10-C real-participant-authorities
// precedent) ———
// The adapters TRANSLATE onto the REAL authorities (the policy evaluation
// port, the mission repository read surface, the REAL evaluateRights cascade
// over the REAL rights repository); they never invent rules, grants,
// consents or verdicts. composeBridgeForTests is one deterministic
// composition (REAL studio runtime + REAL rights + disclosed
// mission/policy doubles).
export {
  composeBridgeForTests,
  createRealBridgeMissionPort,
  createRealBridgeRightsGate,
  createRealProductionEntryPolicyGate,
} from "./testing/real-bridge-authorities.js";
export type {
  ComposeBridgeForTestsOptions,
  ComposedBridgeForTests,
  RealBridgeMissionPortOptions,
  RealBridgeRightsGateOptions,
  RealProductionEntryPolicyGateOptions,
} from "./testing/real-bridge-authorities.js";
