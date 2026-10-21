import type { TenantScope } from '@mos/contracts';
import type {
  LabIntentActionId,
  LabIntentAuthorityId,
  LabIntentFailure,
  LabIntentLedgerRecord,
  LabIntentReceipt,
  LabIntentResult,
} from '@mos/web';
import type { IntentIdentity } from './production-lab-intents-parse.js';

/**
 * Ledger core for the PRODUCTION lab-intents binding (UX-003 wave 3) —
 * the intent identity allocation, the sequential-id ledger and the
 * receipt/failure builders shared by every declare method group
 * (production-lab-intents-workspace.ts / production-lab-intents-runs.ts,
 * assembled by production-lab-intents.ts).
 *
 * DISCIPLINE (spec §31 + the port's ledger contract): EVERY declaration —
 * executed, authority-rejected, or shell-side parse-failed — is recorded
 * with its verdict under the composition's scope; reads are tenant-scoped
 * so another tenant's intent id resolves to `null` (no existence leak).
 * Intent ids are sequential and composition-local (`lab-intent-0001`…),
 * mirroring the testing double's ledger exactly.
 */

/** The lab authority each action routes to (receipt provenance). */
export const AUTHORITY_BY_ACTION: Readonly<
  Record<LabIntentActionId, LabIntentAuthorityId>
> = {
  'ingest-reference-document': 'lab-corpus-authority',
  'snapshot-corpus-version': 'lab-corpus-authority',
  'register-world-model': 'lab-simulator-authority',
  'simulate-step': 'lab-simulator-authority',
  'search-organizations': 'lab-organization-search-authority',
  'learn-strategy': 'lab-strategy-learning-authority',
  'run-benchmark': 'lab-benchmark-authority',
  'record-calibration-error': 'lab-calibration-authority',
};

interface RecordedIntent {
  readonly intentId: string;
  readonly scope: TenantScope;
  readonly declaredAt: string;
  readonly result: LabIntentResult;
}

/** A runtime `{error, message}` verdict shape (the MOS domain convention). */
export interface RuntimeVerdict {
  readonly error: string;
  readonly message: string;
}

/** The ledger operations the declare-method groups share. */
export interface IntentLedger {
  /** Allocate one declaration's identity (sequential id + routing). */
  nextIdentity(action: LabIntentActionId): IntentIdentity;
  /** Ledger-record one declaration's verdict and return it. */
  record(identity: IntentIdentity, result: LabIntentResult): LabIntentResult;
  /** Tenant-scoped ledger read (cross-tenant ids resolve to `null`). */
  load(intentId: string, scope: TenantScope): LabIntentLedgerRecord | null;
}

/** Build the composition-local intent ledger. */
export function createIntentLedger(options: {
  readonly scope: TenantScope;
  readonly now: () => string;
}): IntentLedger {
  const scope = options.scope;
  const now = options.now;
  const ledger = new Map<string, RecordedIntent>();
  let sequence = 0;

  return {
    nextIdentity(action: LabIntentActionId): IntentIdentity {
      sequence += 1;
      const intentId = `lab-intent-${String(sequence).padStart(4, '0')}`;
      return { intentId, action, declaredAt: now(), routedTo: AUTHORITY_BY_ACTION[action] };
    },
    record(identity: IntentIdentity, result: LabIntentResult): LabIntentResult {
      ledger.set(identity.intentId, {
        intentId: identity.intentId,
        scope,
        declaredAt: identity.declaredAt,
        result,
      });
      return result;
    },
    load(intentId: string, scope: TenantScope): LabIntentLedgerRecord | null {
      const recorded = ledger.get(intentId);
      if (recorded === undefined || recorded.scope.tenantId !== scope.tenantId) {
        // Cross-tenant ids resolve to null — never a leak (spec §31).
        return null;
      }
      return {
        intentId: recorded.intentId,
        action: recorded.result.action,
        declaredAt: recorded.declaredAt,
        routedTo: recorded.result.routedTo,
        outcome: recorded.result,
      };
    },
  };
}

/** An executed intent's receipt (the authority echo — never fabricated). */
export function receiptOf(
  identity: IntentIdentity,
  recordId: string,
  recordVersion: number,
  summary: string,
): LabIntentReceipt {
  return {
    intentId: identity.intentId,
    action: identity.action,
    declaredAt: identity.declaredAt,
    routedTo: identity.routedTo,
    authorityEcho: { recordId, recordVersion, summary },
  };
}

/** An authority rejection, relayed VERBATIM (code + message). */
export function failureOf(identity: IntentIdentity, verdict: RuntimeVerdict): LabIntentFailure {
  return {
    intentId: identity.intentId,
    action: identity.action,
    declaredAt: identity.declaredAt,
    routedTo: identity.routedTo,
    error: verdict.error,
    message: verdict.message,
  };
}
