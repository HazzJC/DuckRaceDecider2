import type { Race } from "./race";
import type { PowerupKind, Racer } from "./types";

// Same weighting as the original: bread x3, anchor x2, shield, portal
const POOL: PowerupKind[] = ["bread", "bread", "anchor", "shield", "portal", "anchor", "bread"];

export function spawnPowerup(race: Race): void {
  const { rng, length } = race;
  race.powerups.push({
    id: race.nextPowerupId++,
    lane: rng.int(race.racers.length),
    x: rng.range(length * 0.12, length * 0.88),
    kind: rng.pick(POOL),
    collected: false,
  });
}

export function collectPowerups(race: Race, r: Racer): void {
  for (const p of race.powerups) {
    if (p.collected || p.lane !== r.lane) continue;
    if (r.prevX < p.x && r.x >= p.x) applyPowerup(race, r, p.kind, p);
  }
}

export function cleanupPowerups(race: Race): void {
  race.powerups = race.powerups.filter((p) => {
    if (p.collected) return false;
    // drop items nobody in that lane can still reach
    const laneRacer = race.racers.find((r) => r.lane === p.lane);
    return !!laneRacer && !laneRacer.finished && laneRacer.x < p.x;
  });
}

function applyPowerup(race: Race, r: Racer, kind: PowerupKind, p: { collected: boolean }): void {
  p.collected = true;
  r.stats.powerups++;
  r.stats[kind]++;
  if (kind === "bread") race.setState(r, "boost", 0.9);
  if (kind === "anchor" && r.element !== "mountain") race.setState(r, "stumble", 0.8);
  if (kind === "shield") r.shield = true;
  if (kind === "portal") {
    const jump = race.rng.range(race.length * 0.04, race.length * 0.08);
    r.x = Math.min(r.x + jump, race.length - 0.01);
  }
  race.emit({ type: "POWERUP", racer: r.id, kind });
}
