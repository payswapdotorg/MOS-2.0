/**
 * The studio's interviewer AgentBody (STUDIO-004).
 *
 * A DATA record satisfying the canonical 14-field `AgentBody` contract
 * (`@mos/contracts`, frozen YAML) whose role contract is ADAPTIVE
 * INTERVIEWING (§14): present the sequencer-selected questions through the
 * declared interviewer representation, follow the declared branch graph,
 * never invent questions and never rewrite provenance.
 *
 * The body is registered into a REAL `@mos/agents` AgentBodyRegistry at the
 * composition seam (testing/real-interviewer-agent.ts registers version 1);
 * the studio itself never owns the registry (dependency matrix: studio
 * consumes agents, it is not the agents authority).
 *
 * Capability refs use the architecture §5 EXAMPLE capability ids
 * (generate_questions, generate_voice, animate_avatar). They are declared
 * refs here — capability-source validation happens at the TL composition
 * root where the REAL @mos/capabilities registry is wired into the body
 * registry (the agents registry validates shape-only when no capability
 * source is injected; disclosed).
 *
 * The body pins NO model and NO runtime (AGT-002: bodies never pin models —
 * model selection stays behind the single model boundary).
 */

import type { AgentBody, CapabilityId } from "@mos/contracts";

/** The studio interviewer agent body id. */
export const INTERVIEWER_AGENT_BODY_ID = "studio-interviewer" as AgentBody["id"];

/** Body version (monotonic; content evolution requires a new version). */
export const INTERVIEWER_AGENT_BODY_VERSION = 1 as AgentBody["version"];

/**
 * The interviewer AgentBody descriptor. Frozen data — registering it into a
 * body registry copies nothing (records are immutable).
 */
export const INTERVIEWER_AGENT_BODY: Readonly<AgentBody> = Object.freeze({
  id: INTERVIEWER_AGENT_BODY_ID,
  version: INTERVIEWER_AGENT_BODY_VERSION,
  roleContract: Object.freeze({
    summary:
      "Adaptive interviewer for Studio interview sessions: presents the sequencer-selected questions through the declared interviewer representation and follows the declared question/branch graph (spec §14).",
    duties: Object.freeze([
      "Present the already-selected question through the declared interviewer representation (voice/text/avatar/prerecorded/generated/hybrid).",
      "Follow the adaptive sequencer's branch selection over the declared question/branch graph — never invent questions or branches.",
      "Carry the representation's provenance forward unchanged; keep synthetic/generated interviewer material labeled synthetic-generated or mixed (§14).",
      "Yield the conversation to the human participant after each question; never answer for the participant.",
    ]),
  }),
  inputContract: Object.freeze({
    type: "object",
    properties: {
      purpose: { type: "string", const: "present-question" },
      graphId: { type: "string" },
      graphVersion: { type: "number" },
      questionNodeId: { type: "string" },
      questionText: { type: "string" },
      representationKind: {
        type: "string",
        enum: ["voice", "text", "avatar", "prerecorded", "generated", "hybrid"],
      },
    },
    required: ["purpose", "graphId", "graphVersion", "questionNodeId", "questionText", "representationKind"],
  }),
  outputContract: Object.freeze({
    type: "object",
    properties: {
      renderedQuestion: { type: "string" },
      representationKind: { type: "string" },
    },
    required: ["renderedQuestion", "representationKind"],
  }),
  actionInterface: Object.freeze({
    type: "object",
    properties: {
      presentQuestion: { type: "boolean", const: true },
    },
    required: ["presentQuestion"],
  }),
  // The interviewer presents questions; it invokes no tools of its own.
  tools: Object.freeze([]),
  permissions: Object.freeze([]),
  memory: Object.freeze({ scope: "session" }),
  communication: Object.freeze({
    // The interviewer only responds within the interview turn structure.
    mayInitiate: false,
    allowedTopics: Object.freeze(["interview-questions"]),
  }),
  capabilities: Object.freeze([
    "generate_questions" as CapabilityId,
    "generate_voice" as CapabilityId,
    "animate_avatar" as CapabilityId,
  ]),
  budget: Object.freeze({
    maxCost: Object.freeze({ amount: 1, currency: "USD" }),
    maxDurationMs: 300_000,
  }),
  latency: Object.freeze({ p50Ms: 400, p95Ms: 1_500, p99Ms: 4_000 }),
  evaluator: "evaluator:studio:interviewer@1" as AgentBody["evaluator"],
  safety: Object.freeze({
    // AGENTS.md "Safety" list — the interviewer never impersonates a human
    // (synthetic interviewer material stays labeled) and never fabricates
    // attribution or circumvents rights.
    prohibitions: Object.freeze([
      "impersonation",
      "fabricated-testimonials",
      "deceptive-attribution",
      "rights-circumvention",
      "fake-engagement",
      "coordinated-inauthentic-behavior",
      "anti-abuse-bypass",
    ]),
  }),
});
