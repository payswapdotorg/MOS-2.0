/**
 * AGENT ROUTING pins (W32 — the payswap intentRouter pattern): every
 * agent entry point converges on the typed action set (PROMOTE /
 * PUBLISH / GROW / MEASURE) plus the connect intents and section
 * navigations; anything else gets the honest UNKNOWN reply — never a
 * guessed capability.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MOS_AGENT_UNKNOWN_REPLY,
  routeMosAgentText,
} from '../dist/console/agent-routing.js';

test('the promote stems route deterministically', () => {
  for (const text of ['promote the pop-up', 'I want to run ads', 'spend budget on this', 'draft me a campaign', 'paid push']) {
    const reply = routeMosAgentText(text);
    assert.equal(reply.kind, 'action', `"${text}" routes to an action`);
    assert.equal(reply.kind === 'action' ? reply.action : '', 'promote');
  }
});

test('the publish stems route deterministically', () => {
  for (const text of ['publish the teaser', 'compose a post', 'upload the short', 'some content for the channel']) {
    const reply = routeMosAgentText(text);
    assert.equal(reply.kind, 'action');
    assert.equal(reply.kind === 'action' ? reply.action : '', 'publish');
  }
});

test('the grow stems route deterministically', () => {
  for (const text of ['grow the audience', 'more followers please', 'subscriber growth', 'we need virality']) {
    const reply = routeMosAgentText(text);
    assert.equal(reply.kind, 'action');
    assert.equal(reply.kind === 'action' ? reply.action : '', 'grow');
  }
});

test('the measure stems route deterministically', () => {
  for (const text of ['measure the results', 'how are we performing', 'show me the evidence', 'read the analytics']) {
    const reply = routeMosAgentText(text);
    assert.equal(reply.kind, 'action');
    assert.equal(reply.kind === 'action' ? reply.action : '', 'measure');
  }
});

test('connect intents name the provider and route to the setup record', () => {
  const reply = routeMosAgentText('connect youtube');
  assert.equal(reply.kind, 'connect');
  assert.equal(reply.kind === 'connect' ? reply.providerId : '', 'youtube');
  assert.ok(reply.reply.includes('SETUP_REQUIRED'));

  const meta = routeMosAgentText('set up meta ads');
  assert.equal(meta.kind, 'connect');
  assert.equal(meta.kind === 'connect' ? meta.providerId : '', 'meta-ads');
});

test('connect beats action when both appear (connect + provider name)', () => {
  const reply = routeMosAgentText('connect tiktok and start publishing');
  assert.equal(reply.kind, 'connect', 'the connect intent outranks the action stems');
});

test('section navigations route after the actions', () => {
  const reply = routeMosAgentText('open the activity log');
  assert.equal(reply.kind, 'navigate');
  assert.equal(reply.kind === 'navigate' ? reply.section : '', 'activity');

  const lab = routeMosAgentText('show me the lab');
  assert.equal(lab.kind === 'navigate' ? lab.section : '', 'lab');

  // A pure action word still wins over the navigation stems.
  const promote = routeMosAgentText('promote');
  assert.equal(promote.kind, 'action');
});

test('anything else gets the honest UNKNOWN reply (never a guessed capability)', () => {
  for (const text of ['do my taxes', 'write a novel', '']) {
    const reply = routeMosAgentText(text);
    assert.equal(reply.kind, 'unknown');
    assert.equal(reply.reply, MOS_AGENT_UNKNOWN_REPLY);
    assert.ok(MOS_AGENT_UNKNOWN_REPLY.includes("I don't guess capabilities"));
  }
});
