import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { ClawGame, CARRIAGE_Y, HUB_HH, HOLE, BIN_FLOOR_Y, PRIZE_TYPES, type Prize, type ClawState, type ContactPt, type GameEvent } from './physics.ts';
import { buildMachine, buildRoom, buildEnvScene, M } from './models.ts';
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
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d1a17);
scene.fog = new THREE.Fog(0x1d1a17, 4, 10);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(buildEnvScene(), 0.02).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 30);
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minAzimuthAngle = -1.0; controls.maxAzimuthAngle = 1.0;
controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.62; controls.rotateSpeed = 0.55;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.enabled = false;

// lights: dim warm mall ceiling + the cabinet's own cool-white tubes
scene.add(new THREE.HemisphereLight(0xffe6c8, 0x2a2420, 0.35));
const sun = new THREE.DirectionalLight(0xeef3ff, 1.7); // the cabinet tubes, as a shadow-casting key
sun.position.set(0.05, 3.2, 0.35); scene.add(sun, sun.target);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -0.62, right: 0.62, top: 0.55, bottom: -0.55, near: 1.6, far: 4 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.012; sun.shadow.radius = 4;
const fill = new THREE.DirectionalLight(0xffd8ae, 0.75); fill.position.set(-0.8, 2.6, 3.2); scene.add(fill);
const inner = new THREE.SpotLight(0xf3f6ff, 2.4, 2.2, 1.0, 0.8, 1.5); inner.position.set(0, 1.17, 0.3); scene.add(inner, inner.target);
const doorLight = new THREE.PointLight(0xffb060, 0, 0.5, 2); doorLight.position.set(-0.36, -0.48, 0.44); scene.add(doorLight);

// laser aiming dot (many newer machines have one); no beam
const aim = new THREE.Mesh(new THREE.CircleGeometry(0.0065, 16), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
aim.rotation.x = -Math.PI / 2; aim.renderOrder = 5; scene.add(aim);

// world
scene.add(buildRoom());
const machine = buildMachine(); scene.add(machine.root);
{ const bin = new THREE.Mesh(new THREE.BoxGeometry(0.238, 0.04, 0.27), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 })); bin.position.set(machine.doorPos.x, BIN_FLOOR_Y - 0.021, 0.35); bin.receiveShadow = true; scene.add(bin); }
machine.root.traverse((o) => { o.castShadow = false; });
for (const o of [machine.beam, machine.carriage, machine.hub, machine.cable, ...machine.prongs]) o.traverse((c) => { c.castShadow = true; });

// ---------------- win: prize drops into the pickup window, lamp blinks, a plain card ----------------
let winNo = 0, doorBlink = 0, doorHold = 0, doorCam = 0;
function showWin(prize: Prize) {
  winNo++;
  $('winNo').textContent = `第 ${bagCount()} 个`;
  $('winName').textContent = `${prize.type.name} · ${prize.colorName}`;
  $('winSub').textContent = '已掉进取物口，记得拿走';
  $('win').classList.add('show');
  goDoor(); doorCam = 3.5;
}
function hideWin() { $('win').classList.remove('show'); if (viewIdx < 0) { doorCam = 0; goView(0); } }
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
  setFurShells([0, 5, 9][quality]);
  composer?.dispose(); composer = null;
  if (quality > 0) {
    const w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w * dpr, h * dpr, { type: THREE.HalfFloatType, samples: quality === 2 ? 4 : 2 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(dpr);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new OutputPass());
    grain = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uAmt: { value: 0.035 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uT; uniform float uAmt; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uT) * 43758.5453); }
        void main(){ vec4 c = texture2D(tDiffuse, vUv);
          vec2 q = vUv - 0.5; float v = 1.0 - dot(q, q) * 0.55;
          c.rgb *= v; c.rgb += (h(gl_FragCoord.xy) - 0.5) * uAmt;
          gl_FragColor = vec4(c.rgb, 1.0); }`,
    });
    composer.addPass(grain);
  } else grain = null;
  $('q').textContent = QUALITY[quality];
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
  return wideLayout ? Math.max(0.66 / (vt * camera.aspect * hFrac), 0.86 / (vt * visFrac)) : Math.max(0.6 / (vt * camera.aspect), 0.78 / (vt * visFrac));
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
  target.y = wideLayout ? 0.52 : 0.6;
  camera.setViewOffset(w, h, 0, (bot - top) / 2, w, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer?.setSize(w, h);
  const d = fitDist();
  views = [{ az: 0, pol: 1.36, dist: d }, { az: -0.62, pol: 1.3, dist: d * 1.02 }, { az: 0.0, pol: 0.72, dist: d * 0.9 }];
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
  coins: $('coins').querySelector('.digits') as HTMLElement, timer: $('timer').querySelector('.digits') as HTMLElement, bag: $('bag').querySelector('.digits') as HTMLElement,
  insert: $<HTMLButtonElement>('insert'), grab: $<HTMLButtonElement>('grab'), joy: $('joy'), knob: $('knob'), status: $('status'), toast: $('toast'),
};
// 7-segment LED digits
const SEGS = ['a', 'b', 'c', 'd1', 'e', 'f', 'g'];
const DIG: Record<string, string> = { '0': 'abcd1ef', '1': 'bc', '2': 'abd1eg', '3': 'abcd1g', '4': 'bcfg', '5': 'acd1fg', '6': 'acd1efg', '7': 'abc', '8': 'abcd1efg', '9': 'abcd1fg', '-': 'g', ' ': '' };
function initSeg(el: HTMLElement, n: number) { el.innerHTML = Array.from({ length: n }, () => `<i class="d">${SEGS.map((c) => `<s class="${c}"></s>`).join('')}</i>`).join(''); }
const segCache = new Map<HTMLElement, string>();
function setSeg(el: HTMLElement, v: string) {
  if (segCache.get(el) === v) return; segCache.set(el, v);
  const ds = el.children; const str = v.padStart(ds.length, ' ').slice(-ds.length);
  for (let i = 0; i < ds.length; i++) { const on = DIG[str[i]] ?? ''; for (const s of Array.from(ds[i].children)) s.classList.toggle('on', on.split(/(?=[a-g])/).includes(s.className.replace(' on', ''))); }
}
initSeg(ui.coins, 2); initSeg(ui.timer, 2); initSeg(ui.bag, 2);
let toastT = 0;
function toast(html: string, _lose = false, dur = 2.2) { ui.toast.innerHTML = html; ui.toast.classList.add('show'); toastT = dur; }
function status(text: string) { if (text) ui.status.textContent = text; ui.status.classList.toggle('show', !!text); }
function bagCount() { return Object.values(store.bag).reduce((a, b) => a + b, 0); }
function refreshUI() {
  setSeg(ui.coins, String(Math.min(99, coins)));
  setSeg(ui.bag, String(Math.min(99, bagCount())));
  const st = game?.state ?? 'idle';
  const idle = st === 'idle', play = st === 'play';
  ui.insert.classList.toggle('gone', !idle);
  ui.insert.querySelector('em')!.textContent = coins > 0 ? '投币' : '领币';
  ui.insert.querySelector('small')!.textContent = coins > 0 ? '1币1局' : '送10币';
  ui.grab.classList.toggle('disabled', !play);
  ui.joy.classList.toggle('disabled', !play);
  if (!play) setSeg(ui.timer, '--');
  $('timer').classList.remove('warn');
  status({ idle: coins > 0 ? '请投币' : '币用完了，点「领币」', play: '移动摇杆，按红色按钮下爪', descend: '', close: '', lift: '', hold: '', return: '', release: '', reset: '' }[st]);
}
function insertCoin() {
  sfx.unlock();
  if (game.state !== 'idle') return;
  if ($('win').classList.contains('show')) takePrizes();
  hideWin();
  if (coins <= 0) { coins = 10; store.coins = coins; sfx.coin(); toast('已赠送 10 币', false, 1.6); refreshUI(); return; }
  coins--; store.coins = coins;
  sfx.coin(); vibrate(30);
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
ui.grab.addEventListener('pointerdown', () => { if (game.state === 'idle' && !intro) { sfx.click(); status('请先投币'); } });
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
  if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
  if (e.code === 'Space') { e.preventDefault(); if (game.state === 'idle') insertCoin(); else doGrab(); }
  else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyC') insertCoin();
  else if (e.code === 'KeyV') { sfx.click(); goView((Math.max(0, viewIdx) + 1) % views.length); }
  else if (/^(Digit|Numpad)[123]$/.test(e.code)) { sfx.click(); goView(Number(e.code.slice(-1)) - 1); }
  else if (e.code === 'KeyM') $('snd').click();
  else if (e.code === 'KeyF') toggleFullscreen();
  else if (e.code === 'Escape') { if ($('win').classList.contains('show')) $('winOk').click(); $('drawer').classList.add('hidden'); }
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
$('snd').addEventListener('click', () => { sfx.unlock(); sfx.setMuted(!sfx.muted); $('snd').classList.toggle('off', sfx.muted); });
$('cam').addEventListener('click', () => { sfx.click(); goView((viewIdx + 1) % views.length); });
$('q').addEventListener('click', () => { quality = (quality + 1) % 3; localStorage.setItem('claw_q', String(quality)); autoQ = false; applyQuality(); toast(`画质：${QUALITY[quality]}`, true, 1.0); });
$('bag').addEventListener('click', () => {
  const bag = store.bag; const list = $('bagList'); list.innerHTML = '';
  for (const t of PRIZE_TYPES) { const n = bag[t.id] ?? 0; const d = document.createElement('div'); d.className = 'it' + (n ? '' : ' none'); d.innerHTML = `<span>${t.name}</span><b>${n}</b>`; list.appendChild(d); }
  $('drawer').classList.remove('hidden');
});
$('closeBag').addEventListener('click', () => $('drawer').classList.add('hidden'));

// ---------------- events ----------------
let lastThud = 0;
function onEvent(e: GameEvent) {
  switch (e.type) {
    case 'spawn': { const m = buildPrize(e.prize.type, e.prize.color, e.prize.seed); m.group.scale.setScalar(e.prize.scale); models.set(e.prize.uid, m); scene.add(m.group); break; }
    case 'remove': { const m = models.get(e.prize.uid); if (m) { scene.remove(m.group); disposePlush(m); models.delete(e.prize.uid); } break; }
    case 'win': {
      const bag = store.bag; bag[e.prize.type.id] = (bag[e.prize.type.id] ?? 0) + 1; store.bag = bag;
      sfx.chute(); vibrate([40, 60, 120]); doorBlink = 3.2; doorHold = 12;
      setTimeout(() => { sfx.win(); showWin(e.prize); }, 450);
      refreshUI(); break;
    }
    case 'impact': if (e.strength > 0.8 && game.time - lastThud > 0.08) { lastThud = game.time; sfx.thud(e.strength); } break;
    case 'clank': sfx.clank(); vibrate(25); break;
    case 'state': refreshUI(); break;
    case 'roundEnd':
      if (!e.won) { sfx.lose(); toast(['没抓住', '滑掉了', '差一点'][Math.floor(Math.random() * 3)], true, 1.6); }
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
  // pickup-window lamp: blinks after a win, then stays on softly while a prize sits there
  const blinkOn = doorBlink > 0 ? (Math.floor(t * 6) % 2 ? 1 : 0.08) : doorHold > 0 ? 0.55 : 0.05;
  M.doorLamp.emissiveIntensity = blinkOn * 3.5;
  doorLight.intensity = blinkOn * 0.35;
  doorBlink = Math.max(0, doorBlink - dt); doorHold = Math.max(0, doorHold - dt);
  // the fluorescent tubes have a barely visible 50 Hz-ish shimmer
  M.tube.emissiveIntensity = 2.6 + Math.sin(t * 13.1) * 0.03 + Math.sin(t * 2.3) * 0.02;
  const showAim = game.state === 'play';
  aim.visible = showAim;
  if (showAim) { const sy = game.probeSurface(); aim.position.set(h.x, sy + 0.004, h.z); }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) { sfx.ctx?.suspend(); keys.clear(); } else { last = performance.now(); acc = 0; if (!sfx.muted) sfx.ctx?.resume(); } });
// ---------------- main loop ----------------
let acc = 0, last = performance.now(), fpsAcc = 0, fpsN = 0, autoQ = !params.has('noauto') && !localStorage.getItem('claw_q'), playStart = 0, wasMoving = false;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game.state === 'play') {
    readKeys(); readPad();
    let ix = joy.x + keyIn.x + padIn.x, iy = joy.y + keyIn.y + padIn.y; const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const fwd = tmpV.copy(target).sub(camera.position); fwd.y = 0; fwd.normalize();
    game.input.x = -fwd.z * ix + fwd.x * iy; game.input.z = fwd.x * ix + fwd.z * iy;
    timeLeft -= dt;
    const sec = Math.ceil(Math.max(0, timeLeft));
    setSeg(ui.timer, String(sec).padStart(2, '0'));
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
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) ui.toast.classList.remove('show'); }
  if (grain) grain.uniforms.uT.value = (now / 1000) % 100;
  if (composer) composer.render(); else renderer.render(scene, camera);
  camera.position.x -= sx; camera.position.y -= sy;
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
  game.fill(30);
  bar.style.width = '80%'; txt.textContent = '正在编译着色器…';
  await new Promise((r) => setTimeout(r, 30));
  renderer.compile(scene, camera);
  bar.style.width = '100%'; txt.textContent = '';
  refreshUI();
  requestAnimationFrame(frame);
  $('start').classList.add('ready');
  const go = $<HTMLButtonElement>('go'); go.disabled = false;
  go.addEventListener('click', () => {
    sfx.unlock(); sfx.click(); vibrate(20);
    $('start').classList.add('hide'); playStart = performance.now();
    intro = false; controls.enabled = true; document.body.classList.remove('intro'); goView(0);
  });
  (window as any).__claw = { game, insertCoin, doGrab, joy, camera, setQuality: (q: number) => { quality = q; applyQuality(); }, showWin, goDoor, camBusy: () => !!camAnim || doorCam > 0, camAnimating: () => !!camAnim, setCam: (p: number[], t: number[]) => { camAnim = null; (window as any).__claw.closeup = true; camera.position.set(p[0], p[1], p[2]); camera.lookAt(t[0], t[1], t[2]); } };
}
boot().catch((e) => { console.error(e); $('loadTxt').textContent = '加载失败: ' + e; });
