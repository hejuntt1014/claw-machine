// Synthesized, mechanical-sounding effects (WebAudio, no assets). No chiptune: coins clink, motors whine,
// solenoids clunk, the prize thuds into the chute and the machine plays a short two-tone chime.
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  muted = false;
  private motor: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filt: BiquadFilterNode; gear: GainNode } | null = null;
  private noiseBuf!: AudioBuffer;
  private amb: GainNode | null = null;

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = 0.8;
    const comp = c.createDynamicsCompressor(); this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = w; }
    // small DC motor: buzzy fundamental + commutator whine + gear chatter (noise AM)
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 95;
    const osc2 = c.createOscillator(); osc2.type = 'triangle'; osc2.frequency.value = 760;
    const filt = c.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 600; filt.Q.value = 0.8;
    const gain = c.createGain(); gain.gain.value = 0;
    const o2g = c.createGain(); o2g.gain.value = 0.25;
    osc.connect(filt); osc2.connect(o2g); o2g.connect(filt); filt.connect(gain); gain.connect(this.master);
    const gn = c.createBufferSource(); gn.buffer = this.noiseBuf; gn.loop = true;
    const gf = c.createBiquadFilter(); gf.type = 'bandpass'; gf.frequency.value = 2400; gf.Q.value = 2;
    const gear = c.createGain(); gear.gain.value = 0; gn.connect(gf); gf.connect(gear); gear.connect(this.master);
    osc.start(); osc2.start(); gn.start();
    this.motor = { osc, osc2, gain, filt, gear };
    // faint arcade/mall room tone (low rumble + distant chatter band), very quiet
    const an = c.createBufferSource(); an.buffer = this.noiseBuf; an.loop = true; an.playbackRate.value = 0.5;
    const af = c.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 420;
    this.amb = c.createGain(); this.amb.gain.value = 0.035; an.connect(af); af.connect(this.amb); this.amb.connect(this.master); an.start();
    void b;
  }
  setMuted(m: boolean) { this.muted = m; if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05); }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, when = 0, slide = 0, attack = 0.004) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  private noise(dur: number, vol: number, freq: number, q = 1, when = 0, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  /** motor level 0..1, pitch factor */
  motorLevel(level: number, pitch = 1) {
    if (!this.motor || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.motor.gain.gain.setTargetAtTime(level * 0.08, t, 0.06);
    this.motor.gear.gain.setTargetAtTime(level * 0.03, t, 0.06);
    this.motor.osc.frequency.setTargetAtTime(80 * pitch, t, 0.1);
    this.motor.osc2.frequency.setTargetAtTime(700 * pitch, t, 0.1);
    this.motor.filt.frequency.setTargetAtTime(450 + 400 * pitch, t, 0.1);
  }
  /** coin falling through the acceptor: a few metallic clinks + rattle */
  coin() {
    const partials = [2960, 4410, 6120];
    [0, 0.07, 0.115].forEach((w, i) => partials.forEach((p) => this.tone(p * (1 - i * 0.03), 0.18 - i * 0.04, 'sine', 0.05 - i * 0.012, w)));
    this.noise(0.09, 0.1, 5000, 3, 0.16);
    this.noise(0.06, 0.12, 900, 2, 0.24);
    this.chime(0.45, true);
  }
  /** plastic micro-switch click */
  click() { this.noise(0.025, 0.25, 3200, 4); this.tone(1800, 0.02, 'square', 0.03); }
  /** claw solenoid / prongs snapping shut */
  clank() { this.noise(0.05, 0.35, 1400, 2); this.tone(140, 0.09, 'triangle', 0.2, 0, -50); this.noise(0.12, 0.08, 4000, 6, 0.02); }
  thud(s: number) { this.noise(0.09, Math.min(0.22, 0.05 * s), 260, 1.2); }
  gantry(start: boolean) { this.noise(0.04, 0.08, start ? 1200 : 800, 3); }
  /** prize dropping down the chute and hitting the bin */
  chute() {
    this.noise(0.18, 0.12, 700, 1.5);
    this.noise(0.22, 0.4, 150, 1, 0.22, 'lowpass'); this.tone(85, 0.22, 'sine', 0.35, 0.22, -35);
    this.noise(0.1, 0.12, 400, 1, 0.42, 'lowpass');
  }
  /** the machine's own two-tone ding-dong (like real cranes' prize chime) */
  chime(when = 0, soft = false) {
    const v = soft ? 0.04 : 0.11;
    for (const [f, w] of [[1318.5, 0], [1046.5, 0.32]] as const) {
      this.tone(f, 1.1, 'sine', v, when + w, 0, 0.003);
      this.tone(f * 2.76, 0.4, 'sine', v * 0.25, when + w, 0, 0.002);
    }
  }
  win() { this.chime(0.05); this.chime(0.75); }
  tick() { this.tone(2000, 0.035, 'square', 0.04); }
  lose() { this.tone(330, 0.16, 'triangle', 0.06); this.tone(262, 0.3, 'triangle', 0.06, 0.18); }
}
export const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };
