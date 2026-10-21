// Wave-21 packaged-app write-path smoke (TL): launches the PACKAGED
// AppImage under Xvfb, drives the MOS shell over CDP (playwright-core),
// declares REAL lab write intents through the packaged production
// composition, and captures the evidence screenshots.
// Run from /home/z/MOS-2.0 with DISPLAY=:99 already up.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const APP = '/home/z/MOS-2.0/packages/desktop/dist/squashfs-root/mos';
const EVIDENCE = '/home/z/MOS-2.0/evidence/wave21';
const CDP_PORT = 9223;

mkdirSync(EVIDENCE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser = null;
// Connect to an already-running instance first; otherwise spawn one.
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

// Collect console/page errors across the whole pass
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

// Wait for the MOS shell to mount (past the database-startup screen)
await page.waitForSelector('[data-testid="nav-home"], [data-testid="nav-missions"]', { timeout: 120000 });
console.log('MOS shell mounted');
await sleep(800);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-home.png` });
console.log('shot: home');


async function openIntentForm(page, testId) {
  await page.evaluate((id) => {
    const details = document.querySelector(`[data-testid="${id}"]`);
    if (details) details.open = true;
  }, testId);
  await sleep(400);
}

const results = [];
const note = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const baseUrl = page.url().split('?')[0];

// ---- direct route: the Lab simulator section ----
await page.goto(`${baseUrl}?route=/lab&section=simulator`);
await page.waitForSelector('[data-testid="lab-simulator-intent-register"]', { timeout: 90000 });
await sleep(1200);
await sleep(500);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-lab-simulator-forms.png` });
note('simulator section renders the write-intent forms (register + step) in the packaged app', true);

// ---- declare: register a world model (REAL runtime execution) ----
await openIntentForm(page, 'lab-simulator-intent-register');
await page.fill('[data-testid="lab-simulator-intent-register"] [data-testid="lab-intent-field-lab-intent-world-model-id"]', 'wm-smoke-001');
await page.fill('[data-testid="lab-simulator-intent-register"] [data-testid="lab-intent-field-lab-intent-niche"]', 'developer-marketing');
await page.fill('[data-testid="lab-simulator-intent-register"] [data-testid="lab-intent-field-lab-intent-platform"]', 'mastodon');
const stateJson = JSON.stringify({
  baseAudience: 12000,
  fatigue: 0.1,
  competitorShare: 0.25,
  seasonalFactor: 1.0,
});
await page.fill('[data-testid="lab-simulator-intent-register"] [data-testid="lab-intent-field-lab-intent-state-json"]', stateJson);
await page.click('[data-testid="lab-simulator-intent-register-submit"]');
await page.waitForSelector('[data-testid="lab-intent-outcome"]', { timeout: 90000 });
await sleep(700);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-lab-register-receipt.png` });
const receiptText = await page.textContent('[data-testid="lab-intent-outcome"]');
const executed = receiptText?.includes('Executed by lab-simulator-authority');
note('register-world-model EXECUTED by the real runtime (receipt visible)', executed === true, (receiptText ?? '').slice(0, 160));

// The registered world model appears in the simulator listing (read model)
const listingText = await page.textContent('[data-testid="lab-simulator-section"]');
const listed = listingText?.includes('wm-smoke-001');
note('the registered world model appears in the simulator read model', listed === true);

// ---- session persistence: soft link navigation keeps the write records ----
await page.click('a[href="/lab?section=corpus"]');
await page.waitForSelector('[data-testid="lab-corpus-intent-ingest"]', { timeout: 30000 });
await page.click('a[href="/lab?section=simulator"]');
await page.waitForSelector('[data-testid="lab-simulator-intent-register"]', { timeout: 30000 });
await sleep(800);
const persistText = await page.textContent('[data-testid="lab-simulator-section"]');
const persisted = persistText?.includes('wm-smoke-001');
note('SOFT link navigation preserves the session write records (no document reload)', persisted === true);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-lab-after-nav-persistence.png` });

// ---- declare: ingest WITHOUT a rights grant (fail-closed, verbatim) ----
await page.goto(`${baseUrl}?route=/lab&section=corpus`);
await page.waitForSelector('[data-testid="lab-corpus-intent-ingest"]', { timeout: 90000 });
await sleep(1200);
await openIntentForm(page, 'lab-corpus-intent-ingest');
await page.fill('[data-testid=\"lab-corpus-intent-ingest\"] [data-testid=\"lab-intent-field-lab-intent-document-id\"]', 'doc-smoke-001');
await page.fill('[data-testid="lab-corpus-intent-ingest"] [data-testid="lab-intent-field-lab-intent-niche"]', 'developer-marketing');
await page.fill('[data-testid="lab-corpus-intent-ingest"] [data-testid="lab-intent-field-lab-intent-platform"]', 'mastodon');
await page.fill('[data-testid=\"lab-corpus-intent-ingest\"] [data-testid=\"lab-intent-field-lab-intent-modality\"]', 'text');
await page.fill('[data-testid=\"lab-corpus-intent-ingest\"] [data-testid=\"lab-intent-field-lab-intent-artifact-id\"]', 'artifact-smoke-001');
await page.fill('[data-testid=\"lab-corpus-intent-ingest\"] [data-testid=\"lab-intent-field-lab-intent-acquired-at\"]', '2026-10-21T12:00:00Z');
await page.fill('[data-testid=\"lab-corpus-intent-ingest\"] [data-testid=\"lab-intent-field-lab-intent-rights-ref\"]', 'rights-smoke-001');
await page.fill('[data-testid=\"lab-corpus-intent-ingest\"] [data-testid=\"lab-intent-field-lab-intent-provenance-ref\"]', 'prov-smoke-001');
await page.click('[data-testid="lab-corpus-intent-ingest-submit"]');
await page.waitForSelector('[data-testid="lab-intent-outcome"]', { timeout: 90000 });
await sleep(700);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-lab-ingest-rights-rejection.png` });
const rejectionText = await page.textContent('[data-testid="lab-intent-outcome"]');
const rejected = rejectionText?.includes('Rejected by lab-corpus-authority');
note('ingest without a rights grant REJECTED fail-closed (verbatim verdict)', rejected === true, (rejectionText ?? '').slice(0, 160));

// ---- the benchmark run form renders on the benchmarks section ----
await page.goto(`${baseUrl}?route=/lab&section=benchmarks`);
await page.waitForSelector('[data-testid="lab-benchmarks-intent-run"]', { timeout: 90000 });
await sleep(400);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-lab-benchmarks-form.png` });
note('benchmarks section renders the run-benchmark intent form', true);

// ---- console error sweep across the whole pass ----
note('zero console/page errors across the whole packaged pass', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

console.log('RESULTS');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}|${r.name}${r.detail ? `|${r.detail}` : ''}`);
}
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
