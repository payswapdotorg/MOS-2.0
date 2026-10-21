import type {
  ArmRunDeclaration,
  CompileStrategyDeclaration,
  ComposePlanDeclaration,
  ConsoleIntentDeclaration,
  CreateExperimentDeclaration,
  CreateRunDeclaration,
  GrantAnalysisRightsDeclaration,
  RecordIntelligenceDeclaration,
} from '../ports/console-intents.js';

/**
 * Console intent form field names + FormData parsers (the CONSOLE wave).
 *
 * Uncontrolled-by-design, mirroring the lab intent form: the browser owns
 * input state, `required` attributes carry the minimal presentation
 * validation, and the parsers below fold FormData into the typed
 * declarations the shell hands to the console-intents port. The
 * DECLARED-JSON fields (platform choices, metric expectations, rights
 * scope/terms, intelligence content/source, hypotheses, cited commerce
 * observations) are passed through as text — the composition seam parses
 * them against the real contract shapes and a parse failure comes back as
 * a named ledger verdict, never a client-side guess.
 *
 * The parsers refuse to guess: a missing required scalar produces
 * `console-intent-missing-input` (defense in depth behind native
 * `required`), and numbers parse strictly (finite where the contract
 * requires finite).
 */

/** Shared form-field name constants (stable names for tests + e2e). */
export const CONSOLE_INTENT_FORM_FIELDS = {
  experimentId: 'console-intent-experiment-id',
  questionText: 'console-intent-question',
  successCriterionText: 'console-intent-success-criterion',
  hypothesisJson: 'console-intent-hypothesis-json',
  missionRefsText: 'console-intent-mission-refs',
  grantId: 'console-intent-grant-id',
  rightsHolderId: 'console-intent-rights-holder',
  actionText: 'console-intent-action',
  scopeJson: 'console-intent-scope-json',
  termsJson: 'console-intent-terms-json',
  recordId: 'console-intent-record-id',
  subjectJson: 'console-intent-subject-json',
  contentKindText: 'console-intent-content-kind',
  contentJson: 'console-intent-content-json',
  sourceJson: 'console-intent-source-json',
  basisKindText: 'console-intent-basis-kind',
  citedCommerceObservationsJson: 'console-intent-commerce-observations-json',
  rightsRef: 'console-intent-rights-ref',
  attributionText: 'console-intent-attribution',
  noteText: 'console-intent-note',
  planId: 'console-intent-plan-id',
  missionId: 'console-intent-mission-id',
  objectiveAlignmentText: 'console-intent-objective-alignment',
  platformsJson: 'console-intent-platforms-json',
  metricExpectationsJson: 'console-intent-metric-expectations-json',
  experimentExpectationsJson: 'console-intent-experiment-expectations-json',
  experimentRefsText: 'console-intent-experiment-refs',
  planVersion: 'console-intent-plan-version',
  principalText: 'console-intent-principal',
  strategyId: 'console-intent-strategy-id',
  runId: 'console-intent-run-id',
} as const;

/** A parse refusal: the shell never guesses a declaration. */
export type ConsoleIntentFormParse =
  | { readonly ok: true; readonly declaration: ConsoleIntentDeclaration }
  | { readonly ok: false; readonly code: string; readonly message: string };

// ---------------------------------------------------------------------------
// FormData helpers
// ---------------------------------------------------------------------------

/** Reads one form value as trimmed text ('' when absent). */
function textOf(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Parses a strictly-required scalar (finite number). */
function numberField(form: FormData, name: string): number | null {
  const text = textOf(form, name);
  const parsed = Number(text);
  if (text === '' || !Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function missing(field: string): ConsoleIntentFormParse {
  return {
    ok: false,
    code: 'console-intent-missing-input',
    message: `the form field ${field} is required and was not carried by the submission`,
  };
}

// ---------------------------------------------------------------------------
// Per-action parsers
// ---------------------------------------------------------------------------

/** Parses the create-experiment declaration. */
export function createExperimentDeclarationFromFormData(form: FormData): ConsoleIntentFormParse {
  const experimentId = textOf(form, CONSOLE_INTENT_FORM_FIELDS.experimentId);
  if (experimentId === '') return missing(CONSOLE_INTENT_FORM_FIELDS.experimentId);
  const questionText = textOf(form, CONSOLE_INTENT_FORM_FIELDS.questionText);
  if (questionText === '') return missing(CONSOLE_INTENT_FORM_FIELDS.questionText);
  const successCriterionText = textOf(form, CONSOLE_INTENT_FORM_FIELDS.successCriterionText);
  if (successCriterionText === '') return missing(CONSOLE_INTENT_FORM_FIELDS.successCriterionText);
  const hypothesisJson = textOf(form, CONSOLE_INTENT_FORM_FIELDS.hypothesisJson);
  if (hypothesisJson === '') return missing(CONSOLE_INTENT_FORM_FIELDS.hypothesisJson);
  const declaration: CreateExperimentDeclaration = {
    action: 'create-experiment',
    experimentId,
    questionText,
    successCriterionText,
    hypothesisJson,
    missionRefsText: textOf(form, CONSOLE_INTENT_FORM_FIELDS.missionRefsText),
  };
  return { ok: true, declaration };
}

/** Parses the grant-analysis-rights declaration. */
export function grantAnalysisRightsDeclarationFromFormData(form: FormData): ConsoleIntentFormParse {
  const grantId = textOf(form, CONSOLE_INTENT_FORM_FIELDS.grantId);
  if (grantId === '') return missing(CONSOLE_INTENT_FORM_FIELDS.grantId);
  const rightsHolderId = textOf(form, CONSOLE_INTENT_FORM_FIELDS.rightsHolderId);
  if (rightsHolderId === '') return missing(CONSOLE_INTENT_FORM_FIELDS.rightsHolderId);
  const actionText = textOf(form, CONSOLE_INTENT_FORM_FIELDS.actionText);
  if (actionText === '') return missing(CONSOLE_INTENT_FORM_FIELDS.actionText);
  const scopeJson = textOf(form, CONSOLE_INTENT_FORM_FIELDS.scopeJson);
  if (scopeJson === '') return missing(CONSOLE_INTENT_FORM_FIELDS.scopeJson);
  const termsJson = textOf(form, CONSOLE_INTENT_FORM_FIELDS.termsJson);
  if (termsJson === '') return missing(CONSOLE_INTENT_FORM_FIELDS.termsJson);
  const declaration: GrantAnalysisRightsDeclaration = {
    action: 'grant-analysis-rights',
    grantId,
    rightsHolderId,
    actionText,
    scopeJson,
    termsJson,
  };
  return { ok: true, declaration };
}

/** Parses the record-intelligence declaration. */
export function recordIntelligenceDeclarationFromFormData(form: FormData): ConsoleIntentFormParse {
  const recordId = textOf(form, CONSOLE_INTENT_FORM_FIELDS.recordId);
  if (recordId === '') return missing(CONSOLE_INTENT_FORM_FIELDS.recordId);
  const subjectJson = textOf(form, CONSOLE_INTENT_FORM_FIELDS.subjectJson);
  if (subjectJson === '') return missing(CONSOLE_INTENT_FORM_FIELDS.subjectJson);
  const contentKindText = textOf(form, CONSOLE_INTENT_FORM_FIELDS.contentKindText);
  if (contentKindText === '') return missing(CONSOLE_INTENT_FORM_FIELDS.contentKindText);
  const contentJson = textOf(form, CONSOLE_INTENT_FORM_FIELDS.contentJson);
  if (contentJson === '') return missing(CONSOLE_INTENT_FORM_FIELDS.contentJson);
  const sourceJson = textOf(form, CONSOLE_INTENT_FORM_FIELDS.sourceJson);
  if (sourceJson === '') return missing(CONSOLE_INTENT_FORM_FIELDS.sourceJson);
  const basisKindText = textOf(form, CONSOLE_INTENT_FORM_FIELDS.basisKindText);
  if (basisKindText === '') return missing(CONSOLE_INTENT_FORM_FIELDS.basisKindText);
  const rightsRef = textOf(form, CONSOLE_INTENT_FORM_FIELDS.rightsRef);
  if (rightsRef === '') return missing(CONSOLE_INTENT_FORM_FIELDS.rightsRef);
  const declaration: RecordIntelligenceDeclaration = {
    action: 'record-intelligence',
    recordId,
    subjectJson,
    contentKindText,
    contentJson,
    sourceJson,
    basisKindText,
    citedCommerceObservationsJson: textOf(
      form,
      CONSOLE_INTENT_FORM_FIELDS.citedCommerceObservationsJson,
    ),
    rightsRef,
    attributionText: textOf(form, CONSOLE_INTENT_FORM_FIELDS.attributionText),
    noteText: textOf(form, CONSOLE_INTENT_FORM_FIELDS.noteText),
  };
  return { ok: true, declaration };
}

/** Parses the compose-plan declaration. */
export function composePlanDeclarationFromFormData(form: FormData): ConsoleIntentFormParse {
  const planId = textOf(form, CONSOLE_INTENT_FORM_FIELDS.planId);
  if (planId === '') return missing(CONSOLE_INTENT_FORM_FIELDS.planId);
  const missionId = textOf(form, CONSOLE_INTENT_FORM_FIELDS.missionId);
  if (missionId === '') return missing(CONSOLE_INTENT_FORM_FIELDS.missionId);
  const objectiveAlignmentText = textOf(form, CONSOLE_INTENT_FORM_FIELDS.objectiveAlignmentText);
  if (objectiveAlignmentText === '') return missing(CONSOLE_INTENT_FORM_FIELDS.objectiveAlignmentText);
  const platformsJson = textOf(form, CONSOLE_INTENT_FORM_FIELDS.platformsJson);
  if (platformsJson === '') return missing(CONSOLE_INTENT_FORM_FIELDS.platformsJson);
  const metricExpectationsJson = textOf(form, CONSOLE_INTENT_FORM_FIELDS.metricExpectationsJson);
  if (metricExpectationsJson === '') return missing(CONSOLE_INTENT_FORM_FIELDS.metricExpectationsJson);
  const experimentExpectationsJson = textOf(
    form,
    CONSOLE_INTENT_FORM_FIELDS.experimentExpectationsJson,
  );
  if (experimentExpectationsJson === '') return missing(CONSOLE_INTENT_FORM_FIELDS.experimentExpectationsJson);
  const experimentRefsText = textOf(form, CONSOLE_INTENT_FORM_FIELDS.experimentRefsText);
  if (experimentRefsText === '') return missing(CONSOLE_INTENT_FORM_FIELDS.experimentRefsText);
  const declaration: ComposePlanDeclaration = {
    action: 'compose-plan',
    planId,
    missionId,
    objectiveAlignmentText,
    platformsJson,
    metricExpectationsJson,
    experimentExpectationsJson,
    experimentRefsText,
    noteText: textOf(form, CONSOLE_INTENT_FORM_FIELDS.noteText),
  };
  return { ok: true, declaration };
}

/** Parses the compile-strategy declaration (version 0 = latest at the seam). */
export function compileStrategyDeclarationFromFormData(form: FormData): ConsoleIntentFormParse {
  const planId = textOf(form, CONSOLE_INTENT_FORM_FIELDS.planId);
  if (planId === '') return missing(CONSOLE_INTENT_FORM_FIELDS.planId);
  const planVersion = numberField(form, CONSOLE_INTENT_FORM_FIELDS.planVersion);
  if (planVersion === null) return missing(CONSOLE_INTENT_FORM_FIELDS.planVersion);
  const principalText = textOf(form, CONSOLE_INTENT_FORM_FIELDS.principalText);
  if (principalText === '') return missing(CONSOLE_INTENT_FORM_FIELDS.principalText);
  const declaration: CompileStrategyDeclaration = {
    action: 'compile-strategy',
    planId,
    planVersion,
    principalText,
  };
  return { ok: true, declaration };
}

/** Parses the create-run declaration. */
export function createRunDeclarationFromFormData(form: FormData): ConsoleIntentFormParse {
  const strategyId = textOf(form, CONSOLE_INTENT_FORM_FIELDS.strategyId);
  if (strategyId === '') return missing(CONSOLE_INTENT_FORM_FIELDS.strategyId);
  const declaration: CreateRunDeclaration = {
    action: 'create-run',
    strategyId,
  };
  return { ok: true, declaration };
}

/** Parses the arm-run declaration — THE authorization action. */
export function armRunDeclarationFromFormData(form: FormData): ConsoleIntentFormParse {
  const runId = textOf(form, CONSOLE_INTENT_FORM_FIELDS.runId);
  if (runId === '') return missing(CONSOLE_INTENT_FORM_FIELDS.runId);
  const principalText = textOf(form, CONSOLE_INTENT_FORM_FIELDS.principalText);
  if (principalText === '') return missing(CONSOLE_INTENT_FORM_FIELDS.principalText);
  const declaration: ArmRunDeclaration = {
    action: 'arm-run',
    runId,
    principalText,
  };
  return { ok: true, declaration };
}
