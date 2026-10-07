import type { ArtifactRef, TenantScope } from '@mos/contracts';
import type { CreateHumanProductionTaskInput } from '../contracts/human-production-task.js';
import type { HumanProductionTaskFieldName } from '../contracts/human-task-fields.js';
import type { HumanFulfillmentPath } from '../contracts/human-task-lifecycle.js';
import { isBlankString, isFiniteNonNegative, isPlainObject, isPositiveInteger } from './parametric-support.js';

/**
 * INTERNAL twelve-field validation for the in-memory human production task
 * adapter (LAB-014). NOT exported from the package index.
 *
 * EVERY field of the §17 twelve-field surface is validated structurally and
 * a missing or malformed field fails closed NAMING THE FIELD
 * (`invalid-task-field` + `field`). Source artifact refs additionally fail
 * closed on cross-tenant references (unknown and cross-tenant are
 * indistinguishable on reads elsewhere; here the caller's own scope is
 * known, so the mismatch is explicit).
 */

const MODALITIES: readonly string[] = ['text', 'image', 'audio', 'video', 'structured', 'mixed'];

const nonBlankStrings = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && !isBlankString(entry));

const artifactRefProblem = (artifact: unknown, index: number): string | null => {
  if (!isPlainObject(artifact)) {
    return `artifact ref #${index} must be an ArtifactRef object`;
  }
  for (const field of ['artifactId', 'digest', 'type', 'storageRef', 'rightsRef', 'provenanceRef'] as const) {
    if (typeof artifact[field] !== 'string' || isBlankString(artifact[field])) {
      return `artifact ref #${index} field ${field} must be a non-blank string`;
    }
  }
  if (!isPositiveInteger(artifact.version)) {
    return `artifact ref #${index} version must be an integer ≥ 1`;
  }
  if (typeof artifact.tenantId !== 'string' || isBlankString(artifact.tenantId)) {
    return `artifact ref #${index} tenantId must be a non-blank string`;
  }
  return null;
};

/** Structural validation of one canonical `ArtifactRef` (shared by source and delivered refs). */
export const canonicalArtifactRefProblem = artifactRefProblem;

const moneyProblem = (value: unknown, label: string): string | null => {
  if (!isPlainObject(value) || !isFiniteNonNegative(value.amount) || typeof value.currency !== 'string' || isBlankString(value.currency)) {
    return `${label} must be a { amount ≥ 0, currency } money record`;
  }
  return null;
};

/** Structural validation of one fulfillment path. */
export const fulfillmentPathProblem = (path: unknown): string | null => {
  if (!isPlainObject(path)) {
    return 'fulfillment path must be a path object';
  }
  if (path.kind === 'project-owner') {
    return null;
  }
  if (path.kind === 'authorized-collaborator') {
    if (typeof path.collaboratorRef !== 'string' || isBlankString(path.collaboratorRef)) {
      return 'authorized-collaborator path requires a non-blank collaboratorRef';
    }
    return null;
  }
  if (path.kind === 'arena-provider') {
    const provider = path.provider;
    if (!isPlainObject(provider) || typeof provider.providerId !== 'string' || isBlankString(provider.providerId) || !isPositiveInteger(provider.providerVersion)) {
      return 'arena-provider path requires a provider { providerId, providerVersion ≥ 1 } (INTEG-001 vocabulary)';
    }
    return null;
  }
  return `fulfillment path kind must be project-owner | authorized-collaborator | arena-provider (got: ${String(path.kind)})`;
};

/** Whether two fulfillment paths denote the same path. */
export const sameFulfillmentPath = (a: HumanFulfillmentPath, b: HumanFulfillmentPath): boolean => {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'authorized-collaborator' && b.kind === 'authorized-collaborator') {
    return a.collaboratorRef === b.collaboratorRef;
  }
  if (a.kind === 'arena-provider' && b.kind === 'arena-provider') {
    return a.provider.providerId === b.provider.providerId && a.provider.providerVersion === b.provider.providerVersion;
  }
  return true;
};

/** The twelve §17 fields, in field-name order (validation and failure order). */
export const TASK_FIELDS: readonly HumanProductionTaskFieldName[] = [
  'objective',
  'source-reference',
  'script-or-questions',
  'capture-instructions',
  'target-modality',
  'required-artifacts',
  'consent',
  'rights',
  'evaluator',
  'deadline',
  'delay-economics',
  'acceptable-substitutes',
];

/**
 * Validate the twelve-field task package surface. Returns the first named
 * field failure or `null` when the package is complete and well-formed.
 */
export const validateTaskPackage = (
  scope: TenantScope,
  input: CreateHumanProductionTaskInput,
): { readonly field: HumanProductionTaskFieldName; readonly message: string } | null => {
  const fieldProblem = (
    field: HumanProductionTaskFieldName,
    message: string,
  ): { readonly field: HumanProductionTaskFieldName; readonly message: string } => ({ field, message });

  // 1. objective
  const objective = input.objective;
  if (!isPlainObject(objective) || typeof objective.statement !== 'string' || isBlankString(objective.statement)) {
    return fieldProblem('objective', 'objective.statement must be a non-blank string');
  }
  if (!nonBlankStrings(objective.successCriteria) || objective.successCriteria.length === 0) {
    return fieldProblem('objective', 'objective.successCriteria must be a non-empty array of non-blank criteria');
  }

  // 2. source/reference
  const source = input.sourceReference;
  if (!isPlainObject(source) || !Array.isArray(source.artifactRefs) || source.artifactRefs.length === 0) {
    return fieldProblem('source-reference', 'sourceReference.artifactRefs must be a non-empty array of artifact refs');
  }
  for (const [index, artifact] of source.artifactRefs.entries()) {
    const problem = artifactRefProblem(artifact, index);
    if (problem !== null) {
      return fieldProblem('source-reference', problem);
    }
    if ((artifact as ArtifactRef).tenantId !== scope.tenantId) {
      return fieldProblem('source-reference', `source artifact ref #${index} belongs to another tenant scope — cross-tenant references fail closed`);
    }
  }
  if (source.notes !== undefined && (typeof source.notes !== 'string' || isBlankString(source.notes))) {
    return fieldProblem('source-reference', 'sourceReference.notes must be a non-blank string when present');
  }

  // 3. script/questions
  const script = input.scriptOrQuestions;
  if (!isPlainObject(script)) {
    return fieldProblem('script-or-questions', 'scriptOrQuestions must be a script or questions record');
  }
  if (script.kind === 'script') {
    if (!nonBlankStrings(script.beats) || script.beats.length === 0) {
      return fieldProblem('script-or-questions', 'a script requires a non-empty array of non-blank beats');
    }
  } else if (script.kind === 'questions') {
    if (!nonBlankStrings(script.questions) || script.questions.length === 0) {
      return fieldProblem('script-or-questions', 'a questions record requires a non-empty array of non-blank questions');
    }
  } else {
    const kind = (script as { readonly kind?: unknown }).kind;
    return fieldProblem('script-or-questions', `scriptOrQuestions.kind must be script | questions (got: ${String(kind)})`);
  }

  // 4. capture instructions
  const capture = input.captureInstructions;
  if (!isPlainObject(capture) || typeof capture.brief !== 'string' || isBlankString(capture.brief)) {
    return fieldProblem('capture-instructions', 'captureInstructions.brief must be a non-blank string');
  }
  if (!nonBlankStrings(capture.requirements)) {
    return fieldProblem('capture-instructions', 'captureInstructions.requirements must be an array of non-blank strings');
  }

  // 5. target modality
  const target = input.targetModality;
  if (!isPlainObject(target) || !MODALITIES.includes(target.modality as string)) {
    return fieldProblem('target-modality', 'targetModality.modality must be one of text | image | audio | video | structured | mixed');
  }

  // 6. required artifacts
  const required = input.requiredArtifacts;
  if (!isPlainObject(required) || !Array.isArray(required.artifacts) || required.artifacts.length === 0) {
    return fieldProblem('required-artifacts', 'requiredArtifacts.artifacts must be a non-empty array');
  }
  for (const artifact of required.artifacts) {
    if (!isPlainObject(artifact) || typeof artifact.artifactType !== 'string' || isBlankString(artifact.artifactType) || !isPositiveInteger(artifact.minCount)) {
      return fieldProblem('required-artifacts', 'every required artifact must be { artifactType, minCount ≥ 1 }');
    }
  }

  // 7. consent
  const consent = input.consent;
  if (!isPlainObject(consent) || typeof consent.consentRef !== 'string' || isBlankString(consent.consentRef) || typeof consent.scope !== 'string' || isBlankString(consent.scope)) {
    return fieldProblem('consent', 'consent requires a non-blank consentRef (@mos/contracts ConsentRef) and a non-blank scope');
  }

  // 8. rights
  const rights = input.rights;
  if (!isPlainObject(rights) || !nonBlankStrings(rights.rightsRefs) || rights.rightsRefs.length === 0) {
    return fieldProblem('rights', 'rights.rightsRefs must be a non-empty array of non-blank rights references (@mos/contracts RightsRef)');
  }

  // 9. evaluator
  const evaluator = input.evaluator;
  if (!isPlainObject(evaluator) || typeof evaluator.evaluatorRef !== 'string' || isBlankString(evaluator.evaluatorRef)) {
    return fieldProblem('evaluator', 'evaluator requires a non-blank evaluatorRef');
  }
  if (!isPlainObject(evaluator.inputSchema) || !isPlainObject(evaluator.outputSchema)) {
    return fieldProblem('evaluator', 'evaluator contract shape must declare inputSchema and outputSchema objects');
  }

  // 10. deadline
  const deadline = input.deadline;
  if (!isPlainObject(deadline) || typeof deadline.deadlineAt !== 'string' || isBlankString(deadline.deadlineAt) || !Number.isFinite(Date.parse(deadline.deadlineAt))) {
    return fieldProblem('deadline', 'deadline.deadlineAt must be a parseable ISO-8601 timestamp');
  }

  // 11. delay economics (DECLARED expectations — §2 first-class variable)
  const economics = input.delayEconomics;
  if (!isPlainObject(economics) || economics.declaration !== 'declared-expectations') {
    return fieldProblem('delay-economics', 'delayEconomics.declaration must be the pinned literal "declared-expectations"');
  }
  if (!isFiniteNonNegative(economics.expectedWaitMs)) {
    return fieldProblem('delay-economics', 'delayEconomics.expectedWaitMs must be finite ≥ 0 (milliseconds)');
  }
  for (const [label, value] of [
    ['expectedIncrementalValue', economics.expectedIncrementalValue],
    ['delayCost', economics.delayCost],
    ['acquisitionCost', economics.acquisitionCost],
  ] as const) {
    const problem = moneyProblem(value, `delayEconomics.${label}`);
    if (problem !== null) {
      return fieldProblem('delay-economics', problem);
    }
  }
  if (typeof economics.successProbability !== 'number' || !Number.isFinite(economics.successProbability) || economics.successProbability < 0 || economics.successProbability > 1) {
    return fieldProblem('delay-economics', 'delayEconomics.successProbability must be a finite number in [0, 1]');
  }
  if (typeof economics.qualityImpact !== 'number' || !Number.isFinite(economics.qualityImpact)) {
    return fieldProblem('delay-economics', 'delayEconomics.qualityImpact must be a finite signed number');
  }

  // 12. acceptable substitutes (ordered preference list)
  const substitutes = input.acceptableSubstitutes;
  if (!isPlainObject(substitutes) || !Array.isArray(substitutes.ordered)) {
    return fieldProblem('acceptable-substitutes', 'acceptableSubstitutes.ordered must be an array (possibly empty — none acceptable)');
  }
  let previousPreference = 0;
  for (const substitute of substitutes.ordered) {
    const entry = substitute as { readonly preference?: unknown; readonly path?: unknown };
    if (!isPositiveInteger(entry.preference)) {
      return fieldProblem('acceptable-substitutes', 'every substitute must carry an integer preference ≥ 1');
    }
    if ((entry.preference as number) <= previousPreference) {
      return fieldProblem('acceptable-substitutes', `substitute preferences must be strictly ascending (got ${String(entry.preference)} after ${String(previousPreference)})`);
    }
    previousPreference = entry.preference as number;
    const pathProblem = fulfillmentPathProblem(entry.path);
    if (pathProblem !== null) {
      return fieldProblem('acceptable-substitutes', pathProblem);
    }
  }

  return null;
};
