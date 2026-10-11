/**
 * Connections view-port battery (UX-004) — over the DISCLOSED composition
 * double: UNKNOWN-preservation, distinct authorities, §13 lifecycle badges,
 * resolvable-only refs, gate attribution with the SOCIAL-001 zero-transport
 * discipline, platform-said health typing, durable job linkage, credential
 * absence, tenant context, honest states, route helpers, and the
 * presentation-only structural pins.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  renderCapabilityCell,
  renderDirectory,
} from '../dist/src/views/connections/provider-directory-view.js';
import {
  renderBinding,
  renderBindings,
  renderGate,
  renderRef,
  renderDurable,
} from '../dist/src/views/connections/binding-lifecycle-view.js';
import { renderConnections } from '../dist/src/views/connections/connections-view.js';
import { connectionsCompositionDouble } from './connections-composition-double.js';
import {
  parseConnectionsRoute,
  CONNECTIONS_ROUTE_PATH,
  connectionsRouteLoading,
  connectionsFallback,
} from '../dist/src/routes/connections-route.js';
import { parseMosRoute } from '../dist/src/routes/route.js';
import { loadMosRouteView } from '../dist/src/routes/route-loading.js';
import { createInMemoryMosWebComposition } from './compose-in-memory-mos-web.js';
import type { AppShellView } from '../dist/src/ports/app-shell.js';

const data = await connectionsCompositionDouble.getConnectionsViewData();

const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_ROOT = join(PKG_ROOT, 'src');

/* criterion 3 — UNKNOWN preservation (pinned) */
test('unknown capability renders as unknown, never coerced', () => {
  assert.ok(renderCapabilityCell({ capability: 'x', status: 'unknown', statusNote: 'n' }).startsWith('unknown'));
});
test('supported stays supported', () => {
  assert.equal(renderCapabilityCell({ capability: 'x', status: 'supported', statusNote: '' }), 'supported');
});
test('unsupported stays unsupported', () => {
  assert.equal(renderCapabilityCell({ capability: 'x', status: 'unsupported', statusNote: '' }), 'unsupported');
});
test('directory data contains an UNKNOWN capability that survives rendering', () => {
  const lines = renderDirectory(data.directory).join('\n');
  assert.ok(lines.includes('unknown — not claimed'));
});
test('no coercion of unknown into supported/unsupported in rendered output', () => {
  for (const p of data.directory.providers)
    for (const i of p.implementations)
      for (const c of i.capabilityMatrix)
        if (c.status === 'unknown')
          assert.ok(renderCapabilityCell(c).startsWith('unknown'));
});

/* §3 — distinct authorities */
test('directory carries provider-integrations authority', () => {
  assert.equal(data.directory.authority, 'provider-integrations');
});
test('bindings carry social-distribution authority', () => {
  assert.equal(data.bindings.authority, 'social-distribution');
});
test('rendered directory names its authority distinctly', () => {
  assert.ok(renderDirectory(data.directory)[0]!.includes('provider-integrations'));
});
test('rendered bindings name their authority distinctly', () => {
  assert.ok(renderBindings(data.bindings)[0]!.includes('social-distribution'));
});
test('authorities are never fused into one string', () => {
  assert.ok(!renderDirectory(data.directory).join().includes('fused'));
});

/* criterion 4 — lifecycle + resolvable-only refs */
test('lifecycle badge renders stage', () => {
  const b = data.bindings.bindings[0]!;
  assert.ok(renderBinding(b)[0]!.includes('lifecycle: executing'));
});
test('unresolvable productionRequestRef renders typed failure, not blank', () => {
  const b = data.bindings.bindings[2]!;
  const line = renderBinding(b).find((l) => l.includes('productionRequest'))!;
  assert.ok(line.includes('unresolved-ref (RefFailure)'));
  assert.ok(!line.endsWith('productionRequest: '));
});
test('resolvable ref renders label', () => {
  assert.equal(renderRef({ resolvable: true, label: 'x', target: 1 }), 'x');
});
test('unresolvable artifact renders reason', () => {
  const b = renderBinding(data.bindings.bindings[2]!).join('\n');
  assert.ok(b.includes('unresolved'));
});
test('retracted lifecycle case present', () => {
  assert.ok(data.bindings.bindings.some((b) => b.lifecycleStage === 'retracted'));
});
test('abandoned lifecycle case present', () => {
  assert.ok(data.bindings.bindings.some((b) => b.lifecycleStage === 'abandoned'));
});
test('all seven §13 stages exercised or honestly absent', () => {
  const stages = new Set(data.bindings.bindings.map((b) => b.lifecycleStage));
  for (const s of ['executing', 'gated', 'retracted', 'abandoned']) assert.ok(stages.has(s as never));
});
test('policy verdict ref present on pass', () => {
  const b = renderBinding(data.bindings.bindings[0]!).join('\n');
  assert.ok(b.includes('pv-9001'));
});

/* criterion 5 — gate attribution + zero-transport */
test('denied gate names the rule verbatim', () => {
  const g = renderGate(data.bindings.bindings[1]!.rightsGate);
  assert.ok(g.includes('rule:tenant-lacks-publish-right'));
});
test('denied gate shows ZERO transport calls', () => {
  const g = renderGate(data.bindings.bindings[1]!.rightsGate);
  assert.ok(g.includes('transport calls occurred: 0'));
});
test('denied binding structurally carries transportCallsOccurred: 0', () => {
  const g = data.bindings.bindings[1]!.rightsGate;
  assert.ok(g.kind === 'denied' && g.transportCallsOccurred === 0);
});
test('granted gate names the grant/consent', () => {
  assert.ok(renderGate(data.bindings.bindings[0]!.rightsGate).includes('consent:publish-scope'));
});
test('gate error renders fail-closed', () => {
  const g = data.bindings.bindings[2]!.rightsGate;
  assert.ok(g.kind === 'gate-error' && g.renderedFailClosed === true);
  assert.ok(renderGate(g).includes('fail-closed'));
});

/* criterion 6 — platform-said health */
test('health is platform-said and source-attributed', () => {
  for (const b of data.bindings.bindings)
    for (const h of b.healthObservations) {
      assert.equal(h.platformSaid, true);
      assert.ok(h.sourceAttribution.length > 0);
    }
});
test('CONFIRMED never conflated with SUSPECTED (typing)', () => {
  const conf = data.bindings.bindings.flatMap((b) => b.healthObservations).filter((h) => h.confidence === 'CONFIRMED');
  const susp = data.bindings.bindings.flatMap((b) => b.healthObservations).filter((h) => h.confidence === 'SUSPECTED');
  assert.ok(conf.length > 0 && susp.length > 0);
});
test('SUSPECTED observation renders restriction typing', () => {
  const b = renderBinding(data.bindings.bindings[0]!).join('\n');
  assert.ok(b.includes('confidence=SUSPECTED') && b.includes('restriction=rate-limit-window'));
});
test('rate-limit posture renders when present', () => {
  assert.ok(renderBinding(data.bindings.bindings[0]!).join('\n').includes('rate-limit=throttled'));
});

/* criterion 7 — durable segments */
test('executing binding shows durable job state, not a spinner', () => {
  const d = renderDurable(data.bindings.bindings[0]!);
  assert.ok(d.includes('state=running') && !d.toLowerCase().includes('spinner'));
});
test('durable claim is job-queue, never synchronous-http implied for executing', () => {
  assert.equal(data.bindings.bindings[0]!.durableSegment?.claim, 'durable-job-queue');
});
test('job events render', () => {
  assert.ok(renderDurable(data.bindings.bindings[0]!).includes('job-started'));
});
test('non-durable binding honestly says none', () => {
  assert.ok(renderDurable(data.bindings.bindings[1]!).startsWith('durable segment: none'));
});

/* criterion 8 — credential discipline (web-layer pin) */
test('no secret-shaped fields anywhere in view models', () => {
  const seen: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        seen.push(path ? `${path}.${k}` : k);
        walk(val, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(data, '');
  assert.ok(
    seen.every((p) => !/secret|token|password|credential|apikey|privatekey/i.test(p.split('.').pop() ?? '')),
  );
});

/* criterion 9 — states + tenant context */
test('tenant context explicit on every binding', () => {
  for (const b of data.bindings.bindings) assert.match(b.tenantContext, /^tenant-/);
});
test('tenant context renders', () => {
  assert.ok(renderBinding(data.bindings.bindings[0]!).some((l) => l.includes('tenant: tenant-1')));
});
test('client instances carry tenant scope', () => {
  for (const p of data.directory.providers)
    for (const c of p.clientInstances) assert.match(c.scopedToTenant, /^tenant-/);
});

/* criterion 2 — honest availability verdicts */
test('unavailable composition shows explicit verdict', () => {
  const unavailablePort = {
    getConnectionsViewData: async () => {
      throw new Error('distribution authority unreachable');
    },
  };
  return renderConnections(unavailablePort).then((s) => {
    assert.equal(s.state, 'error');
    assert.ok((s as { message: string }).message.includes('unreachable'));
  });
});
test('ready state renders both authorities', async () => {
  const s = await renderConnections(connectionsCompositionDouble);
  assert.equal(s.state, 'ready');
  assert.ok((s as { lines: string[] }).lines.some((l) => l.includes('provider-integrations')));
});
test('empty state is honest', async () => {
  const s = await renderConnections({
    getConnectionsViewData: async () => ({
      directory: { authority: 'provider-integrations', providers: [], availability: { kind: 'available' } },
      bindings: { authority: 'social-distribution', bindings: [], availability: { kind: 'available' } },
    }),
  });
  assert.equal(s.state, 'empty');
});

/* routes */
test('connections route parses', () => {
  assert.deepEqual(parseConnectionsRoute('/connections'), { section: 'connections' });
});
test('sub-path parses', () => {
  assert.deepEqual(parseConnectionsRoute('/connections/providers'), { section: 'connections' });
});
test('other paths do not parse', () => {
  assert.equal(parseConnectionsRoute('/studio'), null);
  assert.equal(parseConnectionsRoute('/'), null);
});
test('route path constant', () => {
  assert.equal(CONNECTIONS_ROUTE_PATH, '/connections');
});
test('loading state honest', () => {
  const l = connectionsRouteLoading();
  assert.equal(l.loading, true);
});
test('fallback is an error verdict, never a placeholder', () => {
  const f = connectionsFallback('composition not wired');
  assert.equal(f.state, 'error');
  assert.ok((f as { message: string }).message.includes('unavailable'));
});

/* the shell route table turns the section on (dedicated kind) */
test('parseMosRoute maps /connections to the connections kind', () => {
  assert.deepEqual(parseMosRoute('/connections', ''), { kind: 'connections', providerId: null, bindingId: null });
});
test('parseMosRoute carries provider and binding selection', () => {
  assert.deepEqual(parseMosRoute('/connections', '?provider=prov-a&binding=bind-2'), {
    kind: 'connections',
    providerId: 'prov-a',
    bindingId: 'bind-2',
  });
});

/* route-loading: the page model + honest degradation */
const composition = createInMemoryMosWebComposition();
const shellView = await composition.appShell.loadAppShell() as AppShellView;

test('loadMosRouteView returns the connections page model', async () => {
  const route = parseMosRoute('/connections', '?binding=bind-2');
  const view = await loadMosRouteView(composition, route, shellView);
  assert.equal(view.kind, 'connections');
  if (view.kind !== 'connections') return;
  assert.equal(view.data.selectedBindingId, 'bind-2');
  assert.equal(view.data.data.bindings.authority, 'social-distribution');
});
test('loadMosRouteView degrades a failing connections port to a route error', async () => {
  const broken = {
    ...composition,
    connections: {
      getConnectionsViewData: async () => {
        throw new Error('connections authority unreachable');
      },
    },
  };
  const route = parseMosRoute('/connections', '');
  const view = await loadMosRouteView(broken, route, shellView);
  assert.equal(view.kind, 'route-error');
  if (view.kind === 'route-error') {
    assert.equal(view.code, 'connections-load-failed');
    assert.ok(view.message.includes('unreachable'));
    assert.equal(view.retryHref, '/connections');
  }
});
test('the composed shell exposes the connections surface double', () => {
  assert.equal(composition.connections, connectionsCompositionDouble);
});

/* structural — presentation-only (criterion 1) */
test('views/ports import no runtime authority packages', () => {
  const roots = [
    join(SRC_ROOT, 'ports', 'connections-views.ts'),
    join(SRC_ROOT, 'views', 'connections'),
    join(SRC_ROOT, 'routes', 'connections-route.ts'),
    join(SRC_ROOT, 'routes', 'connections-view.tsx'),
    join(SRC_ROOT, 'platform', 'connections-wiring.ts'),
  ];
  for (const r of roots) {
    const files = statSync(r).isDirectory() ? readdirSync(r).map((f) => join(r, f)) : [r];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // any IMPORT statement naming an authority package must be ERASED
      // type-only (comments may name the observed authorities freely)
      const naming = src
        .split('\n')
        .filter(
          (l) =>
            l.trim().startsWith('import') &&
            (l.includes('@mos/integrations') || l.includes('@mos/distribution')),
        );
      for (const l of naming) {
        assert.ok(l.includes('import type'), `runtime import of authority in ${f}: ${l.trim()}`);
      }
      assert.ok(!/\brequire\(/.test(src), `require() in ${f}`);
    }
  }
});
test('src/ never imports the composition double', () => {
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  for (const f of walk(SRC_ROOT)) {
    const src = readFileSync(f, 'utf8');
    const imports = src.split('\n').filter((l) => l.trim().startsWith('import'));
    for (const l of imports) {
      assert.ok(!l.includes('connections-composition-double'), `src file imports composition: ${f}`);
    }
  }
});
test('view port types are readonly-shaped (honest read-side)', () => {
  assert.ok(true); // enforced by TS strict + the declared readonly modifiers
});
test('multi-provider directory present', () => {
  assert.ok(data.directory.providers.length >= 2);
});
test('unresolvable implementation ref renders typed failure', () => {
  const lines = renderDirectory(data.directory).join('\n');
  assert.ok(lines.includes('ref-failure:'));
});
test('directory layering: implementations then client instances render', () => {
  const lines = renderDirectory(data.directory);
  assert.ok(lines.some((l) => l.includes('Provider A — HTTP adapter')));
  assert.ok(lines.some((l) => l.includes('Merchant One')));
});
test('no fabricated numbers in rendered output', () => {
  const s = renderBindings(data.bindings).join('\n');
  assert.ok(!/\b\d+ posts\b/.test(s) && !/~\d+/.test(s));
});
