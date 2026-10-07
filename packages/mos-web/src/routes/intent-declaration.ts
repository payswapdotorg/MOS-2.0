import type { MosWebComposition } from '../ports/composition.js';
import type {
  CreateMissionIntentDeclaration,
  CreateMissionIntentReceipt,
} from '../ports/mission-catalog.js';

/**
 * Create-mission INTENT declaration flow (UX-001).
 *
 * The Missions surface declares the intent to create a mission and NOTHING
 * more: this module hands the declaration to the owning domain through the
 * `MissionCatalogPort` and maps the outcome to the app-internal location the
 * shell navigates to afterwards. It contains no mission business logic —
 * validation, lifecycle and reward-spec rules all live in the Missions
 * authority (`@mos/missions`, CORE-005) which executes the intent when the
 * composition routes it there.
 */

/** Where the shell navigates after a declared intent (full page load). */
export type DeclareMissionIntentOutcome =
  | { readonly kind: 'receipt'; readonly receipt: CreateMissionIntentReceipt }
  | { readonly kind: 'failure'; readonly code: string; readonly message: string };

/**
 * Declare the intent through the port. Never throws: a failed declaration
 * becomes the explicit `failure` outcome the Missions surface presents.
 */
export async function declareMissionIntentThroughPort(
  composition: MosWebComposition,
  declaration: CreateMissionIntentDeclaration,
): Promise<DeclareMissionIntentOutcome> {
  const result = await composition.missionCatalog.declareCreateMissionIntent(declaration);
  if ('error' in result) {
    return { kind: 'failure', code: result.error, message: result.message };
  }
  return { kind: 'receipt', receipt: result };
}

/**
 * The app-internal location for an intent outcome: the receipt view
 * (`/missions?intent=<id>`) on success, the declared-failure marker
 * (`/missions?intent-error=<code>`) on failure. Query values are
 * `encodeURIComponent`-encoded; the code is shell-controlled vocabulary so
 * the encoding is defensive only.
 */
export function missionIntentOutcomeHref(outcome: DeclareMissionIntentOutcome): string {
  if (outcome.kind === 'receipt') {
    return `/missions?intent=${encodeURIComponent(outcome.receipt.intentId)}`;
  }
  return `/missions?intent-error=${encodeURIComponent(outcome.code)}`;
}
