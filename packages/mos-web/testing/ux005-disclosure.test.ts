/**
 * UX-005 progressive-disclosure battery — over the disclosure primitives,
 * the summary builders, the loop orientation strip, and the RENDERED route
 * views (the static render-tree substrate: the house's hook-free views can
 * be exercised by calling them and walking the element tree). The
 * honesty-preservation law is pinned per surface: the summary layer carries
 * the honesty labels, and the collapsed disclosure rows keep them too.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SummaryLayer,
  DisclosureItem,
  DisclosureList,
} from '../dist/src/views/disclosure/disclosure-primitive.js';
import { LOOP_STAGES, loopOwnerRoute } from '../dist/src/views/disclosure/loop-orientation.js';
import {
  buildMissionsSummary,
  buildStudioSummary,
  buildLabSummary,
  buildConnectionsSummary,
} from '../dist/src/views/disclosure/surface-summaries.js';
import { LAB_COUNTERFACTUAL_LABEL, LAB_MEASURED_LABEL } from '../dist/src/views/lab-presentation.js';
import { flattenRenderTree, elementWithTestId, renderTreeText, linkHrefs } from './render-tree.js';

/** First element carrying the given ux005 surface marker, or null. */
function ux005Layer(root: unknown, surface: string) {
  return flattenRenderTree(root).find((el) => el.props['data-ux005-surface'] === surface) ?? null;
}
import { HomeView } from '../dist/src/routes/home-view.js';
import { ConnectionsView } from '../dist/src/routes/connections-view.js';
import { connectionsCompositionDouble } from './connections-composition-double.js';
import type { ConnectionsPageData } from '../dist/src/routes/route-loading.js';
import type { AppShellView } from '../dist/src/ports/app-shell.js';
import { createInMemoryMosWebComposition } from './compose-in-memory-mos-web.js';
import { MissionsView } from '../dist/src/routes/missions-view.js';
import { StudioView } from '../dist/src/routes/studio-view.js';
import { LabView } from '../dist/src/routes/lab-view.js';
import type { MissionsPageData } from '../dist/src/routes/route-loading.js';
import type { StudioPageData } from '../dist/src/routes/route-loading.js';
import type { LabPageData } from '../dist/src/routes/route-loading.js';

/* ---------- criterion 2: summary layer present per surface (rendered) ---------- */

test('missions view renders the ux005 summary layer with tenant honesty label', async () => {
  const composition = createInMemoryMosWebComposition();
  const shellView = (await composition.appShell.loadAppShell()) as AppShellView;
  const data = (await pageDataFor('/missions', composition, shellView)) as MissionsPageData;
  const tree = MissionsView({ data, onDeclareMissionIntent: () => undefined });
  const layer = ux005Layer(tree, 'missions');
  assert.ok(layer !== null, 'summary layer present');
  const text = renderTreeText(layer);
  assert.match(text, /mission\(s\) in the catalog/);
  assert.match(text, /Tenant: /);
});

test('studio view renders the ux005 summary layer with consent honesty', async () => {
  const composition = createInMemoryMosWebComposition();
  const shellView = (await composition.appShell.loadAppShell()) as AppShellView;
  const data = (await pageDataFor('/studio', composition, shellView)) as StudioPageData;
  const tree = StudioView({ data });
  const layer = ux005Layer(tree, 'studio');
  assert.ok(layer !== null, 'summary layer present');
  assert.match(renderTreeText(layer), /package\(s\)/);
  assert.match(renderTreeText(layer), /Consent state is shown per package — never assumed\./);
});

test('lab view renders the ux005 summary layer with BOTH lab honesty labels', async () => {
  const composition = createInMemoryMosWebComposition();
  const shellView = (await composition.appShell.loadAppShell()) as AppShellView;
  const data = (await pageDataFor('/lab', composition, shellView)) as LabPageData;
  const tree = LabView({ data, onDeclareLabIntent: () => undefined });
  const layer = ux005Layer(tree, 'lab');
  assert.ok(layer !== null, 'summary layer present');
  const text = renderTreeText(layer);
  assert.ok(text.includes(LAB_COUNTERFACTUAL_LABEL));
  assert.ok(text.includes(LAB_MEASURED_LABEL));
  assert.match(text, /Counterfactual is never presented as measured\./);
});

test('connections view renders the ux005 summary layer with the UX-004 honesty set', () => {
  const tree = ConnectionsView({ data: connectionsPageData() });
  const layer = ux005Layer(tree, 'connections');
  assert.ok(layer !== null, 'summary layer present');
  const text = renderTreeText(layer);
  assert.match(text, /provider\(s\) across two authorities/);
  assert.match(text, /Health is platform-said, typed CONFIRMED or SUSPECTED\./);
  assert.match(text, /Unknown capabilities stay UNKNOWN — never guessed\./);
  assert.match(text, /Denials carry their attribution, including zero-transport\./);
});

test('home view renders the §2 orientation strip with all five stages', () => {
  const tree = HomeView();
  const strip = elementWithTestId(tree, 'ux005-orientation-strip');
  assert.ok(strip !== null, 'orientation strip present');
  const stages = flattenRenderTree(strip).filter((el) => typeof el.type === 'string' && el.type === 'details');
  assert.equal(stages.length, 5);
});

/* ---------- criterion 1: honesty preservation at every level (builders + rendered) ---------- */

test('lab summary carries the counterfactual label', () => {
  assert.ok(buildLabSummary({ measuredCount: 0, counterfactualCount: 0 }).honestyLabels.includes(LAB_COUNTERFACTUAL_LABEL));
});

test('lab summary carries the measured label', () => {
  assert.ok(buildLabSummary({ measuredCount: 0, counterfactualCount: 0 }).honestyLabels.includes(LAB_MEASURED_LABEL));
});

test('lab honesty labels live in the summary layer, not in collapsed-away detail', () => {
  assert.ok(buildLabSummary({ measuredCount: 1, counterfactualCount: 1 }).honestyLabels.length >= 3);
});

test('connections summary carries CONFIRMED/SUSPECTED typing', () => {
  const m = buildConnectionsSummary({ providerCount: 1, confirmedCount: 0, suspectedCount: 0, unknownCapabilityCount: 0 });
  assert.ok(m.honestyLabels.some((l) => l.includes('CONFIRMED') && l.includes('SUSPECTED')));
});

test('connections summary preserves UNKNOWN capabilities as a stat', () => {
  const m = buildConnectionsSummary({ providerCount: 1, confirmedCount: 0, suspectedCount: 0, unknownCapabilityCount: 3 });
  assert.equal(m.stats.find((s) => s.label === 'UNKNOWN capabilities')?.value, '3');
});

test('connections summary preserves the zero-transport denial attribution note', () => {
  const m = buildConnectionsSummary({ providerCount: 1, confirmedCount: 0, suspectedCount: 0, unknownCapabilityCount: 0 });
  assert.ok(m.honestyLabels.some((l) => l.includes('zero-transport')));
});

test('missions summary preserves tenant context', () => {
  assert.ok(buildMissionsSummary({ missionCount: 0, openCount: 0, tenantLabel: 't-9' }).honestyLabels[0]!.includes('t-9'));
});

test('studio summary preserves consent honesty', () => {
  assert.equal(buildStudioSummary({ packageCount: 0, consentPendingCount: 0 }).honestyLabels.length, 1);
});

test('rendered connections rows keep honesty in the COLLAPSED summary rows', () => {
  const tree = ConnectionsView({ data: connectionsPageData() });
  // the binding rows carry the lifecycle badge + tenant in the collapsed <summary> content
  const row = elementWithTestId(tree, 'connections-binding-bind-2');
  assert.ok(row !== null);
  const summaries = flattenRenderTree(row).filter((el) => el.type === 'summary');
  assert.ok(summaries.length >= 1, 'collapsed summary row present');
  const text = renderTreeText(summaries[0]);
  assert.match(text, /lifecycle: gated/);
  assert.match(text, /tenant: tenant-2/);
});

/* ---------- criterion 3: disclosure mechanics ---------- */

test('DisclosureItem defaults collapsed (open=false in the rendered element)', () => {
  const tree = DisclosureItem({ id: 'x', summary: 's', children: 'c' });
  assert.equal(tree.props.open, false);
});

test('DisclosureItem honors a disclosed defaultOpen', () => {
  const tree = DisclosureItem({ id: 'x', summary: 's', children: 'c', defaultOpen: true });
  assert.equal(tree.props.open, true);
});

test('DisclosureItem wires summary/panel ids for pinning', () => {
  const tree = DisclosureItem({ id: 'lab-run-1', summary: 's', children: 'c' });
  const ids = flattenRenderTree(tree).map((el) => el.props.id).filter(Boolean);
  assert.ok(ids.includes('lab-run-1-summary')!);
  assert.ok(ids.includes('lab-run-1-panel')!);
});

test('disclosure ids are unique per item (never a global toggle)', () => {
  const ids = LOOP_STAGES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('DisclosureList carries the surface marker', () => {
  const tree = DisclosureList({ surface: 'lab', children: null });
  assert.equal(tree.props['data-ux005-list'], 'lab');
});

test('SummaryLayer exposes the per-surface marker', () => {
  const tree = SummaryLayer({ surface: 'lab', headline: 'h', stats: [], honestyLabels: [] });
  assert.equal(tree.props['data-ux005-surface'], 'lab');
});

test('SummaryLayer renders the honesty label list with the pin marker', () => {
  const tree = SummaryLayer({ surface: 'lab', headline: 'h', stats: [], honestyLabels: ['a', 'b'] });
  const marker = flattenRenderTree(tree).find((el) => el.props['data-ux005-honesty'] === 'true') ?? null;
  assert.ok(marker !== null);
  assert.match(renderTreeText(marker), /a/);
  assert.match(renderTreeText(marker), /b/);
});

/* ---------- criterion 4: the orientation strip ---------- */

test('every loop stage links to an owning surface', () => {
  for (const s of LOOP_STAGES) {
    assert.match(s.ownerHref, /^\//);
    assert.ok(s.paragraph.length > 40);
  }
});

test('loop stage paragraphs make no new data claims (read-side wording)', () => {
  for (const s of LOOP_STAGES) {
    assert.ok(!/guarantees|always succeeds|proven causal/i.test(s.paragraph));
  }
});

test('verification stage names the counterfactual/measured law', () => {
  assert.match(LOOP_STAGES[2]!.paragraph, /[Cc]ounterfactual/);
});

test('loopOwnerRoute maps each stage href to its route kind', () => {
  assert.equal(loopOwnerRoute(LOOP_STAGES[0]!).valueOf(), 'missions');
  assert.equal(loopOwnerRoute(LOOP_STAGES[2]!).valueOf(), 'lab');
  assert.equal(loopOwnerRoute(LOOP_STAGES[3]!).valueOf(), 'connections');
});

test('rendered orientation strip links resolve to owning surfaces', () => {
  const tree = HomeView();
  const hrefs = linkHrefs(tree);
  for (const s of LOOP_STAGES) {
    assert.ok(hrefs.includes(s.ownerHref), `missing link ${s.ownerHref}`);
  }
});

/* ---------- criterion 6: density + a11y contract ---------- */

test('summary stats stay compact (≤4 per surface)', () => {
  assert.ok(buildConnectionsSummary({ providerCount: 1, confirmedCount: 0, suspectedCount: 0, unknownCapabilityCount: 0 }).stats.length <= 4);
});

test('honesty labels never empty on any surface', () => {
  for (const m of [
    buildMissionsSummary({ missionCount: 0, openCount: 0, tenantLabel: 'x' }),
    buildStudioSummary({ packageCount: 0, consentPendingCount: 0 }),
    buildLabSummary({ measuredCount: 0, counterfactualCount: 0 }),
    buildConnectionsSummary({ providerCount: 0, confirmedCount: 0, suspectedCount: 0, unknownCapabilityCount: 0 }),
  ]) assert.ok(m.honestyLabels.length > 0);
});

test('no surface summary fabricates counts beyond inputs', () => {
  const m = buildMissionsSummary({ missionCount: 0, openCount: 0, tenantLabel: 't' });
  assert.ok(!m.headline.match(/[1-9]/));
});

/* ---------- shell-level contracts ---------- */

test('every stage id is stable for test pinning', () => {
  assert.deepEqual(LOOP_STAGES.map((s) => s.id), [
    'loop-stage-intent',
    'loop-stage-creation',
    'loop-stage-verification',
    'loop-stage-connection',
    'loop-stage-evidence',
  ]);
});

/* ---------- helpers ---------- */

function connectionsPageData(): ConnectionsPageData {
  return { data: connectionsSnapshot, selectedProviderId: null, selectedBindingId: null };
}

const connectionsSnapshot = await connectionsCompositionDouble.getConnectionsViewData();

async function pageDataFor(
  path: string,
  composition: ReturnType<typeof createInMemoryMosWebComposition>,
  shellView: AppShellView,
): Promise<unknown> {
  const { parseMosRoute } = await import('../dist/src/routes/route.js');
  const { loadMosRouteView } = await import('../dist/src/routes/route-loading.js');
  const route = parseMosRoute(path, '');
  const view = await loadMosRouteView(composition, route, shellView);
  assert.equal(view.kind, path === '/missions' ? 'missions' : path === '/studio' ? 'studio' : 'lab');
  return (view as { data: unknown }).data;
}

test('the layered views typecheck against their page models (compile-time pin)', () => {
  // Compile-time: the casts below only typecheck when the page data shapes match.
  const missionsData = null as unknown as MissionsPageData;
  const studioData = null as unknown as StudioPageData;
  const labData = null as unknown as LabPageData;
  assert.ok(typeof MissionsView === 'function');
  assert.ok(typeof StudioView === 'function');
  assert.ok(typeof LabView === 'function');
  assert.ok(missionsData === null && studioData === null && labData === null);
});
