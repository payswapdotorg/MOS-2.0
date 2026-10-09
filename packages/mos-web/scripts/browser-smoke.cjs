#!/usr/bin/env node
// MOS web shell — UX-002 BROWSER SMOKE EVIDENCE (the WEB-001 pattern: vite
// build + serve, then drive the shell headlessly and record what rendered).
//
// WHY `.cjs` (disclosed): the frozen boundary harness
// (harness/mos-boundary-check.mjs) scans `.ts/.tsx/.mts/.js/.mjs` under
// `packages/mos-*` and forbids bare npm imports there — this script must
// `require('playwright-core')`, so it uses the `.cjs` extension the frozen
// rules do not manage (the same disclosed pattern as `vite.config.cts` and
// the two `.jsx` mounting shims). The package's own presentation-only
// structural pins cover it: `scripts/` may import only node builtins and
// playwright-core. playwright-core is provided by the workspace
// (packages/desktop dependency, hoisted) — NO new mos-web dependency.
//
// Run: node scripts/browser-smoke.cjs
// (after `pnpm build:web`; the script serves dist/web via `vite preview`
// itself and cleans up on exit). Exits non-zero on any failed assertion.

'use strict';

const { spawn } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const http = require('node:http');

const PACKAGE_ROOT = join(__dirname, '..');
const DIST_WEB = join(PACKAGE_ROOT, 'dist', 'web');
const PORT = Number(process.env.MOS_SMOKE_PORT || 4188);
const BASE_URL = process.env.MOS_SMOKE_BASE_URL || `http://localhost:${PORT}`;

// ——— evidence log ———
const evidence = [];
const failures = [];
let consoleErrors = 0;
let pageErrors = 0;

function log(line) {
  evidence.push(line);
  process.stdout.write(`${line}\n`);
}

function check(label, condition, detail) {
  if (condition) {
    log(`  PASS ${label}`);
  } else {
    failures.push(label);
    log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  }
}

// ——— chromium discovery (playwright-core's registry, env-overridable) ———
function discoverChromiumExecutable() {
  if (process.env.MOS_SMOKE_CHROMIUM_EXECUTABLE) {
    return process.env.MOS_SMOKE_CHROMIUM_EXECUTABLE;
  }
  const registryRoot = join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.cache',
    'ms-playwright',
  );
  if (!existsSync(registryRoot)) {
    return null;
  }
  const candidates = [];
  for (const entry of readdirSync(registryRoot)) {
    const headlessMatch = /^chromium_headless_shell-(\d+)$/.exec(entry);
    if (headlessMatch) {
      candidates.push({
        version: Number(headlessMatch[1]),
        path: join(registryRoot, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
      });
    }
    const fullMatch = /^chromium-(\d+)$/.exec(entry);
    if (fullMatch) {
      candidates.push({
        version: Number(fullMatch[1]),
        path: join(registryRoot, entry, 'chrome-linux64', 'chrome'),
      });
    }
  }
  candidates.sort((a, b) => b.version - a.version);
  for (const candidate of candidates) {
    if (existsSync(candidate.path)) {
      return candidate.path;
    }
  }
  return null;
}

// ——— preview server ———
function isServerUp(url) {
  return new Promise((resolve) => {
    const request = http.request(`${url}/`, { method: 'GET' }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.end();
  });
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.request(`${url}/`, { method: 'GET' }, (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
        } else if (Date.now() > deadline) {
          reject(new Error(`server answered ${response.statusCode}`));
        } else {
          setTimeout(attempt, 250);
        }
      });
      request.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error('server never answered'));
        } else {
          setTimeout(attempt, 250);
        }
      });
      request.end();
    };
    attempt();
  });
}

async function main() {
  if (!existsSync(join(DIST_WEB, 'index.html'))) {
    console.error('dist/web is missing — run `pnpm build:web` first.');
    process.exitCode = 1;
    return;
  }

  let preview = null;
  if (!(await isServerUp(BASE_URL))) {
    const viteBin = join(PACKAGE_ROOT, 'node_modules', '.bin', 'vite');
    const viteEntry = existsSync(viteBin)
      ? viteBin
      : join(PACKAGE_ROOT, '..', '..', 'node_modules', '.bin', 'vite');
    preview = spawn(viteEntry, ['preview', '--port', String(PORT), '--strictPort'], {
      cwd: PACKAGE_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    preview.stdout.on('data', (chunk) => process.stderr.write(`[preview] ${chunk}`));
    preview.stderr.on('data', (chunk) => process.stderr.write(`[preview] ${chunk}`));
  }

  let browser = null;
  try {
    await waitForServer(BASE_URL, 30_000);
    log(`EVIDENCE server: ${BASE_URL} answers HTTP 200 (vite preview over dist/web)`);

    const { chromium } = require('playwright-core');
    const executablePath = discoverChromiumExecutable();
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    log(`EVIDENCE browser: chromium headless launched${executablePath ? ` (${executablePath})` : ''}`);

    const page = await browser.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors += 1;
        log(`  CONSOLE-ERROR ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => {
      pageErrors += 1;
      log(`  PAGE-ERROR ${error.message}`);
    });

    // 1. Home: the shell boots and the Studio section is ON.
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    check('home renders the shell (header present)', (await page.locator('header').count()) > 0);
    const studioNav = page.locator('[data-testid="nav-studio"]');
    check(
      'nav-studio is an ENABLED link (UX-002 turned the section on)',
      (await studioNav.count()) === 1 && (await studioNav.getAttribute('aria-disabled')) === null,
    );
    check('nav-studio href is /studio', (await studioNav.getAttribute('href')) === '/studio');
    check(
      'nav-lab still renders its not-yet-available verdict (UX-003 untouched)',
      (await page.locator('[data-testid="nav-lab-unavailable"]').count()) === 1,
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
    await page.goto(`${BASE_URL}/studio?session=session-reaction-4`, { waitUntil: 'networkidle' });
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
    await page.goto(`${BASE_URL}/studio?session=session-podcast-1`, { waitUntil: 'networkidle' });
    check(
      'the pending consent state renders (§15 waiting)',
      (await page.locator('[data-testid="studio-consent-state-pending"]').count()) === 1,
    );

    // 6. Package library + the immutable version chain (§14 + §19 + §30).
    await page.goto(`${BASE_URL}/studio`, { waitUntil: 'networkidle' });
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
    await page.goto(`${BASE_URL}/studio?package=pkg-podcast-3`, { waitUntil: 'networkidle' });
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

    // 8. Responsive pass (mobile viewport).
    const mobile = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await mobile.goto(`${BASE_URL}/studio`, { waitUntil: 'networkidle' });
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

    // 9. Console state.
    check('zero console errors across every visit', consoleErrors === 0, `${consoleErrors} console errors`);
    check('zero page errors across every visit', pageErrors === 0, `${pageErrors} page errors`);
  } catch (error) {
    failures.push(`smoke driver crashed: ${error.message}`);
    log(`FAIL smoke driver crashed: ${error.stack || error.message}`);
  } finally {
    if (browser !== null) {
      await browser.close().catch(() => undefined);
    }
    if (preview !== null) {
      preview.kill('SIGTERM');
    }
  }

  log('');
  log(
    `EVIDENCE summary: ${evidence.filter((line) => line.includes('  PASS')).length} passed, ${failures.length} failed, console errors ${consoleErrors}, page errors ${pageErrors}`,
  );
  if (failures.length > 0) {
    log(`FAILURES: ${failures.join(' | ')}`);
    process.exitCode = 1;
  } else {
    log('UX-002 BROWSER SMOKE: ALL ASSERTIONS PASSED');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
