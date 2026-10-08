/**
 * Review outcome application for the Studio runtime (STUDIO-001; STUDIO-013
 * routes the accept path through THE canonical packaging authority).
 *
 * §19 mapping: accept/accept-alternate → package composition + packaged
 * state; request-treatment → processing (treatment branch); reject-quality /
 * reject-strategy / reject-rights-policy → failed terminal with the typed
 * rejection recorded (quality vs rights/policy rejections stay distinct);
 * abandon → abandoned terminal. The outcome record itself was built by the
 * runtime before this pure application step.
 *
 * STUDIO-013: the accept path composes the next package version through the
 * injected `StudioArtifactPackagingPort` (the ONE canonical packaging path).
 * On a typed packaging failure the review is NOT recorded and the session
 * stays in the review state — fail-closed, no partial application.
 */

import type { StudioRuntimeError } from "./errors.js";
import type { StudioSessionRecord } from "./session-state.js";
import { applyLifecycleTransition, attachPackageVersion, snapshotSession } from "./session-state.js";
import { composeSessionPackageFromRecord } from "./packaging/session-package-request.js";
import type { StudioArtifactPackagingPort } from "../ports/artifact-packaging.port.js";
import type { StudioArtifactPackageId, Timestamp } from "../contracts/refs.js";
import type { StudioArtifactPackage } from "../contracts/studio-artifact-package.js";
import type { StudioSession } from "../contracts/studio-session.js";
import type { StudioOutputReview, StudioOutputReviewOutcome } from "../contracts/treatment.js";

/** Value produced when a review outcome has been applied. */
export interface AppliedReviewValue {
  readonly session: StudioSession;
  readonly review: StudioOutputReview;
  readonly package?: StudioArtifactPackage;
}

/**
 * Apply a validated review outcome to the session record (mutates the
 * record; snapshot returned). Precondition: session state is `review` and
 * the rejection-kind consistency check already passed.
 */
export function applyReviewOutcome(
  record: StudioSessionRecord,
  review: StudioOutputReview,
  deps: {
    readonly now: () => Timestamp;
    readonly nextPackageId: () => string;
    /** STUDIO-013: the canonical packaging authority (required). */
    readonly packaging: StudioArtifactPackagingPort;
  },
): { ok: true; value: AppliedReviewValue } | { ok: false; error: StudioRuntimeError } {
  const outcome: StudioOutputReviewOutcome = review.outcome;
  switch (outcome) {
    case "accept":
    case "accept-alternate": {
      const reviewRef = `mos-studio:review:${record.reviews.length + 1}`;
      const composed = composeSessionPackageFromRecord(
        record,
        {
          packageId: record.packageId,
          nextPackageId: deps.nextPackageId,
          composedAt: deps.now(),
          evaluation: {
            status: "evaluated",
            outcome: "accepted",
            evaluationRef: reviewRef,
          },
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
      const packageId: StudioArtifactPackageId = composed.packageId;
      record.reviews.push(review);
      record.packages.push(pkg);
      attachPackageVersion(record, packageId, pkg.version);
      applyLifecycleTransition(record, "packaged", deps.now(), `review:${outcome}`, "studio-runtime");
      return { ok: true, value: { session: snapshotSession(record), review, package: pkg } };
    }
    case "request-treatment": {
      record.reviews.push(review);
      applyLifecycleTransition(record, "processing", deps.now(), "review:treatment-requested", "studio-runtime");
      return { ok: true, value: { session: snapshotSession(record), review } };
    }
    case "reject-quality":
    case "reject-strategy":
    case "reject-rights-policy": {
      record.reviews.push(review);
      applyLifecycleTransition(record, "failed", deps.now(), `review:${outcome}`, "studio-runtime");
      return { ok: true, value: { session: snapshotSession(record), review } };
    }
    case "abandon": {
      record.reviews.push(review);
      applyLifecycleTransition(record, "abandoned", deps.now(), "review:abandon", "studio-runtime");
      return { ok: true, value: { session: snapshotSession(record), review } };
    }
    default:
      return {
        ok: false,
        error: {
          kind: "unsupported-review-outcome",
          outcome,
          reason:
            "outcome requires Lab/production orchestration outside the Studio runtime (Human Production Task creation, organization/transform/engine switching) — not a studio session operation in Wave 1",
        },
      };
  }
}
