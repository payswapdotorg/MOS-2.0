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
  JoinParticipantRequest,
  OpenCaptureRequest,
  StandaloneSessionIntent,
  StandaloneSessionIntentOrganizationRefInput,
  StudioProcessingOutput,
  SubmitReviewInput,
} from "./runtime/intake-types.js";
export type {
  CreatedSessionValue,
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

// ——— Runtime: audio-podcast flow + conversation/edit graphs (STUDIO-010/011) ———
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
export { recordEditDecisions } from "./runtime/podcast/edit-graph.js";
export type { RecordEditDecisionsInput } from "./runtime/podcast/edit-graph.js";

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
