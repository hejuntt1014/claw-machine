// close-up + win overlay screenshots
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:8787/?q=2&noauto';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(url);
await page.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 90000 });
await page.screenshot({ path: 'screenshots/0-start.png' });
await page.tap('#go', { force: true });
await page.waitForTimeout(6000);
await page.screenshot({ path: 'screenshots/1-idle.png' });
// close-up of the plush pile
await page.evaluate(() => { const p = window.__claw.game.prizes.filter(p => !p.won).sort((a, b) => b.body.translation().z - a.body.translation().z)[2].body.translation(); window.__claw.setCam([p.x + 0.04, p.y + 0.2, p.z + 0.42], [p.x, p.y, p.z - 0.05]); });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'screenshots/6-plush-closeup.png' });
await page.evaluate(() => { window.__claw.closeup = false; window.__claw.showWin(window.__claw.game.prizes.find(p => p.type.id === 'bunny') ?? window.__claw.game.prizes[0]); });
await page.waitForTimeout(9000);
await page.screenshot({ path: 'screenshots/7-win-overlay.png' });
console.log(JSON.stringify(errors));
await browser.close();
