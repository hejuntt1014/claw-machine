// close-up, real win into the pickup window, side view
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:8787/?q=2&noauto';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(240000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(url);
await page.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 120000 });
await page.tap('#go', { force: true });
await page.waitForTimeout(5000);
// close-up of the plush pile
if (!process.env.WINONLY) {
await page.evaluate(() => { const p = window.__claw.game.prizes.filter(p => !p.won).sort((a, b) => b.body.translation().z - a.body.translation().z)[3].body.translation(); window.__claw.setCam([p.x + 0.05, p.y + 0.2, p.z + 0.45], [p.x, p.y, p.z - 0.05]); });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'screenshots/6-plush-closeup.png' });
}
await page.evaluate(() => { window.__claw.closeup = false; });
// real win: drop a toy straight into the chute and let physics + game logic handle it
await page.evaluate(() => { const g = window.__claw.game; const p = g.prizes.filter(p => !p.won && p.type.id === 'bear')[0] ?? g.prizes[0]; p.body.setTranslation({ x: -0.36, y: 0.25, z: 0.27 }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); });
await page.waitForFunction(() => document.getElementById('win').classList.contains('show'));
await page.waitForTimeout(1500);
await page.waitForFunction(() => !window.__claw.camAnimating());
await page.waitForTimeout(1000);
await page.screenshot({ path: 'screenshots/7-win-pickup.png' });
const binY = await page.evaluate(() => window.__claw.game.prizes.filter(p => p.won).map(p => +p.body.translation().y.toFixed(3)));
await page.tap('#winOk', { force: true });
await page.waitForTimeout(2500);
const afterTake = await page.evaluate(() => window.__claw.game.prizes.filter(p => p.won).length);
console.log(JSON.stringify({ binY, afterTake }));
if (process.env.WINONLY) { console.log(JSON.stringify(errors)); await browser.close(); process.exit(0); }
await page.waitForTimeout(800);
await page.waitForFunction(() => !window.__claw.camBusy());
await page.tap('#cam', { force: true });
await page.waitForTimeout(500);
await page.waitForFunction(() => !window.__claw.camBusy());
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/5-side-view.png' });
console.log(JSON.stringify({ errors, win: await page.evaluate(() => document.getElementById('winName').textContent) }));
await browser.close();
