import "./style.css";
import * as THREE from "three";
import { DT, Race } from "./sim/race";
import { randomSeed } from "./sim/rng";
import type { TimedEvent } from "./sim/events";
import type { Mode, RaceConfig, Racer } from "./sim/types";
import { splitTeams, teamsText, type TeamMode } from "./sim/teams";
import { TURRET_FRACS, turretActive } from "./sim/objectives";
import { Stage, detectQuality, type Quality } from "./render/stage";
import { Water } from "./render/water";
import { World } from "./render/world";
import { VFX } from "./render/vfx";
import { ObjectivesView } from "./render/objectives-view";
import { PODIUM, RaceView } from "./render/race-view";
import { Director, type ShotKind } from "./render/director";
import { L } from "./render/layout";
import { Booth } from "./casters/booth";
import { Motes, buildClouds } from "./render/nature";
import { Commentary, type CaptionUI } from "./casters/commentary";
import { QuackSpeak } from "./casters/quackspeak";
import { ELEMENT_NAMES } from "./casters/lines";
import { Mixer, type Bus } from "./audio/mixer";
import { Sfx } from "./audio/sfx";
import { Music } from "./audio/music";
import { Chat } from "./ui/chat";
import { pickHighlights, type Highlight } from "./replay/highlights";
import { renderShareCard } from "./replay/share-card";
import { Portraits } from "./render/portraits";
import { loadDuckAsset } from "./render/duck-asset";
import { loadHdri, loadTerrainTextures } from "./render/assets";
import { lookFromHue } from "./render/duck";
import { CASTERS, buildHeadset } from "./casters/booth";
import { ICON, type IconName } from "./ui/icons";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const store = {
  get(k: string) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem(k, v); } catch { /* private mode */ }
  },
};

const DEFAULT_NAMES = ["TopLaner", "JungleKing", "MidDiff", "ADCarry", "SupportMain"];
const MODE_LABEL: Record<Mode, string> = { blind: "Blind Pick", ranked: "Ranked", aram: "ARAM Mayhem" };

/* ---------- Engine setup ---------- */
// the scanned duck model must be in before any duck (lobby, booth, portraits) is built
const [, terrainTextures, hdri] = await Promise.all([
  loadDuckAsset(`${import.meta.env.BASE_URL}assets/duck/rubber_duck_toy_2k.gltf`),
  loadTerrainTextures(),
  loadHdri(),
]);
const qualityPref = store.get("duck_racer_quality") ?? "auto";
const quality: Quality = qualityPref === "auto" ? detectQuality() : (qualityPref as Quality);
const stage = new Stage($("stage"), quality);
const water = new Water(stage.sunDir, quality === "low" ? 1024 : 2048, quality === "high" ? 0.5 : quality === "med" ? 0.35 : 0);
if (hdri) stage.setEnvironment(hdri);
const world = new World(quality, terrainTextures);
const vfx = new VFX(quality);
const objectivesView = new ObjectivesView();
const raceView = new RaceView(vfx, water, objectivesView, (id) => cheer(id));
stage.scene.add(water.mesh, world.group, vfx.group, objectivesView.group, raceView.group);
const clouds = buildClouds(stage.sunDir);
const motes = new Motes(quality === "low" ? 120 : 420);
stage.scene.add(clouds.mesh, motes.points);
const director = new Director(stage.camera);
stage.addPreRender(() => water.renderReflection(stage.renderer, stage.scene, stage.camera));
// the booth's LED wall shows a live aerial feed of the race (low-res, every third frame)
const feedCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 900);
let feedFrame = 0;
stage.addPreRender(() => {
  if (!boothFrame.offsetParent || ++feedFrame % 3) return;
  const r = stage.renderer;
  const focus = director.lookAt;
  feedCam.position.set(focus.x - 16, 16, focus.z + 20);
  feedCam.lookAt(focus.x + 6, 0, focus.z);
  const prevShadow = r.shadowMap.autoUpdate;
  r.shadowMap.autoUpdate = false;
  r.setRenderTarget(booth.feedTarget);
  r.render(stage.scene, feedCam);
  r.setRenderTarget(null);
  r.shadowMap.autoUpdate = prevShadow;
});
const booth = new Booth();
booth.scene.environment = stage.scene.environment;
booth.scene.environmentIntensity = 0.9;
const boothFrame = $("booth-frame");
stage.addOverlay((r) => {
  if (boothFrame.offsetParent) booth.render(r, boothFrame.getBoundingClientRect(), r.domElement.getBoundingClientRect());
});

const portraits = new Portraits(hdri);
const portraitOf = (r: Racer) =>
  portraits.get(`${Math.round(r.cosmetics.hue)}-${r.cosmetics.hat}-${r.cosmetics.pattern}`, lookFromHue(r.cosmetics.hue, r.cosmetics.hat, r.cosmetics.pattern));
const casterPortraits = CASTERS.map((c, i) => portraits.get(`caster-${i}`, c.look, (d) => d.head.add(buildHeadset(c.color))));
const hueCss = (r: Racer, l = 60) => `hsl(${r.cosmetics.hue} 78% ${l}%)`;

// fill static icon slots
document.querySelectorAll<HTMLElement>("i[data-icon]").forEach((el) => (el.innerHTML = ICON[el.dataset.icon as IconName] ?? ""));
$("settings-btn").innerHTML = ICON.gear;

const mixer = new Mixer();
const sfx = new Sfx(mixer);
const music = new Music(mixer);
const speech = new QuackSpeak(mixer, sfx);

const captionEl = $("caption");
const captionUI: CaptionUI = {
  show(c, name, role, color, text, excited) {
    captionEl.hidden = false;
    (captionEl.querySelector(".cap-portrait") as HTMLImageElement).src = casterPortraits[c];
    captionEl.style.setProperty("--cap", color);
    captionEl.classList.toggle("hype", excited);
    captionEl.querySelector(".cap-name")!.textContent = name;
    captionEl.querySelector(".cap-role")!.textContent = role;
    captionEl.dataset.full = text;
    captionEl.querySelector(".cap-text")!.textContent = "";
    // restart the slide-in
    captionEl.style.animation = "none";
    void captionEl.offsetWidth;
    captionEl.style.animation = "";
  },
  reveal(chars) {
    const full = captionEl.dataset.full ?? "";
    const el = captionEl.querySelector(".cap-text")!;
    const next = full.slice(0, chars);
    if (el.textContent !== next) el.textContent = next;
  },
  hide() {
    captionEl.hidden = true;
  },
};
const commentary = new Commentary(speech, booth, captionUI, mixer);
const chat = new Chat($("chat-box"), $("chat-content"));

/* ---------- App state ---------- */
type Phase = "setup" | "intro" | "countdown" | "racing" | "outro" | "replay" | "results";
let phase: Phase = "setup";
let race: Race | null = null;
let replayRace: Race | null = null;
let mode: Mode = (store.get("duck_racer_mode") as Mode) || "blind";
let cosmeticSeed = Number(store.get("duck_racer_looks")) || randomSeed();
let token = 0;
let paused = false;
let simAcc = 0;
let visTime = 0;
let slowmo = 1;
let freezeUntil = 0;
let winnerAt = -1;
let finishShotDone = false;
let skipped = false;
let tensionBump = 0;
let highlights: Highlight[] = [];
let replayIdx = 0;
let teamMode: TeamMode = "alternating";
let swapSides = false;
let reducedMotion = store.get("duck_racer_motion") === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Setup screen ---------- */
const input = $<HTMLTextAreaElement>("player-input");
const durationInput = $<HTMLInputElement>("duration-input");
input.value = store.get("duck_racer_names") ?? DEFAULT_NAMES.join("\n");
durationInput.value = store.get("duck_racer_duration_v2") ?? "30";
$("duration-display").textContent = durationInput.value;

const parseNames = () =>
  input.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 16);

function selectMode(m: Mode) {
  mode = m;
  store.set("duck_racer_mode", m);
  document.querySelectorAll<HTMLButtonElement>(".mode-card").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === m)));
}
document.querySelectorAll<HTMLButtonElement>(".mode-card").forEach((b) => b.addEventListener("click", () => selectMode(b.dataset.mode as Mode)));
selectMode(mode);

let previewTimer = 0;
function refreshPreview() {
  const names = parseNames();
  $("name-count").textContent = String(names.length);
  const preview = new Race({ names: names.length ? names : DEFAULT_NAMES, duration: 30, mode: "ranked", seed: 1, cosmeticSeed });
  race = preview;
  raceView.setRace(preview);
  world.setLanes(preview.racers.length);
  raceView.setLabelsVisible(false);
  renderLobby(preview.racers, names.length > 0);
}

function renderLobby(racers: Racer[], real: boolean) {
  const box = $("lobby-cards");
  box.innerHTML = "";
  racers.forEach((r, i) => {
    const card = document.createElement("div");
    card.className = "duck-card";
    card.style.setProperty("--i", String(i));
    card.style.setProperty("--h", String(Math.round(r.cosmetics.hue)));
    const img = document.createElement("img");
    img.src = portraitOf(r);
    img.alt = "";
    const num = document.createElement("div");
    num.className = "dc-num";
    num.textContent = String(i + 1).padStart(2, "0");
    const name = document.createElement("div");
    name.className = "dc-name";
    name.textContent = real ? r.name : "Open slot";
    const skin = document.createElement("div");
    skin.className = "dc-skin";
    const hat = r.cosmetics.hat === "none" ? "Classic" : r.cosmetics.hat;
    skin.textContent = `${hat}${r.cosmetics.pattern === "none" ? "" : " · " + r.cosmetics.pattern}`;
    card.append(num, img, name, skin);
    box.appendChild(card);
  });
}
input.addEventListener("input", () => {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(refreshPreview, 250);
});
durationInput.addEventListener("input", () => {
  $("duration-display").textContent = durationInput.value;
  store.set("duck_racer_duration_v2", durationInput.value);
});
$("reroll-btn").addEventListener("click", () => {
  cosmeticSeed = randomSeed();
  store.set("duck_racer_looks", String(cosmeticSeed));
  refreshPreview();
  sfx.quack({ pitch: 1.2 });
});
$("start-btn").addEventListener("click", startRace);

function show(screen: "setup" | "hud" | "results") {
  const wipe = $("wipe");
  if (!reducedMotion) {
    wipe.classList.remove("go");
    void wipe.offsetWidth;
    wipe.classList.add("go");
  }
  $("setup").hidden = screen !== "setup";
  $("hud").hidden = screen !== "hud";
  $("results").hidden = screen !== "results";
}

function enterSetup() {
  token++;
  phase = "setup";
  paused = false;
  show("setup");
  commentary.reset();
  refreshPreview();
  director.request({ kind: "lineup", priority: 10, hold: 0, max: Infinity }, true);
  music.setMode("menu");
}

/* ---------- Race flow ---------- */
function startRace() {
  mixer.resume();
  const names = parseNames();
  if (names.length < 2) {
    toast("Add at least 2 summoners");
    input.focus();
    return;
  }
  store.set("duck_racer_names", names.join("\n"));
  beginRace({ names, duration: Number(durationInput.value) || 30, mode, seed: randomSeed(), cosmeticSeed });
}

function beginRace(cfg: RaceConfig) {
  const my = ++token;
  race = new Race(cfg);
  raceView.setRace(race);
  world.setLanes(race.racers.length);
  chat.reset();
  commentary.reset();
  buildMinimap(race);
  show("hud");
  $("mode-label").textContent = MODE_LABEL[cfg.mode];
  $("replay-banner").hidden = true;
  $("photo-finish").hidden = true;
  $("killfeed").innerHTML = "";
  setPaused(false);
  simAcc = 0;
  slowmo = 1;
  freezeUntil = 0;
  winnerAt = -1;
  finishShotDone = false;
  skipped = false;
  tensionBump = 0;
  stage.grade.uniforms.uDesat.value = 0;
  phase = "intro";
  music.setMode("race");
  music.setTension(0.1);
  director.request({ kind: "establish", priority: 10, hold: 99, max: 99 }, true);
  commentary.intro();
  sfx.crowd(0.8);
  setTimeout(() => my === token && runCountdown(my), reducedMotion ? 800 : 3400);
}

function runCountdown(my: number) {
  phase = "countdown";
  director.request({ kind: "lineup", priority: 10, hold: 99, max: 99 }, true);
  const el = $("countdown");
  el.hidden = false;
  const steps = ["3", "2", "1", "QUACK!"];
  steps.forEach((s, i) =>
    setTimeout(() => {
      if (my !== token) return;
      el.innerHTML = `<div class="cd${i === 3 ? " go" : ""}"><span>${s}</span></div>`;
      sfx.count(i < 3 ? 1 : 0);
      if (i === 3) {
        setTimeout(() => (el.hidden = true), 700);
        phase = "racing";
        commentary.setRacing(true);
        director.request({ kind: defaultShot(), priority: 0, hold: 1, max: Infinity }, true);
        handleEvents(race!.drain(), true);
      }
    }, i * 850),
  );
}

const defaultShot = (): ShotKind => (reducedMotion ? "side" : "chase");

function cheer(id: number) {
  if (phase !== "racing" || paused || !race) return;
  const r = race.racers[id];
  if (!r) return;
  if (r.cheered || !race.cheer(id)) {
    toast(r.finished ? `${r.name} already finished` : `Already cheered ${r.name}`);
    return;
  }
  chat.crowd(r.name);
}

function stepRace(dt: number) {
  if (!race) return;
  const speedMult = Number($<HTMLInputElement>("speed-input").value) || 1;
  let scale = speedMult * slowmo;
  if (performance.now() < freezeUntil) scale = 0;
  else if (freezeUntil) {
    freezeUntil = 0;
    $("photo-finish").hidden = true;
  }
  simAcc += dt * scale;
  let n = 0;
  while (simAcc >= DT && !race.done && n < 24) {
    race.step();
    simAcc -= DT;
    n++;
    handleEvents(race.drain(), true);
  }

  const [a, b] = race.standings;
  const close = !a.finished && b && a.x > L - 9 && Math.abs(a.x - b.x) < 1.6 && !reducedMotion;
  slowmo += ((close ? 0.35 : 1) - slowmo) * Math.min(1, dt * 6);
  const desat = performance.now() < freezeUntil ? 0.85 : 0;
  stage.grade.uniforms.uDesat.value += (desat - stage.grade.uniforms.uDesat.value) * Math.min(1, dt * 8);

  if (!finishShotDone && a.x > L - 26) {
    finishShotDone = true;
    director.request({ kind: "finish", priority: 7, hold: 4, max: 9 });
  }

  // once the winner is in, don't make everyone wait for the stragglers
  if (winnerAt > 0 && visTime - winnerAt > 2.8 && !race.done) {
    race.runToEnd();
    race.drain();
  }
  if (race.done && phase === "racing") onRaceDone();
}

function handleEvents(events: TimedEvent[], live: boolean) {
  const r = race!;
  for (const e of events) {
    raceView.onEvent(e);
    playSfx(e);
    if (!live) continue;
    commentary.onEvent(e, r);
    chat.onEvent(e, r);
    directorFor(e, r);
    calloutFor(e, r);
    feedFor(e, r);
    if (["SPELL_HIT", "BARON_HONK", "BARON_TAKEN", "DRAGON_TAKEN", "COMEBACK", "LEAD_CHANGE"].includes(e.type)) tensionBump = Math.min(0.4, tensionBump + 0.15);
    if (e.type === "FINISH" && e.place === 1) {
      winnerAt = visTime;
      if (!reducedMotion) stage.grade.uniforms.uFlash.value = 0.4;
    }
    if (e.type === "FINAL_STRETCH") music.setFinalStretch(true);
    if (e.type === "CLOSE_FINISH" && !reducedMotion) {
      freezeUntil = performance.now() + 1700;
      $("photo-finish").hidden = false;
      $("photo-margin").textContent = `by ${e.margin.toFixed(3)}s`;
      director.request({ kind: "finish", priority: 9, hold: 2, max: 4 }, true);
    }
  }
}

function playSfx(e: TimedEvent) {
  switch (e.type) {
    case "SPELL_HIT": e.spell === "ice" ? sfx.ice() : sfx.fire(); break;
    case "BLOCK": sfx.block(); break;
    case "SPELL_DODGE": sfx.portal(); break;
    case "POWERUP":
      if (e.kind === "bread") { sfx.pop(); sfx.quack({ pitch: 1.3 }); }
      if (e.kind === "anchor") { sfx.thunk(); sfx.splash(0.4); }
      if (e.kind === "shield") sfx.block();
      if (e.kind === "portal") sfx.portal();
      break;
    case "SURGE": if (Math.random() < 0.3) sfx.quack({ pitch: 1 + Math.random() * 0.4, vol: 0.18 }); break;
    case "CHEER": sfx.crowd(0.6); sfx.quack({ pitch: 1.4 }); break;
    case "FIRST_BLOOD": sfx.sting(); break;
    case "TURRET_HIT": sfx.thunk(); break;
    case "DRAGON_SPAWN": sfx.roar(); break;
    case "DRAGON_TAKEN": sfx.sting(); sfx.crowd(0.7); break;
    case "BARON_SPAWN": sfx.splash(0.5); break;
    case "BARON_HONK": sfx.honk(); break;
    case "OBJECTIVE_FIGHT": sfx.thunk(); sfx.quack({ pitch: 1.5, vol: 0.4 }); sfx.crowd(0.5); break;
    case "DRAGON_BREATH": sfx.fire(); sfx.roar(); break;
    case "BARON_TAKEN": sfx.sting(); sfx.crowd(1); break;
    case "SHORTCUT_ENTER": sfx.splash(0.3); break;
    case "SHORTCUT_RESULT": e.success ? sfx.crowd(0.6) : sfx.thunk(); break;
    case "FINISH":
      if (e.place === 1) { sfx.win(); music.fanfare(); sfx.crowd(1.5); }
      else sfx.tone(620 + Math.min(e.place, 8) * 30, "sine", 0.12, 0.06);
      break;
  }
}

function directorFor(e: TimedEvent, r: Race) {
  switch (e.type) {
    case "SPELL_HIT":
      director.addShake(0.3);
      stage.grade.uniforms.uAberration.value = 1;
      if (r.rankOf(e.target) < 3 || Math.random() < 0.35) director.request({ kind: "action", focus: [e.target], priority: 3, hold: 1.0, max: 1.7 });
      break;
    case "BLOCK": director.request({ kind: "action", focus: [e.target], priority: 3, hold: 0.9, max: 1.4 }); break;
    case "DRAGON_SPAWN": {
      director.addShake(0.4);
      director.request({ kind: "objective", point: objectivesView.dragonPos(new THREE.Vector3()), priority: 3, hold: 1.5, max: 2.3 });
      break;
    }
    case "DRAGON_TAKEN": director.request({ kind: "action", focus: [e.racer], priority: 4, hold: 1.2, max: 1.9 }); break;
    case "BARON_SPAWN": director.request({ kind: "objective", point: objectivesView.baronHeadPos(new THREE.Vector3()), priority: 4, hold: 1.4, max: 2.2 }); break;
    case "BARON_HONK": director.addShake(0.7); stage.grade.uniforms.uAberration.value = 0.9; break;
    case "BARON_TAKEN": director.request({ kind: "action", focus: [e.racer], priority: e.steal ? 6 : 4, hold: 1.3, max: 2 }); break;
    case "OBJECTIVE_FIGHT":
      director.request({
        kind: "objective",
        point: e.objective === "dragon" ? objectivesView.dragonPos(new THREE.Vector3()) : objectivesView.baronHeadPos(new THREE.Vector3()).setY(1),
        priority: 4, hold: 2.2, max: 3.2,
      });
      break;
    case "DRAGON_BREATH":
      director.addShake(0.35);
      director.request({ kind: "action", focus: [e.target], priority: 3, hold: 1.0, max: 1.6 });
      break;
    case "SHORTCUT_ENTER": director.request({ kind: "action", focus: [e.racer], priority: 3, hold: 1.4, max: 2.2 }); break;
    case "SHORTCUT_RESULT": director.request({ kind: "action", focus: [e.racer], priority: 4, hold: 1.0, max: 1.6 }); break;
    case "COMEBACK": director.request({ kind: "action", focus: [e.racer], priority: 4, hold: 1.2, max: 1.8 }); break;
    case "FIRST_BLOOD": director.request({ kind: "action", focus: [e.racer], priority: 3, hold: 1, max: 1.4 }); break;
    case "FINAL_STRETCH": director.request({ kind: "front", priority: 5, hold: 2, max: 3.5 }); break;
    case "TURRET_HIT": director.addShake(0.15); break;
    case "FINISH": if (e.place === 1) director.addShake(0.5); break;
  }
}

let lastCallout = 0;
function callout(text: string, sub = "", tone: "" | "red" | "purple" | "teal" = "", force = false, icon: IconName = "crown", who?: Racer) {
  const now = performance.now();
  if (!force && now - lastCallout < 1300) return;
  lastCallout = now;
  const el = $("callout");
  el.className = "callout";
  void el.offsetWidth;
  el.innerHTML = `<div class="co-band"><div class="co-icon">${ICON[icon]}</div><div class="co-title"></div>${sub ? `<div class="co-sub">${who ? `<img src="${portraitOf(who)}" alt="">` : ""}<span></span></div>` : ""}</div>`;
  el.querySelector(".co-title")!.textContent = text;
  if (sub) el.querySelector(".co-sub span")!.textContent = sub;
  el.classList.add("show");
  if (tone) el.classList.add(tone);
}

function killfeed(a: Racer | null, icon: IconName, b: Racer | null, text: string, color: string) {
  const feed = $("killfeed");
  const row = document.createElement("div");
  row.className = "kf";
  row.style.setProperty("--kf", color);
  const face = (r: Racer) => `<img src="${portraitOf(r)}" alt="" style="--ring:${hueCss(r)}">`;
  row.innerHTML = `${a ? face(a) : ""}<span class="kf-icon">${ICON[icon]}</span>${b ? face(b) : ""}<span class="kf-text"></span>`;
  row.querySelector(".kf-text")!.textContent = text;
  feed.prepend(row);
  while (feed.childElementCount > 5) feed.lastElementChild?.remove();
  setTimeout(() => {
    row.classList.add("out");
    setTimeout(() => row.remove(), 400);
  }, 5200);
}

function feedFor(e: TimedEvent, r: Race) {
  const d = (id: number) => r.racers[id];
  switch (e.type) {
    case "SPELL_HIT": killfeed(d(e.caster), e.spell === "ice" ? "ice" : "fire", d(e.target), e.spell === "ice" ? "Frozen" : "Ignited", e.spell === "ice" ? "#7cc8ff" : "#ff8a3d"); break;
    case "BLOCK": killfeed(d(e.caster), "shield", d(e.target), "Blocked", "#0ac8b9"); break;
    case "FIRST_BLOOD": killfeed(d(e.racer), "sword", null, "First Blood", "#ff6b81"); break;
    case "DRAGON_TAKEN": killfeed(d(e.racer), "dragon", null, `${e.steal ? "Stole " : ""}${ELEMENT_NAMES[e.element]} Drake`, "#c084fc"); break;
    case "DRAGON_BREATH": killfeed(d(e.racer), "fire", d(e.target), "Drake breath", "#ff8a3d"); break;
    case "OBJECTIVE_FIGHT": killfeed(d(e.racer), e.objective === "dragon" ? "dragon" : "goose", null, "Brawling", "#c084fc"); break;
    case "BARON_TAKEN": killfeed(d(e.racer), "goose", null, e.steal ? "Baron stolen" : "Baron", "#a855f7"); break;
    case "TURRET_HIT": killfeed(null, "tower", d(e.racer), "Turret shot", "#c8aa6e"); break;
    case "POWERUP": if (e.kind === "portal" || e.kind === "anchor") killfeed(d(e.racer), e.kind, null, e.kind === "portal" ? "Blink" : "Anchored", "#c8aa6e"); break;
    case "CHEER": killfeed(d(e.racer), "cheer", null, "Crowd cheer", "#0ac8b9"); break;
    case "FINISH": if (e.place === 1) killfeed(d(e.racer), "crown", null, "Nexus destroyed", "#f0e6d2"); break;
  }
}

function calloutFor(e: TimedEvent, r: Race) {
  const d = (id: number) => r.racers[id];
  switch (e.type) {
    case "FIRST_BLOOD": callout("First Blood", d(e.racer).name, "red", false, "sword", d(e.racer)); break;
    case "DRAGON_TAKEN": callout(e.steal ? "Drake Stolen" : `${ELEMENT_NAMES[e.element]} Drake`, `${e.steal ? "snatched" : "slain"} by ${d(e.racer).name}`, "purple", e.steal, "dragon", d(e.racer)); break;
    case "OBJECTIVE_FIGHT": if (r.objectives[e.objective].fighters.length === 1) callout(e.objective === "dragon" ? "Drake Fight" : "Baron Fight", d(e.racer).name, "purple", false, e.objective === "dragon" ? "dragon" : "goose", d(e.racer)); break;
    case "BARON_HONK": callout("Honk!", "Baron Goose strikes", "purple", false, "goose"); break;
    case "BARON_TAKEN": callout(e.steal ? "Baron Stolen" : "Baron Slain", d(e.racer).name, "purple", e.steal, "goose", d(e.racer)); break;
    case "COMEBACK": callout("Comeback", d(e.racer).name, "teal", false, "comeback", d(e.racer)); break;
    case "SHORTCUT_RESULT": if (e.success) callout("Jungle Gambit", d(e.racer).name, "teal", false, "jungle", d(e.racer)); break;
    case "FINAL_STRETCH": callout("Final Stretch", "", "", false, "flag"); break;
    case "FINISH": if (e.place === 1) callout("Victory", d(e.racer).name, "", true, "crown", d(e.racer)); break;
  }
}

function onRaceDone() {
  if (!race) return;
  phase = "outro";
  commentary.setRacing(false);
  saveRecord(race.finishOrder[0]);
  highlights = pickHighlights(race.events, race.config.names, race.config.duration);
  const my = token;
  setTimeout(() => {
    if (my !== token) return;
    if (!reducedMotion && !skipped && highlights.length) startReplay();
    else showResults();
  }, 1600);
}

/* ---------- Replay ---------- */
function startReplay() {
  if (!race) return;
  token++;
  phase = "replay";
  show("hud");
  setPaused(false);
  replayIdx = 0;
  replayRace = new Race(race.config, race.inputs);
  raceView.setRace(replayRace);
  raceView.setLabelsVisible(true);
  commentary.reset();
  music.setMode("results");
  $("countdown").hidden = true;
  $("photo-finish").hidden = true;
  stage.grade.uniforms.uDesat.value = 0.25;
  prepareHighlight();
}

function prepareHighlight() {
  const h = highlights[replayIdx];
  const rr = replayRace!;
  while (rr.tick < h.startTick && !rr.done) rr.step();
  rr.drain();
  vfx.clear();
  water.clearWake();
  simAcc = 0;
  $("replay-banner").hidden = false;
  $("replay-label").textContent = `${replayIdx + 1}/${highlights.length} · ${h.label}`;
  director.request({ kind: "replay", focus: [h.focus], priority: 10, hold: 99, max: 99 }, true);
  sfx.sting();
}

function stepReplay(dt: number) {
  const rr = replayRace!;
  const h = highlights[replayIdx];
  const nearEvent = Math.abs(rr.tick - h.tick) < 20;
  simAcc += dt * (nearEvent ? 0.3 : 0.6);
  while (simAcc >= DT && !rr.done) {
    rr.step();
    simAcc -= DT;
    for (const e of rr.drain()) {
      raceView.onEvent(e);
      playSfx(e);
    }
  }
  if (rr.tick >= h.endTick || rr.done) {
    replayIdx++;
    if (replayIdx < highlights.length) prepareHighlight();
    else finishReplay();
  }
}

function finishReplay() {
  $("replay-banner").hidden = true;
  stage.grade.uniforms.uDesat.value = 0;
  if (race) raceView.setRace(race);
  showResults();
}

$("replay-skip").addEventListener("click", finishReplay);

/* ---------- Results ---------- */
function saveRecord(winner: Racer) {
  if (winner.finishTime < 0) return;
  const best = parseFloat(store.get("duck_racer_best") ?? "") || Infinity;
  if (winner.finishTime < best) {
    store.set("duck_racer_best", String(winner.finishTime));
    store.set("duck_racer_best_player", winner.name);
  }
}

function showResults() {
  if (!race) return;
  token++;
  phase = "results";
  setPaused(false);
  show("results");
  commentary.reset();
  raceView.showPodium(race.finishOrder);
  director.request({ kind: "podium", priority: 10, hold: 999, max: Infinity }, true);
  music.setMode("results");
  vfx.confettiBurst(PODIUM.x, PODIUM.y + 8, PODIUM.z, 260);
  renderResults();
}

function renderResults() {
  if (!race) return;
  const order = race.finishOrder;
  $("victory-name").textContent = order[0].name;
  ($("victory-portrait") as HTMLImageElement).src = portraitOf(order[0]);
  const best = store.get("duck_racer_best");
  $("best-record-display").textContent = best ? `${parseFloat(best).toFixed(2)}s by ${store.get("duck_racer_best_player")}` : "--";
  const { blue, red } = splitTeams(order, teamMode, swapSides);
  const fill = (ul: HTMLElement, team: typeof blue) => {
    ul.innerHTML = "";
    team.forEach(({ item: r, rank }, i) => {
      const li = document.createElement("li");
      if (rank === 1) li.className = "first";
      li.style.setProperty("--i", String(i));
      const time = r.finishTime >= 0 ? `${r.finishTime.toFixed(2)}s` : "DNF";
      li.innerHTML = `<span class="t-rank">${rank}</span><img class="t-portrait" alt=""><span class="t-name"></span><span class="t-time">${rank === 1 ? ICON.crown : ""}${time}</span>`;
      const img = li.querySelector(".t-portrait") as HTMLImageElement;
      img.src = portraitOf(r);
      img.style.setProperty("--ring", hueCss(r));
      li.querySelector(".t-name")!.textContent = r.name;
      ul.appendChild(li);
    });
  };
  fill($("blue-team-list"), blue);
  fill($("red-team-list"), red);
  $("btn-alt").classList.toggle("active", teamMode === "alternating");
  $("btn-split").classList.toggle("active", teamMode === "split");
}

$("btn-alt").addEventListener("click", () => { teamMode = "alternating"; renderResults(); });
$("btn-split").addEventListener("click", () => { teamMode = "split"; renderResults(); });
$("btn-swap").addEventListener("click", () => { swapSides = !swapSides; renderResults(); });
$("btn-copy").addEventListener("click", async () => {
  if (!race) return;
  const { blue, red } = splitTeams(race.finishOrder, teamMode, swapSides);
  const text = teamsText(blue.map((x) => x.item.name), red.map((x) => x.item.name));
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("Copied teams!");
});
$("btn-share").addEventListener("click", async () => {
  if (!race) return;
  // grab the podium view straight after a render (no preserveDrawingBuffer needed)
  stage.render();
  const src = stage.renderer.domElement;
  const snap = document.createElement("canvas");
  snap.width = src.width;
  snap.height = src.height;
  snap.getContext("2d")!.drawImage(src, 0, 0);
  const { blue, red } = splitTeams(race.finishOrder, teamMode, swapSides);
  const blob = await renderShareCard({
    snapshot: snap,
    order: race.finishOrder,
    blue: blue.map((x) => x.item.name),
    red: red.map((x) => x.item.name),
    mode: MODE_LABEL[race.config.mode],
    duration: race.config.duration,
  });
  let copied = false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    copied = true;
  } catch {
    /* clipboard images unsupported: download only */
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `duck-race-${race.finishOrder[0].name.replace(/[^\w-]+/g, "_")}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(copied ? "Share card copied + downloaded" : "Share card downloaded");
});
$("btn-replay").addEventListener("click", () => {
  if (!race) return;
  if (!highlights.length) highlights = pickHighlights(race.events, race.config.names, race.config.duration);
  if (highlights.length) startReplay();
  else toast("No highlights this time");
});
$("btn-rematch").addEventListener("click", () => {
  if (!race) return;
  mixer.resume();
  beginRace({ ...race.config, seed: randomSeed() });
});
$("btn-new").addEventListener("click", enterSetup);

/* ---------- HUD ---------- */
const minimap = $("minimap");
let mmDots: HTMLElement[] = [];
function buildMinimap(r: Race) {
  minimap.querySelectorAll(".mm-mark, .mm-dot, .mm-jungle").forEach((n) => n.remove());
  const mark = (frac: number, html: string, cls = "") => {
    const m = document.createElement("div");
    m.className = `mm-mark ${cls}`;
    m.style.left = `${frac * 100}%`;
    m.innerHTML = html;
    minimap.appendChild(m);
  };
  const o = r.objectives;
  if (o.enabled) {
    TURRET_FRACS.forEach((f) => mark(f, "", "mm-turret"));
    mark(o.dragon.x / L, ICON.dragon, "purple");
    mark(o.baron.x / L, ICON.goose, "purple");
    if (o.shortcut.racer !== null) {
      const j = document.createElement("div");
      j.className = "mm-jungle";
      j.style.left = `${(o.shortcut.start / L) * 100}%`;
      j.style.width = `${((o.shortcut.end - o.shortcut.start) / L) * 100}%`;
      minimap.appendChild(j);
    }
  }
  mark(1, ICON.crown, "nexus");
  mmDots = r.racers.map((d) => {
    const dot = document.createElement("div");
    dot.className = "mm-dot";
    dot.style.background = hueCss(d);
    dot.title = d.name;
    minimap.appendChild(dot);
    return dot;
  });
  buildStandings(r);
}

let stRows: { row: HTMLElement; rank: HTMLElement; info: HTMLElement }[] = [];
function buildStandings(r: Race) {
  const box = $("standings");
  box.innerHTML = `<div class="st-head">Standings</div>`;
  stRows = r.racers.map((d) => {
    const row = document.createElement("div");
    row.className = "st-row";
    row.innerHTML = `<span class="st-rank"></span><img class="st-portrait" alt=""><span class="st-name"></span><span class="st-info"></span>`;
    const img = row.querySelector("img") as HTMLImageElement;
    img.src = portraitOf(d);
    img.style.setProperty("--ring", hueCss(d));
    row.querySelector(".st-name")!.textContent = d.name;
    box.appendChild(row);
    return { row, rank: row.querySelector(".st-rank") as HTMLElement, info: row.querySelector(".st-info") as HTMLElement };
  });
}

const STATUS_ICON: Partial<Record<string, [IconName, string]>> = {
  frozen: ["ice", "s-frozen"], ignite: ["fire", "s-ignite"], boost: ["boost", "s-boost"], stumble: ["stumble", "s-stumble"],
};

let hudTimer = 0;
function updateHud(dt: number, r: Race) {
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.066;
  $("timer").textContent = r.time.toFixed(2);
  const st = r.standings;
  const lead = st[0];
  $("leader-name").textContent = lead.name;
  const second = st[1];
  $("leader-gap").textContent = second && !lead.finished ? `+${Math.max(0, lead.x - second.x).toFixed(1)}m` : lead.finished ? "WINNER" : "";
  r.racers.forEach((d, i) => {
    const dot = mmDots[i];
    if (!dot) return;
    dot.style.left = `${Math.min(100, (d.x / L) * 100)}%`;
    dot.classList.toggle("lead", d === lead);
  });
  $("mm-fill").style.width = `${Math.min(100, (lead.x / L) * 100)}%`;
  st.forEach((d, i) => {
    const row = stRows[d.id];
    if (!row) return;
    row.row.style.order = String(i + 1);
    row.row.hidden = i >= 10;
    row.row.className = `st-row${i === 0 ? " lead" : ""}${d.finished ? " done" : ""}`;
    row.rank.textContent = String(i + 1);
    const s = STATUS_ICON[d.state] ?? (d.shield ? (["shield", "s-shield"] as [IconName, string]) : null);
    const status = s ? `<span class="${s[1]}">${ICON[s[0]]}</span>` : "";
    const info = d.finished ? (d.finishTime >= 0 ? `${d.finishTime.toFixed(2)}s` : "DNF") : i === 0 ? "" : `-${(lead.x - d.x).toFixed(1)}m`;
    const html = status + info;
    if (row.info.dataset.v !== html) {
      row.info.dataset.v = html;
      row.info.innerHTML = html;
    }
  });
}


function setPaused(p: boolean) {
  paused = p;
  $("pause-overlay").hidden = !p;
  $("pause-btn").innerHTML = p ? ICON.play : ICON.pause;
}
$("pause-btn").addEventListener("click", () => {
  if (phase === "racing" || phase === "replay") setPaused(!paused);
});
$("skip-btn").addEventListener("click", () => {
  if (!race) return;
  if (phase === "replay") return finishReplay();
  if (!["intro", "countdown", "racing"].includes(phase)) return;
  skipped = true;
  token++;
  $("countdown").hidden = true;
  race.runToEnd();
  race.drain();
  saveRecord(race.finishOrder[0]);
  highlights = pickHighlights(race.events, race.config.names, race.config.duration);
  showResults();
});
$<HTMLInputElement>("speed-input").addEventListener("input", (e) => {
  $("speed-label").textContent = `${Number((e.target as HTMLInputElement).value).toFixed(2)}x`;
});
$<HTMLInputElement>("chat-freq-input").addEventListener("input", (e) => {
  chat.rate = Number((e.target as HTMLInputElement).value);
  $("chat-freq-label").textContent = `${chat.rate.toFixed(1)}s`;
});
$("spectator-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const el = $<HTMLInputElement>("spectator-input");
  const text = el.value.trim();
  if (text) chat.add("Spectator", text, "#e2e8f0");
  el.value = "";
});

window.addEventListener("keydown", (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (e.code === "Space" && !typing && (phase === "racing" || phase === "replay")) {
    e.preventDefault();
    setPaused(!paused);
  }
});

/* ---------- Settings ---------- */
const muteBtn = $("mute-btn");
const syncMute = () => {
  muteBtn.innerHTML = mixer.muted ? ICON.mute : ICON.sound;
  muteBtn.setAttribute("aria-label", mixer.muted ? "Unmute" : "Mute");
};
muteBtn.addEventListener("click", () => {
  mixer.setMuted(!mixer.muted);
  syncMute();
});
syncMute();
const settings = $("settings");
$("settings-btn").addEventListener("click", () => {
  settings.hidden = !settings.hidden;
  $("settings-btn").setAttribute("aria-expanded", String(!settings.hidden));
});
for (const bus of ["music", "sfx", "casters"] as Bus[]) {
  const el = $<HTMLInputElement>(`vol-${bus}`);
  el.value = String(mixer.volumes[bus]);
  el.addEventListener("input", () => mixer.setVolume(bus, Number(el.value)));
}
const voiceBox = $<HTMLInputElement>("caster-voice");
voiceBox.checked = store.get("duck_racer_voice") !== "off";
commentary.voice = voiceBox.checked;
voiceBox.addEventListener("change", () => {
  commentary.voice = voiceBox.checked;
  store.set("duck_racer_voice", voiceBox.checked ? "on" : "off");
});
const motionBox = $<HTMLInputElement>("reduce-motion");
const applyMotion = () => {
  motionBox.checked = reducedMotion;
  document.body.classList.toggle("reduced-motion", reducedMotion);
  director.calm = reducedMotion;
};
motionBox.addEventListener("change", () => {
  reducedMotion = motionBox.checked;
  store.set("duck_racer_motion", reducedMotion ? "reduced" : "full");
  applyMotion();
  if (phase === "racing") director.request({ kind: defaultShot(), priority: 0, hold: 1, max: Infinity }, true);
});
applyMotion();
const qualitySel = $<HTMLSelectElement>("quality-input");
qualitySel.value = qualityPref;
qualitySel.addEventListener("change", () => {
  store.set("duck_racer_quality", qualitySel.value);
  location.reload();
});

let toastTimer = 0;
function toast(msg: string) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), 1800);
}

// browsers start audio suspended until a gesture
window.addEventListener("pointerdown", () => mixer.resume(), { once: true });
window.addEventListener("keydown", () => mixer.resume(), { once: true });

/* ---------- Main loop ---------- */
let last = performance.now();
let perfWindow: number[] = [];
let degraded = false;
const tmpV = new THREE.Vector3();

function frame(now: number) {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = paused ? 0 : realDt;
  visTime += dt;

  if (phase === "racing" && !paused) stepRace(realDt);
  if (phase === "replay" && !paused) stepReplay(realDt);

  const active = phase === "replay" ? replayRace : race;
  const alpha = phase === "racing" || phase === "replay" ? simAcc / DT : 1;
  if (active) raceView.sync(Math.min(1, alpha), visTime, dt);

  // tension drives the music and the crowd
  let tension = 0.1;
  if (race && phase === "racing") {
    const [a, b] = race.standings;
    const gap = b ? Math.abs(a.x - b.x) : 30;
    tension = 0.12 + 0.6 * (1 - Math.min(1, gap / 14)) * (0.3 + 0.7 * (a.x / L)) + tensionBump;
    tensionBump = Math.max(0, tensionBump - realDt * 0.08);
    music.setTension(tension);
    updateHud(realDt, race);
    chat.update(dt, race);
  }
  if (phase === "replay" && replayRace) updateHud(realDt, replayRace);

  const turretTime = active?.time ?? visTime;
  const turretStates = active?.objectives.enabled ? active.objectives.turrets.map((t) => turretActive(t, turretTime)) : [false, false, false];
  world.update(visTime, turretStates, phase === "results" ? 0.8 : tension);
  water.update(visTime);
  clouds.time.value = visTime;
  motes.update(visTime, director.lookAt.x);
  vfx.update(dt);
  vfx.setViewportHeight(stage.height);
  stage.grade.uniforms.uAberration.value *= Math.exp(-realDt * 6);
  stage.grade.uniforms.uFlash.value *= Math.exp(-realDt * 3.5);

  if (active) {
    const st = active.standings;
    const leader = st.find((d) => !d.finished) ?? st[0];
    director.update(realDt, visTime, {
      duckPos: (id, out) => raceView.duckPos(id, out),
      leaderId: leader.id,
      pack: st.filter((d) => !d.finished).slice(0, 3).map((d) => d.id),
      podium: PODIUM,
    }, phase === "racing" ? defaultShot() : director.current.kind);
  }
  stage.followShadow(tmpV.copy(director.lookAt));

  commentary.update(realDt, phase === "racing" ? race : null);
  stage.render();

  // auto quality: if frames are consistently slow, drop to the cheap path once
  if (qualityPref === "auto" && !degraded) {
    perfWindow.push(realDt);
    if (perfWindow.length > 180) {
      const avg = perfWindow.reduce((a, b) => a + b, 0) / perfWindow.length;
      perfWindow = [];
      if (avg > 0.034) {
        degraded = true;
        stage.degrade();
      }
    }
  }
  requestAnimationFrame(frame);
}

enterSetup();
// compile every shader in parallel up front (KHR_parallel_shader_compile) instead of stalling the first frame
if (import.meta.env.DEV) (window as unknown as { __duck: unknown }).__duck = { stage, world, water, raceView, portraits, get race() { return race; } };
const compileStart = performance.now();
await stage.renderer.compileAsync(stage.scene, stage.camera).catch(() => undefined);
console.info(`[duck-race] shaders ready in ${Math.round(performance.now() - compileStart)}ms`);
requestAnimationFrame((t) => {
  last = t;
  frame(t);
  $("loading").classList.add("done");
});
