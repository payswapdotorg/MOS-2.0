// UX-005 criterion 4 — §2 loop orientation strip (read-side only, zero new
// data claims). Each stage expands to one paragraph + a link to the owning
// surface route. The wording makes NO claims the surfaces do not already
// make (the honesty law): nothing guarantees, nothing promises causality.
import type { MosRoute } from '../../routes/route.js';

export interface LoopStageView {
  readonly id: string;
  readonly stage: string;
  readonly paragraph: string;
  readonly ownerHref: string;
  readonly ownerLabel: string;
}

export const LOOP_STAGES: readonly LoopStageView[] = [
  {
    id: 'loop-stage-intent',
    stage: 'Intent',
    paragraph:
      'A human or machine states what they want done. Missions capture the intent, its constraints, and its tenant context before anything is promised.',
    ownerHref: '/missions',
    ownerLabel: 'Missions',
  },
  {
    id: 'loop-stage-creation',
    stage: 'Creation',
    paragraph:
      'Studio composes capabilities into packages — declarative, inspectable, nothing hidden in an opaque runtime — so what will run is reviewable before it runs.',
    ownerHref: '/studio',
    ownerLabel: 'Studio',
  },
  {
    id: 'loop-stage-verification',
    stage: 'Verification',
    paragraph:
      'Lab measures. Counterfactual baselines and measured runs are labeled as such — the lab never presents a counterfactual as a measurement.',
    ownerHref: '/lab',
    ownerLabel: 'Lab',
  },
  {
    id: 'loop-stage-connection',
    stage: 'Connection',
    paragraph:
      'Connections bind packages to provider authorities. Health is what platforms SAY, typed CONFIRMED or SUSPECTED; denials carry their attribution.',
    ownerHref: '/connections',
    ownerLabel: 'Connections',
  },
  {
    id: 'loop-stage-evidence',
    stage: 'Evidence',
    paragraph:
      'Every execution returns receipts the loop can reconcile — lifecycle badges, refs resolvable-only or failing honestly, availability verdicts included.',
    ownerHref: '/lab',
    ownerLabel: 'Lab',
  },
];

/** The route kind a stage's owning link lands on (pure mapping, pinned by test). */
export function loopOwnerRoute(stage: LoopStageView): MosRoute['kind'] {
  return stage.ownerHref === '/lab'
    ? 'lab'
    : (stage.ownerHref.slice(1) as MosRoute['kind']);
}
