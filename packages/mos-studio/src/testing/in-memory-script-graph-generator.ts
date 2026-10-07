/**
 * DISCLOSED TEST DOUBLE — deterministic in-memory script-graph generator
 * (STUDIO-003).
 *
 * The GENERATIVE step (intent → question/script CONTENT) is engine work in a
 * later wave (STUDIO-004 / ENG-002). This double derives a structurally valid
 * question/prompt/beat graph DETERMINISTICALLY from the intent statement —
 * no engine, no randomness — and labels every node `synthetic-generated`
 * with the generating intent, exactly as §14 demands of real generation.
 * The VERSIONED store remains the sole versioning authority: the double
 * returns a validated-shape DRAFT the store stamps with graphId/version.
 *
 * Derivation (fixed, documented — the tests pin it):
 * - `opening` beat  — "Open with the intent framing";
 * - `intro` prompt  — frames the first words of the statement;
 * - `core` question — asks about the statement subject (first 8 words);
 * - `deepen` question (branch on `answer-elaborate`) and
 *   `wrap` beat (branch on `answer-conclude`; `core`/`deepen` also declare
 *   `answer-conclude` branches);
 * - every (node, answer) branch key maps to exactly one successor.
 */

import type { IntentRecord, ScriptGraphDraft } from "../contracts/script-graph.js";
import type {
  ScriptGraphGenerationError,
  ScriptGraphGenerationInput,
  ScriptGraphGenerationResult,
  ScriptGraphGeneratorPort,
} from "../ports/script-graph-generator.js";
import type { AnswerRef, StudioFormatId } from "../contracts/refs.js";

/** Formats whose contracts are question-graph driven (mirrors STUDIO-002). */
const QUESTION_GRAPH_FORMATS: readonly string[] = ["audio-podcast", "video-podcast"];

/** The elaborate/conclude answer keys the double derives branches for. */
export const ANSWER_ELABORATE = "answer-elaborate" as AnswerRef;
export const ANSWER_CONCLUDE = "answer-conclude" as AnswerRef;

/** Create the disclosed deterministic in-memory generator double. */
export function createInMemoryScriptGraphGenerator(): ScriptGraphGeneratorPort {
  return {
    async generateScriptGraph(input: ScriptGraphGenerationInput): Promise<ScriptGraphGenerationResult> {
      const statement = input.intent.statement.trim();
      if (statement.length === 0) {
        const blank: ScriptGraphGenerationError = { kind: "intent-statement-blank", intentId: input.intent.intentId };
        return { ok: false, error: blank };
      }
      if (input.formatId !== undefined && !QUESTION_GRAPH_FORMATS.includes(String(input.formatId))) {
        const unsupported: ScriptGraphGenerationError = {
          kind: "format-unsupported-for-question-graphs",
          formatId: input.formatId as StudioFormatId,
        };
        return { ok: false, error: unsupported };
      }
      // Deterministic derivation of the statement's subject phrase.
      const words = statement.split(/\s+/);
      const subject = words.slice(0, 8).join(" ");
      const provenance = {
        origin: "synthetic-generated" as const,
        generatedFromIntent: input.intent.intentId,
      };
      const draft: ScriptGraphDraft = {
        intentId: input.intent.intentId,
        provenance,
        entryNodeId: "opening",
        nodes: [
          {
            nodeId: "opening",
            kind: "beat",
            description: "Open with the intent framing",
            provenance,
            defaultNextNodeId: "intro",
          },
          {
            nodeId: "intro",
            kind: "prompt",
            text: `Frame the conversation around: ${subject}`,
            provenance,
            defaultNextNodeId: "core",
          },
          {
            nodeId: "core",
            kind: "question",
            text: `What matters most about ${subject}?`,
            provenance,
          },
          {
            nodeId: "deepen",
            kind: "question",
            text: "Which part of that deserves a deeper follow-up?",
            provenance,
          },
          {
            nodeId: "wrap",
            kind: "beat",
            description: "Close the segment and hand the material to processing",
            provenance,
          },
        ],
        branchEdges: [
          { edgeId: "edge-core-elaborate", fromNodeId: "core", answerRef: ANSWER_ELABORATE, toNodeId: "deepen" },
          { edgeId: "edge-core-conclude", fromNodeId: "core", answerRef: ANSWER_CONCLUDE, toNodeId: "wrap" },
          { edgeId: "edge-deepen-conclude", fromNodeId: "deepen", answerRef: ANSWER_CONCLUDE, toNodeId: "wrap" },
        ],
      };
      return { ok: true, draft };
    },
  };
}

/** Convenience: an {@link IntentRecord} fixture builder for tests/edge seams. */
export function intentRecordFixture(input: {
  readonly statement: string;
  readonly tenantId: IntentRecord["tenantId"];
  readonly recordedBy: IntentRecord["recordedBy"];
  readonly inputKind?: IntentRecord["inputKind"];
  readonly intentId?: IntentRecord["intentId"];
  readonly sourceMaterialRefs?: readonly IntentRecord["sourceMaterialRefs"][number][];
}): IntentRecord {
  return {
    intentId: input.intentId ?? ("intent-1" as IntentRecord["intentId"]),
    tenantId: input.tenantId,
    statement: input.statement,
    sourceMaterialRefs: input.sourceMaterialRefs ?? [],
    inputKind: input.inputKind ?? "intent",
    recordedBy: input.recordedBy,
    recordedAt: "2026-01-06T00:00:00.000Z" as IntentRecord["recordedAt"],
  };
}
