import type { Race } from "../sim/race";
import type { TimedEvent } from "../sim/events";
import type { Racer } from "../sim/types";
import { ELEMENT_NAMES } from "../casters/lines";

/**
 * League-flavoured all chat: flame, cope, pings and mutes, all PG. Lines can mention other ducks:
 * {other} a random rival, {leader} the leader, {last} last place, {caster}/{target} for spell reactions.
 * Cosmetic only, so it uses Math.random (not part of replays).
 */
const LINES = {
  GENERIC: [
    "ff 15 this river is unplayable", "jg diff", "report {other} for inting", "why is {other} paddling backwards",
    "open mid", "0 bread 0 vision 0 hope", "{other} is hardstuck iron", "check {other}'s op.gg lmao", "go next",
    "mute all, gl", "who is shotcalling this", "afk farming bread", "{other} boosted", "my mmr is crying",
    "i'm not tilted YOU'RE tilted", "elo hell is real", "1v1 me in the pond {other}", "?", "??", "???",
    "{other} is griefing", "skill issue", "LP refund pls", "same team every game", "ping me one more time {other}",
    "flash was on cd", "lag spike", "my cat walked on my keyboard", "{other} plays like a bot game", "where is my jungler",
    "this patch is so broken", "who picked this duck", "stop pinging me", "{other} you're actually so bad", "dodge next time",
  ],
  WINNING: [
    "ez", "gg ez", "1v9", "carrying again", "u guys are so bad lmao", "ty for the free LP", "challenger duck btw",
    "imagine losing to a rubber duck", "you're all hardstuck", "2 ez", "{other} sit", "diff", "tutorial?",
    "catch me if u can", "beep beep", "Quack diff. Check the replay.", "Built different. Hatched better.",
    "add me for coaching", "was that your best {last}?", "not even trying", "keep crying",
  ],
  LAST: [
    "ff 15", "ff at 15 or i int", "my team is 4 bots and a goose", "{leader} smurfing, report", "jg didn't gank once",
    "i'm on 400 ping", "i'm not last i'm scaling", "this duck is useless", "remake?", "my wifi is a duck",
    "nerf {leader}", "refund skin", "x9", "who's queueing with me next game", "I swear I'm better than this",
    "Lag. Pond lag.", "I'm scaling emotionally, not mechanically.", "uninstalling after this",
  ],
  TOP_HALF: [
    "{leader} lucky", "next game i carry", "watch this", "{other} stop stealing my bread", "i'm getting baron",
    "follow me", "group mid", "keep it close boys", "You picked that? On purpose?", "Please stop cooking.",
    "duck gap", "{leader} is so overrated", "one good fight and we win",
  ],
  RARE: [
    "The pond whispers your misplays to me.", "I saw that mistake before you made it.", "Entropy favors the duck.",
    "Time is a circle and you still int.", "This outcome was foretold in breadcrumbs.",
    "I have seen every timeline. You lose in all of them.", "I am not trash talking. I am narrating.",
  ],
  HIT: [
    "REPORT {caster}", "{caster} you're so toxic", "???", "that hitbox is a joke", "nerf ice", "riot pls",
    "how did that hit", "lag", "i'll remember that {caster}", "unlucky", "sure buddy", "cool spell bro",
  ],
  HITTER: ["sit {target}", "ez", "get frozen", "toasty", "outplayed", "?", "/laugh", "ice to meet you", "skill shot btw", "who's next", "{target} so free"],
  DRAKE_MINE: ["my drake", "ty for the buff", "don't contest me", "free drake"],
  DRAKE_STEAL: ["SMITE DIFF", "ty for the drake {target}", "stolen lmao"],
  DRAKE_LOST: ["ARE YOU KIDDING ME", "stolen?? ff", "who let that happen", "drake diff"],
  HONKED: ["THAT GOOSE", "who aggroed baron??", "baron diff", "i hate geese", "HONK HONK ME AGAIN I DARE YOU"],
  WIN: ["gg ez no re", "gg", "1v9 as usual", "add me if you want to learn"],
  LOSE: ["gg", "ff wp", "close one", "rematch NOW", "{leader} was lagging though", "gg go next", "unlucky"],
  CROWD: ["WOOOO!", "HYPE!", "QUACK QUACK!", "LET HIM COOK!", "SEND IT!"],
};

const PINGS = ["?", "Missing", "Danger", "On my way", "Enemy vision", "Bait"];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class Chat {
  rate = 2;
  private timer = 1.5;
  private used = new Set<string>();
  private flames = new Map<number, number>();

  constructor(private box: HTMLElement, private content: HTMLElement) {}

  reset() {
    this.content.innerHTML = "";
    this.used.clear();
    this.flames.clear();
    this.timer = 1.5;
    this.system("Welcome to Summoner's River!", "#94a3b8");
    this.system("Minions have spawned.", "#ca8a04");
  }

  private push(el: HTMLElement) {
    this.content.appendChild(el);
    while (this.content.childElementCount > 80) this.content.firstElementChild?.remove();
    this.box.scrollTop = this.box.scrollHeight;
  }

  add(name: string, text: string, color: string, channel: "All" | "Team" = "All") {
    const d = new Date();
    const msg = document.createElement("div");
    msg.className = "chat-msg";
    const time = document.createElement("span");
    time.className = "chat-time";
    time.textContent = `[${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}]`;
    const chan = document.createElement("span");
    chan.className = `chat-chan ${channel === "Team" ? "team" : ""}`;
    chan.textContent = `[${channel}]`;
    const who = document.createElement("span");
    who.className = "chat-name";
    who.style.color = color;
    who.textContent = `${name}:`;
    const body = document.createElement("span");
    body.textContent = ` ${text}`;
    msg.append(time, " ", chan, " ", who, body);
    this.push(msg);
  }

  system(text: string, color = "#facc15") {
    const msg = document.createElement("div");
    msg.className = "chat-msg chat-system";
    msg.style.color = color;
    msg.textContent = text;
    this.push(msg);
  }

  private ping(from: Racer, at: Racer) {
    const msg = document.createElement("div");
    msg.className = "chat-msg chat-ping";
    msg.textContent = `${from.name} pinged ${pick(PINGS)} on ${at.name}`;
    this.push(msg);
  }

  private fresh(pool: string[]) {
    const a = pool.filter((l) => !this.used.has(l));
    const line = pick(a.length ? a : pool);
    this.used.add(line);
    if (this.used.size > 60) this.used.clear();
    return line;
  }

  private fill(line: string, race: Race, speaker: Racer, extra: Record<string, string> = {}) {
    const others = race.racers.filter((r) => r.id !== speaker.id);
    const st = race.standings;
    const vars: Record<string, string> = {
      other: others.length ? pick(others).name : "jungle",
      leader: (st[0].id === speaker.id ? st[1] ?? st[0] : st[0]).name,
      last: st[st.length - 1].name,
      ...extra,
    };
    return line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  }

  /** Say a line as a duck. Repeat offenders eventually get muted by somebody. */
  private say(race: Race, r: Racer, pool: string[], extra: Record<string, string> = {}) {
    const line = this.fill(this.fresh(pool), race, r, extra);
    const team = Math.random() < 0.18;
    this.add(r.name, line, r.cosmetics.chatColor, team ? "Team" : "All");
    const n = (this.flames.get(r.id) ?? 0) + 1;
    this.flames.set(r.id, n);
    if (n >= 6 && Math.random() < 0.35) {
      this.flames.set(r.id, 0);
      const muter = pick(race.racers.filter((o) => o.id !== r.id)) ?? r;
      window.setTimeout(() => this.system(`${r.name} has been muted by ${muter.name}`, "#94a3b8"), 600);
    }
  }

  update(dt: number, race: Race) {
    this.timer -= dt;
    const active = race.racers.filter((r) => !r.finished);
    if (this.timer > 0 || !active.length) return;
    this.timer = this.rate * (0.6 + Math.random() * 0.5);
    const speaker = pick(active);
    const rank = race.rankOf(speaker.id);
    const total = race.racers.length;
    if (Math.random() < 0.12) {
      const target = pick(race.racers.filter((r) => r.id !== speaker.id));
      if (target) return this.ping(speaker, target);
    }
    const roll = Math.random();
    let pool: string[];
    if (roll < 0.06) pool = LINES.RARE;
    else if (rank === 0 && roll < 0.6) pool = LINES.WINNING;
    else if (rank === total - 1 && roll < 0.65) pool = LINES.LAST;
    else if (rank < total / 2 && roll < 0.4) pool = LINES.TOP_HALF;
    else pool = LINES.GENERIC;
    this.say(race, speaker, pool);
  }

  crowd(name: string) {
    this.add("Crowd", `${pick(LINES.CROWD)} (${name})`, "#67e8f9");
  }

  onEvent(e: TimedEvent, race: Race) {
    const r = (id: number) => race.racers[id];
    switch (e.type) {
      case "SPELL_HIT": {
        const vars = { caster: r(e.caster).name, target: r(e.target).name };
        if (Math.random() < 0.55) this.say(race, r(e.target), LINES.HIT, vars);
        if (Math.random() < 0.45) window.setTimeout(() => this.say(race, r(e.caster), LINES.HITTER, vars), 500);
        break;
      }
      case "BLOCK":
        if (Math.random() < 0.5) this.say(race, r(e.target), ["nice try {caster}", "blocked lol", "shield diff", "not today"], { caster: r(e.caster).name });
        break;
      case "FIRST_BLOOD":
        this.system(`${r(e.racer).name} has drawn first blood!`, "#f87171");
        break;
      case "DRAGON_TAKEN": {
        this.system(`${r(e.racer).name} has ${e.steal ? "stolen" : "slain"} the ${ELEMENT_NAMES[e.element]} Drake!`, "#c084fc");
        if (e.steal) {
          const victim = race.racers.find((x) => x.id !== e.racer && x.x > race.objectives.dragon.x - 4);
          this.say(race, r(e.racer), LINES.DRAKE_STEAL, { target: victim?.name ?? "jungle" });
          if (victim) window.setTimeout(() => this.say(race, victim, LINES.DRAKE_LOST), 700);
        } else if (Math.random() < 0.6) this.say(race, r(e.racer), LINES.DRAKE_MINE);
        break;
      }
      case "DRAGON_BREATH":
        if (Math.random() < 0.55) this.say(race, r(e.target), ["BURNING", "the drake is OP", "nerf dragon", "who let it out??", "get your pet off me {other}"], { other: r(e.racer).name });
        break;
      case "BARON_HONK":
        if (e.affected.length && Math.random() < 0.6) this.say(race, r(pick(e.affected)), LINES.HONKED);
        break;
      case "BARON_TAKEN":
        this.system(`${r(e.racer).name} has ${e.steal ? "STOLEN" : "slain"} Baron Goose!`, "#a855f7");
        if (e.steal) this.say(race, r(e.racer), LINES.WINNING);
        break;
      case "SHORTCUT_RESULT":
        this.say(race, r(e.racer), e.success ? ["jungle diff", "pathing 200 years"] : ["this jungle is bugged", "who put reeds here", "stuck. ff"]);
        break;
      case "CHEER":
        if (Math.random() < 0.5) this.say(race, r(e.racer), ["ty fans", "my fans > your fans", "they love me"]);
        break;
      case "FINISH":
        if (e.place === 1) {
          this.system(`${r(e.racer).name} has destroyed the Nexus!`, "#facc15");
          this.say(race, r(e.racer), LINES.WIN);
          race.racers.filter((x) => x.id !== e.racer).slice(0, 3).forEach((x, i) => window.setTimeout(() => this.say(race, x, LINES.LOSE), 600 + i * 450));
        }
        break;
    }
  }
}
