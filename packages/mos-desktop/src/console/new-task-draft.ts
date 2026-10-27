/**
 * The MOS NEW TASK DRAFT model (W35 — the substrate's New Task page
 * composer state, EMERGED as the MOS console's own draft surface).
 *
 * WHAT THIS MODULE HOLDS: the pure draft state shape (the permission
 * mode + plan toggle + model selection + connection mode + reasoning
 * level + mission context), the seed and the transition helpers (a model
 * pick resets the reasoning level honestly; a connection-mode switch
 * resets a model that the new mode does not enable), the time-of-day
 * greeting table (verbatim from the substrate's chat.empty.greeting.*
 * strings), the permission-mode descriptor set (verbatim from
 * zcode-agent-model-state), the suggested-prompt pool (verbatim from the
 * substrate's fallback coding pool + the i18n defaults), and the task
 * title derivation (the substrate rule: the task title is derived from
 * the first prompt). Pure data + pure functions, no imports: directly
 * consumable by the node test runner through the built dist.
 */

import type { MosModelConnectionModeId } from './model-catalog.js';
import { mosAgentModel, mosModelConnectionMode } from './model-catalog.js';

/** The composer permission modes (the substrate's agent model states). */
export type MosNewTaskMode = 'build' | 'edit' | 'yolo';

/** One permission mode descriptor (labels verbatim from the substrate). */
export interface MosNewTaskModeDescriptor {
  readonly id: MosNewTaskMode;
  readonly label: string;
  readonly description: string;
}

/** The permission mode set, pinned order (the mode menu radio group). */
export const MOS_NEW_TASK_MODES: readonly MosNewTaskModeDescriptor[] = [
  {
    id: 'build',
    label: 'Ask before changes',
    description: 'Ask before each file changes.',
  },
  {
    id: 'edit',
    label: 'Edit automatically',
    description: 'Edit selected files or relevant workspace files automatically.',
  },
  {
    id: 'yolo',
    label: 'Full access',
    description: 'Edit and run commands with fewer confirmations.',
  },
];

/** Resolve a permission mode descriptor by id (undefined when unknown). */
export function mosNewTaskMode(id: string): MosNewTaskModeDescriptor | undefined {
  return MOS_NEW_TASK_MODES.find((mode) => mode.id === id);
}

/**
 * The draft state the New Task page composes from. The ENTRY owns the
 * live instance (the hook-free sections receive it as a prop and emit
 * changes through the controller); this module owns its pure shape.
 */
export interface MosNewTaskDraft {
  /** The permission mode (draft default 'build' — the substrate rule). */
  readonly mode: MosNewTaskMode;
  /** Plan mode (draft default OFF — initializeNewTaskDraft). */
  readonly planEnabled: boolean;
  /** The selected model id (display name IS the id). */
  readonly modelId: string;
  /** The connection mode the picker resolves (Individual/Start/Team/API). */
  readonly connectionMode: MosModelConnectionModeId;
  /** The thought level ('' when the model carries no reasoning control). */
  readonly reasoningLevel: string;
  /** The mission context (null = Home, no mission scope). */
  readonly missionId: string | null;
}

/** The default model per connection mode (the flagship, honestly seeded). */
const DEFAULT_MODEL_BY_MODE: Readonly<Record<MosModelConnectionModeId, string>> = {
  individual: 'GLM-5.3',
  start: 'GLM-5.3-Flash',
  team: 'GLM-5.3',
  api: 'GLM-5.3',
};

/** The honest seed (the substrate's initializeNewTaskDraft defaults). */
export function initialMosNewTaskDraft(): MosNewTaskDraft {
  return {
    mode: 'build',
    planEnabled: false,
    modelId: 'GLM-5.3',
    connectionMode: 'individual',
    reasoningLevel: 'high',
    missionId: null,
  };
}

/**
 * The honest reasoning level for a model: the level the draft holds when
 * the model still lists it, else the model's last non-disabled level,
 * else '' (no control rendered).
 */
function honestReasoningLevel(modelId: string, held: string): string {
  const model = mosAgentModel(modelId);
  if (model === undefined || model.reasoning === null) {
    return '';
  }
  if (model.reasoning.includes(held)) {
    return held;
  }
  const enabled = model.reasoning.filter((level) => level !== 'disabled');
  return enabled.length > 0 ? enabled[enabled.length - 1] ?? '' : '';
}

/**
 * The draft after a model pick: the reasoning level resets honestly (the
 * substrate freezes the model selection with its own option specs).
 */
export function mosNewTaskDraftForModel(
  draft: MosNewTaskDraft,
  modelId: string,
): MosNewTaskDraft {
  return {
    ...draft,
    modelId,
    reasoningLevel: honestReasoningLevel(modelId, draft.reasoningLevel),
  };
}

/**
 * The draft after a connection-mode switch: when the held model is not
 * enabled on the new mode, the pick resets to the mode's default model
 * (the substrate's connection-mode select reshapes the roster).
 */
export function mosNewTaskDraftForConnectionMode(
  draft: MosNewTaskDraft,
  connectionMode: MosModelConnectionModeId,
): MosNewTaskDraft {
  if (draft.connectionMode === connectionMode) {
    return draft;
  }
  const mode = mosModelConnectionMode(connectionMode);
  const roster = mode?.modelIds ?? [];
  const modelId = roster.includes(draft.modelId)
    ? draft.modelId
    : DEFAULT_MODEL_BY_MODE[connectionMode];
  return {
    ...draft,
    connectionMode,
    modelId,
    reasoningLevel: honestReasoningLevel(modelId, draft.reasoningLevel),
  };
}

/* --------------------------------------------------------------------
 * The time-of-day greeting (verbatim — chat.empty.greeting.* bands)
 * -------------------------------------------------------------------- */

/** The greeting bands: [fromHour, toHour, greeting] (hours are inclusive-from). */
const GREETING_BANDS: readonly (readonly [number, number, string])[] = [
  [5, 9, 'Morning, ready when you are'],
  [9, 12, 'Morning, how can I help?'],
  [12, 14, 'Noon break?'],
  [14, 18, 'Good afternoon! Leave the rest to me.'],
  [18, 23, 'Evening, nice work today'],
  [23, 24, "It's late—remember to take care of yourself."],
];

/** The late-night band's continuation (23:00–05:00 wraps past midnight). */
const GREETING_LATE_NIGHT = "It's late—remember to take care of yourself.";

/** The time-of-day greeting for an hour of day (0–23; verbatim strings). */
export function mosNewTaskGreeting(hour: number): string {
  const wrapped = ((hour % 24) + 24) % 24;
  for (const [from, to, greeting] of GREETING_BANDS) {
    if (wrapped >= from && wrapped < to) {
      return greeting;
    }
  }
  return GREETING_LATE_NIGHT;
}

/* --------------------------------------------------------------------
 * The suggested prompt pool (verbatim from the substrate's fallback
 * coding pool + the built-in i18n defaults)
 * -------------------------------------------------------------------- */

/** One suggested prompt chip. */
export interface MosNewTaskSuggestedPrompt {
  readonly id: string;
  readonly label: string;
  /** The prompt text the chip fills the composer with. */
  readonly prompt: string;
}

/** The suggested prompts, pinned order (the waterfall row under the composer). */
export const MOS_NEW_TASK_SUGGESTED_PROMPTS: readonly MosNewTaskSuggestedPrompt[] = [
  {
    id: 'understand-repo',
    label: 'Help me understand and run this repository',
    prompt: 'Help me understand and run this repository',
  },
  {
    id: 'check-branch',
    label: 'Check this branch before I submit it',
    prompt: 'Check this branch before I submit it',
  },
  {
    id: 'run-checks',
    label: 'Run the existing checks and diagnose failures',
    prompt: 'Run the existing checks and diagnose failures',
  },
  {
    id: 'merge-request',
    label: 'Draft a merge request description for this branch',
    prompt: 'Draft a merge request description for this branch',
  },
  {
    id: 'dependency-risks',
    label: "Review this repository's dependencies and upgrade risks",
    prompt: "Review this repository's dependencies and upgrade risks",
  },
  {
    id: 'map-features',
    label: 'Read a repository deeply and map its features',
    prompt: 'Read a repository deeply and map its features',
  },
  {
    id: 'review-commits',
    label: 'Review commits from the last 7 days',
    prompt: 'Review commits from the last 7 days',
  },
  {
    id: 'create-pdf',
    label: 'Create a PDF',
    prompt: 'Create a PDF',
  },
];

/* --------------------------------------------------------------------
 * The task title derivation (the substrate rule: the task title is
 * derived from the first prompt)
 * -------------------------------------------------------------------- */

/** The title derivation cap (chars; the honest truncation point). */
const TITLE_CAP = 64;

/** Derive the task title from the prompt's first non-empty line. */
export function mosNewTaskTitleFromPrompt(prompt: string): string {
  const firstLine =
    prompt
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '';
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= TITLE_CAP) {
    return collapsed;
  }
  return `${collapsed.slice(0, TITLE_CAP - 1).trimEnd()}…`;
}
