# 抓娃娃 · Claw Machine

A mobile-first 3D claw machine that runs in the browser. It aims to look like a real machine in a Chinese mall arcade. **Play: https://hejuntt1014.github.io/claw-machine/**

![idle](screenshots/1-idle.png)

- **Look:** everything is procedural, with no model or image files. The cabinet is painted sheet metal with scratches, edge wear and grime, plus aluminium posts and a backlit header lightbox. The front glass has smudges, fingerprints, dust and ceiling-light reflections. You'll also find a faded printed backboard, instruction and warning stickers, a QR-pay sticker, a stainless coin plate and a worn joystick and button. Lighting is restrained: cool-white fluorescent tubes in the cabinet, dim warm mall lights, an environment map built from a mall interior, ACES tone mapping, and light film grain and vignette. There is no bloom.
- **Physics:** Rapier3D (WASM). The claw is a kinematic hub that swings on its cable, with three prongs on motorized revolute joints. Grip strength is random each round and weakens after lifting, like a real machine.
- **Plush toys:** built in code with a sheen-fabric shader, fibre normals, stitched seams, fur shells, sewn-in care tags, and colours that are muted and vary per toy. Each toy differs slightly in size, stitching and ear angle. The toys are dropped in waves, so they form a natural pile. Vertex deformation gives them a soft feel: they squash on impact, dent under the prongs and sag on the floor.
- **UI:** a 7-segment LED readout for coins, time and prizes, a physical joystick, a coin-slot button and a big red push button. When you win, the toy drops into the pickup window with a thud, the door lamp blinks, the camera dips to show it and a plain card names the prize.
- **Sound:** synthesized mechanical sounds: coin clinks, motor whine with gear noise, the solenoid clunk, the chute thud and the machine's two-tone chime, over faint room tone. There is no music.

- **Desktop & mobile:** portrait phones get an LED board on top and a control deck at the bottom. Landscape phones and desktop (16:9 to ultrawide) get control columns either side of the machine, which sits in a row of neighbouring cabinets. The game respects safe-area insets and resizes on window or orientation changes. Page scroll, pinch zoom, pull-to-refresh and long-press menus are blocked. Audio unlocks on the first tap. Low-end devices start on 低 quality; desktop starts on 高 with 4K shadows and MSAA.
- **Input:** touch or mouse joystick (click and hold), and drag or wheel to move the camera. Keyboard: WASD/arrows move, Space drops, Enter/C inserts a coin, V or 1/2/3 switch views, M mutes, F toggles fullscreen, Esc closes. Gamepad: stick or d-pad moves, A drops, X/Start inserts a coin, Y changes the view.

## Dev
```
npm install
npm run dev        # dev server
npm run build      # static build -> dist/ (base /claw-machine/; VITE_BASE=./ for other hosts)
npm test           # headless physics simulation of grab rounds
```


