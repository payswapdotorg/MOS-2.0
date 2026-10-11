/**
 * Reconciliation tables: map external authority verdicts onto internal
 * authority terms. Every mapping is total: unknown external codes map to
 * the conservative default rather than throwing.
 */

export type AuthorityVerdict =
  | 'granted'
  | 'granted-with-scope'
  | 'denied'
  | 'indeterminate';

export interface ExternalVerdictCode {
  system: 'rights-registry' | 'platform-policy' | 'consent-ledger';
  code: string;
}

const RIGHTS_REGISTRY: Record<string, AuthorityVerdict> = {
  CLEAR: 'granted',
  CONDITIONAL: 'granted-with-scope',
  RESTRICTED: 'denied',
  UNKNOWN_RIGHT: 'indeterminate',
};

const PLATFORM_POLICY: Record<string, AuthorityVerdict> = {
  ALLOW: 'granted',
  ALLOW_WITH_DISCLOSURE: 'granted-with-scope',
  BLOCK: 'denied',
  POLICY_UNRESOLVED: 'indeterminate',
};

const CONSENT_LEDGER: Record<string, AuthorityVerdict> = {
  OPT_IN: 'granted',
  OPT_IN_PARTIAL: 'granted-with-scope',
  OPT_OUT: 'denied',
  CONSENT_EXPIRED: 'indeterminate',
};

const TABLES: Record<ExternalVerdictCode['system'], Record<string, AuthorityVerdict>> = {
  'rights-registry': RIGHTS_REGISTRY,
  'platform-policy': PLATFORM_POLICY,
  'consent-ledger': CONSENT_LEDGER,
};

export const DEFAULT_VERDICT: AuthorityVerdict = 'indeterminate';

export function reconcile(code: ExternalVerdictCode): AuthorityVerdict {
  const table = TABLES[code.system];
  if (!table) return DEFAULT_VERDICT;
  return table[code.code] ?? DEFAULT_VERDICT;
}

export function isActionable(verdict: AuthorityVerdict): boolean {
  return verdict === 'granted' || verdict === 'granted-with-scope';
}
