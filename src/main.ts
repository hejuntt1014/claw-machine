import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { ClawGame, CARRIAGE_Y, HUB_HH, HOLE, BIN_FLOOR_Y, PRIZE_TYPES, type Prize, type ClawState, type ContactPt, type GameEvent } from './physics.ts';
import { buildMachine, buildRoom, buildEnvScene, applyTheme, M, type MachineParts } from './models.ts';
import { THEMES, type Theme } from './themes.ts';
import { buildPrize, disposePlush, setFurShells, type PlushModel } from './plush.ts';
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e4de);
scene.fog = new THREE.Fog(0xe8e4de, 6, 14);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(buildEnvScene(), 0.02).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.65;

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 30);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minAzimuthAngle = -1.0; controls.maxAzimuthAngle = 1.0;
controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.62; controls.rotateSpeed = 0.55;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.enabled = false;

// lights: dim warm mall ceiling + the cabinet's own cool-white tubes
scene.add(new THREE.HemisphereLight(0xfff5f0, 0xc8c0b8, 0.55));
const sun = new THREE.DirectionalLight(0xfff8f2, 1.5); // the cabinet tubes, as a shadow-casting key
sun.position.set(0.05, 3.2, 0.35); scene.add(sun, sun.target);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -0.62, right: 0.62, top: 0.55, bottom: -0.55, near: 1.6, far: 4 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.012; sun.shadow.radius = 4;
const fill = new THREE.DirectionalLight(0xffe8f0, 0.9); fill.position.set(-0.8, 2.6, 3.2); scene.add(fill);
const inner = new THREE.SpotLight(0xfff5fa, 2.8, 2.2, 1.0, 0.8, 1.5); inner.position.set(0, 1.17, 0.3); scene.add(inner, inner.target);
const doorLight = new THREE.PointLight(0xffb060, 0, 0.5, 2); doorLight.position.set(-0.3, -0.52, 0.44); scene.add(doorLight);

// laser aiming dot (many newer machines have one); no beam
// guide under the claw: soft contact shadow + theme-coloured target ring with a centre dot
const aim = new THREE.Group(); scene.add(aim);
const aimRingMat = new THREE.MeshBasicMaterial({ color: THEMES[0].led, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
{ const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(0.6, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.017, 0.021, 32), aimRingMat);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 16), aimRingMat);
  for (const m of [sh, ring, dot]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 5; aim.add(m); }
  ring.position.y = dot.position.y = 0.001; }

// world
scene.add(buildRoom());
let themeIdx = Number(localStorage.getItem('claw_theme') ?? 0) % THEMES.length;
const machine = buildMachine(THEMES[themeIdx]); scene.add(machine.root);
applyTheme(machine, THEMES[themeIdx]);
function setTheme(i: number) {
  themeIdx = ((i % THEMES.length) + THEMES.length) % THEMES.length;
  localStorage.setItem('claw_theme', String(themeIdx));
  applyTheme(machine, THEMES[themeIdx]);
  const t = THEMES[themeIdx];
  document.documentElement.style.setProperty('--accent', t.accentHex);
  document.documentElement.style.setProperty('--accent-soft', '#' + t.accentSoft.toString(16).padStart(6, '0'));
  document.documentElement.style.setProperty('--accent-dark', '#' + t.dark.toString(16).padStart(6, '0'));
  document.querySelectorAll('#themes button').forEach((b, j) => b.classList.toggle('on', j === themeIdx));
  aimRingMat.color.setHex(t.led);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#' + t.accentSoft.toString(16).padStart(6, '0'));
}
{ const bin = new THREE.Mesh(new THREE.BoxGeometry(0.238, 0.04, 0.27), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 })); bin.position.set(machine.doorPos.x, BIN_FLOOR_Y - 0.021, 0.34); bin.receiveShadow = true; scene.add(bin); }
machine.root.traverse((o) => { o.castShadow = false; });
for (const o of [machine.beam, machine.carriage, machine.hub, machine.cable, ...machine.prongs]) o.traverse((c) => { c.castShadow = true; });

// ---------------- win: prize drops into the pickup window, lamp blinks, a plain card ----------------
let winNo = 0, doorBlink = 0, doorHold = 0, doorCam = 0;
function showWin(prize: Prize) {
  winNo++;
  $('winName').textContent = prize.type.name;
  $('winSub').textContent = `${prize.colorName} · 你的第 ${bagCount()} 个奖品`;
  startPreview(prize);
  $('win').classList.add('show');
  goDoor(); doorCam = 3.5;
}
// small turntable preview of the won toy, rendered once per frame into its own little canvas
let prev: { r: THREE.WebGLRenderer; s: THREE.Scene; c: THREE.PerspectiveCamera } | null = null, prevModel: PlushModel | null = null, prevOn = false;
function startPreview(prize: Prize) {
  const cv = $<HTMLCanvasElement>('winPrev');
  if (!prev) {
    try {
      const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'low-power' });
      r.setPixelRatio(1); r.setSize(240, 240, false); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
      const s = new THREE.Scene(); s.add(new THREE.HemisphereLight(0xffffff, 0xe6d8de, 2.4));
      const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(0.6, 1.4, 1.6); s.add(d);
      const c = new THREE.PerspectiveCamera(28, 1, 0.01, 5); prev = { r, s, c };
    } catch { cv.style.display = 'none'; return; }
  }
  if (prevModel) { prev.s.remove(prevModel.group); disposePlush(prevModel); }
  prevModel = buildPrize(prize.type, prize.color, prize.seed);
  const box = new THREE.Box3().setFromObject(prevModel.group); const ctr = box.getCenter(new THREE.Vector3()); const sz = box.getSize(new THREE.Vector3()).length();
  prevModel.group.position.sub(ctr); prevModel.u.uCenter.value.set(0, 0, 0); prevModel.u.uFloorY.value = -10;
  prev.c.position.set(0, sz * 0.35, sz * 2.0); prev.c.lookAt(0, 0, 0);
  const pivot = new THREE.Group(); pivot.add(prevModel.group); prev.s.add(pivot); (prevModel as any).pivot = pivot;
  prevOn = true;
}
function renderPreview(t: number) {
  if (!prevOn || !prev || !prevModel) return;
  const pv = (prevModel as any).pivot as THREE.Group; pv.rotation.y = t * 0.9; pv.position.y = Math.sin(t * 2.2) * 0.004;
  prev.r.render(prev.s, prev.c);
}
function hideWin() { prevOn = false; $('win').classList.remove('show'); if (viewIdx < 0) { doorCam = 0; goView(0); } }
// taking prizes out of the pickup window: the toy slides out through the flap and disappears
const taking = new Map<number, { m: PlushModel; t: number; p0: THREE.Vector3; s0: number }>();
function takePrizes() {
  for (const p of [...game.prizes]) {
    if (!p.won) continue;
    const m = models.get(p.uid); if (!m) { game.removePrize(p); continue; }
    taking.set(p.uid, { m, t: 0, p0: m.group.position.clone(), s0: m.group.scale.x });
    models.delete(p.uid);
    game.removePrize(p);
  }
  doorHold = 0;
}
function updateTaking(dt: number) {
  for (const [uid, k] of taking) {
    k.t += dt / 0.45; const e = Math.min(1, k.t);
    k.m.group.position.set(k.p0.x, k.p0.y + Math.sin(e * Math.PI) * 0.03, k.p0.z + e * 0.35);
    k.m.group.scale.setScalar(k.s0 * (1 - e * e));
    k.m.u.uCenter.value.copy(k.m.group.position); k.m.u.uFloorY.value = -10;
    if (e >= 1) { scene.remove(k.m.group); disposePlush(k.m); taking.delete(uid); }
  }
}
$('winOk').addEventListener('click', () => { sfx.click(); hideWin(); takePrizes(); sfx.take(); });

// ---------------- post-processing / quality ----------------
const QUALITY = ['低', '中', '高'];
const nav = navigator as Navigator & { deviceMemory?: number };
const lowEnd = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 4 || !renderer.capabilities.isWebGL2;
let quality = Number(params.get('q') ?? localStorage.getItem('claw_q') ?? (isTouch ? (lowEnd ? 0 : 1) : 2));
let composer: EffectComposer | null = null;
let grain: ShaderPass | null = null;
function applyQuality() {
  const dpr = Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][quality]);
  renderer.setPixelRatio(dpr);
  const ss = [512, 1024, isTouch ? 2048 : 4096][quality];
  if (sun.shadow.mapSize.x !== ss) { sun.shadow.mapSize.set(ss, ss); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  setFurShells([0, 4, 7][quality]);
  composer?.dispose(); composer = null;
  if (quality > 0) {
    const w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w * dpr, h * dpr, { type: THREE.HalfFloatType, samples: quality === 2 ? 4 : 2 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(dpr);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new OutputPass());
    grain = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uAmt: { value: 0.022 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uT; uniform float uAmt; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uT) * 43758.5453); }
        void main(){ vec4 c = texture2D(tDiffuse, vUv);
          vec2 q = vUv - 0.5; float v = 1.0 - dot(q, q) * 0.35;
          c.rgb *= v; c.rgb += (h(gl_FragCoord.xy) - 0.5) * uAmt;
          gl_FragColor = vec4(c.rgb, 1.0); }`,
    });
    composer.addPass(grain);
  } else grain = null;
  document.querySelectorAll<HTMLElement>('#qseg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.q) === quality));
  resize();
}

// camera framing: like a person standing in front of the machine. The visible 3D area is between the
// LED board and the control deck, so the projection is shifted to centre the cabinet in that window.
const target = new THREE.Vector3(0, 0.6, 0);
let views: { az: number; pol: number; dist: number }[] = [];
let viewIdx = 0;
let camAnim: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; t: number; dur: number } | null = null;
let visFrac = 1, hFrac = 1, wideLayout = false;
function fitDist() {
  const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // portrait: fit the glass width; wide: fit the whole cabinet height between the side columns
  return wideLayout ? Math.max(0.72 / (vt * camera.aspect * hFrac), 1.22 / (vt * visFrac)) : Math.max(0.62 / (vt * camera.aspect), 0.95 / (vt * visFrac));
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  // layout: portrait = LED board on top + control deck at the bottom; wide = control columns at the sides
  wideLayout = w > h * 1.05;
  const compact = wideLayout && h < 560;
  document.body.classList.toggle('wide', wideLayout);
  document.body.classList.toggle('compact', compact);
  const side = wideLayout ? Math.round(compact ? Math.min(190, w * 0.22) : Math.min(320, Math.max(230, w * 0.15))) : 0;
  document.documentElement.style.setProperty('--side', side + 'px');
  const top = $('board').offsetHeight || 50;
  document.documentElement.style.setProperty('--top', top + 'px');
  const bot = wideLayout ? 0 : $('deck').offsetHeight || 150;
  visFrac = Math.max(0.4, (h - top - bot - (wideLayout ? 12 : 0)) / h);
  hFrac = Math.max(0.3, (w - side * 2) / w);
  target.y = wideLayout ? 0.45 : 0.35;
  camera.setViewOffset(w, h, 0, (bot - top) / 2, w, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer?.setSize(w, h);
  const d = fitDist();
  views = [{ az: 0, pol: wideLayout ? 1.32 : 1.28, dist: d }, { az: -0.55, pol: 1.28, dist: d * 1.05 }, { az: 0.0, pol: 0.7, dist: d * 0.92 }];
  controls.minDistance = d * 0.5; controls.maxDistance = d * 1.3;
}
function animCam(p1: THREE.Vector3, t1: THREE.Vector3, dur = 0.9) { camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1, t: 0, dur }; }
function goView(i: number, instant = false) {
  viewIdx = i; const v = views[i];
  const p = new THREE.Vector3().setFromSpherical(new THREE.Spherical(v.dist, v.pol, v.az)).add(target);
  if (instant) { controls.target.copy(target); camera.position.copy(p); camera.lookAt(target); controls.update(); return; }
  animCam(p, target.clone());
}
/** crouch a little and look at the pickup window */
function goDoor() {
  viewIdx = -1;
  const t = new THREE.Vector3(machine.doorPos.x + 0.08, -0.52, 0.36);
  const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const d = Math.max(0.32 / (vt * camera.aspect * hFrac), 0.34 / (vt * visFrac));
  animCam(new THREE.Vector3(t.x + d * 0.1, t.y + d * 0.16, t.z + d * 0.98), t, 1.1);
}
let resizeRaf = 0;
function onResize() {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => { resize(); if (!intro && viewIdx >= 0 && !(window as any).__claw?.closeup) goView(viewIdx); });
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
window.visualViewport?.addEventListener('resize', onResize);
document.body.classList.toggle('fine', matchMedia('(pointer: fine)').matches);
// no page scroll / pinch-zoom / pull-to-refresh / long-press menus
for (const ev of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu'] as const) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
// audio unlock on the first interaction of any kind
const unlockAudio = () => sfx.unlock();
document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
document.addEventListener('keydown', unlockAudio, { once: true, capture: true });

// ---------------- game ----------------
const sfx = new Sfx();
let game!: ClawGame;
const models = new Map<number, PlushModel>();
let timeLeft = 0, lastTick = 99, intro = true;
let coins = store.coins;
const ui = {
  coins: $('coins').querySelector('b')!, timer: $('timer').querySelector('b')!, bag: $('bag').querySelector('b')!,
  insert: $<HTMLButtonElement>('insert'), grab: $<HTMLButtonElement>('grab'), joy: $('joy'), knob: $('knob'), hint: $('hint'), hintTxt: $('hintTxt'),
};
// theme chips
{ const host = $('themes');
  THEMES.forEach((t, i) => { const b = document.createElement('button'); b.type = 'button'; b.title = t.name; b.style.background = t.accentHex; b.addEventListener('click', () => { sfx.click(); setTheme(i); }); host.appendChild(b); });
  setTheme(themeIdx);
}
// ---- toasts: one at a time, top-centre under the HUD, icon + title + optional detail line ----
type ToastKind = 'info' | 'ok' | 'warn' | 'miss' | 'coin' | 'win';
const TICON: Record<ToastKind, string> = { info: 'i-alert', ok: 'i-check', warn: 'i-clock', miss: 'i-hand', coin: 'i-coin', win: 'i-gift' };
let toastEl: HTMLElement | null = null, toastT = 0;
function dropToast() { const el = toastEl; toastEl = null; if (!el) return; el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 240); }
function toast(title: string, kind: ToastKind = 'info', sub = '', dur = 1.8) {
  dropToast();
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ti"><svg><use href="#${TICON[kind]}"/></svg></span><span class="tt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>`;
  $('toasts').appendChild(el); void el.offsetWidth; el.classList.add('in'); toastEl = el; toastT = dur;
}
// ---- persistent state line above the drop button ----
function status(text: string, kind = 'idle') { ui.hintTxt.textContent = text; ui.hint.className = 'hint ' + kind; }
function bagCount() { return Object.values(store.bag).reduce((a, b) => a + b, 0); }
function refreshUI() {
  ui.coins.textContent = String(coins);
  ui.bag.textContent = String(bagCount());
  const st = game?.state ?? 'idle';
  const idle = st === 'idle', play = st === 'play';
  ui.insert.classList.toggle('gone', !idle);
  ui.insert.classList.toggle('attn', idle && !intro);
  ui.insert.querySelector('small')!.textContent = coins > 0 ? '1 币 / 局' : '币不足';
  ui.grab.classList.toggle('disabled', !play); ui.grab.setAttribute('aria-disabled', String(!play));
  $('coins').classList.toggle('empty', coins <= 0);
  ui.joy.classList.toggle('disabled', !play);
  if (!play) ui.timer.textContent = '--';
  if (!play) $('timer').classList.remove('urgent');
  const S: Record<string, [string, string]> = {
    idle: coins > 0 ? ['投币开始游戏', 'idle'] : ['币用完了 · 点投币领取', 'empty'],
    play: [isTouch ? '对准娃娃，按下爪' : '对准娃娃，按空格下爪', 'play'],
    descend: ['下爪中…', 'busy'], close: ['合爪中…', 'busy'], lift: ['提起中…', 'busy'], hold: ['提起中…', 'busy'],
    return: ['送往出口…', 'busy'], release: ['松爪…', 'busy'], reset: ['复位中…', 'busy'],
  };
  const [txt, kind] = S[st] ?? ['', 'busy']; status(txt, kind);
}
function insertCoin() {
  sfx.unlock();
  if (game.state !== 'idle') return;
  if ($('win').classList.contains('show')) takePrizes();
  hideWin();
  if (coins <= 0) { sfx.click(); openModal('nocoin'); return; }
  coins--; store.coins = coins;
  sfx.coin(); vibrate(30);
  game.startRound(); timeLeft = ROUND_TIME; lastTick = 99; held = null; heldShown = false;
  toast('投币成功', 'coin', `本局 ${ROUND_TIME} 秒 · 剩余 ${coins} 币`, 1.5);
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
ui.grab.addEventListener('pointerdown', () => {
  if (game.state !== 'idle' || intro) return;
  sfx.click(); vibrate(15); toast(coins > 0 ? '请先投币' : '币用完了', 'info', coins > 0 ? '点右下角「投币」开始一局' : '点「投币」领取免费游戏币', 1.6);
  ui.insert.classList.remove('nudge'); void ui.insert.offsetWidth; ui.insert.classList.add('nudge');
});
ui.joy.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; ui.joy.setPointerCapture(e.pointerId); ui.joy.classList.add('drag'); joyMove(e); vibrate(8); e.preventDefault(); });
ui.joy.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) joyMove(e); });
const joyEnd = (e: PointerEvent) => { if (e.pointerId !== joy.id) return; joy.id = -1; joy.x = joy.y = 0; ui.joy.classList.remove('drag'); ui.knob.style.transform = ''; };
ui.joy.addEventListener('pointerup', joyEnd); ui.joy.addEventListener('pointercancel', joyEnd);
ui.grab.addEventListener('pointerdown', (e) => { e.preventDefault(); doGrab(); });
ui.insert.addEventListener('click', insertCoin);
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (intro) return;
  if (/^(Key[WASD]|Arrow|Space|Enter)/.test(e.code)) keysUsed();
  if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
  if (e.code === 'Space') { e.preventDefault(); if (game.state === 'idle') insertCoin(); else doGrab(); }
  else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyC') insertCoin();
  else if (e.code === 'KeyV') { sfx.click(); goView((Math.max(0, viewIdx) + 1) % views.length); }
  else if (/^(Digit|Numpad)[123]$/.test(e.code)) { sfx.click(); goView(Number(e.code.slice(-1)) - 1); }
  else if (e.code === 'KeyM') $('snd').click();
  else if (e.code === 'KeyF') toggleFullscreen();
  else if (e.code === 'Escape') { if ($('win').classList.contains('show')) $('winOk').click(); closeModal('drawer'); setSettings(false); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('blur', () => keys.clear());
// fullscreen (hidden where unsupported, e.g. iPhone Safari)
const fsEl = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
const fsSupported = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
$('fs').classList.toggle('hidden', !fsSupported);
function toggleFullscreen() {
  if (!fsSupported) return;
  const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d);
  else (fsEl.requestFullscreen ?? fsEl.webkitRequestFullscreen)?.call(fsEl)?.catch?.(() => {});
}
$('fs').addEventListener('click', () => { sfx.click(); toggleFullscreen(); });
// gamepad: left stick / d-pad move, A drop, X or Start coin, Y camera
const padIn = { x: 0, y: 0 }; const padPrev: boolean[] = [];
function readPad() {
  padIn.x = padIn.y = 0;
  const pads = navigator.getGamepads?.(); if (!pads) return;
  for (const gp of pads) {
    if (!gp) continue;
    const b = (i: number) => !!gp.buttons[i]?.pressed;
    let x = gp.axes[0] ?? 0, y = -(gp.axes[1] ?? 0);
    if (Math.hypot(x, y) < 0.18) x = y = 0;
    x += (b(15) ? 1 : 0) - (b(14) ? 1 : 0); y += (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
    padIn.x = Math.max(-1, Math.min(1, x)); padIn.y = Math.max(-1, Math.min(1, y));
    const edge = (i: number) => b(i) && !padPrev[i];
    if (!intro) {
      if (edge(0)) { if (game.state === 'idle') insertCoin(); else doGrab(); }
      if (edge(2) || edge(9)) insertCoin();
      if (edge(3)) goView((Math.max(0, viewIdx) + 1) % views.length);
    }
    gp.buttons.forEach((_, i) => (padPrev[i] = b(i)));
    break;
  }
}
window.addEventListener('keyup', (e) => keys.delete(e.code));
function readKeys() {
  keyIn.x = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  keyIn.y = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0);
}

// tool buttons
$('snd').addEventListener('click', () => { sfx.unlock(); sfx.setMuted(!sfx.muted); $('snd').setAttribute('aria-checked', String(!sfx.muted)); if (!sfx.muted) sfx.click(); });
// settings popover
const setPop = $('settings');
function setSettings(open: boolean) { setPop.classList.toggle('show', open); $('set').classList.toggle('on', open); $('set').setAttribute('aria-expanded', String(open)); }
$('set').addEventListener('click', (e) => { e.stopPropagation(); sfx.click(); setSettings(!setPop.classList.contains('show')); });
setPop.addEventListener('pointerdown', (e) => e.stopPropagation());
document.addEventListener('pointerdown', (e) => { if (setPop.classList.contains('show') && !(e.target as HTMLElement).closest('#set')) setSettings(false); });
document.querySelectorAll<HTMLElement>('#qseg button').forEach((b) => b.addEventListener('click', () => { sfx.click(); quality = Number(b.dataset.q); localStorage.setItem('claw_q', String(quality)); autoQ = false; applyQuality(); }));
// modals
function openModal(id: string) { dropToast(); const m = $(id); m.classList.remove('hidden'); void m.offsetWidth; m.classList.add('show'); }
function closeModal(id: string) { const m = $(id); m.classList.remove('show'); setTimeout(() => { if (!m.classList.contains('show')) m.classList.add('hidden'); }, 220); }
$('claim').addEventListener('click', () => { coins = 10; store.coins = coins; sfx.coin(); vibrate(30); closeModal('nocoin'); refreshUI(); toast('领取成功', 'coin', '+10 游戏币，祝你好运', 1.6); });
$('later').addEventListener('click', () => { sfx.click(); closeModal('nocoin'); });
// first-run onboarding (3 steps, skippable, remembered)
let obStep = 0;
function showGuide(i: number) {
  obStep = i;
  document.querySelectorAll('#onboard .step').forEach((s, j) => s.classList.toggle('on', j === i));
  document.querySelectorAll('#onboard .dots i').forEach((s, j) => s.classList.toggle('on', j === i));
  $('obNext').textContent = i === 2 ? '开始玩' : '下一步';
}
function endGuide() { localStorage.setItem('claw_guide', '1'); closeModal('onboard'); refreshUI(); }
$('obNext').addEventListener('click', () => { sfx.click(); if (obStep < 2) showGuide(obStep + 1); else endGuide(); });
$('obSkip').addEventListener('click', () => { sfx.click(); endGuide(); });
$('replayGuide').addEventListener('click', () => { sfx.click(); setSettings(false); showGuide(0); openModal('onboard'); });
// PC key panel: visible until the player has used the keyboard, then tucks away (re-open from settings)
function keysUsed() { if (localStorage.getItem('claw_keys')) return; localStorage.setItem('claw_keys', '1'); setTimeout(() => document.body.classList.add('keys-off'), 2500); }
if (localStorage.getItem('claw_keys')) document.body.classList.add('keys-off');
$('keysClose').addEventListener('click', () => { sfx.click(); localStorage.setItem('claw_keys', '1'); document.body.classList.add('keys-off'); });
$('showKeys').addEventListener('click', () => { sfx.click(); setSettings(false); document.body.classList.remove('keys-off'); });
// light haptic tick on every button press
document.addEventListener('pointerdown', (e) => { const b = (e.target as HTMLElement).closest?.('.btn'); if (b && !b.classList.contains('disabled')) vibrate(6); }, { passive: true });
$('cam').addEventListener('click', () => { sfx.click(); goView((viewIdx + 1) % views.length); });
$('bag').addEventListener('click', () => {
  const bag = store.bag; const list = $('bagList'); list.innerHTML = '';
  sfx.click(); let kinds = 0;
  for (const t of PRIZE_TYPES) {
    const n = bag[t.id] ?? 0; if (n) kinds++;
    const d = document.createElement('div'); d.className = 'it' + (n ? '' : ' none');
    const col = '#' + t.colors[0].toString(16).padStart(6, '0');
    d.innerHTML = `<span class="sw" style="--c:${col}"></span><span class="nm">${t.name}</span><span class="ct">${n ? '×' + n : '未获得'}</span>`;
    list.appendChild(d);
  }
  $('bagTotal').textContent = `${kinds}/${PRIZE_TYPES.length} 种 · 共 ${bagCount()} 个`;
  openModal('drawer');
});
$('closeBag').addEventListener('click', () => { sfx.click(); closeModal('drawer'); });
$('drawer').addEventListener('click', (e) => { if (e.target === $('drawer')) closeModal('drawer'); });

// ---------------- events ----------------
let lastThud = 0;
let held: Prize | null = null, heldNear = false, heldShown = false;
function onEvent(e: GameEvent) {
  switch (e.type) {
    case 'spawn': { const m = buildPrize(e.prize.type, e.prize.color, e.prize.seed); m.group.scale.setScalar(e.prize.scale); models.set(e.prize.uid, m); scene.add(m.group); break; }
    case 'remove': { const m = models.get(e.prize.uid); if (m) { scene.remove(m.group); disposePlush(m); models.delete(e.prize.uid); } break; }
    case 'win': {
      dropToast();
      const bag = store.bag; bag[e.prize.type.id] = (bag[e.prize.type.id] ?? 0) + 1; store.bag = bag;
      sfx.chute(); vibrate([40, 60, 120]); doorBlink = 3.2; doorHold = 12;
      setTimeout(() => { sfx.win(); showWin(e.prize); }, 450);
      refreshUI(); break;
    }
    case 'impact': if (e.strength > 0.8 && game.time - lastThud > 0.08) { lastThud = game.time; sfx.thud(e.strength); } break;
    case 'clank': sfx.clank(); vibrate(25); break;
    case 'state': refreshUI(); break;
    case 'roundEnd':
      if (!e.won) {
        sfx.lose();
        if (held && heldNear) toast('差一点！', 'miss', '就差一点点掉进出口', 1.9);
        else if (held) toast('滑掉了', 'miss', '夹住了但没夹稳，再试一次', 1.9);
        else toast('没抓住', 'miss', '试试对准娃娃的身体中间', 1.9);
      }
      held = null;
      refreshUI(); break;
  }
}

// ---------------- sync visuals ----------------
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), invQ = new THREE.Quaternion(), down = new THREE.Vector3(0, -1, 0);
const contacts = new Map<Prize, ContactPt[]>();
function inHole(x: number, z: number) { return x < HOLE.x1 + 0.03 && z > HOLE.z0 - 0.03; }
function syncVisuals(dt: number, t: number) {
  updateTaking(dt);
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
        tmpV2.set(c.x - tr.x, c.y - tr.y, c.z - tr.z).applyQuaternion(invQ).divideScalar(p.scale);
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
  // prize-out ring + LED rims: breathe normally, flash on win
  const blinkOn = doorBlink > 0 ? (Math.floor(t * 6) % 2 ? 1 : 0.1) : doorHold > 0 ? 0.7 : 0.2 + 0.15 * Math.sin(t * 2.2);
  M.doorLamp.emissiveIntensity = blinkOn * 2.8;
  doorLight.intensity = blinkOn * 0.4;
  doorBlink = Math.max(0, doorBlink - dt); doorHold = Math.max(0, doorHold - dt);
  const chase = 1.4 + 0.7 * Math.sin(t * 3.5) + (doorBlink > 0 ? 1.5 * Math.abs(Math.sin(t * 12)) : 0);
  M.ledStrip.emissiveIntensity = chase;
  M.tube.emissiveIntensity = 2.8 + Math.sin(t * 13.1) * 0.03;
  // what the claw is carrying (for 抓住了 / 滑掉了 / 差一点 feedback)
  const gs = game.state;
  if (gs === 'hold' || gs === 'return' || gs === 'release' || gs === 'lift') {
    let cur: Prize | null = null;
    for (const p of game.prizes) { if (p.won) continue; const cs = contacts.get(p); if (cs && cs.length >= 2 && p.body.translation().y > h.y - 0.2 && h.y > 0.55) { cur = p; break; } }
    if (cur) { held = cur; heldNear = false; if (!heldShown && gs !== 'lift') { heldShown = true; sfx.click(); vibrate(20); toast('抓住了！', 'ok', '稳住…送往出口', 1.6); } }
    else if (held && !held.won) { const tp = held.body.translation(); heldNear = heldNear || (tp.x < HOLE.x1 + 0.12 && tp.z > HOLE.z0 - 0.12); }
  }
  const showAim = game.state === 'play';
  aim.visible = showAim;
  if (showAim) { const sy = game.probeSurface(); aim.position.set(h.x, sy + 0.004, h.z); }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) { sfx.ctx?.suspend(); keys.clear(); } else { last = performance.now(); acc = 0; if (!sfx.muted) sfx.ctx?.resume(); } });
// ---------------- main loop ----------------
let acc = 0, last = performance.now(), fpsAcc = 0, fpsN = 0, autoQ = !params.has('noauto') && !localStorage.getItem('claw_q'), playStart = 0, wasMoving = false;
const perf = { cpu: [] as number[], calls: 0, tris: 0, geo: 0, tex: 0 };
function frame(now: number) {
  requestAnimationFrame(frame);
  const t0 = performance.now(); renderer.info.reset();
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game.state === 'play') {
    readKeys(); readPad();
    let ix = joy.x + keyIn.x + padIn.x, iy = joy.y + keyIn.y + padIn.y; const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const fwd = tmpV.copy(target).sub(camera.position); fwd.y = 0; fwd.normalize();
    game.input.x = -fwd.z * ix + fwd.x * iy; game.input.z = fwd.x * ix + fwd.z * iy;
    timeLeft -= dt;
    const sec = Math.ceil(Math.max(0, timeLeft));
    ui.timer.textContent = String(sec);
    if (sec <= 5 && sec !== lastTick) { if (lastTick > 5) toast('剩余 5 秒', 'warn', '快下爪！', 1.3); lastTick = sec; $('timer').classList.add('urgent'); $('timer').classList.remove('beat'); void $('timer').offsetWidth; $('timer').classList.add('beat'); sfx.tick(); vibrate(10); }
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
    camera.position.setFromSpherical(new THREE.Spherical(v.dist * 1.12, 1.36 + Math.sin(tt * 0.27) * 0.025, Math.sin(tt * 0.19) * 0.22)).add(target);
    camera.lookAt(target);
  } else if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt / camAnim.dur); const k = camAnim.t * camAnim.t * (3 - 2 * camAnim.t);
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, k); controls.target.lerpVectors(camAnim.t0, camAnim.t1, k);
    camera.lookAt(controls.target);
    if (camAnim.t >= 1) camAnim = null;
  }
  if (doorCam > 0 && !camAnim) { doorCam -= dt; if (doorCam <= 0 && viewIdx < 0) goView(0); }
  const closeup = (window as any).__claw?.closeup;
  if (!intro && !closeup && !camAnim) controls.update();
  // slight handheld sway (a person standing, not a tripod); undone after rendering
  const tt = now / 1000;
  const sway = intro || closeup ? 0 : 1;
  const sx = (Math.sin(tt * 0.71) + Math.sin(tt * 1.37 + 1) * 0.5) * 0.0025 * sway, sy = (Math.sin(tt * 0.53 + 2) + Math.sin(tt * 1.13) * 0.4) * 0.0018 * sway;
  camera.position.x += sx; camera.position.y += sy;
  syncVisuals(dt, now / 1000);
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) dropToast(); }
  renderPreview(now / 1000);
  if (grain) grain.uniforms.uT.value = (now / 1000) % 100;
  if (composer) composer.render(); else renderer.render(scene, camera);
  perf.cpu.push(performance.now() - t0); if (perf.cpu.length > 240) perf.cpu.shift();
  perf.calls = renderer.info.render.calls; perf.tris = renderer.info.render.triangles; perf.geo = renderer.info.memory.geometries; perf.tex = renderer.info.memory.textures;
  camera.position.x -= sx; camera.position.y -= sy;
  if (autoQ && playStart && now - playStart > 1500) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 3) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < 42 && quality > 0) { quality--; applyQuality(); toast(`画质已调整为「${QUALITY[quality]}」`, 'info', '保持流畅运行', 1.6); }
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
  game.fill(30);
  bar.style.width = '80%'; txt.textContent = '正在编译着色器…';
  await new Promise((r) => setTimeout(r, 30));
  renderer.compile(scene, camera);
  bar.style.width = '100%'; txt.textContent = '准备就绪';
  refreshUI();
  requestAnimationFrame(frame);
  $('start').classList.add('ready');
  const go = $<HTMLButtonElement>('go'); go.disabled = false;
  go.addEventListener('click', () => {
    sfx.unlock(); sfx.click(); vibrate(20);
    $('start').classList.add('hide'); playStart = performance.now();
    intro = false; controls.enabled = true; document.body.classList.remove('intro'); goView(0);
    if (!localStorage.getItem('claw_guide') && !params.has('noguide')) setTimeout(() => { showGuide(0); openModal('onboard'); }, 650);
    refreshUI();
  });
  (window as any).__claw = { perf, renderer, game, toast, openModal, closeModal, showGuide, insertCoin, doGrab, joy, camera, setQuality: (q: number) => { quality = q; applyQuality(); }, showWin, goDoor, setTheme, camBusy: () => !!camAnim || doorCam > 0, camAnimating: () => !!camAnim, setCam: (p: number[], t: number[]) => { camAnim = null; (window as any).__claw.closeup = true; camera.position.set(p[0], p[1], p[2]); camera.lookAt(t[0], t[1], t[2]); } };
}
boot().catch((e) => { console.error(e); $('loadTxt').textContent = '加载失败: ' + e; });
