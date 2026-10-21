import type {
  LabDerivationStepView,
  LabIdeaDetailView,
  LabIdeaEdgeView,
  LabIdeaGraphView,
  LabIdeaNodeView,
} from '../ports/lab-idea-graph.js';
import { formatLabDigestShort } from './lab-presentation.js';
import {
  LabFact,
  LabSectionEmptyPanel,
  LabSectionLoadingPanel,
  LabSelectionErrorPanel,
} from './lab-workspace-shared.js';

/**
 * The Lab workspace's Idea Graph section view (UX-003 wave 2, over
 * LAB-003): idea nodes (statements distilled from corpus evidence,
 * versioned, derivation-mandatory), the typed weighted versioned edges, and
 * the selected node's navigable detail — its neighborhood and its
 * derivation chain traced back to the acquired content artifacts. Ideas
 * never float free of evidence: every node row carries its derivation
 * reference counts, and the derivation trace is a first-class read.
 */

const EDGE_KIND_LABELS: Readonly<Record<LabIdeaEdgeView['kind'], string>> = Object.freeze({
  supports: 'supports',
  contradicts: 'contradicts',
  'derives-from': 'derives from',
  'combines-with': 'combines with',
  'competes-with': 'competes with',
});

function LabIdeaNodeRow({
  node,
  selected,
}: {
  readonly node: LabIdeaNodeView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/lab?section=idea-graph&node=${encodeURIComponent(node.nodeId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
          selected
            ? 'border-sky-600 bg-sky-500/10'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
        data-testid={`lab-idea-row-${node.nodeId}`}
      >
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-xs text-slate-300">{node.nodeId}</span>
          <span className="text-xs text-slate-500">v{node.version}</span>
        </span>
        <span className="text-sm text-slate-100">{node.statement}</span>
        <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
          <span>
            derives from {node.derivation.documentCount} document
            {node.derivation.documentCount === 1 ? '' : 's'} ·{' '}
            {node.derivation.featureBundleCount} feature bundle
            {node.derivation.featureBundleCount === 1 ? '' : 's'}
          </span>
          <span>
            embedding {node.embeddingRef === null ? 'none computed' : String(node.embeddingRef.artifactId)}
          </span>
          <span className="font-mono">{node.tenantId}</span>
        </span>
      </a>
    </li>
  );
}

function LabIdeaEdgeRow({ edge }: { readonly edge: LabIdeaEdgeView }) {
  const signed = edge.weight > 0 ? `+${edge.weight.toFixed(2)}` : edge.weight.toFixed(2);
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-400"
      data-testid={`lab-idea-edge-${edge.edgeId}`}
    >
      <span className="font-mono text-slate-300">{edge.edgeId}</span>
      <span className="font-mono text-slate-400">{edge.fromNodeId}</span>
      <span
        className={`font-semibold ${
          edge.kind === 'contradicts'
            ? 'text-red-300'
            : edge.kind === 'supports'
              ? 'text-emerald-300'
              : 'text-slate-300'
        }`}
      >
        {EDGE_KIND_LABELS[edge.kind]} ({signed})
      </span>
      <span className="font-mono text-slate-400">{edge.toNodeId}</span>
      <span className="text-slate-500">v{edge.version}</span>
    </li>
  );
}

function LabDerivationStepRow({ step }: { readonly step: LabDerivationStepView }) {
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-3 rounded-md border border-dashed border-slate-800 px-3 py-1.5 text-xs text-slate-400"
      data-testid={`lab-derivation-${step.kind}`}
    >
      {step.kind === 'idea' ? (
        <>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
            idea
          </span>
          <span className="font-mono text-slate-300">{step.nodeId}</span>
        </>
      ) : step.kind === 'feature-bundle' ? (
        <>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
            feature bundle
          </span>
          <span className="font-mono text-slate-300">{step.bundleId}</span>
          <span className="text-slate-500">over document {step.documentId}</span>
        </>
      ) : (
        <>
          <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
            corpus document
          </span>
          <span className="font-mono text-slate-300">{step.documentId}</span>
          <span className="font-mono text-slate-500">
            artifact {String(step.artifact.artifactId)} ·{' '}
            {formatLabDigestShort(String(step.artifact.digest))}
          </span>
        </>
      )}
    </li>
  );
}

function LabIdeaDetailPanel({ detail }: { readonly detail: LabIdeaDetailView }) {
  const { node, neighborhood, derivationChain } = detail;
  return (
    <div className="flex flex-col gap-4" data-testid="lab-idea-detail">
      <div
        className="flex flex-col gap-1 rounded-lg border border-sky-800/60 bg-sky-950/20 p-4"
        data-testid="lab-idea-detail-header"
      >
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-xs text-slate-300">{node.nodeId}</span>
          <span className="text-xs text-slate-500">v{node.version}</span>
        </span>
        <span className="text-sm text-slate-100">{node.statement}</span>
        <span className="flex flex-wrap gap-x-4 text-[11px] text-slate-500">
          <span>provenance {node.provenanceRef}</span>
          <span>created {node.createdAt}</span>
          <span className="font-mono">{node.tenantId}</span>
        </span>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Neighborhood — radius {neighborhood.radius} (the authority's own query)
        </h4>
        <ul className="mb-2 flex flex-col gap-1" data-testid="lab-idea-neighborhood-nodes">
          {neighborhood.nodes.map((neighbor) => (
            <li
              key={neighbor.nodeId}
              className="flex flex-wrap items-baseline gap-x-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs"
            >
              <span className="font-mono text-slate-300">{neighbor.nodeId}</span>
              <span className="truncate text-slate-200">{neighbor.statement}</span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-1" data-testid="lab-idea-neighborhood-edges">
          {neighborhood.edges.map((edge) => (
            <LabIdeaEdgeRow key={edge.edgeId} edge={edge} />
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Derivation chain — back to corpus evidence (oldest-evidence-first)
        </h4>
        <ul className="flex flex-col gap-1" data-testid="lab-idea-derivation">
          {derivationChain.map((step, index) => (
            <LabDerivationStepRow key={`${step.kind}-${index}`} step={step} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The Idea Graph section view over the loaded page model fields. */
export function LabIdeaGraphSectionView({
  ideaGraph,
  selectedIdea,
  ideaSelectionError,
}: {
  readonly ideaGraph: LabIdeaGraphView | null;
  readonly selectedIdea: LabIdeaDetailView | null;
  readonly ideaSelectionError: 'lab-idea-not-found' | 'load-failed' | null;
}) {
  if (ideaGraph === null) {
    return <LabSectionLoadingPanel section="idea-graph" />;
  }
  return (
    <div className="flex flex-col gap-4" data-testid="lab-idea-graph-section">
      {ideaGraph.nodes.length === 0 ? (
        <LabSectionEmptyPanel section="idea-graph" what="idea nodes" />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="lab-idea-list">
          {ideaGraph.nodes.map((node) => (
            <LabIdeaNodeRow
              key={node.nodeId}
              node={node}
              selected={selectedIdea?.node.nodeId === node.nodeId}
            />
          ))}
        </ul>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Typed weighted versioned edges ({ideaGraph.edges.length})
        </h4>
        {ideaGraph.edges.length === 0 ? (
          <LabSectionEmptyPanel section="idea-edges" what="idea edges" />
        ) : (
          <ul className="flex flex-col gap-1" data-testid="lab-idea-edge-list">
            {ideaGraph.edges.map((edge) => (
              <LabIdeaEdgeRow key={edge.edgeId} edge={edge} />
            ))}
          </ul>
        )}
      </div>

      {ideaSelectionError !== null ? (
        <LabSelectionErrorPanel
          section="idea"
          error={ideaSelectionError === 'lab-idea-not-found' ? 'not-found' : 'load-failed'}
          vocabulary={ideaSelectionError}
        />
      ) : null}

      {selectedIdea !== null ? <LabIdeaDetailPanel detail={selectedIdea} /> : null}

      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-dashed border-slate-800 p-4">
        <LabFact label="graph">
          {ideaGraph.nodes.length} nodes · {ideaGraph.edges.length} edges · tenant{' '}
          {ideaGraph.tenantId}
        </LabFact>
      </div>
    </div>
  );
}
