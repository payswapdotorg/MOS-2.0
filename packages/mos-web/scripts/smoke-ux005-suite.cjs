'use strict';

// UX-005 suite for the MOS browser smoke (see browser-smoke.cjs for the
// driver and the disclosed .cjs rationale). The progressive-disclosure
// layer: every PRODUCT surface renders its summary layer with honesty
// labels; the disclosure MECHANICS (collapsed defaults, keyboard Enter,
// honesty surviving expansion) are driven where disclosures live in the
// default state — the Connections rows and the Home orientation strip;
// selected-detail disclosures are exercised through their routes.

module.exports.runUx005Suite = async function runUx005Suite(page, baseUrl, check) {
  // 1. Every product surface: the summary layer + honesty labels render.
  for (const href of ['/missions', '/studio', '/lab', '/connections']) {
    await page.goto(`${baseUrl}${href}`, { waitUntil: 'networkidle' });
    check(
      `ux005: summary layer present on ${href}`,
      (await page.locator('[data-ux005-surface]').count()) === 1,
    );
    const honesty = await page.locator('[data-ux005-honesty]').first().textContent();
    check(
      `ux005: honesty labels visible on ${href}`,
      honesty !== null && honesty.trim().length > 0,
    );
  }

  // 2. The Lab law at every level: counterfactual + measured ride the summary.
  await page.goto(`${baseUrl}/lab`, { waitUntil: 'networkidle' });
  const labHonesty = await page.locator('[data-ux005-honesty]').textContent();
  check(
    'ux005: the Lab counterfactual + measured labels ride the summary layer',
    labHonesty.includes('Counterfactual') && labHonesty.includes('Measured'),
  );

  // 3. The Connections honesty set rides its summary layer.
  await page.goto(`${baseUrl}/connections`, { waitUntil: 'networkidle' });
  const connectionsHonesty = await page.locator('[data-ux005-honesty]').textContent();
  check(
    'ux005: platform-said + UNKNOWN + zero-transport notes ride the connections summary',
    connectionsHonesty.includes('platform-said') &&
      connectionsHonesty.includes('UNKNOWN') &&
      connectionsHonesty.includes('zero-transport'),
  );

  // 4. Disclosure mechanics on the Connections rows (default-collapsed,
  //    per-item, keyboard-operable, honesty survives expansion).
  const closedRows = page.locator('details.ux005-disclosure-item:not([open])');
  check(
    'ux005: connections rows default collapsed',
    (await closedRows.count()) >= 4,
  );
  await page.locator('details.ux005-disclosure-item > summary').first().focus();
  await page.keyboard.press('Enter');
  check(
    'ux005: Enter opens a disclosure (native summary is keyboard-operable)',
    await page.evaluate(() => {
      const el = document.activeElement;
      const host = el === null ? null : el.closest('details');
      return host !== null && host.open === true;
    }),
  );
  const honestyAfter = await page.locator('[data-ux005-honesty]').first().textContent();
  check(
    'ux005: honesty labels still present after expansion',
    honestyAfter !== null && honestyAfter.trim().length > 0,
  );

  // 5. A selected binding expands its lifecycle detail disclosure (the
  //    zero-transport gate attribution renders INSIDE the disclosure).
  await page.goto(`${baseUrl}/connections?binding=bind-2`, { waitUntil: 'networkidle' });
  const bind2 = page.locator('[data-ux005-item="ux005-binding-bind-2"]');
  check(
    'ux005: the selected binding detail disclosure renders expanded',
    (await bind2.count()) === 1 && (await bind2.getAttribute('open')) !== null,
  );
  check(
    'ux005: the zero-transport attribution survives inside the expanded detail',
    (await bind2.textContent()).includes('transport calls occurred: 0'),
  );

  // 6. The Home orientation strip: five stages, expandable, linking owners.
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  const stageCount = await page.locator('[data-ux005-item^="loop-stage-"]').count();
  check('ux005: the orientation strip carries all five stages', stageCount === 5);
  await page.locator('[data-ux005-item="loop-stage-verification"] > summary').click();
  const verification = page.locator('[data-ux005-item="loop-stage-verification"]');
  check(
    'ux005: expanding the verification stage reveals its paragraph + owner link',
    (await verification.textContent()).includes('never presents a counterfactual as a measurement') &&
      (await verification.locator('a').getAttribute('href')) === '/lab',
  );

  // 7. The Lab selected digest renders as an expanded disclosure carrying
  //    the counterfactual badge law inside.
  await page.goto(`${baseUrl}/lab?benchmark=bench-reach-v1`, { waitUntil: 'networkidle' });
  const digest = page.locator('[data-ux005-item="ux005-lab-digest"]');
  check(
    'ux005: the selected benchmark digest renders as an expanded disclosure',
    (await digest.count()) === 1 && (await digest.getAttribute('open')) !== null,
  );
  check(
    'ux005: the digest disclosure carries the counterfactual badge inside',
    (await digest.textContent()).includes('Counterfactual'),
  );

  // 8. 390px no-horizontal-scroll discipline over the layered surfaces.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const href of ['/connections', '/lab']) {
    await page.goto(`${baseUrl}${href}`, { waitUntil: 'networkidle' });
    check(
      `ux005: no horizontal scroll at 390px on ${href}`,
      await page.evaluate(() => document.documentElement.scrollWidth <= 392),
    );
  }
  await page.setViewportSize({ width: 1280, height: 800 });
};
