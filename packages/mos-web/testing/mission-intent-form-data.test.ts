/**
 * Create-mission intent form parsing tests (UX-001) — the pure
 * `FormData` → intent-declaration fold. Presentation discipline: the parser
 * folds fields and drops blank rows defensively, but the REAL validation
 * (statement shape, reward-term well-formedness, lifecycle rules) is the
 * Missions authority's job when the intent is executed there.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TenantScope } from '@mos/contracts';
import {
  MISSION_INTENT_FORM_FIELDS,
  missionIntentDeclarationFromFormData,
} from '../dist/src/views/mission-intent-form-data.js';

const SCOPE: TenantScope = { tenantId: 'tenant_demo' as never, workspaceId: 'ws_demo' as never };

const formData = (entries: readonly [string, string][]): FormData => {
  const form = new FormData();
  for (const [name, value] of entries) {
    form.append(name, value);
  }
  return form;
};

const F = MISSION_INTENT_FORM_FIELDS;

test('a single complete term folds into a declaration', () => {
  const declaration = missionIntentDeclarationFromFormData(
    formData([
      [F.objectiveStatement, 'Grow qualified reach without fatigue.'],
      [F.termMetric, 'qualified-reach'],
      [F.termDirection, 'maximize'],
      [F.termWeight, '1'],
      [F.termDefinition, 'Reach among ICP accounts.'],
    ]),
    SCOPE,
  );
  if ('error' in declaration) {
    assert.fail(`unexpected form error: ${declaration.error}`);
  }
  assert.deepEqual(declaration, {
    scope: SCOPE,
    objectiveStatement: 'Grow qualified reach without fatigue.',
    rewardTerms: [
      {
        metric: 'qualified-reach',
        direction: 'maximize',
        weight: 1,
        definition: 'Reach among ICP accounts.',
      },
    ],
  });
});

test('term rows are zipped by field order and blank rows are dropped', () => {
  const declaration = missionIntentDeclarationFromFormData(
    formData([
      [F.objectiveStatement, 'Two terms, one blank middle row.'],
      [F.termMetric, 'qualified-reach'],
      [F.termDirection, 'maximize'],
      [F.termWeight, '0.7'],
      [F.termDefinition, 'Reach among ICP accounts.'],
      // blank row (metric + definition empty): dropped
      [F.termMetric, ''],
      [F.termDirection, 'minimize'],
      [F.termWeight, '1'],
      [F.termDefinition, ''],
      [F.termMetric, 'cost'],
      [F.termDirection, 'minimize'],
      [F.termWeight, '0.3'],
      [F.termDefinition, 'Total spend.'],
    ]),
    SCOPE,
  );
  if ('error' in declaration) {
    assert.fail(`unexpected form error: ${declaration.error}`);
  }
  assert.deepEqual(
    declaration.rewardTerms.map((term) => term.metric),
    ['qualified-reach', 'cost'],
  );
  assert.equal(declaration.rewardTerms[1]?.weight, 0.3);
  assert.equal(declaration.rewardTerms[1]?.direction, 'minimize');
});

test('a blank objective statement is a typed presentation error', () => {
  const result = missionIntentDeclarationFromFormData(
    formData([
      [F.objectiveStatement, '   '],
      [F.termMetric, 'revenue'],
      [F.termDirection, 'maximize'],
      [F.termWeight, '1'],
      [F.termDefinition, 'Attributed revenue.'],
    ]),
    SCOPE,
  );
  assert.deepEqual(result, { error: 'objective-statement-missing' });
});

test('no keepable reward terms is a typed presentation error', () => {
  const result = missionIntentDeclarationFromFormData(
    formData([
      [F.objectiveStatement, 'An objective with no terms.'],
      [F.termMetric, ''],
      [F.termDirection, 'maximize'],
      [F.termWeight, '1'],
      [F.termDefinition, ''],
    ]),
    SCOPE,
  );
  assert.deepEqual(result, { error: 'reward-terms-missing' });
});

test('a foreign direction value is rejected with its row', () => {
  const result = missionIntentDeclarationFromFormData(
    formData([
      [F.objectiveStatement, 'An objective.'],
      [F.termMetric, 'revenue'],
      [F.termDirection, 'sideways'],
      [F.termWeight, '1'],
      [F.termDefinition, 'Attributed revenue.'],
    ]),
    SCOPE,
  );
  assert.deepEqual(result, { error: 'reward-term-direction-invalid', row: 0 });
});

test('a non-finite weight is rejected with its row', () => {
  const result = missionIntentDeclarationFromFormData(
    formData([
      [F.objectiveStatement, 'An objective.'],
      [F.termMetric, 'revenue'],
      [F.termDirection, 'maximize'],
      [F.termWeight, 'not-a-number'],
      [F.termDefinition, 'Attributed revenue.'],
    ]),
    SCOPE,
  );
  assert.deepEqual(result, { error: 'reward-term-weight-invalid', row: 0 });
});

test('form values are trimmed before folding', () => {
  const declaration = missionIntentDeclarationFromFormData(
    formData([
      [F.objectiveStatement, '  Trimmed objective.  '],
      [F.termMetric, ' revenue '],
      [F.termDirection, 'maximize'],
      [F.termWeight, ' 0.5 '],
      [F.termDefinition, '  Attributed revenue.  '],
    ]),
    SCOPE,
  );
  if ('error' in declaration) {
    assert.fail(`unexpected form error: ${declaration.error}`);
  }
  assert.equal(declaration.objectiveStatement, 'Trimmed objective.');
  assert.equal(declaration.rewardTerms[0]?.metric, 'revenue');
  assert.equal(declaration.rewardTerms[0]?.weight, 0.5);
  assert.equal(declaration.rewardTerms[0]?.definition, 'Attributed revenue.');
});

test('the form field names are stable presentation vocabulary', () => {
  assert.deepEqual(MISSION_INTENT_FORM_FIELDS, {
    objectiveStatement: 'objective-statement',
    termMetric: 'term-metric',
    termDirection: 'term-direction',
    termWeight: 'term-weight',
    termDefinition: 'term-definition',
  });
  assert.equal(Object.isFrozen(MISSION_INTENT_FORM_FIELDS), true);
});
