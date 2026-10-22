import type {
  LabOrganizationSearchResultView,
  LabRankedOrganizationView,
  LabRewardObjectiveView,
  LabStrategyCandidateView,
} from "../ports/lab-strategy.js";
import {
  formatLabExpectedWithInterval,
  LAB_CANDIDATE_ORIGIN_DESCRIPTIONS,
  LAB_CANDIDATE_ORIGIN_LABELS,
  LAB_OOD_PRESENTATION,
  LAB_ORGANIZATION_COMPARISON_LABELS,
} from "./lab-presentation.js";
import type { LabIntentDeclaration } from "../ports/lab-intents.js";
import { LabStrategyIntentForms } from "./lab-strategy-intent-forms.js";
import {
  LabCounterfactualBadge,
  LabFact,
  LabSectionEmptyPanel,
  LabSectionLoadingPanel,
  LabSectionUnavailablePanel,
  LabSelectionErrorPanel,
} from "./lab-workspace-shared.js";

/**
 * The Lab workspace's Strategy & Organizations section view (UX-003 wave 2,
 * over LAB-007..010): strategy candidates across the origin vocabulary
 * (learned candidates with their full learning trace + benchmark-declared
 * candidates including the always-present no-op baseline), the §23
 * organization search results with THE THREE-WAY COMPARISON rendered
 * structurally (generalist baseline + hand-designed + generated — always
 * all three), and the DECLARED mission-specific reward objective with
 * explicit metric-source bindings (§21). Every expected value renders WITH
 * its §22 interval; every candidate is counterfactual-labeled.
 *
 * UX-003 wave 3: the section's two write paths (organization search +
 * strategy learning) are DECLARED through the lab-intents port — the forms
 * live in `lab-strategy-intent-forms.tsx` (the 400-line budget split); the
 * owning authorities alone execute, version and gate the records (frozen
 * ensembles), and their verdicts return on the next load.
 */

function LabStrategyCandidateRow({
  candidate,
  selected,
}: {
  readonly candidate: LabStrategyCandidateView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/lab?section=strategy&candidate=${encodeURIComponent(candidate.candidateId)}`}
        aria-current={selected ? "page" : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy ${
          selected
            ? "border-mos-navy bg-mos-navy/5"
            : "border-slate-200 bg-white hover:border-slate-300"
        }`}
        data-testid={`lab-strategy-row-${candidate.candidateId}`}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-slate-900">{candidate.candidateId}</span>
          {candidate.label === null ? null : (
            <span className="text-xs text-slate-500">{candidate.label}</span>
          )}
          <span
            className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
            title={LAB_CANDIDATE_ORIGIN_DESCRIPTIONS[candidate.origin]}
            data-testid={`lab-strategy-origin-${candidate.candidateId}`}
          >
            {LAB_CANDIDATE_ORIGIN_LABELS[candidate.origin]}
          </span>
          <LabCounterfactualBadge testId={`lab-strategy-counterfactual-${candidate.candidateId}`} />
        </span>
        <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
          <span>
            action {candidate.action.kind} · {candidate.action.cadencePerWeek}×/week · novelty{" "}
            {candidate.action.novelty.toFixed(2)} · engagement{" "}
            {candidate.action.engagementEffort.toFixed(2)}
          </span>
          <span className="font-mono text-slate-500">{candidate.action.strategyRef}</span>
        </span>
        <span className="font-mono text-xs text-slate-700" data-testid="lab-strategy-expected">
          {formatLabExpectedWithInterval(candidate.expectedReward, candidate.interval)} · horizon{" "}
          {candidate.horizonSteps} steps
        </span>
        <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
          <span>
            ensemble {candidate.provenance.ensembleId} v{candidate.provenance.ensembleVersion} ·
            members v{candidate.provenance.memberWorldModelVersions.join("/")}
          </span>
          <span>
            simulator v{candidate.provenance.simulatorVersion} · reward spec v
            {candidate.provenance.rewardSpecVersion}
          </span>
          <span>
            seed{candidate.provenance.seeds.length === 1 ? "" : "s"}{" "}
            {candidate.provenance.seeds.join(", ")}
          </span>
        </span>
        {candidate.learning === null ? null : (
          <span className="text-[11px] text-slate-500" data-testid="lab-strategy-learning">
            learned over {candidate.learning.iterationCount} iterations · stopped:{" "}
            {candidate.learning.stoppingReason} — {candidate.learning.stoppingDetail}
            {candidate.learning.finalEstimate === null
              ? ""
              : ` · final estimate ${formatLabExpectedWithInterval(
                  candidate.learning.finalEstimate.reward,
                  candidate.learning.finalEstimate.interval,
                )}`}
          </span>
        )}
      </a>
    </li>
  );
}

function LabRankedOrganizationRow({ ranked }: { readonly ranked: LabRankedOrganizationView }) {
  const ood = LAB_OOD_PRESENTATION[ranked.ood.status];
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-3 py-2"
      data-testid={`lab-ranked-org-${ranked.organization.organizationId}`}
    >
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-xs font-semibold text-slate-800">#{ranked.rank}</span>
        <span className="font-mono text-xs text-slate-700">
          {ranked.organization.organizationId}
        </span>
        <span className="text-xs text-slate-500">v{ranked.organization.version}</span>
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-700">
          {ranked.origin}
        </span>
        <LabCounterfactualBadge />
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ood.badgeClass}`}
          title={ranked.ood.flagged ? "flagged" : "not flagged"}
        >
          {ood.label}
        </span>
      </span>
      <span className="font-mono text-xs text-slate-700">
        {formatLabExpectedWithInterval(ranked.expectedReward, ranked.interval)} · disagreement ±
        {ranked.disagreementHalfWidth.toFixed(2)}
      </span>
      <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
        <span>
          {ranked.features.agentCount} agents · roles {ranked.features.roles.join(", ")}
        </span>
        <span>
          critics {ranked.features.critics.join(", ") || "—"} · {ranked.features.executionOrdering}
        </span>
        <span>
          tools{" "}
          {ranked.features.toolAllocation
            .map((entry) => `${entry.nodeId}:${entry.toolRefs.length}`)
            .join(" ") || "—"}
        </span>
      </span>
      <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
        <span className="font-mono">
          per-seed{" "}
          {ranked.seedRobustness.perSeedExpected.map((value) => value.toFixed(2)).join(" / ")} ·
          spread {ranked.seedRobustness.spread.toFixed(2)}
        </span>
        {ranked.generationIndex === null ? null : <span>generation {ranked.generationIndex}</span>}
        {ranked.variedDimensions.length === 0 ? null : (
          <span>varied: {ranked.variedDimensions.join(", ")}</span>
        )}
        {ranked.intervalOverlapWithLeader === null ? null : (
          <span>
            leader interval{" "}
            {ranked.intervalOverlapWithLeader.overlaps ? "OVERLAPS" : "does not overlap"}
          </span>
        )}
      </span>
      <span className="text-[10px] text-slate-600">
        fingerprint {Object.keys(ranked.features.fingerprint).length} §23 dimensions
      </span>
    </li>
  );
}

function LabOrganizationSearchPanel({
  search,
}: {
  readonly search: LabOrganizationSearchResultView;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
      data-testid={`lab-org-search-${search.searchId}`}
    >
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-sm text-slate-900">{search.searchId}</span>
        <LabCounterfactualBadge testId={`lab-org-search-counterfactual-${search.searchId}`} />
        <span className="text-xs text-slate-500">scenario {search.scenarioRef}</span>
        <span className="text-xs text-slate-500">
          ensemble {search.ensembleId} v{search.ensembleVersion}
        </span>
        <span className="font-mono text-xs text-slate-500">{search.searchedAt}</span>
      </span>

      <div
        className="rounded-md border border-mos-navy/30 bg-mos-navy/5 p-3"
        data-testid={`lab-org-comparison-${search.searchId}`}
      >
        <h4 className="mb-2 text-xs font-semibold text-mos-navy/90">
          The §23 three-way comparison — always all three
        </h4>
        <div className="flex flex-col gap-2">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {LAB_ORGANIZATION_COMPARISON_LABELS.baseline}
            </span>
            <ul className="mt-1 flex flex-col gap-1">
              <LabRankedOrganizationRow ranked={search.comparison.baseline} />
            </ul>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {LAB_ORGANIZATION_COMPARISON_LABELS.handDesigned}
            </span>
            <ul className="mt-1 flex flex-col gap-1">
              <LabRankedOrganizationRow ranked={search.comparison.handDesigned} />
            </ul>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {LAB_ORGANIZATION_COMPARISON_LABELS.generated} ({search.comparison.generated.length})
            </span>
            <ul className="mt-1 flex flex-col gap-1">
              {search.comparison.generated.map((ranked) => (
                <LabRankedOrganizationRow
                  key={ranked.organization.organizationId}
                  ranked={ranked}
                />
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
        <LabFact label="budget">
          {search.budget.consumedMemberSteps}/{search.budget.maxMemberSteps} member steps ·{" "}
          {search.budget.evaluationsExecuted} evaluations · {search.budget.generatedEvaluated}{" "}
          generated evaluated
        </LabFact>
        <LabFact label="stopping">
          {search.stopping.reason} — {search.stopping.detail} ({search.stopping.generationsExecuted}{" "}
          generations)
        </LabFact>
      </div>
    </div>
  );
}

function LabRewardObjectivePanel({ objective }: { readonly objective: LabRewardObjectiveView }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4"
      data-testid="lab-reward-objective"
    >
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-sm font-semibold text-slate-900">
          Declared reward objective (LAB-008/009)
        </span>
        <span className="text-xs text-slate-500">scenario {objective.scenarioRef}</span>
        <span className="text-xs text-slate-500">reward spec v{objective.rewardSpecVersion}</span>
      </span>
      <ul className="flex flex-col gap-1">
        {objective.terms.map((term) => (
          <li
            key={term.metric}
            className="flex flex-col gap-0.5 rounded-md border border-slate-200 px-3 py-1.5"
            data-testid={`lab-reward-term-${term.metric}`}
          >
            <span className="flex flex-wrap items-baseline gap-x-3 text-xs">
              <span className="text-slate-800">{term.metric}</span>
              <span className="text-slate-500">
                weight {term.weight} · {term.direction}
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                source: {term.metricSource}
              </span>
            </span>
            <span className="text-[11px] text-slate-500">{term.definition}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
        <LabFact label="objective">{objective.constraints.objective}</LabFact>
        <LabFact label="max cost">
          {objective.constraints.maxCost.amount} {objective.constraints.maxCost.currency}
        </LabFact>
        <LabFact label="max duration">
          {(objective.constraints.maxDurationMs / 3_600_000).toFixed(0)}h
        </LabFact>
      </div>
    </div>
  );
}

/** The Strategy & Organizations section view over the loaded page model. */
export function LabStrategySectionView({
  strategyCandidates,
  organizationSearches,
  rewardObjective,
  strategyError,
  selectedCandidate,
  candidateSelectionError,
  onDeclareLabIntent,
}: {
  /** null = not loaded on this pass (the explicit loading state). */
  readonly strategyCandidates: readonly LabStrategyCandidateView[] | null;
  readonly organizationSearches: readonly LabOrganizationSearchResultView[] | null;
  readonly rewardObjective: LabRewardObjectiveView | null;
  readonly strategyError: "load-failed" | null;
  readonly selectedCandidate: LabStrategyCandidateView | null;
  readonly candidateSelectionError: "lab-candidate-not-found" | null;
  /** Shell callback routing write-intent declarations to the lab-intents port. */
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}) {
  if (strategyCandidates === null) {
    return <LabSectionLoadingPanel section="strategy" />;
  }
  return (
    <div className="flex flex-col gap-6" data-testid="lab-strategy-section">
      <section aria-labelledby="lab-strategy-candidates-title">
        <h3 id="lab-strategy-candidates-title" className="text-sm font-semibold text-slate-900">
          Strategy candidates ({strategyCandidates.length})
        </h3>
        <p className="mb-2 mt-1 text-xs text-slate-500">
          Learned candidates (LAB-009) and benchmark-declared candidates across the origin
          vocabulary — the no-op baseline is ALWAYS present as its own row, never hidden in a
          comparison. Every expected value WITH its §22 interval.
        </p>
        {strategyCandidates.length === 0 ? (
          <LabSectionEmptyPanel section="strategy" what="strategy candidates" />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="lab-strategy-list">
            {strategyCandidates.map((candidate) => (
              <LabStrategyCandidateRow
                key={candidate.candidateId}
                candidate={candidate}
                selected={selectedCandidate?.candidateId === candidate.candidateId}
              />
            ))}
          </ul>
        )}
      </section>

      {candidateSelectionError !== null ? (
        <LabSelectionErrorPanel
          section="candidate"
          error="not-found"
          vocabulary={candidateSelectionError}
        />
      ) : null}

      <section aria-labelledby="lab-org-searches-title">
        <h3 id="lab-org-searches-title" className="text-sm font-semibold text-slate-900">
          Agent-organization searches (LAB-010, §23)
        </h3>
        {strategyError !== null ? (
          <LabSectionUnavailablePanel section="organization-searches" />
        ) : organizationSearches === null ? (
          <LabSectionLoadingPanel section="organization-searches" />
        ) : organizationSearches.length === 0 ? (
          <LabSectionEmptyPanel
            section="organization-searches"
            what="organization search results"
          />
        ) : (
          <div className="flex flex-col gap-4" data-testid="lab-org-search-list">
            {organizationSearches.map((search) => (
              <LabOrganizationSearchPanel key={search.searchId} search={search} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="lab-reward-title">
        <h3 id="lab-reward-title" className="text-sm font-semibold text-slate-900">
          The declared objective this evaluation optimizes
        </h3>
        <p className="mb-2 mt-1 text-xs text-slate-500">
          The versioned reward spec the ACTIVE scenario pins — terms bind their value sources
          EXPLICITLY (§21: vanity metrics never silently replace the declared objective).
        </p>
        {rewardObjective === null ? (
          <p
            className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500"
            data-testid="lab-reward-objective-unavailable"
          >
            No reward objective is visible: either no active scenario is pinned in this tenant
            scope, or the objective read failed — rendered as exactly that, never a guessed spec.
          </p>
        ) : (
          <LabRewardObjectivePanel objective={rewardObjective} />
        )}
      </section>

      <LabStrategyIntentForms onDeclareLabIntent={onDeclareLabIntent} />
    </div>
  );
}
