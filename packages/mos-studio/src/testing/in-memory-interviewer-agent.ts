/**
 * DISCLOSED TEST DOUBLE — in-memory interviewer agent (STUDIO-003).
 *
 * FUTURE BINDING (AGT-002 — Worker B's same-wave `@mos/agents` package, NOT
 * in this base): a real interviewer agent instance with an explicit model
 * boundary will bind to `InterviewerAgentPort` and render the selected
 * question through its declared representation (voice/text/avatar/
 * prerecorded/generated/hybrid — architecture-lock #20).
 *
 * This double does NO generation and holds NO authority: it ECHOES the
 * question + representation + provenance it is handed (stamping only the
 * presentation timestamp) so the port contract — mandatory provenance
 * carried forward unchanged — is exercised without a second authority.
 */

import type {
  InterviewerAgentPort,
  InterviewerQuestionPresentationInput,
  InterviewerQuestionPresentationResult,
} from "../ports/interviewer-agent.js";
import type { Timestamp } from "../contracts/refs.js";

/** Options for {@link createInMemoryInterviewerAgent}. */
export interface InMemoryInterviewerAgentOptions {
  /** Injectable presentation clock (deterministic tests). */
  readonly clock?: () => Timestamp;
}

/** Create the disclosed in-memory interviewer agent double. */
export function createInMemoryInterviewerAgent(
  options: InMemoryInterviewerAgentOptions = {},
): InterviewerAgentPort {
  const clock = options.clock ?? (() => new Date().toISOString() as Timestamp);
  return {
    async presentQuestion(input: InterviewerQuestionPresentationInput): Promise<InterviewerQuestionPresentationResult> {
      if (input.question.text.trim().length === 0) {
        return { ok: false, error: { kind: "question-blank" } };
      }
      if (input.representation.representation !== "hybrid" && input.representation.provenance === undefined) {
        return { ok: false, error: { kind: "representation-provenance-missing" } };
      }
      const provenance =
        input.representation.representation === "hybrid"
          ? // A hybrid carries provenance per component; the presentation
            // reports the mixed union of its components' origins.
            {
              origin: input.representation.components.every((c) => c.provenance.origin === "human-performed")
                ? ("human-performed" as const)
                : input.representation.components.every((c) => c.provenance.origin === "synthetic-generated")
                  ? ("synthetic-generated" as const)
                  : ("mixed" as const),
            }
          : input.representation.provenance;
      return {
        ok: true,
        presentation: {
          questionNodeId: input.question.nodeId,
          questionText: input.question.text,
          representationKind: input.representation.representation,
          provenance,
          presentedAt: clock(),
        },
      };
    },
  };
}
