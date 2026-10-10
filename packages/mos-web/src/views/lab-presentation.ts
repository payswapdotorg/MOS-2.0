import type { LabBenchmarkCandidateOriginView, LabOodSignalView } from '../ports/lab-benchmark.js';

/**
 * Lab presentation data (UX-003) — labels, badge classes, formatting helpers
 * and disclosure copy for the Lab surface. PRESENTATION ONLY: nothing here
 * implements, decides or computes lab state; every label renders a verdict a
 * view port already carried (the lab authority owns the state itself).
 *
 * The one presentation-side derivation allowed here is NUMBER FORMATTING:
 * fixed-precision rendering of values the port already reported. Formatting
 * never invents, rounds silently into equality, or hides a flag.
 */

/**
 * The standing §24 boundary note (rendered in the Lab header and with every
 * digest): Lab output is counterfactual simulation analysis that informs
 * SELECTION — it is never deployment evidence, and the real-experiment
 * boundary is the only path to reality-grade proof.
 */
export const LAB_BOUNDARY_NOTE =
  'Lab output is counterfactual — simulated, not measured. It informs selection only and is never deployment evidence (§24); real proof crosses the real-experiment boundary.';

/**
 * The VISIBLE counterfactual label (§20/§24): every simulated/forecast value
 * on this surface renders with this label — a UI badge, not a tooltip-only
 * nicety. The surface never presents simulated values as measured/real.
 */
export const LAB_COUNTERFACTUAL_LABEL = 'Counterfactual — simulated, not measured (§20)';

/** The visible label for the reality side (boundary-chain observations). */
export const LAB_MEASURED_LABEL = 'Measured — boundary-chain reality (§24)';

/**
 * The Lab surface's place in the §2 complete loop, as narrated in its
 * header (the Home/Studio narration discipline).
 */
export const LAB_LOOP_NARRATION = Object.freeze({
  position: 'Learning loop — Lab stage of the §2 complete loop',
  summary:
    'The Marketing Engineering Lab simulates, benchmarks and calibrates candidate programs against versioned world models: every number here is a counterfactual simulation estimate with its uncertainty, compared against the always-present no-op baseline, and calibrated against reality once real experiments exist.',
});

/** Presentation labels for benchmark candidate origins (LAB-017 vocabulary). */
export const LAB_CANDIDATE_ORIGIN_LABELS: Readonly<
  Record<LabBenchmarkCandidateOriginView, string>
> = Object.freeze({
  'hand-designed': 'Hand-designed',
  'learned-strategy': 'Learned strategy',
  'organization-search': 'Organization search',
  'production-search': 'Production search',
  'no-op-baseline': 'No-op baseline',
});

/** One-line description per candidate origin. */
export const LAB_CANDIDATE_ORIGIN_DESCRIPTIONS: Readonly<
  Record<LabBenchmarkCandidateOriginView, string>
> = Object.freeze({
  'hand-designed': 'Declared by a human designer.',
  'learned-strategy': 'Produced by the strategy learner from simulation experience.',
  'organization-search': 'Produced by the agent-organization search (§23).',
  'production-search': 'Produced by the production-program search (§7).',
  'no-op-baseline':
    'The benchmark’s own synthesized do-nothing reference — always present, never caller-claimable (§7).',
});

/** Badge styling + label per OOD status (§22 — OOD distance visible). */
export const LAB_OOD_PRESENTATION: Readonly<
  Record<LabOodSignalView['status'], { readonly label: string; readonly badgeClass: string }>
> = Object.freeze({
  'in-coverage': {
    label: 'In declared coverage',
    badgeClass: 'bg-emerald-500/15 text-emerald-300',
  },
  'out-of-declared-coverage': {
    label: 'Out of declared coverage',
    badgeClass: 'bg-red-500/15 text-red-300',
  },
  'partially-undeclared': {
    label: 'Partially undeclared coverage',
    badgeClass: 'bg-amber-500/15 text-amber-300',
  },
});

/** Presentation label for the aggregation rule of a benchmark record. */
export function labAggregationLabel(aggregation: 'pooled-mean' | 'worst-world-mean'): string {
  switch (aggregation) {
    case 'pooled-mean':
      return 'Pooled mean over all worlds';
    case 'worst-world-mean':
      return 'Worst world-model mean (conservative floor)';
  }
}

/** Presentation label for a sweep dimension. */
export function labSweepDimensionLabel(dimension: 'seed' | 'world-model'): string {
  switch (dimension) {
    case 'seed':
      return 'seed';
    case 'world-model':
      return 'world-model';
  }
}

/**
 * Format a reported number at fixed precision (presentation only — the
 * value is exactly what the port reported; this never recomputes it).
 */
export function formatLabNumber(value: number): string {
  return value.toFixed(2);
}

/** `expected 12.40 · interval [10.10, 14.80]` — the §22 always-paired form. */
export function formatLabExpectedWithInterval(
  expectedReward: number,
  interval: { readonly lower: number; readonly upper: number },
): string {
  return `expected ${formatLabNumber(expectedReward)} · interval [${formatLabNumber(
    interval.lower,
  )}, ${formatLabNumber(interval.upper)}]`;
}

/** A short display form of a digest (first 12 hex chars + ellipsis). */
export function formatLabDigestShort(digest: string): string {
  return `${digest.slice(0, 12)}…`;
}

/** Presentation label for a record-integrity state. */
export function labIntegrityLabel(status: 'intact' | 'tampered'): string {
  switch (status) {
    case 'intact':
      return 'Digest intact — record unmodified since append';
    case 'tampered':
      return 'DIGEST MISMATCH — the stored record diverges from its seal';
  }
}

/** Presentation of the §22 calibration-pending state (LAB-018 seam). */
export const LAB_CALIBRATION_PENDING_LABEL = 'Calibration pending reality (LAB-018 seam)';
