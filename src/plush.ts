// Plush toys: procedural geometry + custom "plush" material (sheen fabric, stitched seams, fur shells,
// and vertex deformation for soft-body feel: impact squash/wobble, claw-prong dents, floor sag).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PrizeType } from './physics.ts';
import { fabricNormal, fabricDetail, furNoise } from './textures.ts';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const E = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);

export const furGlobals = { uShells: { value: 6 }, uFurLen: { value: 0.0032 }, uFurTex: { value: null as THREE.Texture | null } };
let furCount = 6;
const allFur = new Set<THREE.InstancedMesh>();
export function setFurShells(n: number) {
  furCount = n; furGlobals.uShells.value = Math.max(1, n);
  for (const m of allFur) { m.count = n; m.visible = n > 0; }
}

export interface PlushUniforms {
  uCenter: { value: THREE.Vector3 }; uDent: { value: THREE.Vector4[] }; uSquash: { value: THREE.Vector4 }; uFloorY: { value: number };
}
export function makePlushUniforms(): PlushUniforms {
  return { uCenter: { value: V() }, uDent: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] }, uSquash: { value: new THREE.Vector4(0, 1, 0, 0) }, uFloorY: { value: 0 } };
}

const WHITE = new THREE.Color(0xffffff);
function plushMaterial(color: number, u: PlushUniforms, fur: boolean) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.96, metalness: 0, sheen: 0.8, sheenRoughness: 0.5, sheenColor: c.clone().lerp(WHITE, 0.3),
    map: fabricDetail(), normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.5, 0.5),
  });
  furGlobals.uFurTex.value = furNoise();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, furGlobals);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uCenter; uniform vec4 uDent[3]; uniform vec4 uSquash; uniform float uFloorY; uniform float uShells; uniform float uFurLen;
varying float vShell;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vShell = 0.0;
${fur ? 'vShell = float(gl_InstanceID + 1) / uShells; transformed += normalize(objectNormal) * uFurLen * vShell; transformed.y -= uFurLen * 0.35 * vShell * vShell;' : ''}
{ float ax = dot(transformed, uSquash.xyz);
  transformed += uSquash.xyz * ax * (-uSquash.w) + (transformed - uSquash.xyz * ax) * (uSquash.w * 0.55); }
for (int i = 0; i < 3; i++) {
  if (uDent[i].w <= 0.0) continue;
  float dd = length(transformed - uDent[i].xyz);
  float f = clamp(1.0 - dd / 0.034, 0.0, 1.0); f = f * f * (3.0 - 2.0 * f);
  transformed -= normalize(uDent[i].xyz + vec3(1e-5)) * uDent[i].w * f;
}`)
      .replace('#include <project_vertex>', `vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
{ float pen = uFloorY - wp0.y; if (pen > 0.0) { vec2 o = wp0.xz - uCenter.xz; float lo = length(o); wp0.y = uFloorY - pen * 0.15; if (lo > 1e-4) wp0.xz += o / lo * pen * 0.45; } }
vec4 mvPosition = viewMatrix * wp0;
gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vShell; uniform sampler2D uFurTex;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
${fur ? '{ float n = texture2D(uFurTex, vMapUv * vec2(16.0, 8.0)).r; if (n < vShell) discard; diffuseColor.rgb *= mix(0.74, 1.1, vShell); }' : 'diffuseColor.rgb *= 0.9;'}`);
  };
  m.customProgramCacheKey = () => (fur ? 'plush-fur' : 'plush');
  m.userData.plush = true;
  if (fur) m.userData.fur = true;
  return m;
}

// shared non-fabric materials
const MAT = {
  eye: new THREE.MeshPhysicalMaterial({ color: 0x0b0b10, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
  tag: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.85, side: THREE.DoubleSide }),
  tagPrint: new THREE.MeshStandardMaterial({ color: 0x9a3a34, roughness: 0.85 }),
  eyeHi: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
  thread: new THREE.MeshStandardMaterial({ color: 0x3a2420, roughness: 0.95 }),
  nose: new THREE.MeshPhysicalMaterial({ color: 0x3a2018, roughness: 0.25, clearcoat: 0.8 }),
  felt: new THREE.MeshStandardMaterial({ color: 0xcf8a3e, roughness: 0.9 }),
  ribbon: new THREE.MeshPhysicalMaterial({ color: 0x9c3a40, roughness: 0.45, sheen: 0.7, sheenColor: new THREE.Color(0xd9a0a6), sheenRoughness: 0.4 }),
  blush: new THREE.MeshStandardMaterial({ color: 0xd88f8c, roughness: 1, transparent: true, opacity: 0.32, depthWrite: false }),
};

const sphere = new THREE.SphereGeometry(1, 32, 22);
const sphereLo = new THREE.SphereGeometry(1, 14, 10);
const cone = new THREE.ConeGeometry(1, 1, 18);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 22);
const box = new THREE.BoxGeometry(1, 1, 1);
const smile = new THREE.TorusGeometry(0.0055, 0.0011, 5, 14, Math.PI);
const capsule = (r: number, hh: number) => new THREE.CapsuleGeometry(r, hh * 2, 10, 24);

class Builder {
  parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, p: THREE.Vector3, s: THREE.Vector3 | number, rot?: THREE.Euler) {
    const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(rot ?? E()), typeof s === 'number' ? V(s, s, s) : s);
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(m);
    const arr = this.parts.get(mat) ?? []; arr.push(g); this.parts.set(mat, arr);
  }
  build(furFor: Map<THREE.Material, THREE.Material>) {
    const grp = new THREE.Group();
    for (const [mat, geos] of this.parts) {
      const geo = mergeGeometries(geos);
      const mesh = new THREE.Mesh(geo, mat);
      const tr = (mat as THREE.MeshStandardMaterial).transparent;
      mesh.castShadow = !tr; mesh.receiveShadow = !tr;
      grp.add(mesh);
      const furMat = furFor.get(mat);
      if (furMat) {
        const fm = new THREE.InstancedMesh(geo, furMat, 10);
        fm.count = furCount; fm.visible = furCount > 0; fm.castShadow = false; fm.receiveShadow = true;
        allFur.add(fm); grp.add(fm);
      }
    }
    return grp;
  }
}

export interface PlushModel { group: THREE.Group; u: PlushUniforms }

export function disposePlush(m: PlushModel) {
  m.group.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) allFur.delete(o as THREE.InstancedMesh);
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) { mesh.geometry.dispose(); const mt = mesh.material as THREE.Material; if (mt.userData.plush) mt.dispose(); }
  });
}

export function buildPrize(type: PrizeType, color: number, seed = 0.5): PlushModel {
  const u = makePlushUniforms();
  // deterministic per-toy variation: slight colour drift, asymmetric stitching, ear angles
  let st = Math.floor(seed * 2147483646) + 1; const r = () => ((st = (st * 16807) % 2147483647) / 2147483647); const j = (a: number) => (r() * 2 - 1) * a;
  { const hsl = { h: 0, s: 0, l: 0 }; const cc = new THREE.Color(color); cc.getHSL(hsl); cc.setHSL(hsl.h + j(0.012), Math.max(0, hsl.s * (0.9 + j(0.12))), hsl.l * (0.95 + j(0.06))); color = cc.getHex(); }
  const b = new Builder();
  const furFor = new Map<THREE.Material, THREE.Material>();
  const cache = new Map<number, THREE.Material>();
  const F = (col: number) => {
    let m = cache.get(col);
    if (!m) { m = plushMaterial(col, u, false); cache.set(col, m); furFor.set(m, plushMaterial(col, u, true)); }
    return m;
  };
  const base = F(color);
  const light = F(new THREE.Color(color).lerp(new THREE.Color(0xf0e7d8), 0.55).getHex());
  const pink = F(0xd6a3a0);
  const eyes = (y: number, z: number, dx: number, rr = 0.0062, tilt = 0) => {
    for (const s of [-1, 1]) b.add(sphereLo, MAT.eye, V(s * dx + j(0.0012), y + j(0.0012), z + 0.0026), V(rr, rr * 1.12, rr * 0.75), E(-tilt, 0, 0));
  };
  const mouth = (y: number, z: number, tiltX = 0.25) => {
    for (const s of [-1, 1]) b.add(smile, MAT.thread, V(s * 0.0054, y, z + 0.0022), 1, E(tiltX, 0, Math.PI));
  };
  const blush = (y: number, z: number, dx: number, rotY = 0.5) => { for (const s of [-1, 1]) b.add(sphereLo, MAT.blush, V(s * dx, y, z + 0.0028), V(0.0085, 0.0052, 0.0015), E(0, s * rotY, 0)); };

  switch (type.id) {
    case 'bear': {
      b.add(sphere, base, V(0, 0, 0), V(0.045, 0.047, 0.042));
      b.add(sphere, light, V(0, -0.006, 0.027), V(0.028, 0.03, 0.018));
      b.add(sphere, base, V(0, 0.07, 0.004), V(0.048, 0.044, 0.044));
      b.add(sphere, light, V(0, 0.06, 0.041), V(0.021, 0.016, 0.012));
      b.add(sphereLo, MAT.nose, V(0, 0.066, 0.0545), V(0.0085, 0.006, 0.0055));
      mouth(0.0555, 0.0515);
      eyes(0.079, 0.0435, 0.0175, 0.0064, 0.15); blush(0.064, 0.042, 0.03);
      for (const s of [-1, 1]) {
        b.add(sphere, base, V(s * 0.035, 0.106, 0), V(0.016, 0.016, 0.0095), E(0, 0, j(0.25)));
        b.add(sphere, pink, V(s * 0.035, 0.105, 0.0058), V(0.0095, 0.0095, 0.004));
        b.add(capsule(0.0165, 0.012), base, V(s * 0.043, 0.004, 0.016), 1, E(0.6, 0, s * 0.75));
        b.add(sphere, base, V(s * 0.023, -0.037, 0.022), V(0.02, 0.018, 0.024));
        b.add(sphere, light, V(s * 0.023, -0.039, 0.043), V(0.012, 0.011, 0.004));
      }
      if (r() < 0.5) {
      b.add(cone, MAT.ribbon, V(-0.011, 0.031, 0.036), V(0.009, 0.018, 0.006), E(0, 0, Math.PI / 2));
      b.add(cone, MAT.ribbon, V(0.011, 0.031, 0.036), V(0.009, 0.018, 0.006), E(0, 0, -Math.PI / 2));
      b.add(sphereLo, MAT.ribbon, V(0, 0.031, 0.038), 0.0045);
      }
      break;
    }
    case 'bunny': {
      b.add(sphere, base, V(0, 0, 0), V(0.041, 0.043, 0.039));
      b.add(sphere, light, V(0, -0.004, 0.025), V(0.024, 0.027, 0.016));
      b.add(sphere, base, V(0, 0.064, 0.004), V(0.045, 0.041, 0.041));
      b.add(sphereLo, pink, V(0, 0.062, 0.0465), V(0.0055, 0.0042, 0.003));
      mouth(0.0545, 0.0435);
      eyes(0.072, 0.039, 0.016, 0.0062, 0.1); blush(0.058, 0.038, 0.027);
      for (const s of [-1, 1]) {
        b.add(capsule(0.012, 0.022), base, V(s * 0.017, 0.128, -0.004), V(1, 1, 0.55), E(j(0.2), 0, -s * 0.16 + j(0.22)));
        b.add(capsule(0.007, 0.018), pink, V(s * 0.0175, 0.128, 0.0016), V(1, 1, 0.3), E(0, 0, -s * 0.16));
        b.add(sphere, base, V(s * 0.021, -0.035, 0.02), V(0.017, 0.015, 0.022));
        b.add(capsule(0.012, 0.01), base, V(s * 0.037, 0.002, 0.021), 1, E(0.5, 0, s * 0.5));
      }
      b.add(sphere, F(0xffffff), V(0, -0.012, -0.041), 0.014);
      break;
    }
    case 'chick': {
      b.add(sphere, base, V(0, 0, 0), V(0.054, 0.052, 0.053));
      b.add(cone, MAT.felt, V(0, 0.004, 0.056), V(0.0095, 0.016, 0.009), E(Math.PI / 2, 0, 0));
      eyes(0.017, 0.0485, 0.019, 0.0068); blush(0.0, 0.048, 0.031, 0.6);
      for (const s of [-1, 1]) {
        b.add(sphere, base, V(s * 0.05, -0.004, -0.002), V(0.01, 0.023, 0.018), E(0, 0, s * 0.4));
        b.add(sphere, MAT.felt, V(s * 0.018, -0.05, 0.02), V(0.012, 0.005, 0.016));
      }
      for (let i = -1; i <= 1; i++) b.add(sphere, base, V(i * 0.008, 0.056, -0.004), V(0.006, 0.013, 0.006), E(0, 0, i * 0.45));
      break;
    }
    case 'penguin': {
      b.add(capsule(0.044, 0.026), base, V(0, 0.01, 0), 1);
      b.add(capsule(0.04, 0.02), F(0xece8df), V(0, 0.002, 0.019), V(0.84, 0.98, 0.78));
      b.add(cone, MAT.felt, V(0, 0.036, 0.048), V(0.008, 0.014, 0.006), E(Math.PI / 2, 0, 0));
      for (const s of [-1, 1]) {
        b.add(sphereLo, MAT.eyeWhite, V(s * 0.0145, 0.05, 0.0405), V(0.0085, 0.0095, 0.004));
        b.add(sphereLo, MAT.eye, V(s * 0.0145, 0.0495, 0.0435), V(0.0048, 0.0058, 0.003));
        b.add(sphere, base, V(s * 0.045, 0.004, 0), V(0.008, 0.028, 0.016), E(0, 0, s * 0.35));
        b.add(sphere, MAT.felt, V(s * 0.017, -0.06, 0.018), V(0.013, 0.005, 0.017));
      }
      blush(0.036, 0.04, 0.027);
      break;
    }
    default: { // pig
      b.add(sphere, base, V(0, 0, 0), V(0.056, 0.054, 0.055));
      const snout = F(new THREE.Color(color).multiplyScalar(0.86).getHex());
      b.add(cyl, snout, V(0, -0.003, 0.054), V(0.019, 0.012, 0.014), E(Math.PI / 2, 0, 0));
      for (const s of [-1, 1]) {
        b.add(sphereLo, MAT.nose, V(s * 0.006, -0.003, 0.0625), V(0.003, 0.0045, 0.002));
        b.add(sphere, base, V(s * 0.03, 0.047, -0.004), V(0.017, 0.015, 0.006), E(0.35 + j(0.15), 0, -s * 0.6 + j(0.2)));
        b.add(sphere, snout, V(s * 0.026, -0.046, 0.016), V(0.014, 0.012, 0.016));
      }
      mouth(-0.02, 0.0525, 0.6);
      eyes(0.023, 0.051, 0.021, 0.0064); blush(0.008, 0.051, 0.036, 0.6);
    }
  }
  // sewn-in care tag on the lower side/back seam
  { const side = r() < 0.5 ? -1 : 1; const ty = type.id === 'chick' || type.id === 'pig' ? -0.03 : -0.022; const tx = side * (type.id === 'chick' || type.id === 'pig' ? 0.036 : 0.026);
    const rot = E(j(0.3), side * 0.9, j(0.4) + side * 0.2);
    b.add(box, MAT.tag, V(tx, ty - 0.012, -0.027), V(0.014, 0.026, 0.0012), rot);
    b.add(box, MAT.tagPrint, V(tx, ty - 0.006, -0.027), V(0.0145, 0.003, 0.0014), rot); }
  return { group: b.build(furFor), u };
}
