import type { Race } from "./race";
import type { Racer, SpellKind } from "./types";

const SPELL_AGGRO = 0.045; // per-tick chance once off cooldown (original value at 60 fps)

export function tickSpells(race: Race, r: Racer, dt: number): void {
  r.spellCD -= dt;
  if (r.spellCD > 0) return;
  const targets = race.racers.filter((t) => !t.finished && t.id !== r.id);
  if (!targets.length || !race.rng.chance(SPELL_AGGRO)) return;

  r.spellCD = race.rng.range(4.5, 7.5);
  // spells lean toward whoever is in front, so ARAM leaders can't just run away with it
  const weights = targets.map((t) => {
    const rank = race.rankOf(t.id);
    return rank === 0 ? 2.5 : rank < race.racers.length / 2 ? 1.5 : 1;
  });
  let roll = race.rng.next() * weights.reduce((a, b) => a + b, 0);
  let target = targets[targets.length - 1];
  for (let i = 0; i < targets.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      target = targets[i];
      break;
    }
  }
  const spell: SpellKind = race.rng.chance(0.52) ? "ice" : "ignite";
  r.stats.spells++;
  castSpell(race, r, target, spell);
}

function castSpell(race: Race, caster: Racer, target: Racer, spell: SpellKind): void {
  if (target.cloudDodge) {
    target.cloudDodge = false;
    race.emit({ type: "SPELL_DODGE", caster: caster.id, target: target.id, spell });
    return;
  }
  if (target.shield) {
    target.shield = false;
    target.stats.blocks++;
    if (target.oceanRegen) {
      // Ocean drake: shield comes back once
      target.oceanRegen = false;
      target.shield = true;
    }
    race.emit({ type: "BLOCK", caster: caster.id, target: target.id, spell });
    return;
  }
  if (spell === "ice") {
    race.setState(target, "frozen", 1.2);
    target.stats.frozenTaken++;
    caster.stats.frozenGiven++;
  } else {
    race.setState(target, "ignite", 1.6);
    target.stats.igniteTaken++;
    caster.stats.igniteGiven++;
  }
  race.emit({ type: "SPELL_HIT", caster: caster.id, target: target.id, spell });
}
