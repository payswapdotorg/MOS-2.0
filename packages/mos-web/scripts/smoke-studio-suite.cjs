'use strict';

// UX-002 regression suite for the MOS browser smoke (see browser-smoke.cjs
// for the driver and the disclosed .cjs rationale). Home chrome verdicts +
// the Studio surface: session directory, §15 consent states, §30 review
// attribution, §14 synthetic labels, §19 immutable version chains, and the
// standing no-publish/read-only pins.

module.exports.runStudioSuite = async function runStudioSuite(page, baseUrl, check) {
  // 1. Home: the shell boots and the Studio section is ON.
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  check('home renders the shell (header present)', (await page.locator('header').count()) > 0);
  const studioNav = page.locator('[data-testid="nav-studio"]');
  check(
    'nav-studio is an ENABLED link (UX-002 turned the section on)',
    (await studioNav.count()) === 1 && (await studioNav.getAttribute('aria-disabled')) === null,
  );
  check('nav-studio href is /studio', (await studioNav.getAttribute('href')) === '/studio');
  const labNav = page.locator('[data-testid="nav-lab"]');
  check(
    'nav-lab is an ENABLED link (UX-003 turned the section on)',
    (await labNav.count()) === 1 && (await labNav.getAttribute('aria-disabled')) === null,
  );
  check('nav-lab href is /lab', (await labNav.getAttribute('href')) === '/lab');
  check(
    'nav-connections still renders its not-yet-available verdict (UX-004 untouched)',
    (await page.locator('[data-testid="nav-connections-unavailable"]').count()) === 1,
  );

  // 2. Studio section: the session directory.
  await studioNav.click();
  await page.waitForLoadState('networkidle');
  check('studio route reached', page.url().includes('/studio'));
  const sessionRows = page.locator('[data-testid="studio-sessions-list"] > li');
  check('the session directory lists the fixture sessions (11)', (await sessionRows.count()) === 11);
  for (const state of [
    'requested',
    'loading',
    'capturing',
    'processing',
    'review',
    'packaged',
    'closed',
    'abandoned',
    'failed',
  ]) {
    check(
      `lifecycle badge "${state}" is visible`,
      (await page.locator('[data-testid^="studio-session-state-"]').filter({ hasText: state }).count()) >= 1,
    );
  }
  check(
    'tenant context is displayed (§31)',
    (await page.locator('[data-testid="tenant-context-name"]').count()) === 1,
  );
  check(
    'the standing hand-off disclosure renders',
    (await page.locator('[data-testid="studio-handoff-note"]').textContent()).includes('never publishes'),
  );

  // 3. Session detail: §15 participants, §30 review, lifecycle history.
  await page.click('[data-testid="studio-session-row-session-reaction-1"]');
  await page.waitForLoadState('networkidle');
  check('session detail URL carries ?session=', page.url().includes('session=session-reaction-1'));
  check(
    'the session detail panel renders',
    (await page.locator('[data-testid="studio-session-detail"]').count()) === 1,
  );
  check(
    '§15 participants render with account boundaries',
    (await page.locator('[data-testid^="studio-participant-participant-"]').count()) === 2,
  );
  check(
    'consent badges render (granted)',
    (await page.locator('[data-testid="studio-consent-state-granted"]').count()) >= 2,
  );
  check(
    '§30 review record attributes the decision',
    (await page.locator('[data-testid="studio-review-record"]').textContent()).includes(
      'Studio operator identity-operator-1',
    ),
  );
  check(
    'lifecycle history renders',
    (await page.locator('[data-testid="studio-transitions"]').count()) === 1,
  );

  // 4. The §15 consent-required verdict as an actionable state.
  await page.goto(`${baseUrl}/studio?session=session-reaction-4`, { waitUntil: 'networkidle' });
  const requirement = page.locator(
    '[data-testid="studio-consent-required-identity-source-holder-2"]',
  );
  check(
    'the consent-required verdict renders as an alert (§15)',
    (await requirement.count()) === 1 && (await requirement.getAttribute('role')) === 'alert',
  );
  check(
    'the consent-required panel names the imported-source holder',
    (await requirement.textContent()).includes('identity-source-holder-2'),
  );

  // 5. The pending §15 state on the multi-account review session.
  await page.goto(`${baseUrl}/studio?session=session-podcast-1`, { waitUntil: 'networkidle' });
  check(
    'the pending consent state renders (§15 waiting)',
    (await page.locator('[data-testid="studio-consent-state-pending"]').count()) === 1,
  );

  // 6. Package library + the immutable version chain (§14 + §19 + §30).
  await page.goto(`${baseUrl}/studio`, { waitUntil: 'networkidle' });
  check(
    'the package library lists the chain summaries',
    (await page.locator('[data-testid="studio-packages-list"] > li').count()) === 2,
  );
  await page.click('[data-testid="studio-package-row-pkg-reaction-1"]');
  await page.waitForLoadState('networkidle');
  check('the chain route carries ?package=', page.url().includes('package=pkg-reaction-1'));
  check(
    'the chain panel renders',
    (await page.locator('[data-testid="studio-package-chain"]').count()) === 1,
  );
  check(
    'both immutable versions render (v1 → v2)',
    (await page.locator('[data-testid="studio-package-version-pkg-reaction-1-v1"]').count()) === 1 &&
      (await page.locator('[data-testid="studio-package-version-pkg-reaction-1-v2"]').count()) === 1,
  );
  check(
    '§14 synthetic disclosure is visible on the version',
    (await page.locator('[data-testid="studio-synthetic-disclosure"]').count()) === 2,
  );
  check(
    '§14 synthetic mark labels the engine-generated artifact (in both chain versions)',
    (await page.locator('[data-testid="studio-synthetic-mark"]').count()) === 2,
  );
  check(
    '§30 evaluation citation renders',
    (await page.locator('[data-testid="studio-package-evaluation-ref"]').first().textContent()).includes(
      'mos-studio:review:1',
    ),
  );
  check(
    '§15 consent coverage renders',
    (await page.locator('[data-testid="studio-package-consent"]').first().textContent()).includes(
      'all raw artifacts covered',
    ),
  );
  const chainText = await page.locator('[data-testid="studio-package-chain"]').textContent();
  check(
    'the chain narrates immutable treatment lineage (§19)',
    chainText.includes('predecessors are never rewritten'),
  );
  await page.goto(`${baseUrl}/studio?package=pkg-podcast-3`, { waitUntil: 'networkidle' });
  check(
    'the human-only chain discloses NO synthetic material',
    (await page.locator('[data-testid="studio-no-synthetic-disclosure"]').count()) === 1 &&
      (await page.locator('[data-testid="studio-synthetic-disclosure"]').count()) === 0,
  );

  // 7. NO publish controls on the studio surface (read-only).
  const buttonCount = await page.locator('main button').count();
  check(
    'NO buttons (publish/operator controls) on the studio surface',
    buttonCount === 0,
    `found ${buttonCount}`,
  );
};
