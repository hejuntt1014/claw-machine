import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:8787/';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 90000 });
await page.screenshot({ path: 'screenshots/0-start.png' });
await page.tap('#go', { force: true });
await page.waitForTimeout(1200);
await page.evaluate(() => window.__claw.setQuality(Number(new URL(location.href).searchParams.get('q') ?? 1)));
if (process.env.CAM) { await page.tap('#cam', { force: true }); await page.waitForTimeout(4000); }
await page.screenshot({ path: process.env.SHOT ?? 'screenshots/1-idle.png' }); if (process.env.SHORT) { console.log(errors); await browser.close(); process.exit(0); }
await page.tap('#insert', { force: true });
await page.waitForTimeout(300);
// drive joystick with touch: hold right+up for a while via pointer events
const box = await page.locator('#joy').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
await touch('touchStart', cx, cy);
for (let i = 1; i <= 10; i++) { await touch('touchMove', cx + i * 4, cy - i * 1.5); await page.waitForTimeout(30); }
await page.waitForTimeout(1600);
await page.screenshot({ path: 'screenshots/2-moving.png' });
await touch('touchEnd', 0, 0);
await page.waitForTimeout(500);
const before = await page.evaluate(() => ({ x: window.__claw.game.cx, z: window.__claw.game.cz, state: window.__claw.game.state }));
await page.tap('#grab', { force: true });
await page.waitForFunction(() => window.__claw.game.state === 'lift' && window.__claw.game.stateT > 0.4, null, { timeout: 240000 });
await page.screenshot({ path: 'screenshots/3-grab.png' });
// wait for round end
await page.waitForFunction(() => window.__claw.game.state === 'idle', null, { timeout: 240000 });
await page.waitForTimeout(400);
await page.screenshot({ path: 'screenshots/4-result.png' });
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
const after = await page.evaluate(() => ({ state: window.__claw.game.state, wins: window.__claw.game.roundWins, coins: document.querySelector('#coins b').textContent }));
console.log(JSON.stringify({ before, after, fps, errors }, null, 1));
await browser.close();
