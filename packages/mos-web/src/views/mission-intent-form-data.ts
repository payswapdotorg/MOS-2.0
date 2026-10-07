import type { TenantScope } from '@mos/contracts';
import type {
  CreateMissionIntentDeclaration,
  CreateMissionIntentTermDeclaration,
  RewardDirectionView,
} from '../ports/mission-catalog.js';

/**
 * Create-mission intent form parsing (UX-001).
 *
 * The intent form is an UNCONTROLLED form (no client state): the browser owns
 * input state, submission carries the fields, and this pure function folds
 * the submitted `FormData` into the port's intent declaration. Presentation
 * discipline:
 * - the form marks the required fields `required` so the browser validates
 *   before submission (native validation is presentation, not authority);
 * - this parser additionally drops blank term rows defensively, because the
 *   shell never assumes the browser actually validated;
 * - the REAL validation (statement shape, reward-term well-formedness,
 *   lifecycle rules) is the Missions authority's job when the intent is
 *   executed there. The shell declares intent; it does not judge it.
 */

/** Form field names of the create-mission intent form. */
export const MISSION_INTENT_FORM_FIELDS = Object.freeze({
  objectiveStatement: 'objective-statement',
  termMetric: 'term-metric',
  termDirection: 'term-direction',
  termWeight: 'term-weight',
  termDefinition: 'term-definition',
});

/** Presentation validation outcome when the folded form cannot be declared. */
export type MissionIntentFormError =
  | { readonly error: 'objective-statement-missing' }
  | { readonly error: 'reward-terms-missing' }
  | { readonly error: 'reward-term-direction-invalid'; readonly row: number }
  | { readonly error: 'reward-term-weight-invalid'; readonly row: number };

function trimmed(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDirection(value: string, row: number): MissionIntentFormError | RewardDirectionView {
  if (value === 'minimize') {
    return 'minimize';
  }
  if (value === 'maximize') {
    return 'maximize';
  }
  return { error: 'reward-term-direction-invalid', row };
}

/**
 * Fold the submitted intent form into a {@link CreateMissionIntentDeclaration}
 * for the scope, or a typed presentation error. Term rows are read in field
 * order (`getAll`), zipped by index and dropped when their metric or
 * definition is blank; weight must parse as a finite number on kept rows.
 */
export function missionIntentDeclarationFromFormData(
  formData: FormData,
  scope: TenantScope,
): CreateMissionIntentDeclaration | MissionIntentFormError {
  const objectiveStatement = trimmed(
    formData.get(MISSION_INTENT_FORM_FIELDS.objectiveStatement),
  );
  if (objectiveStatement.length === 0) {
    return { error: 'objective-statement-missing' };
  }

  const metrics = formData.getAll(MISSION_INTENT_FORM_FIELDS.termMetric);
  const directions = formData.getAll(MISSION_INTENT_FORM_FIELDS.termDirection);
  const weights = formData.getAll(MISSION_INTENT_FORM_FIELDS.termWeight);
  const definitions = formData.getAll(MISSION_INTENT_FORM_FIELDS.termDefinition);

  const terms: CreateMissionIntentTermDeclaration[] = [];
  for (let index = 0; index < metrics.length; index += 1) {
    const metric = trimmed(metrics[index] ?? null);
    const definition = trimmed(definitions[index] ?? null);
    if (metric.length === 0 || definition.length === 0) {
      continue;
    }
    const direction = parseDirection(trimmed(directions[index] ?? null), index);
    if (typeof direction !== 'string') {
      return direction;
    }
    const weight = Number(trimmed(weights[index] ?? null));
    if (!Number.isFinite(weight)) {
      return { error: 'reward-term-weight-invalid', row: index };
    }
    terms.push({ metric, direction, weight, definition });
  }

  if (terms.length === 0) {
    return { error: 'reward-terms-missing' };
  }

  return { scope, objectiveStatement, rewardTerms: terms };
}
