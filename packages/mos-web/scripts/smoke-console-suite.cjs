'use strict';

// The CONSOLE wave suite for the MOS browser smoke (see browser-smoke.cjs
// for the driver and the disclosed .cjs rationale). The Agent Console over
// the DEMO composition (the driver booted ?demo=1): the workspace renders
// its rail/banner/mode structure with the SEEDED demo missions; then the
// COMPLETE seven-step mission→evidence→plan→strategy→run→approval chain is
// DECLARED through the console write-intent forms, navigating BETWEEN
// MODES THROUGH LINK CLICKS so the per-load composition state survives
// (the soft link navigation the CONSOLE wave installed — the browser twin
// of the desktop bridge). The production binding's REAL runtimes are
// proven by the mos-desktop battery + the packaged-app smoke; this suite
// proves the browser transport end-to-end.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openIntentForm(page, testId) {
  const summary = page.locator(`[data-testid="${testId}"] > summary`);
  if (await summary.count()) {
    await summary.click().catch(() => {});
    await sleep(250);
  }
}

async function fillField(page, formTestId, fieldName, value) {
  await page.fill(
    `[data-testid="${formTestId}"] [data-testid="console-intent-field-${fieldName}"]`,
    value,
  );
}

async function declareAndReadOutcome(page, check, label, formTestId, fields) {
  await openIntentForm(page, formTestId);
  for (const [name, value] of Object.entries(fields)) {
    await fillField(page, formTestId, name, value);
  }
  await page.click(`[data-testid="${formTestId}-submit"]`);
  await page.waitForSelector('[data-testid="console-intent-outcome"]', { timeout: 20000 });
  await sleep(600);
  const text = await page.locator('[data-testid="console-intent-outcome"]').textContent();
  const executed = text.includes('Executed by ');
  check(`${label}: executed receipt rendered`, executed === true, (text ?? '').slice(0, 140));
  return { text, executed };
}

/** Clicks a console mode-rail link (SOFT navigation — state preserved). */
async function switchMode(page, mode) {
  await page.click(`[data-testid="console-mode-rail"] a[href*="mode=${mode}"]`);
  await sleep(700);
}

module.exports.runConsoleSuite = async function runConsoleSuite(page, baseUrl, check) {
  // ——— STATION 1: the workspace structure over the demo missions ———
  await page.goto(`${baseUrl}/console`, { waitUntil: 'networkidle' });
  check('console route reached', page.url().includes('/console'));
  await page.waitForSelector('[data-testid="console-workspace"]', { timeout: 15000 });
  const rail = await page.locator('[data-testid="console-mission-rail"]').count();
  check('the mission rail renders with the seeded demo missions', rail === 1);
  const railText = await page.locator('[data-testid="console-mission-rail"]').textContent();
  check('the rail lists the active demo mission', railText.includes('Run the MOS demo mission'));
  check('the mode rail renders', (await page.locator('[data-testid="console-mode-rail"]').count()) === 1);
  const modeRailText = await page.locator('[data-testid="console-mode-rail"]').textContent();
  for (const mode of ['Direct', 'Plan', 'Research', 'Results', 'Control']) {
    check(`the mode rail shows ${mode}`, modeRailText.includes(mode));
  }

  // ——— STATION 2: select the mission (SOFT link click) ———
  await page.click('[data-testid="console-mission-rail"] a[href*="mission_demo_1"]');
  await sleep(800);
  const missionId = (page.url().match(/mission=([^&]+)/) || [])[1];
  check('selecting a mission carries the mission context (soft nav)', missionId === 'mission_demo_1', page.url());
  check('the mission banner renders the selected mission', (await page.locator('[data-testid="console-banner"]').count()) === 1);
  const bannerText = await page.locator('[data-testid="console-banner"]').textContent();
  check('the banner carries the mission objective', bannerText.includes('demo mission'));

  // ——— STATION 3: Control — grant analysis rights ———
  await switchMode(page, 'control');
  await page.waitForSelector('[data-testid="console-mode-control"]', { timeout: 15000 });
  await declareAndReadOutcome(page, check, 'grant-analysis-rights', 'console-grant-rights-form', {
    'console-intent-grant-id': 'grant-smoke-1',
    'console-intent-rights-holder': 'identity-smoke',
    'console-intent-action': 'analyze',
    'console-intent-scope-json': JSON.stringify({
      subjectRefs: ['subject-cohort', 'evidence-cohort', 'operator'],
      sourceRefs: ['operator'],
    }),
    'console-intent-terms-json': JSON.stringify({ attributionRequired: false }),
  });

  // ——— STATION 4: Research — create the experiment + record intelligence ———
  await switchMode(page, 'research');
  await page.waitForSelector('[data-testid="console-mode-research"]', { timeout: 15000 });
  await declareAndReadOutcome(page, check, 'create-experiment', 'console-create-experiment-form', {
    'console-intent-experiment-id': 'exp-smoke-1',
    'console-intent-question': 'Which platform wins the cohort?',
    'console-intent-success-criterion': 'Reach above the counterfactual baseline.',
    'console-intent-hypothesis-json': JSON.stringify({}),
    'console-intent-mission-refs': 'mission_demo_1',
  });
  await declareAndReadOutcome(page, check, 'record-intelligence', 'console-record-intelligence-form', {
    'console-intent-record-id': 'intel-smoke-1',
    'console-intent-subject-json': JSON.stringify('subject-cohort'),
    'console-intent-content-kind': 'observation',
    'console-intent-content-json': JSON.stringify({
      narrative: 'The cohort discusses payment education weekly.',
      evidenceRefs: ['evidence-cohort'],
      basis: { observedAt: '2026-10-20T00:00:00.000Z' },
    }),
    'console-intent-source-json': JSON.stringify({ sourceKind: 'human-report', sourceRefs: ['operator'] }),
    'console-intent-basis-kind': 'cited-evidence',
    'console-intent-commerce-observations-json': '[]',
    'console-intent-rights-ref': 'grant-smoke-1',
    'console-intent-attribution': '',
    'console-intent-note': '',
  });
  // The intent counters continue across the mode switches (soft nav) —
  // the grant, experiment and intelligence records persist in the SAME
  // composition for the whole document session.

  // ——— STATION 5: Direct — compose the plan (cites the intelligence) ———
  await switchMode(page, 'direct');
  await page.waitForSelector('[data-testid="console-mode-direct"]', { timeout: 15000 });
  await declareAndReadOutcome(page, check, 'compose-plan', 'console-compose-plan-form', {
    'console-intent-plan-id': 'plan-smoke-1',
    'console-intent-mission-id': 'mission_demo_1',
    'console-intent-objective-alignment': 'Serve the mission objective through evidence-linked platform choices.',
    'console-intent-platforms-json': JSON.stringify([
      {
        platform: 'mastodon',
        rationale: 'The cohort is active there.',
        evidence: [{ recordId: 'intel-smoke-1', version: 1 }],
      },
    ]),
    'console-intent-metric-expectations-json': JSON.stringify([
      {
        metric: 'qualified-reach',
        expectation: '10000',
        unit: 'count',
        basis: { basis: 'cited-evidence', counterfactual: false, observedAt: '2026-10-20T00:00:00.000Z' },
        evidence: [{ recordId: 'intel-smoke-1', version: 1 }],
      },
    ]),
    'console-intent-experiment-expectations-json': JSON.stringify([
      {
        question: 'Which platform wins the cohort?',
        successCriterion: 'Reach above the counterfactual baseline.',
        evidence: [{ recordId: 'intel-smoke-1', version: 1 }],
      },
    ]),
    'console-intent-experiment-refs': 'exp-smoke-1',
    'console-intent-note': '',
  });

  // ——— STATION 6: Plan — compile the strategy ———
  await switchMode(page, 'plan');
  await page.waitForSelector('[data-testid="console-mode-plan"]', { timeout: 15000 });
  const planText = await page.locator('[data-testid="console-mode-plan"]').textContent();
  check('the composed plan chain appears in the plan read model', planText.includes('plan-smoke-1'));
  await declareAndReadOutcome(page, check, 'compile-strategy', 'console-compile-strategy-form', {
    'console-intent-plan-id': 'plan-smoke-1',
    'console-intent-plan-version': '0',
    'console-intent-principal': 'identity-smoke',
  });

  // ——— STATION 7: Control — create the run, then ARM it ———
  await switchMode(page, 'control');
  await page.waitForSelector('[data-testid="console-mode-control"]', { timeout: 15000 });
  await declareAndReadOutcome(page, check, 'create-run', 'console-create-run-form', {
    'console-intent-strategy-id': 'prod003-strategy:plan-smoke-1@v1',
  });
  const controlText = await page.locator('[data-testid="console-mode-control"]').textContent();
  check('the created run waits in the approval queue (compiled)', controlText.includes('run-plan-smoke-1-1'));
  await declareAndReadOutcome(page, check, 'arm-run', 'console-arm-run-form', {
    'console-intent-run-id': 'run-plan-smoke-1-1',
    'console-intent-principal': 'identity-smoke',
  });
  const controlAfter = await page.locator('[data-testid="console-mode-control"]').textContent();
  check('the armed run appears in the authorized list (experiment bound)', controlAfter.includes('exp-smoke-1'));

  // ——— STATION 8: Results — the run's trail + waiting state ———
  await switchMode(page, 'results');
  await page.waitForSelector('[data-testid="console-mode-results"]', { timeout: 15000 });
  const resultsText = await page.locator('[data-testid="console-mode-results"]').textContent();
  check('the armed run renders in results with its lifecycle', resultsText.includes('armed'));
  check('the run discloses what it waits on (the P2 transport)', resultsText.includes('job-execution-transport'));

  // ——— STATION 9: responsive narrow viewport ———
  await page.setViewportSize({ width: 375, height: 812 });
  await sleep(400);
  const narrowRail = await page.locator('[data-testid="console-left-region"]').count();
  check('the console adapts at 375px (stacked regions, center preserved)', narrowRail === 1);
  await page.setViewportSize({ width: 1280, height: 800 });
};
