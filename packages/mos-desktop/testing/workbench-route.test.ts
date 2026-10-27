import assert from 'node:assert/strict';
import { test } from 'node:test';

// The route helper is consumed through the package's BUILT dist (the
// testing-seam discipline: testing/*.test.ts and out/*.test.js sit at the
// same package depth, so '../dist/…' resolves identically from both).
import { workbenchSurfaceFromAppPath } from '../dist/routes/workbench-route.js';

/**
 * The AGENT WORKBENCH route helper (build-ON-ZCode, W35 emergence):
 * the pure path match deciding which SUBSTRATE surface a `/workbench*`
 * route names — `/workbench/new-task` and `/workbench/models` are NATIVE
 * console routes now (they resolve through the section mapping and
 * return null here). The entry hands substrate surfaces to the host
 * renderer's `onRequestSubstrateSurface` (see mos-desktop-entry.jsx).
 */
test('workbenchSurfaceFromAppPath resolves the substrate surface routes', () => {
  assert.equal(workbenchSurfaceFromAppPath('/workbench'), 'chat');
  assert.equal(workbenchSurfaceFromAppPath('/workbench/'), 'chat');
  assert.equal(workbenchSurfaceFromAppPath('workbench'), 'chat');
  assert.equal(workbenchSurfaceFromAppPath('/workbench/automations'), 'automations');
  assert.equal(workbenchSurfaceFromAppPath('/workbench/settings'), 'settings');
  // Trailing slashes and query strings are tolerated.
  assert.equal(workbenchSurfaceFromAppPath('/workbench/automations/'), 'automations');
  assert.equal(workbenchSurfaceFromAppPath('/workbench?focus=default'), 'chat');
  assert.equal(workbenchSurfaceFromAppPath('/workbench/settings?section=mcp'), 'settings');
});

test('workbenchSurfaceFromAppPath rejects non-workbench paths (MOS routes resolve normally)', () => {
  for (const path of ['/', '/missions', '/social', '/console', '/lab', '/studio']) {
    assert.equal(workbenchSurfaceFromAppPath(path), null, `${path} is not a workbench route`);
  }
  // The W35 emergence: the New Task page and Model Settings are NATIVE
  // console routes — the substrate matcher must NOT claim them.
  assert.equal(workbenchSurfaceFromAppPath('/workbench/new-task'), null);
  assert.equal(workbenchSurfaceFromAppPath('/workbench/models'), null);
  assert.equal(workbenchSurfaceFromAppPath('/workbench/new-task?draft=1'), null);
  // Near-misses must not match (explicit unknowns, never guesses).
  assert.equal(workbenchSurfaceFromAppPath('/workbench/unknown'), null);
  assert.equal(workbenchSurfaceFromAppPath('/workbenches'), null);
  assert.equal(workbenchSurfaceFromAppPath('/workbench/settingsx'), null);
  assert.equal(workbenchSurfaceFromAppPath('/workbench/new-tasks'), null);
  assert.equal(workbenchSurfaceFromAppPath('/workbench/new-task/extra'), null);
  assert.equal(workbenchSurfaceFromAppPath(''), null);
});
