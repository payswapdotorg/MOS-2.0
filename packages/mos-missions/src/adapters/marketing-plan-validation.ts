/**
 * INTERNAL structural validation for the W12-A marketing-planner adapter.
 * NOT exported from the package index — implementation detail, not surface.
 *
 * Pure runtime validation of a proposed plan's STRUCTURE (blank fields,
 * missing element sets, duplicate platforms/metrics, malformed citations,
 * malformed basis, non-finite numbers). The input is typed at compile
 * time, but the W9-B/W10-B discipline re-validates at runtime for untyped
 * callers — nothing hostile enters the store.
 */

import type { MarketingPlannerError } from '../ports/marketing-planner.port.js';
import { marketingPlannerFailure } from '../ports/marketing-planner.port.js';
import type {
  ExperimentExpectationInput,
  MetricExpectationInput,
  PlatformChoiceInput,
} from '../ports/marketing-planner.port.js';
import type { MissionCitation } from '../domain/marketing-plan.js';

/** Non-blank string check. */
export const isNonBlankString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Positive-integer check (finite, integer, ≥ 1 — the D5/F2 guard). */
export const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** Well-formed versioned citation: non-blank record id + positive-integer version. */
export const isWellFormedCitation = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  isNonBlankString((value as { readonly recordId?: unknown }).recordId) &&
  isPositiveInteger((value as { readonly version?: unknown }).version);

/** Non-blank id list (health observation ids for acknowledgments). */
export const isNonBlankIdList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => isNonBlankString(entry));

/** The shared plan content proposed by compose/revise (validated together). */
export interface ProposedPlanContent {
  readonly mission: MissionCitation;
  readonly objectiveAlignment: string;
  readonly platforms: readonly PlatformChoiceInput[];
  readonly metricExpectations: readonly MetricExpectationInput[];
  readonly experimentExpectations: readonly ExperimentExpectationInput[];
}

/** The runtime (double-cast) basis re-validation — §25 literal pins. */
const validateBasis = (basis: unknown, metric: string): MarketingPlannerError | null => {
  if (typeof basis !== 'object' || basis === null) {
    return marketingPlannerFailure('invalid-input', `metric expectation ${metric} carries no basis`);
  }
  const candidate = basis as { readonly basis?: unknown; readonly counterfactual?: unknown };
  if (candidate.basis === 'cited-evidence') {
    if (candidate.counterfactual !== false) {
      return marketingPlannerFailure(
        'invalid-input',
        `metric expectation ${metric}: cited-evidence basis requires counterfactual: false`,
      );
    }
    if (!isNonBlankString((basis as { readonly observedAt?: unknown }).observedAt)) {
      return marketingPlannerFailure(
        'invalid-input',
        `metric expectation ${metric}: cited-evidence basis requires observedAt`,
      );
    }
    return null;
  }
  if (candidate.basis === 'counterfactual-forecast') {
    if (candidate.counterfactual !== true) {
      return marketingPlannerFailure(
        'invalid-input',
        `metric expectation ${metric}: counterfactual-forecast basis requires counterfactual: true`,
      );
    }
    if (!isNonBlankString((basis as { readonly methodNote?: unknown }).methodNote)) {
      return marketingPlannerFailure(
        'invalid-input',
        `metric expectation ${metric}: counterfactual-forecast basis requires a methodNote`,
      );
    }
    return null;
  }
  return marketingPlannerFailure(
    'invalid-input',
    `metric expectation ${metric}: unknown basis ${String(candidate.basis)}`,
  );
};

/** The evidence list check (≥ 1 well-formed versioned citation). */
const validateEvidence = (
  evidence: unknown,
  element: string,
): MarketingPlannerError | null => {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return marketingPlannerFailure(
      'invalid-input',
      `${element} must cite at least one product-intelligence version`,
    );
  }
  for (const citation of evidence) {
    if (!isWellFormedCitation(citation)) {
      return marketingPlannerFailure(
        'invalid-input',
        `${element} carries a malformed versioned citation`,
      );
    }
  }
  return null;
};

/**
 * The full structural validation of a proposed plan. Returns the typed
 * failure or `null` when structurally sound. Duplicate platforms / metrics
 * are structural faults (one element per platform / reward metric per plan
 * version — the honest shape downstream consumers can rely on).
 */
export const validateProposedPlanStructure = (
  content: ProposedPlanContent,
): MarketingPlannerError | null => {
  if (
    typeof content.mission !== 'object' ||
    content.mission === null ||
    !isNonBlankString((content.mission as { readonly missionId?: unknown }).missionId) ||
    !isPositiveInteger((content.mission as { readonly recordVersion?: unknown }).recordVersion)
  ) {
    return marketingPlannerFailure(
      'invalid-input',
      'mission citation must carry a non-blank missionId and an integer recordVersion >= 1',
    );
  }
  if (!isNonBlankString(content.objectiveAlignment)) {
    return marketingPlannerFailure('invalid-input', 'objectiveAlignment must not be blank');
  }
  if (!Array.isArray(content.platforms) || content.platforms.length === 0) {
    return marketingPlannerFailure('invalid-input', 'a plan must declare at least one platform');
  }
  const seenPlatforms = new Set<string>();
  for (const choice of content.platforms) {
    if (typeof choice !== 'object' || choice === null || !isNonBlankString(choice.platform)) {
      return marketingPlannerFailure('invalid-input', 'every platform choice must name a platform');
    }
    if (seenPlatforms.has(choice.platform)) {
      return marketingPlannerFailure(
        'invalid-input',
        `duplicate platform choice: ${choice.platform}`,
      );
    }
    seenPlatforms.add(choice.platform);
    if (!isNonBlankString(choice.rationale)) {
      return marketingPlannerFailure(
        'invalid-input',
        `platform ${choice.platform} must carry a non-blank rationale`,
      );
    }
    const evidenceError = validateEvidence(choice.evidence, `platform ${choice.platform}`);
    if (evidenceError !== null) {
      return evidenceError;
    }
    const acknowledged = choice.acknowledgedRestrictions;
    if (acknowledged !== undefined && !isNonBlankIdList(acknowledged)) {
      return marketingPlannerFailure(
        'invalid-input',
        `platform ${choice.platform} acknowledgedRestrictions must be health-observation ids`,
      );
    }
  }
  if (!Array.isArray(content.metricExpectations) || content.metricExpectations.length === 0) {
    return marketingPlannerFailure('invalid-input', 'a plan must declare at least one metric expectation');
  }
  const seenMetrics = new Set<string>();
  for (const expectation of content.metricExpectations) {
    if (typeof expectation !== 'object' || expectation === null) {
      return marketingPlannerFailure('invalid-input', 'malformed metric expectation');
    }
    if (!isNonBlankString(expectation.metric) || !isNonBlankString(expectation.expectation)) {
      return marketingPlannerFailure(
        'invalid-input',
        'every metric expectation must carry a metric and an expectation',
      );
    }
    if (seenMetrics.has(expectation.metric)) {
      return marketingPlannerFailure(
        'invalid-input',
        `duplicate metric expectation: ${expectation.metric}`,
      );
    }
    seenMetrics.add(expectation.metric);
    if (!isNonBlankString(expectation.unit)) {
      return marketingPlannerFailure(
        'invalid-input',
        `metric expectation ${expectation.metric} must carry a unit`,
      );
    }
    const basisError = validateBasis(expectation.basis, expectation.metric);
    if (basisError !== null) {
      return basisError;
    }
    const evidenceError = validateEvidence(
      expectation.evidence,
      `metric expectation ${expectation.metric}`,
    );
    if (evidenceError !== null) {
      return evidenceError;
    }
  }
  if (
    !Array.isArray(content.experimentExpectations) ||
    content.experimentExpectations.length === 0
  ) {
    return marketingPlannerFailure(
      'invalid-input',
      'a plan must declare at least one experiment expectation',
    );
  }
  for (const expectation of content.experimentExpectations) {
    if (typeof expectation !== 'object' || expectation === null) {
      return marketingPlannerFailure('invalid-input', 'malformed experiment expectation');
    }
    if (!isNonBlankString(expectation.question)) {
      return marketingPlannerFailure(
        'invalid-input',
        'every experiment expectation must carry a question',
      );
    }
    if (!isNonBlankString(expectation.successCriterion)) {
      return marketingPlannerFailure(
        'invalid-input',
        'every experiment expectation must carry a successCriterion',
      );
    }
    const evidenceError = validateEvidence(
      expectation.evidence,
      `experiment ${expectation.question}`,
    );
    if (evidenceError !== null) {
      return evidenceError;
    }
  }
  return null;
};
