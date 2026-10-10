import RAPIER from '@dimforge/rapier3d-compat';
import { ClawGame, LIMITS } from '../src/physics.ts';
await RAPIER.init();
let seed = Number(process.argv[2] ?? 1);
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const g = new ClawGame(RAPIER, rng);
g.fill(Number(process.argv[3] ?? 20));
let wins = 0, lifted = 0, rounds = Number(process.argv[4] ?? 12);
g.on((e) => { if (e.type === 'win') wins++; });
const t0 = performance.now(); let steps = 0;
for (let r = 0; r < rounds; r++) {
  g.startRound();
  // pick a random prize that is reachable, move above it
  const cand = g.prizes.filter(p => !p.won).map(p => p.body.translation()).filter(t => t.x > LIMITS.x0 && t.x < LIMITS.x1 && t.z > LIMITS.z0 && t.z < LIMITS.z1 && t.y > 0);
  const tgt = cand[Math.floor(rng() * cand.length)];
  for (let i = 0; i < 1200; i++) {
    const dx = tgt.x - g.cx, dz = tgt.z - g.cz; const d = Math.hypot(dx, dz);
    if (d < 0.006) { g.input.x = g.input.z = 0; if (Math.hypot(g.vx, g.vz) < 0.01) break; }
    else { g.input.x = Math.max(-1, Math.min(1, dx * 8)); g.input.z = Math.max(-1, Math.min(1, dz * 8)); }
    g.step(1 / 120); steps++;
  }
  for (let i = 0; i < 60; i++) { g.step(1/120); steps++; }
  g.drop();
  let maxH = 0, heldAtTop = false;
  for (let i = 0; i < 120 * 15 && g.state !== 'idle'; i++) {
    g.step(1 / 120); steps++;
    if (g.state === 'hold' || g.state === 'return') {
      const h = g.prizes.filter(p => !p.won).some(p => p.body.translation().y > 0.6);
      if (h && g.state === 'return') heldAtTop = true;
    }
  }
  const pv = g.prongs[0].translation(), hv = g.hub.translation();
  if (heldAtTop) lifted++;
  console.log(`round ${r}: grip=${g.grip.toFixed(2)} weak=${g.weak.toFixed(2)} target=(${tgt.x.toFixed(2)},${tgt.y.toFixed(2)},${tgt.z.toFixed(2)}) heldAtTop=${heldAtTop} wins=${wins} state=${g.state} prongOff=${(pv.y-hv.y).toFixed(3)}`);
}
console.log(`wins ${wins}/${rounds}, carried ${lifted}, prizes ${g.prizes.length}, ${(steps/((performance.now()-t0)/1000)).toFixed(0)} steps/s`);
