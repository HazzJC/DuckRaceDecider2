import type { Mixer } from "./mixer";

/**
 * Synthesised sound effects. Keeps the original Sound API names (quack, ice, fire, pop, block, count, win)
 * and adds the new set-piece sounds.
 */
export class Sfx {
  constructor(private m: Mixer) {}

  private get ctx() {
    return this.m.ctx;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noiseSrc(t: number, dur: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.m.noise();
    s.start(t, Math.random(), dur + 0.05);
    return s;
  }

  /**
   * Synthesised duck quack, built like the real thing:
   *  - "qu": a short breathy noise burst and a fast upward pitch flick
   *  - "aa": a buzzy, nasal body (pulse + saw, amplitude-flutter at ~40 Hz for the rasp) through vowel
   *    formants plus the strong ~1.2 kHz nasal resonance that makes a duck sound like a duck
   *  - "ck": the pitch sags and the sound is cut off sharply, with a tiny click
   * `vowel` lets quack-speak colour each syllable (a/e/i/o/u) so captions sound like duck words.
   */
  quack(opts: { pitch?: number; dur?: number; vol?: number; bus?: "sfx" | "casters"; when?: number; bright?: number; vowel?: string; rasp?: number } = {}) {
    const ctx = this.ctx;
    const t = opts.when ?? ctx.currentTime;
    const p = opts.pitch ?? 1;
    const dur = Math.max(0.06, opts.dur ?? 0.17);
    const vol = opts.vol ?? 0.35;
    const bright = opts.bright ?? 1;
    const rasp = opts.rasp ?? 1;
    const end = t + dur;
    const f0 = (240 + Math.random() * 50) * p;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    out.gain.setValueAtTime(vol * 0.85, end - 0.035);
    out.gain.exponentialRampToValueAtTime(0.0001, end); // abrupt "-ck" stop
    out.connect(this.m.buses[opts.bus ?? "sfx"]);

    // rasp: amplitude flutter gives the reedy, buzzing quality
    const flutter = ctx.createGain();
    flutter.gain.value = 1 - 0.45 * rasp;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 34 + Math.random() * 14;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.45 * rasp;
    lfo.connect(lfoAmt).connect(flutter.gain);
    lfo.start(t);
    lfo.stop(end + 0.02);

    const voice = ctx.createGain();
    voice.connect(flutter);
    const pitchCurve = (o: OscillatorNode, mul: number) => {
      o.frequency.setValueAtTime(f0 * 0.85 * mul, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.25 * mul, t + 0.03);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.05 * mul, t + dur * 0.6);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.72 * mul, end);
    };
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    pitchCurve(saw, 1);
    const sq = ctx.createOscillator();
    sq.type = "square";
    pitchCurve(sq, 1.005);
    const sqG = ctx.createGain();
    sqG.gain.value = 0.6;
    saw.connect(voice);
    sq.connect(sqG).connect(voice);
    for (const o of [saw, sq]) {
      o.start(t);
      o.stop(end + 0.02);
    }

    // vowel formants (F1, F2) + the nasal duck resonance
    const V: Record<string, [number, number]> = { a: [850, 1350], e: [600, 1850], i: [420, 2150], o: [620, 1000], u: [460, 950], y: [480, 2000] };
    const [f1, f2] = V[opts.vowel ?? "a"] ?? V.a;
    const formants: [number, number, number][] = [
      [f1 * bright, 5, 1.0],
      [f2 * bright, 8, 0.75],
      [1250 * bright, 14, 1.3], // nasal honk resonance
      [2900, 6, 0.25],
    ];
    const pre = ctx.createBiquadFilter();
    pre.type = "highpass";
    pre.frequency.value = 280;
    flutter.connect(pre);
    for (const [f, q, gain] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f * (0.92 + p * 0.08);
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      pre.connect(bp).connect(g).connect(out);
    }

    // "qu" breath at the onset and a tiny "ck" click at the end
    const breath = this.noiseSrc(t, 0.05);
    const bf = ctx.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = 1800 * bright;
    bf.Q.value = 1.2;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(vol * 0.5, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    breath.connect(bf).connect(bg).connect(out);
    const click = this.noiseSrc(end - 0.012, 0.02);
    const cf = ctx.createBiquadFilter();
    cf.type = "highpass";
    cf.frequency.value = 3000;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(vol * 0.35, end - 0.012);
    cg.gain.exponentialRampToValueAtTime(0.0001, end + 0.01);
    click.connect(cf).connect(cg).connect(this.m.buses[opts.bus ?? "sfx"]);
  }

  tone(freq: number, type: OscillatorType, dur: number, vol = 0.1, when?: number) {
    const t = when ?? this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(this.m.buses.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  splash(vol = 0.25) {
    const t = this.ctx.currentTime;
    const s = this.noiseSrc(t, 0.5);
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.4);
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, vol, 0.4);
    s.connect(f).connect(g).connect(this.m.buses.sfx);
  }

  ice() {
    const t = this.ctx.currentTime;
    [2400, 3100, 3900].forEach((f, i) => this.tone(f, "sine", 0.35, 0.08, t + i * 0.03));
    const s = this.noiseSrc(t, 0.25);
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3500;
    const g = this.ctx.createGain();
    this.env(g, t, 0.002, 0.3, 0.22);
    s.connect(hp).connect(g).connect(this.m.buses.sfx);
  }

  fire() {
    const t = this.ctx.currentTime;
    const s = this.noiseSrc(t, 0.8);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(2500, t + 0.15);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.7);
    const g = this.ctx.createGain();
    this.env(g, t, 0.03, 0.45, 0.7);
    s.connect(lp).connect(g).connect(this.m.buses.sfx);
  }

  pop() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(400, t);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.08);
    this.env(g, t, 0.005, 0.25, 0.12);
    o.connect(g).connect(this.m.buses.sfx);
    o.start(t);
    o.stop(t + 0.2);
  }

  block() {
    const t = this.ctx.currentTime;
    [1318, 1976, 2637].forEach((f) => this.tone(f, "sine", 0.6, 0.07, t));
    this.tone(660, "triangle", 0.15, 0.12, t);
  }

  portal() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
    lfo.frequency.value = 30;
    lg.gain.value = 60;
    lfo.connect(lg).connect(o.frequency);
    this.env(g, t, 0.02, 0.2, 0.4);
    o.connect(g).connect(this.m.buses.sfx);
    o.start(t); lfo.start(t);
    o.stop(t + 0.5); lfo.stop(t + 0.5);
  }

  honk() {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) this.quack({ pitch: 0.38, dur: 0.55, vol: 0.6, when: t + i * 0.42, bright: 0.7 });
    const s = this.noiseSrc(t, 1.2);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 160;
    const g = this.ctx.createGain();
    this.env(g, t, 0.05, 0.6, 1.1);
    s.connect(lp).connect(g).connect(this.m.buses.sfx);
  }

  roar() {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(90, t);
    o.frequency.linearRampToValueAtTime(140, t + 0.4);
    o.frequency.linearRampToValueAtTime(70, t + 1.1);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const g = this.ctx.createGain();
    this.env(g, t, 0.08, 0.4, 1.0);
    o.connect(lp).connect(g).connect(this.m.buses.sfx);
    o.start(t);
    o.stop(t + 1.3);
    this.splash(0.5);
  }

  thunk() {
    this.tone(110, "sine", 0.25, 0.4);
    this.tone(55, "sine", 0.35, 0.3);
  }

  crowd(intensity = 1) {
    const t = this.ctx.currentTime;
    const s = this.noiseSrc(t, 2.2);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1100;
    bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * intensity, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    s.connect(bp).connect(g).connect(this.m.buses.sfx);
    // a few audience quacks on top
    for (let i = 0; i < 6 * intensity; i++) this.quack({ pitch: 0.9 + Math.random() * 0.8, vol: 0.08, dur: 0.12, when: t + Math.random() * 1.2 });
  }

  count(val: number) {
    if (val > 0) this.tone(523, "square", 0.12, 0.1);
    else {
      this.tone(1046, "square", 0.4, 0.1);
      this.quack({ pitch: 1.2, vol: 0.4, dur: 0.25 });
    }
  }

  win() {
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, "triangle", 0.45, 0.12, t + i * 0.12));
  }

  /** Announcer sting: rising whoosh + impact. */
  sting() {
    const t = this.ctx.currentTime;
    const s = this.noiseSrc(t, 0.5);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.3);
    const g = this.ctx.createGain();
    this.env(g, t, 0.25, 0.25, 0.1);
    s.connect(bp).connect(g).connect(this.m.buses.sfx);
    this.tone(98, "sine", 0.5, 0.4, t + 0.3);
  }
}
