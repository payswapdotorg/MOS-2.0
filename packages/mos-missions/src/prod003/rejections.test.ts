/** PROD-003 — the named typed-rejection taxonomies on both sides. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPILER_REJECTION_NAMES, isCompilerRejection, compileRightsDenied, planRefUnresolved, tenantIdInvalid } from '../strategy-compiler/rejections.js';
import { AUTOMATION_REJECTION_NAMES, isAutomationRejection, armRightsDenied, eventRunMismatch } from '../marketing-automation/rejections.js';

test('compiler rejection names are a closed set covering every gate', () => {
  assert.equal(COMPILER_REJECTION_NAMES.length, 16);
  for (const name of COMPILER_REJECTION_NAMES) assert.equal(typeof name, 'string');
  assert.ok(COMPILER_REJECTION_NAMES.includes('COMPILE_RIGHTS_DENIED'));
  assert.ok(COMPILER_REJECTION_NAMES.includes('COUNTERFACTUAL_LABEL_MISSING'));
  assert.ok(COMPILER_REJECTION_NAMES.includes('COMPILE_AUTHORITY_FAULT'));
});

test('isCompilerRejection discriminates by name', () => {
  assert.equal(isCompilerRejection(compileRightsDenied('r', 'a', 'auth')), true);
  assert.equal(isCompilerRejection(planRefUnresolved('p', 1)), true);
  assert.equal(isCompilerRejection({ name: 'NOT_A_REAL_NAME' }), false);
  assert.equal(isCompilerRejection(null), false);
  assert.equal(isCompilerRejection(42), false);
});

test('automation rejection names are a closed set covering every typed failure', () => {
  assert.equal(AUTOMATION_REJECTION_NAMES.length, 10);
  assert.ok(AUTOMATION_REJECTION_NAMES.includes('ARM_RIGHTS_DENIED'));
  assert.ok(AUTOMATION_REJECTION_NAMES.includes('HOST_LOOP_GUARD'));
  assert.ok(AUTOMATION_REJECTION_NAMES.includes('ARM_AUTHORITY_FAULT'));
});

test('isAutomationRejection discriminates by name', () => {
  assert.equal(isAutomationRejection(armRightsDenied('r', 'a', 'auth')), true);
  assert.equal(isAutomationRejection(eventRunMismatch('a', 'b')), true);
  assert.equal(isAutomationRejection({ name: 'PLAN_REF_UNRESOLVED' }), false, 'compiler names do not leak into the automation set');
  assert.equal(isAutomationRejection(undefined), false);
});

test('constructors carry their distinguishing fields verbatim', () => {
  const denied = compileRightsDenied('summer embargoed', 'rights-authority#rule-7', 'rights-authority');
  assert.equal(denied.name, 'COMPILE_RIGHTS_DENIED');
  assert.equal(denied.attribution, 'rights-authority#rule-7');
  assert.equal(denied.authority, 'rights-authority');
  const invalid = tenantIdInvalid('Bad-Co', 'compile request tenant id');
  assert.equal(invalid.name, 'TENANT_ID_INVALID');
  assert.ok(invalid.message.includes('Bad-Co'));
});
