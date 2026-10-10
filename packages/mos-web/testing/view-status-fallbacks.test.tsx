/**
 * Status + fallback render tests (UX-001) — render-LEVEL only (static
 * render-tree walk, no DOM, no browser claim; full browser acceptance is
 * UX-006). Covers the bootstrap-pattern surfaces: loading, bootstrap-error,
 * app-error, route-error, section-not-available, unknown-route and the
 * no-tenant-context fallback. Every fallback names exactly what failed and
 * offers the honest action — never placeholder content (plan §4 risk 5).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MosAppErrorView,
  MosBootstrapErrorView,
  MosLoadingView,
  MosNoTenantContextView,
  MosRouteErrorView,
  MosSectionNotAvailableView,
  MosUnknownRouteView,
} from '../dist/src/index.js';
import { elementWithTestId, elementsWithTag, linkHrefs, renderTreeText } from './render-tree.js';
import { SECTIONS } from './view-fixtures.js';

test('the loading view marks itself busy for assistive technology', () => {
  const tree = <MosLoadingView label="Loading the MOS surface…" />;
  const loading = elementWithTestId(tree, 'mos-loading');
  assert.ok(loading);
  assert.equal(loading.props.role, 'status');
  assert.equal(loading.props['aria-live'], 'polite');
  assert.equal(loading.props['aria-busy'], 'true');
});

test('the bootstrap error screen is an alert whose only action is retry', () => {
  let retried = 0;
  const tree = (
    <MosBootstrapErrorView message="app-shell unavailable" onRetry={() => { retried += 1; }} />
  );
  const alert = elementWithTestId(tree, 'mos-bootstrap-error');
  assert.ok(alert);
  assert.equal(alert.props.role, 'alert');
  const buttons = elementsWithTag(tree, 'button');
  assert.equal(buttons.length, 1);
  const retry = buttons[0];
  assert.ok(retry);
  const onRetry = retry.props.onClick as () => void;
  assert.equal(typeof onRetry, 'function');
  onRetry();
  assert.equal(retried, 1);
  assert.equal(renderTreeText(tree).includes('MOS failed to start'), true);
});

test('the app error view is an alert with a reload action', () => {
  const tree = <MosAppErrorView message="render exploded" onRetry={() => undefined} />;
  const alert = elementWithTestId(tree, 'mos-app-error');
  assert.ok(alert);
  assert.equal(alert.props.role, 'alert');
  assert.equal(renderTreeText(tree).includes('This view failed to render'), true);
});

test('the route-error view names the failure code and offers the retry link', () => {
  const tree = (
    <MosRouteErrorView
      code="mission-catalog-unavailable"
      message="catalog service failed"
      retryHref="/missions"
    />
  );
  const alert = elementWithTestId(tree, 'route-error');
  assert.ok(alert);
  assert.equal(alert.props.role, 'alert');
  const text = renderTreeText(tree);
  assert.equal(text.includes('mission-catalog-unavailable'), true);
  assert.equal(text.includes('catalog service failed'), true);
  assert.equal(linkHrefs(tree).includes('/missions'), true);
});

test('the not-yet-available section view names what it waits for', () => {
  const connectionsSection = SECTIONS.find((section) => section.id === 'connections');
  assert.ok(connectionsSection);
  const tree = <MosSectionNotAvailableView section={connectionsSection} />;
  const panel = elementWithTestId(tree, 'section-connections-not-available');
  assert.ok(panel);
  const text = renderTreeText(panel ?? tree);
  assert.equal(text.includes('not yet available'), true);
  assert.equal(text.includes('UX-004'), true);
  assert.equal(linkHrefs(tree).includes('/'), true, 'back to Home is offered');
});

test('the unknown-route view is explicit, never a silent fallback', () => {
  const tree = <MosUnknownRouteView path="/admin" />;
  const alert = elementWithTestId(tree, 'unknown-route');
  assert.ok(alert);
  assert.equal(alert.props.role, 'alert');
  assert.equal(renderTreeText(tree).includes('/admin'), true);
  assert.equal(linkHrefs(tree).includes('/'), true);
});

test('the no-tenant view explains the §31 scoping refusal', () => {
  const tree = <MosNoTenantContextView />;
  const panel = elementWithTestId(tree, 'missions-no-tenant');
  assert.ok(panel);
  assert.equal(
    renderTreeText(panel ?? tree).includes('tenant/workspace scoped'),
    true,
  );
});
