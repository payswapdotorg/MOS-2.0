/**
 * BRIDGE-003 evidence folding — the pure platform-said observation
 * selection + aggregation (the LAB-008 observed-domain discipline:
 * plainly-derived means over observed data only, never invented).
 *
 * INPUT: the REAL `@mos/distribution` observation log records (platform-
 * said, source-attributed — SOCIAL-001). SELECTION: the records whose
 * platform-reported `observedAt` falls within the declared window AND
 * whose subject matches the measured platform post. The platform's
 * `reported` payload is carried VERBATIM (MOS never adjusts a single
 * number — the observation-purity discipline).
 *
 * AGGREGATION (documented, deterministic): the §22 uncertainty level over
 * the folded count (the declared v1 heuristic); nothing else is derived
 * here — metric means live in outcome-analysis.ts (the analysis record's
 * domain).
 */

import type { SocialObservationRecord } from "@mos/distribution";

import type {
  ExperimentEvidenceUncertainty,
  ExperimentObservationCitation,
} from "../contracts/evidence.js";
import { EXPERIMENT_EVIDENCE_UNCERTAINTY_NOTE } from "../contracts/evidence.js";

/** The declared v1 §22 heuristic: level from the folded observation count. */
const uncertaintyLevelOf = (observationCount: number): "low" | "moderate" | "high" => {
  if (observationCount < 2) {
    return "high";
  }
  if (observationCount < 5) {
    return "moderate";
  }
  return "low";
};

/**
 * Select the platform-said observations within the declared window for the
 * measured subject (deterministic: ascending `observedAt`, then id — the
 * log's own order is preserved by stable sort).
 */
export const observationsWithinWindow = (
  observations: readonly SocialObservationRecord[],
  window: { readonly windowStart: string; readonly windowEnd: string },
  subjectRef: string,
): readonly SocialObservationRecord[] =>
  observations
    .filter(
      (observation) =>
        String(observation.subjectRef) === subjectRef &&
        Date.parse(String(observation.observedAt)) >= Date.parse(window.windowStart) &&
        Date.parse(String(observation.observedAt)) < Date.parse(window.windowEnd),
    )
    .sort((a, b) => {
      const aTime = Date.parse(String(a.observedAt));
      const bTime = Date.parse(String(b.observedAt));
      if (aTime !== bTime) {
        return aTime - bTime;
      }
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    });

/**
 * Project the REAL observation records onto the evidence citations
 * (VERBATIM field copies — the projection never adjusts a value).
 */
export const observationCitationsOf = (
  observations: readonly SocialObservationRecord[],
): readonly ExperimentObservationCitation[] =>
  observations.map((observation) => ({
    observationId: String(observation.id),
    channelRef: String(observation.channelRef),
    providerId: String(observation.providerId),
    subjectRef: String(observation.subjectRef),
    reported: structuredClone(observation.reported),
    observedAt: observation.observedAt,
    recordedAt: observation.recordedAt,
    providerRefs: [...observation.providerRefs],
    source: observation.source,
  }));

/**
 * The §22 uncertainty declaration over the folded citations (the declared
 * v1 heuristic — counts carried alongside for re-derivation).
 */
export const evidenceUncertaintyOf = (
  observations: readonly ExperimentObservationCitation[],
): ExperimentEvidenceUncertainty => {
  const distinctProviders = new Set(observations.map((observation) => String(observation.providerId)));
  return {
    level: uncertaintyLevelOf(observations.length),
    observationCount: observations.length,
    distinctProviders: distinctProviders.size,
    note: EXPERIMENT_EVIDENCE_UNCERTAINTY_NOTE,
  };
};

/**
 * RUNTIME RE-VALIDATION (the double-cast guard — the LAB-018 discipline):
 * every folded citation must be platform-said (the projection path only
 * produces these, but the guard pins the invariant at the boundary too).
 * Returns the violations (empty = pure).
 */
export const observationPurityViolations = (
  citations: readonly ExperimentObservationCitation[],
): readonly string[] => {
  const violations: string[] = [];
  for (const [index, citation] of citations.entries()) {
    if (citation.observationId.trim() === "") {
      violations.push(`observations[${index}].observationId is blank — a platform-said citation must name its REAL observation record`);
    }
    if (typeof citation.reported !== "object" || citation.reported === null) {
      violations.push(`observations[${index}].reported must be the platform's own JSON payload object (never a scalar, never fabricated)`);
    }
    if (citation.source.trim() === "") {
      violations.push(`observations[${index}].source is blank — every platform-said number needs its honest transport source label`);
    }
  }
  return violations;
};
