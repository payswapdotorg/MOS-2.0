import type { MosWebComposition } from '../ports/composition.js';
import type {
  LabIntentActionId,
  LabIntentDeclaration,
  LabIntentLedgerRecord,
} from '../ports/lab-intents.js';
import type { LabSectionId } from './route.js';

/**
 * Lab write-intent declaration flow (UX-003 wave 3).
 *
 * Mirrors the create-mission intent pattern (intent-declaration.ts): the
 * Lab surface declares the intent and NOTHING more — this module hands the
 * declaration to the lab-intents port and maps the outcome to the
 * app-internal location the shell navigates to afterwards. The difference
 * from the mission flow is what the receipt MEANS: the composition routes
 * lab intents to the lab authority runtimes in-process, so the ledger
 * record (executed receipt OR the authority's named rejection, verbatim)
 * is what the outcome panel presents after the navigation, and the read
 * models the next full load presents carry whatever the authority
 * actually recorded. No lab business logic lives here — validation,
 * rights gates, versioning and error vocabularies are the authority's.
 */

/** The section that OWNS each intent action's outcome surface. */
export const LAB_INTENT_SECTION_BY_ACTION: Readonly<
  Record<LabIntentActionId, LabSectionId>
> = {
  'ingest-reference-document': 'corpus',
  'snapshot-corpus-version': 'corpus',
  'register-world-model': 'simulator',
  'simulate-step': 'simulator',
  'search-organizations': 'strategy',
  'learn-strategy': 'strategy',
  'run-benchmark': 'benchmarks',
  'record-calibration-error': 'calibration',
};

/**
 * The ledger record the navigation outcome carries (the composition's own
 * record — including authority-rejected and parse-failed declarations).
 */
export type DeclareLabIntentOutcome = { readonly record: LabIntentLedgerRecord };

/**
 * Declare the intent through the port. Never throws: the port ledger-records
 * EVERY declaration with its verdict — executed receipts, the authority's
 * named rejections (verbatim code + message), and shell-side JSON parse
 * failures alike. The Lab surface presents the record; nothing is retried,
 * nothing is paraphrased into success.
 */
export async function declareLabIntentThroughPort(
  composition: MosWebComposition,
  declaration: LabIntentDeclaration,
): Promise<DeclareLabIntentOutcome> {
  const port = composition.labIntents;
  let result;
  switch (declaration.action) {
    case 'ingest-reference-document':
      result = await port.declareIngestReferenceDocument(declaration);
      break;
    case 'snapshot-corpus-version':
      result = await port.declareSnapshotCorpusVersion(declaration);
      break;
    case 'register-world-model':
      result = await port.declareRegisterWorldModel(declaration);
      break;
    case 'simulate-step':
      result = await port.declareSimulateStep(declaration);
      break;
    case 'search-organizations':
      result = await port.declareSearchOrganizations(declaration);
      break;
    case 'learn-strategy':
      result = await port.declareLearnStrategy(declaration);
      break;
    case 'run-benchmark':
      result = await port.declareRunBenchmark(declaration);
      break;
    case 'record-calibration-error':
      result = await port.declareRecordCalibrationError(declaration);
      break;
  }
  if (result === undefined) {
    // Unreachable: the switch above is exhaustive over the action union.
    throw new Error(`lab intent action not routed: ${String(declaration)}`);
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
 * The app-internal location for an intent outcome: the OWNING section with
 * the ledger marker (`/lab?section=<id>&receipt=<intentId>`). The intent id
 * is shell-controlled vocabulary; encoding is defensive. One route per
 * load — the outcome panel reads the ledger record after the navigation.
 */
export function labIntentOutcomeHref(outcome: DeclareLabIntentOutcome): string {
  const section = LAB_INTENT_SECTION_BY_ACTION[outcome.record.action];
  return `/lab?section=${section}&receipt=${encodeURIComponent(outcome.record.intentId)}`;
}
