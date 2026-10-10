import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CAB, HOLE, PRONG_PTS, PRONG_RADIUS, HUB_R, HUB_HH, CARRIAGE_Y } from './physics.ts';
import { fabricNormal, labelTexture, paintWear, glassSmudge, backboardPrint, headerSign, instructionSticker, warningSticker, qrSticker, coinPlate, floorTiles, feltPlain, glassReflection } from './textures.ts';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const wear = paintWear();
const wearClean = paintWear(false);

// ---------------- materials (restrained, physically plausible) ----------------
export const M = {
  paintWhite: new THREE.MeshPhysicalMaterial({ color: 0xe6e0d4, map: wear, roughness: 0.42, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
  paintRed: new THREE.MeshPhysicalMaterial({ color: 0xa63a31, map: wear, roughness: 0.45, metalness: 0.1, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  kick: new THREE.MeshStandardMaterial({ color: 0x3b3b3e, map: wear, roughness: 0.6, metalness: 0.4 }),
  alu: new THREE.MeshStandardMaterial({ color: 0xb7babe, map: wearClean, roughness: 0.38, metalness: 0.9 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd8d9dc, roughness: 0.22, metalness: 1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8e9196, roughness: 0.4, metalness: 0.9 }),
  blackPlastic: new THREE.MeshStandardMaterial({ color: 0x1d1d20, map: wearClean, roughness: 0.62, metalness: 0 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0f0f12, roughness: 0.9 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x8a2a24, roughness: 0.7 }),
  ballRed: new THREE.MeshPhysicalMaterial({ color: 0xb3261e, map: wearClean, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.5 }),
  buttonRed: new THREE.MeshPhysicalMaterial({ color: 0xc0322a, map: wearClean, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.45, transmission: 0 }),
  glassTint: new THREE.MeshStandardMaterial({ color: 0xd8e6e0, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
  // reflection-only layer: black base + additive blending -> shows env reflections, keeps glass clear
  glassRefl: new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, envMapIntensity: 4.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.03 }),
  acrylic: new THREE.MeshStandardMaterial({ color: 0xcfe0e6, roughness: 0.12, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  smoked: new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  tube: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xeef3ff, emissiveIntensity: 2.6 }),
  doorLamp: new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: 0xffa640, emissiveIntensity: 0.0, roughness: 0.4 }),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
function decal(map: THREE.Texture, w: number, h: number, x: number, y: number, z: number, parent: THREE.Object3D, rotZ = 0, rough = 0.55) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: rough, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(x, y, z); m.rotation.z = rotZ; m.receiveShadow = true; parent.add(m); return m;
}

export interface MachineParts {
  root: THREE.Group;
  beam: THREE.Object3D; carriage: THREE.Object3D; cable: THREE.Mesh;
  hub: THREE.Object3D; prongs: THREE.Object3D[];
  doorPos: THREE.Vector3;
}

export function buildMachine(): MachineParts {
  const root = new THREE.Group();
  const { hx, hz, top } = CAB;
  const OX = 0.58, OZ = 0.5, PH = 1.0;
  // ---- lower cabinet ----
  mesh(new RoundedBoxGeometry(OX * 2, PH - 0.012, 0.72, 3, 0.012), M.paintWhite, 0, -PH / 2 - 0.006, -0.14, root);
  mesh(new RoundedBoxGeometry(OX * 2 + 0.006, 0.1, 1.0, 2, 0.01), M.kick, 0, -PH + 0.05, 0.0, root); // kick plate
  // front panel with prize-door opening
  const T = -0.016, r = 0.012;
  const shape = new THREE.Shape();
  shape.moveTo(-OX + r, -PH + 0.1); shape.lineTo(OX - r, -PH + 0.1); shape.lineTo(OX, -PH + 0.1 + r);
  shape.lineTo(OX, T - r); shape.lineTo(OX - r, T); shape.lineTo(-OX + r, T); shape.lineTo(-OX, T - r); shape.lineTo(-OX, -PH + 0.1 + r);
  const d = { x0: -0.48, x1: -0.24, y0: -0.7, y1: -0.45 };
  const door = new THREE.Path(); door.moveTo(d.x0, d.y0); door.lineTo(d.x1, d.y0); door.lineTo(d.x1, d.y1); door.lineTo(d.x0, d.y1); door.lineTo(d.x0, d.y0);
  shape.holes.push(door);
  const fp = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 }), [M.paintWhite, M.kick]);
  fp.position.z = 0.216; fp.castShadow = fp.receiveShadow = true; root.add(fp);
  // red band under the control ledge
  mesh(new THREE.BoxGeometry(OX * 2 + 0.004, 0.07, 0.01), M.paintRed, 0, -0.085, 0.503, root);
  // door: dark interior, aluminium frame, smoked flap, lamp strip
  mesh(new THREE.PlaneGeometry(0.3, 0.3), M.dark, (d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, 0.222, root, false);
  const fw = d.x1 - d.x0, fh = d.y1 - d.y0, cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2;
  for (const [w, h, x, y] of [[fw + 0.03, 0.015, cx, d.y1 + 0.0075], [fw + 0.03, 0.015, cx, d.y0 - 0.0075], [0.015, fh, d.x0 - 0.0075, cy], [0.015, fh, d.x1 + 0.0075, cy]] as const)
    mesh(new THREE.BoxGeometry(w, h, 0.012), M.alu, x, y, 0.506, root);
  const flap = mesh(new THREE.PlaneGeometry(fw, fh * 0.62), M.smoked, cx, d.y1 - fh * 0.31, 0.49, root, false); flap.rotation.x = 0.12; flap.renderOrder = 2; flap.receiveShadow = false;
  mesh(new THREE.BoxGeometry(fw + 0.03, 0.008, 0.006), M.doorLamp, cx, d.y1 + 0.02, 0.511, root, false);
  decal(labelTexture('取物口', '#333', '#efe9dd', 192, 64, `bold 40px sans-serif`), 0.09, 0.03, cx, d.y1 + 0.045, 0.5005, root);
  // stickers + coin plate
  decal(warningSticker(), 0.15, 0.06, cx, -0.3, 0.5004, root, 0.01);
  decal(instructionSticker(), 0.16, 0.21, 0.04, -0.42, 0.5004, root, -0.015);
  decal(qrSticker(), 0.1, 0.127, 0.4, -0.27, 0.5004, root, 0.02);
  decal(coinPlate(), 0.1, 0.15, 0.4, -0.55, 0.505, root, 0, 0.3);
  mesh(new THREE.BoxGeometry(0.104, 0.154, 0.006), M.steel, 0.4, -0.55, 0.501, root);
  // control ledge (black plastic), joystick, push button
  const ledge = mesh(new RoundedBoxGeometry(OX * 2, 0.06, 0.16, 2, 0.012), M.blackPlastic, 0, -0.03, 0.56, root);
  ledge.rotation.x = 0.16;
  const stick = new THREE.Group(); stick.position.set(-0.2, 0.004, 0.565); stick.rotation.x = 0.16; root.add(stick);
  mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.008, 28), M.chrome, 0, 0, 0, stick);
  mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.012, 20), M.dark, 0, 0.008, 0, stick);
  mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.07, 10), M.steel, 0, 0.04, 0, stick);
  mesh(new THREE.SphereGeometry(0.019, 24, 16), M.ballRed, 0, 0.08, 0, stick);
  const btn = new THREE.Group(); btn.position.set(0.2, 0.006, 0.565); btn.rotation.x = 0.16; root.add(btn);
  mesh(new THREE.CylinderGeometry(0.045, 0.047, 0.012, 32), M.chrome, 0, 0, 0, btn);
  mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.016, 32), M.buttonRed, 0, 0.01, 0, btn);
  // ---- upper: aluminium posts, glass, backboard ----
  const postG = new RoundedBoxGeometry(0.05, top + 0.02, 0.05, 2, 0.006);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(postG, M.alu, sx * (hx + 0.025), top / 2, sz * (hz + 0.025), root);
  mesh(new THREE.BoxGeometry(hx * 2 + 0.1, 0.03, 0.05), M.alu, 0, 0.0, hz + 0.025, root); // bottom rail
  // glass panes: tint + reflections (+ smudges on the front)
  const smudge = new THREE.MeshBasicMaterial({ map: glassSmudge(), transparent: true, opacity: 0.2, depthWrite: false });
  const reflMat = new THREE.MeshBasicMaterial({ map: glassReflection(), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
  const addPane = (w: number, x: number, z: number, ry: number, smudged: boolean) => {
    const g = new THREE.PlaneGeometry(w, top);
    const a = mesh(g, M.glassTint, x, top / 2, z, root, false); a.rotation.y = ry; a.renderOrder = 3;
    const b = mesh(g, M.glassRefl, x, top / 2, z, root, false); b.rotation.y = ry; b.renderOrder = 4;
    if (smudged) {
      const c = mesh(g, smudge, x, top / 2, z + 0.001, root, false); c.rotation.y = ry; c.renderOrder = 5;
      const r = mesh(g, reflMat, x, top / 2, z + 0.0015, root, false); r.rotation.y = ry; r.renderOrder = 6;
    }
  };
  addPane(hx * 2, 0, hz + 0.01, 0, true);
  addPane(hz * 2, -hx - 0.01, 0, -Math.PI / 2, false);
  addPane(hz * 2, hx + 0.01, 0, Math.PI / 2, false);
  const bb = backboardPrint();
  const back = mesh(new THREE.PlaneGeometry(hx * 2, top), new THREE.MeshStandardMaterial({ map: bb, roughness: 0.6, emissive: 0xffffff, emissiveMap: bb, emissiveIntensity: 0.18 }), 0, top / 2, -hz - 0.002, root, false);
  back.receiveShadow = true;
  // play-field floor (felt) with the hole cut out
  const fs = new THREE.Shape();
  fs.moveTo(-hx, -hz); fs.lineTo(hx, -hz); fs.lineTo(hx, hz); fs.lineTo(HOLE.x1, hz); fs.lineTo(HOLE.x1, HOLE.z0); fs.lineTo(-hx, HOLE.z0); fs.lineTo(-hx, -hz);
  const fGeo = new THREE.ShapeGeometry(fs); fGeo.rotateX(Math.PI / 2);
  const floor = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({ map: feltPlain(), roughness: 0.97, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide }));
  floor.receiveShadow = true; floor.position.y = 0.003; root.add(floor);
  // drop chute + acrylic barrier with a printed label
  const pitW = HOLE.x1 - HOLE.x0, pitD = HOLE.z1 - HOLE.z0, pitH = 0.4;
  const pit = new THREE.Mesh(new THREE.BoxGeometry(pitW, pitH, pitD), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9, side: THREE.BackSide }));
  pit.position.set((HOLE.x0 + HOLE.x1) / 2, -pitH / 2 - 0.002, (HOLE.z0 + HOLE.z1) / 2); root.add(pit);
  const bh = 0.11;
  const b1 = mesh(new THREE.PlaneGeometry(pitW, bh), M.acrylic, (HOLE.x0 + HOLE.x1) / 2, bh / 2, HOLE.z0 - 0.004, root, false); b1.renderOrder = 2;
  const b2 = mesh(new THREE.PlaneGeometry(pitD, bh), M.acrylic, HOLE.x1 + 0.004, bh / 2, (HOLE.z0 + HOLE.z1) / 2, root, false); b2.rotation.y = Math.PI / 2; b2.renderOrder = 2;
  mesh(new THREE.BoxGeometry(pitW, 0.006, 0.006), M.alu, (HOLE.x0 + HOLE.x1) / 2, bh, HOLE.z0 - 0.004, root);
  mesh(new THREE.BoxGeometry(0.006, 0.006, pitD), M.alu, HOLE.x1 + 0.004, bh, (HOLE.z0 + HOLE.z1) / 2, root);
  const exitLbl = decal(labelTexture('出口', '#b02a22', '#f4f0e8', 160, 64, 'bold 40px sans-serif'), 0.07, 0.028, (HOLE.x0 + HOLE.x1) / 2, bh * 0.62, HOLE.z0 - 0.0015, root);
  (exitLbl.material as THREE.MeshStandardMaterial).transparent = false;
  // ---- header lightbox ----
  mesh(new RoundedBoxGeometry(OX * 2, 0.3, OZ * 2 - 0.04, 2, 0.012), M.paintWhite, 0, top + 0.15, 0, root);
  mesh(new THREE.BoxGeometry(OX * 2 + 0.004, 0.022, OZ * 2 - 0.036), M.paintRed, 0, top + 0.011, 0, root);
  const sign = headerSign();
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.26), new THREE.MeshStandardMaterial({ map: sign, emissive: 0xfff3e0, emissiveMap: sign, emissiveIntensity: 0.85, roughness: 0.3 }));
  signM.position.set(0, top + 0.155, OZ - 0.016); root.add(signM);
  // fluorescent tubes inside the top of the cabinet
  const tubeG = new THREE.CylinderGeometry(0.009, 0.009, hx * 2 - 0.1, 12); tubeG.rotateZ(Math.PI / 2);
  mesh(tubeG, M.tube, 0, top - 0.025, hz - 0.04, root, false);
  mesh(tubeG, M.tube, 0, top - 0.025, -hz + 0.06, root, false);
  mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), M.dark, 0, top - 0.002, 0, root, false).rotation.x = Math.PI / 2;
  // ---- gantry ----
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.02, 0.025, hz * 2), M.alu, s * (hx - 0.012), CARRIAGE_Y + 0.035, 0, root);
  const beam = new THREE.Group(); root.add(beam);
  mesh(new THREE.BoxGeometry(hx * 2 - 0.02, 0.02, 0.028), M.alu, 0, CARRIAGE_Y + 0.025, 0, beam);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.04, 0.035, 0.05), M.blackPlastic, s * (hx - 0.012), CARRIAGE_Y + 0.035, 0, beam);
  const carriage = new THREE.Group(); root.add(carriage);
  mesh(new RoundedBoxGeometry(0.075, 0.05, 0.07, 2, 0.006), M.blackPlastic, 0, CARRIAGE_Y + 0.005, 0, carriage);
  const pul = mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.018, 16), M.steel, 0, CARRIAGE_Y - 0.02, 0, carriage); pul.rotation.z = Math.PI / 2;
  const cg = new THREE.CylinderGeometry(0.0018, 0.0018, 1, 6); cg.translate(0, -0.5, 0);
  const cable = mesh(cg, M.steel, 0, 0, 0, root);
  // ---- claw ----
  const hub = new THREE.Group(); root.add(hub);
  mesh(new THREE.CylinderGeometry(HUB_R, HUB_R * 0.94, HUB_HH * 2, 28), M.chrome, 0, 0, 0, hub);
  mesh(new THREE.CylinderGeometry(0.014, HUB_R * 0.95, 0.034, 24), M.blackPlastic, 0, HUB_HH + 0.017, 0, hub);
  mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 10), M.steel, 0, -HUB_HH - 0.004, 0, hub);
  const prongs: THREE.Object3D[] = [];
  for (const az of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) {
    const g = new THREE.Group(); root.add(g);
    const inner = new THREE.Group(); inner.rotation.y = az; g.add(inner);
    const curve = new THREE.CatmullRomCurve3(PRONG_PTS.map(([rr, y]) => V(rr, y, 0)), false, 'centripetal');
    mesh(new THREE.TubeGeometry(curve, 28, PRONG_RADIUS, 8, false), M.chrome, 0, 0, 0, inner);
    const last = PRONG_PTS[PRONG_PTS.length - 1], prev = PRONG_PTS[PRONG_PTS.length - 2];
    const tip = mesh(new THREE.CapsuleGeometry(PRONG_RADIUS * 1.3, 0.02, 4, 10), M.rubber, (last[0] + prev[0]) / 2, (last[1] + prev[1]) / 2, 0, inner);
    tip.quaternion.setFromUnitVectors(V(0, 1, 0), V(last[0] - prev[0], last[1] - prev[1], 0).normalize());
    const pin = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 10), M.steel, 0, 0, 0, inner); pin.rotation.x = Math.PI / 2;
    prongs.push(g);
  }
  return { root, beam, carriage, cable, hub, prongs, doorPos: V(cx, cy, 0.5) };
}

// ---------------- mall arcade surroundings ----------------
export function buildRoom(): THREE.Group {
  const room = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: floorTiles(), roughness: 0.35, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.0; floor.receiveShadow = true; room.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.9 })); wall.position.set(0, 2, -3.2); room.add(wall);
  // neighbouring machines (dim, varied, out of focus by fog)
  const cols = [0x3c6e9e, 0xc9b9a0, 0x8a3b34, 0x4f6b4a];
  [-1.55, -0.95, 0.95, 1.6].forEach((x, i) => {
    const g = new THREE.Group(); g.position.set(x * 1.2, -1, -1.9 - (i % 2) * 0.35); g.rotation.y = (i - 1.5) * 0.08;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.1, 0.62), new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.5, metalness: 0.15 }));
    body.position.y = 1.05; g.add(body);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff1dc, emissiveIntensity: 0.35 }));
    win.position.set(0, 1.3, 0.311); g.add(win);
    const head = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.16), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff7ea, emissiveIntensity: 0.6 }));
    head.position.set(0, 1.95, 0.312); g.add(head);
    room.add(g);
  });
  return room;
}

/** environment used for lighting + reflections: a mall interior with rows of ceiling panels */
export function buildEnvScene(): THREE.Scene {
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 16), new THREE.MeshStandardMaterial({ color: 0x6b655e, side: THREE.BackSide, roughness: 1 }));
  box.position.y = 1.5; s.add(box);
  const panel = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff4e4, emissiveIntensity: 9 });
  for (let x = -6; x <= 6; x += 2.4) for (let z = -6; z <= 6; z += 2.4) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.35), panel); p.rotation.x = Math.PI / 2; p.position.set(x, 3.95, z); s.add(p); }
  const shop = (c: number, x: number, z: number, ry: number, w = 3, i = 1.6) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.2), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: i })); m.position.set(x, 1.2, z); m.rotation.y = ry; s.add(m); };
  shop(0xf0e6d6, 0, 7.9, Math.PI, 6, 2.2); shop(0xd9a46a, -7.9, 2, Math.PI / 2); shop(0x9fb7c9, 7.9, -1, -Math.PI / 2); shop(0xd77b6a, 3, 7.9, Math.PI, 1.5, 1.4);
  s.add(new THREE.HemisphereLight(0xfff2e0, 0x40382f, 0.6));
  return s;
}
