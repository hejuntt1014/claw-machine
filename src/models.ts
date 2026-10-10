import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CAB, HOLE, PRONG_PTS, PRONG_RADIUS, HUB_R, HUB_HH, CARRIAGE_Y } from './physics.ts';
import { fabricNormal, feltTexture, backdropTexture, signTexture, tileTexture, labelTexture, glassStreaks, grilleTexture } from './textures.ts';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------- materials ----------------
export const M = {
  paint: new THREE.MeshPhysicalMaterial({ color: 0xff4f9a, metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
  paint2: new THREE.MeshPhysicalMaterial({ color: 0x6d4bff, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
  white: new THREE.MeshPhysicalMaterial({ color: 0xf6f0ff, metalness: 0.0, roughness: 0.35, clearcoat: 0.8 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 1, roughness: 0.12 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x2a2a33, metalness: 0.8, roughness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0d0a14, roughness: 0.9 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0xd8204a, roughness: 0.55 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.1, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide, specularIntensity: 1 }),
  acrylic: new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.28, envMapIntensity: 2, depthWrite: false, side: THREE.DoubleSide }),
  ledPink: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3fa8, emissiveIntensity: 3 }),
  ledCyan: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3ff0ff, emissiveIntensity: 3 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff4e6, emissiveIntensity: 3.5 }),
  eye: new THREE.MeshPhysicalMaterial({ color: 0x0b0b10, roughness: 0.08, clearcoat: 1 }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  nose: new THREE.MeshPhysicalMaterial({ color: 0x3a2018, roughness: 0.3, clearcoat: 0.6 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xff9a2e, roughness: 0.75 }),
  blush: new THREE.MeshStandardMaterial({ color: 0xff7f9f, roughness: 1, transparent: true, opacity: 0.75, depthWrite: false }),
};

// ---------------- machine ----------------
export interface MachineParts {
  root: THREE.Group;
  beam: THREE.Object3D; carriage: THREE.Object3D; cable: THREE.Mesh;
  hub: THREE.Object3D; prongs: THREE.Object3D[];
  bulbs: THREE.InstancedMesh; leds: THREE.MeshStandardMaterial[];
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}

export function buildMachine(): MachineParts {
  const root = new THREE.Group();
  const { hx, hz, top } = CAB;
  const OX = 0.58, OZ = 0.5, PH = 1.0;
  // lower cabinet body (behind the front panel)
  mesh(new RoundedBoxGeometry(OX * 2, PH - 0.012, 0.72, 4, 0.03), M.paint, 0, -PH / 2 - 0.006, -0.14, root);
  // front panel with prize door hole (extruded)
  const shape = new THREE.Shape();
  const r = 0.03;
  shape.moveTo(-OX + r, -PH); shape.lineTo(OX - r, -PH); shape.quadraticCurveTo(OX, -PH, OX, -PH + r);
  const T = -0.016; shape.lineTo(OX, T - r); shape.quadraticCurveTo(OX, T, OX - r, T); shape.lineTo(-OX + r, T); shape.quadraticCurveTo(-OX, T, -OX, T - r);
  shape.lineTo(-OX, -PH + r); shape.quadraticCurveTo(-OX, -PH, -OX + r, -PH);
  const door = new THREE.Path(); const d = { x0: -0.49, x1: -0.23, y0: -0.75, y1: -0.47 };
  door.moveTo(d.x0 + 0.02, d.y0); door.lineTo(d.x1 - 0.02, d.y0); door.quadraticCurveTo(d.x1, d.y0, d.x1, d.y0 + 0.02); door.lineTo(d.x1, d.y1 - 0.02);
  door.quadraticCurveTo(d.x1, d.y1, d.x1 - 0.02, d.y1); door.lineTo(d.x0 + 0.02, d.y1); door.quadraticCurveTo(d.x0, d.y1, d.x0, d.y1 - 0.02); door.lineTo(d.x0, d.y0 + 0.02); door.quadraticCurveTo(d.x0, d.y0, d.x0 + 0.02, d.y0);
  shape.holes.push(door);
  const fp = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 8 }), M.paint);
  fp.position.z = 0.22 - 0.008; fp.castShadow = fp.receiveShadow = true; root.add(fp);
  // door interior + flap
  mesh(new THREE.PlaneGeometry(0.3, 0.3), M.dark, (d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, 0.225, root, false);
  const flap = mesh(new THREE.PlaneGeometry(d.x1 - d.x0, d.y1 - d.y0), M.acrylic, (d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, 0.5, root, false);
  flap.renderOrder = 2;
  const doorLbl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), new THREE.MeshBasicMaterial({ map: labelTexture('取物口', '#ffffff'), transparent: true, toneMapped: false }));
  doorLbl.position.set((d.x0 + d.x1) / 2, d.y1 + 0.05, 0.509); root.add(doorLbl);
  // decorative stripe + coin slot + speaker
  mesh(new THREE.BoxGeometry(OX * 2 + 0.01, 0.025, 0.02), M.ledCyan, 0, -0.9, 0.505, root, false);
  mesh(new RoundedBoxGeometry(OX * 2 + 0.012, 0.09, 0.04, 2, 0.01), M.white, 0, -0.985, 0.49, root);
  mesh(new RoundedBoxGeometry(0.12, 0.2, 0.02, 2, 0.008), M.darkMetal, 0.36, -0.6, 0.51, root);
  mesh(new THREE.BoxGeometry(0.008, 0.05, 0.01), M.ledPink, 0.36, -0.57, 0.522, root, false);
  const coinLbl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.035), new THREE.MeshBasicMaterial({ map: labelTexture('投币', '#ffd34d'), transparent: true, toneMapped: false }));
  coinLbl.position.set(0.36, -0.66, 0.522); root.add(coinLbl);
  // speaker grilles + price sticker
  const grilleMat = new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.6, metalness: 0.4, transparent: true });
  for (const x of [-0.05, 0.13]) { const g = mesh(new THREE.CircleGeometry(0.055, 32), grilleMat, x, -0.6, 0.509, root, false); g.renderOrder = 1; }
  const price = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshStandardMaterial({ map: labelTexture('1币 / 局', '#5a2a00', '#ffd34d', 256, 96, 'bold 52px sans-serif'), roughness: 0.5 }));
  price.position.set(0.36, -0.44, 0.51); root.add(price);
  // control ledge
  const ledge = mesh(new RoundedBoxGeometry(OX * 2, 0.06, 0.16, 3, 0.02), M.paint2, 0, -0.03, 0.56, root);
  ledge.rotation.x = 0.18;
  const stick = new THREE.Group(); stick.position.set(-0.22, 0.0, 0.57); root.add(stick);
  mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.012, 24), M.darkMetal, 0, 0.0, 0, stick);
  mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 10), M.chrome, 0, 0.035, 0, stick);
  mesh(new THREE.SphereGeometry(0.02, 20, 14), M.rubber, 0, 0.075, 0, stick);
  const btn = mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.02, 32), new THREE.MeshPhysicalMaterial({ color: 0xff2d55, emissive: 0xff2d55, emissiveIntensity: 0.6, roughness: 0.2, clearcoat: 1 }), 0.2, 0.01, 0.57, root);
  btn.name = 'grabButton';

  // corner posts
  const postG = new RoundedBoxGeometry(0.07, top + 0.02, 0.07, 3, 0.015);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(postG, M.paint2, sx * (hx + 0.035), top / 2, sz * (hz + 0.035), root);
  // LED strips on front posts (inner edge)
  const leds = [M.ledPink, M.ledCyan];
  const ledG = new THREE.BoxGeometry(0.012, top - 0.04, 0.012);
  mesh(ledG, M.ledPink, -hx - 0.005, top / 2, hz + 0.072, root, false);
  mesh(ledG, M.ledPink, hx + 0.005, top / 2, hz + 0.072, root, false);
  // glass panes
  const front = mesh(new THREE.PlaneGeometry(hx * 2, top), M.glass, 0, top / 2, hz + 0.01, root, false); front.renderOrder = 3;
  for (const s of [-1, 1]) { const g = mesh(new THREE.PlaneGeometry(hz * 2, top), M.glass, s * (hx + 0.01), top / 2, 0, root, false); g.rotation.y = Math.PI / 2; g.renderOrder = 3; }
  // reflective streaks on the glass (cheap fake reflections)
  const streakMat = new THREE.MeshBasicMaterial({ map: glassStreaks(), transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const fs1 = mesh(new THREE.PlaneGeometry(hx * 2, top), streakMat, 0, top / 2, hz + 0.013, root, false); fs1.renderOrder = 4;
  for (const s of [-1, 1]) { const g = mesh(new THREE.PlaneGeometry(hz * 2, top), streakMat, s * (hx + 0.013), top / 2, 0, root, false); g.rotation.y = s * Math.PI / 2; g.renderOrder = 4; }
  // chrome trims framing the front glass
  mesh(new THREE.BoxGeometry(hx * 2 + 0.02, 0.018, 0.016), M.chrome, 0, 0.009, hz + 0.018, root);
  mesh(new THREE.BoxGeometry(hx * 2 + 0.02, 0.018, 0.016), M.chrome, 0, top - 0.009, hz + 0.018, root);
  // screws on posts
  const screwG = new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 12); screwG.rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) for (const y of [0.12, 0.6, 1.08]) mesh(screwG, M.chrome, sx * (hx + 0.035), y, hz + 0.071, root, false);
  // under-canopy light bar
  mesh(new THREE.BoxGeometry(hx * 2 - 0.04, 0.012, 0.012), M.ceiling, 0, top - 0.02, hz - 0.02, root, false);
  // back printed panel
  const back = mesh(new THREE.PlaneGeometry(hx * 2, top), new THREE.MeshStandardMaterial({ map: backdropTexture(), roughness: 0.5, emissive: 0xffffff, emissiveMap: backdropTexture(), emissiveIntensity: 0.25 }), 0, top / 2, -hz - 0.002, root, false);
  back.receiveShadow = true;
  // interior floor (felt) with hole cut out
  const fs = new THREE.Shape();
  fs.moveTo(-hx, -hz); fs.lineTo(hx, -hz); fs.lineTo(hx, hz); fs.lineTo(HOLE.x1, hz); fs.lineTo(HOLE.x1, HOLE.z0); fs.lineTo(-hx, HOLE.z0); fs.lineTo(-hx, -hz);
  // shape is in XY, rotate so Y -> -Z  (we flip z sign by building with -z)
  const fGeo = new THREE.ShapeGeometry(fs); fGeo.rotateX(Math.PI / 2); // y -> z
  const uv = fGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.2, uv.getY(i) * 1.2);
  const floor = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.4, 0.4), side: THREE.DoubleSide }));
  floor.receiveShadow = true; floor.position.y = 0.003; root.add(floor);
  // chute pit
  const pitW = HOLE.x1 - HOLE.x0, pitD = HOLE.z1 - HOLE.z0, pitH = 0.4;
  const pit = new THREE.Mesh(new THREE.BoxGeometry(pitW, pitH, pitD), new THREE.MeshStandardMaterial({ color: 0x120e1a, roughness: 0.9, side: THREE.BackSide }));
  pit.position.set((HOLE.x0 + HOLE.x1) / 2, -pitH / 2 - 0.002, (HOLE.z0 + HOLE.z1) / 2); root.add(pit);
  // acrylic barrier + glowing edge + label
  const bh = 0.11;
  const b1 = mesh(new THREE.PlaneGeometry(pitW, bh), M.acrylic, (HOLE.x0 + HOLE.x1) / 2, bh / 2, HOLE.z0 - 0.004, root, false); b1.renderOrder = 2;
  const b2 = mesh(new THREE.PlaneGeometry(pitD, bh), M.acrylic, HOLE.x1 + 0.004, bh / 2, (HOLE.z0 + HOLE.z1) / 2, root, false); b2.rotation.y = Math.PI / 2; b2.renderOrder = 2;
  mesh(new THREE.BoxGeometry(pitW, 0.006, 0.008), M.ledCyan, (HOLE.x0 + HOLE.x1) / 2, bh, HOLE.z0 - 0.004, root, false);
  mesh(new THREE.BoxGeometry(0.008, 0.006, pitD), M.ledCyan, HOLE.x1 + 0.004, bh, (HOLE.z0 + HOLE.z1) / 2, root, false);
  const exitLbl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ map: labelTexture('↓ 出口', '#7ff6ff'), transparent: true, toneMapped: false, depthWrite: false }));
  exitLbl.position.set((HOLE.x0 + HOLE.x1) / 2, bh * 0.55, HOLE.z0 - 0.001); root.add(exitLbl);

  // canopy + sign
  mesh(new RoundedBoxGeometry(OX * 2, 0.34, OZ * 2 - 0.04, 4, 0.03), M.paint, 0, top + 0.17, -0.0, root);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.24), new THREE.MeshStandardMaterial({ map: signTexture(), emissive: 0xffffff, emissiveMap: signTexture(), emissiveIntensity: 1.1, roughness: 0.4 }));
  sign.position.set(0, top + 0.17, OZ - 0.015); root.add(sign);
  // marquee bulbs
  const bulbPos: THREE.Vector3[] = [];
  const bw = 1.04, bhh = 0.3, n = 16, m = 5;
  for (let i = 0; i <= n; i++) { const x = -bw / 2 + (i / n) * bw; bulbPos.push(V(x, top + 0.17 + bhh / 2, OZ - 0.01)); }
  for (let i = 1; i < m; i++) bulbPos.push(V(bw / 2, top + 0.17 + bhh / 2 - (i / m) * bhh, OZ - 0.01));
  for (let i = n; i >= 0; i--) { const x = -bw / 2 + (i / n) * bw; bulbPos.push(V(x, top + 0.17 - bhh / 2, OZ - 0.01)); }
  for (let i = m - 1; i >= 1; i--) bulbPos.push(V(-bw / 2, top + 0.17 + bhh / 2 - (i / m) * bhh, OZ - 0.01));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), bulbPos.length);
  const mtx = new THREE.Matrix4();
  bulbPos.forEach((p, i) => { bulbs.setMatrixAt(i, mtx.makeTranslation(p.x, p.y, p.z)); bulbs.setColorAt(i, new THREE.Color(1, 1, 1)); });
  root.add(bulbs);
  // interior light panel
  const ceil = mesh(new THREE.PlaneGeometry(hx * 1.6, hz * 1.4), M.ceiling, 0, top - 0.003, 0, root, false); ceil.rotation.x = Math.PI / 2;

  // gantry
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.022, 0.022, hz * 2), M.chrome, s * (hx - 0.012), CARRIAGE_Y + 0.035, 0, root);
  const beam = new THREE.Group(); root.add(beam);
  mesh(new THREE.BoxGeometry(hx * 2 - 0.02, 0.022, 0.03), M.chrome, 0, CARRIAGE_Y + 0.025, 0, beam);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.04, 0.035, 0.05), M.darkMetal, s * (hx - 0.012), CARRIAGE_Y + 0.035, 0, beam);
  const carriage = new THREE.Group(); root.add(carriage);
  mesh(new RoundedBoxGeometry(0.075, 0.05, 0.07, 2, 0.008), M.darkMetal, 0, CARRIAGE_Y + 0.005, 0, carriage);
  const pul = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 16), M.chrome, 0, CARRIAGE_Y - 0.02, 0, carriage); pul.rotation.z = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.03, 0.006, 0.072), M.ledPink, 0, CARRIAGE_Y + 0.031, 0, carriage, false);
  // cable
  const cg = new THREE.CylinderGeometry(0.0022, 0.0022, 1, 6); cg.translate(0, -0.5, 0);
  const cable = mesh(cg, M.darkMetal, 0, 0, 0, root);

  // claw hub
  const hub = new THREE.Group(); root.add(hub);
  mesh(new THREE.CylinderGeometry(HUB_R, HUB_R * 0.92, HUB_HH * 2, 28), M.chrome, 0, 0, 0, hub);
  mesh(new THREE.CylinderGeometry(0.012, HUB_R * 0.95, 0.032, 28), M.chrome, 0, HUB_HH + 0.016, 0, hub);
  const ring = mesh(new THREE.TorusGeometry(HUB_R + 0.002, 0.0045, 8, 32), M.ledPink, 0, 0.004, 0, hub, false); ring.rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 10), M.darkMetal, 0, -HUB_HH - 0.004, 0, hub);
  // prongs (geometry in prong-body local frame)
  const prongs: THREE.Object3D[] = [];
  for (const az of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) {
    const g = new THREE.Group(); root.add(g);
    const inner = new THREE.Group(); inner.rotation.y = az; g.add(inner);
    const curve = new THREE.CatmullRomCurve3(PRONG_PTS.map(([rr, y]) => V(rr, y, 0)), false, 'centripetal');
    mesh(new THREE.TubeGeometry(curve, 28, PRONG_RADIUS, 8, false), M.chrome, 0, 0, 0, inner);
    const last = PRONG_PTS[PRONG_PTS.length - 1], prev = PRONG_PTS[PRONG_PTS.length - 2];
    const tip = mesh(new THREE.CapsuleGeometry(PRONG_RADIUS * 1.3, 0.02, 4, 10), M.rubber, (last[0] + prev[0]) / 2, (last[1] + prev[1]) / 2, 0, inner);
    tip.quaternion.setFromUnitVectors(V(0, 1, 0), V(last[0] - prev[0], last[1] - prev[1], 0).normalize());
    const pin = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 10), M.darkMetal, 0, 0, 0, inner); pin.rotation.x = Math.PI / 2;
    prongs.push(g);
  }
  return { root, beam, carriage, cable, hub, prongs, bulbs, leds };
}

// ---------------- arcade room ----------------
export function buildRoom(): THREE.Group {
  const room = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.28, metalness: 0.15 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.0; floor.receiveShadow = true; room.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.9 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), wallMat); wall.position.set(0, 2, -3); room.add(wall);
  // neon on back wall
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: labelTexture('GAME  CENTER', '#ff5bc8', 'rgba(0,0,0,0)', 512, 128, 'bold 72px sans-serif'), transparent: true, toneMapped: false }));
  neon.position.set(0, 2.3, -2.98); room.add(neon);
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0x5ff4ff, toneMapped: false });
  const tube = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.015, 8, 48), tubeMat); tube.position.set(-2.2, 2.2, -2.97); room.add(tube);
  const tube2 = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.015, 8, 3), new THREE.MeshBasicMaterial({ color: 0xffd34d, toneMapped: false })); tube2.position.set(2.2, 2.25, -2.97); room.add(tube2);
  // silhouettes of other machines
  const cols = [0x4b8cff, 0x2fd6a3, 0xffb02e, 0xb46bff];
  [-2.1, -1.35, 1.35, 2.1].forEach((x, i) => {
    const g = new THREE.Group(); g.position.set(x * 1.15, -1, -2.0 - (i % 2) * 0.3);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.9, 0.6), new THREE.MeshStandardMaterial({ color: new THREE.Color(cols[i]).multiplyScalar(0.45), roughness: 0.4, metalness: 0.2 }));
    body.position.y = 0.95; g.add(body);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i]).multiplyScalar(0.6), toneMapped: false }));
    win.position.set(0, 1.25, 0.301); g.add(win);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    top.position.set(0, 1.8, 0.31); g.add(top);
    room.add(g);
  });
  return room;
}
