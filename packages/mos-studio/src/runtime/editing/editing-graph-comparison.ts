/**
 * Edit-graph structural comparison (STUDIO-008, §12 — comparable shapes).
 *
 * Two recorded graph versions compare WITHOUT any conversion: they are the
 * SAME interchange record shape on both sides. The comparison projects
 * shared/graph-only declared points, per-point choice differences and the
 * operation-kind histograms — a presentation projection over faithful
 * records, never a transformation of them.
 */

import type { TenantScope } from "@mos/contracts";

import type {
  EditGraphVersionRef,
  EditingCompositionGraph,
  RecordedEditChoice,
} from "../../contracts/editing-composition.js";
import type {
  EditGraphComparison,
  EditGraphComparisonOutcome,
} from "../../contracts/edit-graph-interop.js";
import type { Timestamp } from "../../contracts/refs.js";
import { operationKindCountsOf, type EditingGraphStore } from "./editing-graph-store.js";

/** Compares two recorded graph versions (the exact versions cited, or `undefined`). */
export function compareEditGraphVersions(
  store: EditingGraphStore,
  now: () => Timestamp,
  scope: TenantScope,
  graphA: EditGraphVersionRef,
  graphB: EditGraphVersionRef,
): EditGraphComparisonOutcome {
  const graphRecordA = store.get(scope, graphA.graphId, graphA.version);
  const graphRecordB = store.get(scope, graphB.graphId, graphB.version);
  if (graphRecordA === undefined) {
    return { ok: false, kind: "edit-graph-not-found", graphId: graphA.graphId };
  }
  if (graphRecordB === undefined) {
    return { ok: false, kind: "edit-graph-not-found", graphId: graphB.graphId };
  }
  const pointsOf = (graph: EditingCompositionGraph): Map<string, RecordedEditChoice> => {
    const map = new Map<string, RecordedEditChoice>();
    for (const choice of graph.choices) {
      map.set(choice.decisionPointId, choice);
    }
    return map;
  };
  const pointsA = pointsOf(graphRecordA);
  const pointsB = pointsOf(graphRecordB);
  const sharedPointIds: string[] = [];
  const pointsOnlyInA: string[] = [];
  const pointsOnlyInB: string[] = [];
  for (const pointId of pointsA.keys()) {
    if (pointsB.has(pointId)) {
      sharedPointIds.push(pointId);
    } else {
      pointsOnlyInA.push(pointId);
    }
  }
  for (const pointId of pointsB.keys()) {
    if (!pointsA.has(pointId)) {
      pointsOnlyInB.push(pointId);
    }
  }
  const sideOf = (choice: RecordedEditChoice | undefined) =>
    choice === undefined
      ? null
      : {
          choiceId: choice.choiceId,
          selectedOption: choice.selectedOption,
          operationIds: [...choice.operationIds],
        };
  const choiceDifferences = sharedPointIds.map((pointId) => ({
    decisionPointId: pointId,
    inA: sideOf(pointsA.get(pointId)),
    inB: sideOf(pointsB.get(pointId)),
  }));
  const comparison: EditGraphComparison = {
    graphA: { graphId: graphA.graphId, version: graphRecordA.version },
    graphB: { graphId: graphB.graphId, version: graphRecordB.version },
    sharedPointIds: Object.freeze(sharedPointIds),
    pointsOnlyInA: Object.freeze(pointsOnlyInA),
    pointsOnlyInB: Object.freeze(pointsOnlyInB),
    choiceDifferences: Object.freeze(choiceDifferences),
    operationKindCountsA: operationKindCountsOf(graphRecordA),
    operationKindCountsB: operationKindCountsOf(graphRecordB),
    comparedAt: now(),
  };
  return { ok: true, comparison };
}
