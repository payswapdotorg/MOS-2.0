import type { AuthorityVerdict } from './reconcile-tables.js';
import { reconcile, isActionable } from './reconcile-tables.js';

/**
 * Late binding: rights that arrive after a strategy is compiled are folded
 * into the plan at dispatch time rather than requiring recompilation. A late
 * binding never upgrades a verdict — it can only narrow or confirm.
 */

export interface BindingRequest {
  runId: string;
  actionId: string;
  platformId: string;
  externalVerdicts: { system: 'rights-registry' | 'platform-policy' | 'consent-ledger'; code: string }[];
}

export interface BindingDecision {
  runId: string;
  actionId: string;
  platformId: string;
  verdict: AuthorityVerdict;
  actionable: boolean;
  notes: string[];
}

export function bindLate(request: BindingRequest): BindingDecision {
  const notes: string[] = [];
  let verdict: AuthorityVerdict = 'granted';
  for (const external of request.externalVerdicts) {
    const mapped = reconcile(external);
    if (mapped === 'denied') verdict = 'denied';
    else if (mapped === 'indeterminate' && verdict !== 'denied') verdict = 'indeterminate';
    else if (mapped === 'granted-with-scope' && verdict === 'granted') verdict = 'granted-with-scope';
    notes.push(`${external.system}:${external.code} -> ${mapped}`);
  }
  return {
    runId: request.runId,
    actionId: request.actionId,
    platformId: request.platformId,
    verdict,
    actionable: isActionable(verdict),
    notes,
  };
}
