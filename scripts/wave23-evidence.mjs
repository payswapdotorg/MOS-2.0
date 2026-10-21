import { chromium } from 'playwright-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EVIDENCE = '/home/z/MOS-2.0/evidence/wave23';
import { mkdirSync } from 'node:fs';
mkdirSync(EVIDENCE, { recursive: true });
let browser = null;
for (let i = 0; i < 10 && !browser; i += 1) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:9224', { timeout: 1500 }); } catch { await sleep(1000); }
}
if (!browser) { console.log('NO CDP'); process.exit(1); }
const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html')) ?? browser.contexts()[0].pages()[0];
console.log('page:', page.url().slice(0, 80));
await sleep(800);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-home-mos-identity.png` });
await page.goto('file:///home/z/MOS-2.0/packages/desktop/dist/linux-unpacked/resources/app.asar/out/renderer/index.html?route=/console');
await page.waitForSelector('[data-testid="console-workspace"]', { timeout: 30000 });
await sleep(900);
await page.screenshot({ path: `${EVIDENCE}/packaged-app-console-mos-identity.png` });
const footer = await page.locator('footer').textContent().catch(() => 'NO FOOTER');
console.log('FOOTER:', footer.slice(0, 120));
await browser.close().catch(() => undefined);
console.log('DONE');
