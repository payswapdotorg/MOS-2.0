/** PROD-003 — append-only budget ledger (AGT-003 budget policy enforcement). */
import type { BudgetLedger } from './types.js';

export function openLedger(currency: string, ceiling: number): BudgetLedger {
  return { currency, ceiling, spent: 0, entries: [] };
}

export function wouldExceed(ledger: BudgetLedger, amount: number): boolean {
  return ledger.spent + amount > ledger.ceiling;
}

/**
 * Records real spend. The spend is ALWAYS recorded (reality is never erased);
 * `exceeded` lets the engine halt as a typed state instead of truncating silently.
 * Cost accounting uses plan-declared per-action costs (disclosed basis).
 */
export function recordSpend(ledger: BudgetLedger, amount: number, note: string, at: string, phaseId: string): { readonly ledger: BudgetLedger; readonly exceeded: boolean } {
  const entries = [...ledger.entries, { amount, note, at, phaseId }];
  const spent = ledger.spent + amount;
  return { ledger: { currency: ledger.currency, ceiling: ledger.ceiling, spent, entries }, exceeded: spent > ledger.ceiling };
}
