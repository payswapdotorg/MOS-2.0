'use strict';

// UX-003 suite for the MOS browser smoke (see browser-smoke.cjs for the
// driver and the disclosed .cjs rationale). The Lab surface: the benchmark
// record-chain directory, one benchmark digest (uncertainty intervals,
// counterfactual labels, the no-op baseline, OOD flags, calibration
// pending), exact-version chain browsing, the online-calibration surface
// (context derived vs the first-class pending state, prediction-vs-measured
// separation) — plus the responsive pass and the read-only pin.

module.exports.runLabSuite = async function runLabSuite(page, baseUrl, check) {
  // 8. Lab section (UX-003): the benchmark directory.
  await page.goto(`${baseUrl}/lab`, { waitUntil: 'networkidle' });
  check('lab route reached', page.url().includes('/lab'));
  const benchmarkRows = page.locator('[data-testid="lab-benchmarks-list"] > li');
  check('the benchmark directory lists the fixture chains (2)', (await benchmarkRows.count()) === 2);
  check(
    'the standing §24 boundary note renders on the Lab surface',
    (await page.locator('[data-testid="lab-boundary-note"]').textContent()).includes(
      'never deployment evidence',
    ),
  );
  check(
    'benchmark rows carry the visible counterfactual badge (§20)',
    (await page.locator('[data-testid="lab-benchmark-counterfactual-bench-reach-v1"]').count()) === 1,
  );
  check(
    'the closed-loop chain cites its calibration context (provenance only)',
    (await page.locator('[data-testid="lab-benchmark-calibration-bench-reach-v1"]').textContent()).includes(
      'cites calibration context v1',
    ),
  );
  check(
    'the first-run chain shows calibration pending honestly',
    (await page.locator('[data-testid="lab-benchmark-calibration-bench-launch-v2"]').textContent()).includes(
      'Calibration pending reality',
    ),
  );

  // 9. Benchmark digest: uncertainty + counterfactual + no-op baseline + OOD.
  await page.click('[data-testid="lab-benchmark-row-bench-reach-v1"]');
  await page.waitForLoadState('networkidle');
  check('the digest route carries ?benchmark=', page.url().includes('benchmark=bench-reach-v1'));
  check(
    'the benchmark digest panel renders (latest version v2)',
    (await page.locator('[data-testid="lab-benchmark-digest"]').count()) === 1 &&
      (await page.locator('[data-testid="lab-benchmark-digest"]').textContent()).includes('v2'),
  );
  check(
    'the digest header carries the counterfactual badge',
    (await page.locator('[data-testid="lab-digest-counterfactual"]').count()) === 1,
  );
  const digestText = await page.locator('[data-testid="lab-benchmark-digest"]').textContent();
  check(
    'expected values render WITH their uncertainty intervals (§22)',
    (await page.locator('[data-testid="lab-candidate-expected-clip-5"]').textContent()).includes(
      'interval [',
    ) &&
      (await page.locator('[data-testid="lab-candidate-expected-noop-baseline"]').textContent()).includes(
        'interval [',
      ),
  );
  check(
    'every candidate row carries the counterfactual badge (5 rows on v2)',
    (await page.locator('[data-testid^="lab-candidate-counterfactual-"]').count()) === 5,
  );
  check(
    'the no-op baseline is visibly present (§7)',
    (await page.locator('[data-testid="lab-noop-baseline-mark"]').count()) === 1,
  );
  check(
    'the OOD flag renders on the flagged candidate (§22)',
    (await page.locator('[data-testid="lab-candidate-ood-clip-5"]').textContent()).includes(
      'Out of declared coverage',
    ),
  );
  check(
    'per-world member disagreement renders (§22)',
    (await page.locator('[data-testid="lab-candidate-disagreement-clip-5"]').textContent()).includes(
      'worst half-width',
    ),
  );
  check(
    'the fairness pin renders',
    (await page.locator('[data-testid="lab-digest-fairness"]').textContent()).includes(
      'no per-candidate condition cherry-picking',
    ),
  );
  check(
    'the digest cites its calibration context (provenance only)',
    (await page.locator('[data-testid="lab-digest-calibration-citation"]').textContent()).includes(
      'cites calibration context v1',
    ),
  );
  check(
    'the digest renders the DECLARED robustness policy',
    digestText.includes('policy-robust-reach v1') && digestText.includes('Pooled mean over all worlds'),
  );

  // 10. Exact-version browsing (append-only chain).
  await page.goto(`${baseUrl}/lab?benchmark=bench-reach-v1&version=1`, { waitUntil: 'networkidle' });
  check(
    'an exact record version browses (v1: three declared candidates)',
    (await page.locator('[data-testid^="lab-candidate-counterfactual-"]').count()) === 4,
  );

  // 11. Calibration surface: contexts, records, prediction-vs-measured.
  await page.goto(`${baseUrl}/lab`, { waitUntil: 'networkidle' });
  check(
    'the calibration status lists the fixture chains (2)',
    (await page.locator('[data-testid="lab-calibrations-list"] > li').count()) === 2,
  );
  check(
    'the derived context renders its summary (calibration ACTIVE)',
    (await page.locator('[data-testid="lab-calibration-context-calib-reach-1"]').textContent()).includes(
      'Context v1 derived',
    ),
  );
  check(
    'the chain without a context renders the FIRST-CLASS pending state',
    (await page.locator('[data-testid="lab-calibration-pending-calib-launch-1"]').textContent()).includes(
      'Calibration pending',
    ),
  );
  await page.click('[data-testid="lab-calibration-row-calib-reach-1"]');
  await page.waitForLoadState('networkidle');
  check('the calibration route carries ?calibration=', page.url().includes('calibration=calib-reach-1'));
  check(
    'the calibration records render (2 append-only versions)',
    (await page.locator('[data-testid^="lab-calibration-record-calib-reach-1-"]').count()) === 2,
  );
  check(
    'the PREDICTION side is counterfactual-labeled (lock rule 29)',
    (await page.locator('[data-testid="lab-calibration-prediction-counterfactual-calib-reach-1-v1"]').count()) === 1,
  );
  check(
    'the OBSERVED side is measured-labeled (lock rule 29)',
    (await page.locator('[data-testid="lab-calibration-observed-measured-calib-reach-1-v1"]').count()) === 1,
  );
  check(
    'the frozen v1 error functional renders',
    (await page.locator('[data-testid="lab-calibration-functional-calib-reach-1-v1"]').textContent()).includes(
      'calib-signed-error-v1',
    ),
  );
  check(
    'the §22 interval containment verdict renders',
    (await page.locator('[data-testid="lab-calibration-containment-calib-reach-1-v1"]').textContent()).includes(
      'OUTSIDE',
    ),
  );
  const labButtons = await page.locator('main button').count();
  check(
    'NO buttons (operator controls) on the Lab surface either (read-only pin)',
    labButtons === 0,
    `found ${labButtons}`,
  );
};

module.exports.runResponsiveSuite = async function runResponsiveSuite(browser, baseUrl, check) {
  // 12. Responsive pass (mobile viewport) across both surfaces.
  const mobile = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await mobile.goto(`${baseUrl}/lab?benchmark=bench-reach-v1`, { waitUntil: 'networkidle' });
  check(
    'mobile: the Lab benchmark digest renders at 375px',
    (await mobile.locator('[data-testid="lab-benchmark-digest"]').count()) === 1,
  );
  await mobile.goto(`${baseUrl}/studio`, { waitUntil: 'networkidle' });
  check(
    'mobile: the studio directory renders at 375px',
    (await mobile.locator('[data-testid="studio-sessions-list"]').count()) === 1,
  );
  check('mobile: the section nav is present', (await mobile.locator('nav').count()) === 1);
  const noOverflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth <= 380,
  );
  check('mobile: no horizontal overflow', noOverflow);
  await mobile.close();
};
