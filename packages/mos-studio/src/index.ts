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
 * THE STUDIO NEVER PUBLISHES (architecture policy studio.noDirectPublication):
 * there is no distribution/provider/publish surface in this package —
 * asserted by src/runtime/no-publish.test.ts.
 */

// ——— Contracts (types only) ———
export type * from "./contracts/refs.js";
export type * from "./contracts/capture.js";
export type * from "./contracts/interviewer.js";
export type * from "./contracts/organization-loading.js";
export type * from "./contracts/studio-artifact-package.js";
export type * from "./contracts/studio-format.js";
export type * from "./contracts/studio-session.js";
export type * from "./contracts/treatment.js";

// ——— Ports (studio-owned dependency seams; Wave-1 disclosed doubles) ———
export type {
  StudioArtifactCreationInput,
  StudioArtifactCreationResult,
  StudioArtifactFactoryPort,
} from "./ports/artifact-factory.js";

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

// ——— Disclosed in-memory test doubles (NOT production bindings) ———
export { createInMemoryOrganizationLoader } from "./testing/in-memory-organization-loader.js";
export type {
  InMemoryOrganizationDefinition,
  InMemoryOrganizationLoaderOptions,
} from "./testing/in-memory-organization-loader.js";
export { createInMemoryArtifactFactory } from "./testing/in-memory-artifact-factory.js";
export type { InMemoryArtifactFactoryOptions } from "./testing/in-memory-artifact-factory.js";
export { createInMemoryTreatmentExecutor } from "./testing/in-memory-treatment-executor.js";
export type { InMemoryTreatmentExecutorOptions } from "./testing/in-memory-treatment-executor.js";
