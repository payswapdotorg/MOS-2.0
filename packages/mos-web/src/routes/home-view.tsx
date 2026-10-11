import {
  MOS_COOPERATING_LOOPS,
  MOS_COMPLETE_LOOP_STAGES,
  MOS_PRODUCT_THESIS,
} from '../views/home-loop.js';
import { LOOP_STAGES } from '../views/disclosure/loop-orientation.js';
import { DisclosureItem } from '../views/disclosure/disclosure-primitive.js';

/**
 * The Home surface (UX-001): the product's front door, narrating the §2
 * complete loop — Mission → Lab → Program → Studio → Artifact graph →
 * Quality/Rights/Policy → Experiment → Measurement → Learning → next run —
 * plus the four cooperating loops and the honest pointer into the Missions
 * surface. Presentation of the loop, not implementation of it: every stage
 * names its owning authority and links only where a surface exists in this
 * build.
 */

function LoopStage({
  index,
  title,
  description,
  owner,
  section,
}: {
  readonly index: number;
  readonly title: string;
  readonly description: string;
  readonly owner: string;
  readonly section: string | null;
}) {
  const sectionLink = SECTION_LINKS[section ?? ''];
  return (
    <li className="relative pl-10" data-testid={`loop-stage-${index}`}>
      <span
        aria-hidden="true"
        className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-sky-300"
      >
        {index}
      </span>
      <h3 className="text-base font-semibold text-slate-100">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-300">{description}</p>
      <p className="mt-2 text-xs text-slate-500">
        Owned by <span className="font-semibold text-slate-400">{owner}</span>
        {sectionLink === undefined ? ' — surface arrives with its wave' : ' · '}
        {sectionLink !== undefined ? (
          <a
            href={sectionLink.href}
            className="ml-1 text-sky-400 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            open the {sectionLink.label} surface
          </a>
        ) : null}
      </p>
    </li>
  );
}

/** Shell sections a loop stage can link into (only surfaces this build shows). */
const SECTION_LINKS: Readonly<Record<string, { readonly href: string; readonly label: string }>> = {
  missions: { href: '/missions', label: 'Missions' },
  studio: { href: '/studio', label: 'Studio' },
};

/** The MOS Home view: thesis headline, the complete loop, the four loops. */
export function HomeView() {
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="mos-home-title">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">
          Marketing-engineering operating system
        </p>
        <h1 id="mos-home-title" className="mt-2 max-w-3xl text-2xl font-bold leading-snug sm:text-3xl">
          {MOS_PRODUCT_THESIS}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          One complete loop, four cooperating loops, every authority named. Start from a declared
          mission; the system discovers, simulates, produces, tests, measures and improves the
          marketing program around it.
        </p>
        <a
          href="/missions"
          className="mt-5 inline-flex items-center rounded-md bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          data-testid="home-cta-missions"
        >
          Go to Missions
        </a>
      </section>

      <section aria-labelledby="mos-home-loop-title">
        <h2 id="mos-home-loop-title" className="text-lg font-semibold">
          The complete loop
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          What one run around the system looks like (spec §2), stage by stage:
        </p>
        <ol className="relative mt-6 flex flex-col gap-6 border-l border-slate-800 pl-0">
          {MOS_COMPLETE_LOOP_STAGES.map((stage, index) => (
            <LoopStage
              key={stage.id}
              index={index + 1}
              title={stage.title}
              description={stage.description}
              owner={stage.owner}
              section={stage.section}
            />
          ))}
        </ol>
      </section>

      <section aria-labelledby="mos-home-orientation-title" data-testid="ux005-orientation-strip">
        <h2 id="mos-home-orientation-title" className="text-lg font-semibold">
          The loop at a glance
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          The complete loop as one compact strip (UX-005 progressive disclosure):
          each stage expands to its paragraph and links to the surface that owns
          it — the same narration as above, layered for scanning.
        </p>
        <ul className="ux005-loop-strip mt-4 flex flex-col gap-2" aria-label="The complete loop">
          {LOOP_STAGES.map((stage) => (
            <li key={stage.id}>
              <DisclosureItem
                id={stage.id}
                summary={<span className="text-sm font-semibold text-slate-200">{stage.stage}</span>}
              >
                <p className="text-sm leading-relaxed text-slate-300">{stage.paragraph}</p>
                <a
                  href={stage.ownerHref}
                  className="mt-2 inline-block text-sm text-sky-400 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                >
                  Go to {stage.ownerLabel}
                </a>
              </DisclosureItem>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mos-home-loops-title">
        <h2 id="mos-home-loops-title" className="text-lg font-semibold">
          Four cooperating loops
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="cooperating-loops">
          {MOS_COOPERATING_LOOPS.map((loop) => (
            <li
              key={loop.id}
              className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"
            >
              <h3 className="text-sm font-semibold text-slate-100">{loop.title}</h3>
              <p className="mt-1 text-xs text-slate-400">{loop.summary}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
