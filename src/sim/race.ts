import { Rng } from "./rng";
import type { RaceEvent, TimedEvent } from "./events";
import type { CheerInput, Cosmetics, DuckState, Powerup, RaceConfig, Racer, Stats } from "./types";
import { HATS, PATTERNS } from "./types";
import { cleanupPowerups, collectPowerups, spawnPowerup } from "./powerups";
import { tickSpells } from "./spells";
import { createObjectives, objectiveSpeedMult, tickObjectivesGlobal, tickObjectivesRacer, type ObjectiveState } from "./objectives";

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** Short river + long races = slow, comical paddling (~4-5 duck lengths a second). */
export const TRACK_LENGTH = 240;
/** Ducks still swimming this long after the target duration are DNF. */
export const timeLimitExtra = (duration: number) => Math.max(12, duration * 0.45);
const LEAD_HOLD = 0.35;

export const CHAT_COLORS = ["#c084fc", "#4ade80", "#facc15", "#f472b6", "#22d3ee", "#fb923c", "#34d399", "#fb7185", "#e879f9"];

const emptyStats = (): Stats => ({
  spells: 0, frozenGiven: 0, igniteGiven: 0, frozenTaken: 0, igniteTaken: 0, blocks: 0,
  cheers: 0, powerups: 0, bread: 0, anchor: 0, shield: 0, portal: 0, objectives: 0,
});

/** Cosmetics come from their own seed so a rematch keeps everyone's look but re-rolls the race. */
export function rollCosmetics(names: string[], cosmeticSeed: number): Cosmetics[] {
  const rng = new Rng(cosmeticSeed);
  const hueStart = rng.range(0, 360);
  return names.map((_, i) => ({
    // spread hues around the wheel so ducks are easy to tell apart, with some jitter
    hue: (hueStart + (i * 360) / names.length + rng.range(-12, 12) + 360) % 360,
    hat: rng.pick(HATS),
    pattern: rng.pick(PATTERNS),
    chatColor: rng.pick(CHAT_COLORS),
  }));
}

export class Race {
  readonly config: RaceConfig;
  readonly rng: Rng;
  readonly length = TRACK_LENGTH;
  readonly inputs: CheerInput[];
  racers: Racer[];
  powerups: Powerup[] = [];
  nextPowerupId = 0;
  objectives: ObjectiveState;

  tick = 0;
  time = 0;
  done = false;
  events: TimedEvent[] = [];
  finishOrder: Racer[] = [];

  private drained = 0;
  private powerupTimer = 0.8;
  private leaderId = -1;
  private leaderCandidate = -1;
  private leaderHold = 0;
  private wasLast = new Set<number>();
  private comebackDone = new Set<number>();
  private finalStretch = false;
  private ranking: Racer[] = [];

  constructor(config: RaceConfig, inputs: CheerInput[] = []) {
    this.config = config;
    this.inputs = inputs.map((i) => ({ ...i }));
    this.rng = new Rng(config.seed);
    const looks = rollCosmetics(config.names, config.cosmeticSeed);
    this.racers = config.names.map((name, i) => ({
      id: i,
      name,
      lane: i,
      cosmetics: looks[i],
      x: 0,
      prevX: 0,
      speed: 0,
      skill: 0.9 + this.rng.next() * 0.22,
      state: "normal",
      stateTimer: 0,
      shield: false,
      cheered: false,
      spellCD: this.rng.range(2.5, 6),
      finished: false,
      finishTime: -1,
      place: 0,
      element: null,
      baron: false,
      oceanRegen: false,
      cloudDodge: false,
      jungle: 0,
      stats: emptyStats(),
    }));
    this.ranking = [...this.racers];
    this.objectives = createObjectives(this);
    this.emit({ type: "START" });
  }

  emit(e: RaceEvent): void {
    this.events.push({ ...e, tick: this.tick, t: this.time });
  }

  /** New events since the last drain (for live consumers like casters and audio). */
  drain(): TimedEvent[] {
    const out = this.events.slice(this.drained);
    this.drained = this.events.length;
    return out;
  }

  setState(r: Racer, state: DuckState, duration: number): void {
    // a freeze can't be cancelled by a weaker effect
    if (r.state === "frozen" && state !== "frozen" && r.stateTimer > 0) return;
    const keep = state === r.state ? r.stateTimer : 0;
    r.state = state;
    r.stateTimer = Math.max(keep, duration);
  }

  /** Live cheer from the UI. Recorded as an input so replays reproduce it. Returns false if not allowed. */
  cheer(racerId: number): boolean {
    const r = this.racers[racerId];
    if (!r || r.finished || r.cheered || this.done) return false;
    if (this.inputs.some((i) => i.racer === racerId)) return false;
    this.inputs.push({ tick: this.tick, racer: racerId });
    return true;
  }

  leaderByDistance(): Racer {
    return this.ranking[0];
  }

  /** 0 = leading. Finished ducks rank by place, then everyone else by distance. */
  rankOf(id: number): number {
    return this.ranking.findIndex((r) => r.id === id);
  }

  get standings(): Racer[] {
    return this.ranking;
  }

  private updateRanking(): void {
    this.ranking = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.place - b.place;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.x - a.x;
    });
  }

  step(): void {
    if (this.done) return;
    const dt = DT;
    const { mode, duration } = this.config;

    for (const inp of this.inputs) {
      if (inp.tick !== this.tick) continue;
      const r = this.racers[inp.racer];
      if (!r || r.finished || r.cheered) continue;
      r.cheered = true;
      r.stats.cheers++;
      this.setState(r, "boost", 0.8);
      this.emit({ type: "CHEER", racer: r.id });
    }

    if (mode === "aram") {
      this.powerupTimer -= dt;
      if (this.powerupTimer <= 0) {
        this.powerupTimer = this.rng.range(2.2, 3.2);
        spawnPowerup(this);
      }
    }

    tickObjectivesGlobal(this, dt);

    const baseSpeed = this.length / duration;
    for (const r of this.racers) {
      r.prevX = r.x;
      if (r.finished) continue;

      if (r.stateTimer > 0) r.stateTimer -= dt;
      if (r.stateTimer <= 0 && r.state !== "normal") r.state = "normal";

      if (mode === "aram") tickSpells(this, r, dt);

      let speed = baseSpeed * r.skill;
      // Blind Pick rubberband: late-race catch-up for ducks far behind
      if (mode === "blind" && this.time > duration * 0.8 && r.x < this.length * 0.72) speed *= 1.25;
      if (r.state === "frozen") speed = 0;
      if (r.state === "ignite") speed *= 0.45;
      if (r.state === "boost") speed *= 1.75;
      if (r.state === "stumble") speed *= 0.35;
      speed *= objectiveSpeedMult(this, r);

      if (r.state === "normal" && this.rng.chance(0.01)) {
        if (this.rng.chance(0.55)) {
          this.setState(r, "boost", 0.55);
          this.emit({ type: "SURGE", racer: r.id });
        } else {
          this.setState(r, "stumble", 0.45);
        }
      }

      r.speed = speed;
      r.x += speed * dt;

      if (mode === "aram") collectPowerups(this, r);
      tickObjectivesRacer(this, r, dt);

      if (r.x >= this.length) {
        const over = r.x - this.length;
        r.x = this.length;
        r.finished = true;
        r.finishTime = this.time + dt - (speed > 0 ? over / speed : 0);
        r.state = "normal";
        r.stateTimer = 0;
        r.jungle = 0;
      }
    }

    // Place finishers in true finish-time order even when several cross in one tick
    const newlyFinished = this.racers
      .filter((r) => r.finished && r.place === 0)
      .sort((a, b) => a.finishTime - b.finishTime);
    for (const r of newlyFinished) {
      this.finishOrder.push(r);
      r.place = this.finishOrder.length;
      this.emit({ type: "FINISH", racer: r.id, place: r.place, time: r.finishTime });
      if (r.place === 2) {
        const first = this.finishOrder[0];
        const margin = r.finishTime - first.finishTime;
        if (margin < 0.2) this.emit({ type: "CLOSE_FINISH", a: first.id, b: r.id, margin });
      }
    }

    if (mode === "aram") cleanupPowerups(this);

    this.updateRanking();
    this.trackStorylines(dt);

    this.tick++;
    this.time += dt;

    const allDone = this.racers.every((r) => r.finished);
    if (allDone || this.time > duration + timeLimitExtra(duration)) this.finish();
  }

  private trackStorylines(dt: number): void {
    const { duration } = this.config;
    const leader = this.ranking[0];

    if (leader.id !== this.leaderCandidate) {
      this.leaderCandidate = leader.id;
      this.leaderHold = 0;
    } else {
      this.leaderHold += dt;
    }
    if (this.leaderHold >= LEAD_HOLD && this.leaderCandidate !== this.leaderId) {
      const prev = this.leaderId;
      this.leaderId = this.leaderCandidate;
      if (prev !== -1 && !leader.finished) this.emit({ type: "LEAD_CHANGE", leader: leader.id, prev });
    }

    if (!this.finalStretch && leader.x >= this.length * 0.85) {
      this.finalStretch = true;
      this.emit({ type: "FINAL_STRETCH", leader: leader.id });
    }

    const n = this.racers.length;
    if (n >= 3) {
      const last = this.ranking[n - 1];
      if (this.time >= duration * 0.3 && !last.finished) this.wasLast.add(last.id);
      if (this.time >= duration * 0.5) {
        for (let i = 0; i < 2; i++) {
          const r = this.ranking[i];
          if (this.wasLast.has(r.id) && !this.comebackDone.has(r.id)) {
            this.comebackDone.add(r.id);
            this.emit({ type: "COMEBACK", racer: r.id });
          }
        }
      }
    }
  }

  private finish(): void {
    // anyone still swimming is DNF, ordered by distance
    const stragglers = this.racers.filter((r) => !r.finished).sort((a, b) => b.x - a.x);
    for (const r of stragglers) {
      this.finishOrder.push(r);
      r.place = this.finishOrder.length;
    }
    this.updateRanking();
    this.done = true;
    this.emit({ type: "RACE_END" });
  }

  /** Simulate instantly to the end (used by Skip and by tests). */
  runToEnd(): void {
    const maxTicks = (this.config.duration + timeLimitExtra(this.config.duration) + 1) * TICK_RATE;
    while (!this.done && this.tick < maxTicks) this.step();
  }
}

export const winnerTime = (r: Racer): number | null => (r.finishTime >= 0 ? r.finishTime : null);
