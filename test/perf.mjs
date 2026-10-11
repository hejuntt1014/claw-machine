// headless JS frame-cost + draw-call measurement (SwiftShader: CPU ms are inflated, compare relatively)
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:8787/?q=1&noauto';
const W = Number(process.env.W ?? 390), H = Number(process.env.H ?? 844);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
await page.goto(url); await page.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 120000 });
await page.click('#go', { force: true }); await page.waitForTimeout(4000);
const r = await page.evaluate(async () => {
  const c = window.__claw; c.perf.cpu.length = 0;
  // JS-only cost: time scene update + render submission without GPU wait isn't separable in SwiftShader,
  // so also time physics+sync alone
  const t0 = performance.now(); for (let i = 0; i < 240; i++) c.game.step(1 / 120); const phys = (performance.now() - t0) / 240;
  await new Promise((res) => setTimeout(res, 6000));
  const a = [...c.perf.cpu].sort((x, y) => x - y);
  return { frames: a.length, cpuMedianMs: +a[Math.floor(a.length / 2)]?.toFixed(1), cpuP95Ms: +a[Math.floor(a.length * 0.95)]?.toFixed(1), physStepMs: +phys.toFixed(3), calls: c.perf.calls, tris: c.perf.tris, geometries: c.perf.geo, textures: c.perf.tex, heapMB: +(performance.memory?.usedJSHeapSize / 1048576 || 0).toFixed(1) };
});
console.log(JSON.stringify(r));
await browser.close();
