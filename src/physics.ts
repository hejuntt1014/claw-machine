// Physics + claw machine logic (Rapier3D). No rendering code here so it can be tested headlessly in Node.
import type RAPIER from '@dimforge/rapier3d-compat';

type RB = RAPIER.RigidBody;
type V3 = { x: number; y: number; z: number };
type Q = { x: number; y: number; z: number; w: number };

// ---- Machine dimensions (meters) ----
export const CAB = { hx: 0.5, hz: 0.4, top: 1.2 };
export const HOLE = { x0: -0.5, x1: -0.22, z0: 0.14, z1: 0.4 };
export const BIN_FLOOR_Y = -0.66;
export const CARRIAGE_Y = 1.13;
export const LIMITS = { x0: -0.34, x1: 0.34, z0: -0.25, z1: 0.26 };
export const HOME = { x: -0.34, z: 0.26 };
export const L_MIN = 0.12;
export const HUB_R = 0.034;
export const HUB_HH = 0.03; // half height
export const PIVOT_R = 0.026;
export const PIVOT_MIN_Y = 0.13;
// Prong centerline in (radial, y) relative to the pivot, closed pose (angle 0)
export const PRONG_PTS: [number, number][] = [
  [0, 0], [0.045, -0.055], [0.052, -0.115], [0.032, -0.152], [0.004, -0.166],
];
export const PRONG_RADIUS = 0.0075;
export const ANG_OPEN = 0.95, ANG_IDLE = 0.32, ANG_CLOSED = -0.32;

export const G_STATIC = 0x0001, G_CLAW = 0x0002, G_PRIZE = 0x0004;
const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

// ---- Prize definitions (physics shape + metadata; visuals live in models.ts) ----
export interface Part { kind: 'ball' | 'capsule'; p: [number, number, number]; r: number; hh?: number }
export interface PrizeType { id: string; name: string; emoji: string; parts: Part[]; mass: number; colors: number[]; colorNames: string[] }
export const PRIZE_TYPES: PrizeType[] = [
  {
    id: 'bear', name: '小熊', emoji: '🧸', mass: 0.13, colors: [0x8b6a4f, 0xc9b394, 0x6b5546, 0xc99e96], colorNames: ['棕色', '奶茶色', '咖啡色', '豆沙粉'],
    parts: [
      { kind: 'ball', p: [0, 0, 0], r: 0.043 },
      { kind: 'ball', p: [0, 0.07, 0.004], r: 0.045 },
      { kind: 'ball', p: [-0.035, 0.107, 0], r: 0.015 },
      { kind: 'ball', p: [0.035, 0.107, 0], r: 0.015 },
      { kind: 'ball', p: [-0.044, 0.008, 0.016], r: 0.018 },
      { kind: 'ball', p: [0.044, 0.008, 0.016], r: 0.018 },
      { kind: 'ball', p: [-0.024, -0.038, 0.022], r: 0.019 },
      { kind: 'ball', p: [0.024, -0.038, 0.022], r: 0.019 },
    ],
  },
  {
    id: 'bunny', name: '兔子', emoji: '🐰', mass: 0.11, colors: [0xe8e3da, 0xaaa5a0, 0xd3bfae], colorNames: ['米白', '灰色', '浅咖'],
    parts: [
      { kind: 'ball', p: [0, 0, 0], r: 0.04 },
      { kind: 'ball', p: [0, 0.064, 0.004], r: 0.042 },
      { kind: 'capsule', p: [-0.017, 0.128, -0.004], r: 0.012, hh: 0.022 },
      { kind: 'capsule', p: [0.017, 0.128, -0.004], r: 0.012, hh: 0.022 },
      { kind: 'ball', p: [-0.022, -0.036, 0.02], r: 0.017 },
      { kind: 'ball', p: [0.022, -0.036, 0.02], r: 0.017 },
    ],
  },
  {
    id: 'chick', name: '小鸡', emoji: '🐥', mass: 0.085, colors: [0xdcb956, 0xe8d38e], colorNames: ['鹅黄', '浅黄'],
    parts: [
      { kind: 'ball', p: [0, 0, 0], r: 0.052 },
      { kind: 'ball', p: [-0.048, -0.004, 0], r: 0.016 },
      { kind: 'ball', p: [0.048, -0.004, 0], r: 0.016 },
    ],
  },
  {
    id: 'penguin', name: '企鹅', emoji: '🐧', mass: 0.12, colors: [0x2c313b, 0x46546a], colorNames: ['黑色', '藏青'],
    parts: [
      { kind: 'capsule', p: [0, 0.01, 0], r: 0.044, hh: 0.026 },
      { kind: 'ball', p: [-0.044, 0.005, 0], r: 0.014 },
      { kind: 'ball', p: [0.044, 0.005, 0], r: 0.014 },
    ],
  },
  {
    id: 'pig', name: '小猪', emoji: '🐷', mass: 0.11, colors: [0xdca69c, 0xcfb39b], colorNames: ['粉色', '肉桂'],
    parts: [
      { kind: 'ball', p: [0, 0, 0], r: 0.054 },
      { kind: 'ball', p: [-0.03, 0.045, -0.006], r: 0.014 },
      { kind: 'ball', p: [0.03, 0.045, -0.006], r: 0.014 },
      { kind: 'ball', p: [-0.026, -0.046, 0.016], r: 0.014 },
      { kind: 'ball', p: [0.026, -0.046, 0.016], r: 0.014 },
    ],
  },
];

export interface Prize { uid: number; type: PrizeType; color: number; colorName: string; scale: number; seed: number; body: RB; won: boolean; wonAt: number; squash: number; squashV: number; squashAxis: V3 }
export interface ContactPt { x: number; y: number; z: number; imp: number }

export type ClawState = 'idle' | 'play' | 'descend' | 'close' | 'lift' | 'hold' | 'return' | 'release' | 'reset';
export type GameEvent =
  | { type: 'state'; state: ClawState }
  | { type: 'win'; prize: Prize }
  | { type: 'spawn'; prize: Prize }
  | { type: 'remove'; prize: Prize }
  | { type: 'impact'; prize: Prize; strength: number }
  | { type: 'clank' }
  | { type: 'roundEnd'; won: number };

// ---- small math helpers ----
function quatFromUnitVectors(a: V3, b: V3): Q {
  let r = a.x * b.x + a.y * b.y + a.z * b.z + 1;
  let x: number, y: number, z: number;
  if (r < 1e-6) { r = 0; if (Math.abs(a.x) > Math.abs(a.z)) { x = -a.y; y = a.x; z = 0; } else { x = 0; y = -a.z; z = a.y; } }
  else { x = a.y * b.z - a.z * b.y; y = a.z * b.x - a.x * b.z; z = a.x * b.y - a.y * b.x; }
  const l = Math.hypot(x, y, z, r);
  return { x: x / l, y: y / l, z: z / l, w: r / l };
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export interface ProngSeg { a: V3; b: V3; r: number }
/** prong segment endpoints in the prong body's local frame for prong at azimuth `az` */
export function prongSegments(az: number): ProngSeg[] {
  const rx = Math.cos(az), rz = -Math.sin(az);
  const segs: ProngSeg[] = [];
  for (let i = 0; i < PRONG_PTS.length - 1; i++) {
    const [r0, y0] = PRONG_PTS[i], [r1, y1] = PRONG_PTS[i + 1];
    segs.push({ a: { x: rx * r0, y: y0, z: rz * r0 }, b: { x: rx * r1, y: y1, z: rz * r1 }, r: i === PRONG_PTS.length - 2 ? PRONG_RADIUS * 1.25 : PRONG_RADIUS });
  }
  return segs;
}
export const PRONG_AZ = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];

export class ClawGame {
  R: typeof RAPIER;
  world: RAPIER.World;
  hub!: RB;
  prongs: RB[] = [];
  prongColliders: RAPIER.Collider[] = [];
  colliderPrize = new Map<number, Prize>();
  joints: RAPIER.RevoluteImpulseJoint[] = [];
  prizes: Prize[] = [];
  listeners: ((e: GameEvent) => void)[] = [];
  // carriage
  cx = HOME.x; cz = HOME.z; vx = 0; vz = 0; L = L_MIN;
  swing = { x: 0, z: 0, vx: 0, vz: 0 };
  input = { x: 0, z: 0 };
  state: ClawState = 'idle';
  stateT = 0;
  time = 0;
  grip = 0.2; weak = 0.6; curForce = 0.2;
  roundWins = 0;
  descendTarget = 0;
  private uid = 1;
  private pendingSpawns: number[] = [];
  private lastVel = new Map<number, number>();
  rng: () => number;

  constructor(R: typeof RAPIER, rng: () => number = Math.random) {
    this.R = R;
    this.rng = rng;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 120;
    this.world.numSolverIterations = 8;
    this.buildStatic();
    this.buildClaw();
  }

  on(fn: (e: GameEvent) => void) { this.listeners.push(fn); }
  emit(e: GameEvent) { for (const l of this.listeners) l(e); }

  private fixed(desc: RAPIER.ColliderDesc, x: number, y: number, z: number, friction = 0.6) {
    desc.setTranslation(x, y, z).setFriction(friction).setCollisionGroups(groups(G_STATIC, G_PRIZE | G_CLAW));
    this.world.createCollider(desc);
  }

  private buildStatic() {
    const R = this.R; const { hx, hz, top } = CAB; const t = 0.02;
    // floor (with hole cut out at front-left)
    const H = HOLE;
    const backD = (H.z0 - -hz) / 2;
    this.fixed(R.ColliderDesc.cuboid(hx, 0.05, backD), 0, -0.05, -hz + backD, 0.9);
    const rw = (hx - H.x1) / 2;
    this.fixed(R.ColliderDesc.cuboid(rw, 0.05, (H.z1 - H.z0) / 2), H.x1 + rw, -0.05, (H.z0 + H.z1) / 2, 0.9);
    // walls + ceiling
    this.fixed(R.ColliderDesc.cuboid(t, 1, hz + t), -hx - t, top - 1, 0);
    this.fixed(R.ColliderDesc.cuboid(t, 1, hz + t), hx + t, top - 1, 0);
    this.fixed(R.ColliderDesc.cuboid(hx, 1, t), 0, top - 1, -hz - t);
    this.fixed(R.ColliderDesc.cuboid(hx, 0.6, t), 0, top - 0.6, hz + t);
    this.fixed(R.ColliderDesc.cuboid(hx, t, hz), 0, top + t, 0);
    // acrylic barrier around the drop hole
    const bh = 0.055, bt = 0.004;
    this.fixed(R.ColliderDesc.cuboid((H.x1 - H.x0) / 2, bh, bt), (H.x0 + H.x1) / 2, bh, H.z0 - bt, 0.3);
    this.fixed(R.ColliderDesc.cuboid(bt, bh, (H.z1 - H.z0) / 2), H.x1 + bt, bh, (H.z0 + H.z1) / 2, 0.3);
    // chute below the hole
    const cy = -0.36, ch = 0.38;
    this.fixed(R.ColliderDesc.cuboid(bt, ch, 0.2), H.x1 + bt, cy, 0.27);
    this.fixed(R.ColliderDesc.cuboid(0.16, ch, bt), (H.x0 + H.x1) / 2, cy, H.z0 - bt);
    this.fixed(R.ColliderDesc.cuboid(0.16, ch, bt), (H.x0 + H.x1) / 2, cy, 0.475);
    // sloped ramp toward the prize door + bin floor
    const ang = 0.5;
    const ramp = R.ColliderDesc.cuboid(0.16, 0.01, 0.2).setRotation({ x: Math.sin(ang / 2), y: 0, z: 0, w: Math.cos(ang / 2) });
    // ramp's lower (front) edge meets the bin floor so prizes slide all the way into the pickup window
    this.fixed(ramp, (H.x0 + H.x1) / 2, BIN_FLOOR_Y + 0.096 - 0.004, 0.32 - 0.176, 0.25);
    this.fixed(R.ColliderDesc.cuboid(0.16, 0.01, 0.13), (H.x0 + H.x1) / 2, BIN_FLOOR_Y - 0.01, 0.345, 0.5);
  }

  private buildClaw() {
    const R = this.R; const w = this.world;
    const hubPos = this.hubTarget().p;
    this.hub = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(hubPos.x, hubPos.y, hubPos.z));
    w.createCollider(R.ColliderDesc.cylinder(HUB_HH, HUB_R).setCollisionGroups(groups(G_CLAW, G_STATIC | G_PRIZE)).setFriction(0.6), this.hub);
    for (const az of PRONG_AZ) {
      const rx = Math.cos(az), rz = -Math.sin(az);
      const anchor = { x: rx * PIVOT_R, y: -HUB_HH, z: rz * PIVOT_R };
      const body = w.createRigidBody(R.RigidBodyDesc.dynamic()
        .setTranslation(hubPos.x + anchor.x, hubPos.y + anchor.y, hubPos.z + anchor.z)
        .setAngularDamping(0.5).setCanSleep(false).setCcdEnabled(true));
      for (const s of prongSegments(az)) {
        const d = { x: s.b.x - s.a.x, y: s.b.y - s.a.y, z: s.b.z - s.a.z };
        const len = Math.hypot(d.x, d.y, d.z);
        const dir = { x: d.x / len, y: d.y / len, z: d.z / len };
        const c = R.ColliderDesc.capsule(len / 2, s.r)
          .setTranslation((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2, (s.a.z + s.b.z) / 2)
          .setRotation(quatFromUnitVectors({ x: 0, y: 1, z: 0 }, dir))
          .setDensity(2600).setFriction(1.1)
          .setFrictionCombineRule(R.CoefficientCombineRule.Max)
          .setCollisionGroups(groups(G_CLAW, G_STATIC | G_PRIZE));
        this.prongColliders.push(w.createCollider(c, body));
      }
      const axis = { x: Math.sin(az), y: 0, z: Math.cos(az) };
      const jd = R.JointData.revolute(anchor, { x: 0, y: 0, z: 0 }, axis);
      jd.limitsEnabled = true; jd.limits = [ANG_CLOSED, 1.02];
      const j = w.createImpulseJoint(jd, this.hub, body, true) as RAPIER.RevoluteImpulseJoint;
      j.setContactsEnabled(false);
      j.configureMotorModel(R.MotorModel.ForceBased);
      this.prongs.push(body); this.joints.push(j);
    }
    this.setProngs(ANG_IDLE, 0.25);
  }

  setProngs(target: number, maxTorque: number) {
    this.curForce = maxTorque;
    for (const j of this.joints) {
      j.configureMotorPosition(target, 3.0, 0.06);
      j.setMotorMaxForce(maxTorque);
    }
  }

  /** hub pose from carriage + pendulum swing */
  hubTarget(): { p: V3; q: Q } {
    const Le = this.L + HUB_HH;
    const sx = Math.sin(this.swing.x), sz = Math.sin(this.swing.z);
    const dy = -Math.sqrt(Math.max(0, 1 - sx * sx - sz * sz));
    const dir = { x: sx, y: dy, z: sz };
    return {
      p: { x: this.cx + dir.x * Le, y: CARRIAGE_Y + dir.y * Le, z: this.cz + dir.z * Le },
      q: quatFromUnitVectors({ x: 0, y: -1, z: 0 }, dir),
    };
  }

  setState(s: ClawState) { this.state = s; this.stateT = 0; this.emit({ type: 'state', state: s }); }

  /** start a round (after coin) */
  startRound() {
    if (this.state !== 'idle') return false;
    const r = this.rng();
    if (r < 0.22) { this.grip = 0.34 + this.rng() * 0.08; this.weak = 0.9; }  // "strong claw" round
    else { this.grip = 0.15 + this.rng() * 0.1; this.weak = 0.45 + this.rng() * 0.35; }
    this.roundWins = 0;
    this.setState('play');
    return true;
  }

  drop() {
    if (this.state !== 'play') return;
    this.input.x = this.input.z = 0;
    this.setState('descend');
    this.setProngs(ANG_OPEN, 0.25);
  }

  /** world-space surface height below the hub (prizes/floor), excluding claw */
  probeSurface(): number {
    const R = this.R; const p = this.hub.translation();
    let best = 0;
    const offs = [[0, 0], [0.03, 0], [-0.03, 0], [0, 0.03], [0, -0.03]];
    for (const [ox, oz] of offs) {
      const ray = new R.Ray({ x: p.x + ox, y: p.y - HUB_HH - 0.002, z: p.z + oz }, { x: 0, y: -1, z: 0 });
      const hit = this.world.castRay(ray, 2, true, undefined, groups(0xffff, G_STATIC | G_PRIZE));
      if (hit) best = Math.max(best, ray.origin.y - hit.timeOfImpact);
    }
    return best;
  }

  private moveCarriageToward(tx: number, tz: number, vmax: number, acc: number, dt: number) {
    const dx = tx - this.cx, dz = tz - this.cz; const d = Math.hypot(dx, dz);
    let dvx = 0, dvz = 0;
    if (d > 1e-4) {
      const v = Math.min(vmax, Math.sqrt(2 * acc * d) * 0.9);
      dvx = (dx / d) * v; dvz = (dz / d) * v;
    }
    return this.accelTo(dvx, dvz, acc, dt);
  }

  private accelTo(tvx: number, tvz: number, acc: number, dt: number) {
    const ox = this.vx, oz = this.vz;
    const ex = tvx - this.vx, ez = tvz - this.vz; const e = Math.hypot(ex, ez); const m = acc * dt;
    if (e <= m) { this.vx = tvx; this.vz = tvz; } else { this.vx += (ex / e) * m; this.vz += (ez / e) * m; }
    return { ax: (this.vx - ox) / dt, az: (this.vz - oz) / dt };
  }

  private updateLogic(dt: number) {
    this.stateT += dt;
    let ax = 0, az = 0;
    switch (this.state) {
      case 'play': {
        const a = this.accelTo(this.input.x * 0.25, this.input.z * 0.25, 0.85, dt); ax = a.ax; az = a.az;
        break;
      }
      case 'descend': {
        const a = this.accelTo(0, 0, 2, dt); ax = a.ax; az = a.az;
        if (this.stateT > 0.35) {
          const surf = this.probeSurface();
          const pivotY = this.hub.translation().y - HUB_HH;
          const stopAt = Math.max(PIVOT_MIN_Y, surf + 0.012);
          if (pivotY <= stopAt || this.stateT > 4) { this.setState('close'); this.emit({ type: 'clank' }); }
          else this.L += Math.min(0.42 * dt, pivotY - stopAt + 0.0005);
        }
        break;
      }
      case 'close':
        if (this.stateT > 0.15 && this.curForce !== this.grip) this.setProngs(ANG_CLOSED, this.grip);
        if (this.stateT > 0.9) this.setState('lift');
        break;
      case 'lift':
        this.L = Math.max(L_MIN, this.L - 0.3 * dt);
        if (this.L <= L_MIN) { this.setState('hold'); this.emit({ type: 'clank' }); }
        break;
      case 'hold':
        if (this.stateT > 0.25 && this.curForce === this.grip) this.setProngs(ANG_CLOSED, this.grip * this.weak);
        if (this.stateT > 0.6) this.setState('return');
        break;
      case 'return': {
        const a = this.moveCarriageToward(HOME.x, HOME.z, 0.24, 0.9, dt); ax = a.ax; az = a.az;
        if (Math.hypot(HOME.x - this.cx, HOME.z - this.cz) < 0.002 && Math.hypot(this.vx, this.vz) < 0.01) {
          this.vx = this.vz = 0; this.setState('release'); this.setProngs(ANG_OPEN, 0.3); this.emit({ type: 'clank' });
        }
        break;
      }
      case 'release':
        if (this.stateT > 1.3) { this.setState('reset'); this.setProngs(ANG_IDLE, 0.25); }
        break;
      case 'reset':
        if (this.stateT > 0.6) { this.setState('idle'); this.emit({ type: 'roundEnd', won: this.roundWins }); }
        break;
    }
    // integrate carriage
    this.cx += this.vx * dt; this.cz += this.vz * dt;
    if (this.cx < LIMITS.x0) { this.cx = LIMITS.x0; this.vx = Math.max(0, this.vx); }
    if (this.cx > LIMITS.x1) { this.cx = LIMITS.x1; this.vx = Math.min(0, this.vx); }
    if (this.cz < LIMITS.z0) { this.cz = LIMITS.z0; this.vz = Math.max(0, this.vz); }
    if (this.cz > LIMITS.z1) { this.cz = LIMITS.z1; this.vz = Math.min(0, this.vz); }
    // pendulum swing (small-angle, damped)
    const Le = this.L + 0.08; const k = 9.81 / Le; const s = this.swing;
    s.vx += (-k * s.x - ax / Le - 1.6 * s.vx) * dt; s.vz += (-k * s.z - az / Le - 1.6 * s.vz) * dt;
    s.x = clamp(s.x + s.vx * dt, -0.35, 0.35); s.z = clamp(s.z + s.vz * dt, -0.35, 0.35);
  }

  spawnPrize(typeIdx?: number, pos?: V3, scale?: number): Prize {
    const R = this.R;
    const type = PRIZE_TYPES[typeIdx ?? Math.floor(this.rng() * PRIZE_TYPES.length)];
    const ci = Math.floor(this.rng() * type.colors.length);
    const color = type.colors[ci];
    const sc = scale ?? 0.95 + this.rng() * 0.3;
    let p = pos;
    if (!p) {
      for (let i = 0; i < 30; i++) {
        const x = -0.42 + this.rng() * 0.84, z = -0.32 + this.rng() * 0.64;
        if (x < -0.15 && z > 0.07) continue;
        p = { x, y: 0.75, z }; break;
      }
      p = p ?? { x: 0.2, y: 0.75, z: -0.1 };
    }
    const yaw = this.rng() * Math.PI * 2;
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setLinearDamping(0.35).setAngularDamping(1.2));
    let vol = 0;
    for (const part of type.parts) vol += part.kind === 'ball' ? (4 / 3) * Math.PI * (part.r * sc) ** 3 : Math.PI * (part.r * sc) ** 2 * (2 * (part.hh ?? 0) * sc + (4 / 3) * part.r * sc);
    const density = (type.mass * sc ** 3) / vol;
    const colliders: RAPIER.Collider[] = [];
    for (const part of type.parts) {
      const d = part.kind === 'ball' ? R.ColliderDesc.ball(part.r * sc) : R.ColliderDesc.capsule((part.hh ?? 0.02) * sc, part.r * sc);
      d.setTranslation(part.p[0] * sc, part.p[1] * sc, part.p[2] * sc).setDensity(density).setFriction(0.85).setRestitution(0.05)
        .setCollisionGroups(groups(G_PRIZE, 0xffff));
      colliders.push(this.world.createCollider(d, body));
    }
    const prize: Prize = { uid: this.uid++, type, color, colorName: type.colorNames[ci], scale: sc, seed: this.rng(), body, won: false, wonAt: 0, squash: 0, squashV: 0, squashAxis: { x: 0, y: 1, z: 0 } };
    for (const c of colliders) this.colliderPrize.set(c.handle, prize);
    this.prizes.push(prize);
    this.emit({ type: 'spawn', prize });
    return prize;
  }

  removePrize(p: Prize) {
    for (let i = 0; i < p.body.numColliders(); i++) this.colliderPrize.delete(p.body.collider(i).handle);
    this.world.removeRigidBody(p.body);
    this.prizes.splice(this.prizes.indexOf(p), 1);
    this.emit({ type: 'remove', prize: p });
  }

  /** fill the cabinet with a pile of plushies and let them settle */
  fill(n: number) {
    // drop toys in a few waves from random spots so they pile up naturally (uneven, leaning on walls)
    let k = 0;
    while (k < n) {
      for (let j = 0; j < 6 && k < n; j++, k++) {
        let x = 0, z = 0;
        for (let t = 0; t < 30; t++) { x = -0.43 + this.rng() * 0.86; z = -0.33 + this.rng() * 0.66; if (!(x < -0.14 && z > 0.06)) break; }
        // bias a bit toward the back/right like a machine that has been played a while
        x = x * 0.9 + 0.03; z = z * 0.9 - 0.03;
        this.spawnPrize(k % PRIZE_TYPES.length, { x, y: 0.12 + this.rng() * 0.25, z });
      }
      for (let i = 0; i < 90; i++) this.step(1 / 120);
    }
    for (let i = 0; i < 360; i++) this.step(1 / 120);
  }

  private checkPrizes() {
    for (const p of [...this.prizes]) {
      const t = p.body.translation();
      if (!p.won && t.y < -0.12 && t.x < HOLE.x1 + 0.02 && t.z > HOLE.z0 - 0.02) {
        p.won = true; p.wonAt = this.time; this.roundWins++;
        this.emit({ type: 'win', prize: p });
        this.pendingSpawns.push(this.time + 1.8);
        const binned = this.prizes.filter((q) => q.won).sort((a, b) => a.wonAt - b.wonAt);
        if (binned.length > 3) this.removePrize(binned[0]);
      } else if (t.y < -2 || Math.abs(t.x) > 1 || Math.abs(t.z) > 1 || t.y > 2) {
        this.removePrize(p); this.pendingSpawns.push(this.time + 0.5);
      }
      // soft-body feel: detect impacts (sudden velocity change)
      const v = p.body.linvel(); const sp = Math.hypot(v.x, v.y, v.z);
      const last = this.lastVel.get(p.uid) ?? sp; this.lastVel.set(p.uid, sp);
      const dv = last - sp;
      if (dv > 0.3) {
        p.squashV += Math.min(6, dv * 4);
        this.emit({ type: 'impact', prize: p, strength: dv });
      }
    }
    while (this.pendingSpawns.length && this.pendingSpawns[0] <= this.time) { this.pendingSpawns.shift(); this.spawnPrize(); }
  }

  /** contact points (world) between claw prongs and each prize, with impulse */
  gatherProngContacts(out: Map<Prize, ContactPt[]>) {
    out.clear();
    for (const c of this.prongColliders) {
      this.world.contactPairsWith(c, (o) => {
        const p = this.colliderPrize.get(o.handle); if (!p) return;
        this.world.contactPair(c, o, (m) => {
          let imp = 0; for (let i = 0; i < m.numContacts(); i++) imp += m.contactImpulse(i);
          const n = m.numSolverContacts();
          for (let i = 0; i < n; i++) {
            const pt = m.solverContactPoint(i); if (!pt) continue;
            let arr = out.get(p); if (!arr) { arr = []; out.set(p, arr); }
            arr.push({ x: pt.x, y: pt.y, z: pt.z, imp: imp / n });
          }
        });
      });
    }
  }

  step(dt: number) {
    this.time += dt;
    this.updateLogic(dt);
    const t = this.hubTarget();
    this.hub.setNextKinematicTranslation(t.p);
    this.hub.setNextKinematicRotation(t.q);
    this.world.step();
    this.checkPrizes();
  }
}
