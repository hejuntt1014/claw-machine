import RAPIER from '@dimforge/rapier3d-compat';
import { ClawGame, BIN_FLOOR_Y } from '../src/physics.ts';
await RAPIER.init();
const g = new ClawGame(RAPIER as any); g.fill(12);
const res: string[] = [];
for (let k = 0; k < 10; k++) {
  const p = g.prizes.filter(q => !q.won)[0];
  p.body.setTranslation({ x: -0.36 + (k % 3 - 1) * 0.05, y: 0.25, z: 0.2 + (k % 2) * 0.12 }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  for (let i = 0; i < 600; i++) g.step(1 / 120);
  const t = p.body.translation(); res.push(`${p.type.id}:${t.y.toFixed(2)}/${t.z.toFixed(2)}${g.prizes.includes(p) ? '' : '(removed)'}`);
}
const h = g.hub.translation();
console.log('binFloor', BIN_FLOOR_Y, 'hub', h.x.toFixed(2), h.y.toFixed(2), h.z.toFixed(2), res.join(' '));
