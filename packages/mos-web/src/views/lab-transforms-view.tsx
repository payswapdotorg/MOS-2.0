import type {
  LabTransformCandidateDetailView,
  LabTransformDefinitionView,
  LabTransformGraphView,
} from '../ports/lab-transforms.js';
import {
  LAB_NO_AUTO_PRODUCTION_NOTE,
  LAB_NO_PROMOTION_NOTE,
  LAB_TRANSFORM_GATE_STATUS_LABELS,
} from './lab-presentation.js';
import {
  LabDeclaredAffordance,
  LabFact,
  LabSectionEmptyPanel,
  LabSectionLoadingPanel,
  LabSectionUnavailablePanel,
  LabSelectionErrorPanel,
} from './lab-workspace-shared.js';

/**
 * The Lab workspace's Transforms section view (UX-003 wave 2, over
 * LAB-011 + LAB-012): the versioned transform DEFINITIONS (the thirteen
 * frozen §5 kinds as declared contracts — no-op/repost first-class with a
 * real zero-capability definition), the append-only transform graphs, and
 * the §8 discovery candidates with THE SEVEN PROMOTION GATES' explicit
 * pass/fail standing and the append-only promotion-attempt audit trail.
 * A TRANSFORM IS A CONTRACT, NOT AN ENGINE; NO AUTO-PRODUCTION (§24).
 */

function LabTransformDefinitionRow({
  definition,
}: {
  readonly definition: LabTransformDefinitionView;
}) {
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-3 py-2"
      data-testid={`lab-transform-def-${definition.definitionId}`}
    >
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-xs text-slate-800">{definition.definitionId}</span>
        <span className="text-xs text-slate-500">v{definition.version}</span>
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
          {definition.kind}
        </span>
        {definition.humanParticipation ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            human participation
          </span>
        ) : null}
      </span>
      <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
        <span>
          input <span className="font-mono text-slate-700">{definition.inputConstraint.name}</span>{' '}
          ({definition.inputConstraint.acceptedTypes.join(', ')}) ·{' '}
          {definition.inputConstraint.minInputs}–{definition.inputConstraint.maxInputs} inputs ·
          modalities {definition.inputConstraint.acceptedModalities.join(', ')}
          {definition.inputConstraint.requiresRights ? ' · rights required' : ''}
        </span>
        <span>
          outputs {definition.outputContract.outputTypes.join(', ')} ×
          {definition.outputContract.outputCount}
        </span>
      </span>
      <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
        <span>
          capabilities{' '}
          {definition.capabilityRequirements.length === 0
            ? '— none declared (the no-op state is VALID, lock rule 5)'
            : definition.capabilityRequirements
                .map((req) => `${req.capabilityId}@v${req.capabilityVersion}`)
                .join(' · ')}
        </span>
        <span className="font-mono">evaluator {definition.evaluatorRef}</span>
      </span>
      <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
        <span>rights {definition.rightsRequirements.join(', ') || '—'}</span>
        <span>policy {definition.policyRequirements.join(', ') || '—'}</span>
        <span className="font-mono">{definition.createdAt}</span>
      </span>
    </li>
  );
}

function LabTransformGraphRow({ graph }: { readonly graph: LabTransformGraphView }) {
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-3 py-2"
      data-testid={`lab-transform-graph-${graph.graphId}`}
    >
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-xs text-slate-800">{graph.graphId}</span>
        <span className="text-xs text-slate-500">v{graph.version}</span>
        <span className="text-xs text-slate-500">
          {graph.nodes.length} nodes · {graph.edges.length} artifact-flow edges
        </span>
      </span>
      <ul className="flex flex-col gap-0.5">
        {graph.nodes.map((node) => (
          <li
            key={node.nodeId}
            className="flex flex-wrap gap-x-3 text-[11px] text-slate-500"
            data-testid={`lab-graph-node-${node.nodeId}`}
          >
            <span className="font-mono text-slate-700">{node.nodeId}</span>
            <span>
              {node.definitionId}@v{node.definitionVersion}
            </span>
            <span>{node.inputs.length} external input{node.inputs.length === 1 ? '' : 's'}</span>
            <span className="text-slate-500">
              params {Object.keys(node.parameterization).join(', ') || '—'}
            </span>
          </li>
        ))}
      </ul>
      {graph.edges.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2 text-[11px] text-slate-500">
          {graph.edges.map((edge) => (
            <li key={edge.edgeId} className="font-mono">
              {edge.fromNodeId} → {edge.toNodeId}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function LabGateStandingRow({
  gate,
}: {
  readonly gate: LabTransformCandidateDetailView['gates'][number];
}) {
  const statusLabel = LAB_TRANSFORM_GATE_STATUS_LABELS[gate.status];
  const tone =
    gate.status === 'evidence-recorded'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : gate.status === 'evidence-stale'
        ? 'border-amber-300 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-white text-slate-500';
  return (
    <li
      className={`flex flex-col gap-0.5 rounded-md border px-3 py-1.5 text-xs ${tone}`}
      data-testid={`lab-gate-${gate.gate}`}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{gate.gate}</span>
        <span className="text-[11px]">{statusLabel}</span>
      </span>
      <span className="text-[11px] opacity-80">
        {gate.summary ?? '— no evidence recorded at any version'}
        {gate.evidenceCandidateVersion === null
          ? ''
          : ` (evidence covers candidate v${gate.evidenceCandidateVersion})`}
      </span>
    </li>
  );
}

function LabTransformCandidateRow({
  candidate,
  selected,
}: {
  readonly candidate: LabTransformCandidateDetailView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/lab?section=transforms&transform=${encodeURIComponent(candidate.candidateId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy ${
          selected
            ? 'border-mos-navy bg-mos-navy/5'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
        data-testid={`lab-transform-candidate-row-${candidate.candidateId}`}
      >
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-sm text-slate-900">{candidate.candidateId}</span>
          <span className="text-xs text-slate-500">v{candidate.version}</span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
            {candidate.origin}
          </span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            {candidate.proposedKind}
          </span>
          {candidate.promoted ? (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              promoted
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
          <span>
            gates: {candidate.gates.filter((gate) => gate.status === 'evidence-recorded').length}/7
            recorded at this version
          </span>
          <span>{candidate.promotionAttempts.length} promotion attempt{candidate.promotionAttempts.length === 1 ? '' : 's'}</span>
          <span className="font-mono">target {candidate.targetDefinitionId}</span>
        </span>
        <span className="text-[11px] text-slate-500">
          derivation: {candidate.derivation.ideaNodeCount} ideas ·{' '}
          {candidate.derivation.featureBundleCount} bundles ·{' '}
          {candidate.derivation.corpusId === null
            ? 'no corpus'
            : `corpus ${candidate.derivation.corpusId}@v${candidate.derivation.corpusVersion}`}{' '}
          · {candidate.derivation.learnedStrategyCandidateCount} learned ·{' '}
          {candidate.derivation.organizationSearchResultCount} searches
        </span>
      </a>
    </li>
  );
}

function LabTransformCandidateDetailPanel({
  candidate,
}: {
  readonly candidate: LabTransformCandidateDetailView;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="lab-transform-candidate-detail">
      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-mos-navy/30 bg-mos-navy/5 p-4">
        <LabFact label="candidate">
          {candidate.candidateId} v{candidate.version}
        </LabFact>
        <LabFact label="origin">{candidate.origin}</LabFact>
        <LabFact label="citation">
          {candidate.citation === null
            ? 'discovered (derivation carries the provenance)'
            : candidate.citation.kind === 'known'
              ? `known — ${candidate.citation.definitionId}@v${candidate.citation.definitionVersion}`
              : `composed — graph ${candidate.citation.graphId}@v${candidate.citation.graphVersion} (${candidate.citation.memberCount} members)`}
        </LabFact>
        <LabFact label="proposed contract">
          {candidate.proposedKind} · constraint {candidate.proposedInputConstraintName} · outputs{' '}
          {candidate.proposedOutputTypes.join(', ')} ·{' '}
          {candidate.proposedCapabilityRequirementCount} capability requirement
          {candidate.proposedCapabilityRequirementCount === 1 ? '' : 's'}
          {candidate.proposedHumanParticipation ? ' · human participation' : ''}
        </LabFact>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          The seven §8 promotion gates (evaluation order)
        </h4>
        <ul className="flex flex-col gap-1" data-testid="lab-transform-gates">
          {candidate.gates.map((gate) => (
            <LabGateStandingRow key={gate.gate} gate={gate} />
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Promotion-attempt audit trail (append-only, oldest first)
        </h4>
        {candidate.promotionAttempts.length === 0 ? (
          <LabSectionEmptyPanel section="promotion-attempts" what="promotion attempts" />
        ) : (
          <ul className="flex flex-col gap-1" data-testid="lab-promotion-attempts">
            {candidate.promotionAttempts.map((attempt) => (
              <li
                key={attempt.attempt}
                className={`flex flex-col gap-0.5 rounded-md border px-3 py-1.5 text-xs ${
                  attempt.outcome === 'promoted'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-300 bg-red-50 text-red-200/90'
                }`}
                data-testid={`lab-promotion-attempt-${attempt.attempt}`}
              >
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold">
                    attempt {attempt.attempt} — {attempt.outcome}
                  </span>
                  {attempt.failedGate === null ? null : (
                    <span className="font-mono text-[11px]">failed gate: {attempt.failedGate}</span>
                  )}
                  {attempt.definitionVersion === null ? null : (
                    <span className="text-[11px]">
                      appended definition v{attempt.definitionVersion}
                    </span>
                  )}
                  <span className="font-mono text-[11px] opacity-70">{attempt.attemptedAt}</span>
                </span>
                <span className="text-[11px] opacity-80">{attempt.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The Transforms section view over the loaded page model fields. */
export function LabTransformsSectionView({
  transformDefinitions,
  transformGraphs,
  transformCandidates,
  transformsError,
  selectedTransformCandidate,
  transformSelectionError,
}: {
  /** null = not loaded on this pass (the explicit loading state). */
  readonly transformDefinitions: readonly LabTransformDefinitionView[] | null;
  readonly transformGraphs: readonly LabTransformGraphView[] | null;
  readonly transformCandidates: readonly LabTransformCandidateDetailView[] | null;
  readonly transformsError: 'load-failed' | null;
  readonly selectedTransformCandidate: LabTransformCandidateDetailView | null;
  readonly transformSelectionError: 'lab-candidate-not-found' | 'load-failed' | null;
}) {
  if (transformDefinitions === null) {
    return <LabSectionLoadingPanel section="transforms" />;
  }
  return (
    <div className="flex flex-col gap-6" data-testid="lab-transforms-section">
      <section aria-labelledby="lab-transform-defs-title">
        <h3 id="lab-transform-defs-title" className="text-sm font-semibold text-slate-900">
          Transform definitions (LAB-011 — the thirteen frozen §5 kinds)
        </h3>
        <p className="mb-2 mt-1 text-xs text-slate-500">
          Declared CONTRACTS: named input constraints, output contracts, capability requirements
          and the human-participation flag. NO-OP/REPOST is first-class with a real
          zero-capability definition.
        </p>
        {transformDefinitions.length === 0 ? (
          <LabSectionEmptyPanel section="transform-definitions" what="transform definitions" />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="lab-transform-def-list">
            {transformDefinitions.map((definition) => (
              <LabTransformDefinitionRow key={definition.definitionId} definition={definition} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lab-transform-graphs-title">
        <h3 id="lab-transform-graphs-title" className="text-sm font-semibold text-slate-900">
          Transform graphs (append-only declarative DAGs)
        </h3>
        {transformsError !== null ? (
          <LabSectionUnavailablePanel section="transform-graphs" />
        ) : transformGraphs === null ? (
          <LabSectionLoadingPanel section="transform-graphs" />
        ) : transformGraphs.length === 0 ? (
          <LabSectionEmptyPanel section="transform-graphs" what="transform graphs" />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="lab-transform-graph-list">
            {transformGraphs.map((graph) => (
              <LabTransformGraphRow key={graph.graphId} graph={graph} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lab-transform-candidates-title">
        <h3 id="lab-transform-candidates-title" className="text-sm font-semibold text-slate-900">
          §8 discovery candidates (LAB-012 — the seven promotion gates)
        </h3>
        <p className="mb-2 mt-1 text-xs text-slate-500" data-testid="lab-no-auto-production-note">
          {LAB_NO_AUTO_PRODUCTION_NOTE}
        </p>
        {transformsError !== null ? (
          <LabSectionUnavailablePanel section="transform-candidates" />
        ) : transformCandidates === null ? (
          <LabSectionLoadingPanel section="transform-candidates" />
        ) : transformCandidates.length === 0 ? (
          <LabSectionEmptyPanel section="transform-candidates" what="discovery candidates" />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="lab-transform-candidate-list">
            {transformCandidates.map((candidate) => (
              <LabTransformCandidateRow
                key={candidate.candidateId}
                candidate={candidate}
                selected={selectedTransformCandidate?.candidateId === candidate.candidateId}
              />
            ))}
          </ul>
        )}
      </section>

      {transformSelectionError !== null ? (
        <LabSelectionErrorPanel
          section="transform candidate"
          error={
            transformSelectionError === 'lab-candidate-not-found' ? 'not-found' : 'load-failed'
          }
          vocabulary={transformSelectionError}
        />
      ) : null}
      {selectedTransformCandidate !== null ? (
        <LabTransformCandidateDetailPanel candidate={selectedTransformCandidate} />
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-200 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Declared lab-authority actions (read-only surface)
        </h4>
        <div className="flex flex-wrap gap-4">
          <LabDeclaredAffordance
            action="Record gate evidence…"
            reason={LAB_NO_PROMOTION_NOTE}
            testId="lab-transforms-affordance-evidence"
          />
          <LabDeclaredAffordance
            action="Attempt promotion…"
            reason={LAB_NO_PROMOTION_NOTE}
            testId="lab-transforms-affordance-promote"
          />
        </div>
      </div>
    </div>
  );
}
