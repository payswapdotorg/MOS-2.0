import type { TenantScope } from '@mos/contracts';
import type { CreateMissionIntentDeclaration } from '../ports/mission-catalog.js';
import {
  MISSION_INTENT_FORM_FIELDS,
  missionIntentDeclarationFromFormData,
} from './mission-intent-form-data.js';
import type { MissionIntentFormError } from './mission-intent-form-data.js';

/**
 * Social setup-details form parsing (the UXR social wave) — INTENT
 * DECLARATION ONLY, on the EXACT create-mission declaration shape.
 *
 * The four target-design fields fold into ONE create-mission intent: the
 * success goal becomes the objective statement (with the business/product,
 * audience & region and horizon/budget folded into the same statement, per
 * the target's "The agent carries this into every step"), and the selected
 * reward metric (served by the Missions authority's own vocabulary through
 * the existing port) becomes the single declared reward term. The folded
 * declaration is parsed by the EXISTING mission-intent parser —
 * {@link missionIntentDeclarationFromFormData} — so the Missions
 * authority's declaration discipline (statement shape, term
 * well-formedness, weight finite) applies verbatim; this module adds only
 * the presentation-level required-field checks and never invents a metric.
 */

/** Form field names of the social setup-details form. */
export const SOCIAL_SETUP_FORM_FIELDS = Object.freeze({
  business: 'business-product',
  goal: 'success-goal',
  metric: 'success-metric',
  direction: 'success-direction',
  audience: 'target-audience-region',
  horizon: 'time-horizon-budget',
});

/** Presentation validation outcome when the folded form cannot be declared. */
export type SocialSetupFormError =
  | { readonly error: 'business-product-missing' }
  | { readonly error: 'success-goal-missing' }
  | { readonly error: 'success-metric-missing' }
  | { readonly error: 'audience-region-missing' }
  | MissionIntentFormError;

function trimmed(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Fold the four setup fields into the objective statement the mission
 * carries. The success goal LEADS (it is the objective); the other fields
 * follow as the statement's context, in the target's own vocabulary.
 */
export function socialSetupObjectiveStatement(inputs: {
  readonly goal: string;
  readonly business: string;
  readonly audience: string;
  readonly horizon: string;
}): string {
  const segments = [
    inputs.goal,
    `Business/product: ${inputs.business}`,
    `Target audience & region: ${inputs.audience}`,
  ];
  if (inputs.horizon.length > 0) {
    segments.push(`Time horizon/budget: ${inputs.horizon}`);
  }
  return `${segments.join(' · ')}.`;
}

/**
 * Fold the submitted setup form into a {@link CreateMissionIntentDeclaration}
 * for the scope (platform display name included as the declaration's
 * context), or a typed presentation error. The mission declaration itself
 * is built by REUSING the existing mission-intent parser over a
 * constructed FormData — one term (the selected metric, direction
 * `maximize` by default, weight 1 — the single-term objective, disclosed
 * on the form), the folded objective statement, and the term definition
 * carrying the same context.
 */
export function socialSetupMissionDeclarationFromFormData(
  formData: FormData,
  scope: TenantScope,
  platformDisplayName: string,
): CreateMissionIntentDeclaration | SocialSetupFormError {
  const business = trimmed(formData.get(SOCIAL_SETUP_FORM_FIELDS.business));
  if (business.length === 0) {
    return { error: 'business-product-missing' };
  }
  const goal = trimmed(formData.get(SOCIAL_SETUP_FORM_FIELDS.goal));
  if (goal.length === 0) {
    return { error: 'success-goal-missing' };
  }
  const metric = trimmed(formData.get(SOCIAL_SETUP_FORM_FIELDS.metric));
  if (metric.length === 0) {
    return { error: 'success-metric-missing' };
  }
  const audience = trimmed(formData.get(SOCIAL_SETUP_FORM_FIELDS.audience));
  if (audience.length === 0) {
    return { error: 'audience-region-missing' };
  }
  const horizon = trimmed(formData.get(SOCIAL_SETUP_FORM_FIELDS.horizon));
  const direction = trimmed(formData.get(SOCIAL_SETUP_FORM_FIELDS.direction)) === 'minimize'
    ? 'minimize'
    : 'maximize';

  const objectiveStatement = socialSetupObjectiveStatement({ goal, business, audience, horizon });
  const termDefinition = `${platformDisplayName} social setup — success goal: ${goal} (business/product: ${business}; target audience & region: ${audience}${
    horizon.length > 0 ? `; time horizon/budget: ${horizon}` : ''
  }).`;

  // REUSED PARSER (the Missions surface's own): the constructed FormData
  // carries exactly the fields it reads — the folded objective statement
  // and one well-formed reward term.
  const missionFormData = new FormData();
  missionFormData.append(MISSION_INTENT_FORM_FIELDS.objectiveStatement, objectiveStatement);
  missionFormData.append(MISSION_INTENT_FORM_FIELDS.termMetric, metric);
  missionFormData.append(MISSION_INTENT_FORM_FIELDS.termDirection, direction);
  missionFormData.append(MISSION_INTENT_FORM_FIELDS.termWeight, '1');
  missionFormData.append(MISSION_INTENT_FORM_FIELDS.termDefinition, termDefinition);
  return missionIntentDeclarationFromFormData(missionFormData, scope);
}
