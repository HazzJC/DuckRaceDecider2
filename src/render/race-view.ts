import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { Race } from "../sim/race";
import type { TimedEvent } from "../sim/events";
import type { Racer } from "../sim/types";
import { DuckModel, ELEMENT_COLORS, lookFromHue } from "./duck";
import { CHANNEL, L, RIVER_HALF, laneZ, waveHeight } from "./layout";
import type { VFX } from "./vfx";
import type { Water } from "./water";
import type { ObjectivesView } from "./objectives-view";
import { groundHeight } from "./world";
import { TURRET_FRACS, isFighting } from "../sim/objectives";
import { ICON } from "../ui/icons";

interface Projectile {
  mesh: THREE.Mesh;
  from: number;
  to: number;
  age: number;
  dur: number;
  color: string;
  onHit: () => void;
}

const projGeo = {
  ice: new THREE.OctahedronGeometry(0.32, 0).scale(1.9, 0.7, 0.7),
  fire: new THREE.IcosahedronGeometry(0.34, 2),
  arcane: new THREE.IcosahedronGeometry(0.28, 1),
};

interface DuckView {
  id: number;
  model: DuckModel;
  label: CSS2DObject;
  labelEl: HTMLDivElement;
  bar: HTMLElement;
  pos: THREE.Vector3;
  coast: number;
  baron: boolean;
}

export const PODIUM = new THREE.Vector3(L + 52, 0, RIVER_HALF + 14);

/** Owns the 3D ducks for a race and turns sim state + events into visuals. */
export class RaceView {
  readonly group = new THREE.Group();
  readonly podium = new THREE.Group();
  private ducks: DuckView[] = [];
  private race: Race | null = null;
  private podiumMode = false;
  private podiumBlocks: THREE.Mesh[] = [];
  private projectiles: Projectile[] = [];

  constructor(
    private vfx: VFX,
    private water: Water,
    private objectives: ObjectivesView,
    private onCheer: (id: number) => void,
  ) {
    PODIUM.y = Math.max(0.3, groundHeight(PODIUM.x, PODIUM.z));
    this.buildPodium();
    this.group.add(this.podium);
  }

  private buildPodium() {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 10, 1.2, 40),
      new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.4, metalness: 0.5 }),
    );
    base.position.y = -0.4;
    base.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(9.05, 0.12, 8, 80), new THREE.MeshStandardMaterial({ color: "#d9b25a", emissive: "#d9b25a", emissiveIntensity: 1.5 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.2;
    this.podium.add(base, rim);
    const spec = [
      { h: 2.4, color: "#f5c542", z: 0 },
      { h: 1.6, color: "#cbd5e1", z: -2.6 },
      { h: 1.0, color: "#c47f3a", z: 2.6 },
    ];
    spec.forEach((s, i) => {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, s.h, 2.2),
        new THREE.MeshPhysicalMaterial({ color: s.color, metalness: 0.8, roughness: 0.25, clearcoat: 1 }),
      );
      b.position.set(0, s.h / 2 + 0.2, s.z);
      b.castShadow = b.receiveShadow = true;
      this.podiumBlocks.push(b);
      this.podium.add(b);
      // big place number on the front face
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const c = cv.getContext("2d")!;
      c.fillStyle = "#0f172a";
      c.font = "bold 96px Cinzel, Georgia, serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(String(i + 1), 64, 70);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const num = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      num.position.set(-1.11, s.h / 2 + 0.2, s.z);
      num.rotation.y = -Math.PI / 2;
      this.podium.add(num);
    });
    this.podium.position.copy(PODIUM);
  }

  setRace(race: Race) {
    this.race = race;
    this.podiumMode = false;
    for (const d of this.ducks) {
      this.group.remove(d.model.root);
      d.model.root.remove(d.label);
      d.labelEl.remove();
      d.model.dispose();
    }
    this.ducks = race.racers.map((r) => {
      const model = new DuckModel(lookFromHue(r.cosmetics.hue, r.cosmetics.hat, r.cosmetics.pattern));
      const el = document.createElement("div");
      el.className = "nameplate";
      el.innerHTML = `<div class="np-top"><span class="np-rank"></span><span class="np-name"></span><span class="np-buff"></span></div><div class="np-bar"><i></i></div>`;
      (el.querySelector(".np-name") as HTMLElement).textContent = r.name;
      el.style.setProperty("--duck", `hsl(${r.cosmetics.hue} 78% 60%)`);
      el.title = "Click to cheer (once per duck)";
      el.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        this.onCheer(r.id);
      });
      const label = new CSS2DObject(el);
      label.position.set(0, 2.25, 0);
      model.root.add(label);
      this.group.add(model.root);
      return { id: r.id, model, label, labelEl: el, bar: el.querySelector(".np-bar i") as HTMLElement, pos: new THREE.Vector3(), coast: 0, baron: false };
    });
    this.objectives.reset(race);
    for (const pr of this.projectiles) this.group.remove(pr.mesh);
    this.projectiles = [];
    this.vfx.clear();
    this.water.clearWake();
    this.sync(1, 0, 0);
  }

  duckPos(id: number, out: THREE.Vector3): THREE.Vector3 {
    const d = this.ducks[id];
    return d ? out.copy(d.pos) : out.set(0, 0, 0);
  }

  setLabelsVisible(v: boolean) {
    for (const d of this.ducks) d.label.visible = v;
  }

  /** Put the top three on the podium blocks and everyone else on the stage behind. */
  showPodium(order: Racer[]) {
    this.podiumMode = true;
    const blocks = [
      new THREE.Vector3(0, 2.6, 0),
      new THREE.Vector3(0, 1.8, -2.6),
      new THREE.Vector3(0, 1.2, 2.6),
    ];
    order.forEach((r, i) => {
      const d = this.ducks[r.id];
      if (i < 3) d.pos.copy(PODIUM).add(blocks[i]);
      else {
        const k = i - 3;
        d.pos.copy(PODIUM).add(new THREE.Vector3(3 + Math.floor(k / 5) * 1.8, 0.2, -4 + (k % 5) * 2));
      }
      d.model.root.position.copy(d.pos);
      d.model.root.rotation.y = Math.PI; // the podium camera looks down +x, so face -x
      d.model.setElement(null, false);
    });
    this.setLabelsVisible(true);
  }

  /** Map one sim racer to world position (alpha interpolates between sim ticks). */
  private target(r: Racer, alpha: number, time: number, out: THREE.Vector3) {
    const n = this.race!.racers.length;
    const x = r.prevX + (r.x - r.prevX) * alpha;
    const lz = laneZ(r.lane, n);
    const z = lz + (CHANNEL.z - lz) * smoothJ(r.jungle);
    return out.set(x, waveHeight(x, z, time), z);
  }

  sync(alpha: number, time: number, dt: number) {
    const race = this.race;
    if (!race) return;
    const avgSpeed = race.length / race.config.duration;
    const standings = race.standings;
    if (!this.podiumMode) this.water.beginWake(dt);

    for (const d of this.ducks) {
      const r = race.racers[d.id];
      if (this.podiumMode) {
        const place = r.place;
        d.model.animate(dt, time, "normal", 0, false, place === 1 ? "celebrate" : place <= 3 ? "idle" : "sad");
        if (place === 1) d.model.root.position.y = d.pos.y + d.model.body.position.y * 0.5;
        continue;
      }
      this.target(r, alpha, time, d.pos);
      if (r.finished) {
        // coast through the arch into the finish pool
        d.coast = Math.min(d.coast + dt * Math.max(2, 14 - d.coast), 22);
        d.pos.x += d.coast;
      } else d.coast = 0;
      d.model.root.position.copy(d.pos);
      d.model.root.rotation.y = r.jungle > 0.01 && r.jungle < 0.99 ? -0.4 * Math.sign(CHANNEL.z) : 0;

      const speedNorm = r.finished ? 0.4 : r.speed / avgSpeed;
      const fighting = isFighting(race, r);
      d.model.animate(dt, time, r.state, speedNorm, r.shield, fighting ? "fight" : "race");
      if (fighting && Math.random() < dt * 6) {
        this.vfx.splash(d.pos.x + 0.6, 0.2, d.pos.z, 0.35);
        this.vfx.sparkle(d.pos.x + 1.2, d.pos.y + 1.2, d.pos.z, "#f5d98b", 6, 3);
      }
      d.baron = r.baron;
      d.model.setElement(r.element, d.baron && !r.finished);

      if (dt > 0 && !r.finished && r.speed > 1) {
        this.water.stamp(d.pos.x - 0.7, d.pos.z, 0.35 + speedNorm * 0.15, 0.16 * Math.min(1.5, speedNorm));
        this.vfx.wake(d.pos.x - 0.9, d.pos.z, r.speed);
        if (r.state === "boost") this.vfx.boostTrail(d.pos.x - 0.8, d.pos.y + 0.6, d.pos.z, `hsl(${r.cosmetics.hue}, 90%, 65%)`);
      }
      // concentric ripples spreading from each duck
      if (dt > 0 && Math.random() < dt * 2.2) this.vfx.ring(d.pos.x - 0.3, 0.06, d.pos.z, "#cfeaff", 2.2, 1.4, false, 0.25);
      if (r.state === "ignite" && Math.random() < 0.6) this.vfx.embers(d.pos.x, d.pos.y + 0.8, d.pos.z);

      const rank = standings.indexOf(r) + 1;
      (d.labelEl.querySelector(".np-rank") as HTMLElement).textContent = String(rank);
      d.labelEl.classList.toggle("leader", rank === 1);
      d.labelEl.classList.toggle("cheered", r.cheered);
      d.labelEl.classList.toggle("fighting", fighting);
      d.bar.style.width = `${Math.min(100, (r.x / race.length) * 100).toFixed(1)}%`;
      const buff = d.labelEl.querySelector(".np-buff") as HTMLElement;
      const key = `${r.element ?? ""}${d.baron ? "b" : ""}`;
      if (buff.dataset.k !== key) {
        buff.dataset.k = key;
        buff.innerHTML =
          (r.element ? `<span style="color:${ELEMENT_COLORS[r.element]}">${ICON.dragon}</span>` : "") +
          (d.baron ? `<span style="color:#c084fc">${ICON.goose}</span>` : "");
      }
    }
    if (!this.podiumMode) this.water.endWake();
    this.updateProjectiles(dt);
    this.objectives.update(race, time, dt, (id, out) => this.duckPos(id, out));
  }

  /** Visual reaction to sim events. */
  onEvent(e: TimedEvent) {
    const race = this.race;
    if (!race) return;
    const p = (id: number) => this.ducks[id]?.pos ?? new THREE.Vector3();
    const tmp = new THREE.Vector3();
    switch (e.type) {
      case "SPELL_HIT": {
        const ice = e.spell === "ice";
        const color = ice ? "#7cc8ff" : "#ff7a1a";
        this.vfx.sigil(p(e.caster).x, p(e.caster).z, color, 3, 0.8);
        this.launch(e.caster, e.target, ice ? "ice" : "fire", color, () => {
          const t = p(e.target);
          this.vfx.sigil(t.x, t.z, color, 4.2, 1.3);
          if (ice) {
            this.vfx.iceShards(t.x, t.y + 0.8, t.z);
            this.vfx.sparkle(t.x, t.y + 1, t.z, "#e0f4ff", 40, 6);
          } else {
            for (let i = 0; i < 8; i++) this.vfx.embers(t.x, t.y + 0.6, t.z);
            this.vfx.sparkle(t.x, t.y + 0.8, t.z, "#ffb36b", 40, 6);
          }
          this.vfx.ring(t.x, 0.2, t.z, color, 3.5);
        });
        break;
      }
      case "BLOCK": {
        this.launch(e.caster, e.target, "arcane", "#22d3ee", () => {
          const t = p(e.target);
          this.vfx.ring(t.x, t.y + 0.6, t.z, "#22d3ee", 2.6, 0.5, true);
          this.vfx.sparkle(t.x, t.y + 0.7, t.z, "#a5f3fc", 60, 8);
        });
        break;
      }
      case "SPELL_DODGE": {
        const t = p(e.target);
        this.vfx.sparkle(t.x, t.y + 0.7, t.z, "#f8fafc", 30, 5);
        break;
      }
      case "POWERUP": {
        const t = p(e.racer);
        const color = { bread: "#facc15", anchor: "#94a3b8", shield: "#22d3ee", portal: "#a78bfa" }[e.kind];
        this.vfx.sparkle(t.x, t.y + 0.6, t.z, color, 30, 4);
        if (e.kind === "anchor") this.vfx.splash(t.x, 0.1, t.z, 1.4);
        else this.vfx.splash(t.x, 0.1, t.z, 0.6);
        if (e.kind === "portal") {
          this.vfx.ring(t.x, t.y + 0.7, t.z, color, 2, 0.6, true);
          this.vfx.ring(t.x - 20, t.y + 0.7, t.z, color, 2, 0.6, true);
        }
        break;
      }
      case "CHEER": {
        const t = p(e.racer);
        this.vfx.sigil(t.x, t.z, "#67e8f9", 3, 1);
        this.vfx.sparkle(t.x, t.y + 1.2, t.z, "#67e8f9", 40, 4);
        this.vfx.ring(t.x, 0.2, t.z, "#67e8f9", 3);
        break;
      }
      case "SURGE": {
        const t = p(e.racer);
        this.vfx.splash(t.x - 0.5, 0.1, t.z, 0.4);
        break;
      }
      case "FIRST_BLOOD": {
        const t = p(e.racer);
        this.vfx.ring(t.x, 0.2, t.z, "#ef4444", 7, 0.9);
        this.vfx.sigil(t.x, t.z, "#ff4d6d", 6, 1.6);
        this.vfx.pillar(t.x, t.z, "#ff4d6d", 16, 0.9, 1.1);
        this.vfx.sparkle(t.x, t.y + 1, t.z, "#f87171", 60, 7);
        break;
      }
      case "TURRET_HIT": {
        const t = p(e.racer);
        const side = t.z >= 0 ? 1 : -1;
        const tx = TURRET_FRACS[e.turret] * L, tz = side * (RIVER_HALF + 2.6);
        const from = new THREE.Vector3(tx, Math.max(groundHeight(tx, tz), 0) + 8.6, tz);
        const col = side < 0 ? "#7fb2ff" : "#ff8a9a";
        this.vfx.beam(from, tmp.copy(t).setY(t.y + 0.7), col, 0.22, 0.4);
        this.vfx.sigil(t.x, t.z, col, 2.6, 0.7);
        this.vfx.sparkle(t.x, t.y + 0.8, t.z, col, 30, 5);
        this.vfx.splash(t.x, 0.1, t.z, 0.8);
        break;
      }
      case "DRAGON_SPAWN": {
        this.objectives.dragonPos(tmp);
        this.vfx.splash(e.x, 0.2, laneZ(e.lane, race.racers.length), 3);
        this.vfx.ring(e.x, 0.2, laneZ(e.lane, race.racers.length), "#c084fc", 8, 1.2);
        this.vfx.sigil(e.x, laneZ(e.lane, race.racers.length), "#c084fc", 9, 3);
        break;
      }
      case "DRAGON_TAKEN": {
        const t = p(e.racer);
        const col = ELEMENT_COLORS[e.element];
        this.vfx.sparkle(t.x, t.y + 1.5, t.z, col, 120, 9);
        this.vfx.ring(t.x, 0.3, t.z, col, 9, 1.1);
        this.vfx.pillar(t.x, t.z, col, 28, 1.4, 1.6);
        this.vfx.sigil(t.x, t.z, col, 7, 2);
        break;
      }
      case "BARON_SPAWN": {
        this.objectives.baronHeadPos(tmp);
        this.vfx.splash(tmp.x, 0.3, tmp.z, 2.5);
        break;
      }
      case "BARON_HONK": {
        this.objectives.honk();
        this.objectives.baronHeadPos(tmp);
        for (let i = 0; i < 3; i++) setTimeout(() => this.vfx.ring(tmp.x, 0.4, tmp.z, "#c084fc", 26, 1.4), i * 160);
        for (const id of e.affected) {
          const t = p(id);
          this.vfx.splash(t.x, 0.1, t.z, 0.8);
        }
        break;
      }
      case "OBJECTIVE_FIGHT": {
        const t = p(e.racer);
        const col = e.objective === "dragon" ? "#c084fc" : "#a855f7";
        this.vfx.sigil(t.x, t.z, col, 3.2, 1.2);
        this.vfx.splash(t.x + 0.5, 0.2, t.z, 1.2);
        break;
      }
      case "DRAGON_BREATH": {
        const t = p(e.target);
        const col = ELEMENT_COLORS[e.element];
        const mouth = this.objectives.dragonMouth(new THREE.Vector3());
        this.vfx.beam(mouth, tmp.copy(t).setY(t.y + 0.6), col, 0.55, 0.7);
        this.vfx.beam(mouth, tmp.copy(t).setY(t.y + 0.6), "#ffffff", 0.18, 0.5);
        this.vfx.sigil(t.x, t.z, col, 3.6, 1.2);
        for (let i = 0; i < 6; i++) this.vfx.embers(t.x, t.y + 0.6, t.z);
        this.vfx.sparkle(t.x, t.y + 0.8, t.z, col, 50, 6);
        break;
      }
      case "BARON_TAKEN": {
        const t = p(e.racer);
        this.vfx.sparkle(t.x, t.y + 1.5, t.z, "#c084fc", 140, 10);
        this.vfx.ring(t.x, 0.3, t.z, "#a855f7", 10, 1.2);
        this.vfx.pillar(t.x, t.z, "#a855f7", 34, 1.8, 2);
        this.vfx.sigil(t.x, t.z, "#c084fc", 8, 2.2);
        break;
      }
      case "SHORTCUT_RESULT": {
        const t = p(e.racer);
        this.vfx.sparkle(t.x, t.y + 0.6, t.z, e.success ? "#86efac" : "#65a30d", 40, 4);
        break;
      }
      case "FINISH": {
        const t = p(e.racer);
        this.vfx.ring(L, 0.3, t.z, e.place === 1 ? "#facc15" : "#e2e8f0", e.place === 1 ? 10 : 4, 1);
        if (e.place === 1) {
          // the Nexus goes up
          this.vfx.pillar(L, 0, "#5eead4", 70, 5, 2.4);
          this.vfx.pillar(L, 0, "#f5d98b", 50, 2.2, 1.8);
          this.vfx.sigil(L, 0, "#5eead4", 30, 2.8, 0.2);
          for (let i = 0; i < 4; i++) setTimeout(() => this.vfx.ring(L, 8, 0, i % 2 ? "#f5d98b" : "#5eead4", 28, 1.2, true), i * 140);
          this.vfx.confettiBurst(L, 14, 0, 420);
          for (let i = 0; i < 5; i++)
            setTimeout(() => this.vfx.sparkle(L + Math.random() * 10, 16 + Math.random() * 8, (Math.random() - 0.5) * 30, `hsl(${Math.random() * 360},90%,65%)`, 90, 12), i * 250);
        }
        break;
      }
    }
  }

  /** Fire a glowing missile from one duck to another; it tracks the moving target and calls onHit on arrival. */
  private launch(from: number, to: number, kind: keyof typeof projGeo, color: string, onHit: () => void) {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 4, roughness: 0.2, transparent: true });
    const mesh = new THREE.Mesh(projGeo[kind], mat);
    this.group.add(mesh);
    const dist = this.ducks[from] && this.ducks[to] ? this.ducks[from].pos.distanceTo(this.ducks[to].pos) : 10;
    this.projectiles.push({ mesh, from, to, age: 0, dur: Math.min(0.55, 0.18 + dist * 0.012), color, onHit });
  }

  private updateProjectiles(dt: number) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    this.projectiles = this.projectiles.filter((pr) => {
      pr.age += dt;
      const k = Math.min(1, pr.age / pr.dur);
      this.duckPos(pr.from, a).y += 1.1;
      this.duckPos(pr.to, b).y += 0.8;
      const pos = a.lerp(b, k);
      pos.y += Math.sin(k * Math.PI) * 2.6;
      const prev = pr.mesh.position.clone();
      pr.mesh.position.copy(pos);
      if (prev.lengthSq() > 0) pr.mesh.lookAt(prev);
      pr.mesh.rotateZ(dt * 12);
      this.vfx.boostTrail(pos.x, pos.y, pos.z, pr.color);
      this.vfx.sparkle(pos.x, pos.y, pos.z, pr.color, 2, 0.6);
      if (k >= 1) {
        this.group.remove(pr.mesh);
        (pr.mesh.material as THREE.Material).dispose();
        pr.onHit();
        return false;
      }
      return true;
    });
  }
}

const smoothJ = (t: number) => t * t * (3 - 2 * t);
