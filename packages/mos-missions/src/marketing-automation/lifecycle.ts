/** PROD-003 — the automation lifecycle state machine (§26): compiled → armed → running → measured → closed | halted. */
import type { AutomationLifecycleState } from './types.js';
import type { Result } from '../strategy-compiler/types.js';
import { ok, err } from '../strategy-compiler/types.js';
import type { AutomationRejection } from './rejections.js';
import { illegalTransition } from './rejections.js';

export const LEGAL_TRANSITIONS: Readonly<Record<AutomationLifecycleState, readonly AutomationLifecycleState[]>> = {
  compiled: ['armed'],
  armed: ['running', 'halted'],
  running: ['measured', 'halted'],
  measured: ['closed', 'halted'],
  closed: [],
  halted: [],
};

export const TERMINAL_STATES: readonly AutomationLifecycleState[] = ['closed', 'halted'];

export const AUTOMATION_LIFECYCLE_ORDER: readonly AutomationLifecycleState[] = ['compiled', 'armed', 'running', 'measured', 'closed', 'halted'];

export function canTransition(from: AutomationLifecycleState, to: AutomationLifecycleState): boolean {
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: AutomationLifecycleState, to: AutomationLifecycleState): Result<AutomationLifecycleState, AutomationRejection> {
  if (!canTransition(from, to)) return err(illegalTransition(from, to, 'transition is not legal on the automation lifecycle (§26)'));
  return ok(to);
}
