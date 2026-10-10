import type {
  LabBenchmarkCandidateView,
  LabBenchmarkDigestView,
} from '../ports/lab-benchmark.js';
import {
  LAB_CALIBRATION_PENDING_LABEL,
  LAB_COUNTERFACTUAL_LABEL,
  LAB_CANDIDATE_ORIGIN_LABELS,
  LAB_OOD_PRESENTATION,
  formatLabDigestShort,
  formatLabExpectedWithInterval,
  formatLabNumber,
  labAggregationLabel,
  labIntegrityLabel,
} from './lab-presentation.js';

/**
 * The Lab benchmark digest panel (UX-003, over LAB-017): ONE frozen record
 * version browsed honestly — the DECLARED robustness policy, the fairness
 * pin, full version provenance, the ALWAYS-present no-op baseline, and the
 * ranked declared candidates, each rendering its expected value WITH its
 * uncertainty interval (§22 — never a bare point estimate), its per-world
 * member disagreement, its OOD signal against declared coverage, its seed
 * robustness and its comparison to the baseline. Every simulated value on
 * this panel is VISIBLY counterfactual-labeled (§20/§24) and the calibration
 * surface is shown as DECLARED pending reality (the LAB-018 seam). The
 * panel is read-only: running a benchmark is a lab-authority action this
 * surface never performs or fakes.
 */

function CounterfactualBadge({ testId }: { readonly testId?: string }) {
  return (
    <span
      className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-300"
      data-testid={testId ?? 'lab-counterfactual-badge'}
      title={LAB_COUNTERFACTUAL_LABEL}
    >
      Counterfactual — simulated, not measured
    </span>
  );
}

function CandidatePanel({
  candidate,
  isBaseline,
}: {
  readonly candidate: LabBenchmarkCandidateView;
  readonly isBaseline: boolean;
}) {
  const oodPresentation = LAB_OOD_PRESENTATION[candidate.ood.status];
  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border p-4 ${
        isBaseline ? 'border-slate-600 bg-slate-800/30' : 'border-slate-800 bg-slate-900/40'
      }`}
      data-testid={`lab-candidate-${candidate.key}`}
      aria-label={`Benchmark candidate ${candidate.key}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isBaseline ? (
          <span
            className="rounded bg-slate-700/60 px-2 py-0.5 text-xs font-semibold text-slate-200"
            data-testid="lab-noop-baseline-mark"
          >
            No-op baseline (always present)
          </span>
        ) : (
          <span className="rounded bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300">
            rank {candidate.rank}
          </span>
        )}
        <span className="text-sm font-semibold text-slate-100">
          {candidate.label === null ? candidate.key : `${candidate.label} (${candidate.key})`}
        </span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
          {LAB_CANDIDATE_ORIGIN_LABELS[candidate.origin]}
        </span>
        <CounterfactualBadge testId={`lab-candidate-counterfactual-${candidate.key}`} />
        <span
          className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
          data-testid={`lab-candidate-calibration-${candidate.key}`}
        >
          {LAB_CALIBRATION_PENDING_LABEL}
        </span>
      </div>

      <p
        className="font-mono text-sm text-slate-200"
        data-testid={`lab-candidate-expected-${candidate.key}`}
      >
        {formatLabExpectedWithInterval(candidate.expectedReward, candidate.interval)}
        <span className="text-slate-500">
          {' '}
          · ±{formatLabNumber(candidate.totalHalfWidth)} ({candidate.breakdown.formula})
        </span>
      </p>

      <dl className="grid gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Interval breakdown:</dt>
          <dd data-testid={`lab-candidate-breakdown-${candidate.key}`}>
            disagreement ±{formatLabNumber(candidate.breakdown.memberDisagreementHalfWidth)} · seed
            ±{formatLabNumber(candidate.breakdown.seedRobustnessHalfWidth)} · world ±
            {formatLabNumber(candidate.breakdown.worldModelSpreadHalfWidth)} ·{' '}
            {labAggregationLabel(candidate.breakdown.aggregation)}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Seed robustness (§22):</dt>
          <dd>
            {candidate.seedRobustness.seedCount} seeds · spread{' '}
            {formatLabNumber(candidate.seedRobustness.spread)} · relative{' '}
            {formatLabNumber(candidate.seedRobustness.relativeSpread)}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">World-model spread (§22):</dt>
          <dd data-testid={`lab-candidate-worlds-${candidate.key}`}>
            worst {formatLabNumber(candidate.worldRobustness.worstExpectedReward)} · best{' '}
            {formatLabNumber(candidate.worldRobustness.bestExpectedReward)} · spread{' '}
            {formatLabNumber(candidate.worldRobustness.spread)}
            {candidate.worldRobustness.perWorld
              .map(
                (world) =>
                  ` · ${world.label} v${world.ensembleVersion}: ${formatLabNumber(
                    world.expectedReward,
                  )}`,
              )
              .join('')}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Member disagreement (§22):</dt>
          <dd data-testid={`lab-candidate-disagreement-${candidate.key}`}>
            worst half-width {formatLabNumber(candidate.disagreement.worstHalfWidth)}
            {candidate.disagreement.perWorld
              .map(
                (world) =>
                  ` · ${world.label}: ±${formatLabNumber(world.halfSpread)} (v${world.ensembleVersion})`,
              )
              .join('')}
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <dt className="text-slate-500">OOD vs declared coverage (§22):</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${oodPresentation.badgeClass}`}
              data-testid={`lab-candidate-ood-${candidate.key}`}
            >
              {oodPresentation.label}
            </span>
            <span>
              {candidate.ood.perWorld
                .map((world) => `${world.label}: distance ${formatLabNumber(world.maxDistance)}`)
                .join(' · ')}
            </span>
          </dd>
        </div>
        {isBaseline || candidate.comparisonToBaseline === null ? (
          <div className="flex flex-wrap gap-1">
            <dt className="text-slate-500">Baseline comparison:</dt>
            <dd data-testid={`lab-candidate-baseline-comparison-${candidate.key}`}>
              This IS the baseline — every declared candidate is compared against it.
            </dd>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            <dt className="text-slate-500">vs no-op baseline (§7):</dt>
            <dd data-testid={`lab-candidate-baseline-comparison-${candidate.key}`}>
              baseline expected{' '}
              {formatLabNumber(candidate.comparisonToBaseline.baselineExpectedReward)} · delta{' '}
              {formatLabNumber(candidate.comparisonToBaseline.expectedRewardDelta)} · intervals{' '}
              {candidate.comparisonToBaseline.overlaps ? 'overlap' : 'do not overlap'}
              {candidate.comparisonToBaseline.certainlyBetter
                ? ' · interval above the baseline upper bound under simulation (never a deployment claim)'
                : ''}
            </dd>
          </div>
        )}
        {candidate.intervalOverlapWithLeader !== null ? (
          <div className="flex flex-wrap gap-1">
            <dt className="text-slate-500">vs rank-1 leader:</dt>
            <dd>
              intervals {candidate.intervalOverlapWithLeader.overlaps ? 'overlap' : 'do not overlap'}
            </dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}

/** The benchmark digest panel over one frozen record version. */
export function LabBenchmarkDigestPanel({ digest }: { readonly digest: LabBenchmarkDigestView }) {
  return (
    <section
      aria-labelledby="lab-benchmark-digest-title"
      className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      data-testid="lab-benchmark-digest"
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="lab-benchmark-digest-title" className="text-base font-semibold text-slate-100">
            Benchmark digest — {digest.summary.benchmarkId} v{digest.version}
          </h3>
          <CounterfactualBadge testId="lab-digest-counterfactual" />
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              digest.integrity.status === 'intact'
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-red-500/15 text-red-300'
            }`}
            data-testid="lab-digest-integrity"
          >
            {labIntegrityLabel(digest.integrity.status)}
          </span>
        </div>
        <p className="font-mono text-xs text-slate-500">
          digest {formatLabDigestShort(digest.integrity.digest)} · recorded {digest.recordedAt} ·{' '}
          {digest.summary.scenarioNiche} / {digest.summary.scenarioPlatform} · tenant{' '}
          <span data-testid="lab-digest-tenant">{digest.summary.tenantId}</span>
        </p>
        <p className="text-xs text-amber-200/80" data-testid="lab-digest-boundary-note">
          {digest.labOnly}
        </p>
        <p className="text-xs text-slate-500">{digest.disclosure}</p>
      </header>

      <div className="grid gap-x-6 gap-y-2 text-xs text-slate-400 sm:grid-cols-2">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Declared robustness policy (versioned)
          </h4>
          <dl className="mt-1 grid gap-1" data-testid="lab-digest-policy">
            <div className="flex flex-wrap gap-1">
              <dt className="text-slate-500">Policy:</dt>
              <dd>
                {digest.policy.id} v{digest.policy.version} — {digest.policy.note}
              </dd>
            </div>
            <div className="flex flex-wrap gap-1">
              <dt className="text-slate-500">Sweep:</dt>
              <dd>
                {digest.policy.seedBudget} seeds ({digest.policy.seeds.join(', ')}) ×{' '}
                {digest.policy.worldModelSet.length} world model
                {digest.policy.worldModelSet.length === 1 ? '' : 's'} (
                {digest.policy.worldModelSet
                  .map((world) => `${world.label}=${world.ensembleId} v${world.ensembleVersion}`)
                  .join(', ')}
                )
              </dd>
            </div>
            <div className="flex flex-wrap gap-1">
              <dt className="text-slate-500">Aggregation / tie-break:</dt>
              <dd>
                {labAggregationLabel(digest.policy.aggregation)} · {digest.policy.tieBreak}
              </dd>
            </div>
          </dl>
        </div>
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Provenance (which versions produced every number)
          </h4>
          <dl className="mt-1 grid gap-1" data-testid="lab-digest-provenance">
            <div className="flex flex-wrap gap-1">
              <dt className="text-slate-500">Versions:</dt>
              <dd>
                simulator v{digest.provenance.simulatorVersion} · corpus v
                {digest.provenance.corpusVersion} · reward spec v
                {digest.provenance.rewardSpecVersion}
              </dd>
            </div>
            <div className="flex flex-wrap gap-1">
              <dt className="text-slate-500">World models:</dt>
              <dd>
                {digest.provenance.worldModels
                  .map(
                    (world) =>
                      `${world.ensembleId} v${world.ensembleVersion} (${world.weightingKind}, ${world.memberWorldModelVersionCount} member${
                        world.memberWorldModelVersionCount === 1 ? '' : 's'
                      })`,
                  )
                  .join(' · ')}
              </dd>
            </div>
            <div className="flex flex-wrap gap-1">
              <dt className="text-slate-500">Calibration citation:</dt>
              <dd data-testid="lab-digest-calibration-citation">
                {digest.citedCalibrationContext === null
                  ? 'none — the first run of the loop cites nothing'
                  : `cites calibration context v${digest.citedCalibrationContext.version} (provenance only, never a calibrated-output claim)`}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <p
        className="rounded border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400"
        data-testid="lab-digest-fairness"
      >
        <span className="font-semibold text-slate-300">Fairness pin:</span> {digest.fairnessStatement}
      </p>

      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Ranked candidates — every value counterfactual with its uncertainty
        </h4>
        <ul className="flex flex-col gap-3">
          <CandidatePanel candidate={digest.noopBaseline} isBaseline={true} />
          {digest.declaredCandidates.map((candidate) => (
            <CandidatePanel key={candidate.key} candidate={candidate} isBaseline={false} />
          ))}
        </ul>
      </div>
    </section>
  );
}
