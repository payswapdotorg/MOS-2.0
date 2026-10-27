/**
 * The MOS AGENT MODEL CATALOG (W35 — the zcode substrate's frozen builtin
 * GLM roster, EMERGED as the MOS console's own model truth).
 *
 * WHAT THIS MODULE HOLDS: the canonical GLM model roster exactly as the
 * substrate ships it (packages/shared official-glm-model-id.ts canonical
 * list + the frozen facts from config/provider/zcode-builtin.json: vision
 * input support, reasoning-level option specs, context window, max output
 * tokens, plan membership), the per-connection-mode rosters (Individual /
 * Start / Team plan accesses and the API surface), and the provider
 * families (Z.ai / BigModel). Pure data + pure functions, no imports:
 * directly consumable by the node test runner through the built dist.
 *
 * HONESTY: this catalog is REFERENCE data frozen from the substrate's
 * builtin provider rules — it is not a live provider registry, nothing
 * here claims an account is connected, and the display name IS the model
 * id (the substrate's own rule: modelSelectionGroups renders the raw
 * modelId as the name).
 */

/** One GLM model's frozen facts (the substrate builtin provider rules). */
export interface MosAgentModelRecord {
  /** The canonical model id (display name IS the id — the substrate rule). */
  readonly id: string;
  /** Supports image input natively (the Vision badge basis). */
  readonly vision: boolean;
  /**
   * The reasoning-level option spec values, or null when the model carries
   * no thought-level control ('disabled/enabled' models still cycle).
   */
  readonly reasoning: readonly string[] | null;
  /** The context window in tokens (the context badge source). */
  readonly contextTokens: number;
  /** The max output tokens (metadata shown in the settings rows). */
  readonly maxOutputTokens: number;
  /** The account plans the model is enabled on for builtin providers. */
  readonly plans: readonly MosModelPlanId[];
}

/** The account plan accesses a model can belong to. */
export type MosModelPlanId = 'individual' | 'team' | 'start' | 'off-peak';

/**
 * The connection mode of the model picker (the substrate's account
 * connection-mode select: Individual Plan / Start Plan / Team Plan / API).
 */
export type MosModelConnectionModeId = 'individual' | 'start' | 'team' | 'api';

/** One connection mode descriptor (label + badge + the mode's roster). */
export interface MosModelConnectionModeDescriptor {
  readonly id: MosModelConnectionModeId;
  /** The select's visible label (verbatim from the substrate i18n). */
  readonly label: string;
  /** The select's badge label ('Free' for Start Plan, 'Team' for Team Plan). */
  readonly badge: string | null;
  /** The models enabled on this mode, catalog order. */
  readonly modelIds: readonly string[];
}

/** One provider family card (the substrate's preset providers). */
export interface MosModelProviderFamily {
  readonly id: 'zai' | 'bigmodel';
  readonly display: string;
  readonly host: string;
  readonly line: string;
}

/* --------------------------------------------------------------------
 * The frozen roster (canonical order — the official GLM model id list)
 * -------------------------------------------------------------------- */

export const MOS_AGENT_MODEL_CATALOG: readonly MosAgentModelRecord[] = [
  {
    id: 'GLM-5.3',
    // supportsImage TRUE per the frozen modelRules — the image input is
    // server-side BRIDGED; the plan-access badge hiding lives in
    // mosModelVisionBadgeVisible (the substrate's modelVisionBadge rule).
    vision: true,
    reasoning: ['low', 'high', 'max'],
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    plans: ['individual', 'team', 'off-peak'],
  },
  {
    id: 'GLM-5.3-Flash',
    vision: true,
    reasoning: ['low', 'high', 'max'],
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    plans: ['start', 'individual', 'team', 'off-peak'],
  },
  {
    id: 'GLM-5V-Turbo',
    vision: true,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 200_000,
    maxOutputTokens: 131_072,
    plans: [],
  },
  {
    id: 'GLM-5.2',
    vision: false,
    reasoning: ['disabled', 'high', 'max'],
    contextTokens: 1_000_000,
    maxOutputTokens: 128_000,
    plans: ['start', 'individual', 'team'],
  },
  {
    id: 'GLM-5.1',
    vision: false,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 200_000,
    maxOutputTokens: 64_000,
    plans: [],
  },
  {
    id: 'GLM-5.1-Highspeed',
    vision: false,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 200_000,
    maxOutputTokens: 64_000,
    plans: [],
  },
  {
    id: 'GLM-5',
    vision: false,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 200_000,
    maxOutputTokens: 64_000,
    plans: [],
  },
  {
    id: 'GLM-5-Turbo',
    vision: false,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 200_000,
    maxOutputTokens: 64_000,
    plans: ['start', 'individual', 'team'],
  },
  {
    id: 'GLM-4.7',
    vision: false,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 200_000,
    maxOutputTokens: 131_072,
    plans: [],
  },
  {
    id: 'GLM-4.7-FlashX',
    vision: false,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 200_000,
    maxOutputTokens: 131_072,
    plans: [],
  },
  {
    id: 'GLM-4.7-Flash',
    vision: false,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 200_000,
    maxOutputTokens: 131_072,
    plans: [],
  },
  {
    id: 'GLM-4.6',
    vision: false,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 200_000,
    maxOutputTokens: 131_072,
    plans: [],
  },
  {
    id: 'GLM-4.5-Air',
    vision: false,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 131_072,
    maxOutputTokens: 98_304,
    plans: [],
  },
  {
    id: 'GLM-4.5',
    vision: false,
    reasoning: ['disabled', 'enabled'],
    contextTokens: 131_072,
    maxOutputTokens: 98_304,
    plans: [],
  },
  {
    id: 'GLM-4.6V',
    vision: true,
    reasoning: null,
    contextTokens: 131_072,
    maxOutputTokens: 32_768,
    plans: [],
  },
  {
    id: 'GLM-4.6V-Flash',
    vision: true,
    reasoning: null,
    contextTokens: 131_072,
    maxOutputTokens: 32_768,
    plans: [],
  },
  {
    id: 'GLM-4.6V-FlashX',
    vision: true,
    reasoning: null,
    contextTokens: 131_072,
    maxOutputTokens: 32_768,
    plans: [],
  },
  {
    id: 'GLM-4.1V-Thinking-FlashX',
    vision: true,
    reasoning: null,
    contextTokens: 65_536,
    maxOutputTokens: 32_768,
    plans: [],
  },
  {
    id: 'GLM-4.1V-Thinking-Flash',
    vision: true,
    reasoning: null,
    contextTokens: 65_536,
    maxOutputTokens: 32_768,
    plans: [],
  },
  {
    id: 'GLM-4-FlashX-250414',
    vision: false,
    reasoning: null,
    contextTokens: 131_072,
    maxOutputTokens: 16_384,
    plans: [],
  },
  {
    id: 'GLM-4-Flash-250414',
    vision: false,
    reasoning: null,
    contextTokens: 131_072,
    maxOutputTokens: 16_384,
    plans: [],
  },
  {
    id: 'GLM-4V-Flash',
    vision: true,
    reasoning: null,
    contextTokens: 16_384,
    maxOutputTokens: 1_024,
    plans: [],
  },
];

/** The connection modes, pinned order (the substrate select order). */
export const MOS_MODEL_CONNECTION_MODES: readonly MosModelConnectionModeDescriptor[] = [
  {
    id: 'individual',
    label: 'Individual Plan',
    badge: null,
    modelIds: ['GLM-5.3', 'GLM-5.3-Flash', 'GLM-5.2', 'GLM-5-Turbo'],
  },
  {
    id: 'start',
    label: 'Start Plan',
    badge: 'Free',
    modelIds: ['GLM-5.3-Flash', 'GLM-5.2', 'GLM-5-Turbo'],
  },
  {
    id: 'team',
    label: 'Team Plan',
    badge: 'Team',
    modelIds: ['GLM-5.3', 'GLM-5.3-Flash', 'GLM-5.2', 'GLM-5-Turbo'],
  },
  {
    id: 'api',
    label: 'API',
    badge: null,
    modelIds: MOS_AGENT_MODEL_CATALOG.map((model) => model.id),
  },
];

/** The preset provider families (the substrate's provider cards). */
export const MOS_MODEL_PROVIDER_FAMILIES: readonly MosModelProviderFamily[] = [
  {
    id: 'zai',
    display: 'Z.ai',
    host: 'api.z.ai',
    line: 'The GLM family through api.z.ai — the coding-plan, start-plan and API accesses.',
  },
  {
    id: 'bigmodel',
    display: 'BigModel',
    host: 'open.bigmodel.cn',
    line: 'The GLM family through open.bigmodel.cn — the same roster on the BigModel endpoint.',
  },
];

/* --------------------------------------------------------------------
 * Pure helpers
 * -------------------------------------------------------------------- */

/** Resolve a model record by id (undefined when the id names no model). */
export function mosAgentModel(modelId: string): MosAgentModelRecord | undefined {
  return MOS_AGENT_MODEL_CATALOG.find((model) => model.id === modelId);
}

/** Resolve a connection mode descriptor by id (undefined when unknown). */
export function mosModelConnectionMode(
  id: string,
): MosModelConnectionModeDescriptor | undefined {
  return MOS_MODEL_CONNECTION_MODES.find((mode) => mode.id === id);
}

/**
 * The context-window badge label, formatted EXACTLY as the substrate's
 * formatContextWindow: raw below 1,000; round-to-K below 1M ('131K' for
 * 131,072); integer millions as '1M', fractional as one decimal ('1.5M').
 */
export function mosModelContextBadge(contextTokens: number): string {
  if (contextTokens < 1_000) {
    return String(contextTokens);
  }
  if (contextTokens < 1_000_000) {
    return `${Math.round(contextTokens / 1_000)}K`;
  }
  const millions = contextTokens / 1_000_000;
  return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
}

/**
 * The Vision badge visibility rule, verbatim from the substrate's
 * modelVisionBadge: GLM-5.3's image input is server-side BRIDGED on the
 * coding/start plan accesses, so the badge hides there; every other
 * model shows the badge when it supports image input.
 */
export function mosModelVisionBadgeVisible(
  modelId: string,
  connectionMode: MosModelConnectionModeId,
): boolean {
  const model = mosAgentModel(modelId);
  if (model === undefined || !model.vision) {
    return false;
  }
  if (modelId === 'GLM-5.3') {
    return connectionMode === 'api';
  }
  return true;
}

/** The models a connection mode enables (catalog order; unknown → []). */
export function mosModelsForConnectionMode(
  id: string,
): readonly MosAgentModelRecord[] {
  const mode = mosModelConnectionMode(id);
  if (mode === undefined) {
    return [];
  }
  return mode.modelIds
    .map((modelId) => mosAgentModel(modelId))
    .filter((model): model is MosAgentModelRecord => model !== undefined);
}

/** The reasoning-level display line for a settings row ('low · high · max'). */
export function mosModelReasoningLine(model: MosAgentModelRecord): string {
  if (model.reasoning === null) {
    return '—';
  }
  return model.reasoning.join(' · ');
}
