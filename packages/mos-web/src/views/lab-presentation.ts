import type { LabBenchmarkCandidateOriginView, LabOodSignalView } from '../ports/lab-benchmark.js';
import type { LabSectionId } from '../routes/route.js';
import type { LabLoopStageStandingView } from '../ports/lab-overview.js';

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

// ——— UX-003 wave 2: the Lab WORKSPACE presentation data ———

/**
 * The Lab workspace's section navigation (the §2 research loop's stages as
 * navigable sections, declaration order). Presentation-only ordering: the
 * labels and order are declared here because they are presentation, not lab
 * state.
 */
export const LAB_SECTION_IDS: readonly LabSectionId[] = [
  'overview',
  'corpus',
  'idea-graph',
  'simulator',
  'strategy',
  'transforms',
  'benchmarks',
  'calibration',
  'bridge',
];

/** One-line label per workspace section (the navigation rail). */
export const LAB_SECTION_LABELS: Readonly<Record<LabSectionId, string>> = Object.freeze({
  overview: 'Overview',
  corpus: 'Corpus & Evidence',
  'idea-graph': 'Idea Graph',
  simulator: 'Simulator & Time Machine',
  strategy: 'Strategy & Organizations',
  transforms: 'Transforms',
  benchmarks: 'Benchmarks',
  calibration: 'Calibration',
  bridge: 'Next Steps',
});

/** One-sentence description per workspace section (the section intro). */
export const LAB_SECTION_DESCRIPTIONS: Readonly<Record<LabSectionId, string>> = Object.freeze({
  overview: 'Where the research loop stands in this tenant scope — stage standings, the §20-split evidence counts, the active scenario and recent runs.',
  corpus: 'The reference-first niche corpus (LAB-001) and its multimodal feature-bundle declarations (LAB-002): documents are acquired references, never content bytes.',
  'idea-graph': 'The Idea Graph (LAB-003): statements distilled from corpus evidence, typed weighted versioned edges, and the derivation chains back to acquired artifacts.',
  simulator:
    "The simulator (LAB-004/005) and the Time Machine's three §20 modes (LAB-006): every prediction counterfactual-labeled with its §22 interval; measured observations never rewritten.",
  strategy: 'Strategy candidates (LAB-009) with the §23 three-way organization comparison (LAB-010) and the declared reward objective (LAB-008): selection inputs, never deployment evidence.',
  transforms: 'The versioned transform contracts (LAB-011) and the §8 discovery candidates with their seven promotion gates (LAB-012): declared contracts, never engines.',
  benchmarks: 'Robust marketing benchmarks (LAB-017): multi-seed, multi-world-model evaluation with the no-op baseline always present.',
  calibration: 'Online calibration (LAB-018): simulation-to-reality prediction error joined with measured boundary-chain observations.',
  bridge: 'The §24 authorized path from a lab candidate to reality: nine declared steps, each naming its gating authority — no bypass, no shortcut.',
});

/** The §2 research-loop stage labels (the overview's loop standings). */
export const LAB_LOOP_STAGE_LABELS: Readonly<
  Record<LabLoopStageStandingView['stageId'], string>
> = Object.freeze({
  corpus: 'Corpus & evidence',
  features: 'Feature bundles',
  ideas: 'Idea graph',
  simulator: 'Simulator & Time Machine',
  strategy: 'Strategy & organizations',
  transforms: 'Transforms',
  benchmarks: 'Robust benchmarks',
  calibration: 'Online calibration',
});

/**
 * The next research-loop stage: the FIRST stage with zero records (a
 * derivation over the port's DECLARED stage standings — never a business
 * decision; every stage started means the loop is complete through
 * calibration). Presentation-only derivation over declared states.
 */
export function labNextStageLabel(
  stages: readonly LabLoopStageStandingView[],
): string | null {
  const next = stages.find((stage) => !stage.started);
  if (next === undefined) {
    return null;
  }
  const label = LAB_LOOP_STAGE_LABELS[next.stageId];
  return label === undefined ? null : label;
}

/** The Time Machine's three §20 mode labels (LAB-006). */
export const LAB_TIME_MACHINE_MODE_LABELS = Object.freeze({
  historical: 'Mode 1 — historical replay (observations ≤ T)',
  delayed: 'Mode 2 — delayed information (visible only through T−L)',
  branches: 'Mode 3 — counterfactual branches',
});

/** The read-only ingestion affordance's standing reason (LAB-001/002). */
export const LAB_NO_INGESTION_NOTE =
  'Acquiring documents, snapshotting corpus versions and attaching feature bundles are lab-authority actions gated by the explicit rights check (CORE-003) — this surface renders them as declared affordances only, never as controls that could imply successful ingestion.';

/** The read-only run affordance's standing reason (LAB-004). */
export const LAB_NO_SIMULATION_NOTE =
  'Stepping simulations, forking branches and recording predictions are lab-authority actions over the pinned world models — this surface is read-only and offers no control that could imply a run happened.';

/** The read-only strategy affordance's standing reason (LAB-009/010). */
export const LAB_NO_STRATEGY_NOTE =
  'Learning strategy candidates and running agent-organization searches are lab-authority actions — this surface renders their records and evaluation provenance only.';

/** The read-only promotion affordance's standing reason (LAB-011/012). */
export const LAB_NO_PROMOTION_NOTE =
  'Validating contracts, recording gate evidence and promoting candidates are lab-authority actions over the seven §8 gates — this surface renders the audit trail only.';

/** The read-only handoff affordance's standing reason (the §24 bridge). */
export const LAB_NO_HANDOFF_NOTE =
  "Creating the mission, requesting production and running the real experiment are the owning authorities' actions through their own surfaces — the bridge declares the path and names the gatekeepers; it never performs a step.";

/** The NO-AUTO-PRODUCTION pin for the transforms section (§24). */
export const LAB_NO_AUTO_PRODUCTION_NOTE =
  'A promoted transform candidate only becomes AVAILABLE to program search (§24: no auto-production) — availability is not production, and production crosses the boundary through its own authorities.';

/** The honest no-binding state of a §24 candidate handoff. */
export const LAB_BRIDGE_NO_BINDING_LABEL = 'No real experiment bound (the boundary is un-crossed)';

/** The transforms section's §8 promotion-gate status labels. */
export const LAB_TRANSFORM_GATE_STATUS_LABELS: Readonly<
  Record<'evidence-recorded' | 'evidence-stale' | 'evidence-missing', string>
> = Object.freeze({
  'evidence-recorded': 'Recorded at this version',
  'evidence-stale': 'STALE — recorded at an older candidate version',
  'evidence-missing': 'No evidence recorded',
});

/** Presentation labels for the §23 organization comparison rows. */
export const LAB_ORGANIZATION_COMPARISON_LABELS = Object.freeze({
  baseline: 'Generalist single-agent baseline',
  handDesigned: 'Hand-designed organization',
  generated: 'Search-generated organizations',
});

/**
 * Format a Time Machine information lag (milliseconds) as a whole-day /
 * whole-hour label — presentation formatting of a value the port reported
 * (never a recomputation).
 */
export function formatLabLagMs(lagMs: number): string {
  if (lagMs <= 0) {
    return '0 (exact historical replay)';
  }
  const hours = lagMs / 3_600_000;
  if (hours >= 24 && Number.isInteger(hours / 24)) {
    return `${hours / 24}d`;
  }
  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }
  return `${Math.round(hours * 10) / 10}h`;
}
