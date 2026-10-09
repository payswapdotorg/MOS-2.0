import type { StudioPageData } from './route-loading.js';
import { StudioSessionDirectoryView } from '../views/studio-session-directory.js';
import { StudioSessionDetailPanel } from '../views/studio-session-detail.js';
import { StudioPackageChainPanel, StudioPackageLibraryView } from '../views/studio-packages.js';
import {
  STUDIO_HANDOFF_NOTE,
  STUDIO_LOOP_NARRATION,
} from '../views/studio-presentation.js';
import { MosNoTenantContextView } from '../shell/route-fallbacks.js';

/**
 * The Studio surface (UX-002): the read-side view over the standalone studio
 * product's operator ports (STUDIO-014). It presents the session directory
 * (lifecycle states, §31 tenant context explicit), one session's operator
 * detail (§15 multi-account participants + live consent states, §30 review
 * records), the immutable package library with version chains (§14 synthetic
 * provenance labels visible, consent coverage, evaluation with §30 citations)
 * — and NO operator actions: reviews, treatments and captures are studio-
 * authority actions; the studio never publishes, so the surface shows
 * hand-off state only. Every mutation-shaped control is deliberately absent.
 */

function SelectionErrorPanel({ error }: { readonly error: 'studio-session-not-found' | 'load-failed' }) {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-xs text-amber-200/90"
      data-testid="studio-session-selection-error"
    >
      {error === 'studio-session-not-found'
        ? 'The selected studio session does not exist in this tenant scope (or does not exist at all — the shell cannot tell and will not guess).'
        : 'The selected studio session could not be loaded — the studio directory service failed explicitly.'}
    </aside>
  );
}

function ChainErrorPanel({ error }: { readonly error: 'studio-package-not-found' | 'load-failed' }) {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-xs text-amber-200/90"
      data-testid="studio-chain-error"
    >
      {error === 'studio-package-not-found'
        ? 'The selected artifact package does not exist in this tenant scope (or does not exist at all — the shell cannot tell and will not guess).'
        : 'The selected package chain could not be loaded — the package library service failed explicitly.'}
    </aside>
  );
}

function LibraryUnavailablePanel() {
  return (
    <aside
      role="alert"
      className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-xs text-amber-200/90"
      data-testid="studio-library-unavailable"
    >
      The package library could not be loaded on this pass — the studio package service failed
      explicitly. The session directory above is unaffected; the library is shown as explicitly
      unavailable rather than as a fabricated empty list.
    </aside>
  );
}

/** The Studio page view over the loaded page model. */
export function StudioView({ data }: { readonly data: StudioPageData }) {
  if (data.scope === null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">Studio</h1>
        <MosNoTenantContextView />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">Studio</h1>
        <p className="mt-1 text-sm text-slate-400">
          {STUDIO_LOOP_NARRATION.position} — {STUDIO_LOOP_NARRATION.summary}
        </p>
        <p className="mt-1 text-xs text-slate-500" data-testid="studio-handoff-note">
          {STUDIO_HANDOFF_NOTE}
        </p>
      </header>

      <section aria-labelledby="studio-directory-title">
        <h2 id="studio-directory-title" className="text-base font-semibold text-slate-100">
          Session directory
        </h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          Every session this tenant scope sees, in the state the studio authority reports —
          read-only observation, tenant-scoped (§31).
        </p>
        <StudioSessionDirectoryView
          sessions={data.sessions}
          selectedSessionId={data.selected === null ? null : data.selected.summary.sessionId}
        />
      </section>

      {data.selectionError !== null ? <SelectionErrorPanel error={data.selectionError} /> : null}
      {data.selected !== null ? <StudioSessionDetailPanel detail={data.selected} /> : null}

      <section aria-labelledby="studio-packages-title">
        <h2 id="studio-packages-title" className="text-base font-semibold text-slate-100">
          Artifact packages
        </h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">
          Immutable, versioned output packages with full §14 provenance — synthetic material is
          labeled synthetic; browse a package to walk its treatment version chain.
        </p>
        {data.libraryError !== null ? (
          <LibraryUnavailablePanel />
        ) : (
          <StudioPackageLibraryView
            packages={data.packages}
            selectedPackageId={data.selectedChain === null ? null : data.selectedChain.packageId}
          />
        )}
      </section>

      {data.chainError !== null ? <ChainErrorPanel error={data.chainError} /> : null}
      {data.selectedChain !== null ? <StudioPackageChainPanel chain={data.selectedChain} /> : null}
    </div>
  );
}
