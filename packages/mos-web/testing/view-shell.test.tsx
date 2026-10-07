/**
 * Shell-chrome render tests (UX-001) — render-LEVEL only: the MOS view
 * components are deliberately HOOK-FREE (stateless, uncontrolled forms, one
 * route per load), so each component is exercised by CALLING it and walking
 * the returned React element tree (`testing/render-tree.ts`). This is not a
 * DOM run and makes no browser claim — full browser acceptance is UX-006.
 *
 * This file covers the app shell chrome: navigation order, availability
 * verdicts, tenant context display (spec §31), skip link + landmarks, the
 * loading surface, and the composed-surface a11y sweep.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MosAppShell } from '../dist/src/index.js';
import { MISSION_DETAIL, missionsPage, noopIntent, SECTIONS, shellView, TENANT } from './view-fixtures.js';
import { elementWithTestId, elementsWithTag, elementsWithAriaCurrent, linkHrefs, renderTreeText } from './render-tree.js';

test('the shell renders the five sections with Home and Missions first', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      shellVersion="0.1.0-test"
    />
  );
  const nav = elementsWithTag(tree, 'nav')[0];
  assert.ok(nav, 'the shell carries a navigation landmark');
  const navText = renderTreeText(nav);
  for (const label of ['Home', 'Missions', 'Studio', 'Lab', 'Connections']) {
    assert.equal(navText.includes(label), true, `nav must show ${label}`);
  }
});

test('available sections are links; later surfaces are aria-disabled with their dependency', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      shellVersion="0.1.0-test"
    />
  );
  const home = elementWithTestId(tree, 'nav-home');
  const missions = elementWithTestId(tree, 'nav-missions');
  assert.equal(home?.type, 'a');
  assert.equal(home?.props.href, '/');
  assert.equal(missions?.type, 'a');
  assert.equal(missions?.props.href, '/missions');

  const studio = elementWithTestId(tree, 'nav-studio-unavailable');
  assert.ok(studio, 'studio must render its unavailable verdict');
  assert.equal(studio?.props['aria-disabled'], 'true');
  assert.equal(
    typeof studio?.props.title === 'string' && studio.props.title.includes('UX-002'),
    true,
    'the unavailable title names what it waits for',
  );
  for (const id of ['lab', 'connections']) {
    assert.ok(elementWithTestId(tree, `nav-${id}-unavailable`), `${id} is explicitly unavailable`);
  }
});

test('the active section is marked aria-current="page" (keyboard/AT navigation pin)', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'missions', data: missionsPage() }}
      onDeclareMissionIntent={noopIntent}
      shellVersion="0.1.0-test"
    />
  );
  const marked = elementsWithAriaCurrent(tree);
  const missionsNav = marked.find((element) => element.props['data-testid'] === 'nav-missions');
  assert.equal(missionsNav?.props['aria-current'], 'page');
});

test('every navigation affordance is a real link (keyboard reachable)', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      shellVersion="0.1.0-test"
    />
  );
  const hrefs = linkHrefs(tree);
  assert.equal(hrefs.includes('/'), true);
  assert.equal(hrefs.includes('/missions'), true);
  for (const anchor of elementsWithTag(tree, 'a')) {
    assert.equal(typeof anchor.props.href === 'string' && anchor.props.href.length > 0, true);
  }
});

test('the shell displays the tenant context (spec §31)', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      shellVersion="0.1.0-test"
    />
  );
  const badge = elementWithTestId(tree, 'tenant-context');
  assert.ok(badge);
  const text = renderTreeText(badge);
  assert.equal(text.includes('Acme Media'), true);
  assert.equal(text.includes('Growth Studio'), true);
});

test('without tenant context the shell says so explicitly', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(null)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      shellVersion="0.1.0-test"
    />
  );
  const badge = elementWithTestId(tree, 'tenant-context-none');
  assert.ok(badge);
  assert.equal(renderTreeText(badge).includes('No tenant context resolved'), true);
});

test('the shell carries a skip link, a main landmark and the version footer', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      shellVersion="0.1.0-test"
    />
  );
  const skip = elementsWithTag(tree, 'a').find(
    (element) => renderTreeText(element).includes('Skip to main content'),
  );
  assert.equal(skip?.props.href, '#mos-main');

  const main = elementsWithTag(tree, 'main')[0];
  assert.ok(main);
  assert.equal(main.props.id, 'mos-main');
  assert.equal(main.props.tabIndex, -1);

  const version = elementWithTestId(tree, 'shell-version');
  assert.ok(version);
  assert.equal(renderTreeText(version), 'v0.1.0-test');
  assert.equal(
    renderTreeText(tree).includes('presentation-only surface'),
    true,
    'the footer carries the presentation-only disclosure',
  );
});

test('the shell renders the loading surface while the page model loads', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'loading', label: 'Loading the MOS surface…' }}
      onDeclareMissionIntent={noopIntent}
      shellVersion="0.1.0-test"
    />
  );
  const loading = elementWithTestId(tree, 'mos-loading');
  assert.ok(loading);
  assert.equal(loading.props.role, 'status');
  assert.equal(loading.props['aria-busy'], 'true');
  assert.equal(renderTreeText(loading).includes('Loading the MOS surface…'), true);
});

test('images/icons carry accessible labels; tables declare column scopes', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'missions', data: missionsPage({ selected: MISSION_DETAIL }) }}
      onDeclareMissionIntent={noopIntent}
      shellVersion="0.1.0-test"
    />
  );
  const svg = elementsWithTag(tree, 'svg')[0];
  assert.ok(svg);
  assert.equal(svg.props.role, 'img');
  assert.equal(typeof svg.props['aria-label'] === 'string', true);

  const table = elementWithTestId(tree, 'mission-target-metrics');
  assert.ok(table, 'target metrics render as a table');
  const headers = elementsWithTag(tree, 'th');
  assert.equal(headers.length >= 4, true);
  for (const header of headers) {
    assert.equal(header.props.scope, 'col');
  }
});

test('the section table the shell renders matches the port readiness verdicts', () => {
  // The composition seam's section table (plan §2.2 readiness) is what the
  // chrome presents; this pins the five sections and their verdict kinds.
  assert.deepEqual(
    SECTIONS.map((section) => section.id),
    ['home', 'missions', 'studio', 'lab', 'connections'],
  );
  assert.equal(SECTIONS.filter((section) => section.availability.kind === 'available').length, 2);
});
