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

export function feltTexture() {
  const S = 512; const { c, g } = canvas(S, S);
  const grd = g.createLinearGradient(0, 0, S, S); grd.addColorStop(0, '#2a1d5c'); grd.addColorStop(1, '#3b1f6b');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) { const v = Math.random() * 40; g.fillStyle = `rgba(${200 + v},${180 + v},255,0.035)`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  g.font = '44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const sym = ['★', '♥', '✦', '♥'];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? 'rgba(255,140,200,0.35)' : 'rgba(140,220,255,0.3)';
    g.fillText(sym[(x + y * 2) % 4], x * 128 + 64 + (y % 2) * 32, y * 128 + 64);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(2, 2); t.anisotropy = 4;
  return t;
}

export function backdropTexture() {
  const W = 512, H = 640; const { c, g } = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#ff7bc0'); grd.addColorStop(0.55, '#a46bff'); grd.addColorStop(1, '#4b3bd6');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.18;
  for (let i = 0; i < 14; i++) { g.fillStyle = '#fff'; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 20 + Math.random() * 70, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  g.font = 'bold 40px sans-serif'; g.textAlign = 'center';
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.4})`; g.fillText(Math.random() < 0.5 ? '★' : '♥', Math.random() * W, Math.random() * H); }
  g.font = 'bold 72px "PingFang SC","Microsoft YaHei",sans-serif'; g.fillStyle = 'rgba(255,255,255,0.92)';
  g.shadowColor = '#ff3d9a'; g.shadowBlur = 20;
  g.fillText('好运连连', W / 2, H * 0.3);
  g.font = 'bold 34px sans-serif'; g.fillText('LUCKY  CATCH', W / 2, H * 0.3 + 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function signTexture() {
  const W = 1024, H = 256; const { c, g } = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, '#2b0f4f'); grd.addColorStop(0.5, '#431466'); grd.addColorStop(1, '#2b0f4f');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 150px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
  g.shadowColor = '#ff4fb0'; g.shadowBlur = 30; g.fillStyle = '#ffe3f4'; g.fillText('夹娃娃', W / 2, H / 2 - 12);
  g.shadowBlur = 12; g.shadowColor = '#5ff4ff'; g.fillStyle = '#c9fbff'; g.font = 'bold 40px sans-serif'; g.fillText('C L A W   M A C H I N E', W / 2, H - 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function tileTexture() {
  const S = 256; const { c, g } = canvas(S, S);
  g.fillStyle = '#1a1424'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#231b31'; g.fillRect(0, 0, S / 2, S / 2); g.fillRect(S / 2, S / 2, S / 2, S / 2);
  g.strokeStyle = '#0c0912'; g.lineWidth = 4; g.strokeRect(0, 0, S, S); g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(14, 14); t.anisotropy = 4; return t;
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

export function glassStreaks() {
  const W = 256, H = 512; const { c, g } = canvas(W, H);
  g.clearRect(0, 0, W, H);
  const band = (x: number, w: number, a: number) => {
    g.save(); g.translate(x, 0); g.transform(1, 0, -0.45, 1, 0, 0);
    const grd = g.createLinearGradient(-w / 2, 0, w / 2, 0); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, `rgba(255,255,255,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(-w / 2, 0, w, H * 1.2); g.restore();
  };
  band(150, 70, 0.9); band(230, 24, 0.7); band(330, 40, 0.5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function burstTexture() {
  const S = 512; const { c, g } = canvas(S, S); g.translate(S / 2, S / 2);
  for (let i = 0; i < 18; i++) {
    g.rotate((Math.PI * 2) / 18);
    const grd = g.createLinearGradient(0, 0, S / 2, 0); grd.addColorStop(0, 'rgba(255,240,180,0.9)'); grd.addColorStop(1, 'rgba(255,120,200,0)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(0, 0); g.lineTo(S / 2, -22); g.lineTo(S / 2, 22); g.fill();
  }
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, S / 2); rg.addColorStop(0, 'rgba(255,255,230,1)'); rg.addColorStop(0.25, 'rgba(255,200,240,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(-S / 2, -S / 2, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function grilleTexture() {
  const S = 128; const { c, g } = canvas(S, S);
  g.fillStyle = '#26222e'; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.fill();
  g.fillStyle = '#07060a';
  for (let y = 8; y < S; y += 9) for (let x = 8; x < S; x += 9) if (Math.hypot(x - S / 2, y - S / 2) < S / 2 - 8) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
  g.strokeStyle = '#d8d8e0'; g.lineWidth = 5; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
