import type { ShellSectionId } from '../ports/app-shell.js';

/**
 * The §2 complete loop as the Home surface narrates it (UX-001).
 *
 * This is PRESENTATION DATA ONLY — the product's front door telling the
 * architecture's story (spec/mos-architecture-v2.0.md §2: user/company →
 * mission → Lab → … → next run). Nothing here implements, decides or
 * computes any part of the loop; each stage names the authority that owns it
 * and links to a shell section only where one exists in this build.
 */

/** One narrated stage of the complete loop. */
export interface CompleteLoopStageView {
  /** Stable presentation id of the stage. */
  readonly id: string;
  /** Stage title as shown in the loop narration. */
  readonly title: string;
  /** One- or two-sentence presentation of what happens at this stage. */
  readonly description: string;
  /** The owning MOS authority (named for the narration, not imported). */
  readonly owner: string;
  /** Shell section link when a surface exists in this build, else `null`. */
  readonly section: ShellSectionId | null;
}

const LOOP_STAGES: readonly CompleteLoopStageView[] = [
  {
    id: 'mission',
    title: 'Mission',
    description:
      'A declared business or social goal with a structured objective, measurable targets, explicit constraints and a versioned, mission-specific reward spec.',
    owner: 'Missions',
    section: 'missions',
  },
  {
    id: 'lab',
    title: 'Lab',
    description:
      'The Marketing Engineering Lab searches the broad reference-first corpus, the Idea Graph and the production graph — ideas, transforms, strategies, agent organizations, capabilities and engines — under bounded cost and delay.',
    owner: 'Lab',
    section: null,
  },
  {
    id: 'program',
    title: 'Program',
    description:
      'The search narrows into a production program: no-op versus transformed strategies, chosen organizations and engines, and an explicit budget envelope.',
    owner: 'Lab',
    section: null,
  },
  {
    id: 'studio',
    title: 'Studio',
    description:
      "The Content Studio produces the program's media — standalone or Lab-requested sessions, adaptive one-person interviews, multi-account participation — and packages artifacts with full provenance.",
    owner: 'Studio',
    section: null,
  },
  {
    id: 'artifact-graph',
    title: 'Artifact graph',
    description:
      'Every produced item lands in the artifact graph: raw human input, intermediate treatments and final versions, linked by immutable, versioned lineage.',
    owner: 'Content',
    section: null,
  },
  {
    id: 'quality-rights-policy',
    title: 'Quality / Rights / Policy',
    description:
      'Packages pass quality evaluation and the rights and policy gates — consent coverage, provenance integrity, license and brand-safety checks — before anything leaves the building.',
    owner: 'Rights / Policy',
    section: null,
  },
  {
    id: 'experiment',
    title: 'Experiment',
    description:
      'The Lab accepts, treats, rejects, retries, substitutes or abandons production output, and bounded real experiments run through the existing MOS experiment authorities.',
    owner: 'Experiments',
    section: null,
  },
  {
    id: 'measurement',
    title: 'Measurement',
    description:
      "Real-world distribution is measured as evidence: outcomes against the mission's declared reward terms, never vanity metrics.",
    owner: 'Evidence / Measurement',
    section: null,
  },
  {
    id: 'learning',
    title: 'Learning',
    description:
      'Observations become learning; the simulator and its models are calibrated so the next simulation is closer to the world.',
    owner: 'Learning',
    section: null,
  },
  {
    id: 'next-run',
    title: 'Next run',
    description:
      'The loop closes: a better-informed strategy, organization and engine mix starts the next run against the same declared mission.',
    owner: 'Mission loop',
    section: 'missions',
  },
];

/** The ten narrated stages of the §2 complete loop, in order. */
export const MOS_COMPLETE_LOOP_STAGES: readonly CompleteLoopStageView[] =
  Object.freeze(LOOP_STAGES);

/** The four cooperating loops of §2, as summarized on the Home surface. */
export interface CooperatingLoopView {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
}

const COOPERATING_LOOPS: readonly CooperatingLoopView[] = [
  {
    id: 'mission-loop',
    title: 'Mission loop',
    summary: 'Goal → strategy → execution → outcome.',
  },
  {
    id: 'production-loop',
    title: 'Production loop',
    summary: 'Request → production → treatment → artifact.',
  },
  {
    id: 'learning-loop',
    title: 'Learning loop',
    summary: 'Observations → model → simulation → real experiment → calibration.',
  },
  {
    id: 'engine-loop',
    title: 'Engine loop',
    summary: 'Capability → engine candidates → benchmark → activation → replacement.',
  },
];

export const MOS_COOPERATING_LOOPS: readonly CooperatingLoopView[] =
  Object.freeze(COOPERATING_LOOPS);

/** One-line product thesis shown as the Home headline (architecture §1). */
export const MOS_PRODUCT_THESIS =
  'A marketing-engineering operating system: it takes a declared business or social goal and can discover, simulate, produce, test, measure and improve a marketing program.';
