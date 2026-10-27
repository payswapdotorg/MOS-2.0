/**
 * Console NAV VOCABULARY pins (W32 — the payswap-pattern product IA;
 * W35 — the two emerged native workbench sections join the registry;
 * W36 — the Tasks + Automations surfaces join them): the seventeen
 * sections with their identity + paths, the typed outcome action set,
 * the AGENT WORKBENCH descriptors (native + substrate, with the stable
 * CDP verification testids), the section↔path mapping, and the section
 * titles (the document-title truth, including the W30 home baseline
 * and the W35/W36 emerged surfaces).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MOS_ACTION_SET,
  MOS_CONSOLE_SECTIONS,
  MOS_WORKBENCH_NAV_ITEMS,
  mosAction,
  mosConsoleSection,
  mosConsoleSectionFromPath,
  mosConsoleSectionPath,
  mosConsoleSectionTitle,
} from '../dist/console/console-nav.js';

test('the console carries exactly the seventeen pinned sections (13 + the four W35/W36 emerged surfaces)', () => {
  assert.equal(MOS_CONSOLE_SECTIONS.length, 17);
  assert.deepEqual(
    MOS_CONSOLE_SECTIONS.map((section) => section.id),
    [
      'overview',
      'missions',
      'social',
      'ads',
      'lab',
      'console',
      'studio',
      'distribution',
      'experiments',
      'measurement',
      'connections',
      'activity',
      'settings',
      'new-task',
      'model-settings',
      'tasks',
      'automations',
    ],
  );
});

test('every section identity is complete (title + purpose + path, no dupes)', () => {
  const titles = new Set<string>();
  const paths = new Set<string>();
  for (const section of MOS_CONSOLE_SECTIONS) {
    assert.ok(section.title.length > 0, `${section.id} has a title`);
    assert.ok(section.purpose.length > 40, `${section.id} carries a real purpose line`);
    assert.ok(section.path.startsWith('/'), `${section.id} path is app-internal`);
    titles.add(section.title);
    paths.add(section.path);
  }
  assert.equal(titles.size, MOS_CONSOLE_SECTIONS.length);
  assert.equal(paths.size, MOS_CONSOLE_SECTIONS.length);
});

test('the section titles carry the document-title truth (the W30 baseline + the W35 emerged surfaces)', () => {
  assert.equal(mosConsoleSectionTitle('overview'), 'MOS — Home');
  assert.equal(mosConsoleSectionTitle('social'), 'MOS — Social');
  assert.equal(mosConsoleSectionTitle('settings'), 'MOS — Settings');
  assert.equal(mosConsoleSectionTitle('new-task'), 'MOS — New Task');
  assert.equal(mosConsoleSectionTitle('model-settings'), 'MOS — Model Settings');
  assert.equal(mosConsoleSectionTitle('tasks'), 'MOS — Tasks');
  assert.equal(mosConsoleSectionTitle('automations'), 'MOS — Automations');
  assert.equal(mosConsoleSectionTitle('not-a-section'), 'MOS');
});

test('the section↔path mapping is total and honest (unknown → overview; the emerged workbench paths resolve natively)', () => {
  assert.equal(mosConsoleSectionFromPath('/'), 'overview');
  assert.equal(mosConsoleSectionFromPath('/missions'), 'missions');
  assert.equal(mosConsoleSectionFromPath('/measurement'), 'measurement');
  assert.equal(mosConsoleSectionFromPath('/nonsense'), 'overview');
  assert.equal(mosConsoleSectionFromPath(''), 'overview');
  assert.equal(mosConsoleSectionFromPath('/social?platform=youtube'), 'social');
  // The W35/W36 emergence: /workbench/new-task, /workbench/models,
  // /workbench/tasks and /workbench/automations resolve to the NATIVE
  // console sections (no substrate handoff).
  assert.equal(mosConsoleSectionFromPath('/workbench/new-task'), 'new-task');
  assert.equal(mosConsoleSectionFromPath('/workbench/models'), 'model-settings');
  assert.equal(mosConsoleSectionFromPath('/workbench/tasks'), 'tasks');
  assert.equal(mosConsoleSectionFromPath('/workbench/automations'), 'automations');
  for (const section of MOS_CONSOLE_SECTIONS) {
    assert.equal(mosConsoleSectionFromPath(section.path), section.id);
    assert.equal(mosConsoleSectionPath(section.id), section.path);
  }
});

test('the typed outcome action set is PROMOTE / PUBLISH / GROW / MEASURE', () => {
  assert.deepEqual(
    MOS_ACTION_SET.map((action) => action.label),
    ['PROMOTE', 'PUBLISH', 'GROW', 'MEASURE'],
  );
  for (const action of MOS_ACTION_SET) {
    assert.ok(action.line.length > 30, `${action.label} carries a real scope line`);
    assert.equal(action.direction, action.id);
  }
  assert.equal(mosAction('promote')?.label, 'PROMOTE');
  assert.equal(mosAction('pay'), undefined);
});

test('the AGENT WORKBENCH group carries the four native surfaces + the two substrate surfaces with the stable testids', () => {
  assert.deepEqual(
    MOS_WORKBENCH_NAV_ITEMS.map((item) => item.kind),
    ['native', 'native', 'native', 'native', 'substrate', 'substrate'],
  );
  assert.deepEqual(
    MOS_WORKBENCH_NAV_ITEMS.map((item) => item.testId),
    [
      'nav-workbench-new-task',
      'nav-workbench-tasks',
      'nav-workbench-models',
      'nav-workbench-automations',
      'nav-workbench',
      'nav-workbench-settings',
    ],
  );
  assert.equal(MOS_WORKBENCH_NAV_ITEMS[0]?.kind, 'native');
  assert.equal(
    MOS_WORKBENCH_NAV_ITEMS[0]?.kind === 'native' ? MOS_WORKBENCH_NAV_ITEMS[0].section : undefined,
    'new-task',
  );
  assert.equal(MOS_WORKBENCH_NAV_ITEMS[0]?.path, '/workbench/new-task');
  assert.equal(
    MOS_WORKBENCH_NAV_ITEMS[1]?.kind === 'native' ? MOS_WORKBENCH_NAV_ITEMS[1].section : undefined,
    'tasks',
  );
  assert.equal(MOS_WORKBENCH_NAV_ITEMS[1]?.path, '/workbench/tasks');
  assert.equal(
    MOS_WORKBENCH_NAV_ITEMS[2]?.kind === 'native' ? MOS_WORKBENCH_NAV_ITEMS[2].section : undefined,
    'model-settings',
  );
  assert.equal(MOS_WORKBENCH_NAV_ITEMS[2]?.path, '/workbench/models');
  assert.equal(
    MOS_WORKBENCH_NAV_ITEMS[3]?.kind === 'native' ? MOS_WORKBENCH_NAV_ITEMS[3].section : undefined,
    'automations',
  );
  assert.equal(MOS_WORKBENCH_NAV_ITEMS[3]?.path, '/workbench/automations');
  assert.deepEqual(
    MOS_WORKBENCH_NAV_ITEMS.slice(4).map((item) => (item.kind === 'substrate' ? item.surface : undefined)),
    ['chat', 'settings'],
  );
  assert.equal(MOS_WORKBENCH_NAV_ITEMS[5]?.path, '/workbench/settings');
});

test('mosConsoleSection resolves records and rejects unknowns honestly', () => {
  assert.equal(mosConsoleSection('ads')?.title, 'Ads');
  assert.equal(mosConsoleSection('nope'), undefined);
});
