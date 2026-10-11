# 爪爪乐 · PAW PLAY

A mobile-first 3D claw machine in the browser, styled after current Chinese mall Gen-2 cabinets (white glossy body, bright accent, LED rims, circular PRIZE OUT). **Play: https://hejuntt1014.github.io/claw-machine/**

![idle](screenshots/1-idle.png)

- **Look:** procedural Gen-2 cabinet — white clearcoat body, pink/yellow/cyan accent themes (chip on the HUD), aluminium frame, breathing LED edge strips, backlit “爪爪乐 / PAW PLAY” lightbox, cute geometric backboard with an original blob mascot (not a licensed IP), circular illuminated 取物口, caster wheels. Neighbouring machines share the same language. Soft glass UI cards replace the old retro LED board.
- **Physics:** Rapier3D (WASM). Pendulum claw, motorized prongs, random grip, chute → pickup window, take-out animation.
- **Desktop & mobile:** portrait deck / landscape side columns, keyboard + mouse + touch + gamepad, theme chips, fullscreen, safe-area insets.

## UI / hints
- One toast at a time, top-centre under the HUD (icon + title + detail), 200 ms fade/slide: 投币成功 · 请先投币 · 剩余 5 秒 · 抓住了！· 差一点 / 滑掉了 / 没抓住 (classified from what the claw actually carried)
- Persistent state chip above the drop button (投币开始游戏 / 对准娃娃 / 下爪中… spinner)
- First-run 3-step guide (skippable, remembered; replay from 设置), out-of-coins sheet, settings popover (配色 · 画质 · 声音), win card with live 3D turntable of the prize, collection grid
- Screenshots of every state: `screenshots/hints/` (m-* phone portrait, d-* desktop) — regenerate with `node test/hints.mjs`

## Performance
`node test/perf.mjs` (headless SwiftShader): mobile 中画质 653 → 512 draw calls, 2.34M → 1.06M triangles; desktop 高画质 790 → 544 calls, 3.61M → 1.57M triangles; JS heap 62 → 47 MB.

## Dev
```
npm install
npm run dev
npm run build      # base /claw-machine/; VITE_BASE=./ for other hosts
npm test
```
