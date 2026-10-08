/**
 * DISCLOSED TEST COMPOSITION — the W9-C format-flow stack (STUDIO-009
 * reaction + STUDIO-012 video podcast).
 *
 * ONE shared composition for both format flows:
 * - the REAL `@mos/identity` + `@mos/rights` authorities
 *   (composeRealParticipantAuthorities) behind the studio's §15 participant
 *   ports — the SAME rights repository ALSO backs the editing stack's
 *   participant-consent gate and pawn rights gate (the `rightsRepository`
 *   option), so runtime joins, capture opens, editing-contributor gates and
 *   pawn executions all answer to ONE REAL rights authority;
 * - the W8-C editing stack (composeEditingStack) whose WRAPPED studio-side
 *   artifact factory is shared with the Studio runtime: every artifact the
 *   runtime or the flows create (captures, imported sources, entry
 *   intermediates, transcripts, composition outputs) registers in the REAL
 *   engines sandbox artifact store and records a REAL derived-work grant for
 *   the disclosed editing principal — chained pawn executions then pass the
 *   REAL rights gate;
 * - the Studio runtime with the three initial formats, the versioned
 *   organization loader over the disclosed in-memory source, and the
 *   disclosed in-memory capture source double;
 * - the reaction flow + the video-podcast flow (over the REAL interviewer
 *   agent stack for the adaptive interview), both composing their final
 *   artifacts through the W8-C EditingCompositionPort;
 * - the session organization is registered BOTH as the studio-loaded
 *   organization (in-memory source) AND as a pawn organization (editor node)
 *   so the SAME organization citation drives the session compatibility gate
 *   and the Editor Pawn composition.
 *
 * NOT a production composition root — the TL composition point binds durable
 * stores, real capture, the real organization authority and real engines
 * behind the same studio-owned ports.
 */

import { createStudioRuntime, type StudioRuntime } from "../runtime/studio-runtime.js";
import { createReactionFlow } from "../runtime/reaction/reaction-flow.js";
import { createVideoPodcastFlow } from "../runtime/podcast/video-podcast-flow.js";
import { createReactionFormatPlugin } from "../runtime/formats/reaction.js";
import { createVideoPodcastFormatPlugin } from "../runtime/formats/video-podcast.js";
import { createFormatRegistryWithInitialFormats } from "../runtime/formats/initial-formats.js";
import { createScriptGraphStore } from "../runtime/script-graph/script-graph-store.js";
import { createAdaptiveSequencer } from "../runtime/script-graph/adaptive-sequencer.js";
import { createStudioOrganizationLoader } from "../runtime/organization-loading/studio-organization-loader.js";
import { createInMemoryOrganizationSource } from "./in-memory-organization-source.js";
import { createInMemoryTreatmentExecutor } from "./in-memory-treatment-executor.js";
import { createInMemoryCaptureSourcePort } from "../runtime/capture/in-memory-capture-source.js";
import { composeRealInterviewerAgentStack, type RealInterviewerAgentStack } from "./real-interviewer-agent.js";
import { composeRealParticipantAuthorities, type RealParticipantAuthorities } from "./real-participant-authorities.js";
import { composeEditingStack, type EditingStack } from "./compose-editing-stack.js";
import {
  EDITING_ENGINE_RESOURCE_LIMITS,
  EDITING_PRINCIPAL,
  EDITING_STACK_TENANT,
  EDITING_TRANSFORM_APPLICATION,
} from "./editing-fixtures.js";
import { createDeterministicClock, createDeterministicIdFactory } from "./compose-runtime-for-tests.js";
import type { TenantId, Timestamp } from "../contracts/refs.js";
import type { StudioOrganizationRef } from "../contracts/organization-loading.js";

/**
 * The session organization: declares every capability the reaction and
 * video-podcast formats require, registered as BOTH the studio-loaded
 * organization and an editor-node pawn organization (version 1 on both
 * registrations — one citation everywhere).
 */
export const FLOW_ORGANIZATION = {
  id: "org-studio-format-flows",
  version: 1,
  declaredCapabilities: [
    "compose_reaction",
    "render_timeline",
    "transcribe_audio",
    "mix_audio",
    "compose_video",
    "evaluate_content",
  ],
} as const;

/** The organization citation the flows use (session load + editing composition). */
export const FLOW_ORGANIZATION_REF: StudioOrganizationRef = {
  id: FLOW_ORGANIZATION.id as StudioOrganizationRef["id"],
  version: FLOW_ORGANIZATION.version,
};

/** The composed format-flow scenario (+ inspection handles for the tests). */
export interface FormatFlowScenario {
  readonly tenantId: TenantId;
  readonly clock: () => Timestamp;
  readonly runtime: StudioRuntime;
  /** The shared (wrapped) artifact factory — engine-store + derived-grant aware. */
  readonly editingStack: EditingStack;
  readonly authorities: RealParticipantAuthorities;
  readonly interviewerStack: RealInterviewerAgentStack;
  readonly reactionFlow: ReturnType<typeof createReactionFlow>;
  readonly videoPodcastFlow: ReturnType<typeof createVideoPodcastFlow>;
  readonly scriptGraphStore: ReturnType<typeof createScriptGraphStore>;
}

/** Compose the shared reaction + video-podcast scenario (disclosed test composition). */
export function composeFormatFlowScenario(): FormatFlowScenario {
  const clock = createDeterministicClock();
  const tenantId = EDITING_STACK_TENANT;
  // The ONE REAL rights + identity authority pair behind every gate.
  const authorities = composeRealParticipantAuthorities({ now: clock });
  // The W8-C editing stack over the SHARED rights repository.
  const editingStack = composeEditingStack({ now: clock, rightsRepository: authorities.rightsRepository });
  // The session organization registered as an editor-node pawn organization.
  const pawnOrganization = editingStack.registerPawnOrganization({
    organizationId: FLOW_ORGANIZATION.id,
    evaluator: "evaluator:studio-format-flows",
  });
  if (pawnOrganization.id !== FLOW_ORGANIZATION.id || pawnOrganization.version !== FLOW_ORGANIZATION.version) {
    throw new Error(
      `format-flow organization registration mismatch: ${JSON.stringify(pawnOrganization)} vs ${JSON.stringify(FLOW_ORGANIZATION)}`,
    );
  }
  const runtime = createStudioRuntime({
    formatRegistry: createFormatRegistryWithInitialFormats(),
    organizationLoader: createStudioOrganizationLoader({
      source: createInMemoryOrganizationSource({ organizations: [FLOW_ORGANIZATION] }),
    }),
    artifactFactory: editingStack.artifactFactory,
    treatmentExecutor: createInMemoryTreatmentExecutor({
      artifactFactory: editingStack.artifactFactory,
      clock,
    }),
    captureSourcePort: createInMemoryCaptureSourcePort({ now: clock, fixedTakeSeconds: 42 }),
    participantIdentityPort: authorities.participantIdentityPort,
    participantConsentPort: authorities.participantConsentPort,
    clock,
    idFactory: createDeterministicIdFactory("id"),
  });
  // The adaptive-interview stack for the video podcast (STUDIO-004 binding).
  const interviewerStack = composeRealInterviewerAgentStack({ now: clock });
  const scriptGraphStore = createScriptGraphStore({ clock });
  const editing = {
    editing: editingStack.editing,
    editingOrganization: FLOW_ORGANIZATION_REF,
    editingActor: { kind: "identity" as const, principalId: EDITING_PRINCIPAL },
    transformApplication: EDITING_TRANSFORM_APPLICATION,
    engineResourceLimits: { ...EDITING_ENGINE_RESOURCE_LIMITS },
    seed: 7,
  };
  let interviewSessions = 0;
  let conversationGraphs = 0;
  const reactionFlow = createReactionFlow({
    runtime,
    artifactFactory: editingStack.artifactFactory,
    formatPlugin: createReactionFormatPlugin(),
    clock,
    ...editing,
  });
  const videoPodcastFlow = createVideoPodcastFlow({
    runtime,
    artifactFactory: editingStack.artifactFactory,
    formatPlugin: createVideoPodcastFormatPlugin(),
    store: scriptGraphStore,
    sequencer: createAdaptiveSequencer({ store: scriptGraphStore }),
    agentBinding: interviewerStack.agentBinding,
    agent: interviewerStack.agent,
    clock,
    nextInterviewSessionId: () => `ivs-video-${++interviewSessions}`,
    nextConversationGraphId: () => `cgraph-video-${++conversationGraphs}`,
    ...editing,
  });
  return {
    tenantId,
    clock,
    runtime,
    editingStack,
    authorities,
    interviewerStack,
    reactionFlow,
    videoPodcastFlow,
    scriptGraphStore,
  };
}
