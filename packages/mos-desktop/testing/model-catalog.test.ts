/**
 * MODEL CATALOG pins (W35 — the substrate's frozen builtin GLM roster,
 * emerged as the MOS console's model truth): the canonical 22-model list
 * in pinned order, the frozen per-model facts (vision, reasoning option
 * specs, context windows, plan membership), the connection-mode rosters,
 * the GLM-5.3 Vision-badge bridge rule, and the context badge formatting.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MOS_AGENT_MODEL_CATALOG,
  MOS_MODEL_CONNECTION_MODES,
  MOS_MODEL_PROVIDER_FAMILIES,
  mosAgentModel,
  mosModelContextBadge,
  mosModelVisionBadgeVisible,
  mosModelsForConnectionMode,
  mosModelReasoningLine,
} from '../dist/console/model-catalog.js';

test('the catalog is the canonical 22-model GLM roster in pinned order', () => {
  assert.equal(MOS_AGENT_MODEL_CATALOG.length, 22);
  assert.deepEqual(
    MOS_AGENT_MODEL_CATALOG.map((model) => model.id),
    [
      'GLM-5.3',
      'GLM-5.3-Flash',
      'GLM-5V-Turbo',
      'GLM-5.2',
      'GLM-5.1',
      'GLM-5.1-Highspeed',
      'GLM-5',
      'GLM-5-Turbo',
      'GLM-4.7',
      'GLM-4.7-FlashX',
      'GLM-4.7-Flash',
      'GLM-4.6',
      'GLM-4.5-Air',
      'GLM-4.5',
      'GLM-4.6V',
      'GLM-4.6V-Flash',
      'GLM-4.6V-FlashX',
      'GLM-4.1V-Thinking-FlashX',
      'GLM-4.1V-Thinking-Flash',
      'GLM-4-FlashX-250414',
      'GLM-4-Flash-250414',
      'GLM-4V-Flash',
    ],
  );
});

test('the flagship facts are frozen (GLM-5.3 and GLM-5.3-Flash)', () => {
  const flagship = mosAgentModel('GLM-5.3');
  assert.ok(flagship !== undefined, 'GLM-5.3 exists');
  if (flagship === undefined) return;
  assert.deepEqual(flagship.reasoning, ['low', 'high', 'max']);
  assert.equal(flagship.contextTokens, 1_000_000);
  assert.equal(flagship.maxOutputTokens, 128_000);
  assert.deepEqual(flagship.plans, ['individual', 'team', 'off-peak']);
  // supportsImage true — the image input is BRIDGED (the badge rule hides
  // it on plan accesses, shows it on API).
  assert.equal(flagship.vision, true);

  const flash = mosAgentModel('GLM-5.3-Flash');
  assert.ok(flash !== undefined, 'GLM-5.3-Flash exists');
  if (flash === undefined) return;
  assert.equal(flash.vision, true);
  assert.deepEqual(flash.plans, ['start', 'individual', 'team', 'off-peak']);
});

test('the image-input models are GLM-5.3 (bridged) + the V-family + Flash + Turbo roster members', () => {
  const visionIds = MOS_AGENT_MODEL_CATALOG.filter((model) => model.vision).map((model) => model.id);
  assert.deepEqual(visionIds, [
    'GLM-5.3',
    'GLM-5.3-Flash',
    'GLM-5V-Turbo',
    'GLM-4.6V',
    'GLM-4.6V-Flash',
    'GLM-4.6V-FlashX',
    'GLM-4.1V-Thinking-FlashX',
    'GLM-4.1V-Thinking-Flash',
    'GLM-4V-Flash',
  ]);
});

test('the GLM-5.3 Vision-badge bridge rule hides the badge on plan accesses, shows it on API', () => {
  // GLM-5.3's image input is server-side bridged on plan accesses.
  assert.equal(mosModelVisionBadgeVisible('GLM-5.3', 'individual'), false);
  assert.equal(mosModelVisionBadgeVisible('GLM-5.3', 'start'), false);
  assert.equal(mosModelVisionBadgeVisible('GLM-5.3', 'team'), false);
  assert.equal(mosModelVisionBadgeVisible('GLM-5.3', 'api'), true);
  // Every other vision model shows the badge regardless of mode.
  assert.equal(mosModelVisionBadgeVisible('GLM-5.3-Flash', 'start'), true);
  assert.equal(mosModelVisionBadgeVisible('GLM-4V-Flash', 'individual'), true);
  // Non-vision models never show it.
  assert.equal(mosModelVisionBadgeVisible('GLM-4.6', 'api'), false);
});

test('the connection modes carry the substrate rosters with their badges', () => {
  assert.deepEqual(
    MOS_MODEL_CONNECTION_MODES.map((mode) => mode.id),
    ['individual', 'start', 'team', 'api'],
  );
  const individual = MOS_MODEL_CONNECTION_MODES.find((mode) => mode.id === 'individual');
  assert.ok(individual !== undefined);
  if (individual === undefined) return;
  assert.equal(individual.label, 'Individual Plan');
  assert.equal(individual.badge, null);
  assert.deepEqual(individual.modelIds, ['GLM-5.3', 'GLM-5.3-Flash', 'GLM-5.2', 'GLM-5-Turbo']);

  const start = MOS_MODEL_CONNECTION_MODES.find((mode) => mode.id === 'start');
  assert.ok(start !== undefined);
  if (start === undefined) return;
  assert.equal(start.label, 'Start Plan');
  assert.equal(start.badge, 'Free');
  assert.deepEqual(start.modelIds, ['GLM-5.3-Flash', 'GLM-5.2', 'GLM-5-Turbo']);

  const team = MOS_MODEL_CONNECTION_MODES.find((mode) => mode.id === 'team');
  assert.ok(team !== undefined);
  if (team === undefined) return;
  assert.equal(team.badge, 'Team');

  const api = MOS_MODEL_CONNECTION_MODES.find((mode) => mode.id === 'api');
  assert.ok(api !== undefined);
  if (api === undefined) return;
  assert.equal(api.modelIds.length, 22);
  assert.equal(mosModelsForConnectionMode('api').length, 22);
  assert.deepEqual(mosModelsForConnectionMode('nonsense'), []);
});

test('the context badges format the frozen windows the substrate way (round-to-K)', () => {
  // The substrate rule (formatContextWindow): round(x/1000)K below 1M,
  // integer millions as M — 131,072 renders '131K', 65,536 renders '66K'.
  assert.equal(mosModelContextBadge(1_000_000), '1M');
  assert.equal(mosModelContextBadge(200_000), '200K');
  assert.equal(mosModelContextBadge(131_072), '131K');
  assert.equal(mosModelContextBadge(65_536), '66K');
  assert.equal(mosModelContextBadge(16_384), '16K');
  assert.equal(mosModelContextBadge(1_500_000), '1.5M');
  // The roster's own windows all render through the badge formatter.
  for (const model of MOS_AGENT_MODEL_CATALOG) {
    assert.ok(mosModelContextBadge(model.contextTokens).length > 0);
  }
});

test('the reasoning lines render the option specs (vision models carry no control)', () => {
  assert.equal(mosModelReasoningLine(mosAgentModel('GLM-5.3') ?? { reasoning: null } as never), 'low · high · max');
  assert.equal(mosModelReasoningLine(mosAgentModel('GLM-5.2') ?? { reasoning: null } as never), 'disabled · high · max');
  assert.equal(mosModelReasoningLine(mosAgentModel('GLM-4.6V') ?? { reasoning: null } as never), '—');
});

test('the preset provider families are Z.ai and BigModel with their hosts', () => {
  assert.deepEqual(
    MOS_MODEL_PROVIDER_FAMILIES.map((family) => family.display),
    ['Z.ai', 'BigModel'],
  );
  assert.equal(MOS_MODEL_PROVIDER_FAMILIES[0]?.host, 'api.z.ai');
  assert.equal(MOS_MODEL_PROVIDER_FAMILIES[1]?.host, 'open.bigmodel.cn');
});
