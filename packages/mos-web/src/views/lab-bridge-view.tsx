import type {
  LabBridgeCandidateView,
  LabBridgeStepView,
  LabCandidateHandoffView,
} from '../ports/lab-bridge.js';
import {
  LAB_BRIDGE_NO_BINDING_LABEL,
  LAB_NO_HANDOFF_NOTE,
} from './lab-presentation.js';
import {
  LabCounterfactualBadge,
  LabDeclaredAffordance,
  LabFact,
  LabSectionEmptyPanel,
  LabSectionLoadingPanel,
  LabSelectionErrorPanel,
} from './lab-workspace-shared.js';

/**
 * The Lab workspace's Next Steps section view (UX-003 wave 2, over the §24
 * authorized path): the DECLARED nine-step path with the MOS authority that
 * gates each step, the lab candidates the bridge can describe a handoff
 * for, and the selected candidate's handoff description — with the honest
 * NO-BINDING state rendered plainly when no real experiment is bound. The
 * bridge never performs a step and offers no shortcut around the boundary.
 */

function LabBridgeStepRow({ step }: { readonly step: LabBridgeStepView }) {
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2"
      data-testid={`lab-bridge-step-${step.position}`}
    >
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-xs font-semibold text-slate-200">{step.position}.</span>
        <span className="text-sm text-slate-100">{step.label}</span>
        {step.surfaceRoute === null ? null : (
          <a
            href={step.surfaceRoute}
            className="text-[11px] text-sky-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            data-testid={`lab-bridge-step-route-${step.position}`}
          >
            {step.surfaceRoute}
          </a>
        )}
      </span>
      <span className="flex flex-wrap gap-x-2 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-400">gated by</span>
        <span className="text-slate-400">{step.gatingAuthority}</span>
      </span>
      <span className="text-[11px] text-slate-400">{step.requires}</span>
    </li>
  );
}

function LabBridgeCandidateRow({
  candidate,
  selected,
}: {
  readonly candidate: LabBridgeCandidateView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/lab?section=bridge&handoff=${encodeURIComponent(candidate.handoffId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
          selected
            ? 'border-sky-600 bg-sky-500/10'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
        data-testid={`lab-bridge-candidate-${candidate.handoffId}`}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-slate-100">{candidate.label}</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
            {candidate.kind}
          </span>
          <LabCounterfactualBadge />
        </span>
        <span className="text-[11px] text-slate-500">
          produced by {candidate.producedBy} · ref{' '}
          <span className="font-mono">{candidate.candidateRef}</span>
        </span>
      </a>
    </li>
  );
}

function LabHandoffPanel({ handoff }: { readonly handoff: LabCandidateHandoffView }) {
  return (
    <div className="flex flex-col gap-4" data-testid="lab-handoff-detail">
      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-sky-800/60 bg-sky-950/20 p-4">
        <LabFact label="candidate">
          {handoff.candidate.label} ({handoff.candidate.kind})
        </LabFact>
        <LabFact label="produced by">{handoff.candidate.producedBy}</LabFact>
        <LabFact label="ref">
          <span className="font-mono">{handoff.candidate.candidateRef}</span>
        </LabFact>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          The §24 authorized path (frozen order — each step names its gatekeeper)
        </h4>
        <ol className="flex flex-col gap-2" data-testid="lab-handoff-path">
          {handoff.path.map((step) => (
            <LabBridgeStepRow key={step.position} step={step} />
          ))}
        </ol>
      </div>

      {handoff.binding === null ? (
        <p
          className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-xs text-amber-200/90"
          data-testid="lab-handoff-no-binding"
        >
          {LAB_BRIDGE_NO_BINDING_LABEL} — no real experiment has been bound to this candidate.
          The boundary has not been crossed, and the bridge does not imply otherwise.
        </p>
      ) : (
        <div
          className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-emerald-900/50 bg-emerald-950/15 p-4"
          data-testid="lab-handoff-binding"
        >
          <LabFact label="mission">{handoff.binding.missionRef}</LabFact>
          <LabFact label="production request">{handoff.binding.productionRequestRef}</LabFact>
          <LabFact label="experiment">{handoff.binding.experimentRef}</LabFact>
          <LabFact label="evidence">{handoff.binding.evidenceRef}</LabFact>
        </div>
      )}

      <p className="text-[11px] text-slate-500" data-testid="lab-handoff-lab-only">
        {handoff.labOnly}
      </p>
    </div>
  );
}

/** The Next Steps bridge section view over the loaded page model fields. */
export function LabBridgeSectionView({
  path,
  candidates,
  selectedHandoff,
  handoffSelectionError,
}: {
  readonly path: readonly LabBridgeStepView[] | null;
  readonly candidates: readonly LabBridgeCandidateView[] | null;
  readonly selectedHandoff: LabCandidateHandoffView | null;
  readonly handoffSelectionError: 'lab-handoff-not-found' | 'load-failed' | null;
}) {
  if (path === null || candidates === null) {
    return <LabSectionLoadingPanel section="bridge" />;
  }
  return (
    <div className="flex flex-col gap-6" data-testid="lab-bridge-section">
      <section aria-labelledby="lab-bridge-path-title">
        <h3 id="lab-bridge-path-title" className="text-sm font-semibold text-slate-100">
          The §24 authorized path
        </h3>
        <p className="mb-2 mt-1 text-xs text-slate-500">
          Exactly one authorized path from a lab candidate to reality — each step declares the MOS
          authority that gates it. NO BYPASS: the bridge names the gatekeepers; it never performs
          a step.
        </p>
        <ol className="flex flex-col gap-2" data-testid="lab-bridge-path-list">
          {path.map((step) => (
            <LabBridgeStepRow key={step.position} step={step} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="lab-bridge-candidates-title">
        <h3 id="lab-bridge-candidates-title" className="text-sm font-semibold text-slate-100">
          Lab candidates ({candidates.length})
        </h3>
        <p className="mb-2 mt-1 text-xs text-slate-500">
          The candidates the lab authorities produced that this bridge can describe a handoff for
          — every one counterfactual-labeled (selection input, never deployment evidence).
        </p>
        {candidates.length === 0 ? (
          <LabSectionEmptyPanel section="bridge" what="lab candidates" />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="lab-bridge-candidate-list">
            {candidates.map((candidate) => (
              <LabBridgeCandidateRow
                key={candidate.handoffId}
                candidate={candidate}
                selected={selectedHandoff?.candidate.handoffId === candidate.handoffId}
              />
            ))}
          </ul>
        )}
      </section>

      {handoffSelectionError !== null ? (
        <LabSelectionErrorPanel
          section="handoff"
          error={handoffSelectionError === 'lab-handoff-not-found' ? 'not-found' : 'load-failed'}
          vocabulary={handoffSelectionError}
        />
      ) : null}

      {selectedHandoff !== null ? <LabHandoffPanel handoff={selectedHandoff} /> : null}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-800 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Declared authority actions (read-only surface)
        </h4>
        <div className="flex flex-wrap gap-4">
          <LabDeclaredAffordance
            action="Create the mission…"
            reason={LAB_NO_HANDOFF_NOTE}
            testId="lab-bridge-affordance-mission"
          />
          <LabDeclaredAffordance
            action="Run the real experiment…"
            reason={LAB_NO_HANDOFF_NOTE}
            testId="lab-bridge-affordance-experiment"
          />
        </div>
      </div>
    </div>
  );
}
