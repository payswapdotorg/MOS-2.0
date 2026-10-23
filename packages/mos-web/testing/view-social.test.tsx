/**
 * Social workspace render tests (the UXR social wave) — render-LEVEL only
 * (static render-tree walk, no DOM, no browser claim; full browser
 * acceptance is the browser smoke's social suite). Covers:
 *
 *  - the platform picker rail renders ALL FIVE frozen-profile platforms
 *    (YouTube selected as the house navy pill) with honest one-line
 *    capability summaries derived from the read model's own verdicts;
 *  - capability verdicts render the three states DISTINCTLY — supported /
 *    unsupported-fails-closed / unknown-observation-pending — and `unknown`
 *    never renders as a boolean, a blank or a softer word;
 *  - the guided-setup checklist renders the target's five steps with their
 *    HONEST derived states (fresh = all not-started) and the AGENT GUIDE
 *    panel's verbatim copy;
 *  - the setup-details form DECLARES a create-mission intent through the
 *    existing shell callback (asserted on the exact declaration shape —
 *    objective statement folding the four target fields, single reward
 *    term reusing the mission-intent parser);
 *  - the guided browser pane renders the HONEST non-Electron fallback
 *    (never a decorative webview frame) with the secure external link;
 *  - the simulation sandbox renders its labels VERBATIM (SANDBOX title,
 *    the boundary line, the SIMULATION chip) and its honest status rows;
 *  - the connect verdict renders unavailable honestly (no credentials
 *    exist — the matrix records this, never a disabled pretence).
 *
 * View fixtures are derived ONCE from the disclosed composition double
 * through the REAL route-loading pass (the shapes the port returns).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CreateMissionIntentDeclaration } from '../dist/src/ports/mission-catalog.js';
import type { AppShellView } from '../dist/src/ports/app-shell.js';
import type { SocialPageData } from '../dist/src/routes/route-loading.js';
import { loadMosRouteView } from '../dist/src/routes/route-loading.js';
import { SocialView } from '../dist/src/index.js';
import {
  socialSetupMissionDeclarationFromFormData,
  SOCIAL_SETUP_FORM_FIELDS,
} from '../dist/src/index.js';
import { createInMemoryMosWebComposition } from './compose-in-memory-mos-web.js';
import { shellView, TENANT } from './view-fixtures.js';
import {
  elementWithTestId,
  elementsWithTag,
  linkHrefs,
  renderTreeText,
} from './render-tree.js';

const SHELL_VIEW: AppShellView = shellView(TENANT);

async function socialPage(platformSlug: string | null): Promise<SocialPageData> {
  const composition = createInMemoryMosWebComposition();
  const routeView = await loadMosRouteView(
    composition,
    { kind: 'social', platform: platformSlug, step: null },
    SHELL_VIEW,
  );
  if (routeView.kind !== 'social') {
    throw new Error(`the social page model did not load: ${JSON.stringify(routeView)}`);
  }
  return routeView.data;
}

const NOOP_DECLARE = (_declaration: CreateMissionIntentDeclaration): void => undefined;

function socialTree(data: SocialPageData, onDeclare = NOOP_DECLARE): ReturnType<typeof SocialView> {
  return <SocialView data={data} onDeclareMissionIntent={onDeclare} />;
}

test('the platform picker renders all five frozen-profile platforms with the default selected', async () => {
  const data = await socialPage(null);
  const tree = socialTree(data);
  const text = renderTreeText(tree);
  for (const slug of ['youtube', 'instagram', 'facebook-pages', 'tiktok', 'x']) {
    const entry = elementWithTestId(tree, `social-platform-${slug}`);
    assert.ok(entry, `the rail lists the ${slug} platform`);
    assert.equal(entry?.type, 'a');
    assert.equal(entry?.props.href, `/social?platform=${slug}`);
  }
  assert.equal(renderTreeText(elementWithTestId(tree, 'social-platform-youtube')).includes('YouTube'), true);
  assert.equal(
    renderTreeText(elementWithTestId(tree, 'social-platform-summary-youtube')),
    'Publishing supported · Restrictions unknown',
  );
  assert.equal(
    renderTreeText(elementWithTestId(tree, 'social-platform-summary-instagram')),
    'Publishing supported · Restrictions unknown',
  );
  const selected = elementWithTestId(tree, 'social-platform-youtube');
  assert.equal(String(selected?.props.className ?? '').includes('bg-mos-navy'), true);
  assert.equal(String(selected?.props['aria-current'] ?? ''), 'page');
  assert.equal(text.includes('Set up your YouTube workspace'), true);
});

test('capability verdicts render the three states distinctly — unknown is never a boolean', async () => {
  const data = await socialPage(null);
  const tree = socialTree(data);
  const publish = elementWithTestId(tree, 'social-verdict-publish');
  assert.equal(publish?.props['data-support'], 'supported');
  assert.equal(renderTreeText(publish), 'supported');
  const restrictions = elementWithTestId(tree, 'social-verdict-list-restrictions');
  assert.equal(restrictions?.props['data-support'], 'unknown');
  assert.equal(renderTreeText(restrictions), 'unknown — observation-pending');
  const matrixText = renderTreeText(elementWithTestId(tree, 'social-capability-matrix-youtube'));
  assert.equal(matrixText.includes('publish'), true);
  assert.equal(matrixText.includes('schedule'), true);
  assert.equal(matrixText.includes('read-observations'), true);
  assert.equal(matrixText.includes('delete'), true);
  // unknown never coerced: no boolean vocabulary anywhere in the matrix
  for (const banned of ['true', 'false', 'maybe', 'probably']) {
    assert.equal(matrixText.includes(banned), false, `the matrix must not say ${banned}`);
  }
  // the distinct three-state vocabulary also exists in the presentation pins
  assert.equal(renderTreeText(elementWithTestId(tree, 'social-verdict-publish')), 'supported');
});

test('a platform switch renders that platform\'s own verdict table (the capability-driven pattern)', async () => {
  const data = await socialPage('x');
  const tree = socialTree(data);
  assert.equal(renderTreeText(elementWithTestId(tree, 'social-workspace-heading')).includes('X workspace'), true);
  const schedule = elementWithTestId(tree, 'social-verdict-schedule');
  assert.equal(schedule?.props['data-support'], 'unknown');
  const publish = elementWithTestId(tree, 'social-verdict-publish');
  assert.equal(publish?.props['data-support'], 'supported');
  const del = elementWithTestId(tree, 'social-verdict-delete');
  assert.equal(del?.props['data-support'], 'supported');
  assert.equal(elementWithTestId(tree, 'social-capability-matrix-x') !== null, true);
  assert.equal(elementWithTestId(tree, 'social-capability-matrix-youtube'), null);
  // TikTok renders its own unknown scheduling verdict too
  const tiktokData = await socialPage('tiktok');
  const tiktokTree = socialTree(tiktokData);
  assert.equal(elementWithTestId(tiktokTree, 'social-verdict-schedule')?.props['data-support'], 'unknown');
  assert.equal(elementWithTestId(tiktokTree, 'social-verdict-delete')?.props['data-support'], 'unknown');
});

test('an unknown platform selection degrades honestly to the default with an explicit error', async () => {
  const data = await socialPage('myspace');
  const tree = socialTree(data);
  assert.equal(elementWithTestId(tree, 'social-platform-selection-error') !== null, true);
  assert.equal(renderTreeText(elementWithTestId(tree, 'social-workspace-heading')).includes('YouTube workspace'), true);
});

test('the guided-setup checklist renders the five steps with honest not-started states', async () => {
  const data = await socialPage(null);
  const tree = socialTree(data);
  const panel = elementWithTestId(tree, 'social-guided-setup');
  assert.ok(panel, 'the guided-setup panel renders');
  const text = renderTreeText(panel);
  for (const label of [
    '1. Choose goal',
    '2. Source access',
    '3. Define simulation',
    '4. Inspect evidence',
    '5. Compare strategies',
  ]) {
    assert.equal(text.includes(label), true, `the checklist shows ${label}`);
  }
  for (let position = 1; position <= 5; position += 1) {
    const badge = elementWithTestId(tree, `social-step-badge-${position}`);
    assert.equal(badge?.props['data-state'], 'not-started', `step ${position} is honestly not-started`);
  }
  // the AGENT GUIDE panel's verbatim copy + the honest follow-up affordance
  assert.equal(text.includes('AGENT GUIDE'), true);
  assert.equal(
    renderTreeText(elementWithTestId(tree, 'social-agent-guide-quote')),
    '“We can start with public or user-provided sources. If you connect an account, the app will use only approved scopes.”',
  );
  const followup = elementWithTestId(tree, 'social-ask-followup');
  assert.equal(followup?.type, 'a');
  assert.equal(followup?.props.href, '/console?mode=direct');
  assert.equal(renderTreeText(followup).includes('Ask a follow-up question'), true);
  assert.equal(renderTreeText(tree).includes('Voice or text supported where available'), true);
  // honest absence: no mission context on a fresh workspace
  assert.equal(elementWithTestId(tree, 'social-mission-context-none') !== null, true);
});

test('the guided browser pane renders the honest non-Electron fallback with the secure external link', async () => {
  const data = await socialPage(null);
  const tree = socialTree(data);
  assert.equal(elementWithTestId(tree, 'social-guided-browser-fallback') !== null, true);
  assert.equal(
    renderTreeText(elementWithTestId(tree, 'social-guided-browser-unavailable')),
    'The guided browser is available in the MOS desktop app',
  );
  const external = elementWithTestId(tree, 'social-guided-browser-open-external');
  assert.equal(external?.type, 'a');
  assert.equal(external?.props.href, 'https://www.youtube.com/');
  assert.equal(external?.props.target, '_blank');
  assert.equal(external?.props.rel, 'noopener noreferrer');
  // no decorative webview frame outside the Electron substrate
  assert.equal(elementsWithTag(tree, 'webview').length, 0);
  const text = renderTreeText(tree);
  assert.equal(
    text.includes(
      'Secure provider route — MOS never asks for your password here; sign-in stays with the provider',
    ),
    true,
  );
  assert.equal(text.includes('Some providers block embedded sign-in'), true);
});

test('the task-first paths link to the owning surfaces, never a dead card', async () => {
  const data = await socialPage(null);
  const tree = socialTree(data);
  const hrefs = linkHrefs(tree);
  for (const href of [
    '/lab?section=corpus',
    '/console?mode=research',
    '/lab?section=simulator',
    '#social-setup-details',
    '/social?platform=youtube',
  ]) {
    assert.equal(hrefs.includes(href), true, `a path card links ${href}`);
  }
  const text = renderTreeText(elementWithTestId(tree, 'social-task-paths'));
  assert.equal(text.includes('Start with the task, not a login'), true);
  assert.equal(text.includes('Research a channel'), true);
  assert.equal(text.includes('Create a simulation'), true);
});

test('the simulation sandbox renders its labels VERBATIM with honest status rows', async () => {
  const data = await socialPage(null);
  const tree = socialTree(data);
  assert.equal(
    renderTreeText(elementWithTestId(tree, 'social-sandbox-title')),
    'Simulation workspace — SANDBOX',
  );
  assert.equal(
    renderTreeText(elementWithTestId(tree, 'social-sandbox-boundary')),
    'No live publish • no invented analytics • no account changes',
  );
  assert.equal(renderTreeText(elementWithTestId(tree, 'social-sandbox-simulated-chip')), 'SIMULATION');
  assert.equal(
    renderTreeText(elementWithTestId(tree, 'social-sandbox-row-audience-market')).includes('Declared by user'),
    true,
  );
  const strategyRow = elementWithTestId(tree, 'social-sandbox-row-candidate-strategies');
  assert.equal(renderTreeText(strategyRow).includes('Compared to baseline'), true);
  assert.equal(linkHrefs(strategyRow).includes('/lab?section=strategy'), true);
  const evidenceRow = elementWithTestId(tree, 'social-sandbox-row-evidence-uncertainty');
  assert.equal(renderTreeText(evidenceRow).includes('Source-linked records'), true);
  assert.equal(linkHrefs(evidenceRow).includes('/lab?section=corpus'), true);
});

test('the connect verdict renders unavailable honestly — the matrix records it, no live connect action', async () => {
  const data = await socialPage(null);
  const tree = socialTree(data);
  const panel = elementWithTestId(tree, 'social-connect-verdict-youtube');
  assert.ok(panel, 'the connect verdict panel renders');
  const text = renderTreeText(panel);
  assert.equal(text.includes('unavailable in this release'), true);
  assert.equal(text.includes('Source access requires the production service transport'), true);
  assert.equal(text.includes('no credentials exist anywhere in this composition'), true);
});

test('the setup-details form declares a create-mission intent through the existing callback', async () => {
  const data = await socialPage(null);
  let declared: CreateMissionIntentDeclaration | null = null;
  const tree = socialTree(data, (declaration) => {
    declared = declaration;
  });

  // The parsed declaration shape (the mission-intent parser reused on the
  // folded fields — asserted first, directly):
  const prepared = new FormData();
  prepared.append(SOCIAL_SETUP_FORM_FIELDS.business, 'Cedar outdoor kit');
  prepared.append(SOCIAL_SETUP_FORM_FIELDS.goal, 'Qualified leads for the spring line');
  prepared.append(SOCIAL_SETUP_FORM_FIELDS.metric, 'qualified-reach');
  prepared.append(SOCIAL_SETUP_FORM_FIELDS.direction, 'maximize');
  prepared.append(SOCIAL_SETUP_FORM_FIELDS.audience, 'US hikers · English');
  prepared.append(SOCIAL_SETUP_FORM_FIELDS.horizon, '90 days · small budget');
  const parsed = socialSetupMissionDeclarationFromFormData(
    prepared,
    data.scope as never,
    'YouTube',
  );
  if ('error' in parsed) {
    throw new Error(`the folded declaration must parse: ${parsed.error}`);
  }
  assert.deepEqual(parsed.scope, data.scope);
  assert.equal(
    parsed.objectiveStatement,
    'Qualified leads for the spring line · Business/product: Cedar outdoor kit · Target audience & region: US hikers · English · Time horizon/budget: 90 days · small budget.',
  );
  assert.deepEqual(parsed.rewardTerms, [
    {
      metric: 'qualified-reach',
      direction: 'maximize',
      weight: 1,
      definition:
        'YouTube social setup — success goal: Qualified leads for the spring line (business/product: Cedar outdoor kit; target audience & region: US hikers · English; time horizon/budget: 90 days · small budget).',
    },
  ]);

  // The submit wiring routes the parsed declaration to the shell callback
  // (FormData is stubbed for the handler's construction step — node's
  // FormData cannot wrap a DOM form element, and this suite has no DOM).
  const form = elementsWithTag(tree, 'form').find(
    (element) => element.props['data-testid'] === 'social-setup-form',
  );
  assert.ok(form, 'the setup form renders');
  const realFormData = globalThis.FormData;
  globalThis.FormData = class StubFormData {
    constructor() {
      return prepared;
    }
  } as unknown as typeof FormData;
  try {
    (form?.props.onSubmit as (event: unknown) => void)({
      preventDefault: () => undefined,
      currentTarget: {} as HTMLFormElement,
    });
  } finally {
    globalThis.FormData = realFormData;
  }
  assert.ok(declared !== null, 'the submit declared the intent through the callback');
  assert.deepEqual(declared, parsed);
});

test('without a tenant scope the setup form refuses to declare (never an ambient guess)', async () => {
  const data = await socialPage(null);
  const tree = socialTree({ ...data, scope: null });
  assert.equal(elementWithTestId(tree, 'social-setup-no-scope') !== null, true);
  const button = elementWithTestId(tree, 'social-setup-continue');
  assert.equal(button?.props.disabled, true);
});

test('the Important distinction callout carries the verbatim connect-vs-simulate honesty', async () => {
  const data = await socialPage(null);
  const tree = socialTree(data);
  assert.equal(renderTreeText(elementWithTestId(tree, 'social-distinction-callout')).includes('Important distinction'), true);
  assert.equal(
    renderTreeText(elementWithTestId(tree, 'social-distinction-body')),
    'Connecting a real YouTube source is different from simulating strategy outcomes. No content is published in this setup flow.',
  );
});
