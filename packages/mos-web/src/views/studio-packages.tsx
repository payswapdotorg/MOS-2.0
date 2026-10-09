import type {
  StudioArtifactLabelView,
  StudioPackageSummaryView,
  StudioPackageVersionView,
  StudioVersionChainView,
} from '../ports/studio-packages.js';
import {
  STUDIO_HANDOFF_NOTE,
  isSyntheticCreationMethod,
  studioCreationMethodLabel,
  studioEvaluationOutcomeLabel,
} from './studio-presentation.js';

/**
 * The Studio package library (UX-002): the immutable artifact packages the
 * studio composed, browsable as append-only version chains — §14 synthetic
 * provenance labels VISIBLE per version and per final artifact, §15 consent
 * coverage, §19 evaluation with the §30 citation, §6 stage structure and the
 * §12 edit-graph record. NO publish actions exist on this surface: the
 * standing hand-off disclosure renders instead (the studio never publishes).
 */

function ArtifactLabel({ artifact }: { readonly artifact: StudioArtifactLabelView }) {
  const synthetic = artifact.synthetic || isSyntheticCreationMethod(artifact.creationMethod);
  return (
    <li
      className="flex flex-wrap items-center gap-2 text-xs text-slate-400"
      data-testid={`studio-package-artifact-${artifact.artifactId}`}
    >
      <span className="font-mono">{artifact.artifactId}</span>
      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
        {artifact.stage}
      </span>
      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
        {artifact.type}
      </span>
      <span>{studioCreationMethodLabel(artifact.creationMethod)}</span>
      {synthetic ? (
        <span
          className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-300"
          data-testid="studio-synthetic-mark"
        >
          Synthetic
        </span>
      ) : null}
      <span className="text-[11px] text-slate-600">
        {artifact.parentCount === 0
          ? 'no parents (pure raw)'
          : `${artifact.parentCount} parent${artifact.parentCount === 1 ? '' : 's'} (immutable lineage)`}
      </span>
    </li>
  );
}

function PackageVersionCard({ version }: { readonly version: StudioPackageVersionView }) {
  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      data-testid={`studio-package-version-${version.packageId}-v${version.version}`}
      aria-label={`Package ${version.packageId} version ${version.version}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300">
          v{version.version}
        </span>
        <span className="font-mono text-xs text-slate-500">{version.createdAt}</span>
        {version.provenance.containsSyntheticMaterial ? (
          <span
            className="rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-300"
            data-testid="studio-synthetic-disclosure"
          >
            Contains synthetic material (§14)
          </span>
        ) : (
          <span
            className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
            data-testid="studio-no-synthetic-disclosure"
          >
            No synthetic material
          </span>
        )}
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            version.evaluation.status === 'evaluated'
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-slate-700/60 text-slate-300'
          }`}
          data-testid="studio-package-evaluation"
        >
          {studioEvaluationOutcomeLabel(version.evaluation.outcome)}
        </span>
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
        <div className="flex gap-1">
          <dt className="text-slate-500">Evaluation:</dt>
          <dd data-testid="studio-package-evaluation-ref">
            {version.evaluation.evaluationRef === null
              ? version.evaluation.status === 'evaluated'
                ? 'evaluated without a citation ref'
                : 'awaiting evaluation'
              : `cites ${version.evaluation.evaluationRef} (§30)`}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-500">Consent coverage:</dt>
          <dd data-testid="studio-package-consent">
            {version.consent.allRawArtifactsCovered
              ? `all raw artifacts covered · ${version.consent.participantConsentCount} consent record${
                  version.consent.participantConsentCount === 1 ? '' : 's'
                }`
              : `RAW ARTIFACTS NOT FULLY COVERED · ${version.consent.participantConsentCount} consent record${
                  version.consent.participantConsentCount === 1 ? '' : 's'
                }`}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-500">Lineage:</dt>
          <dd data-testid="studio-package-lineage">
            {version.provenance.lineageComplete ? 'complete (§6)' : 'INCOMPLETE'} ·{' '}
            {version.provenance.provenanceRefCount} provenance record
            {version.provenance.provenanceRefCount === 1 ? '' : 's'}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-500">Artifacts:</dt>
          <dd>
            {version.artifactCounts.raw} raw · {version.artifactCounts.intermediate} intermediate ·{' '}
            {version.artifactCounts.final} final
            {version.transcriptCount === 0 ? '' : ` · ${version.transcriptCount} transcript${version.transcriptCount === 1 ? '' : 's'}`}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-500">Edit graph:</dt>
          <dd className="font-mono">
            {version.editGraph.graphId} v{version.editGraph.version}
            {version.editGraph.otioInterchange ? ' · OTIO interchange (§12)' : ''}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-500">Cost / duration:</dt>
          <dd>
            {version.cost.amount} {version.cost.currency} · {version.durationSeconds.capture}s
            capture · {version.durationSeconds.processing}s processing
          </dd>
        </div>
      </dl>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Final artifacts (§14 provenance labels)
        </p>
        <ul className="mt-1 flex flex-col gap-1" data-testid="studio-package-final-artifacts">
          {version.finalArtifacts.map((artifact) => (
            <ArtifactLabel key={artifact.artifactId} artifact={artifact} />
          ))}
        </ul>
      </div>
    </li>
  );
}

function PackageLibraryRow({
  summary,
  selected,
}: {
  readonly summary: StudioPackageSummaryView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/studio?package=${encodeURIComponent(summary.packageId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:flex-row sm:items-center sm:justify-between ${
          selected
            ? 'border-sky-600 bg-sky-500/10'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
        data-testid={`studio-package-row-${summary.packageId}`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-sm font-semibold text-slate-100">
            {summary.packageId}
          </span>
          <span className="text-xs text-slate-400">
            from session <span className="font-mono">{summary.sessionRef}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col gap-0.5 text-right text-xs text-slate-500">
          <span>
            {summary.versionCount === 1
              ? '1 immutable version'
              : `${summary.versionCount} immutable versions (treatment chain)`}
          </span>
          <span className="text-slate-400">latest v{summary.latestVersion}</span>
        </span>
      </a>
    </li>
  );
}

/** The package library listing. Empty state is explicit, never placeholders. */
export function StudioPackageLibraryView({
  packages,
  selectedPackageId,
}: {
  readonly packages: readonly StudioPackageSummaryView[];
  readonly selectedPackageId: string | null;
}) {
  if (packages.length === 0) {
    return (
      <p
        className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500"
        data-testid="studio-packages-empty"
      >
        No artifact packages are visible in this tenant scope. Either the studio composed none yet,
        or the scope genuinely sees none — the shell does not fabricate examples.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="studio-packages-list">
      {packages.map((summary) => (
        <PackageLibraryRow
          key={summary.packageId}
          summary={summary}
          selected={summary.packageId === selectedPackageId}
        />
      ))}
    </ul>
  );
}

/** The immutable version chain of one package — linked lineage, visible. */
export function StudioPackageChainPanel({ chain }: { readonly chain: StudioVersionChainView }) {
  return (
    <article
      aria-labelledby="studio-package-chain-title"
      className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/30 p-4 sm:p-6"
      data-testid="studio-package-chain"
    >
      <header className="flex flex-col gap-1">
        <h3 id="studio-package-chain-title" className="text-base font-semibold text-slate-100">
          Package <span className="font-mono">{chain.packageId}</span> — version chain
        </h3>
        <p className="text-xs text-slate-400">
          from session{' '}
          <a
            href={`/studio?session=${encodeURIComponent(chain.sessionRef)}`}
            className="text-sky-400 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            <span className="font-mono">{chain.sessionRef}</span>
          </a>{' '}
          · {chain.versions.length} immutable version
          {chain.versions.length === 1 ? '' : 's'} — every treatment composed a NEW linked version;
          predecessors are never rewritten (§19)
        </p>
        <p className="text-xs text-slate-500" data-testid="studio-package-handoff">
          {STUDIO_HANDOFF_NOTE}
        </p>
      </header>
      <ol className="flex flex-col gap-3" data-testid="studio-package-versions">
        {chain.versions.map((version) => (
          <PackageVersionCard key={version.version} version={version} />
        ))}
      </ol>
    </article>
  );
}
