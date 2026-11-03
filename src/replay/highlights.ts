import type { TimedEvent } from "../sim/events";
import { TICK_RATE } from "../sim/race";
import { ELEMENT_NAMES } from "../casters/lines";

export interface Highlight {
  tick: number;
  startTick: number;
  endTick: number;
  focus: number;
  label: string;
  score: number;
}

const PRE = 1.7 * TICK_RATE;
const POST = 1.3 * TICK_RATE;

/** Score the event log and pick up to `max` non-overlapping moments, in race order. */
export function pickHighlights(events: TimedEvent[], names: string[], duration: number, max = 3): Highlight[] {
  const nm = (id: number) => names[id] ?? "?";
  const cands: Highlight[] = [];
  const add = (e: TimedEvent, focus: number, score: number, label: string) =>
    cands.push({ tick: e.tick, startTick: Math.max(0, e.tick - PRE), endTick: e.tick + POST, focus, label, score });

  const close = events.find((e) => e.type === "CLOSE_FINISH");
  for (const e of events) {
    const late = e.t > duration * 0.7;
    switch (e.type) {
      case "BARON_TAKEN":
        add(e, e.racer, e.steal ? 9 : 4, e.steal ? `BARON STEAL · ${nm(e.racer)}` : `BARON · ${nm(e.racer)}`);
        break;
      case "BARON_HONK":
        if (e.affected.length) add(e, e.affected[0], 5 + e.affected.length * 0.5, "THE HONK");
        break;
      case "COMEBACK":
        add(e, e.racer, 7, `COMEBACK · ${nm(e.racer)}`);
        break;
      case "LEAD_CHANGE":
        add(e, e.leader, late ? 6.5 : 2.5, `${late ? "LATE " : ""}LEAD CHANGE · ${nm(e.leader)}`);
        break;
      case "SPELL_HIT":
        add(e, e.target, 3 + (late ? 1.5 : 0), `${e.spell === "ice" ? "FROZEN" : "IGNITED"} · ${nm(e.target)}`);
        break;
      case "BLOCK":
        add(e, e.target, 4, `BLOCKED · ${nm(e.target)}`);
        break;
      case "DRAGON_TAKEN":
        add(e, e.racer, e.steal ? 8.5 : 5, `${e.steal ? "DRAKE STEAL" : ELEMENT_NAMES[e.element] + " DRAKE"} · ${nm(e.racer)}`);
        break;
      case "DRAGON_BREATH":
        add(e, e.target, 3.5, `DRAKE BREATH · ${nm(e.target)}`);
        break;
      case "SHORTCUT_RESULT":
        add(e, e.racer, 5, e.success ? `JUNGLE GAMBIT · ${nm(e.racer)}` : `STUCK IN THE REEDS · ${nm(e.racer)}`);
        break;
      case "FIRST_BLOOD":
        add(e, e.racer, 3, `FIRST BLOOD · ${nm(e.racer)}`);
        break;
      case "FINISH":
        if (e.place === 1) add(e, e.racer, close ? 10 : 8, close ? `PHOTO FINISH · ${nm(e.racer)}` : `THE WIN · ${nm(e.racer)}`);
        break;
    }
  }

  cands.sort((a, b) => b.score - a.score);
  const chosen: Highlight[] = [];
  for (const c of cands) {
    if (chosen.length >= max) break;
    if (chosen.some((h) => c.startTick < h.endTick && c.endTick > h.startTick)) continue;
    chosen.push(c);
  }
  return chosen.sort((a, b) => a.tick - b.tick);
}
