export type Bus = "music" | "sfx" | "casters";

const STORE_KEY = "duck_racer_audio";

/** Master mix: three buses into a compressor. Music ducks under the casters. */
export class Mixer {
  readonly ctx: AudioContext;
  readonly buses: Record<Bus, GainNode>;
  private musicDuck: GainNode;
  private master: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  volumes: Record<Bus, number> = { music: 0.55, sfx: 0.8, casters: 0.9 };

  constructor() {
    this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    comp.connect(this.master).connect(this.ctx.destination);
    this.musicDuck = this.ctx.createGain();
    this.musicDuck.connect(comp);
    this.buses = {
      music: this.ctx.createGain(),
      sfx: this.ctx.createGain(),
      casters: this.ctx.createGain(),
    };
    this.buses.music.connect(this.musicDuck);
    this.buses.sfx.connect(comp);
    this.buses.casters.connect(comp);
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved?.volumes) this.volumes = { ...this.volumes, ...saved.volumes };
      if (typeof saved?.muted === "boolean") this.muted = saved.muted;
    } catch {
      /* storage unavailable: defaults are fine */
    }
    this.apply();
  }

  resume() {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private apply() {
    for (const b of Object.keys(this.buses) as Bus[]) {
      this.buses[b].gain.setTargetAtTime(this.muted ? 0 : this.volumes[b], this.ctx.currentTime, 0.05);
    }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ volumes: this.volumes, muted: this.muted }));
    } catch {
      /* ignore */
    }
  }

  setVolume(bus: Bus, v: number) {
    this.volumes[bus] = v;
    this.apply();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.apply();
    if (!m) this.resume();
  }

  /** Dip the music while someone is talking. */
  duck(talking: boolean) {
    this.musicDuck.gain.setTargetAtTime(talking ? 0.55 : 1, this.ctx.currentTime, talking ? 0.05 : 0.4);
  }

  noise(): AudioBuffer {
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }
}
