/**
 * Edit-graph recorder (STUDIO-011).
 *
 * The ORGANIZATION decides edit points; the STUDIO records them (§16-style:
 * the podcast format declares the open decision points, the loaded
 * organization decides them, this module records the decisions as an
 * append-only versioned graph).
 *
 * Fail-closed discipline:
 * - a decision referencing a decision point the format did NOT declare is
 *   rejected (`decision-point-not-declared`) — the studio never accepts
 *   decisions for points it never exposed;
 * - a decision targeting a conversation node that does not exist is
 *   rejected (`conversation-node-not-found`);
 * - malformed decisions (blank ids, empty targets, reorder without an
 *   ordering, unknown kinds) are rejected with enumerated reasons.
 *
 * DISCLOSED (same-wave dependency pattern): until STUDIO-008 (editing and
 * composition inside the organization runtime) lands, edit decisions arrive
 * as caller-supplied recorded data — the flow's caller stands in for the
 * organization's decision output. The recorder, validation and versioning
 * are REAL studio logic and survive the future binding unchanged.
 */

import type {
  EditDecisionKind,
  EditGraphError,
  PodcastEditGraph,
  RecordedEditDecision,
} from "../../contracts/podcast-graphs.js";
import type { EditGraphId, ContractVersion, Timestamp } from "../../contracts/refs.js";
import type { StudioOrganizationRef } from "../../contracts/organization-loading.js";
import type { StudioFormatPlugin } from "../../contracts/studio-format.js";

const EDIT_DECISION_KINDS: readonly EditDecisionKind[] = ["keep", "trim", "cut", "reorder"];

/** Input of {@link recordEditDecisions}. */
export interface RecordEditDecisionsInput {
  /** The format whose declared organization decision points constrain the decisions. */
  readonly formatPlugin: StudioFormatPlugin;
  /** The conversation-graph node ids that exist (targets must resolve). */
  readonly conversationNodeIds: readonly string[];
  /** The organization version that made the decisions. */
  readonly decidedByOrganization: StudioOrganizationRef;
  readonly decisions: readonly Omit<RecordedEditDecision, "decidedByOrganization">[];
  readonly graphId: EditGraphId;
  readonly version: ContractVersion;
  readonly recordedAt: Timestamp;
  /** Whether an OpenTimelineIO interchange export exists (§12). */
  readonly otioInterchange?: boolean;
}

/** Structural validation of one edit decision (enumerated reasons). */
function editDecisionIssues(decision: Omit<RecordedEditDecision, "decidedByOrganization">): string[] {
  const reasons: string[] = [];
  if (typeof decision.decisionId !== "string" || decision.decisionId.trim().length === 0) {
    reasons.push("decisionId must be a non-blank string");
  }
  if (typeof decision.decisionPointId !== "string" || decision.decisionPointId.trim().length === 0) {
    reasons.push("decisionPointId must be a non-blank string");
  }
  if (!EDIT_DECISION_KINDS.includes(decision.decision?.kind)) {
    reasons.push(`decision.kind must be one of ${EDIT_DECISION_KINDS.join(" | ")}`);
  }
  if (!Array.isArray(decision.decision?.targetConversationNodeIds) || decision.decision.targetConversationNodeIds.length === 0) {
    reasons.push("decision.targetConversationNodeIds must be a non-empty array");
  }
  if (decision.decision?.kind === "reorder") {
    if (decision.decision.reorderedTo === undefined || decision.decision.reorderedTo.length === 0) {
      reasons.push("reorder decisions must declare reorderedTo (the new ordering)");
    } else if (decision.decision.reorderedTo.length !== decision.decision.targetConversationNodeIds.length) {
      reasons.push("reorderedTo must order exactly the target conversation nodes");
    }
  }
  if (decision.decidedAt === undefined) {
    reasons.push("decidedAt must be present");
  }
  return reasons;
}

/** Record the organization's edit decisions into a versioned edit graph. */
export function recordEditDecisions(
  input: RecordEditDecisionsInput,
): { ok: true; graph: PodcastEditGraph } | { ok: false; error: EditGraphError } {
  const declaredPointIds = (input.formatPlugin.organizationDecisionPoints ?? []).map(
    (point) => point.pointId,
  );
  const knownNodes = new Set(input.conversationNodeIds);
  const seenDecisionIds = new Set<string>();
  const decisions: RecordedEditDecision[] = [];
  for (const decision of input.decisions) {
    const issues = editDecisionIssues(decision);
    if (issues.length > 0) {
      return { ok: false, error: { kind: "edit-decision-malformed", decisionId: String(decision.decisionId), reasons: issues } };
    }
    if (seenDecisionIds.has(decision.decisionId)) {
      return {
        ok: false,
        error: {
          kind: "edit-decision-malformed",
          decisionId: decision.decisionId,
          reasons: ["decisionId is recorded more than once"],
        },
      };
    }
    seenDecisionIds.add(decision.decisionId);
    if (!declaredPointIds.includes(decision.decisionPointId)) {
      return {
        ok: false,
        error: {
          kind: "decision-point-not-declared",
          decisionPointId: decision.decisionPointId,
          declaredPointIds,
        },
      };
    }
    for (const nodeId of decision.decision.targetConversationNodeIds) {
      if (!knownNodes.has(nodeId)) {
        return {
          ok: false,
          error: { kind: "conversation-node-not-found", nodeId, decisionId: decision.decisionId },
        };
      }
    }
    decisions.push(
      Object.freeze({
        ...decision,
        decidedByOrganization: Object.freeze({ ...input.decidedByOrganization }),
        decision: Object.freeze({
          ...decision.decision,
          targetConversationNodeIds: Object.freeze([...decision.decision.targetConversationNodeIds]),
          reorderedTo: decision.decision.reorderedTo === undefined
            ? undefined
            : Object.freeze([...decision.decision.reorderedTo]),
        }),
      }),
    );
  }
  return {
    ok: true,
    graph: Object.freeze({
      graphId: input.graphId,
      version: input.version,
      decisions: Object.freeze(decisions),
      otioInterchange: input.otioInterchange ?? false,
      recordedAt: input.recordedAt,
    }),
  };
}
