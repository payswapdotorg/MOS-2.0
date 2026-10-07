/**
 * Loading and error screens (WEB-001) — the bootstrap-pattern surfaces
 * ported from the audited Zcode web shell (`packages/web/src/main.tsx`
 * `WebBootstrapErrorScreen` + the pre-mount loading shell; UX substrate
 * audit KEEP table) with MOS naming and zero Zcode imports.
 *
 * All three are pure presentation: the loading surface marks the boot as
 * busy for assistive technology, the bootstrap error screen offers the only
 * honest action (retry the load), and the app error screen is what the error
 * boundary renders when a route fails during rendering.
 */

/** Boot-time loading surface (rendered before the first route view lands). */
export function MosLoadingView({ label }: { readonly label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[40vh] items-center justify-center"
      data-testid="mos-loading"
    >
      <p className="flex items-center gap-3 text-sm text-slate-400">
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-pulse rounded-full bg-sky-400"
        />
        {label}
      </p>
    </div>
  );
}

/** Bootstrap failure: the shell could not even load its own chrome. */
export function MosBootstrapErrorView({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      aria-labelledby="mos-bootstrap-error-title"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center"
      data-testid="mos-bootstrap-error"
    >
      <h1 id="mos-bootstrap-error-title" className="text-xl font-semibold text-red-300">
        MOS failed to start
      </h1>
      <p className="max-w-md text-sm text-red-200/80">
        The browser shell could not load its app configuration. This is an explicit failure — the
        shell does not continue with guessed data.
      </p>
      <p className="max-w-md font-mono text-xs text-red-200/60">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
      >
        Retry
      </button>
    </div>
  );
}

/** Render-time failure surface (rendered by the app error boundary). */
export function MosAppErrorView({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      aria-labelledby="mos-app-error-title"
      className="flex flex-col items-center gap-4 p-8 text-center"
      data-testid="mos-app-error"
    >
      <h1 id="mos-app-error-title" className="text-lg font-semibold text-red-300">
        This view failed to render
      </h1>
      <p className="max-w-md text-sm text-red-200/80">
        An error occurred while rendering the MOS shell. The boundary caught it — nothing was
        guessed around the failure.
      </p>
      <p className="max-w-md font-mono text-xs text-red-200/60">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
      >
        Reload the shell
      </button>
    </div>
  );
}
