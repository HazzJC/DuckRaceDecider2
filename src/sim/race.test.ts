import { describe, expect, it } from "vitest";
import { Race, timeLimitExtra } from "./race";
import type { Mode, RaceConfig } from "./types";
import { splitTeams } from "./teams";

const NAMES = ["TopLaner", "JungleKing", "MidDiff", "ADCarry", "SupportMain", "Flex", "Sub", "Coach", "Analyst", "Mascot"];

const cfg = (mode: Mode, seed: number, n = 5, duration = 30): RaceConfig => ({
  names: NAMES.slice(0, n),
  duration,
  mode,
  seed,
  cosmeticSeed: seed ^ 0xabcdef,
});

const summary = (r: Race) => r.finishOrder.map((d) => `${d.id}:${d.finishTime.toFixed(6)}`).join(",");

describe("race simulation", () => {
  it("is deterministic for the same seed and inputs", () => {
    for (const mode of ["blind", "ranked", "aram"] as Mode[]) {
      const inputs = [{ tick: 120, racer: 2 }, { tick: 300, racer: 0 }];
      const a = new Race(cfg(mode, 1234), inputs);
      const b = new Race(cfg(mode, 1234), inputs);
      a.runToEnd();
      b.runToEnd();
      expect(summary(a)).toBe(summary(b));
      expect(a.events.length).toBe(b.events.length);
    }
  });

  it("replays a live race with cheers exactly", () => {
    const live = new Race(cfg("aram", 99));
    while (!live.done) {
      if (live.tick === 200) live.cheer(3);
      if (live.tick === 260) live.cheer(1);
      live.step();
    }
    const replay = new Race(cfg("aram", 99), live.inputs);
    replay.runToEnd();
    expect(summary(replay)).toBe(summary(live));
  });

  it("gives every duck a place and ends within the time limit", () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const mode of ["blind", "ranked", "aram"] as Mode[]) {
        const n = 2 + (seed % 9);
        const race = new Race(cfg(mode, seed, n, 15 + (seed % 46)));
        race.runToEnd();
        expect(race.done).toBe(true);
        expect(race.time).toBeLessThanOrEqual(race.config.duration + timeLimitExtra(race.config.duration) + 0.1);
        expect(race.finishOrder.map((r) => r.place)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
        // at least the winner must actually cross the line
        expect(race.finishOrder[0].finished).toBe(true);
      }
    }
  });

  it("spreads wins across ducks (still a fair decider)", () => {
    for (const mode of ["blind", "ranked", "aram"] as Mode[]) {
      const wins = new Array(5).fill(0);
      for (let seed = 1; seed <= 600; seed++) {
        const race = new Race(cfg(mode, seed));
        race.runToEnd();
        wins[race.finishOrder[0].id]++;
      }
      for (const w of wins) expect(w).toBeGreaterThan(60);
    }
  });

  it("only runs objectives outside Ranked", () => {
    const ranked = new Race(cfg("ranked", 7));
    ranked.runToEnd();
    expect(ranked.events.some((e) => e.type === "DRAGON_TAKEN" || e.type === "FIRST_BLOOD")).toBe(false);

    const blind = new Race(cfg("blind", 7));
    blind.runToEnd();
    expect(blind.events.some((e) => e.type === "FIRST_BLOOD")).toBe(true);
    expect(blind.events.some((e) => e.type === "DRAGON_TAKEN")).toBe(true);
    expect(blind.events.some((e) => e.type === "BARON_TAKEN")).toBe(true);
    // set pieces should stay on stage for a while, not blink in and out
    const spawn = blind.events.find((e) => e.type === "DRAGON_SPAWN")!;
    const taken = blind.events.find((e) => e.type === "DRAGON_TAKEN")!;
    expect(taken.t - spawn.t).toBeGreaterThan(4);
    expect(blind.events.filter((e) => e.type === "BARON_HONK").length).toBeGreaterThanOrEqual(2);
    expect(blind.events.some((e) => e.type === "DRAGON_BREATH")).toBe(true);
  });
});

describe("teams", () => {
  const order = ["a", "b", "c", "d", "e"];
  it("alternates", () => {
    const { blue, red } = splitTeams(order, "alternating", false);
    expect(blue.map((x) => x.item)).toEqual(["a", "c", "e"]);
    expect(red.map((x) => x.item)).toEqual(["b", "d"]);
  });
  it("splits top/bottom and swaps", () => {
    const { blue, red } = splitTeams(order, "split", true);
    expect(red.map((x) => x.item)).toEqual(["a", "b", "c"]);
    expect(blue.map((x) => x.item)).toEqual(["d", "e"]);
    expect(red[0].rank).toBe(1);
  });
});
