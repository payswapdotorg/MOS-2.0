/**
 * Home narration presentation-data tests (UX-001) — the §2 complete loop as
 * the product's front door. Pins the ORDER and SHAPE of the narrated stages
 * (spec/mos-architecture-v2.0.md §2), the four cooperating loops and the
 * §1 thesis line — presentation data only: this module implements nothing,
 * decides nothing and computes nothing (that is the point).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MOS_COOPERATING_LOOPS,
  MOS_COMPLETE_LOOP_STAGES,
  MOS_PRODUCT_THESIS,
} from '../dist/src/views/home-loop.js';

test('the complete loop narrates the §2 stages in order', () => {
  assert.deepEqual(
    MOS_COMPLETE_LOOP_STAGES.map((stage) => stage.id),
    [
      'mission',
      'lab',
      'program',
      'studio',
      'artifact-graph',
      'quality-rights-policy',
      'experiment',
      'measurement',
      'learning',
      'next-run',
    ],
  );
});

test('every stage has a title, description and a named owning authority', () => {
  for (const stage of MOS_COMPLETE_LOOP_STAGES) {
    assert.equal(stage.title.length > 0, true, `${stage.id} needs a title`);
    assert.equal(stage.description.length > 20, true, `${stage.id} needs a description`);
    assert.equal(stage.owner.length > 0, true, `${stage.id} names its owning authority`);
  }
});

test('stages link only to shell sections that exist in this build', () => {
  for (const stage of MOS_COMPLETE_LOOP_STAGES) {
    assert.equal(
      stage.section === null || stage.section === 'missions' || stage.section === 'studio',
      true,
      `${stage.id} may only link to an available section (missions, studio)`,
    );
  }
  assert.equal(MOS_COMPLETE_LOOP_STAGES[0]?.section, 'missions');
  assert.equal(MOS_COMPLETE_LOOP_STAGES[3]?.section, 'studio', 'the studio stage links the UX-002 surface');
  assert.equal(MOS_COMPLETE_LOOP_STAGES[9]?.section, 'missions', 'the loop closes back into Missions');
  for (const stage of MOS_COMPLETE_LOOP_STAGES.slice(1, 9)) {
    if (stage.id === 'studio') {
      continue;
    }
    assert.equal(stage.section, null, `${stage.id} has no surface in this build`);
  }
});

test('the four cooperating loops of §2 are summarized', () => {
  assert.deepEqual(
    MOS_COOPERATING_LOOPS.map((loop) => loop.id),
    ['mission-loop', 'production-loop', 'learning-loop', 'engine-loop'],
  );
  assert.deepEqual(
    MOS_COOPERATING_LOOPS.map((loop) => loop.summary),
    [
      'Goal → strategy → execution → outcome.',
      'Request → production → treatment → artifact.',
      'Observations → model → simulation → real experiment → calibration.',
      'Capability → engine candidates → benchmark → activation → replacement.',
    ],
  );
});

test('the thesis line states the §1 product thesis', () => {
  assert.equal(MOS_PRODUCT_THESIS.length > 0, true);
  assert.equal(
    MOS_PRODUCT_THESIS.includes('marketing-engineering operating system'),
    true,
  );
});

test('the narration data is frozen presentation data', () => {
  assert.equal(Object.isFrozen(MOS_COMPLETE_LOOP_STAGES), true);
  assert.equal(Object.isFrozen(MOS_COOPERATING_LOOPS), true);
});
