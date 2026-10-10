import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

/** height canvas -> tangent-space normal map */
function heightToNormal(src: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const { c, g } = canvas(w, h); const out = g.createImageData(w, h);
  const H = (x: number, y: number) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1); const i = (y * w + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

let fabricN: THREE.Texture | null = null;
/** fuzzy plush fibre normal map */
export function fabricNormal() {
  if (fabricN) return fabricN;
  const S = 256; const { c, g } = canvas(S, S);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * S, y = Math.random() * S, a = Math.random() * Math.PI * 2, l = 2 + Math.random() * 6;
    const v = Math.floor(90 + Math.random() * 90);
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`; g.lineWidth = 0.6 + Math.random();
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke();
    }
  }
  fabricN = heightToNormal(c, 2.2); fabricN.repeat.set(3, 3);
  return fabricN;
}

export function labelTexture(text: string, color = '#fff', bg = 'rgba(0,0,0,0)', w = 256, h = 96, font = 'bold 56px sans-serif') {
  const { c, g } = canvas(w, h); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 14; g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

let detailT: THREE.Texture | null = null;
/** albedo detail for plush: fibre speckle + stitched side seams (sphere UV: u=0/0.5 are the sides) */
export function fabricDetail() {
  if (detailT) return detailT;
  const W = 512, H = 256; const { c, g } = canvas(W, H);
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 14000; i++) { const v = 200 + Math.random() * 55; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
  for (const u of [0, 0.5, 1]) {
    const x = u * W;
    const grd = g.createLinearGradient(x - 6, 0, x + 6, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, 'rgba(60,40,40,0.38)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - 6, 0, 12, H);
    g.strokeStyle = 'rgba(70,50,50,0.45)'; g.lineWidth = 1.4;
    for (let y = 6; y < H - 6; y += 7) { g.beginPath(); g.moveTo(x - 3.5, y); g.lineTo(x + 3.5, y + 3); g.stroke(); }
  }
  detailT = new THREE.CanvasTexture(c); detailT.colorSpace = THREE.SRGBColorSpace; detailT.anisotropy = 4; detailT.wrapS = THREE.RepeatWrapping;
  return detailT;
}

let furT: THREE.Texture | null = null;
/** per-texel strand heights for fur shells */
export function furNoise() {
  if (furT) return furT;
  const S = 128; const { c, g } = canvas(S, S); const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const v = Math.pow(Math.random(), 0.6) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  furT = new THREE.CanvasTexture(c); furT.wrapS = furT.wrapT = THREE.RepeatWrapping; furT.colorSpace = THREE.NoColorSpace;
  return furT;
}

const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function tex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/** very light fingerprints only — modern machines are wiped clean */
export function glassSmudge() {
  const W = 512, H = 640; const { c, g } = canvas(W, H);
  g.clearRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    g.save(); g.translate(rnd(80, W - 80), rnd(H * 0.55, H * 0.95)); g.rotate(rnd(-0.4, 0.4));
    const r = rnd(30, 70); const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.scale(1, rnd(0.3, 0.55)); g.fillStyle = grd; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
  }
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.04, 0.14)})`; g.fillRect(Math.random() * W, Math.random() * H, 1, 1); }
  return tex(c);
}

/** glossy white paint (subtle micro-noise, no wear/scratches) */
export function glossWhite() {
  const S = 512; const { c, g } = canvas(S, S);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 800; i++) { const v = 245 + Math.random() * 10; g.fillStyle = `rgba(${v},${v},${v},0.4)`; g.fillRect(Math.random() * S, Math.random() * S, rnd(1, 3), rnd(1, 3)); }
  return tex(c, true, true);
}

function drawMascot(g: CanvasRenderingContext2D, x: number, y: number, s: number, accent: string, soft: string) {
  // round blob with antenna — original mascot, not a cat
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = soft; g.beginPath(); g.ellipse(0, 8, 38, 34, 0, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, 34, 32, 0, 0, 7); g.fill();
  g.strokeStyle = accent; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -32); g.lineTo(0, -48); g.stroke();
  g.fillStyle = accent; g.beginPath(); g.arc(0, -52, 6, 0, 7); g.fill();
  g.fillStyle = '#2a2a2e'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 12, -4, 5, 7, 0, 0, 7); g.fill(); }
  g.fillStyle = '#fff'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 13.5, -6.5, 2, 0, 7); g.fill(); }
  g.strokeStyle = '#2a2a2e'; g.lineWidth = 2.2; g.beginPath(); g.arc(0, 6, 8, 0.15, Math.PI - 0.15); g.stroke();
  g.fillStyle = accent; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 22, 6, 6, 4, 0, 0, 7); g.fill(); }
  g.restore();
}

/** top lightbox: brand + mascot */
export function headerSign(accentHex: string, softHex: string) {
  const W = 1024, H = 220; const { c, g } = canvas(W, H);
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, softHex); bg.addColorStop(1, '#ffffff');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // accent stripe bars
  g.fillStyle = accentHex; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10);
  for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? accentHex : '#ffffff'; g.fillRect(i * 18, 14, 16, 18); g.fillRect(i * 18, H - 32, 16, 18); }
  drawMascot(g, 150, H / 2 + 4, 1.35, accentHex, softHex);
  g.fillStyle = accentHex; g.font = `900 96px ${FONT}`; g.textBaseline = 'middle'; g.fillText('爪爪乐', 260, H / 2 - 6);
  g.fillStyle = '#3a3a40'; g.font = `bold 28px ${FONT}`; g.fillText('PAW PLAY', 270, H / 2 + 46);
  g.fillStyle = accentHex; g.font = `bold 22px ${FONT}`; g.fillText('HAPPY GAMES', 480, H / 2 + 46);
  return tex(c);
}

/** colorful printed backboard: soft geometric + mascot scene (not farm, not sunburst) */
export function backboardPrint(accentHex: string, softHex: string) {
  const W = 512, H = 640; const { c, g } = canvas(W, H);
  // soft pastel field
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, softHex); sky.addColorStop(0.55, '#ffffff'); sky.addColorStop(1, accentHex + '55');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // soft dots (halftone-ish, restrained)
  g.fillStyle = accentHex + '33';
  for (let y = 20; y < H * 0.55; y += 28) for (let x = 20; x < W; x += 28) { g.beginPath(); g.arc(x + (y % 56) * 0.15, y, 4, 0, 7); g.fill(); }
  // floating geometric shapes
  for (let i = 0; i < 10; i++) {
    g.fillStyle = [accentHex + '55', '#ffffffaa', '#ffe08a88'][i % 3];
    const x = rnd(30, W - 30), y = rnd(40, H * 0.5), r = rnd(10, 28);
    if (i % 3 === 0) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    else if (i % 3 === 1) { g.fillRect(x - r, y - r * 0.6, r * 2, r * 1.2); }
    else { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.6); g.lineTo(x - r, y + r * 0.6); g.fill(); }
  }
  // soft ground band
  g.fillStyle = accentHex + '40'; g.beginPath(); g.ellipse(W / 2, H * 0.78, W * 0.55, 70, 0, 0, 7); g.fill();
  drawMascot(g, W * 0.32, H * 0.62, 2.2, accentHex, softHex);
  // speech bubble
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect?.(W * 0.52, H * 0.42, 180, 70, 16);
  if (!g.roundRect) { g.fillRect(W * 0.52, H * 0.42, 180, 70); } else g.fill();
  g.beginPath(); g.moveTo(W * 0.55, H * 0.52); g.lineTo(W * 0.48, H * 0.58); g.lineTo(W * 0.58, H * 0.55); g.fill();
  g.fillStyle = accentHex; g.font = `900 36px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('好抓!', W * 0.52 + 90, H * 0.42 + 36);
  g.textAlign = 'left';
  // brand strip
  g.fillStyle = accentHex; g.fillRect(0, H - 56, W, 56);
  g.fillStyle = '#fff'; g.font = `bold 28px ${FONT}`; g.fillText('爪爪乐  ·  PAW PLAY', 24, H - 28);
  return tex(c);
}

export function prizeOutRing(accentHex: string) {
  const S = 512; const { c, g } = canvas(S, S);
  g.clearRect(0, 0, S, S);
  g.fillStyle = accentHex; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, 7); g.arc(S / 2, S / 2, S / 2 - 48, 0, 7, true); g.fill();
  // inner dark hole hint
  g.fillStyle = '#1a1a1e'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 52, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = `900 52px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('PRIZE OUT', S / 2, S / 2 - 8);
  g.font = `bold 28px ${FONT}`; g.fillText('取物口', S / 2, S / 2 + 32);
  return tex(c);
}

export function ledgeLabel(accentHex: string) {
  const W = 512, H = 96; const { c, g } = canvas(W, H);
  g.fillStyle = accentHex; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.font = `900 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('爪爪乐  PAW PLAY', W / 2, H / 2);
  return tex(c);
}

export function doorSticker(accentHex: string, softHex: string) {
  const W = 256, H = 320; const { c, g } = canvas(W, H);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.strokeStyle = accentHex; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
  drawMascot(g, W / 2, H * 0.42, 2.0, accentHex, softHex);
  g.fillStyle = accentHex; g.font = `bold 26px ${FONT}`; g.textAlign = 'center'; g.fillText('爪爪乐', W / 2, H * 0.82);
  return tex(c);
}

export function lcdPanel() {
  const W = 320, H = 160; const { c, g } = canvas(W, H);
  g.fillStyle = '#0e1a14'; g.fillRect(0, 0, W, H);
  // faux LCD green tint grid
  g.fillStyle = 'rgba(40, 180, 90, 0.08)';
  for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1);
  return tex(c);
}

export function floorTiles() {
  const S = 512; const { c, g } = canvas(S, S);
  g.fillStyle = '#e8e6e2'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 225 + ((x + y) % 2) * 8; g.fillStyle = `rgb(${v},${v - 1},${v - 3})`; g.fillRect(x * S / 4, y * S / 4, S / 4, S / 4);
  }
  g.strokeStyle = '#cfcac3'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * S / 4, 0); g.lineTo(i * S / 4, S); g.moveTo(0, i * S / 4); g.lineTo(S, i * S / 4); g.stroke(); }
  const t = tex(c, true, true); t.repeat.set(6, 6); return t;
}

export function feltPlain() {
  const S = 256; const { c, g } = canvas(S, S);
  g.fillStyle = '#3a4a62'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) { const v = rnd(-10, 10); g.fillStyle = `rgba(${58 + v},${74 + v},${98 + v},0.55)`; g.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4); }
  const t = tex(c, true, true); t.repeat.set(3, 3); return t;
}

export function glassReflection() {
  const W = 256, H = 320; const { c, g } = canvas(W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.filter = 'blur(8px)';
  for (const [y, w, h] of [[30, 90, 16], [70, 70, 12], [105, 50, 8]] as const)
    for (const x of [W * 0.28, W * 0.72]) { g.fillStyle = 'rgba(255,250,240,0.85)'; g.fillRect(x - w / 2, y, w, h); }
  g.filter = 'none'; return tex(c);
}
