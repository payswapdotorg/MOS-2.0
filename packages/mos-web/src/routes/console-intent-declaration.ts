import type { MosWebComposition } from '../ports/composition.js';
import type {
  ConsoleIntentActionId,
  ConsoleIntentDeclaration,
  ConsoleIntentLedgerRecord,
} from '../ports/console-intents.js';
import type { ConsoleModeId } from './route.js';

/**
 * Agent Console write-intent declaration flow (the CONSOLE wave).
 *
 * Mirrors the lab write-intent pattern (lab-intent-declaration.ts): the
 * Console surface declares the intent and NOTHING more — this module hands
 * the declaration to the console-intents port and maps the outcome to the
 * app-internal location the shell soft-navigates to afterwards. The
 * composition routes console intents to the OWNING authority runtimes
 * in-process, so the ledger record (executed receipt OR the authority's
 * named rejection, verbatim) is what the outcome panel presents after the
 * soft refresh, and the read models the refresh presents carry whatever
 * the authority actually recorded. No console business logic lives here —
 * validation, rights gates, versioning and error vocabularies are the
 * authorities'.
 */

/**
 * The working mode that OWNS each intent action's outcome surface — the
 * post-declaration soft navigation lands there with the ledger marker so
 * the operator sees the verdict in the mode they acted from.
 */
export const CONSOLE_INTENT_MODE_BY_ACTION: Readonly<
  Record<ConsoleIntentActionId, ConsoleModeId>
> = {
  'create-experiment': 'research',
  'grant-analysis-rights': 'control',
  'record-intelligence': 'research',
  'compose-plan': 'plan',
  'compile-strategy': 'plan',
  'create-run': 'control',
  'arm-run': 'control',
};

/**
 * The ledger record the navigation outcome carries (the composition's own
 * record — including authority-rejected and parse-failed declarations).
 */
export type DeclareConsoleIntentOutcome = { readonly record: ConsoleIntentLedgerRecord };

/**
 * Declare the intent through the port. Never throws: the port
 * ledger-records EVERY declaration with its verdict — executed receipts,
 * the authority's named rejections (verbatim code + message), and
 * shell-side JSON parse failures alike. The Console presents the record;
 * nothing is retried, nothing is paraphrased into success.
 */
export async function declareConsoleIntentThroughPort(
  composition: MosWebComposition,
  declaration: ConsoleIntentDeclaration,
): Promise<DeclareConsoleIntentOutcome> {
  const port = composition.consoleIntents;
  let result;
  switch (declaration.action) {
    case 'create-experiment':
      result = await port.declareCreateExperiment(declaration);
      break;
    case 'grant-analysis-rights':
      result = await port.declareGrantAnalysisRights(declaration);
      break;
    case 'record-intelligence':
      result = await port.declareRecordIntelligence(declaration);
      break;
    case 'compose-plan':
      result = await port.declareComposePlan(declaration);
      break;
    case 'compile-strategy':
      result = await port.declareCompileStrategy(declaration);
      break;
    case 'create-run':
      result = await port.declareCreateRun(declaration);
      break;
    case 'arm-run':
      result = await port.declareArmRun(declaration);
      break;
  }
  if (result === undefined) {
    // Unreachable: the switch above is exhaustive over the action union.
    throw new Error(`console intent action not routed: ${String(declaration)}`);
  }
  return {
    record: {
      intentId: result.intentId,
      action: result.action,
      declaredAt: result.declaredAt,
      routedTo: result.routedTo,
      outcome: result,
    },
  };
}

/**
 * The app-internal location for an intent outcome: the OWNING mode with
 * the mission context and the ledger marker
 * (`/console?mission=<id>&mode=<mode>&receipt=<intentId>`). The intent id
 * is shell-controlled vocabulary; encoding is defensive. The refresh after
 * a declared intent is SOFT (the wave-21 architecture): the SAME
 * composition's page model re-resolves without a document reload, so the
 * per-load authority records the declaration just wrote survive.
 */
export function consoleIntentOutcomeHref(
  outcome: DeclareConsoleIntentOutcome,
  missionId: string | null,
): string {
  const mode = CONSOLE_INTENT_MODE_BY_ACTION[outcome.record.action];
  const missionPart = missionId === null ? '' : `mission=${encodeURIComponent(missionId)}&`;
  return `/console?${missionPart}mode=${mode}&receipt=${encodeURIComponent(outcome.record.intentId)}`;
}
