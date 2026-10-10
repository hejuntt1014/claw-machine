# 抓娃娃 · Claw Machine

A mobile-first 3D claw machine that runs in the browser. It aims to look like a real machine in a Chinese mall arcade. **Play: https://hejuntt1014.github.io/claw-machine/**

![idle](screenshots/1-idle.png)

- **Look:** everything is procedural, with no model or image files. The cabinet is painted sheet metal with scratches, edge wear and grime, plus aluminium posts and a backlit header lightbox. The front glass has smudges, fingerprints, dust and ceiling-light reflections. You'll also find a faded printed backboard, instruction and warning stickers, a QR-pay sticker, a stainless coin plate and a worn joystick and button. Lighting is restrained: cool-white fluorescent tubes in the cabinet, dim warm mall lights, an environment map built from a mall interior, ACES tone mapping, and light film grain and vignette. There is no bloom.
- **Physics:** Rapier3D (WASM). The claw is a kinematic hub that swings on its cable, with three prongs on motorized revolute joints. Grip strength is random each round and weakens after lifting, like a real machine.
- **Plush toys:** built in code with a sheen-fabric shader, fibre normals, stitched seams, fur shells, sewn-in care tags, and colours that are muted and vary per toy. Each toy differs slightly in size, stitching and ear angle. The toys are dropped in waves, so they form a natural pile. Vertex deformation gives them a soft feel: they squash on impact, dent under the prongs and sag on the floor.
- **UI:** a 7-segment LED readout for coins, time and prizes, a physical joystick, a coin-slot button and a big red push button. When you win, the toy drops into the pickup window with a thud, the door lamp blinks, the camera dips to show it and a plain card names the prize.
- **Sound:** synthesized mechanical sounds: coin clinks, motor whine with gear noise, the solenoid clunk, the chute thud and the machine's two-tone chime, over faint room tone. There is no music.

## Dev
```
npm install
npm run dev        # dev server
npm run build      # static build -> dist/ (base /claw-machine/; VITE_BASE=./ for other hosts)
npm test           # headless physics simulation of grab rounds
```

Controls: the joystick or arrow keys/WASD move the claw, and the red button or Space drops it. Drag to change the angle, pinch to zoom, and use the camera button to switch views.
