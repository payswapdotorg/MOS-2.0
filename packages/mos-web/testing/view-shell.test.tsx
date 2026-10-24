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
import { MISSION_DETAIL, missionsPage, noopConsoleIntent, noopIntent, noopLabIntent, SECTIONS, shellView, TENANT } from './view-fixtures.js';
import { elementWithTestId, elementsWithTag, elementsWithAriaCurrent, linkHrefs, renderTreeText } from './render-tree.js';

test('the shell renders the target-design rail sections with Home and Missions first', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
      shellVersion="0.1.0-test"
    />
  );
  const nav = elementsWithTag(tree, 'nav')[0];
  assert.ok(nav, 'the shell carries a navigation landmark');
  const navText = renderTreeText(nav);
  for (const label of [
    'Home',
    'Missions',
    'Research Lab',
    'Agent Console',
    'Social Media',
    'Studio',
    'Distribution',
    'Experiments',
    'Measurement & Learning',
    'Connections',
    'Activity & Approvals',
    'Agent Workbench',
    'Workbench',
    'Automations',
    'Settings',
  ]) {
    assert.equal(navText.includes(label), true, `nav must show ${label}`);
  }
});

test('available sections are links; later surfaces are aria-disabled with their dependency', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
      shellVersion="0.1.0-test"
    />
  );
  const home = elementWithTestId(tree, 'nav-home');
  const missions = elementWithTestId(tree, 'nav-missions');
  assert.equal(home?.type, 'a');
  assert.equal(home?.props.href, '/');
  assert.equal(missions?.type, 'a');
  assert.equal(missions?.props.href, '/missions');

  // UX-002: the Studio section is ON — a real link to the studio surface.
  const studio = elementWithTestId(tree, 'nav-studio');
  assert.ok(studio, 'studio renders as an enabled section (UX-002 delivered)');
  assert.equal(studio?.type, 'a');
  assert.equal(studio?.props.href, '/studio');
  assert.equal(studio?.props['aria-disabled'], undefined);

  // UX-003: the Lab section is ON — a real link to the lab surface.
  const lab = elementWithTestId(tree, 'nav-lab');
  assert.ok(lab, 'lab renders as an enabled section (UX-003 delivered)');
  assert.equal(lab?.type, 'a');
  assert.equal(lab?.props.href, '/lab');
  assert.equal(lab?.props['aria-disabled'], undefined);

  for (const id of ['measurement', 'distribution', 'experiments']) {
    const unavailable = elementWithTestId(tree, `nav-${id}-unavailable`);
    assert.ok(unavailable, `${id} is explicitly unavailable`);
    assert.equal(unavailable?.props['aria-disabled'], 'true');
    assert.equal(
      typeof unavailable?.props.title === 'string' && unavailable.props.title.length > 0,
      true,
      'the unavailable title names what it waits for',
    );
    const chipText = renderTreeText(unavailable);
    assert.equal(chipText.includes('soon'), true, `${id} carries the soon chip idiom`);
  }

  // §5 (UXR-WC): Connections and Activity & Approvals are PROMOTED into the
  // rail as real routes — the pages they open render their own honest
  // unavailable verdicts (never dead controls).
  const connections = elementWithTestId(tree, 'nav-connections');
  assert.equal(connections?.type, 'a');
  assert.equal(connections?.props.href, '/connections');
  const activity = elementWithTestId(tree, 'nav-notifications');
  assert.equal(activity?.type, 'a');
  assert.equal(activity?.props.href, '/notifications');
  assert.equal(renderTreeText(activity).includes('Activity & Approvals'), true);
});

test('the AGENT WORKBENCH group renders as its own rail section (build-ON-ZCode)', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
      shellVersion="0.1.0-test"
    />
  );
  // The workbench group's own list container.
  const group = elementWithTestId(tree, 'shell-workbench-group');
  assert.ok(group, 'the rail renders the Agent Workbench group');
  const groupText = renderTreeText(group);
  for (const label of ['New Task', 'Workbench', 'Automations', 'Settings']) {
    assert.equal(groupText.includes(label), true, `workbench group must show ${label}`);
  }
  // The substrate surfaces are real available links (the desktop host
  // answers their routes by mounting the substrate UI).
  const newTask = elementWithTestId(tree, 'nav-workbench-new-task');
  assert.equal(newTask?.type, 'a');
  assert.equal(newTask?.props.href, '/workbench/new-task');
  const workbench = elementWithTestId(tree, 'nav-workbench');
  assert.equal(workbench?.type, 'a');
  assert.equal(workbench?.props.href, '/workbench');
  const automations = elementWithTestId(tree, 'nav-workbench-automations');
  assert.equal(automations?.type, 'a');
  assert.equal(automations?.props.href, '/workbench/automations');
  const settings = elementWithTestId(tree, 'nav-workbench-settings');
  assert.equal(settings?.type, 'a');
  assert.equal(settings?.props.href, '/workbench/settings');
  // None of the workbench rows leaks into the primary Navigation list.
  const nav = elementsWithTag(tree, 'nav')[0];
  const navText = renderTreeText(nav);
  const navigationHeaderIndex = navText.indexOf('Navigation');
  const workbenchHeaderIndex = navText.indexOf('Agent Workbench');
  assert.ok(navigationHeaderIndex >= 0 && workbenchHeaderIndex > navigationHeaderIndex, 'the Agent Workbench group follows the Navigation group');
});

test('the active section is marked aria-current="page" (keyboard/AT navigation pin)', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'missions', data: missionsPage() }}
      onDeclareMissionIntent={noopIntent}
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
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
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
      shellVersion="0.1.0-test"
    />
  );
  const hrefs = linkHrefs(tree);
  assert.equal(hrefs.includes('/'), true);
  assert.equal(hrefs.includes('/missions'), true);
  assert.equal(hrefs.includes('/studio'), true, 'the studio nav link is a real link');
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
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
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
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
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
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
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
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
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
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
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
  // The composition seam's section table (the §5 target-design rail order,
  // UXR-WC — the Social Media slot between Agent Console and Studio is the
  // UXR social wave's to add) is what the chrome presents; this pins the
  // ten sections and their verdict kinds. The four AGENT WORKBENCH rows
  // (build-ON-ZCode) sit between Social Media and Studio, mirrored from
  // the production desktop composition.
  assert.deepEqual(
    SECTIONS.map((section) => section.id),
    [
      'home',
      'missions',
      'lab',
      'console',
      'social',
      'workbench-new-task',
      'workbench',
      'workbench-automations',
      'workbench-settings',
      'studio',
      'distribution',
      'experiments',
      'measurement',
      'connections',
      'notifications',
    ],
  );
  assert.equal(SECTIONS.filter((section) => section.availability.kind === 'available').length, 12);
});

test('the shell header presents the mission-activity badge honestly (wave-24 target design)', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
      shellVersion="0.1.0-test"
    />
  );
  const idle = elementWithTestId(tree, 'mission-status-idle');
  assert.ok(idle, 'an inactive mission status renders the honest idle badge');
  assert.equal(renderTreeText(idle).includes('No active mission'), true);

  const activeTree = (
    <MosAppShell
      shellView={{ ...shellView(TENANT), missionStatus: { active: true } }}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
      shellVersion="0.1.0-test"
    />
  );
  const active = elementWithTestId(activeTree, 'mission-status-active');
  assert.ok(active, 'an active mission status renders the mint badge');
  assert.equal(renderTreeText(active).includes('Mission active'), true);

  const nullTree = (
    <MosAppShell
      shellView={{ ...shellView(TENANT), missionStatus: null }}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
      shellVersion="0.1.0-test"
    />
  );
  assert.equal(elementWithTestId(nullTree, 'mission-status-active'), null);
  assert.equal(elementWithTestId(nullTree, 'mission-status-idle'), null);
});

test('the shell rail lists recent missions and links them to the console workspace', () => {
  const tree = (
    <MosAppShell
      shellView={shellView(TENANT)}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
      shellVersion="0.1.0-test"
    />
  );
  const rail = elementWithTestId(tree, 'shell-recent-missions');
  assert.ok(rail, 'the recent-missions rail renders');
  const railText = renderTreeText(rail);
  assert.equal(railText.includes('Run the MOS demo mission end to end.'), true);
  const hrefs = linkHrefs(rail);
  assert.equal(hrefs.includes('/console?mission=mission_demo_1'), true);

  const emptyTree = (
    <MosAppShell
      shellView={{ ...shellView(TENANT), recentMissions: [] }}
      routeView={{ kind: 'home' }}
      onDeclareMissionIntent={noopIntent}
      onDeclareLabIntent={noopLabIntent}
      onDeclareConsoleIntent={noopConsoleIntent}
      shellVersion="0.1.0-test"
    />
  );
  assert.ok(elementWithTestId(emptyTree, 'shell-recent-missions-empty'), 'empty is an honest state');
});
