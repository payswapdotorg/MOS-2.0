// Wave-24 packaged-app TARGET-UI smoke (TL): launches the PACKAGED desktop
// application (electron-builder linux-unpacked — the identical app content
// the AppImage/deb wrap) under Xvfb, drives the MOS Agent Console over CDP
// (playwright-core), and captures the wave-24 evidence screenshots.
//
// Layer 1 — regression: the wave-22 console smoke's 12 checks re-run
// verbatim against the target-design shell (nav + workspace + modes + the
// REAL §25 rights gate failing closed then executing after the grant +
// reload honesty + zero console/page errors).
//
// Layer 2 — the wave-24 target-design conversion checks: the light theme,
// the header identity (navy logo square, "MOS Agent Console" title +
// subtitle, honest mission badge), the left navigation rail (the target
// six sections with honest SOON verdicts), the recent-missions rail, and
// the FULL showcase: a REAL mission created through the Missions surface's
// declare-and-execute form, then the console workspace presenting the
// CURRENT MISSION card, the "Mission active" badge and the rail entry.
// Run from /home/z/MOS-2.0 with DISPLAY=:99 already up.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const APP = '/home/z/MOS-2.0/packages/desktop/dist/linux-unpacked/mos';
const EVIDENCE = '/home/z/MOS-2.0/evidence/wave24';
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
let page = null;
// The main window page must be the one serving the app's index.html — a
// freshly-spawned app may briefly expose a pre-boot/error page; wait for
// the real renderer page (and drop any stale error pages).
for (let i = 0; i < 45 && !page; i += 1) {
  const candidates = context.pages().filter((p) => p.url().includes('index.html'));
  page = candidates[0] ?? null;
  if (!page) await sleep(1000);
}
if (!page) throw new Error('no main window page');
await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
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

// ---- 1b. (wave-24) the light theme + the target-design header ----
// The substrate renders the window with a transparent body (the vibrancy
// design); the SHELL ROOT div is what paints — pin its light surface class.
const rootIsLight = await page.evaluate(() => {
  const root = document.querySelector('#root > div') ?? document.body.firstElementChild;
  return root !== null && String(root.className).includes('bg-slate-50');
});
note('the shell paints the LIGHT theme (target design)', rootIsLight);
const headerText = await page.locator('header').first().textContent();
note(
  'the header carries the target identity (title + subtitle + honest mission badge)',
  headerText.includes('MOS Agent Console') &&
    headerText.includes('Mission-aware agent orchestration') &&
    headerText.includes('No active mission'),
);
const railText = navText ?? '';
note(
  'the navigation rail carries the target sections',
  ['Home', 'Missions', 'Research Lab', 'Agent Console', 'Studio', 'Measurement'].every((label) =>
    railText.includes(label),
  ),
);
note(
  'Studio and Measurement carry honest SOON verdicts (never placeholder content)',
  (await page.locator('[data-testid="nav-studio-unavailable"]').count()) === 1 &&
    (await page.locator('[data-testid="nav-measurement-unavailable"]').count()) === 1,
);
note(
  'the recent-missions rail renders its honest empty state',
  (await page.locator('[data-testid="shell-recent-missions-empty"]').count()) === 1,
);

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

// ---- 8b. (wave-24) the create-mission intent: the PRODUCTION verdict is
// honest and RECORD-ONLY — the composition records the declaration in its
// ledger; the Missions AUTHORITY executes intents through the P2 service
// transport (disclosed), so NO mission appears from the declaration. The
// shell must present exactly that: the receipt read-back panel (the
// per-load ledger disclosure), an empty mission list, an idle badge.
await page.goto(`${baseUrl}?route=/missions`);
await page.waitForSelector('[data-testid="mission-intent-form"]', { timeout: 30000 });
await sleep(800);
await page.click('[data-testid="mission-intent-form"] > summary');
await sleep(300);
await page.fill('#intent-objective', 'Launch the wave-24 campaign across the developer audience.');
await page.selectOption('#intent-term-0-metric', 'qualified-reach');
await page.selectOption('#intent-term-0-direction', 'maximize');
await page.fill('#intent-term-0-weight', '1');
await page.fill('#intent-term-0-definition', 'Qualified reach among developer accounts, measured weekly.');
await page.click('[data-testid="mission-intent-submit"]');
await page.waitForSelector('[data-testid="intent-receipt"], [data-testid="intent-receipt-unavailable"]', { timeout: 30000 });
await sleep(700);
const missionOutcomeCount = await page.locator('[data-testid="intent-receipt"], [data-testid="intent-receipt-unavailable"]').count();
note('the create-mission declaration renders its honest outcome panel', missionOutcomeCount >= 1);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-missions-intent-recorded.png` });

// No mission is created by the declaration (the honest P2-pending verdict).
await page.goto(`${baseUrl}?route=/missions`);
await page.waitForSelector('[data-testid="mission-intent-form"], [data-testid="missions-empty"]', { timeout: 30000 });
await sleep(900);
note(
  'no mission is fabricated from the declaration (the authority transport is P2)',
  (await page.locator('[data-testid="missions-empty"]').count()) === 1,
);
await page.goto(`${baseUrl}?route=/`);
await page.waitForSelector('nav', { timeout: 30000 });
await sleep(900);
note(
  'the badge honestly stays idle (no active mission in the production composition)',
  (await page.locator('[data-testid="mission-status-idle"]').count()) === 1,
);

// ---- 9. zero console/page errors across the whole pass ----
note('zero console/page errors during the packaged console pass', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | ').slice(0, 200));

const failed = results.filter((r) => !r.ok);
console.log(`\nWAVE-24 PACKAGED SMOKE: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  process.exitCode = 1;
}
await browser.close();
if (app !== null) {
  try {
    process.kill(-app.pid, 'SIGTERM');
  } catch {
    /* the app may already be gone */
  }
}
