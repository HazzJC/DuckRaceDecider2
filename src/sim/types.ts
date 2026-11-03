export type Mode = "blind" | "ranked" | "aram";
export type DuckState = "normal" | "boost" | "stumble" | "frozen" | "ignite";
export type PowerupKind = "bread" | "anchor" | "shield" | "portal";
export type SpellKind = "ice" | "ignite";
export type Element = "infernal" | "ocean" | "cloud" | "mountain";

export const HATS = ["none", "tophat", "cap", "crown", "viking", "propeller", "wizard", "halo", "sombrero", "pirate"] as const;
export const PATTERNS = ["none", "dots", "stripes", "bandit", "belly"] as const;
export type Hat = (typeof HATS)[number];
export type Pattern = (typeof PATTERNS)[number];

export interface Cosmetics {
  hue: number; // 0..360
  hat: Hat;
  pattern: Pattern;
  chatColor: string;
}

export interface RaceConfig {
  names: string[];
  duration: number; // target seconds for an average duck
  mode: Mode;
  seed: number;
  cosmeticSeed: number;
}

export interface CheerInput {
  tick: number;
  racer: number;
}

export interface Stats {
  spells: number;
  frozenGiven: number;
  igniteGiven: number;
  frozenTaken: number;
  igniteTaken: number;
  blocks: number;
  cheers: number;
  powerups: number;
  bread: number;
  anchor: number;
  shield: number;
  portal: number;
  objectives: number;
}

export interface Racer {
  id: number;
  name: string;
  lane: number;
  cosmetics: Cosmetics;
  x: number;
  prevX: number;
  speed: number;
  skill: number;
  state: DuckState;
  stateTimer: number;
  shield: boolean;
  cheered: boolean;
  spellCD: number;
  finished: boolean;
  finishTime: number;
  place: number;
  element: Element | null;
  /** holds Hand of Baron */
  baron: boolean;
  oceanRegen: boolean;
  cloudDodge: boolean;
  /** 0..1 how far the duck is pulled sideways into the jungle shortcut channel */
  jungle: number;
  stats: Stats;
}

export interface Powerup {
  id: number;
  lane: number;
  x: number;
  kind: PowerupKind;
  collected: boolean;
}
