/**
 * The MOS agent TYPED-INTENT ROUTER (the payswap intentRouter pattern):
 * every agent entry point converges on the typed action set —
 * PROMOTE / PUBLISH / GROW / MEASURE — plus the connect intents and the
 * section navigations; anything else gets the honest UNKNOWN reply,
 * never a guessed capability. Pure functions: the router is directly
 * testable and carries no state.
 */

import type { MosActionId, MosConsoleSectionId } from './console-nav.js';
import { MOS_PROVIDER_CATALOGUE } from './workspace-store.js';

/** The honest UNKNOWN reply (verbatim — the agent never guesses). */
export const MOS_AGENT_UNKNOWN_REPLY =
  "I record requests and progress only — I don't guess capabilities. Name an outcome (promote, publish, grow, measure) or a connection (connect YouTube), and I'll take the honest next step.";

/** One routed agent reply (the typed outcome of a free-text turn). */
export type MosAgentReply =
  | { readonly kind: 'action'; readonly action: MosActionId; readonly reply: string }
  | { readonly kind: 'connect'; readonly providerId: string; readonly reply: string }
  | { readonly kind: 'navigate'; readonly section: MosConsoleSectionId; readonly reply: string }
  | { readonly kind: 'unknown'; readonly reply: string };

/** The action stems (deterministic routing — the first match wins). */
const ACTION_STEMS: readonly { readonly action: MosActionId; readonly stems: readonly string[] }[] = [
  { action: 'promote', stems: ['promote', 'ads', 'advert', 'spend', 'budget', 'campaign', 'paid'] },
  { action: 'publish', stems: ['publish', 'post', 'upload', 'content', 'composer', 'draft'] },
  { action: 'grow', stems: ['grow', 'audience', 'follower', 'subscribe', 'virality', 'viral', 'reach'] },
  { action: 'measure', stems: ['measure', 'result', 'evidence', 'metric', 'analytic', 'report', 'perform'] },
];

/** The navigation stems (secondary to the action stems). */
const NAVIGATION_STEMS: readonly { readonly section: MosConsoleSectionId; readonly stems: readonly string[] }[] = [
  { section: 'overview', stems: ['home', 'overview'] },
  { section: 'missions', stems: ['mission', 'objective', 'goal'] },
  { section: 'social', stems: ['social', 'calendar', 'queue'] },
  { section: 'ads', stems: [] },
  { section: 'connections', stems: ['connection', 'provider', 'channel'] },
  { section: 'activity', stems: ['activity', 'approval', 'timeline', 'gate'] },
  { section: 'lab', stems: ['lab', 'simulat'] },
  { section: 'console', stems: ['agent console', 'workbench', 'workflow'] },
  { section: 'studio', stems: ['studio', 'production'] },
  { section: 'distribution', stems: ['distribution', 'delivery', 'adapter'] },
  { section: 'experiments', stems: ['experiment', 'strateg'] },
  { section: 'measurement', stems: ['measurement', 'calibration'] },
  { section: 'settings', stems: ['setting', 'theme'] },
];

/**
 * Route a free-text agent turn to its typed reply. Connect intents are
 * matched FIRST (a provider name in a connect phrase outranks the action
 * stems), then the action stems, then the navigation stems; anything
 * else is the honest UNKNOWN.
 */
export function routeMosAgentText(text: string): MosAgentReply {
  const lowered = text.trim().toLowerCase();

  // Connect intents: "connect <provider>" (or a provider name with a
  // connect-flavoured stem).
  for (const provider of MOS_PROVIDER_CATALOGUE) {
    const name = provider.name.toLowerCase();
    const nameStem = name.split(' ')[0] ?? name;
    const mentionsProvider = lowered.includes(nameStem);
    const wantsConnect = lowered.includes('connect') || lowered.includes('link') || lowered.includes('setup') || lowered.includes('set up');
    if (mentionsProvider && wantsConnect) {
      return {
        kind: 'connect',
        providerId: provider.id,
        reply: `Setup request recorded for ${provider.name} — SETUP_REQUIRED, honestly. The secure lane lives in Connections; the live handshake awaits the transport.`,
      };
    }
  }

  // Action stems (the convergence law: the four outcomes).
  for (const entry of ACTION_STEMS) {
    if (entry.stems.some((stem) => lowered.includes(stem))) {
      return {
        kind: 'action',
        action: entry.action,
        reply: `Taking the ${entry.action.toUpperCase()} route — the mission declaration is prefilled with this direction. Recording the intent is what I do; the authorities compute the rest.`,
      };
    }
  }

  // Navigation stems (weaker matches — after the actions).
  for (const entry of NAVIGATION_STEMS) {
    if (entry.stems.length > 0 && entry.stems.some((stem) => lowered.includes(stem))) {
      return {
        kind: 'navigate',
        section: entry.section,
        reply: `Opening ${entry.section} — the honest surface for that.`,
      };
    }
  }

  if (lowered.length === 0) {
    return { kind: 'unknown', reply: MOS_AGENT_UNKNOWN_REPLY };
  }
  return { kind: 'unknown', reply: MOS_AGENT_UNKNOWN_REPLY };
}
