/**
 * Treatment application (§19, STUDIO-001) — the body of
 * StudioRuntime.applyTreatment, extracted so the runtime file stays within
 * the architecture file-size budget.
 *
 * Resolves the target over the session's known artifacts (packaged state:
 * the latest immutable package's carried set; processing/treatment branch:
 * the draft), applies it through the treatment executor port, records the
 * result + failures append-only, and in the packaged state composes the NEW
 * immutable successor version through THE canonical packaging authority
 * (STUDIO-013: append-only versioning; the treatment result itself is
 * already recorded — a packaging failure is a typed error, not a silent
 * gap).
 */

import type { OutputTreatmentRequest, StudioOutputTreatmentPort } from "../contracts/treatment.js";
import type { StudioArtifactPackagingPort } from "../ports/artifact-packaging.port.js";
import type { StudioArtifactRef } from "../contracts/studio-artifact-package.js";
import type { StudioRuntimeOutcome } from "./errors.js";
import type { TreatmentAppliedValue } from "./runtime-outcomes.js";
import { composeSessionPackageFromRecord } from "./packaging/session-package-request.js";
import { applyLifecycleTransition, attachPackageVersion, snapshotSession, type StudioSessionRecord } from "./session-state.js";

/** The treatment-application seam the runtime delegates through. */
export interface TreatmentApplicationDeps {
  readonly treatmentExecutor: StudioOutputTreatmentPort;
  /** STUDIO-013: the canonical packaging authority (THE packaging path). */
  readonly packaging: StudioArtifactPackagingPort;
  /** The session's package id (null until the first version — the bridge mints one). */
  readonly packageId: import("../contracts/refs.js").StudioArtifactPackageId | null;
  readonly nextPackageId: () => string;
  readonly now: () => import("../contracts/refs.js").Timestamp;
}

/** Apply one treatment over a session already gated (state/consent) by the runtime. */
export async function applyStudioTreatment(
  record: StudioSessionRecord,
  request: OutputTreatmentRequest,
  deps: TreatmentApplicationDeps,
): Promise<StudioRuntimeOutcome<TreatmentAppliedValue>> {
  const state = record.session.lifecycle.state;
  const latestPackage = record.packages.length > 0 ? record.packages[record.packages.length - 1] : undefined;
  const knownArtifacts: readonly StudioArtifactRef[] =
    state === "packaged" && latestPackage !== undefined
      ? [...latestPackage.rawArtifacts, ...latestPackage.intermediateArtifacts, ...latestPackage.finalArtifacts]
      : [...record.draft.rawArtifacts, ...record.draft.intermediateArtifacts, ...record.draft.finalArtifacts];
  const target = knownArtifacts.find((a) => a.artifactId === request.targetArtifact.artifactId);
  if (target === undefined) {
    return { ok: false, error: { kind: "treatment-target-not-found", artifactId: request.targetArtifact.artifactId } };
  }
  const outcome = await deps.treatmentExecutor.applyTreatment(request);
  if (!outcome.ok) {
    record.treatmentFailures.push({ request, failure: outcome.failure, failedAt: deps.now() });
    return { ok: false, error: { kind: "treatment-failed", request, failure: outcome.failure } };
  }
  record.treatments.push(outcome.result);
  for (const successor of outcome.result.successorArtifacts) {
    if (successor.stage === "intermediate") {
      record.draft.intermediateArtifacts.push(successor);
    } else {
      record.draft.finalArtifacts.push(successor);
    }
  }
  if (state === "packaged") {
    const composed = composeSessionPackageFromRecord(
      record,
      {
        packageId: deps.packageId,
        nextPackageId: deps.nextPackageId,
        composedAt: deps.now(),
        evaluation: { status: "pending", outcome: "treatment-requested" },
      },
      deps.packaging,
    );
    if (!composed.ok) {
      return {
        ok: false,
        error: { kind: "package-composition-failed", sessionId: record.sessionId, failure: composed.failure },
      };
    }
    const pkg = composed.package;
    record.packages.push(pkg);
    attachPackageVersion(record, composed.packageId, pkg.version);
    return { ok: true, value: { session: snapshotSession(record), result: outcome.result, package: pkg } };
  }
  applyLifecycleTransition(record, "review", deps.now(), "treatment-completed", "studio-runtime");
  return { ok: true, value: { session: snapshotSession(record), result: outcome.result } };
}
