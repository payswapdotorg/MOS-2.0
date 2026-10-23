import type { SocialPlatformView } from '../ports/social-workspace.js';
import {
  SOCIAL_RESEARCH_PATH_ACTION,
  SOCIAL_RESEARCH_PATH_BODY,
  SOCIAL_RESEARCH_PATH_TITLE,
  SOCIAL_SANDBOX_BOUNDARY,
  SOCIAL_SANDBOX_SIMULATED_CHIP,
  SOCIAL_SIMULATION_PATH_ACTION,
  SOCIAL_SIMULATION_PATH_BODY,
  SOCIAL_SIMULATION_PATH_TITLE,
  SOCIAL_TASK_FIRST_BODY,
  SOCIAL_TASK_FIRST_TITLE,
} from './social-presentation.js';

/**
 * The "Start with the task, not a login" path cards and the simulation
 * SANDBOX panel (the UXR social wave). Both are the target design's centre
 * column: the path cards link to the OWNING surfaces (Research Lab corpus /
 * simulator / strategy sections and the console research mode) — real links,
 * one route per load; the sandbox panel renders the read model's honest
 * status rows with the SIMULATION label everywhere the sandbox is shown.
 *
 * Presentation-only: no path card simulates an authority action and no
 * sandbox row invents a metric — the values arrive through the read model
 * and every one is a declaration, never a platform fact.
 */

/** The two path cards (target copy; links are the owning surfaces' routes). */
export function SocialTaskPathsPanel({
  platform,
}: {
  readonly platform: SocialPlatformView;
}) {
  return (
    <section
      aria-labelledby="social-task-first-title"
      className="rounded-lg border border-slate-200 bg-white p-4"
      data-testid="social-task-paths"
    >
      <h3 id="social-task-first-title" className="text-sm font-bold text-slate-900">
        {SOCIAL_TASK_FIRST_TITLE}
      </h3>
      <p className="mt-1 text-xs leading-snug text-slate-500">{SOCIAL_TASK_FIRST_BODY}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
          data-testid="social-path-research"
        >
          <h4 className="text-sm font-semibold text-slate-900">{SOCIAL_RESEARCH_PATH_TITLE}</h4>
          <p className="text-xs leading-snug text-slate-500">{SOCIAL_RESEARCH_PATH_BODY}</p>
          <div className="mt-auto flex flex-col gap-1.5">
            <a
              href="/lab?section=corpus"
              className="inline-flex w-fit rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              data-testid="social-path-research-corpus"
            >
              {SOCIAL_RESEARCH_PATH_ACTION}
            </a>
            <a
              href="/console?mode=research"
              className="text-[11px] text-slate-500 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
              data-testid="social-path-research-console"
            >
              Ask the agent in research mode (/console?mode=research) ↗
            </a>
          </div>
        </div>
        <div
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
          data-testid="social-path-simulation"
        >
          <h4 className="text-sm font-semibold text-slate-900">
            {SOCIAL_SIMULATION_PATH_TITLE}
          </h4>
          <p className="text-xs leading-snug text-slate-500">{SOCIAL_SIMULATION_PATH_BODY}</p>
          <div className="mt-auto flex flex-col gap-1.5">
            <a
              href="/lab?section=simulator"
              className="inline-flex w-fit rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              data-testid="social-path-simulation-simulator"
            >
              {SOCIAL_SIMULATION_PATH_ACTION}
            </a>
            <a
              href="#social-setup-details"
              className="text-[11px] text-slate-500 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mos-navy"
              data-testid="social-path-simulation-setup-form"
            >
              Fill the {platform.displayName} setup details below ↘
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/** One honest sandbox status row (value + optional owning-surface route). */
function SandboxStatusRow({
  row,
}: {
  readonly row: {
    readonly label: string;
    readonly value: string;
    readonly sourceRoute: string | null;
  };
}) {
  return (
    <li
      className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3"
      data-testid={`social-sandbox-row-${row.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
    >
      <p className="text-xs font-semibold text-emerald-800">{row.label}</p>
      <p className="mt-0.5 text-[11px] text-emerald-700">{row.value}</p>
      {row.sourceRoute !== null ? (
        <a
          href={row.sourceRoute}
          className="mt-1 inline-flex text-[11px] text-emerald-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          Open the owning surface ↗
        </a>
      ) : null}
    </li>
  );
}

/** The simulation sandbox panel — SANDBOX title, boundary, SIMULATION chip, honest rows. */
export function SocialSandboxPanel({
  sandbox,
}: {
  readonly sandbox: SocialPlatformView['guidedSetup']['simulationSandbox'];
}) {
  return (
    <section
      aria-labelledby="social-sandbox-title"
      className="rounded-lg border border-emerald-300 bg-emerald-50 p-4"
      data-testid="social-simulation-sandbox"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3
          id="social-sandbox-title"
          className="text-sm font-bold text-emerald-800"
          data-testid="social-sandbox-title"
        >
          {sandbox.title}
        </h3>
        <span
          className="rounded border border-emerald-400 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800"
          data-testid="social-sandbox-simulated-chip"
        >
          {SOCIAL_SANDBOX_SIMULATED_CHIP.split(' — ')[0]}
        </span>
      </div>
      <p
        className="mt-1 text-xs font-medium text-emerald-700"
        data-testid="social-sandbox-boundary"
      >
        {SOCIAL_SANDBOX_BOUNDARY}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-emerald-700">
        {SOCIAL_SANDBOX_SIMULATED_CHIP}
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {sandbox.statusRows.map((row) => (
          <SandboxStatusRow key={row.label} row={row} />
        ))}
      </ul>
    </section>
  );
}
