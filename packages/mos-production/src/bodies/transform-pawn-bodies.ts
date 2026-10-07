/**
 * The ten §9 transform pawn bodies (LAB-013).
 *
 * Each pawn is a REAL AgentBody (the frozen 14-field contract) plus its
 * transform-domain role contract. The builder derives the canonical agent
 * body from the role so the two halves can never disagree (capabilities =
 * served capabilities; tools = the derived engine tool refs). The bodies
 * are DATA: capability ids come from the §5 example list; engine ids are
 * fictional-but-plausible registered-engine citations (the composition
 * root binds engines that are ACTUALLY registered in the engine registry —
 * these declarations are the tool-ref data the runner submissions cite).
 *
 * Model flavors (§9: "a pawn may invoke deterministic engines and does not
 * need to be an LLM"): eight deterministic pawns (no model binding — ever,
 * pinned) and two llm-flavored pawns (podcast-interviewer: pure agent
 * execution; question-designer: engine invocation + agent execution — the
 * composite path).
 */

import type {
  AgentBody,
  Budget,
  CapabilityId,
  EngineId,
  EvaluatorRef,
  LatencyModel,
  PermissionRef,
  ToolRef,
  Version,
} from "@mos/contracts";

import type {
  PawnEngineToolBinding,
  PawnModelFlavor,
  PawnTransformKind,
  TransformPawnKind,
  TransformPawnRoleContract,
} from "../contracts/pawn-role.js";
import type { TransformPawnBody } from "../contracts/pawn-body.js";
import { engineToolRef } from "../contracts/pawn-body.js";
import type { PawnAgentBodyId } from "../contracts/pawn-ids.js";

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** The AGENTS.md "Safety" prohibitions — the vocabulary every pawn declares. */
const SAFETY_PROHIBITIONS: readonly string[] = Object.freeze([
  "fake-engagement",
  "coordinated-inauthentic-behavior",
  "anti-abuse-bypass",
  "impersonation",
  "fabricated-testimonials",
  "deceptive-attribution",
  "rights-circumvention",
]);

/** Builder input: the role dimensions plus body-declared budgets/latency. */
interface PawnBodySpec {
  readonly pawnKind: TransformPawnKind;
  readonly summary: string;
  readonly duties: readonly string[];
  readonly servedTransformKinds: readonly PawnTransformKind[];
  readonly servedCapabilities: readonly string[];
  readonly engineTools: readonly PawnEngineToolBinding[];
  readonly modelFlavor: PawnModelFlavor;
  readonly memoryScope: "none" | "session";
  readonly budget: Budget;
  readonly latency: LatencyModel;
}

function capabilityIdOf(id: string): CapabilityId {
  return id as CapabilityId;
}

function versionOf(version: number): Version {
  return version as Version;
}

function engineIdOf(id: string): EngineId {
  return id as EngineId;
}

/** One engine tool binding, tersely. */
function tool(
  capability: string,
  engine: string,
): PawnEngineToolBinding {
  return {
    capabilityId: capabilityIdOf(capability),
    capabilityVersion: versionOf(1),
    engineId: engineIdOf(engine),
    engineVersion: versionOf(1),
  };
}

/** Builds one transform pawn body: the role + the coherently derived agent body. */
function buildPawnBody(spec: PawnBodySpec): TransformPawnBody {
  const role: TransformPawnRoleContract = {
    pawnKind: spec.pawnKind,
    servedTransformKinds: Object.freeze([...spec.servedTransformKinds]),
    servedCapabilities: Object.freeze(spec.servedCapabilities.map(capabilityIdOf)),
    engineTools: Object.freeze([...spec.engineTools]),
    modelFlavor: spec.modelFlavor,
  };
  const tools: readonly ToolRef[] = Object.freeze(
    spec.engineTools.map((binding) => engineToolRef(binding)),
  );
  const agentBody: AgentBody = {
    id: `pawn:${spec.pawnKind}` as PawnAgentBodyId,
    version: versionOf(1),
    roleContract: {
      summary: spec.summary,
      duties: Object.freeze([...spec.duties]),
    },
    inputContract: {
      type: "object",
      required: ["transformApplication", "inputArtifactRefs", "parameters"],
      properties: {
        transformApplication: {
          type: "object",
          description: "The LAB-011/012 transform application citation (definition at an exact version).",
        },
        inputArtifactRefs: {
          type: "array",
          description: "Input artifact refs (media bytes stay in object storage).",
        },
        parameters: { type: "object", description: "Declared parameterization of the application." },
      },
    },
    outputContract: {
      type: "object",
      required: ["outputArtifactRefs"],
      properties: {
        outputArtifactRefs: { type: "array", description: "Produced artifact refs of the applied transform." },
      },
    },
    tools,
    permissions: Object.freeze([
      "permission:production/transform-execution" as PermissionRef,
    ]),
    memory: { scope: spec.memoryScope },
    communication: {
      mayInitiate: false,
      allowedTopics: Object.freeze(["transform-execution"]),
    },
    actionInterface: {
      type: "object",
      description:
        spec.modelFlavor === "llm-flavored"
          ? "Executes as a bound agent instance through the instance executor (model via the single model-runtime boundary)."
          : "Applies the transform by submitting EngineJobs through the engine runner seam (no model binding).",
    },
    capabilities: Object.freeze(spec.servedCapabilities.map(capabilityIdOf)),
    budget: spec.budget,
    latency: spec.latency,
    evaluator: `evaluator:pawn/${spec.pawnKind}` as EvaluatorRef,
    safety: { prohibitions: SAFETY_PROHIBITIONS },
  };
  return { role, agentBody };
}

// ---------------------------------------------------------------------------
// The ten §9 pawn bodies
// ---------------------------------------------------------------------------

function budget(maxCost: number, maxDurationMs: number): Budget {
  return { maxCost: { amount: maxCost, currency: "USD" }, maxDurationMs };
}

function latency(p50: number, p95: number, p99: number): LatencyModel {
  return { p50Ms: p50, p95Ms: p95, p99Ms: p99 };
}

const CLIP_SELECTION_PAWN = buildPawnBody({
  pawnKind: "clip-selection",
  summary: "Selects the strongest clips from a source artifact for clip/compilation transforms.",
  duties: [
    "Rank candidate clip windows by relevance to the declared objective",
    "Submit rank_clip_candidates EngineJobs through the runner seam",
    "Record selected clip outputs with full lineage",
  ],
  servedTransformKinds: ["clip", "compilation"],
  servedCapabilities: ["rank_clip_candidates"],
  engineTools: [tool("rank_clip_candidates", "engine:clip-ranker")],
  modelFlavor: "deterministic",
  memoryScope: "none",
  budget: budget(0.5, 120_000),
  latency: latency(2_000, 8_000, 20_000),
});

const HOOK_EXTRACTION_PAWN = buildPawnBody({
  pawnKind: "hook-extraction",
  summary: "Extracts high-retention hooks (semantic highlights) from source content.",
  duties: [
    "Score source segments by semantic relevance to the target audience",
    "Submit semantic_video_relevance EngineJobs through the runner seam",
    "Emit hook candidates with provenance of the scoring engine",
  ],
  servedTransformKinds: ["clip", "compilation", "remix"],
  servedCapabilities: ["semantic_video_relevance"],
  engineTools: [tool("semantic_video_relevance", "engine:relevance-scorer")],
  modelFlavor: "deterministic",
  memoryScope: "none",
  budget: budget(0.5, 120_000),
  latency: latency(2_500, 10_000, 25_000),
});

const REACTION_COMPOSITION_PAWN = buildPawnBody({
  pawnKind: "reaction-composition",
  summary: "Composes a reaction artifact (source + reaction capture) into the final layout.",
  duties: [
    "Compose reaction captures with their source artifacts (PIP layouts)",
    "Submit compose_reaction EngineJobs through the runner seam",
    "Preserve participant provenance on the composed output",
  ],
  servedTransformKinds: ["reaction"],
  servedCapabilities: ["compose_reaction"],
  engineTools: [tool("compose_reaction", "engine:reaction-composer")],
  modelFlavor: "deterministic",
  memoryScope: "none",
  budget: budget(1, 300_000),
  latency: latency(5_000, 20_000, 60_000),
});

const PODCAST_INTERVIEWER_PAWN = buildPawnBody({
  pawnKind: "podcast-interviewer",
  summary: "Conducts the adaptive interview of a one-person podcast session.",
  duties: [
    "Present the sequenced interview questions adaptively",
    "Execute as a bound agent instance through the single model boundary",
    "Carry interviewer provenance into the conversation record",
  ],
  servedTransformKinds: ["podcast"],
  servedCapabilities: ["generate_questions"],
  engineTools: [],
  modelFlavor: "llm-flavored",
  memoryScope: "session",
  budget: budget(2, 600_000),
  latency: latency(1_500, 6_000, 15_000),
});

const QUESTION_DESIGNER_PAWN = buildPawnBody({
  pawnKind: "question-designer",
  summary: "Designs interview questions from source transcripts (engine-assisted, model-generated).",
  duties: [
    "Transcribe the source artifact through the runner seam first",
    "Design the question set from the transcript as a bound agent instance",
    "Record engine + agent provenance on every designed question",
  ],
  servedTransformKinds: ["podcast", "reaction", "compilation"],
  servedCapabilities: ["transcribe_audio", "generate_questions"],
  engineTools: [tool("transcribe_audio", "engine:transcriber")],
  modelFlavor: "llm-flavored",
  memoryScope: "session",
  budget: budget(2, 600_000),
  latency: latency(3_000, 12_000, 30_000),
});

const SCENE_LAYOUT_PAWN = buildPawnBody({
  pawnKind: "scene-layout",
  summary: "Detects scenes and lays out the composition plan for framing/stylization transforms.",
  duties: [
    "Detect scene boundaries in the source artifact",
    "Plan crop/reframe layouts against the detected scenes",
    "Submit detect_scenes EngineJobs through the runner seam",
  ],
  servedTransformKinds: ["crop-reframe", "stylization-anime", "ai-generated", "hybrid"],
  servedCapabilities: ["detect_scenes"],
  engineTools: [tool("detect_scenes", "engine:scene-detector")],
  modelFlavor: "deterministic",
  memoryScope: "none",
  budget: budget(0.8, 180_000),
  latency: latency(3_000, 12_000, 30_000),
});

const EDITOR_PAWN = buildPawnBody({
  pawnKind: "editor",
  summary: "Edits and renders timelines of remix/compilation/hybrid compositions.",
  duties: [
    "Assemble the declared edit decisions into a timeline",
    "Submit render_timeline EngineJobs through the runner seam",
    "Emit the rendered composition with immutable lineage",
  ],
  servedTransformKinds: ["remix", "compilation", "hybrid"],
  servedCapabilities: ["render_timeline"],
  engineTools: [tool("render_timeline", "engine:timeline-renderer")],
  modelFlavor: "deterministic",
  memoryScope: "none",
  budget: budget(1.5, 600_000),
  latency: latency(10_000, 45_000, 120_000),
});

const CAPTION_PAWN = buildPawnBody({
  pawnKind: "caption",
  summary: "Produces captions by transcribing the audio of the target artifact.",
  duties: [
    "Transcribe the artifact's audio track",
    "Align transcript segments to the timeline",
    "Submit transcribe_audio EngineJobs through the runner seam",
  ],
  servedTransformKinds: ["clip", "compilation", "reaction", "podcast", "voiceover", "hybrid"],
  servedCapabilities: ["transcribe_audio"],
  engineTools: [tool("transcribe_audio", "engine:transcriber")],
  modelFlavor: "deterministic",
  memoryScope: "none",
  budget: budget(0.6, 180_000),
  latency: latency(4_000, 15_000, 40_000),
});

const DUBBING_PAWN = buildPawnBody({
  pawnKind: "dubbing",
  summary: "Generates the dubbed voice track for translation/dubbing transforms.",
  duties: [
    "Generate the target-language voice track from the script",
    "Submit generate_voice EngineJobs through the runner seam",
    "Preserve voice provenance and rights references",
  ],
  servedTransformKinds: ["translation-dubbing", "voiceover"],
  servedCapabilities: ["generate_voice"],
  engineTools: [tool("generate_voice", "engine:voice-synth")],
  modelFlavor: "deterministic",
  memoryScope: "none",
  budget: budget(1.2, 600_000),
  latency: latency(8_000, 30_000, 90_000),
});

const QUALITY_CRITIC_PAWN = buildPawnBody({
  pawnKind: "quality-critic",
  summary: "Evaluates produced artifacts against quality thresholds (any transform kind).",
  duties: [
    "Evaluate candidate outputs against the declared quality criteria",
    "Submit evaluate_content EngineJobs through the runner seam",
    "Record the evaluation verdict with engine provenance",
  ],
  servedTransformKinds: [
    "no-op-repost",
    "clip",
    "crop-reframe",
    "remix",
    "compilation",
    "reaction",
    "podcast",
    "translation-dubbing",
    "voiceover",
    "stylization-anime",
    "ai-generated",
    "human-contribution",
    "hybrid",
  ],
  servedCapabilities: ["evaluate_content"],
  engineTools: [tool("evaluate_content", "engine:content-evaluator")],
  modelFlavor: "deterministic",
  memoryScope: "none",
  budget: budget(0.4, 120_000),
  latency: latency(2_000, 9_000, 25_000),
});

/**
 * The ten §9 transform pawn bodies, in declaration order (frozen). Eight
 * deterministic (no model binding — pinned) and two llm-flavored
 * (podcast-interviewer, question-designer).
 */
export const TRANSFORM_PAWN_BODIES: readonly TransformPawnBody[] = Object.freeze([
  CLIP_SELECTION_PAWN,
  HOOK_EXTRACTION_PAWN,
  REACTION_COMPOSITION_PAWN,
  PODCAST_INTERVIEWER_PAWN,
  QUESTION_DESIGNER_PAWN,
  SCENE_LAYOUT_PAWN,
  EDITOR_PAWN,
  CAPTION_PAWN,
  DUBBING_PAWN,
  QUALITY_CRITIC_PAWN,
]);
Object.freeze(CLIP_SELECTION_PAWN);
Object.freeze(HOOK_EXTRACTION_PAWN);
Object.freeze(REACTION_COMPOSITION_PAWN);
Object.freeze(PODCAST_INTERVIEWER_PAWN);
Object.freeze(QUESTION_DESIGNER_PAWN);
Object.freeze(SCENE_LAYOUT_PAWN);
Object.freeze(EDITOR_PAWN);
Object.freeze(CAPTION_PAWN);
Object.freeze(DUBBING_PAWN);
Object.freeze(QUALITY_CRITIC_PAWN);
