import type { Race } from "./race";
import type { Element, Racer } from "./types";

const ELEMENTS: Element[] = ["infernal", "ocean", "cloud", "mountain"];
export const TURRET_FRACS = [0.25, 0.5, 0.75];
const TURRET_PULSE = 0.45;
const DRAGON_FRAC = 0.4;
const BARON_FRAC = 0.66;
const SHORTCUT = { start: 0.52, end: 0.62 };
/** how long a duck must brawl an objective before it falls */
export const DRAGON_FIGHT = 2.2;
export const BARON_FIGHT = 2.8;
/** how long the drake flies with its new owner, torching ducks ahead */
export const DRAGON_ESCORT = 9;
const BARON_HONK_EVERY = 4.5;
const REACH = 2.2; // how close (in x) a duck must get to start brawling

export interface Turret {
  x: number;
  phase: number;
  period: number;
}

type ObjState = "hidden" | "rising" | "up" | "fighting" | "taken" | "gone";

export interface ObjectiveState {
  enabled: boolean;
  turrets: Turret[];
  firstBlood: number | null;
  dragon: {
    state: ObjState;
    lane: number;
    x: number;
    /** ducks currently brawling, first arrival first */
    fighters: number[];
    fightTime: number;
    takenBy: number | null;
    element: Element | null;
    escort: number;
    breathCD: number;
    timer: number;
  };
  baron: {
    state: ObjState;
    lane: number;
    x: number;
    fighters: number[];
    fightTime: number;
    honkTimer: number;
    honks: number;
    takenBy: number | null;
  };
  shortcut: {
    racer: number | null;
    start: number;
    end: number;
    state: "pending" | "in" | "done";
    success: boolean;
    inTime: number;
    reported: boolean;
  };
}

export function createObjectives(race: Race): ObjectiveState {
  const { rng, length } = race;
  const n = race.racers.length;
  const enabled = race.config.mode !== "ranked";
  return {
    enabled,
    turrets: TURRET_FRACS.map((f) => ({ x: f * length, phase: rng.range(0, 3), period: rng.range(2.6, 3.6) })),
    firstBlood: null,
    dragon: {
      state: "hidden", lane: rng.int(n), x: DRAGON_FRAC * length, fighters: [], fightTime: 0,
      takenBy: null, element: null, escort: 0, breathCD: 0, timer: 0,
    },
    baron: { state: "hidden", lane: rng.int(n), x: BARON_FRAC * length, fighters: [], fightTime: 0, honkTimer: 0, honks: 0, takenBy: null },
    shortcut: {
      racer: enabled && n >= 3 ? rng.int(n) : null,
      start: SHORTCUT.start * length,
      end: SHORTCUT.end * length,
      state: "pending",
      success: rng.chance(0.5),
      inTime: 0,
      reported: false,
    },
  };
}

export function turretActive(t: Turret, time: number): boolean {
  return (time + t.phase) % t.period < TURRET_PULSE;
}

const crossed = (r: Racer, x: number) => r.prevX < x && r.x >= x;
const nearLane = (r: Racer, lane: number) => Math.abs(r.lane - lane) <= 1;

/** True while the duck is pinned brawling an objective (the race moves it zero metres). */
export function isFighting(race: Race, r: Racer): boolean {
  const o = race.objectives;
  return o.enabled && (o.dragon.fighters.includes(r.id) || o.baron.fighters.includes(r.id));
}

function honk(race: Race, final: boolean, spare: number | null) {
  const o = race.objectives;
  const L = race.length;
  const front = race.leaderByDistance().x;
  const affected = race.racers.filter(
    (r) => !r.finished && r.id !== spare && !o.baron.fighters.includes(r.id) && r.x >= front - 0.1 * L && (final || r.x < o.baron.x + 4),
  );
  for (const r of affected) if (r.element !== "mountain") race.setState(r, "stumble", 0.9);
  o.baron.honks++;
  race.emit({ type: "BARON_HONK", affected: affected.map((r) => r.id) });
}

/** Called once per tick, before racers move. Spawns, set pieces, fights resolving, drake escort. */
export function tickObjectivesGlobal(race: Race, dt: number): void {
  const o = race.objectives;
  if (!o.enabled) return;
  const leader = race.leaderByDistance();
  const L = race.length;
  const d = o.dragon;

  // the drake surfaces well before anyone reaches it, so it has time to be a threat
  if (d.state === "hidden" && leader.x >= 0.16 * L) {
    d.state = "rising";
    d.timer = 0;
    race.emit({ type: "DRAGON_SPAWN", lane: d.lane, x: d.x });
  }
  if (d.state === "rising") {
    d.timer += dt;
    if (d.timer > 2.5) d.state = "up";
  }
  if (d.state === "fighting") {
    d.fightTime += dt;
    if (d.fightTime >= DRAGON_FIGHT) {
      // first to arrive usually lands the final blow, but a late arrival can smite-steal it
      let winner = d.fighters[0];
      let steal = false;
      if (d.fighters.length > 1 && race.rng.chance(0.4)) {
        winner = d.fighters[d.fighters.length - 1];
        steal = true;
      }
      const r = race.racers[winner];
      const element = race.rng.pick(ELEMENTS);
      d.state = "taken";
      d.takenBy = winner;
      d.element = element;
      d.fighters = [];
      d.escort = DRAGON_ESCORT;
      d.breathCD = 1.2;
      r.element = element;
      r.stats.objectives++;
      if (element === "ocean") {
        r.shield = true;
        r.oceanRegen = true;
      }
      if (element === "cloud") r.cloudDodge = true;
      race.setState(r, "boost", 1.4);
      race.emit({ type: "DRAGON_TAKEN", racer: winner, element, steal });
    }
  }
  if (d.state === "taken") {
    d.escort -= dt;
    d.breathCD -= dt;
    const owner = race.racers[d.takenBy!];
    if (d.breathCD <= 0 && !owner.finished) {
      d.breathCD = 2.2;
      // torch the closest duck ahead of the owner (or just behind if they lead)
      const others = race.racers.filter((r) => !r.finished && r.id !== owner.id);
      const ahead = others.filter((r) => r.x > owner.x).sort((a, b) => a.x - b.x);
      const target = ahead[0] ?? others.sort((a, b) => b.x - a.x)[0];
      if (target) {
        if (target.cloudDodge) {
          target.cloudDodge = false;
          race.emit({ type: "SPELL_DODGE", caster: owner.id, target: target.id, spell: "ignite" });
        } else {
          race.setState(target, d.element === "ocean" ? "stumble" : "ignite", 1.1);
          race.emit({ type: "DRAGON_BREATH", racer: owner.id, target: target.id, element: d.element! });
        }
      }
    }
    if (d.escort <= 0 || owner.finished) d.state = "gone";
  }

  const b = o.baron;
  if (b.state === "hidden" && leader.x >= 0.45 * L) {
    b.state = "up";
    b.honkTimer = 1.4;
    race.emit({ type: "BARON_SPAWN", lane: b.lane, x: b.x });
  }
  if (b.state === "up" || b.state === "fighting") {
    b.honkTimer -= dt;
    if (b.honkTimer <= 0) {
      b.honkTimer = BARON_HONK_EVERY;
      honk(race, false, null);
    }
  }
  if (b.state === "fighting") {
    b.fightTime += dt;
    if (b.fightTime >= BARON_FIGHT) {
      let winner = b.fighters[0];
      if (b.fighters.length > 1 && race.rng.chance(0.4)) winner = b.fighters[b.fighters.length - 1];
      const r = race.racers[winner];
      const steal = race.rankOf(winner) > 0;
      b.state = "taken";
      b.takenBy = winner;
      b.fighters = [];
      r.stats.objectives++;
      r.baron = true;
      race.setState(r, "boost", steal ? 2.6 : 1.4);
      race.emit({ type: "BARON_TAKEN", racer: winner, steal });
      // a sore loser: one last honk at everyone in front of the new Baron holder
      honk(race, true, winner);
    }
  }
}

/** Called per racer after it moves. */
export function tickObjectivesRacer(race: Race, r: Racer, dt: number): void {
  const o = race.objectives;
  if (!o.enabled) return;

  o.turrets.forEach((t, i) => {
    if (!crossed(r, t.x)) return;
    if (i === 0 && o.firstBlood === null) {
      o.firstBlood = r.id;
      r.stats.objectives++;
      race.setState(r, "boost", 0.9);
      race.emit({ type: "FIRST_BLOOD", racer: r.id });
    } else if (turretActive(t, race.time) && r.element !== "mountain") {
      race.setState(r, "stumble", 0.7);
      race.emit({ type: "TURRET_HIT", racer: r.id, turret: i });
    }
  });

  // reaching an objective pins the duck into a brawl
  const d = o.dragon;
  if ((d.state === "up" || d.state === "fighting" || d.state === "rising") && nearLane(r, d.lane) && !d.fighters.includes(r.id) && crossed(r, d.x - REACH)) {
    if (d.state !== "fighting") {
      d.state = "fighting";
      d.fightTime = 0;
    }
    d.fighters.push(r.id);
    r.x = Math.min(r.x, d.x - REACH);
    race.emit({ type: "OBJECTIVE_FIGHT", racer: r.id, objective: "dragon" });
  }
  const b = o.baron;
  if ((b.state === "up" || b.state === "fighting") && nearLane(r, b.lane) && !b.fighters.includes(r.id) && crossed(r, b.x - REACH)) {
    if (b.state !== "fighting") {
      b.state = "fighting";
      b.fightTime = 0;
    }
    b.fighters.push(r.id);
    r.x = Math.min(r.x, b.x - REACH);
    race.emit({ type: "OBJECTIVE_FIGHT", racer: r.id, objective: "baron" });
  }

  const s = o.shortcut;
  if (s.racer === r.id) {
    if (s.state === "pending" && crossed(r, s.start)) {
      s.state = "in";
      race.emit({ type: "SHORTCUT_ENTER", racer: r.id });
    }
    if (s.state === "in") {
      s.inTime += dt;
      if (!s.success && !s.reported && s.inTime > 0.8) {
        s.reported = true;
        race.emit({ type: "SHORTCUT_RESULT", racer: r.id, success: false });
      }
      if (r.x >= s.end) {
        s.state = "done";
        if (s.success) race.emit({ type: "SHORTCUT_RESULT", racer: r.id, success: true });
      }
    }
    const target = s.state === "in" ? 1 : 0;
    r.jungle += Math.sign(target - r.jungle) * Math.min(Math.abs(target - r.jungle), dt * 1.5);
  }
}

/** Speed multiplier from objective buffs and the jungle channel. */
export function objectiveSpeedMult(race: Race, r: Racer): number {
  if (isFighting(race, r)) return 0;
  let m = 1;
  if (r.element === "infernal") m *= 1.12;
  else if (r.element) m *= 1.05;
  if (r.baron) m *= 1.1;
  const s = race.objectives.shortcut;
  if (s.racer === r.id && s.state === "in") {
    if (s.success) m *= 1.45;
    else if (s.inTime < 2.2) m *= 0.25;
  }
  return m;
}
