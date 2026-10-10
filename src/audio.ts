// Synthesized sound effects + tiny chiptune BGM (WebAudio, no assets)
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  muted = false;
  private motor: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filt: BiquadFilterNode } | null = null;
  private bgmTimer: number | null = null;
  private bgmGain!: GainNode;
  private noiseBuf!: AudioBuffer;

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.7;
    const comp = this.ctx.createDynamicsCompressor(); this.master.connect(comp); comp.connect(this.ctx.destination);
    this.bgmGain = this.ctx.createGain(); this.bgmGain.gain.value = 0.11; this.bgmGain.connect(this.master);
    const len = this.ctx.sampleRate * 0.5; this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // motor hum (always running, gain controlled)
    const osc = this.ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 70;
    const osc2 = this.ctx.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 141;
    const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500;
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    osc.connect(filt); osc2.connect(filt); filt.connect(gain); gain.connect(this.master); osc.start(); osc2.start();
    this.motor = { osc, osc2, gain, filt };
  }
  setMuted(m: boolean) { this.muted = m; if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05); }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.2, when = 0, slide = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  private noise(dur: number, vol: number, freq: number, q = 1, when = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  }
  /** motor level 0..1, pitch factor */
  motorLevel(level: number, pitch = 1) {
    if (!this.motor || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.motor.gain.gain.setTargetAtTime(level * 0.09, t, 0.05);
    this.motor.osc.frequency.setTargetAtTime(60 * pitch, t, 0.08);
    this.motor.osc2.frequency.setTargetAtTime(121 * pitch, t, 0.08);
    this.motor.filt.frequency.setTargetAtTime(350 + 500 * pitch, t, 0.08);
  }
  coin() { this.tone(988, 0.08, 'square', 0.15); this.tone(1319, 0.3, 'square', 0.15, 0.08); this.noise(0.15, 0.1, 6000, 2); }
  click() { this.tone(660, 0.05, 'triangle', 0.15); }
  clank() { this.noise(0.12, 0.35, 2500, 3); this.tone(180, 0.1, 'triangle', 0.2); }
  thud(s: number) { this.noise(0.08, Math.min(0.25, 0.06 * s), 300, 1); }
  gantry(start: boolean) { this.noise(0.06, 0.12, start ? 900 : 600, 2); this.tone(start ? 110 : 90, 0.07, 'triangle', 0.12); }
  chute() { this.noise(0.25, 0.3, 220, 0.8); this.tone(70, 0.25, 'sine', 0.35, 0, -30); }
  confetti() {
    for (let i = 0; i < 2; i++) { this.noise(0.18, 0.4, 1800, 0.7, i * 0.12); this.tone(240, 0.12, 'sine', 0.2, i * 0.12, -150); }
    for (let i = 0; i < 10; i++) this.tone(1800 + Math.random() * 1800, 0.12, 'sine', 0.05, 0.25 + i * 0.07);
  }
  tick() { this.tone(1200, 0.04, 'square', 0.08); }
  win() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((n, i) => this.tone(n, 0.22, 'square', 0.14, i * 0.1));
    notes.forEach((n, i) => this.tone(n / 2, 0.22, 'triangle', 0.12, i * 0.1));
    this.noise(0.8, 0.08, 8000, 0.5, 0.7);
  }
  lose() { [392, 349, 311, 262].forEach((n, i) => this.tone(n, 0.25, 'triangle', 0.15, i * 0.16)); }
  startBgm() {
    if (!this.ctx || this.bgmTimer !== null) return;
    const mel = [76, 79, 84, 79, 81, 79, 76, 74, 72, 76, 79, 76, 74, 72, 74, 76, 77, 81, 84, 81, 79, 77, 76, 74, 72, 74, 76, 79, 76, 74, 72, 0];
    const bass = [48, 48, 55, 55, 53, 53, 55, 55];
    let step = 0; const spb = 0.2; let next = this.ctx.currentTime + 0.1;
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const sched = () => {
      const c = this.ctx!;
      while (next < c.currentTime + 0.4) {
        const n = mel[step % mel.length];
        if (n) this.bgmNote(midi(n), spb * 0.9, 'square', 0.5, next);
        if (step % 4 === 0) this.bgmNote(midi(bass[(step / 4) % bass.length]), spb * 3.5, 'triangle', 0.9, next);
        step++; next += spb;
      }
    };
    this.bgmTimer = window.setInterval(sched, 100);
  }
  private bgmNote(f: number, dur: number, type: OscillatorType, vol: number, t: number) {
    const c = this.ctx!; const o = c.createOscillator(); o.type = type; o.frequency.value = f;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.bgmGain); o.start(t); o.stop(t + dur + 0.02);
  }
}
export const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };
