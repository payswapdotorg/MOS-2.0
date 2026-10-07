/**
 * Script / question graph contracts for the Studio interview system
 * (STUDIO-003, spec/mos-architecture-v2.0.md §14).
 *
 * §14: "Studio accepts a complete script, a question list, an intent, or an
 * intent + source material. Intent-only generation produces a VERSIONED
 * script/question graph with provenance. Adaptive follow-up questions can be
 * selected from a declared question/branch graph based on answers. Generated
 * interviewer material retains synthetic/generated provenance."
 *
 * This module is the TYPE layer of that system:
 * - {@link IntentRecord}: the immutable user-intent record a graph is
 *   generated FROM (statement + optional source material refs);
 * - {@link ScriptGraph}: a VERSIONED graph of question/prompt/beat nodes with
 *   branch edges keyed by answer refs; every node and the graph itself carry
 *   a mandatory provenance label (`synthetic-generated` for intent-derived
 *   material — deceptive attribution is forbidden, AGENTS.md "Safety");
 * - {@link ScriptGraphVersionRef}: the exact-version reference consumers use
 *   (a version change is an explicit new binding, never a silent swap).
 *
 * The runtime layer (runtime/script-graph/) owns versioned storage and
 * deterministic adaptive selection; the GENERATIVE step is a port
 * (ports/script-graph-generator.ts) bound to an engine-backed implementation
 * in a later wave (STUDIO-004 / ENG-002) — the disclosed in-memory double
 * lives in testing/in-memory-script-graph-generator.ts.
 */

import type {
  AnswerRef,
  ArtifactId,
  CapabilityId,
  IdentityRef,
  IntentRecordId,
  ScriptGraphId,
  StudioFormatId,
  TenantId,
  Timestamp,
  Version,
} from "./refs.js";

// ---------------------------------------------------------------------------
// Intent records (§14 input side)
// ---------------------------------------------------------------------------

/** How the user supplied the material the session works from. */
export type ScriptInputKind =
  | "complete-script"
  | "question-list"
  | "intent"
  | "intent-with-source-material";

/**
 * An immutable recorded user intent (§14). The statement is the objective in
 * the user's own words; source material refs are optional. Intent records
 * never change — regenerating produces a NEW graph version, never an edit of
 * the recorded intent.
 */
export interface IntentRecord {
  readonly intentId: IntentRecordId;
  readonly tenantId: TenantId;
  /** The user's intent statement (objective), verbatim. */
  readonly statement: string;
  /** Source material the intent refers to (optional, §14). */
  readonly sourceMaterialRefs: readonly ArtifactId[];
  /** Input kind the user supplied (mirrors the format's accepted inputs). */
  readonly inputKind: ScriptInputKind;
  /** Target format, when the user already chose one. */
  readonly formatId?: StudioFormatId;
  /** Who recorded the intent (standalone user or Lab decision). */
  readonly recordedBy: IdentityRef;
  readonly recordedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Provenance labels (§14: synthetic/generated material is always labeled)
// ---------------------------------------------------------------------------

/** Origin of script/question material (mirrors interviewer.ts vocabulary). */
export type ScriptMaterialOrigin = "human-authored" | "synthetic-generated" | "mixed";

/**
 * Mandatory provenance label on every script-graph node and on the graph
 * itself. `synthetic-generated` MUST name the generating intent (and the
 * generating capability when one was used) so attribution stays truthful
 * end-to-end (§14, §27, §30).
 */
export interface ScriptGraphProvenance {
  readonly origin: ScriptMaterialOrigin;
  /** The intent the material was generated from (required when synthetic). */
  readonly generatedFromIntent?: IntentRecordId;
  /** Capability that generated the material (e.g. generate_questions). */
  readonly generatorCapability?: CapabilityId;
}

// ---------------------------------------------------------------------------
// Graph nodes and branch edges
// ---------------------------------------------------------------------------

/** Node kinds of a script/question graph (§14: questions, prompts, beats). */
export type ScriptGraphNodeKind = "question" | "prompt" | "beat";

/** Fields every graph node carries. */
interface ScriptGraphNodeBase {
  /** Graph-local node id (unique within one graph version). */
  readonly nodeId: string;
  readonly kind: ScriptGraphNodeKind;
  /** Mandatory provenance label (§14 — synthetic material is never unlabeled). */
  readonly provenance: ScriptGraphProvenance;
  /**
   * Declared fallback successor when no branch edge matches the answer:
   * deterministic, explicit, never guessed. Omit on terminal nodes.
   */
  readonly defaultNextNodeId?: string;
}

/** A question asked of the participant (interview flow). */
export interface QuestionScriptGraphNode extends ScriptGraphNodeBase {
  readonly kind: "question";
  readonly text: string;
}

/** A prompt delivered to the participant (instruction / framing). */
export interface PromptScriptGraphNode extends ScriptGraphNodeBase {
  readonly kind: "prompt";
  readonly text: string;
}

/** A production beat of the script (segment marker, pacing, direction). */
export interface BeatScriptGraphNode extends ScriptGraphNodeBase {
  readonly kind: "beat";
  readonly description: string;
}

/** Discriminated union of graph nodes — narrow on `kind`. */
export type ScriptGraphNode =
  | QuestionScriptGraphNode
  | PromptScriptGraphNode
  | BeatScriptGraphNode;

/**
 * One declared branch edge: `fromNodeId` + the participant's {@link AnswerRef}
 * select `toNodeId`. Branch selection is DECLARED data — the sequencer never
 * invents branches.
 */
export interface ScriptGraphBranchEdge {
  readonly edgeId: string;
  readonly fromNodeId: string;
  /** The answer ref that selects this branch (§14 "based on answers"). */
  readonly answerRef: AnswerRef;
  readonly toNodeId: string;
}

// ---------------------------------------------------------------------------
// The versioned graph
// ---------------------------------------------------------------------------

/** Exact-version reference to a script/question graph. */
export interface ScriptGraphVersionRef {
  readonly graphId: ScriptGraphId;
  readonly version: Version;
}

/**
 * A versioned script/question graph (§14). Graphs are IMMUTABLE: edits
 * produce a new `version` under the same `graphId`; older versions remain
 * resolvable (audit + reproducibility, §6/§30).
 */
export interface ScriptGraph {
  readonly graphId: ScriptGraphId;
  /** Immutable monotonic version (starts at 1). */
  readonly version: Version;
  /** The intent this graph was generated from (when intent-derived). */
  readonly intentId?: IntentRecordId;
  /** Graph-level mandatory provenance label. */
  readonly provenance: ScriptGraphProvenance;
  /** Node the interview starts at. */
  readonly entryNodeId: string;
  readonly nodes: readonly ScriptGraphNode[];
  readonly branchEdges: readonly ScriptGraphBranchEdge[];
  readonly createdAt: Timestamp;
}

/**
 * A draft handed to the versioned store: everything except the assigned
 * `graphId`/`version`/`createdAt` (the store owns those, §6 versioning).
 */
export type ScriptGraphDraft = Omit<ScriptGraph, "graphId" | "version" | "createdAt">;

/**
 * A revision of an EXISTING graph: same `graphId`, new content — the store
 * assigns the next version; the previous versions stay untouched/resolvable.
 */
export type ScriptGraphRevision = ScriptGraphDraft;
