import type {
  DelayDecisionError,
} from '../contracts/delay-decision-port.js';
import type {
  DelayEvaluationInput,
} from '../contracts/delay-decision.js';
import type {
  DelayOptionKind,
} from '../contracts/delay-economics.js';
import { DELAY_OPTION_KINDS } from '../contracts/delay-economics.js';
import { isBlankString, isPlainObject, isPositiveInteger } from './parametric-support.js';
import {
  delayValidationFail as fail,
  derivationProblem,
  dimensionModelProblem,
  type DelayValidationFailure,
} from './delay-decision-validation.js';

/**
 * INTERNAL structural validation for the LAB-015 delay decision surface,
 * part two — option targets (the BY-REFERENCE substitution discipline),
 * state references, the ten-option decision context, learning-relevant
 * outcomes and the top-level evaluation input. Split from
 * delay-decision-validation.ts to respect the file line budget. NOT exported
 * from the package index.
 */

// ---------------------------------------------------------------------------
// Option targets (BY REFERENCE only — shape-checked per option kind)
// ---------------------------------------------------------------------------

const refVersionProblem = (version: unknown, label: string): string | null =>
  isPositiveInteger(version) ? null : `${label} must cite an exact version (integer >= 1)`;

/**
 * Validate one option target against its option kind (the BY-REFERENCE
 * substitution discipline). `null` = valid.
 */
export const optionTargetProblem = (
  target: unknown,
  option: DelayOptionKind,
): DelayValidationFailure | null => {
  const targetless: readonly DelayOptionKind[] = ['no-op', 'wait', 'retry', 'abandon'];
  if (targetless.includes(option)) {
    if (!isPlainObject(target) || target.kind !== 'none') {
      return fail('invalid-option-declaration', `the option "${option}" takes NO target (target.kind must be "none")`, { option });
    }
    return null;
  }
  if (!isPlainObject(target) || typeof target.kind !== 'string') {
    return fail('invalid-option-declaration', `the option "${option}" must declare a target`, { option });
  }
  switch (option) {
    case 'substitute-engine': {
      if (target.kind !== 'engine') {
        return fail('invalid-option-declaration', 'the substitute-engine option must target an engine registry reference (engine id + exact version)', { option });
      }
      const engine = target as Record<string, unknown>;
      if (typeof engine.engineId !== 'string' || isBlankString(engine.engineId)) {
        return fail('invalid-option-declaration', 'the engine substitution must cite a non-blank engine id', { option });
      }
      const version = refVersionProblem(engine.engineVersion, 'the engine substitution');
      return version === null ? null : fail('invalid-option-declaration', version, { option });
    }
    case 'substitute-capability-provider': {
      if (target.kind !== 'capability' && target.kind !== 'provider') {
        return fail('invalid-option-declaration', 'the substitute-capability-provider option must target a capability ref or a provider ref', { option });
      }
      if (target.kind === 'capability') {
        const capability = (target as Record<string, unknown>).requirement as unknown;
        if (!isPlainObject(capability) || typeof capability.capabilityId !== 'string' || isBlankString(capability.capabilityId)) {
          return fail('invalid-option-declaration', 'the capability substitution must cite a non-blank capability id', { option });
        }
        const version = refVersionProblem(capability.version, 'the capability substitution');
        return version === null ? null : fail('invalid-option-declaration', version, { option });
      }
      const provider = target as Record<string, unknown>;
      if (typeof provider.providerId !== 'string' || isBlankString(provider.providerId)) {
        return fail('invalid-option-declaration', 'the provider substitution must cite a non-blank provider id (INTEG-001 vocabulary)', { option });
      }
      const version = refVersionProblem(provider.providerVersion, 'the provider substitution');
      return version === null ? null : fail('invalid-option-declaration', version, { option });
    }
    case 'switch-organization': {
      if (target.kind !== 'organization') {
        return fail('invalid-option-declaration', 'the switch-organization option must target an organization descriptor reference', { option });
      }
      const organization = target as Record<string, unknown>;
      if (typeof organization.organizationId !== 'string' || isBlankString(organization.organizationId)) {
        return fail('invalid-option-declaration', 'the organization switch must cite a non-blank organization id', { option });
      }
      const version = refVersionProblem(organization.organizationVersion, 'the organization switch');
      return version === null ? null : fail('invalid-option-declaration', version, { option });
    }
    case 'switch-transform': {
      if (target.kind !== 'transform') {
        return fail('invalid-option-declaration', 'the switch-transform option must target a transform definition reference', { option });
      }
      const transform = target as Record<string, unknown>;
      if (typeof transform.definitionId !== 'string' || isBlankString(transform.definitionId)) {
        return fail('invalid-option-declaration', 'the transform switch must cite a non-blank definition id', { option });
      }
      const version = refVersionProblem(transform.definitionVersion, 'the transform switch');
      return version === null ? null : fail('invalid-option-declaration', version, { option });
    }
    case 'reduce-scope': {
      if (target.kind !== 'reduced-scope') {
        return fail('invalid-option-declaration', 'the reduce-scope option must declare its scope reduction', { option });
      }
      const reduction = (target as Record<string, unknown>).reduction as unknown;
      if (!isPlainObject(reduction) || !Array.isArray(reduction.dropped) || reduction.dropped.length === 0) {
        return fail('invalid-option-declaration', 'the scope reduction must declare a non-empty list of what is dropped', { option });
      }
      for (const dropped of reduction.dropped as unknown[]) {
        if (typeof dropped !== 'string' || isBlankString(dropped)) {
          return fail('invalid-option-declaration', 'every dropped-scope entry must be a non-blank string', { option });
        }
      }
      if (typeof reduction.remaining !== 'string' || isBlankString(reduction.remaining)) {
        return fail('invalid-option-declaration', 'the scope reduction must declare what remains (non-blank)', { option });
      }
      return null;
    }
    case 'proceed-without-human': {
      if (target.kind !== 'human-task') {
        return fail('invalid-option-declaration', 'the proceed-without-human option must reference the human production task being bypassed', { option });
      }
      const humanTask = target as Record<string, unknown>;
      if (typeof humanTask.taskId !== 'string' || isBlankString(humanTask.taskId)) {
        return fail('invalid-option-declaration', 'the human task reference must be a non-blank task id (LAB-014)', { option });
      }
      return null;
    }
    default:
      return fail('invalid-option-declaration', `unknown option kind: ${String(option)}`, { option });
  }
};

// ---------------------------------------------------------------------------
// State references + decision context
// ---------------------------------------------------------------------------

const refPairProblem = (id: unknown, version: unknown, label: string): string | null => {
  const hasId = typeof id === 'string' && !isBlankString(id);
  const hasVersion = isPositiveInteger(version);
  if (hasId !== hasVersion) {
    return `${label} id and version must be declared together`;
  }
  return null;
};

/** Validate the state references record. `null` = valid. */
export const stateRefsProblem = (stateRefs: unknown): DelayValidationFailure | null => {
  if (!isPlainObject(stateRefs)) {
    return fail('invalid-input', 'stateRefs must be a record of current state references');
  }
  const refs = stateRefs as Record<string, unknown>;
  if (typeof refs.scopeStatement !== 'string' || isBlankString(refs.scopeStatement)) {
    return fail('invalid-input', 'stateRefs.scopeStatement must be a non-blank production scope statement');
  }
  if (refs.humanTaskId !== null && (typeof refs.humanTaskId !== 'string' || isBlankString(refs.humanTaskId))) {
    return fail('invalid-input', 'stateRefs.humanTaskId must be a non-blank task id or null');
  }
  const engine = refPairProblem(refs.engineId, refs.engineVersion, 'stateRefs.engine');
  if (engine !== null) {
    return fail('invalid-input', engine);
  }
  const provider = refPairProblem(refs.providerId, refs.providerVersion, 'stateRefs.provider');
  if (provider !== null) {
    return fail('invalid-input', provider);
  }
  const organization = refPairProblem(refs.organizationId, refs.organizationVersion, 'stateRefs.organization');
  if (organization !== null) {
    return fail('invalid-input', organization);
  }
  const transform = refPairProblem(refs.transformId, refs.transformVersion, 'stateRefs.transform');
  if (transform !== null) {
    return fail('invalid-input', transform);
  }
  const capability = refs.capability;
  if (capability !== null) {
    if (!isPlainObject(capability) || typeof capability.capabilityId !== 'string' || isBlankString(capability.capabilityId) || !isPositiveInteger(capability.version)) {
      return fail('invalid-input', 'stateRefs.capability must be a capability requirement (capability id + exact version) or null');
    }
  }
  return null;
};

/**
 * Validate the WHOLE decision context: the dependency, the reward spec
 * version, the deadline, exactly ONE declaration per §18 option kind and —
 * for applicable options — the complete dimension model + target. `null` =
 * valid.
 */
export const decisionContextProblem = (context: unknown): DelayValidationFailure | null => {
  if (!isPlainObject(context)) {
    return fail('invalid-input', 'context must be a delay decision context record');
  }
  const record = context as Record<string, unknown>;
  if (typeof record.dependency !== 'string' || isBlankString(record.dependency)) {
    return fail('invalid-input', 'context.dependency must be a non-blank dependency descriptor');
  }
  if (!isPositiveInteger(record.rewardSpecVersion)) {
    return fail('invalid-input', 'context.rewardSpecVersion must be an integer >= 1 (the §21 reward spec the estimates are denominated in)');
  }
  if (record.deadline !== null && (typeof record.deadline !== 'string' || isBlankString(record.deadline))) {
    return fail('invalid-input', 'context.deadline must be an ISO-8601 timestamp or null');
  }
  if (!Array.isArray(record.options)) {
    return fail('invalid-input', 'context.options must be the ten option declarations');
  }
  const declarations = record.options as unknown[];
  if (declarations.length !== DELAY_OPTION_KINDS.length) {
    return fail('invalid-option-declaration', `exactly ${String(DELAY_OPTION_KINDS.length)} option declarations are required (one per §18 option kind; got ${String(declarations.length)})`);
  }
  const seen = new Set<DelayOptionKind>();
  let applicableCount = 0;
  for (const declaration of declarations) {
    if (!isPlainObject(declaration) || typeof declaration.optionKind !== 'string') {
      return fail('invalid-option-declaration', 'every option declaration must name its option kind');
    }
    const option = declaration.optionKind as DelayOptionKind;
    if (!DELAY_OPTION_KINDS.includes(option)) {
      return fail('invalid-option-declaration', `unknown option kind: ${String(option)}`, { option });
    }
    if (seen.has(option)) {
      return fail('invalid-option-declaration', `the option "${option}" is declared more than once`, { option });
    }
    seen.add(option);
    if (declaration.applicable === true) {
      applicableCount += 1;
      const target = optionTargetProblem(declaration.target, option);
      if (target !== null) {
        return target;
      }
      const dimensions = dimensionModelProblem(declaration.dimensions, option, record.rewardSpecVersion as number);
      if (dimensions !== null) {
        return dimensions;
      }
    } else if (declaration.applicable === false) {
      if (typeof declaration.inapplicableReason !== 'string' || isBlankString(declaration.inapplicableReason)) {
        return fail('invalid-option-declaration', `the inapplicable option "${option}" must declare its named reason (inapplicability is declared, never silent)`, { option });
      }
    } else {
      return fail('invalid-option-declaration', `the option "${option}" must declare applicable: true | false`, { option });
    }
  }
  if (applicableCount === 0) {
    return fail('no-applicable-options', 'a delay decision analysis requires at least one applicable option');
  }
  return null;
};

// ---------------------------------------------------------------------------
// Learning-relevant outcomes
// ---------------------------------------------------------------------------

/**
 * Validate one learning-relevant outcome (recorded when later known). The
 * outcome carries the SAME provenance discipline as every estimate. `null` =
 * valid.
 */
export const learningOutcomeProblem = (
  outcome: unknown,
): DelayValidationFailure | null => {
  if (!isPlainObject(outcome)) {
    return fail('invalid-abandonment', 'the learning-relevant outcome must be { observedAt, outcome, derivation }');
  }
  const record = outcome as Record<string, unknown>;
  if (typeof record.observedAt !== 'string' || isBlankString(record.observedAt)) {
    return fail('invalid-abandonment', 'the learning-relevant outcome must carry an ISO-8601 observedAt timestamp');
  }
  if (typeof record.outcome !== 'string' || isBlankString(record.outcome)) {
    return fail('invalid-abandonment', 'the learning-relevant outcome must be a non-blank declared observation');
  }
  const derivation = derivationProblem(record.derivation, 'the learning-relevant outcome');
  if (derivation !== null) {
    return fail('estimate-without-provenance', `${derivation.message} (outcomes are never invented)`);
  }
  return null;
};

/** Convert an internal failure into the public typed error shape. */
export const toDelayError = (failure: DelayValidationFailure): DelayDecisionError => ({
  error: failure.error,
  message: failure.message,
  ...(failure.dimension === undefined ? {} : { dimension: failure.dimension }),
  ...(failure.option === undefined ? {} : { option: failure.option }),
});

/** Validate the top-level evaluation input shape. `null` = valid. */
export const evaluationInputProblem = (
  input: DelayEvaluationInput,
): DelayValidationFailure | null => {
  if (!isPlainObject(input) || typeof input.id !== 'string' || isBlankString(input.id)) {
    return fail('invalid-input', 'the analysis id must be a non-blank string');
  }
  if (!isPlainObject(input.scope) || typeof (input.scope as Record<string, unknown>).tenantId !== 'string') {
    return fail('invalid-input', 'the evaluation input must carry a tenant scope');
  }
  if (!isPositiveInteger(input.policyVersion)) {
    return fail('invalid-input', 'policyVersion must be an integer >= 1 (the declared policy version this evaluation pins)');
  }
  if (input.seed !== null && input.seed !== undefined && typeof input.seed !== 'number') {
    return fail('invalid-input', 'seed must be a number or null');
  }
  const stateRefs = stateRefsProblem(input.stateRefs);
  if (stateRefs !== null) {
    return stateRefs;
  }
  return decisionContextProblem(input.context);
};
