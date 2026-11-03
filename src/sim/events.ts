import type { Element, PowerupKind, SpellKind } from "./types";

/** Everything interesting that happens in a race. Casters, camera, audio and highlights all feed off this. */
export type RaceEvent =
  | { type: "START" }
  | { type: "LEAD_CHANGE"; leader: number; prev: number }
  | { type: "SPELL_HIT"; caster: number; target: number; spell: SpellKind }
  | { type: "SPELL_DODGE"; caster: number; target: number; spell: SpellKind }
  | { type: "BLOCK"; caster: number; target: number; spell: SpellKind }
  | { type: "POWERUP"; racer: number; kind: PowerupKind }
  | { type: "SURGE"; racer: number }
  | { type: "CHEER"; racer: number }
  | { type: "FIRST_BLOOD"; racer: number }
  | { type: "TURRET_HIT"; racer: number; turret: number }
  | { type: "DRAGON_SPAWN"; lane: number; x: number }
  | { type: "DRAGON_TAKEN"; racer: number; element: Element; steal: boolean }
  | { type: "DRAGON_BREATH"; racer: number; target: number; element: Element }
  | { type: "OBJECTIVE_FIGHT"; racer: number; objective: "dragon" | "baron" }
  | { type: "BARON_SPAWN"; lane: number; x: number }
  | { type: "BARON_HONK"; affected: number[] }
  | { type: "BARON_TAKEN"; racer: number; steal: boolean }
  | { type: "SHORTCUT_ENTER"; racer: number }
  | { type: "SHORTCUT_RESULT"; racer: number; success: boolean }
  | { type: "COMEBACK"; racer: number }
  | { type: "FINAL_STRETCH"; leader: number }
  | { type: "FINISH"; racer: number; place: number; time: number }
  | { type: "CLOSE_FINISH"; a: number; b: number; margin: number }
  | { type: "RACE_END" };

export type TimedEvent = RaceEvent & { tick: number; t: number };
export type EventType = RaceEvent["type"];
