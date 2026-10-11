import type { BindingDecision } from './late-binding.js';
import { bindLate } from './late-binding.js';
import type { BindingRequest } from './late-binding.js';

export interface DispatchGateInput {
  bindings: BindingRequest[];
  pendingActionIds: string[];
}

export interface DispatchGateOutput {
  allowed: string[];
  deferred: string[];
  blocked: string[];
  decisions: BindingDecision[];
}

/**
 * Gate at dispatch time: only actions whose late-bound verdicts are actionable
 * may dispatch. Indeterminate verdicts defer (retriable); denials block
 * permanently for the run. Unknown pending actions are treated as blocked —
 * the gate never silently passes an action it cannot vouch for.
 */
export function gateDispatches(input: DispatchGateInput): DispatchGateOutput {
  const decisions = input.bindings.map(bindLate);
  const byAction = new Map(decisions.map((d) => [d.actionId, d]));
  const allowed: string[] = [];
  const deferred: string[] = [];
  const blocked: string[] = [];
  for (const actionId of input.pendingActionIds) {
    const decision = byAction.get(actionId);
    if (!decision) {
      blocked.push(actionId);
      continue;
    }
    if (decision.verdict === 'denied') blocked.push(actionId);
    else if (decision.actionable) allowed.push(actionId);
    else deferred.push(actionId);
  }
  return { allowed, deferred, blocked, decisions };
}
