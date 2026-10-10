#!/usr/bin/env node
// MOS web shell — UX-003 BROWSER SMOKE EVIDENCE (the WEB-001/UX-002
// pattern: vite build + serve, then drive the shell headlessly and record
// what rendered). The per-surface assertions live in the disclosed sibling
// suites: `smoke-studio-suite.cjs` (home chrome + the UX-002 Studio
// regression pass) and `smoke-lab-suite.cjs` (the UX-003 Lab pass: the
// benchmark digest with uncertainty intervals + counterfactual labels, the
// no-op baseline, OOD flags, calibration pending/active states, and the
// prediction-vs-measured separation) — split so each suite stays within
// the 400-line managed-file discipline while later UX waves extend their
// own suite.
//
// WHY `.cjs` (disclosed): the frozen boundary harness
// (harness/mos-boundary-check.mjs) scans `.ts/.tsx/.mts/.js/.mjs` under
// `packages/mos-*` and forbids bare npm imports there — this script must
// `require('playwright-core')`, so it uses the `.cjs` extension the frozen
// rules do not manage (the same disclosed pattern as `vite.config.cts` and
// the two `.jsx` mounting shims). The package's own presentation-only
// structural pins cover it: `scripts/` may import only node builtins,
// playwright-core and RELATIVE requires between the smoke scripts
// themselves. playwright-core is provided by the workspace
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

const { runStudioSuite } = require('./smoke-studio-suite.cjs');
const { runLabSuite, runResponsiveSuite } = require('./smoke-lab-suite.cjs');

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

    // Suites (see the sibling files): home chrome + Studio (UX-002
    // regression), then the Lab surface (UX-003), then the responsive pass.
    await runStudioSuite(page, BASE_URL, check);
    await runLabSuite(page, BASE_URL, check);
    await runResponsiveSuite(browser, BASE_URL, check);

    // Console state.
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
    log('UX-003 BROWSER SMOKE: ALL ASSERTIONS PASSED');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
