import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { ClawGame, CARRIAGE_Y, HUB_HH, HOLE, BIN_FLOOR_Y, PRIZE_TYPES, type Prize, type ClawState, type ContactPt, type GameEvent } from './physics.ts';
import { buildMachine, buildRoom, M } from './models.ts';
import { buildPrize, disposePlush, setFurShells, type PlushModel } from './plush.ts';
import { burstTexture } from './textures.ts';
import { Sfx, vibrate } from './audio.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const ROUND_TIME = 30;
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ---------------- persistent state ----------------
const store = {
  get coins() { return Number(localStorage.getItem('claw_coins') ?? 10); },
  set coins(v: number) { localStorage.setItem('claw_coins', String(v)); },
  get bag(): Record<string, number> { try { return JSON.parse(localStorage.getItem('claw_bag') ?? '{}'); } catch { return {}; } },
  set bag(v) { localStorage.setItem('claw_bag', JSON.stringify(v)); },
};

// ---------------- renderer / scene ----------------
const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x140b22);
scene.fog = new THREE.Fog(0x140b22, 5, 11);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.75;

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 30);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minAzimuthAngle = -1.25; controls.maxAzimuthAngle = 1.25;
controls.minPolarAngle = 0.5; controls.maxPolarAngle = 1.55; controls.rotateSpeed = 0.6;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.enabled = false;

// lights
scene.add(new THREE.HemisphereLight(0xcfc4ff, 0x2a1638, 0.35));
const sun = new THREE.DirectionalLight(0xfff3e6, 1.9);
sun.position.set(0.08, 3.2, 0.25); scene.add(sun, sun.target);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -0.62, right: 0.62, top: 0.55, bottom: -0.55, near: 1.6, far: 4 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.012; sun.shadow.radius = 3;
const fill = new THREE.DirectionalLight(0xffd6ef, 0.8); fill.position.set(-1.5, 1.2, 3); scene.add(fill);
const rim = new THREE.PointLight(0x6fd8ff, 3, 4, 2); rim.position.set(1.2, 1.4, -0.8); scene.add(rim);
const inner = new THREE.SpotLight(0xfff0f8, 4, 2.2, 0.95, 0.7, 1.5); inner.position.set(0, 1.18, 0.15); scene.add(inner, inner.target);
const winLight = new THREE.PointLight(0xff5fb0, 0, 1.6, 2); winLight.position.set(HOLE.x0 + 0.14, 0.35, 0.5); scene.add(winLight);

// aim laser
const aim = new THREE.Mesh(new THREE.CircleGeometry(0.016, 24), new THREE.MeshBasicMaterial({ color: 0xff2050, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
aim.rotation.x = -Math.PI / 2; aim.renderOrder = 5; scene.add(aim);
const beamGeo = new THREE.CylinderGeometry(0.0016, 0.0016, 1, 6); beamGeo.translate(0, 0.5, 0);
const laser = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff2050, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false })); scene.add(laser);

// world
scene.add(buildRoom());
const machine = buildMachine(); scene.add(machine.root);
machine.root.traverse((o) => { o.castShadow = false; });
for (const o of [machine.beam, machine.carriage, machine.hub, machine.cable, ...machine.prongs]) o.traverse((c) => { c.castShadow = true; });

// ---------------- win overlay (rendered on top of the main frame) ----------------
const ovScene = new THREE.Scene();
ovScene.environment = envTex;
const ovCam = new THREE.PerspectiveCamera(40, 1, 0.05, 10);
ovScene.add(new THREE.HemisphereLight(0xffffff, 0x553366, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(0.6, 1, 1.2); ovScene.add(key);
const dim = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0x0a0414, transparent: true, opacity: 0, depthWrite: false }));
dim.position.z = -3; ovScene.add(dim);
const burst = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: burstTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }));
burst.position.set(0, 0.06, -1.3); ovScene.add(burst);
const CONF = 180;
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.022, 0.012), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONF);
confetti.frustumCulled = false; ovScene.add(confetti);
const conf = Array.from({ length: CONF }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 }));
const confColors = [0xff4f9a, 0xffd34d, 0x5ff4ff, 0x9b7bff, 0x6dff9c, 0xffffff].map((c) => new THREE.Color(c));
conf.forEach((_, i) => confetti.setColorAt(i, confColors[i % confColors.length]));
const ov = { active: false, t: 0, model: null as PlushModel | null };
function launchConfetti() {
  const hw = Math.tan(THREE.MathUtils.degToRad(20)) * 1.1 * ovCam.aspect;
  conf.forEach((c, i) => {
    const side = i % 2 ? 1 : -1;
    c.p.set(side * hw * 1.05, -0.45, -1.1 + Math.random() * 0.2);
    c.v.set(-side * (0.15 + Math.random() * 0.5) * hw * 3, 1.3 + Math.random() * 1.1, (Math.random() - 0.5) * 0.3);
    c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); c.w.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
    c.life = 3 + Math.random() * 1.5;
  });
}
function showWin(prize: Prize) {
  if (ov.model) { ovScene.remove(ov.model.group); disposePlush(ov.model); }
  const m = buildPrize(prize.type, prize.color); m.u.uFloorY.value = -100;
  ov.model = m; ovScene.add(m.group);
  ov.active = true; ov.t = 0;
  launchConfetti();
  $('winName').textContent = prize.type.name;
  $('winEmoji').textContent = prize.type.emoji;
  $('winSub').textContent = `已放入战利品袋 · 共收集 ${bagCount()} 个`;
  $('win').classList.add('show');
}
function hideWin() { $('win').classList.remove('show'); ov.active = false; }
$('winOk').addEventListener('click', () => { sfx.click(); hideWin(); });
const cMtx = new THREE.Matrix4(), cQ = new THREE.Quaternion(), cS = new THREE.Vector3(1, 1, 1);
function updateOverlay(dt: number) {
  if (!ov.active && ov.t <= 0) return false;
  ov.t += dt;
  const fadeIn = Math.min(1, ov.t / 0.4);
  (dim.material as THREE.MeshBasicMaterial).opacity = 0.55 * fadeIn * (ov.active ? 1 : 0);
  (burst.material as THREE.MeshBasicMaterial).opacity = 0.85 * fadeIn;
  burst.rotation.z += dt * 0.6; burst.scale.setScalar(0.9 + 0.06 * Math.sin(ov.t * 3));
  if (ov.model) {
    const k = Math.min(1, ov.t / 0.7); const pop = 1 + Math.sin(k * Math.PI) * 0.25 * (1 - k); const e = 1 - Math.pow(1 - k, 3);
    const vt = Math.tan(THREE.MathUtils.degToRad(ovCam.fov / 2)) * 1.1;
    const sc = Math.min((0.62 * 2 * vt * ovCam.aspect) / 0.11, (0.42 * 2 * vt) / 0.15) * e * pop;
    ov.model.group.scale.setScalar(sc);
    ov.model.group.position.set(0, 0.07 + Math.sin(ov.t * 2) * 0.012 - 0.035 * sc, -1.1);
    ov.model.group.rotation.set(0.15, ov.t * 1.4, Math.sin(ov.t * 1.7) * 0.08);
    const s = Math.sin(ov.t * 9) * Math.exp(-ov.t * 1.2) * 0.12; ov.model.u.uSquash.value.set(0, 1, 0, s);
  }
  for (let i = 0; i < CONF; i++) {
    const c = conf[i]; c.life -= dt;
    c.v.y -= 1.6 * dt; c.v.multiplyScalar(Math.exp(-1.4 * dt));
    c.p.addScaledVector(c.v, dt); c.p.x += Math.sin(ov.t * 5 + i) * 0.04 * dt;
    c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
    cS.setScalar(c.life > 0 ? 1 : 0);
    confetti.setMatrixAt(i, cMtx.compose(c.p, cQ.setFromEuler(c.r), cS));
  }
  confetti.instanceMatrix.needsUpdate = true;
  if (!ov.active) { ov.t = 0; return false; }
  return true;
}

// ---------------- post-processing / quality ----------------
const QUALITY = ['低', '中', '高'];
let quality = Number(params.get('q') ?? localStorage.getItem('claw_q') ?? (isTouch ? 1 : 2));
let composer: EffectComposer | null = null;
function applyQuality() {
  const dpr = Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][quality]);
  renderer.setPixelRatio(dpr);
  const ss = [512, 1024, 2048][quality];
  if (sun.shadow.mapSize.x !== ss) { sun.shadow.mapSize.set(ss, ss); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  setFurShells([0, 5, 9][quality]);
  composer?.dispose(); composer = null;
  if (quality > 0) {
    const w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w * dpr, h * dpr, { type: THREE.HalfFloatType, samples: quality === 2 ? 4 : 2 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(dpr);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new ShaderPass({ // sanitize HDR buffer (NaN/Inf guard) before bloom
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(0.0); gl_FragColor = vec4(clamp(c.rgb, 0.0, 12.0), 1.0); }',
    }));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.5, 0.3, 2.6));
    composer.addPass(new OutputPass());
  }
  $('q').textContent = QUALITY[quality];
  resize();
}

// camera framing
const target = new THREE.Vector3(0, 0.78, 0);
let views: { az: number; pol: number; dist: number }[] = [];
let viewIdx = 0;
let camAnim: { from: THREE.Spherical; to: THREE.Spherical; t: number } | null = null;
function fitDist() {
  const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.max(0.7 / (vt * camera.aspect), 1.2 / vt);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  ovCam.aspect = w / h; ovCam.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer?.setSize(w, h);
  const d = fitDist();
  views = [{ az: 0, pol: 1.22, dist: d }, { az: 0.95, pol: 1.15, dist: d * 1.2 }, { az: 0.0, pol: 0.62, dist: d * 0.86 }];
  controls.minDistance = d * 0.45; controls.maxDistance = d * 1.35;
}
function goView(i: number, instant = false) {
  viewIdx = i; const v = views[i];
  const to = new THREE.Spherical(v.dist, v.pol, v.az);
  if (instant) { camera.position.setFromSpherical(to).add(target); camera.lookAt(target); controls.update(); return; }
  camAnim = { from: new THREE.Spherical().setFromVector3(camera.position.clone().sub(target)), to, t: 0 };
}
window.addEventListener('resize', resize);

// ---------------- game ----------------
const sfx = new Sfx();
let game!: ClawGame;
const models = new Map<number, PlushModel>();
let timeLeft = 0, lastTick = 99, intro = true;
let coins = store.coins;
const ui = {
  coins: $('coins').querySelector('b')!, timer: $('timer').querySelector('b')!, bag: $('bag').querySelector('b')!,
  insert: $<HTMLButtonElement>('insert'), grab: $<HTMLButtonElement>('grab'), joy: $('joy'), knob: $('knob'), status: $('status'), toast: $('toast'), ring: $('ring'),
};
let toastT = 0;
function toast(html: string, lose = false, dur = 2.2) { ui.toast.innerHTML = html; ui.toast.classList.toggle('lose', lose); ui.toast.classList.add('show'); toastT = dur; }
function status(text: string) { if (text) ui.status.textContent = text; ui.status.classList.toggle('show', !!text); }
function bagCount() { return Object.values(store.bag).reduce((a, b) => a + b, 0); }
function refreshUI() {
  ui.coins.textContent = String(coins);
  ui.bag.textContent = String(bagCount());
  const st = game?.state ?? 'idle';
  const idle = st === 'idle', play = st === 'play';
  ui.insert.classList.toggle('gone', !idle);
  ui.insert.firstChild!.textContent = coins > 0 ? '投币开始' : '免费领 10 币';
  ui.grab.classList.toggle('gone', idle);
  ui.grab.classList.toggle('disabled', !play);
  ui.joy.classList.toggle('disabled', !play);
  if (!play) { ui.timer.textContent = '--'; ui.ring.style.setProperty('--p', '1'); }
  $('timer').classList.remove('warn');
  status({ idle: '', play: '移动爪子，对准娃娃后按「抓!」', descend: '下爪中…', close: '抓紧!', lift: '上升中…', hold: '上升中…', return: '送往出口…', release: '松爪', reset: '' }[st]);
}
function insertCoin() {
  sfx.unlock();
  if (game.state !== 'idle') return;
  hideWin();
  if (coins <= 0) { coins = 10; store.coins = coins; sfx.coin(); toast('🎁 送你 10 个币!', false, 1.6); refreshUI(); return; }
  coins--; store.coins = coins;
  sfx.coin(); vibrate(30);
  $('coins').classList.remove('bump'); void $('coins').offsetWidth; $('coins').classList.add('bump');
  game.startRound(); timeLeft = ROUND_TIME; lastTick = 99;
  refreshUI();
}
function doGrab() {
  if (game.state !== 'play') return;
  sfx.click(); vibrate([20, 30, 40]);
  game.drop();
}

// joystick
const joy = { x: 0, y: 0, id: -1 };
const keyIn = { x: 0, y: 0 };
function joyMove(e: PointerEvent) {
  const r = ui.joy.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width * 0.36; const l = Math.hypot(dx, dy);
  if (l > max) { dx *= max / l; dy *= max / l; }
  ui.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  const nx = dx / max, ny = -dy / max, m = Math.hypot(nx, ny), dead = 0.12;
  const k = m < dead ? 0 : (m - dead) / (1 - dead) / m;
  joy.x = nx * k; joy.y = ny * k;
}
ui.joy.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; ui.joy.setPointerCapture(e.pointerId); joyMove(e); vibrate(8); e.preventDefault(); });
ui.joy.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) joyMove(e); });
const joyEnd = (e: PointerEvent) => { if (e.pointerId !== joy.id) return; joy.id = -1; joy.x = joy.y = 0; ui.knob.style.transform = ''; };
ui.joy.addEventListener('pointerup', joyEnd); ui.joy.addEventListener('pointercancel', joyEnd);
ui.grab.addEventListener('pointerdown', (e) => { e.preventDefault(); doGrab(); });
ui.insert.addEventListener('click', insertCoin);
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (intro) return;
  if (e.code === 'Space') { e.preventDefault(); if (game.state === 'idle') insertCoin(); else doGrab(); }
  if (e.code === 'Enter') insertCoin();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
function readKeys() {
  keyIn.x = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  keyIn.y = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
}

// tool buttons
$('snd').addEventListener('click', () => { sfx.unlock(); sfx.setMuted(!sfx.muted); $('snd').textContent = sfx.muted ? '🔇' : '🔊'; });
$('cam').addEventListener('click', () => { sfx.click(); goView((viewIdx + 1) % views.length); });
$('q').addEventListener('click', () => { quality = (quality + 1) % 3; localStorage.setItem('claw_q', String(quality)); autoQ = false; applyQuality(); toast(`画质: ${QUALITY[quality]}`, true, 1.0); });
$('bag').addEventListener('click', () => {
  const bag = store.bag; const list = $('bagList'); list.innerHTML = '';
  for (const t of PRIZE_TYPES) { const n = bag[t.id] ?? 0; const d = document.createElement('div'); d.className = 'it' + (n ? '' : ' none'); d.innerHTML = `<span>${t.emoji}</span>${t.name}<b>× ${n}</b>`; list.appendChild(d); }
  $('drawer').classList.remove('hidden');
});
$('closeBag').addEventListener('click', () => $('drawer').classList.add('hidden'));

// ---------------- events ----------------
let winFlash = 0, lastThud = 0;
function onEvent(e: GameEvent) {
  switch (e.type) {
    case 'spawn': { const m = buildPrize(e.prize.type, e.prize.color); models.set(e.prize.uid, m); scene.add(m.group); break; }
    case 'remove': { const m = models.get(e.prize.uid); if (m) { scene.remove(m.group); disposePlush(m); models.delete(e.prize.uid); } break; }
    case 'win': {
      const bag = store.bag; bag[e.prize.type.id] = (bag[e.prize.type.id] ?? 0) + 1; store.bag = bag;
      sfx.chute(); vibrate([60, 40, 60, 40, 200]); winFlash = 4;
      setTimeout(() => { sfx.win(); sfx.confetti(); showWin(e.prize); }, 350);
      refreshUI(); break;
    }
    case 'impact': if (e.strength > 0.8 && game.time - lastThud > 0.08) { lastThud = game.time; sfx.thud(e.strength); } break;
    case 'clank': sfx.clank(); vibrate(25); break;
    case 'state': refreshUI(); break;
    case 'roundEnd':
      if (!e.won) { sfx.lose(); toast(['差一点点!', '爪子松了… 再来!', '好可惜! 再试一次', '换个角度试试?'][Math.floor(Math.random() * 4)], true, 2); }
      refreshUI(); break;
  }
}

// ---------------- sync visuals ----------------
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), invQ = new THREE.Quaternion(), down = new THREE.Vector3(0, -1, 0);
const bulbColor = new THREE.Color();
const contacts = new Map<Prize, ContactPt[]>();
function inHole(x: number, z: number) { return x < HOLE.x1 + 0.03 && z > HOLE.z0 - 0.03; }
function syncVisuals(dt: number, t: number) {
  game.gatherProngContacts(contacts);
  for (const p of game.prizes) {
    const m = models.get(p.uid); if (!m) continue;
    const tr = p.body.translation(), rq = p.body.rotation();
    m.group.position.set(tr.x, tr.y, tr.z); m.group.quaternion.set(rq.x, rq.y, rq.z, rq.w);
    invQ.copy(m.group.quaternion).invert();
    m.u.uCenter.value.set(tr.x, tr.y, tr.z);
    m.u.uFloorY.value = p.won ? BIN_FLOOR_Y : inHole(tr.x, tr.z) ? -10 : 0;
    // squash spring (impacts) + squeeze bulge when gripped
    const cs = contacts.get(p);
    const grip = cs && cs.length >= 2 ? -0.07 : 0;
    p.squashV += (-900 * (p.squash - grip) - 16 * p.squashV) * dt;
    p.squash = Math.max(-0.2, Math.min(0.25, p.squash + p.squashV * dt));
    tmpV.set(0, 1, 0).applyQuaternion(invQ);
    m.u.uSquash.value.set(tmpV.x, tmpV.y, tmpV.z, p.squash);
    // prong dents (contact points -> local space)
    const dents = m.u.uDent.value;
    for (const d of dents) d.w *= Math.exp(-12 * dt);
    if (cs) {
      let n = 0;
      for (const c of cs) {
        if (n >= 3) break;
        tmpV2.set(c.x - tr.x, c.y - tr.y, c.z - tr.z).applyQuaternion(invQ);
        let dup = false; for (let j = 0; j < n; j++) if (Math.hypot(dents[j].x - tmpV2.x, dents[j].y - tmpV2.y, dents[j].z - tmpV2.z) < 0.015) dup = true;
        if (dup) continue;
        const w = Math.min(0.012, 0.004 + c.imp * 0.6);
        dents[n].set(tmpV2.x, tmpV2.y, tmpV2.z, Math.max(dents[n].w, w)); n++;
      }
    }
  }
  const h = game.hub.translation(), hq = game.hub.rotation();
  machine.hub.position.set(h.x, h.y, h.z); machine.hub.quaternion.set(hq.x, hq.y, hq.z, hq.w);
  game.prongs.forEach((b, i) => { const p = b.translation(), q = b.rotation(); machine.prongs[i].position.set(p.x, p.y, p.z); machine.prongs[i].quaternion.set(q.x, q.y, q.z, q.w); });
  machine.carriage.position.set(game.cx, 0, game.cz);
  machine.beam.position.z = game.cz;
  const top = tmpV.set(game.cx, CARRIAGE_Y - 0.02, game.cz);
  const hubTop = tmpV2.set(0, HUB_HH + 0.03, 0).applyQuaternion(machine.hub.quaternion).add(machine.hub.position);
  const dir = hubTop.sub(top); const len = dir.length();
  machine.cable.position.copy(top); machine.cable.quaternion.setFromUnitVectors(down, dir.normalize()); machine.cable.scale.set(1, len, 1);
  // marquee + LEDs
  const n = machine.bulbs.count; const chase = Math.floor(t * 9);
  for (let i = 0; i < n; i++) {
    if (winFlash > 0) bulbColor.setHSL((i * 0.05 + t * 2) % 1, 1, Math.floor(t * 12) % 2 ? 0.75 : 0.25);
    else bulbColor.setHSL((i / n + t * 0.08) % 1, 0.9, (i + chase) % 4 === 0 ? 0.8 : 0.32);
    machine.bulbs.setColorAt(i, bulbColor.multiplyScalar(5));
  }
  machine.bulbs.instanceColor!.needsUpdate = true;
  M.ledPink.emissive.setHSL((0.9 + Math.sin(t * 0.7) * 0.08) % 1, 1, 0.55);
  M.ledPink.emissiveIntensity = winFlash > 0 ? 6 + 6 * Math.abs(Math.sin(t * 20)) : 5;
  M.ledCyan.emissiveIntensity = 4.5 + Math.sin(t * 3) * 1.2;
  winLight.intensity = winFlash > 0 ? 3 * Math.abs(Math.sin(t * 10)) : 0;
  winFlash = Math.max(0, winFlash - dt);
  const showAim = game.state === 'play';
  aim.visible = laser.visible = showAim;
  if (showAim) {
    const sy = game.probeSurface();
    aim.position.set(h.x, sy + 0.004, h.z); aim.scale.setScalar(1 + 0.25 * Math.sin(t * 8));
    laser.position.set(h.x, sy, h.z); laser.scale.set(1, Math.max(0.01, h.y - HUB_HH - sy), 1);
  }
}

// ---------------- main loop ----------------
let acc = 0, last = performance.now(), fpsAcc = 0, fpsN = 0, autoQ = !params.has('noauto') && !localStorage.getItem('claw_q'), playStart = 0, wasMoving = false;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game.state === 'play') {
    readKeys();
    let ix = joy.x + keyIn.x, iy = joy.y + keyIn.y; const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const fwd = tmpV.copy(target).sub(camera.position); fwd.y = 0; fwd.normalize();
    game.input.x = -fwd.z * ix + fwd.x * iy; game.input.z = fwd.x * ix + fwd.z * iy;
    timeLeft -= dt;
    const sec = Math.ceil(Math.max(0, timeLeft));
    ui.timer.textContent = String(sec); ui.ring.style.setProperty('--p', String(Math.max(0, timeLeft / ROUND_TIME)));
    if (sec <= 5 && sec !== lastTick) { lastTick = sec; $('timer').classList.add('warn'); sfx.tick(); }
    if (timeLeft <= 0) doGrab();
  }
  acc += dt; let steps = 0;
  while (acc >= 1 / 120 && steps < 6) { game.step(1 / 120); acc -= 1 / 120; steps++; }
  if (steps === 6) acc = 0;
  // motor sounds
  const st: ClawState = game.state;
  const spd = Math.hypot(game.vx, game.vz);
  const moving = spd > 0.02;
  if (moving !== wasMoving) { sfx.gantry(moving); wasMoving = moving; }
  if (st === 'descend' || st === 'lift') sfx.motorLevel(0.9, st === 'lift' ? 1.25 : 1.05);
  else sfx.motorLevel(Math.min(1, spd / 0.18), 0.8 + spd * 2.2);
  // camera
  if (intro) {
    const v = views[0]; const tt = now / 1000;
    camera.position.setFromSpherical(new THREE.Spherical(v.dist * 1.3, 1.25 + Math.sin(tt * 0.31) * 0.05, Math.sin(tt * 0.22) * 0.7)).add(target);
    camera.lookAt(tmpV.set(0, target.y - 0.95, 0));
  } else if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt / 0.8); const k = 1 - Math.pow(1 - camAnim.t, 3);
    const s = new THREE.Spherical(THREE.MathUtils.lerp(camAnim.from.radius, camAnim.to.radius, k), THREE.MathUtils.lerp(camAnim.from.phi, camAnim.to.phi, k), THREE.MathUtils.lerp(camAnim.from.theta, camAnim.to.theta, k));
    camera.position.setFromSpherical(s).add(target); camera.lookAt(target);
    if (camAnim.t >= 1) camAnim = null;
  }
  if (!intro && !(window as any).__claw?.closeup) controls.update();
  syncVisuals(dt, now / 1000);
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) ui.toast.classList.remove('show'); }
  if (composer) composer.render(); else renderer.render(scene, camera);
  if (updateOverlay(dt)) {
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(ovScene, ovCam); renderer.autoClear = true;
  }
  if (autoQ && playStart && now - playStart > 1500) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 3) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < 42 && quality > 0) { quality--; applyQuality(); toast(`已自动切换画质: ${QUALITY[quality]}`, true, 1.4); }
      else autoQ = false;
    }
  }
}

// ---------------- boot ----------------
async function boot() {
  const bar = $('bar'), txt = $('loadTxt');
  applyQuality(); goView(0, true);
  bar.style.width = '15%'; txt.textContent = '正在加载物理引擎…';
  const RAPIER = await import('@dimforge/rapier3d');
  bar.style.width = '50%'; txt.textContent = '正在摆放娃娃…';
  await new Promise((r) => setTimeout(r, 30));
  game = new ClawGame(RAPIER as any);
  game.on(onEvent);
  game.fill(22);
  bar.style.width = '80%'; txt.textContent = '正在编译着色器…';
  await new Promise((r) => setTimeout(r, 30));
  renderer.compile(scene, camera);
  bar.style.width = '100%'; txt.textContent = '准备就绪!';
  refreshUI();
  requestAnimationFrame(frame);
  $('start').classList.add('ready');
  const go = $<HTMLButtonElement>('go'); go.disabled = false;
  go.addEventListener('click', () => {
    sfx.unlock(); sfx.startBgm(); sfx.coin(); vibrate(20);
    $('start').classList.add('hide'); playStart = performance.now();
    intro = false; controls.enabled = true; document.body.classList.remove('intro'); goView(0);
  });
  (window as any).__claw = { game, insertCoin, doGrab, joy, camera, setQuality: (q: number) => { quality = q; applyQuality(); }, showWin, ov, setCam: (p: number[], t: number[]) => { camAnim = null; (window as any).__claw.closeup = true; camera.position.set(p[0], p[1], p[2]); camera.lookAt(t[0], t[1], t[2]); } };
}
boot().catch((e) => { console.error(e); $('loadTxt').textContent = '加载失败: ' + e; });
