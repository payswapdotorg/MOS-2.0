'use strict';

// UX-004 suite for the MOS browser smoke (see browser-smoke.cjs for the
// driver and the disclosed .cjs rationale). The Connections surface: the
// provider directory with UNKNOWN-preserved capability cells, the distinct
// authorities note, the distribution binding lifecycle view with the
// zero-transport gate attribution, platform-said health, durable job
// linkage, and the provider/binding selection flows.

module.exports.runConnectionsSuite = async function runConnectionsSuite(page, baseUrl, check) {
  // 1. The Connections section turns on honestly: route + chrome + both
  //    DISTINCT authority headings render.
  await page.goto(`${baseUrl}/connections`, { waitUntil: 'networkidle' });
  check('connections route reached', page.url().includes('/connections'));
  check(
    'the shell chrome names the Connections section',
    (await page.locator('header a[href="/connections"], header [data-testid*="connections-nav"]').count()) +
      (await page.locator('nav a[href="/connections"]').count()) >
      0,
  );
  const authoritiesNote = await page
    .locator('[data-testid="connections-authorities-note"]')
    .textContent();
  check(
    'the two DISTINCT authorities are named, never fused',
    authoritiesNote.includes('provider-integrations') && authoritiesNote.includes('social-distribution'),
  );

  // 2. Provider directory (the four-layer machinery): providers render with
  //    implementations + client instances; UNKNOWN capabilities preserved.
  const providerRows = page.locator('[data-testid="connections-providers-list"] > li');
  check('the provider directory lists the fixture providers (2)', (await providerRows.count()) === 2);
  const provAText = await page.locator('[data-testid="connections-provider-prov-a"]').textContent();
  check(
    'implementations and client instances render per provider (four-layer browsing)',
    provAText.includes('Provider A — HTTP adapter') && provAText.includes('Merchant One'),
  );
  const capabilities = await page
    .locator('[data-testid="connections-capabilities-impl-a1"]')
    .textContent();
  check(
    'UNKNOWN capability renders as unknown — never coerced',
    capabilities.includes('unknown — not claimed'),
  );
  check(
    'capability statuses render verbatim (supported stays supported)',
    capabilities.includes('supported'),
  );
  const provBText = await page.locator('[data-testid="connections-provider-prov-b"]').textContent();
  check(
    'the unresolvable implementation ref renders a typed failure, never a blank',
    provBText.includes('ref-failure:'),
  );

  // 3. Open a provider directory entry (selection flow).
  await page.click('[data-testid="connections-provider-link-prov-a"]');
  await page.waitForLoadState('networkidle');
  check('the provider selection carries ?provider=', page.url().includes('provider=prov-a'));
  check(
    'the selected provider entry highlights honestly',
    (await page.locator('[data-testid="connections-provider-prov-a"][class*="emerald"]').count()) === 1,
  );

  // 4. Distribution bindings: the directory listing with §13 lifecycle badges.
  await page.goto(`${baseUrl}/connections`, { waitUntil: 'networkidle' });
  const bindingRows = page.locator('[data-testid="connections-bindings-list"] > li');
  check('the binding directory lists the fixture bindings (4)', (await bindingRows.count()) === 4);
  const executing = await page
    .locator('[data-testid="connections-binding-lifecycle-bind-1"]')
    .textContent();
  check('the executing binding carries its §13 lifecycle badge', executing.includes('lifecycle: executing'));
  const gated = await page
    .locator('[data-testid="connections-binding-lifecycle-bind-2"]')
    .textContent();
  check('the gated binding carries its badge', gated.includes('lifecycle: gated'));
  const retracted = await page
    .locator('[data-testid="connections-binding-lifecycle-bind-3"]')
    .textContent();
  check('the retracted lifecycle case is present', retracted.includes('lifecycle: retracted'));
  const abandoned = await page
    .locator('[data-testid="connections-binding-lifecycle-bind-4"]')
    .textContent();
  check('the abandoned lifecycle case is present', abandoned.includes('lifecycle: abandoned'));

  // 5. Open the binding lifecycle view (the denied binding — the SOCIAL-001
  //    zero-transport discipline made visible).
  await page.click('[data-testid="connections-binding-link-bind-2"]');
  await page.waitForLoadState('networkidle');
  check('the binding selection carries ?binding=', page.url().includes('binding=bind-2'));
  const detail = await page.locator('[data-testid="connections-binding-detail-bind-2"]').textContent();
  check(
    'the gate verdict names the rule verbatim (attribution)',
    detail.includes('rule:tenant-lacks-publish-right'),
  );
  check(
    'the denial shows ZERO transport calls occurred (SOCIAL-001 visible)',
    detail.includes('transport calls occurred: 0'),
  );
  check(
    'the production request ref renders resolvable-only',
    detail.includes('pr-102'),
  );
  check(
    'the policy verdict renders with its named constraint',
    detail.includes('gate-error') && detail.includes('unreached'),
  );

  // 6. The executing binding detail: durable job linkage + platform-said health.
  await page.click('[data-testid="connections-binding-link-bind-1"]');
  await page.waitForLoadState('networkidle');
  const executingDetail = await page
    .locator('[data-testid="connections-binding-detail-bind-1"]')
    .textContent();
  check(
    'the durable segment shows job state, never a spinner (§26)',
    executingDetail.includes('state=running') && executingDetail.includes('durable-job-queue'),
  );
  check(
    'health renders platform-said, source-attributed (HEALTH-001)',
    executingDetail.includes('platform-said') && executingDetail.includes('confidence='),
  );
  check(
    'SUSPECTED never conflated with CONFIRMED (typed separately)',
    executingDetail.includes('confidence=SUSPECTED') && executingDetail.includes('restriction=rate-limit-window'),
  );
  check(
    'the rate-limit posture renders per the social-rate-limit contract',
    executingDetail.includes('rate-limit=throttled'),
  );

  // 7. An unresolvable selection degrades honestly (typed failure, no guess).
  await page.goto(`${baseUrl}/connections?binding=bind-404`, { waitUntil: 'networkidle' });
  check(
    'an unknown binding selection renders the explicit selection error',
    (await page.locator('[data-testid="connections-binding-selection-error"]').count()) === 1,
  );
};
