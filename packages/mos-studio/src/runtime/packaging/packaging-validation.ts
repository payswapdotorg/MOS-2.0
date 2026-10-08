/**
 * Pure fail-closed battery helpers of the canonical packaging authority
 * (STUDIO-013) — evaluation shape, provenance completeness, closed lineage,
 * root→final traceability, finite-number duration guards, one-currency cost
 * consolidation, edit-graph-ref validation and the deep-freeze discipline.
 *
 * Extracted from packaging-authority.ts so the authority file stays within
 * the architecture file-size budget; every function here is pure over its
 * inputs (no engine/network/IO) and none of them touch the version store.
 *
 * W9-B disciplines applied here: D5 finite-number guards (NaN/Infinity/
 * negative fail closed), D3 deep-freeze for stored records.
 */

import type { MoneyAmount, StudioSessionId, Timestamp } from "../../contracts/refs.js";
import type { StudioArtifactRef } from "../../contracts/studio-artifact-package.js";
import type {
  SessionPackageCompositionInput,
  StudioPackagingFailure,
} from "../../contracts/artifact-packaging.js";
import { studioMoneyIssues, sumStudioMoney } from "../money.js";

const EVALUATION_STATUSES: readonly string[] = ["pending", "evaluated"];
const EVALUATION_OUTCOMES: readonly string[] = [
  "accepted",
  "quality-rejected",
  "rights-policy-rejected",
  "treatment-requested",
  "not-applicable",
];

export function evaluationIssues(evaluation: SessionPackageCompositionInput["evaluation"]): readonly string[] {
  if (evaluation === undefined) {
    return ["evaluation record is required (§19)"];
  }
  const issues: string[] = [];
  if (!EVALUATION_STATUSES.includes(String(evaluation.status))) {
    issues.push(`evaluation.status "${String(evaluation.status)}" is not a known status`);
  }
  if (!EVALUATION_OUTCOMES.includes(String(evaluation.outcome))) {
    issues.push(`evaluation.outcome "${String(evaluation.outcome)}" is not a known outcome`);
  }
  return issues;
}

/** Provenance refs of every carried artifact must be present (§30). */
export function provenanceIncompleteIds(artifacts: readonly StudioArtifactRef[]): readonly string[] {
  return artifacts
    .filter((artifact) => typeof artifact.provenanceRef !== "string" || artifact.provenanceRef.trim().length === 0)
    .map((artifact) => String(artifact.artifactId));
}

/** Intermediates/finals without parents break closed lineage (§6). */
export function lineageIncompleteIds(artifacts: readonly StudioArtifactRef[]): readonly string[] {
  return artifacts
    .filter((artifact) => artifact.parentArtifactRefs.length === 0)
    .map((artifact) => String(artifact.artifactId));
}

/**
 * Finals that do not trace through parents to a raw root INSIDE the package
 * (§6: reference → acquired input → … → final candidate is traceable
 * root→final). Cycles are guarded by a visited set.
 */
export function untraceableFinalIds(input: {
  readonly rawArtifacts: readonly StudioArtifactRef[];
  readonly intermediates: readonly StudioArtifactRef[];
  readonly finals: readonly StudioArtifactRef[];
}): readonly string[] {
  const byId = new Map<string, StudioArtifactRef>();
  for (const artifact of [...input.rawArtifacts, ...input.intermediates, ...input.finals]) {
    byId.set(String(artifact.artifactId), artifact);
  }
  const rawIds = new Set(input.rawArtifacts.map((artifact) => String(artifact.artifactId)));
  const untraceable: string[] = [];
  const traceReachesRaw = (start: StudioArtifactRef): boolean => {
    const stack: StudioArtifactRef[] = [start];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop() as StudioArtifactRef;
      const id = String(current.artifactId);
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      if (rawIds.has(id)) {
        return true;
      }
      for (const parent of current.parentArtifactRefs) {
        const resolved = byId.get(String(parent.artifactId));
        if (resolved !== undefined) {
          stack.push(resolved);
        }
      }
    }
    return false;
  };
  for (const finalArtifact of input.finals) {
    if (!traceReachesRaw(finalArtifact)) {
      untraceable.push(String(finalArtifact.artifactId));
    }
  }
  return untraceable;
}

/** Finite non-negative duration seconds guard (W9-B D5). */
export function durationIssues(values: ReadonlyArray<[string, number]>): readonly string[] {
  const issues: string[] = [];
  for (const [label, value] of values) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      issues.push(`${label} must be a finite non-negative number (got ${String(value)})`);
    }
  }
  return issues;
}

export function elapsedSeconds(from: Timestamp, to: Timestamp): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
}

/** Sum same-currency decimal-string cost lines (one-currency, finite-guarded). */
export function totalCostOf(
  sessionRef: StudioSessionId,
  costLines: readonly MoneyAmount[],
): { ok: true; total: MoneyAmount } | { ok: false; failure: StudioPackagingFailure } {
  const reasons: string[] = [];
  for (const [index, line] of costLines.entries()) {
    for (const issue of studioMoneyIssues(line)) {
      reasons.push(`cost line ${index}: ${issue}`);
    }
  }
  const currencies = new Set(costLines.map((line) => line.currency));
  if (currencies.size > 1) {
    reasons.push(`cost lines must share one currency (found ${[...currencies].join(", ")})`);
  }
  if (reasons.length > 0) {
    return { ok: false, failure: { kind: "cost-invalid", sessionRef, reasons } };
  }
  const total = costLines.reduce<MoneyAmount>(
    (sum, line) => sumStudioMoney(sum, line),
    { currency: costLines[0]?.currency ?? "USD", amount: "0.00" },
  );
  return { ok: true, total };
}

/** A REAL recorded edit-graph ref is required (graphId + finite version ≥ 1). */
export function validateEditGraphRef(
  sessionRef: StudioSessionId,
  editGraphRef: SessionPackageCompositionInput["editGraphRef"],
): StudioPackagingFailure | null {
  if (
    editGraphRef === undefined ||
    typeof editGraphRef.graphId !== "string" ||
    editGraphRef.graphId.trim().length === 0 ||
    typeof editGraphRef.version !== "number" ||
    !Number.isFinite(editGraphRef.version) ||
    editGraphRef.version < 1
  ) {
    return { kind: "edit-graph-ref-required", sessionRef };
  }
  return null;
}

/** Recursively freeze a plain-data structure (objects + arrays) (W9-B D3). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
