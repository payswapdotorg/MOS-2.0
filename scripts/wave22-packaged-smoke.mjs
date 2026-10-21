// Wave-22 packaged-app Console smoke (TL): launches the PACKAGED desktop
// application (the electron-builder linux-unpacked output — the identical
// app content the AppImage/deb wrap; the artifacts' sizes are recorded in
// the wave evidence) under Xvfb, drives the MOS Agent Console over CDP
// (playwright-core), and captures the evidence screenshots.
// Run from /home/z/MOS-2.0 with DISPLAY=:99 already up.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const APP = '/home/z/MOS-2.0/packages/desktop/dist/linux-unpacked/mos';
const EVIDENCE = '/home/z/MOS-2.0/evidence/wave22';
const CDP_PORT = 9224;

mkdirSync(EVIDENCE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const note = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

let browser = null;
for (let i = 0; i < 5 && !browser; i += 1) {
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 1500 });
  } catch {
    await sleep(500);
  }
}
let app = null;
if (!browser) {
  app = spawn(APP, ['--no-sandbox', `--remote-debugging-port=${CDP_PORT}`, '--disable-gpu'], {
    stdio: 'ignore',
    detached: true,
    cwd: APP.replace(/\/[^/]+$/, ''),
    env: { ...process.env, DISPLAY: ':99' },
  });
  app.unref();
  console.log('app pid', app.pid);
  for (let i = 0; i < 60 && !browser; i += 1) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 2000 });
    } catch {
      await sleep(1000);
    }
  }
}
if (!browser) throw new Error('CDP endpoint never came up');
console.log('CDP connected');

const context = browser.contexts()[0];
let page = context.pages().find((p) => p.url().includes('index.html')) ?? null;
for (let i = 0; i < 30 && !page; i += 1) {
  await sleep(1000);
  page = context.pages().find((p) => p.url().includes('index.html')) ?? context.pages()[0] ?? null;
}
if (!page) throw new Error('no main window page');
console.log('page url:', page.url());

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

const baseUrl = page.url().split('?')[0];

// ---- 1. the Agent Console section in the packaged shell nav ----
await page.goto(`${baseUrl}?route=/`);
await page.waitForSelector('[data-testid="console-workspace"], nav', { timeout: 90000 });
await sleep(1200);
const navText = await page.locator('nav').first().textContent();
note('the packaged shell nav shows the Agent Console section', navText.includes('Agent Console'));
await page.screenshot({ path: `${EVIDENCE}/packaged-app-home.png` });

// ---- 2. the console workspace renders over the PRODUCTION composition ----
await page.goto(`${baseUrl}?route=/console`);
await page.waitForSelector('[data-testid="console-workspace"]', { timeout: 90000 });
await sleep(1200);
const workspaceText = await page.locator('[data-testid="console-workspace"]').textContent();
note('the console workspace renders (production composition)', workspaceText.includes('Agent Console') || workspaceText.length > 200);
note('the mission rail renders the honest production empty state', workspaceText.includes('No missions yet'));
await page.screenshot({ path: `${EVIDENCE}/packaged-app-console-empty.png` });

// ---- 3. the Control mode renders the approval queue + forms ----
await page.click('[data-testid="console-mode-rail"] a[href*="mode=control"]');
await sleep(900);
const controlText = await page.locator('[data-testid="console-mode-control"]').textContent();
note('the control mode renders the empty approval queue honestly', controlText.includes('No runs awaiting authorization'));
note('the arm-run (authorization) form renders', (await page.locator('[data-testid="console-arm-run-form"]').count()) === 1);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-console-control.png` });

// ---- 4. the Research mode renders the rights-gated evidence forms ----
await page.click('[data-testid="console-mode-rail"] a[href*="mode=research"]');
await sleep(900);
const researchText = await page.locator('[data-testid="console-mode-research"]').textContent();
note('the research mode renders the intelligence-empty disclosure', researchText.includes('No intelligence records'));
note('the record-intelligence form renders (rights-gated path)', (await page.locator('[data-testid="console-record-intelligence-form"]').count()) === 1);

// ---- 5. the REAL §25 rights gate: recording WITHOUT a grant fails closed ----
const form = '[data-testid="console-record-intelligence-form"]';
await page.click(`${form} > summary`);
await sleep(300);
await page.fill(`${form} [data-testid="console-intent-field-console-intent-record-id"]`, 'intel-smoke-1');
await page.fill(`${form} [data-testid="console-intent-field-console-intent-subject-json"]`, JSON.stringify('subject-cohort'));
await page.fill(`${form} [data-testid="console-intent-field-console-intent-content-kind"]`, 'observation');
await page.fill(
  `${form} [data-testid="console-intent-field-console-intent-content-json"]`,
  JSON.stringify({
    narrative: 'The cohort discusses payment education weekly.',
    evidenceRefs: ['evidence-cohort'],
    basis: { observedAt: '2026-10-20T00:00:00.000Z' },
  }),
);
await page.fill(
  `${form} [data-testid="console-intent-field-console-intent-source-json"]`,
  JSON.stringify({ sourceKind: 'human-report', sourceRefs: ['operator'] }),
);
await page.fill(`${form} [data-testid="console-intent-field-console-intent-basis-kind"]`, 'cited-evidence');
await page.fill(`${form} [data-testid="console-intent-field-console-intent-rights-ref"]`, 'grant-smoke-1');
await page.click('[data-testid="console-record-intelligence-form-submit"]');
await page.waitForSelector('[data-testid="console-intent-outcome"]', { timeout: 30000 });
await sleep(700);
const outcomeText = await page.locator('[data-testid="console-intent-outcome"]').textContent();
note(
  'record-intelligence WITHOUT a grant is REJECTED by the REAL §25 authority (verbatim)',
  outcomeText.includes('no-explicit-grant') && outcomeText.includes('product-intelligence-authority'),
  outcomeText.slice(0, 140),
);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-console-rights-gate.png` });

// ---- 6. the grant unblocks the path: grant → record → EXECUTED ----
await page.click('[data-testid="console-mode-rail"] a[href*="mode=control"]');
await sleep(900);
const grantForm = '[data-testid="console-grant-rights-form"]';
await page.click(`${grantForm} > summary`);
await sleep(300);
await page.fill(`${grantForm} [data-testid="console-intent-field-console-intent-grant-id"]`, 'grant-smoke-1');
await page.fill(`${grantForm} [data-testid="console-intent-field-console-intent-rights-holder"]`, 'principal:console-operator');
await page.fill(`${grantForm} [data-testid="console-intent-field-console-intent-action"]`, 'analyze');
await page.fill(
  `${grantForm} [data-testid="console-intent-field-console-intent-scope-json"]`,
  JSON.stringify({ subjectRefs: ['subject-cohort', 'evidence-cohort', 'operator'], sourceRefs: ['operator'] }),
);
await page.fill(
  `${grantForm} [data-testid="console-intent-field-console-intent-terms-json"]`,
  JSON.stringify({ attributionRequired: false }),
);
await page.click('[data-testid="console-grant-rights-form-submit"]');
await page.waitForSelector('[data-testid="console-intent-outcome"]', { timeout: 30000 });
await sleep(700);
const grantOutcome = await page.locator('[data-testid="console-intent-outcome"]').textContent();
note('grant-analysis-rights EXECUTES against the REAL rights repository', grantOutcome.includes('Executed by rights-authority'), grantOutcome.slice(0, 140));

// ---- 7. SOFT mode navigation preserves the session state ----
await page.click('[data-testid="console-mode-rail"] a[href*="mode=research"]');
await sleep(900);
const intelForm = '[data-testid="console-record-intelligence-form"]';
await page.click(`${intelForm} > summary`);
await sleep(300);
await page.fill(`${intelForm} [data-testid="console-intent-field-console-intent-record-id"]`, 'intel-smoke-1');
await page.fill(`${intelForm} [data-testid="console-intent-field-console-intent-subject-json"]`, JSON.stringify('subject-cohort'));
await page.fill(`${intelForm} [data-testid="console-intent-field-console-intent-content-kind"]`, 'observation');
await page.fill(
  `${intelForm} [data-testid="console-intent-field-console-intent-content-json"]`,
  JSON.stringify({
    narrative: 'The cohort discusses payment education weekly.',
    evidenceRefs: ['evidence-cohort'],
    basis: { observedAt: '2026-10-20T00:00:00.000Z' },
  }),
);
await page.fill(
  `${intelForm} [data-testid="console-intent-field-console-intent-source-json"]`,
  JSON.stringify({ sourceKind: 'human-report', sourceRefs: ['operator'] }),
);
await page.fill(`${intelForm} [data-testid="console-intent-field-console-intent-basis-kind"]`, 'cited-evidence');
await page.fill(`${intelForm} [data-testid="console-intent-field-console-intent-rights-ref"]`, 'grant-smoke-1');
await page.click('[data-testid="console-record-intelligence-form-submit"]');
await page.waitForSelector('[data-testid="console-intent-outcome"]', { timeout: 30000 });
await sleep(700);
const intelOutcome = await page.locator('[data-testid="console-intent-outcome"]').textContent();
note(
  'record-intelligence EXECUTES after the grant (the REAL §25 authority, same session)',
  intelOutcome.includes('Executed by product-intelligence-authority'),
  intelOutcome.slice(0, 140),
);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-console-intel-executed.png` });

// ---- 8. reload honestly resets (session-scoped state, the disclosed limit) ----
await page.goto(`${baseUrl}?route=/console`);
await page.waitForSelector('[data-testid="console-workspace"]', { timeout: 30000 });
await sleep(800);
const afterReload = await page.locator('[data-testid="console-workspace"]').textContent();
note('a hard reload presents the honest fresh workspace (session-scoped state)', afterReload.includes('No missions yet'));

// ---- 9. zero console/page errors across the whole pass ----
note('zero console/page errors during the packaged console pass', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | ').slice(0, 200));
await page.screenshot({ path: `${EVIDENCE}/packaged-app-console-after-reload.png` });

const failed = results.filter((r) => !r.ok);
console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.log('FAILURES:', failed.map((r) => r.name).join(' | '));
  process.exitCode = 1;
}
await browser.close().catch(() => undefined);
