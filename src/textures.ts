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


// ======================= realistic arcade textures =======================
const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function tex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/** multiplier map for painted sheet metal: scratches, scuffs, edge wear and grime toward the bottom */
export function paintWear(grimeBottom = true) {
  const S = 512; const { c, g } = canvas(S, S);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2500; i++) { const v = 235 + Math.random() * 20; g.fillStyle = `rgba(${v},${v},${v - 4},0.35)`; g.fillRect(Math.random() * S, Math.random() * S, rnd(1, 4), rnd(1, 4)); }
  // scratches
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * S, y = Math.random() * S, a = rnd(-0.6, 0.6) + (Math.random() < 0.5 ? 0 : Math.PI / 2), l = rnd(8, 60);
    g.strokeStyle = Math.random() < 0.7 ? `rgba(255,255,255,${rnd(0.3, 0.7)})` : `rgba(90,85,80,${rnd(0.15, 0.35)})`;
    g.lineWidth = rnd(0.5, 1.4); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rnd(-3, 3), y + Math.sin(a) * l * 0.5 + rnd(-3, 3), x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // scuffs
  for (let i = 0; i < 14; i++) { const r = rnd(4, 14); const grd = g.createRadialGradient(0, 0, 0, 0, 0, r); grd.addColorStop(0, 'rgba(70,65,60,0.09)'); grd.addColorStop(1, 'rgba(70,65,60,0)'); g.save(); g.translate(Math.random() * S, Math.random() * S); g.scale(rnd(1, 3), 1); g.fillStyle = grd; g.fillRect(-r, -r, r * 2, r * 2); g.restore(); }
  // edge wear
  const ew = g.createLinearGradient(0, 0, 14, 0); ew.addColorStop(0, 'rgba(255,255,255,0.5)'); ew.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = ew; g.fillRect(0, 0, 14, S); g.save(); g.translate(S, 0); g.scale(-1, 1); g.fillRect(0, 0, 14, S); g.restore();
  if (grimeBottom) { const gr = g.createLinearGradient(0, S * 0.7, 0, S); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }
  return tex(c, true, true);
}

/** smudges, fingerprints and dust for the front glass (RGBA overlay) */
export function glassSmudge() {
  const W = 512, H = 640; const { c, g } = canvas(W, H);
  g.clearRect(0, 0, W, H);
  // broad wipe marks
  for (let i = 0; i < 9; i++) {
    g.save(); g.translate(rnd(60, W - 60), rnd(H * 0.35, H * 0.95)); g.rotate(rnd(-0.5, 0.5));
    const r = rnd(40, 110); const grd = g.createRadialGradient(0, 0, 0, 0, 0, r); grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.scale(1, rnd(0.25, 0.6)); g.fillStyle = grd; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
  }
  // fingerprints (concentric ridges), concentrated around hand height
  for (let i = 0; i < 10; i++) {
    const x = rnd(40, W - 40), y = rnd(H * 0.6, H * 0.97), sx = rnd(5, 8), sy = sx * 1.35, rot = rnd(-0.8, 0.8);
    g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 0.7;
    for (let k = 1; k < 7; k++) { g.beginPath(); g.ellipse(rnd(-0.6, 0.6), rnd(-0.6, 0.6), sx * k / 6, sy * k / 6, 0, rnd(0, 1), Math.PI * 2 - rnd(0, 1.2)); g.stroke(); }
    g.restore();
  }
  // dust specks
  for (let i = 0; i < 350; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.08, 0.3)})`; g.fillRect(Math.random() * W, Math.random() * H, rnd(0.5, 1.2), rnd(0.5, 1.2)); }
  // dusty bottom edge
  const db = g.createLinearGradient(0, H - 40, 0, H); db.addColorStop(0, 'rgba(255,255,255,0)'); db.addColorStop(1, 'rgba(255,255,255,0.35)'); g.fillStyle = db; g.fillRect(0, H - 40, W, 40);
  return tex(c);
}

/** slightly faded printed backboard: a simple farm-meadow illustration */
export function backboardPrint() {
  const W = 512, H = 640; const { c, g } = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.6); sky.addColorStop(0, '#7fb0cf'); sky.addColorStop(1, '#cfe3e6'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // clouds
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [x, y, s] of [[130, 250, 0.9], [380, 110, 1.3], [300, 220, 0.8]]) for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + (k - 2) * 22 * s, y + Math.sin(k) * 6 * s, (18 + (k % 2) * 8) * s, 0, 7); g.fill(); }
  // hills
  g.fillStyle = '#8fb46a'; g.beginPath(); g.moveTo(0, H * 0.58); g.bezierCurveTo(W * 0.3, H * 0.48, W * 0.55, H * 0.62, W, H * 0.52); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  g.fillStyle = '#76a052'; g.beginPath(); g.moveTo(0, H * 0.7); g.bezierCurveTo(W * 0.4, H * 0.62, W * 0.7, H * 0.75, W, H * 0.66); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  // fence
  g.fillStyle = '#d9b98a'; g.strokeStyle = '#a3825a'; g.lineWidth = 2;
  for (let x = 10; x < W; x += 46) { g.fillRect(x, H * 0.6, 12, 70); g.strokeRect(x, H * 0.6, 12, 70); }
  g.fillRect(0, H * 0.62, W, 9); g.fillRect(0, H * 0.67, W, 9);
  // little flowers
  for (let i = 0; i < 60; i++) { g.fillStyle = ['#f3e7a6', '#f2c7cf', '#ffffff'][i % 3]; g.beginPath(); g.arc(Math.random() * W, H * 0.72 + Math.random() * H * 0.28, 2.5, 0, 7); g.fill(); }
  // red barn
  g.fillStyle = '#b6544a'; g.fillRect(360, H * 0.47, 96, 70); g.fillStyle = '#8e3b33'; g.beginPath(); g.moveTo(350, H * 0.47); g.lineTo(408, H * 0.4); g.lineTo(466, H * 0.47); g.fill();
  g.fillStyle = '#f2ebe0'; g.fillRect(396, H * 0.5, 24, 40);
  // title block + fine print
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(28, 96, 230, 64); g.strokeStyle = '#c0533f'; g.lineWidth = 3; g.strokeRect(28, 96, 230, 64);
  g.fillStyle = '#c0533f'; g.font = `bold 40px ${FONT}`; g.textBaseline = 'middle'; g.fillText('开心农场', 48, 128);
  g.fillStyle = 'rgba(40,50,40,0.75)'; g.font = `18px ${FONT}`; g.fillText('本机奖品均为正品 · 请勿拍打机台', 28, H - 22);
  // fade: lift blacks, slight yellowing, uneven backlight
  g.fillStyle = 'rgba(245,235,210,0.22)'; g.fillRect(0, 0, W, H);
  const vg = g.createRadialGradient(W / 2, H * 0.35, 50, W / 2, H * 0.5, H * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(30,25,15,0.28)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return tex(c);
}

/** backlit acrylic header sign */
export function headerSign() {
  const W = 1024, H = 256; const { c, g } = canvas(W, H);
  const bg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6); bg.addColorStop(0, '#fbf7ef'); bg.addColorStop(1, '#e7dccb'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#c4362c'; g.fillRect(0, 0, W, 26); g.fillRect(0, H - 26, W, 26);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 132px ${FONT}`; g.fillStyle = '#c4362c'; g.fillText('抓娃娃', W / 2 - 60, H / 2 + 4);
  g.font = `bold 34px ${FONT}`; g.fillStyle = '#2b2b2b'; g.fillText('1元1局', W / 2 + 270, H / 2 - 22);
  g.font = `24px ${FONT}`; g.fillStyle = '#555'; g.fillText('扫码 / 投币', W / 2 + 270, H / 2 + 22);
  // slight dirt on the lightbox
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(80,70,60,${rnd(0.03, 0.1)})`; g.fillRect(Math.random() * W, Math.random() * H, rnd(1, 3), rnd(1, 3)); }
  return tex(c);
}

function stickerBase(w: number, h: number, bg: string) { const o = canvas(w, h); o.g.fillStyle = bg; o.g.fillRect(0, 0, w, h); return o; }
function ageSticker(g: CanvasRenderingContext2D, w: number, h: number) {
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(90,80,60,${rnd(0.03, 0.12)})`; g.fillRect(Math.random() * w, Math.random() * h, rnd(1, 3), rnd(1, 3)); }
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(rnd(0, w * 0.6), 0, rnd(2, 6), h); // crease highlight
}

export function instructionSticker() {
  const W = 320, H = 420; const { c, g } = stickerBase(W, H, '#f4f1ea');
  g.fillStyle = '#1f4e8c'; g.fillRect(0, 0, W, 64);
  g.fillStyle = '#fff'; g.font = `bold 36px ${FONT}`; g.textBaseline = 'middle'; g.fillText('操作说明', 22, 33);
  g.fillStyle = '#222'; g.font = `24px ${FONT}`;
  ['1. 投币或扫码', '2. 摇杆移动爪子', '3. 按按钮下爪', '4. 掉入出口即中奖', '5. 到取物口领取'].forEach((t, i) => g.fillText(t, 22, 104 + i * 46));
  g.fillStyle = '#777'; g.font = `16px ${FONT}`; g.fillText('每局限时30秒，超时自动下爪', 22, H - 34);
  ageSticker(g, W, H); return tex(c);
}

export function warningSticker() {
  const W = 300, H = 120; const { c, g } = stickerBase(W, H, '#f3c623');
  g.strokeStyle = '#1b1b1b'; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12);
  g.fillStyle = '#1b1b1b'; g.beginPath(); g.moveTo(58, 26); g.lineTo(96, 94); g.lineTo(20, 94); g.closePath(); g.fill();
  g.fillStyle = '#f3c623'; g.font = `bold 46px ${FONT}`; g.textAlign = 'center'; g.fillText('!', 58, 88);
  g.textAlign = 'left'; g.fillStyle = '#1b1b1b'; g.font = `bold 30px ${FONT}`; g.fillText('注意', 112, 50); g.font = `22px ${FONT}`; g.fillText('请勿摇晃、拍打机台', 112, 86);
  ageSticker(g, W, H); return tex(c);
}

export function qrSticker() {
  const W = 220, H = 280; const { c, g } = stickerBase(W, H, '#ffffff');
  g.fillStyle = '#1aad19'; g.fillRect(0, 0, W, 48); g.fillStyle = '#fff'; g.font = `bold 26px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('扫码支付', W / 2, 25);
  const N = 25, cell = 6, ox = (W - N * cell) / 2, oy = 62;
  g.fillStyle = '#111';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.random() < 0.48) g.fillRect(ox + x * cell, oy + y * cell, cell, cell);
  const finder = (fx: number, fy: number) => { g.fillStyle = '#fff'; g.fillRect(ox + fx * cell - cell, oy + fy * cell - cell, 9 * cell, 9 * cell); g.fillStyle = '#111'; g.fillRect(ox + fx * cell, oy + fy * cell, 7 * cell, 7 * cell); g.fillStyle = '#fff'; g.fillRect(ox + (fx + 1) * cell, oy + (fy + 1) * cell, 5 * cell, 5 * cell); g.fillStyle = '#111'; g.fillRect(ox + (fx + 2) * cell, oy + (fy + 2) * cell, 3 * cell, 3 * cell); };
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
  g.fillStyle = '#333'; g.font = `18px ${FONT}`; g.fillText('微信 / 支付宝', W / 2, H - 42); g.fillText('1元 = 1币', W / 2, H - 18);
  ageSticker(g, W, H); return tex(c);
}

export function coinPlate() {
  const W = 200, H = 300; const { c, g } = canvas(W, H);
  const m = g.createLinearGradient(0, 0, W, H); m.addColorStop(0, '#c9ccd0'); m.addColorStop(0.5, '#a9adb3'); m.addColorStop(1, '#c2c5ca'); g.fillStyle = m; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(255,255,255,${rnd(0.05, 0.2)})`; g.beginPath(); const y = Math.random() * H; g.moveTo(0, y); g.lineTo(W, y + rnd(-2, 2)); g.stroke(); }
  g.fillStyle = '#16171a'; g.fillRect(W / 2 - 7, 60, 14, 70); g.fillStyle = '#2d2f33'; g.fillRect(W / 2 - 30, 190, 60, 50);
  g.fillStyle = '#333'; g.font = `bold 24px ${FONT}`; g.textAlign = 'center'; g.fillText('投币', W / 2, 40); g.font = `18px ${FONT}`; g.fillText('退币', W / 2, 270);
  for (const [x, y] of [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]]) { g.fillStyle = '#7d8187'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.strokeStyle = '#555'; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.stroke(); }
  return tex(c);
}

export function floorTiles() {
  const S = 512; const { c, g } = canvas(S, S);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const v = 150 + Math.random() * 18; g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(x * S / 2, y * S / 2, S / 2, S / 2); }
  for (let i = 0; i < 5000; i++) { const v = Math.random() * 60 + 110; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  for (let i = 0; i < 25; i++) { const r = rnd(20, 80); const grd = g.createRadialGradient(0, 0, 0, 0, 0, r); grd.addColorStop(0, 'rgba(60,55,50,0.12)'); grd.addColorStop(1, 'rgba(60,55,50,0)'); g.save(); g.translate(Math.random() * S, Math.random() * S); g.fillStyle = grd; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore(); }
  g.strokeStyle = '#6d6863'; g.lineWidth = 3; g.strokeRect(0, 0, S, S); g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  const t = tex(c, true, true); t.repeat.set(8, 8); return t;
}

/** dark felt for the play-field floor */
export function feltPlain() {
  const S = 256; const { c, g } = canvas(S, S);
  g.fillStyle = '#2e3646'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) { const v = rnd(-14, 14); g.fillStyle = `rgba(${46 + v},${54 + v},${70 + v},0.6)`; g.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5); }
  for (let i = 0; i < 12; i++) { const r = rnd(10, 40); const grd = g.createRadialGradient(0, 0, 0, 0, 0, r); grd.addColorStop(0, 'rgba(160,160,170,0.08)'); grd.addColorStop(1, 'rgba(160,160,170,0)'); g.save(); g.translate(Math.random() * S, Math.random() * S); g.fillStyle = grd; g.fillRect(-r, -r, 2 * r, 2 * r); g.restore(); }
  const t = tex(c, true, true); t.repeat.set(3, 3); return t;
}

/** soft reflection of the mall's ceiling light panels and shopfront seen in the front glass (additive) */
export function glassReflection() {
  const W = 256, H = 320; const { c, g } = canvas(W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.filter = 'blur(6px)';
  // ceiling light panels, in perspective (closer = larger, near the top of the glass)
  const rows = [[24, 70, 18], [70, 52, 12], [104, 38, 8]];
  for (const [y, w, h] of rows) for (const x of [W * 0.22, W * 0.68]) { g.fillStyle = 'rgba(255,244,228,0.9)'; g.fillRect(x - w / 2 + (y / 10), y, w, h); }
  // bright shopfront band low in the glass + a dark figure-ish silhouette (the player)
  const sf = g.createLinearGradient(0, H * 0.62, 0, H * 0.8); sf.addColorStop(0, 'rgba(240,226,205,0)'); sf.addColorStop(0.5, 'rgba(240,226,205,0.35)'); sf.addColorStop(1, 'rgba(240,226,205,0)');
  g.fillStyle = sf; g.fillRect(0, H * 0.6, W, H * 0.22);
  g.filter = 'blur(14px)'; g.fillStyle = '#000'; g.beginPath(); g.ellipse(W * 0.5, H * 0.66, 34, 60, 0, 0, 7); g.fill();
  g.filter = 'none';
  return tex(c);
}
