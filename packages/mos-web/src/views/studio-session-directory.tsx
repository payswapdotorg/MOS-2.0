import type { StudioSessionSummaryView } from '../ports/studio-directory.js';
import {
  STUDIO_LIFECYCLE_BADGE_CLASSES,
  studioFormatLabel,
} from './studio-presentation.js';

/**
 * The Studio session directory listing (UX-002): one row per session visible
 * in the tenant scope — format, lifecycle state (the §13 machine, terminals
 * tinted), participant count, the loaded organization version, the packaged
 * artifact version when one exists, and the explicit tenant context (§31).
 * Rows are real links to the session detail (`?session=<id>`); the lifecycle
 * badge presents the state the studio authority reports — never a control.
 */

function StudioSessionRow({
  session,
  selected,
}: {
  readonly session: StudioSessionSummaryView;
  readonly selected: boolean;
}) {
  return (
    <li>
      <a
        href={`/studio?session=${encodeURIComponent(session.sessionId)}`}
        aria-current={selected ? 'page' : undefined}
        className={`flex flex-col gap-1 rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:flex-row sm:items-center sm:justify-between ${
          selected
            ? 'border-sky-600 bg-sky-500/10'
            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
        data-testid={`studio-session-row-${session.sessionId}`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">
              {studioFormatLabel(session.formatId)}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                STUDIO_LIFECYCLE_BADGE_CLASSES[session.lifecycleState]
              }`}
              data-testid={`studio-session-state-${session.sessionId}`}
            >
              {session.lifecycleState}
            </span>
            <span className="font-mono text-xs text-slate-500">{session.sessionId}</span>
          </span>
          <span className="text-xs text-slate-400">
            {session.participantCount === 1
              ? '1 participant'
              : `${session.participantCount} participants (§15 multi-account)`}{' '}
            · organization {session.organizationRef.id} v{session.organizationRef.version}
          </span>
          <span className="font-mono text-xs text-slate-500" data-testid="studio-session-tenant">
            {session.tenantId}
          </span>
        </span>
        <span className="flex shrink-0 flex-col gap-0.5 text-right text-xs text-slate-500">
          <span>
            format v{session.formatVersion} · created {session.createdAt}
          </span>
          {session.artifactPackageRef === null ? (
            <span data-testid={`studio-session-package-none-${session.sessionId}`}>
              No artifact package yet
            </span>
          ) : (
            <span
              className="text-emerald-300/80"
              data-testid={`studio-session-package-${session.sessionId}`}
            >
              Package {session.artifactPackageRef.packageId} v{session.artifactPackageRef.version}
            </span>
          )}
        </span>
      </a>
    </li>
  );
}

/** The session directory list. Empty state is explicit, never placeholder rows. */
export function StudioSessionDirectoryView({
  sessions,
  selectedSessionId,
}: {
  readonly sessions: readonly StudioSessionSummaryView[];
  readonly selectedSessionId: string | null;
}) {
  if (sessions.length === 0) {
    return (
      <p
        className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500"
        data-testid="studio-sessions-empty"
      >
        No studio sessions are visible in this tenant scope. Either none exist yet, or the scope
        genuinely sees none — the shell does not fabricate examples.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="studio-sessions-list">
      {sessions.map((session) => (
        <StudioSessionRow
          key={session.sessionId}
          session={session}
          selected={session.sessionId === selectedSessionId}
        />
      ))}
    </ul>
  );
}
