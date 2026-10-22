import type {
  LabCorpusDetailView,
  LabCorpusSummaryView,
} from '../ports/lab-corpus.js';
import { formatLabDigestShort, LAB_NO_INGESTION_NOTE } from './lab-presentation.js';
import type { LabIntentDeclaration } from '../ports/lab-intents.js';
import {
  LAB_INTENT_FORM_FIELDS,
  ingestDeclarationFromFormData,
  snapshotDeclarationFromFormData,
} from './lab-intent-form-data.js';
import { LabIntentForm } from './lab-intent-form.js';
import {
  LabDeclaredAffordance,
  LabFact,
  LabSectionEmptyPanel,
  LabSectionLoadingPanel,
  LabSelectionErrorPanel,
} from './lab-workspace-shared.js';

/**
 * The Lab workspace's Corpus & Evidence section view (UX-003 wave 2, over
 * LAB-001 + LAB-002): corpus version snapshots listed with their
 * reference-document counts, and the selected chain's full detail — every
 * document an acquired CONTENT REFERENCE (never bytes) with its explicit
 * rights grant + provenance, feature bundles as COMPUTED artifact refs, and
 * the DECLARED capability requirements. NO INGESTION SURFACE: the
 * acquisition affordances render disabled-with-reason (CORE-003 gating).
 */

function LabCorpusSummaryRow({
  corpus,
  selected,
}: {
  readonly corpus: LabCorpusSummaryView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/lab?section=corpus&corpus=${encodeURIComponent(corpus.corpusId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy sm:flex-row sm:items-center sm:justify-between ${
          selected
            ? 'border-mos-navy bg-mos-navy/5'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
        data-testid={`lab-corpus-row-${corpus.corpusId}`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{corpus.corpusId}</span>
            <span className="text-xs text-slate-500">
              {corpus.niche} · {corpus.platform}
            </span>
          </span>
          <span className="text-xs text-slate-500">
            chain v{corpus.latestVersion} · {corpus.versionCount} snapshot
            {corpus.versionCount === 1 ? '' : 's'} · {corpus.documentCount} documents ·{' '}
            {corpus.attachedBundleCount} attached feature bundle
            {corpus.attachedBundleCount === 1 ? '' : 's'}
          </span>
          <span className="text-xs text-slate-500">
            modalities: {corpus.modalities.join(', ') || '—'}
          </span>
          <span className="font-mono text-xs text-slate-500">{corpus.tenantId}</span>
        </span>
        <span className="flex shrink-0 flex-col gap-0.5 text-right text-xs text-slate-500">
          <span>latest snapshot {corpus.latestSnapshotAt}</span>
          <span>
            acquired {corpus.acquiredFrom} → {corpus.acquiredTo}
          </span>
        </span>
      </a>
    </li>
  );
}

function LabCorpusDetailPanel({ detail }: { readonly detail: LabCorpusDetailView }) {
  const { summary, versions, documents, featureBundles, featureRequirements } = detail;
  return (
    <div className="flex flex-col gap-4" data-testid="lab-corpus-detail">
      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-mos-navy/30 bg-mos-navy/5 p-4">
        <LabFact label="corpus">{summary.corpusId}</LabFact>
        <LabFact label="latest version">v{summary.latestVersion}</LabFact>
        <LabFact label="documents">{summary.documentCount}</LabFact>
        <LabFact label="attached bundles">{summary.attachedBundleCount}</LabFact>
        <LabFact label="tenant">{summary.tenantId}</LabFact>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Append-only version history (oldest first)
        </h4>
        <ul className="flex flex-col gap-1" data-testid="lab-corpus-versions">
          {versions.map((version) => (
            <li
              key={version.version}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500"
            >
              <span className="font-mono text-slate-700">v{version.version}</span>
              <span>{version.documentCount} documents</span>
              <span className="font-mono text-slate-500">{version.createdAt}</span>
              <span className="text-slate-500">{version.notes ?? '— no notes'}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Reference documents (acquired content REFERENCES — never bytes)
        </h4>
        <ul className="flex flex-col gap-2" data-testid="lab-corpus-documents">
          {documents.map((document) => (
            <li
              key={document.documentId}
              className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-3 py-2"
              data-testid={`lab-corpus-document-${document.documentId}`}
            >
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-slate-800">{document.documentId}</span>
                <span className="text-xs text-slate-500">v{document.version}</span>
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-700">
                  {document.modality}
                </span>
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                <span>
                  artifact{' '}
                  <span className="font-mono text-slate-700" title={String(document.artifact.artifactId)}>
                    {String(document.artifact.artifactId)} ·{' '}
                    {formatLabDigestShort(String(document.artifact.digest))}
                  </span>
                </span>
                <span>acquired {document.acquiredAt}</span>
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                <span className="text-amber-700">rights {document.rightsRef}</span>
                <span>provenance {document.provenanceRef}</span>
              </span>
              <span className="text-[11px] text-slate-500">
                sources: {document.sourceRefs.join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Feature bundles (LAB-002 — computed artifact refs + scalar manifests)
        </h4>
        {featureBundles.length === 0 ? (
          <LabSectionEmptyPanel section="corpus-bundles" what="attached feature bundles" />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="lab-corpus-bundles">
            {featureBundles.map((bundle) => (
              <li
                key={bundle.bundleId}
                className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-3 py-2"
                data-testid={`lab-corpus-bundle-${bundle.bundleId}`}
              >
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-slate-800">{bundle.bundleId}</span>
                  <span className="text-xs text-slate-500">v{bundle.version}</span>
                  <span className="text-xs text-slate-500">over {bundle.documentId}</span>
                  {bundle.detachedAt === null ? null : (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
                      detached {bundle.detachedAt}
                    </span>
                  )}
                </span>
                <ul className="flex flex-col gap-0.5">
                  {bundle.features.map((feature) => (
                    <li
                      key={feature.kind}
                      className="flex flex-wrap gap-x-4 text-[11px] text-slate-500"
                    >
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-700">
                        {feature.kind}
                      </span>
                      <span className="font-mono text-slate-700">
                        {String(feature.artifact.artifactId)}
                      </span>
                      <span className="text-slate-500">
                        {Object.entries(feature.metadata)
                          .map(([key, value]) => `${key}=${String(value)}`)
                          .join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
                <span className="text-[11px] text-slate-500">
                  provenance {bundle.provenanceRef} · created {bundle.createdAt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          DECLARED capability requirements (per feature kind)
        </h4>
        <ul className="flex flex-wrap gap-2" data-testid="lab-corpus-requirements">
          {featureRequirements.map((requirement) => (
            <li
              key={requirement.kind}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500"
            >
              <span className="text-slate-800">{requirement.kind}</span> needs{' '}
              <span className="font-mono text-slate-700">{requirement.capabilityId}</span> @
              v{requirement.capabilityVersion}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The Corpus & Evidence section view over the loaded page model fields. */
export function LabCorpusSectionView({
  summaries,
  selectedCorpus,
  corpusSelectionError,
  onDeclareLabIntent,
}: {
  /** null = not loaded on this pass (the explicit loading state). */
  readonly summaries: readonly LabCorpusSummaryView[] | null;
  readonly selectedCorpus: LabCorpusDetailView | null;
  readonly corpusSelectionError: 'lab-corpus-not-found' | 'load-failed' | null;
  /** Shell callback routing write-intent declarations to the lab-intents port. */
  readonly onDeclareLabIntent: (declaration: LabIntentDeclaration) => void;
}) {
  if (summaries === null) {
    return <LabSectionLoadingPanel section="corpus" />;
  }
  return (
    <div className="flex flex-col gap-4" data-testid="lab-corpus-section">
      {summaries.length === 0 ? (
        <LabSectionEmptyPanel section="corpus" what="corpus chains" />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="lab-corpus-list">
          {summaries.map((corpus) => (
            <LabCorpusSummaryRow
              key={corpus.corpusId}
              corpus={corpus}
              selected={selectedCorpus?.summary.corpusId === corpus.corpusId}
            />
          ))}
        </ul>
      )}

      {corpusSelectionError !== null ? (
        <LabSelectionErrorPanel
          section="corpus"
          error={corpusSelectionError === 'lab-corpus-not-found' ? 'not-found' : 'load-failed'}
          vocabulary={corpusSelectionError}
        />
      ) : null}

      {selectedCorpus !== null ? <LabCorpusDetailPanel detail={selectedCorpus} /> : null}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-200 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Declared lab-authority actions (write-intent declarations)
        </h4>
        <p className="text-[11px] text-slate-500">
          The two write paths of this section are EXECUTABLE through the lab-intents port; the
          authority's verdict (receipt or named rejection) returns here after the declaration.
        </p>
        <div className="flex flex-col gap-3">
          <LabIntentForm
            testId="lab-corpus-intent-ingest"
            summaryLabel="Acquire a reference document (LAB-001 — rights-gated)"
            routedTo="lab-corpus-authority"
            disclosureNote="Acquisition requires an explicit, active, tenant-matching rights grant — with none registered the authority DENIES and the rejection says so."
            onDeclareLabIntent={onDeclareLabIntent}
            parse={ingestDeclarationFromFormData}
            fields={[
              { name: LAB_INTENT_FORM_FIELDS.documentId, label: 'Document id', kind: 'text', required: true, placeholder: 'e.g. doc-refs-001' },
              { name: LAB_INTENT_FORM_FIELDS.niche, label: 'Niche', kind: 'text', required: true, placeholder: 'e.g. developer-marketing' },
              { name: LAB_INTENT_FORM_FIELDS.platform, label: 'Platform', kind: 'text', required: true, placeholder: 'e.g. mastodon' },
              { name: LAB_INTENT_FORM_FIELDS.modality, label: 'Modality (authority vocabulary)', kind: 'text', required: true, placeholder: 'e.g. text' },
              { name: LAB_INTENT_FORM_FIELDS.artifactId, label: 'Artifact id', kind: 'text', required: true },
              { name: LAB_INTENT_FORM_FIELDS.sourceRefsText, label: 'Source refs (comma-separated)', kind: 'text', required: false },
              { name: LAB_INTENT_FORM_FIELDS.acquiredAt, label: 'Acquired at (ISO-8601)', kind: 'text', required: true, placeholder: 'e.g. 2026-10-21T12:00:00Z' },
              { name: LAB_INTENT_FORM_FIELDS.rightsRef, label: 'Rights ref (the acquisition gate resolves this)', kind: 'text', required: true },
              { name: LAB_INTENT_FORM_FIELDS.provenanceRef, label: 'Provenance ref', kind: 'text', required: true },
            ]}
          />
          <LabIntentForm
            testId="lab-corpus-intent-snapshot"
            summaryLabel="Snapshot a corpus version (LAB-001 — append-only membership set)"
            routedTo="lab-corpus-authority"
            disclosureNote="The snapshot's membership is the declared document refs — duplicates are the authority's to reject by name; an empty set is a valid version."
            onDeclareLabIntent={onDeclareLabIntent}
            parse={snapshotDeclarationFromFormData}
            fields={[
              { name: LAB_INTENT_FORM_FIELDS.documentRefsText, label: 'Document refs (comma-separated membership set)', kind: 'text', required: false },
            ]}
          />
          <LabDeclaredAffordance
            action="Attach feature bundle…"
            reason={LAB_NO_INGESTION_NOTE}
            testId="lab-corpus-affordance-bundle"
          />
        </div>
      </div>
    </div>
  );
}

