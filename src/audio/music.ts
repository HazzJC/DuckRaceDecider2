import type { Mixer } from "./mixer";

export type MusicMode = "off" | "menu" | "race" | "results";

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** A chord as MIDI notes (root first). */
type Chord = number[];
interface Section {
  bpm: number;
  chords: Chord[]; // one per bar
  /** melody: [step (16ths within the 4-bar loop), midi note, length in 16ths] */
  melody: [number, number, number][];
}

// D minor heroics for the race, a cheeky F major bounce for the lobby, a triumphant Bb major for results.
const Dm = [62, 65, 69], Bb = [58, 62, 65], F = [65, 69, 72], C = [60, 64, 67], Gm = [55, 58, 62], A = [57, 61, 64];
const SECTIONS: Record<Exclude<MusicMode, "off">, Section> = {
  menu: {
    bpm: 104,
    chords: [F, Dm, Bb, C],
    // a bouncy little bassoon-and-glockenspiel tune, slightly silly on purpose
    melody: [
      [0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 4], [12, 69, 2], [14, 72, 2],
      [16, 74, 3], [19, 72, 1], [20, 69, 4], [28, 65, 2], [30, 67, 2],
      [32, 70, 2], [34, 69, 2], [36, 67, 2], [38, 65, 4], [44, 62, 2], [46, 65, 2],
      [48, 67, 3], [51, 69, 1], [52, 72, 6], [60, 76, 2], [62, 77, 2],
    ],
  },
  race: {
    bpm: 132,
    chords: [Dm, Bb, F, C],
    melody: [
      [0, 74, 3], [3, 76, 1], [4, 77, 4], [8, 76, 2], [10, 74, 2], [12, 72, 4],
      [16, 70, 3], [19, 72, 1], [20, 74, 6], [26, 72, 2], [28, 70, 4],
      [32, 69, 3], [35, 70, 1], [36, 72, 4], [40, 77, 4], [44, 76, 4],
      [48, 72, 3], [51, 74, 1], [52, 76, 8], [60, 73, 4],
    ],
  },
  results: {
    bpm: 96,
    chords: [Bb, F, Gm, F],
    melody: [
      [0, 70, 4], [4, 74, 4], [8, 77, 6], [14, 75, 2], [16, 74, 4], [20, 72, 4], [24, 69, 8],
      [32, 67, 4], [36, 70, 4], [40, 74, 6], [46, 72, 2], [48, 70, 4], [52, 69, 4], [56, 70, 8],
    ],
  },
};
// final stretch: lift the race theme a tone and lean on the dominant
const FINAL_CHORDS: Chord[] = [Gm, Dm, Bb, A];

type Layer = "strings" | "bass" | "drums" | "perc" | "ostinato" | "brass" | "choir" | "lead" | "bells";

/**
 * Procedural adaptive score. Look-ahead step sequencer; each layer (strings, bassoon/bass, taiko drums,
 * staccato ostinato, brass, choir, lead, bells) fades with the race "tension". Everything runs through a
 * generated hall reverb so it sits like a soundtrack rather than a chiptune.
 */
export class Music {
  private mode: MusicMode = "off";
  private tension = 0;
  private finalStretch = false;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private layers: Record<Layer, GainNode>;
  private dry: GainNode;
  private wet: GainNode;
  private stringFilter: BiquadFilterNode;

  constructor(private m: Mixer) {
    const ctx = m.ctx;
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.85;
    this.dry.connect(m.buses.music);
    const verb = ctx.createConvolver();
    verb.buffer = this.hallImpulse(2.8);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.38;
    verb.connect(this.wet).connect(m.buses.music);
    const send = ctx.createGain();
    send.connect(verb);
    this.stringFilter = ctx.createBiquadFilter();
    this.stringFilter.type = "lowpass";
    this.stringFilter.frequency.value = 2200;
    const mk = (reverb: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.dry);
      const s = ctx.createGain();
      s.gain.value = reverb;
      g.connect(s).connect(send);
      return g;
    };
    this.layers = {
      strings: mk(0.8), bass: mk(0.15), drums: mk(0.35), perc: mk(0.2), ostinato: mk(0.4),
      brass: mk(0.55), choir: mk(0.9), lead: mk(0.6), bells: mk(0.7),
    };
    this.stringFilter.connect(this.layers.strings);
  }

  /** Synthetic hall: stereo decaying noise with early reflections. */
  private hallImpulse(seconds: number): AudioBuffer {
    const ctx = this.m.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const k = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 3.2) * (i < ctx.sampleRate * 0.012 ? 0.2 : 1);
      }
      for (const ms of [17, 29, 41, 53]) d[Math.floor((ms / 1000) * ctx.sampleRate) + ch * 37] += 0.6;
    }
    return buf;
  }

  setMode(mode: MusicMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.finalStretch = false;
    if (mode === "off") {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      this.mix();
      return;
    }
    if (this.timer === null) {
      this.nextTime = this.m.ctx.currentTime + 0.1;
      this.step = 0;
      this.timer = window.setInterval(() => this.schedule(), 25);
    } else {
      this.step = 0;
    }
    this.mix();
  }

  setTension(t: number) {
    const v = Math.max(0, Math.min(1, t));
    if (Math.abs(v - this.tension) < 0.02) return;
    this.tension = v;
    this.mix();
  }

  setFinalStretch(on: boolean) {
    this.finalStretch = on;
    this.mix();
  }

  private mix() {
    const t = this.tension;
    const f = this.finalStretch ? 1 : 0;
    const now = this.m.ctx.currentTime;
    const zero: Record<Layer, number> = { strings: 0, bass: 0, drums: 0, perc: 0, ostinato: 0, brass: 0, choir: 0, lead: 0, bells: 0 };
    const target: Record<Layer, number> =
      this.mode === "race"
        ? {
            strings: 0.14,
            bass: 0.32,
            drums: 0.55,
            perc: 0.12 + t * 0.2 + f * 0.15,
            ostinato: 0.1 + t * 0.12,
            brass: t > 0.45 || f ? 0.14 + f * 0.06 : 0.03,
            choir: f ? 0.13 : t > 0.65 ? 0.07 : 0,
            lead: 0.11 + f * 0.04,
            bells: 0.04,
          }
        : this.mode === "menu"
          ? { strings: 0.08, bass: 0.26, drums: 0.12, perc: 0.08, ostinato: 0.1, brass: 0, choir: 0, lead: 0.05, bells: 0.13 }
          : this.mode === "results"
            ? { strings: 0.16, bass: 0.2, drums: 0.3, perc: 0.06, ostinato: 0.04, brass: 0.16, choir: 0.08, lead: 0.1, bells: 0.08 }
            : zero;
    for (const k of Object.keys(target) as Layer[]) this.layers[k].gain.setTargetAtTime(target[k], now, 0.6);
    this.stringFilter.frequency.setTargetAtTime(this.mode === "race" ? 1600 + t * 3200 : 2200, now, 0.8);
  }

  /** Victory fanfare one-shot: brass + timpani roll + cymbal. */
  fanfare() {
    const ctx = this.m.ctx;
    const t = ctx.currentTime + 0.05;
    const out = this.layers.brass;
    const notes: [number, number[], number][] = [
      [0, [62, 65, 70], 0.18], [0.2, [62, 65, 70], 0.18], [0.4, [65, 70, 74], 0.18], [0.62, [70, 74, 77, 82], 1.8],
    ];
    out.gain.setTargetAtTime(0.22, t, 0.05);
    for (const [at, chord, len] of notes) for (const n of chord) this.brass(midi(n), t + at, len, 0.08, out);
    for (let i = 0; i < 10; i++) this.taiko(t + i * 0.06, 0.4 + i * 0.05, 60);
    this.cymbal(t + 0.62, 0.35);
    window.setTimeout(() => this.mix(), 2600);
  }

  private schedule() {
    const ctx = this.m.ctx;
    if (this.mode === "off") return;
    const sec = SECTIONS[this.mode];
    const stepDur = 60 / sec.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, stepDur, sec);
      this.step = (this.step + 1) % 64;
      this.nextTime += stepDur;
    }
  }

  private playStep(step: number, t: number, sd: number, sec: Section) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const race = this.mode === "race";
    const chords = race && this.finalStretch ? FINAL_CHORDS : sec.chords;
    const chord = chords[bar % 4];
    const shift = race && this.finalStretch ? 2 : 0;

    // strings: sustained chord each bar, with a swell
    if (s === 0) for (const n of chord) this.strings(midi(n), t, sd * 16);
    if (s === 0 && (this.mode !== "menu")) this.strings(midi(chord[0] - 12), t, sd * 16, 0.6);

    // bass: driving 8ths in the race (bassoon-ish), bouncy root-fifth in the lobby
    if (race) {
      if (s % 2 === 0) this.bass(midi(chord[0] - 24 + (s % 8 === 6 ? 7 : 0)), t, sd * 1.7);
    } else if (this.mode === "menu") {
      if (s % 4 === 0) this.bass(midi(chord[0] - 12 + (s % 8 === 4 ? 7 : 0)), t, sd * 1.5, true);
    } else if (s % 8 === 0) this.bass(midi(chord[0] - 24), t, sd * 7);

    // drums: taiko groove in the race, light tom pattern otherwise
    if (race) {
      if (s === 0 || s === 6 || s === 10) this.taiko(t, 1, 52);
      if (s === 4 || s === 12) this.snare(t, 0.7);
      if (this.tension > 0.55 && (s === 14 || s === 15)) this.taiko(t, 0.5, 70);
      if (this.finalStretch && s % 2 === 1) this.taiko(t, 0.35, 90);
      if (s === 0 && bar === 0) this.cymbal(t, 0.12);
    } else if (this.mode === "menu") {
      if (s === 0 || s === 8) this.taiko(t, 0.5, 70);
      if (s === 4 || s === 12) this.snare(t, 0.35);
    } else {
      if (s === 0) this.taiko(t, 0.8, 55);
      if (s === 8) this.taiko(t, 0.5, 65);
    }
    // shaker / hats
    if (s % 2 === 1 || (race && this.tension > 0.6)) this.shaker(t, s % 4 === 2 ? 1 : 0.6);

    // staccato string ostinato (race) or pizzicato (lobby)
    const arp = [chord[0], chord[1], chord[2], chord[1] + 12, chord[2], chord[1], chord[0] + 12, chord[2]];
    if (race || s % 2 === 0) this.pizz(midi(arp[s % 8] + (race ? 0 : 12) + shift), t, sd * (race ? 0.9 : 1.6));

    // brass stabs on the off-beats when it gets tense
    if (race && (s === 0 || s === 3 || s === 6)) for (const n of chord) this.brass(midi(n + shift), t, sd * 1.3, 0.05, this.layers.brass);
    if (this.mode === "results" && s === 0) for (const n of chord) this.brass(midi(n), t, sd * 8, 0.05, this.layers.brass);

    // choir pad
    if (s === 0) for (const n of chord) this.choir(midi(n + 12), t, sd * 16);

    // melody (lead) doubled by bells an octave up
    for (const [at, note, len] of sec.melody) {
      if (at === step) {
        const n = note + shift;
        if (this.mode === "menu") this.bassoon(midi(n - 12), t, sd * len);
        else this.leadNote(midi(n), t, sd * len);
        this.bell(midi(n + 12), t);
      }
    }
  }

  /* ---------------- instruments ---------------- */

  private env(g: GainNode, t: number, a: number, peak: number, hold: number, r: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, hold));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, hold) + r);
  }

  private strings(freq: number, t: number, len: number, vol = 1) {
    const ctx = this.m.ctx;
    const g = ctx.createGain();
    this.env(g, t, 0.35, 0.05 * vol, len - 0.2, 0.6);
    const pan = ctx.createStereoPanner();
    g.connect(pan).connect(this.stringFilter);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = 6;
    vib.connect(vibAmt);
    for (const [det, p] of [[-12, -0.6], [-4, -0.2], [5, 0.2], [13, 0.6]] as const) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = det;
      vibAmt.connect(o.detune);
      const pp = ctx.createStereoPanner();
      pp.pan.value = p;
      o.connect(pp).connect(g);
      o.start(t);
      o.stop(t + len + 0.7);
    }
    vib.start(t);
    vib.stop(t + len + 0.7);
  }

  private choir(freq: number, t: number, len: number) {
    const ctx = this.m.ctx;
    const g = ctx.createGain();
    this.env(g, t, 0.6, 0.06, len - 0.3, 0.8);
    for (const det of [-8, 0, 9]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = det;
      // "aah" formants
      for (const [f, q, gain] of [[750, 8, 1], [1150, 10, 0.6], [2450, 12, 0.25]] as const) {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = f;
        bp.Q.value = q;
        const gg = ctx.createGain();
        gg.gain.value = gain;
        o.connect(bp).connect(gg).connect(g);
      }
      o.start(t);
      o.stop(t + len + 0.9);
    }
    g.connect(this.layers.choir);
  }

  private bass(freq: number, t: number, len: number, bouncy = false) {
    const ctx = this.m.ctx;
    const o = ctx.createOscillator();
    o.type = bouncy ? "square" : "sawtooth";
    o.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.frequency.value = freq / 2;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(bouncy ? 700 : 1100, t);
    lp.frequency.exponentialRampToValueAtTime(bouncy ? 250 : 180, t + len);
    lp.Q.value = bouncy ? 4 : 2;
    const g = ctx.createGain();
    this.env(g, t, 0.008, 0.45, len * 0.5, len * 0.5);
    const sg = ctx.createGain();
    sg.gain.value = 0.6;
    o.connect(lp).connect(g);
    sub.connect(sg).connect(g);
    g.connect(this.layers.bass);
    for (const x of [o, sub]) {
      x.start(t);
      x.stop(t + len + 0.1);
    }
  }

  /** Reedy, slightly comic bassoon for the lobby tune. */
  private bassoon(freq: number, t: number, len: number) {
    const ctx = this.m.ctx;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(freq * 0.98, t);
    o.frequency.linearRampToValueAtTime(freq, t + 0.04);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    this.env(g, t, 0.02, 0.32, len * 0.6, 0.12);
    o.connect(bp).connect(g).connect(this.layers.lead);
    o.start(t);
    o.stop(t + len + 0.2);
  }

  private taiko(t: number, vol: number, pitch: number) {
    const ctx = this.m.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(pitch * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(pitch, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(this.layers.drums);
    o.start(t);
    o.stop(t + 0.6);
    const n = ctx.createBufferSource();
    n.buffer = this.m.noise();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(lp).connect(ng).connect(this.layers.drums);
    n.start(t, Math.random(), 0.15);
  }

  private snare(t: number, vol: number) {
    const ctx = this.m.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.m.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(bp).connect(g).connect(this.layers.drums);
    n.start(t, Math.random(), 0.25);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.07);
    const og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.35, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og).connect(this.layers.drums);
    o.start(t);
    o.stop(t + 0.12);
  }

  private shaker(t: number, vol: number) {
    const ctx = this.m.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.m.noise();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(hp).connect(g).connect(this.layers.perc);
    n.start(t, Math.random(), 0.09);
  }

  private cymbal(t: number, vol: number) {
    const ctx = this.m.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.m.noise();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 4500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    n.connect(hp).connect(g).connect(this.layers.perc);
    n.start(t, Math.random(), 1.9);
  }

  private pizz(freq: number, t: number, len: number) {
    const ctx = this.m.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + len);
    const g = ctx.createGain();
    this.env(g, t, 0.004, 0.16, 0.01, Math.max(0.06, len));
    o.connect(lp).connect(g).connect(this.layers.ostinato);
    o.start(t);
    o.stop(t + len + 0.1);
  }

  private brass(freq: number, t: number, len: number, vol: number, out: AudioNode) {
    const ctx = this.m.ctx;
    const g = ctx.createGain();
    this.env(g, t, 0.04, vol, len * 0.75, 0.25);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(3400, t + 0.07);
    lp.frequency.exponentialRampToValueAtTime(1300, t + len);
    lp.Q.value = 1.5;
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(freq * 0.97, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.05); // lip bend
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.35);
    }
    lp.connect(g).connect(out);
  }

  private leadNote(freq: number, t: number, len: number) {
    const ctx = this.m.ctx;
    // horn-like lead: filtered saw + triangle with vibrato that blooms in
    const g = ctx.createGain();
    this.env(g, t, 0.05, 0.13, len * 0.85, 0.2);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const va = ctx.createGain();
    va.gain.setValueAtTime(0, t);
    va.gain.linearRampToValueAtTime(10, t + Math.min(0.4, len));
    vib.connect(va);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    for (const type of ["sawtooth", "triangle"] as OscillatorType[]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      va.connect(o.detune);
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.3);
    }
    vib.start(t);
    vib.stop(t + len + 0.3);
    lp.connect(g).connect(this.layers.lead);
  }

  private bell(freq: number, t: number) {
    const ctx = this.m.ctx;
    for (const [mul, vol, dec] of [[1, 0.12, 1.4], [2.76, 0.05, 0.6], [5.4, 0.025, 0.3]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(this.layers.bells);
      o.start(t);
      o.stop(t + dec + 0.05);
    }
  }
}
