import type { Race } from "../sim/race";
import type { TimedEvent } from "../sim/events";
import { CASTER_LINES, ELEMENT_NAMES, POWERUP_NAMES } from "./lines";
import { CASTERS, type Booth } from "./booth";
import type { QuackSpeak, Spoken } from "./quackspeak";
import type { Mixer } from "../audio/mixer";

export interface CaptionUI {
  show(caster: number, name: string, role: string, color: string, text: string, excited: boolean): void;
  reveal(chars: number): void;
  hide(): void;
}

interface Utterance {
  caster: 0 | 1;
  text: string;
  priority: number;
  excitement: number;
  expires: number;
}

type Key = keyof typeof CASTER_LINES;

const now = () => performance.now() / 1000;

/** Event-driven two-caster commentary with priorities, interrupts, pairing and filler. */
export class Commentary {
  enabled = true;
  /** false = captions only, no quack voice */
  voice = true;
  private queue: Utterance[] = [];
  private current: { u: Utterance; spoken: Spoken; start: number } | null = null;
  private lastSpoke = 0;
  private hideAt = 0;
  private used = new Map<string, Set<string>>();
  private racing = false;

  constructor(private speech: QuackSpeak, private booth: Booth, private ui: CaptionUI, private mixer: Mixer) {}

  reset() {
    this.queue = [];
    this.current = null;
    this.ui.hide();
    this.racing = false;
  }

  private pick(key: Key, caster: 0 | 1, vars: Record<string, string>): string | null {
    const pool = CASTER_LINES[key]?.[caster];
    if (!pool || !pool.length) return null;
    const id = `${key}:${caster}`;
    let used = this.used.get(id);
    if (!used || used.size >= pool.length) {
      used = new Set();
      this.used.set(id, used);
    }
    const fresh = pool.filter((l) => !used!.has(l));
    const line = fresh[Math.floor(Math.random() * fresh.length)];
    used.add(line);
    return line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  }

  private say(key: Key, caster: 0 | 1, priority: number, excitement: number, vars: Record<string, string> = {}, ttl = 3) {
    const text = this.pick(key, caster, vars);
    if (!text) return;
    const u: Utterance = { caster, text, priority, excitement, expires: now() + ttl };
    // big plays interrupt smaller ones mid-sentence
    if (this.current && priority >= this.current.u.priority + 3) {
      this.current = null;
      this.queue = this.queue.filter((q) => q.priority >= priority);
      this.queue.unshift(u);
      return;
    }
    this.queue.push(u);
    this.queue.sort((a, b) => b.priority - a.priority);
    if (this.queue.length > 4) this.queue.length = 4;
  }

  /** Hype call from Drake, sometimes an analyst follow-up from Mallard. */
  private call(key: Key, priority: number, excitement: number, vars: Record<string, string>, followChance = 0.5) {
    this.say(key, 0, priority, excitement, vars);
    if (Math.random() < followChance) this.say(key, 1, priority - 1, 0.2, vars, 6);
  }

  intro() {
    this.say("INTRO", 0, 5, 0.8, {}, 8);
    this.say("INTRO2", 1, 4, 0.2, {}, 10);
  }

  outro() {
    this.say("OUTRO", 0, 6, 0.7, {}, 8);
    this.say("OUTRO2", 1, 5, 0.2, {}, 10);
  }

  setRacing(r: boolean) {
    this.racing = r;
  }

  onEvent(e: TimedEvent, race: Race) {
    if (!this.enabled) return;
    const nm = (id: number) => race.racers[id]?.name ?? "someone";
    const late = race.time > race.config.duration * 0.7;
    const busy = this.current !== null || this.queue.length > 0;
    const recent = now() - this.lastSpoke < 1.4;
    switch (e.type) {
      case "START":
        this.call("START", 7, 1, {}, 0);
        break;
      case "LEAD_CHANGE":
        if (late) this.call("LEAD_LATE", 7, 1, { name: nm(e.leader), prev: nm(e.prev) }, 0.4);
        else if (!busy) this.call("LEAD_CHANGE", 4, 0.7, { name: nm(e.leader), prev: nm(e.prev) }, 0.35);
        break;
      case "SPELL_HIT": {
        const leaderHit = race.rankOf(e.target) === 0;
        if (busy && !leaderHit) break;
        this.call(e.spell === "ice" ? "ICE" : "IGNITE", leaderHit ? 6 : 4, leaderHit ? 1 : 0.8, { target: nm(e.target), caster: nm(e.caster) }, 0.35);
        break;
      }
      case "BLOCK":
        if (!busy) this.call("BLOCK", 4, 0.8, { target: nm(e.target), caster: nm(e.caster) }, 0.3);
        break;
      case "SPELL_DODGE":
        if (!busy) this.call("SPELL_DODGE", 4, 0.8, { target: nm(e.target) }, 0.3);
        break;
      case "POWERUP":
        if (!busy && !recent && (e.kind === "portal" || e.kind === "anchor" || Math.random() < 0.3))
          this.call("POWERUP", 2, 0.5, { name: nm(e.racer), stat: POWERUP_NAMES[e.kind] }, 0.25);
        break;
      case "CHEER":
        if (!busy) this.call("CHEER", 2, 0.6, { name: nm(e.racer) }, 0.2);
        break;
      case "FIRST_BLOOD":
        this.call("FIRST_BLOOD", 6, 0.9, { name: nm(e.racer) }, 0.4);
        break;
      case "TURRET_HIT":
        if (!busy && !recent && Math.random() < 0.5) this.call("TURRET_HIT", 2, 0.5, { name: nm(e.racer) }, 0.3);
        break;
      case "DRAGON_SPAWN":
        this.call("DRAGON_SPAWN", 5, 0.8, {}, 0.5);
        break;
      case "DRAGON_TAKEN":
        this.call(e.steal ? "DRAGON_STEAL" : "DRAGON_TAKEN", e.steal ? 8 : 6, e.steal ? 1 : 0.9, { name: nm(e.racer), element: ELEMENT_NAMES[e.element] }, 0.6);
        break;
      case "OBJECTIVE_FIGHT":
        if (race.objectives[e.objective].fighters.length === 1) this.call(e.objective === "dragon" ? "OBJECTIVE_FIGHT" : "BARON_FIGHT", 6, 0.9, { name: nm(e.racer) }, 0.5);
        break;
      case "DRAGON_BREATH":
        if (!busy) this.call("DRAGON_BREATH", 4, 0.8, { name: nm(e.racer), target: nm(e.target) }, 0.3);
        break;
      case "BARON_SPAWN":
        this.call("BARON_SPAWN", 6, 0.9, {}, 0.5);
        break;
      case "BARON_HONK":
        this.call("BARON_HONK", 7, 1, {}, 0.4);
        break;
      case "BARON_TAKEN":
        this.call(e.steal ? "BARON_STEAL" : "BARON_TAKEN", e.steal ? 8 : 5, e.steal ? 1 : 0.7, { name: nm(e.racer) }, 0.6);
        break;
      case "SHORTCUT_ENTER":
        this.call("SHORTCUT_ENTER", 5, 0.8, { name: nm(e.racer) }, 0.7);
        break;
      case "SHORTCUT_RESULT":
        this.call(e.success ? "SHORTCUT_GOOD" : "SHORTCUT_BAD", 5, 0.9, { name: nm(e.racer) }, 0.6);
        break;
      case "COMEBACK":
        this.call("COMEBACK", 7, 1, { name: nm(e.racer) }, 0.5);
        break;
      case "FINAL_STRETCH":
        this.call("FINAL_STRETCH", 6, 0.9, { name: nm(e.leader) }, 0.2);
        break;
      case "CLOSE_FINISH":
        this.call("CLOSE_FINISH", 10, 1, { margin: e.margin.toFixed(2) }, 0.9);
        break;
      case "FINISH":
        if (e.place === 1) this.call("FINISH", 9, 1, { name: nm(e.racer) }, 0.8);
        break;
    }
  }

  private filler(race: Race) {
    if (Math.random() < 0.45) {
      const notable = race.racers
        .map((r) => {
          const s = r.stats;
          const options: string[] = [];
          if (s.bread >= 2) options.push(`eaten ${s.bread} bread`);
          if (s.spells >= 2) options.push(`cast ${s.spells} spells`);
          if (s.frozenTaken + s.igniteTaken >= 2) options.push(`been hit ${s.frozenTaken + s.igniteTaken} times`);
          if (s.blocks >= 1) options.push(`blocked ${s.blocks} ${s.blocks === 1 ? "spell" : "spells"}`);
          if (r.element) options.push(`the ${ELEMENT_NAMES[r.element]} soul`);
          return { r, options };
        })
        .filter((x) => x.options.length);
      if (notable.length) {
        const pickR = notable[Math.floor(Math.random() * notable.length)];
        const stat = pickR.options[Math.floor(Math.random() * pickR.options.length)];
        this.say("FILLER_STAT", 1, 1, 0.2, { name: pickR.r.name, stat }, 3);
        return;
      }
    }
    this.say("FILLER", Math.random() < 0.6 ? 0 : 1, 1, 0.5, {}, 3);
  }

  update(dt: number, race: Race | null) {
    const t = now();
    if (this.current) {
      const elapsed = t - this.current.start;
      const sp = this.current.spoken;
      let mouth = 0;
      let chars = 0;
      for (const s of sp.syllables) {
        if (elapsed >= s.start) chars = s.charEnd;
        if (elapsed >= s.start && elapsed <= s.end) mouth = Math.sin(((elapsed - s.start) / (s.end - s.start)) * Math.PI);
      }
      this.ui.reveal(chars);
      this.booth.setMouth(this.current.u.caster, mouth);
      if (elapsed >= sp.duration) {
        this.booth.setMouth(this.current.u.caster, 0);
        this.ui.reveal(this.current.u.text.length);
        this.current = null;
        this.lastSpoke = t;
        this.hideAt = t + 1.4;
        this.mixer.duck(false);
      }
    }
    if (!this.current) {
      this.queue = this.queue.filter((q) => q.expires > t);
      const next = this.queue.shift();
      if (next) {
        const voice = CASTERS[next.caster];
        const spoken = this.speech.say(next.text, voice, next.excitement, !this.voice);
        this.current = { u: next, spoken, start: t };
        const c = CASTERS[next.caster];
        this.ui.show(next.caster, c.name, c.role, c.color, next.text, next.excitement > 0.75);
        if (next.excitement > 0.75) this.booth.setHype(next.caster, 1);
        this.mixer.duck(true);
      } else if (t > this.hideAt) {
        this.ui.hide();
      }
      if (!next && this.racing && race && !race.done && t - this.lastSpoke > 3.8) this.filler(race);
    }
    this.booth.update(dt);
  }
}
