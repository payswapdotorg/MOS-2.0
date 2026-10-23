'use strict';

// The UXR social wave suite for the MOS browser smoke (see
// browser-smoke.cjs for the driver and the disclosed .cjs rationale). The
// Social Media workspace: the five-platform picker over the frozen
// provider profiles, the honest three-state capability verdicts (unknown
// never coerced), the guided-setup checklist with honest step states, the
// guided browser pane's NON-ELECTRON fallback (the browser shell renders
// the honest verdict + the secure external link — never a decorative
// webview frame), the simulation SANDBOX labels verbatim, and the
// setup-details form's create-mission INTENT declaration over the demo
// composition (the receipt renders on the Missions surface — the existing
// outcome panel idiom).

module.exports.runSocialSuite = async function runSocialSuite(page, baseUrl, check) {
  // 1. The Social Media section turns on honestly: route + chrome + the
  //    workspace header over the default (YouTube) platform.
  await page.goto(`${baseUrl}/social`, { waitUntil: 'networkidle' });
  check('social route reached', page.url().includes('/social'));
  check(
    'the shell chrome names the Social Media section',
    (await page.locator('nav a[href="/social"]').count()) === 1,
  );
  const heading = await page.locator('[data-testid="social-workspace-heading"]').textContent();
  check(
    'the YouTube workspace heading renders (the default platform)',
    heading.includes('Set up your YouTube workspace'),
  );
  const distinction = await page
    .locator('[data-testid="social-distinction-body"]')
    .textContent();
  check(
    'the Important distinction callout states the connect-vs-simulate boundary verbatim',
    distinction.includes('different from simulating strategy outcomes') &&
      distinction.includes('No content is published in this setup flow'),
  );

  // 2. The platform picker rail: five platforms, YouTube selected.
  const railRows = page.locator('[data-testid="social-platform-rail"] a');
  check('the platform rail lists all five platforms', (await railRows.count()) === 5);
  const youtubeSummary = await page
    .locator('[data-testid="social-platform-summary-youtube"]')
    .textContent();
  check(
    'the rail summary derives honestly from the profile verdicts',
    youtubeSummary === 'Publishing supported · Restrictions unknown',
  );
  check(
    'the selected platform renders as the navy pill',
    (await page.locator('[data-testid="social-platform-youtube"][class*="mos-navy"]').count()) === 1,
  );

  // 3. Capability verdicts: the three states render distinctly; unknown is
  //    never a boolean.
  const publishVerdict = await page.locator('[data-testid="social-verdict-publish"]').textContent();
  check('the publish verdict renders supported', publishVerdict === 'supported');
  const restrictionsVerdict = await page
    .locator('[data-testid="social-verdict-list-restrictions"]')
    .textContent();
  check(
    'the list-restrictions verdict renders unknown — observation-pending, never a boolean',
    restrictionsVerdict === 'unknown — observation-pending',
  );
  const connectVerdict = await page
    .locator('[data-testid="social-connect-verdict-youtube"]')
    .textContent();
  check(
    'the connect verdict renders unavailable honestly (no credentials exist)',
    connectVerdict.includes('unavailable in this release') &&
      connectVerdict.includes('no credentials exist anywhere in this composition'),
  );

  // 4. Platform switch renders a different capability table (the
  //    capability-driven pattern, §8.4).
  await page.click('[data-testid="social-platform-tiktok"]');
  await page.waitForLoadState('networkidle');
  check('the platform switch carries ?platform=', page.url().includes('platform=tiktok'));
  check(
    'TikTok renders its own workspace heading',
    (await page.locator('[data-testid="social-workspace-heading"]').textContent()).includes(
      'TikTok workspace',
    ),
  );
  const tiktokSchedule = await page
    .locator('[data-testid="social-verdict-schedule"]')
    .textContent();
  check(
    'TikTok\'s unknown scheduling verdict renders distinctly (never coerced)',
    tiktokSchedule === 'unknown — observation-pending',
  );
  const tiktokDelete = await page.locator('[data-testid="social-verdict-delete"]').textContent();
  check('TikTok\'s unknown delete verdict renders distinctly', tiktokDelete === 'unknown — observation-pending');
  check(
    'the YouTube matrix no longer renders after the switch',
    (await page.locator('[data-testid="social-capability-matrix-youtube"]').count()) === 0,
  );

  // 5. The guided-setup checklist + agent guide.
  await page.goto(`${baseUrl}/social`, { waitUntil: 'networkidle' });
  const steps = page.locator('[data-testid^="social-guided-step-"]');
  check('the guided-setup checklist renders five steps', (await steps.count()) === 5);
  const badges = page.locator('[data-testid^="social-step-badge-"]');
  const badgeStates = await badges.evaluateAll((nodes) => nodes.map((n) => n.dataset.state));
  check(
    'every step state is the honest not-started on the demo composition',
    badgeStates.every((state) => state === 'not-started'),
  );
  const guide = await page.locator('[data-testid="social-agent-guide-quote"]').textContent();
  check(
    'the AGENT GUIDE panel carries the target copy verbatim',
    guide.includes('We can start with public or user-provided sources') &&
      guide.includes('the app will use only approved scopes'),
  );
  const followup = page.locator('[data-testid="social-ask-followup"]');
  check(
    'the follow-up affordance links the console direct mode',
    (await followup.getAttribute('href')) === '/console?mode=direct',
  );

  // 6. The guided browser pane renders the honest NON-ELECTRON fallback
  //    (the browser shell has no webview substrate) + the secure external
  //    link — never a decorative frame.
  check(
    'the guided browser renders the honest fallback verdict',
    (await page.locator('[data-testid="social-guided-browser-fallback"]').count()) === 1,
  );
  const fallback = await page
    .locator('[data-testid="social-guided-browser-unavailable"]')
    .textContent();
  check(
    'the fallback names the MOS desktop app',
    fallback.includes('The guided browser is available in the MOS desktop app'),
  );
  const external = page.locator('[data-testid="social-guided-browser-open-external"]');
  check(
    'the secure system-browser fallback link is a plain external anchor',
    (await external.getAttribute('href')) === 'https://www.youtube.com/' &&
      (await external.getAttribute('target')) === '_blank' &&
      (await external.getAttribute('rel')) === 'noopener noreferrer',
  );
  check(
    'no decorative webview frame renders in the browser shell',
    (await page.locator('webview').count()) === 0,
  );

  // 7. The simulation sandbox labels render VERBATIM.
  check(
    'the SANDBOX title renders verbatim',
    (await page.locator('[data-testid="social-sandbox-title"]').textContent()) ===
      'Simulation workspace — SANDBOX',
  );
  check(
    'the sandbox boundary renders verbatim',
    (await page.locator('[data-testid="social-sandbox-boundary"]').textContent()) ===
      'No live publish • no invented analytics • no account changes',
  );
  check(
    'the sandbox carries the SIMULATION chip',
    (await page.locator('[data-testid="social-sandbox-simulated-chip"]').textContent()) ===
      'SIMULATION',
  );
  const strategyRow = page.locator('[data-testid="social-sandbox-row-candidate-strategies"]');
  check(
    'the strategies row links the Lab comparison surface',
    (await strategyRow.locator('a').getAttribute('href')) === '/lab?section=strategy',
  );

  // 8. The setup-details form DECLARES a create-mission intent over the
  //    demo composition: submit navigates to the Missions surface where
  //    the EXISTING receipt panel renders (the outcome idiom).
  await page.fill('[data-testid="social-setup-field-business-product"]', 'Cedar outdoor kit');
  await page.fill('[data-testid="social-setup-field-success-goal"]', 'Qualified leads for the spring line');
  await page.selectOption('[data-testid="social-setup-field-success-metric"]', 'qualified-reach');
  await page.fill('[data-testid="social-setup-field-target-audience"]', 'US hikers · English');
  await page.fill('[data-testid="social-setup-field-time-horizon"]', '90 days · small budget');
  await page.click('[data-testid="social-setup-continue"]');
  await page.waitForURL(/\/missions\?intent=/, { timeout: 15_000 });
  check(
    'the setup form\'s declaration navigates to the Missions receipt surface',
    page.url().includes('/missions?intent='),
  );
  const receipt = await page.locator('[data-testid="intent-receipt"]').textContent();
  check(
    'the existing mission receipt outcome panel renders the recorded intent',
    receipt.includes('Create-mission intent recorded') && receipt.includes('missions-authority'),
  );
};
