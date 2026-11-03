export type TeamMode = "alternating" | "split";

export interface Ranked<T> {
  item: T;
  rank: number;
}

/** Ported from the original getTeamData: alternate by finish order, or top half vs bottom half. */
export function splitTeams<T>(order: T[], mode: TeamMode, swap: boolean): { blue: Ranked<T>[]; red: Ranked<T>[] } {
  const blue: Ranked<T>[] = [];
  const red: Ranked<T>[] = [];
  const half = Math.ceil(order.length / 2);
  order.forEach((item, i) => {
    const entry = { item, rank: i + 1 };
    const toBlue = mode === "alternating" ? i % 2 === 0 : i < half;
    (toBlue ? blue : red).push(entry);
  });
  return swap ? { blue: red, red: blue } : { blue, red };
}

export function teamsText(blue: string[], red: string[]): string {
  let text = "🏆 LOBBY RESULTS 🏆\n\n";
  text += "🔵 BLUE SIDE:\n";
  blue.forEach((n) => (text += `- ${n}\n`));
  text += "\n🔴 RED SIDE:\n";
  red.forEach((n) => (text += `- ${n}\n`));
  return text;
}
