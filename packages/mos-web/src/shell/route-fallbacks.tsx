import type { ShellSectionView } from '../ports/app-shell.js';

/**
 * Explicit fallback surfaces for the shell (WEB-001): route-level load
 * failures, product sections that are not yet available in this build, and
 * unknown routes. Per BROWSER-SHELL-REPLACEMENT-PLAN §4 risk 5 the shell
 * never renders placeholder content — every fallback names exactly what
 * failed and what it is waiting for, and offers the honest action
 * (retry / go home).
 */

/** Route-level load failure: the required read model could not be loaded. */
export function MosRouteErrorView({
  code,
  message,
  retryHref,
}: {
  readonly code: string;
  readonly message: string;
  readonly retryHref: string;
}) {
  return (
    <section
      role="alert"
      aria-labelledby="mos-route-error-title"
      className="rounded-lg border border-red-300 bg-red-50 p-6"
      data-testid="route-error"
    >
      <h2 id="mos-route-error-title" className="text-lg font-semibold text-red-700">
        This page could not be loaded
      </h2>
      <p className="mt-2 text-sm text-red-700">
        The MOS service for this page did not answer ({code}). This is an explicit failure — the
        shell does not guess or fill in placeholder data.
      </p>
      <p className="mt-1 font-mono text-xs text-red-700">{message}</p>
      <a
        href={retryHref}
        className="mt-4 inline-flex items-center rounded-md bg-red-100 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        Retry
      </a>
    </section>
  );
}

/** A product section whose surface lands in a later wave (UX-002..004). */
export function MosSectionNotAvailableView({ section }: { readonly section: ShellSectionView }) {
  const dependsOn =
    section.availability.kind === 'not-yet-available' ? section.availability.dependsOn : '';
  return (
    <section
      aria-labelledby="mos-section-na-title"
      className="rounded-lg border border-slate-200 bg-white p-6"
      data-testid={`section-${section.id}-not-available`}
    >
      <h2 id="mos-section-na-title" className="text-lg font-semibold">
        {section.label} is not yet available
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        The {section.label} surface arrives with{' '}
        <span className="font-mono text-slate-700">{dependsOn}</span>. This shell never renders
        placeholder content for a surface it cannot honestly show — the section stays explicit
        about what it is waiting for.
      </p>
      <a
        href="/"
        className="mt-4 inline-flex items-center rounded-md bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
      >
        Back to Home
      </a>
    </section>
  );
}

/** Unknown route: explicit 404-style surface, never a silent fallback. */
export function MosUnknownRouteView({ path }: { readonly path: string }) {
  return (
    <section
      role="alert"
      aria-labelledby="mos-unknown-route-title"
      className="rounded-lg border border-amber-300 bg-amber-50 p-6"
      data-testid="unknown-route"
    >
      <h2 id="mos-unknown-route-title" className="text-lg font-semibold text-amber-700">
        Page not found
      </h2>
      <p className="mt-2 text-sm text-amber-700">
        <span className="font-mono">{path}</span> is not a MOS route. The shell resolves only its
        declared routes — it never guesses a fallback page.
      </p>
      <a
        href="/"
        className="mt-4 inline-flex items-center rounded-md bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
      >
        Go to Home
      </a>
    </section>
  );
}

/** The Missions page without a resolved tenant context. */
export function MosNoTenantContextView() {
  return (
    <section
      aria-labelledby="mos-no-tenant-title"
      className="rounded-lg border border-slate-200 bg-white p-6"
      data-testid="missions-no-tenant"
    >
      <h2 id="mos-no-tenant-title" className="text-lg font-semibold">
        No tenant context resolved
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Missions are tenant/workspace scoped (spec §31). The shell will not list missions without
        a resolved tenant context — there is no ambient default tenant to guess from.
      </p>
    </section>
  );
}
