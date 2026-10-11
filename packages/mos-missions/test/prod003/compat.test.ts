import { describe, it, expect } from 'vitest';
import {
  reconcile,
  isActionable,
  DEFAULT_VERDICT,
} from '../../src/authority-adapters/index.js';
import { bindLate, gateDispatches } from '../../src/authority-adapters/index.js';

describe('authority adapters compatibility', () => {
  it('maps known external codes deterministically', () => {
    expect(reconcile({ system: 'rights-registry', code: 'CLEAR' })).toBe('granted');
    expect(reconcile({ system: 'consent-ledger', code: 'OPT_OUT' })).toBe('denied');
  });

  it('falls back to indeterminate for unknown codes', () => {
    expect(reconcile({ system: 'platform-policy', code: 'NO_SUCH_CODE' })).toBe(DEFAULT_VERDICT);
  });

  it('never upgrades a verdict during late binding', () => {
    const decision = bindLate({
      runId: 'run-0001',
      actionId: 'act-teaser-x',
      platformId: 'platform-x',
      externalVerdicts: [
        { system: 'rights-registry', code: 'CLEAR' },
        { system: 'consent-ledger', code: 'OPT_OUT' },
      ],
    });
    expect(decision.verdict).toBe('denied');
    expect(isActionable(decision.verdict)).toBe(false);
  });

  it('gates dispatches conservatively for unbound actions', () => {
    const gate = gateDispatches({
      pendingActionIds: ['act-teaser-x', 'act-unknown'],
      bindings: [
        {
          runId: 'run-0001',
          actionId: 'act-teaser-x',
          platformId: 'platform-x',
          externalVerdicts: [{ system: 'rights-registry', code: 'CLEAR' }],
        },
      ],
    });
    expect(gate.allowed).toContain('act-teaser-x');
    expect(gate.blocked).toContain('act-unknown');
  });
});
