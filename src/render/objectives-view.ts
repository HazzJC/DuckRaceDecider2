import * as THREE from "three";
import type { Race } from "../sim/race";
import type { PowerupKind } from "../sim/types";
import { ELEMENT_COLORS } from "./duck";
import { fresnelMaterial } from "./fx-materials";
import { RIVER_HALF, laneZ, waveHeight } from "./layout";

const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function wingShape(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.8, 1.6, 2.4, 1.9);
  s.lineTo(2.0, 1.2);
  s.lineTo(2.5, 0.9);
  s.lineTo(1.9, 0.5);
  s.lineTo(2.2, 0.1);
  s.quadraticCurveTo(1.0, 0.1, 0, 0);
  return new THREE.ShapeGeometry(s, 12);
}

/** A drake that is also a dragon. Sits in a lane; the first duck through takes its element. */
class DragonDrake {
  readonly root = new THREE.Group();
  private wings: THREE.Group[] = [];
  private neck = new THREE.Group();
  private scaleMat = std("#5b3fa0", { roughness: 0.35, metalness: 0.3, emissive: "#2a1060", emissiveIntensity: 0.6 });
  private glowMat = std("#e9d5ff", { emissive: "#c084fc", emissiveIntensity: 3 });
  private aura: THREE.Mesh;

  constructor() {
    const body = mesh(new THREE.SphereGeometry(1, 32, 24), this.scaleMat, this.root, 0, 0.9, 0);
    body.scale.set(2.0, 1.0, 1.1);
    const belly = mesh(new THREE.SphereGeometry(0.9, 24, 16), std("#f0c987", { roughness: 0.6 }), this.root, 0.3, 0.7, 0);
    belly.scale.set(1.7, 0.75, 0.95);
    const tail = mesh(new THREE.ConeGeometry(0.45, 2.4, 12), this.scaleMat, this.root, -2.4, 1.2, 0);
    tail.rotation.z = Math.PI / 2 + 0.35;
    // spines
    for (let i = 0; i < 6; i++) mesh(new THREE.ConeGeometry(0.14, 0.45, 6), this.glowMat, this.root, 1.2 - i * 0.55, 1.95 - Math.abs(i - 2) * 0.08, 0);

    this.neck.position.set(1.6, 1.3, 0);
    this.root.add(this.neck);
    const n = mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 16), this.scaleMat, this.neck, 0.4, 0.6, 0);
    n.rotation.z = -0.6;
    const head = new THREE.Group();
    head.position.set(0.95, 1.45, 0);
    this.neck.add(head);
    mesh(new THREE.SphereGeometry(0.62, 28, 20), this.scaleMat, head);
    const beak = mesh(new THREE.SphereGeometry(0.3, 20, 12), std("#f59e0b", { roughness: 0.3 }), head, 0.6, -0.1, 0);
    beak.scale.set(1.6, 0.45, 1.1);
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.12, 12, 10), this.glowMat, head, 0.38, 0.18, s * 0.33);
      const horn = mesh(new THREE.ConeGeometry(0.1, 0.7, 8), std("#f5f0e1"), head, -0.2, 0.55, s * 0.3);
      horn.rotation.set(s * 0.3, 0, 0.6);
    }

    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(0.2, 1.5, s * 0.6);
      const wm = new THREE.Mesh(wingShape(), std("#7c3aed", { side: THREE.DoubleSide, emissive: "#3b0764", emissiveIntensity: 0.5, transparent: true, opacity: 0.92 }));
      wm.rotation.x = s * -Math.PI / 2;
      wm.scale.set(1, s, 1);
      w.add(wm);
      this.root.add(w);
      this.wings.push(w);
    }
    this.aura = mesh(new THREE.SphereGeometry(2.0, 24, 16), fresnelMaterial("#c084fc", { base: 0, power: 3.5 }), this.root, 0, 1.0, 0);
    this.aura.castShadow = false;
    this.root.scale.setScalar(0.85);
  }

  setElement(color: THREE.ColorRepresentation) {
    this.glowMat.color.set(color);
    this.glowMat.emissive.set(color);
    (this.aura.material as THREE.ShaderMaterial).uniforms.uColor.value.set(color);
  }

  showAura(on: boolean) {
    this.aura.visible = on;
  }

  animate(t: number, intensity: number) {
    this.wings.forEach((w, i) => (w.rotation.x = (i ? 1 : -1) * (0.3 + Math.sin(t * 5) * 0.5 * intensity)));
    this.neck.rotation.z = Math.sin(t * 1.3) * 0.12;
    (this.aura.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
  }
}

/** Looming bank-side Baron Goose with a buff orb in the river. */
class BaronGoose {
  readonly root = new THREE.Group();
  readonly orb: THREE.Mesh;
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private jaw = new THREE.Group();
  private pit: THREE.Mesh;
  honk = 0;
  sulk = false;

  constructor() {
    const white = new THREE.MeshPhysicalMaterial({ color: "#f4f1ea", roughness: 0.6, sheen: 1, sheenColor: new THREE.Color("#ffffff") });
    const grey = std("#9aa0a6", { roughness: 0.7 });
    const black = std("#151515", { roughness: 0.4 });
    const orange = std("#f97316", { roughness: 0.35 });
    const body = mesh(new THREE.SphereGeometry(1, 40, 28), white, this.root, 0, 1.4, 0);
    body.scale.set(2.4, 1.4, 1.5);
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.SphereGeometry(1, 28, 18), grey, this.root, -0.3, 1.7, s * 1.25);
      wing.scale.set(1.9, 0.75, 0.4);
    }
    const tail = mesh(new THREE.ConeGeometry(0.6, 1.2, 12), black, this.root, -2.5, 2.0, 0);
    tail.rotation.z = Math.PI / 2 + 0.6;

    // S-curve neck from body to head
    this.neck.position.set(1.8, 2.0, 0);
    this.root.add(this.neck);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 1.0, 0), new THREE.Vector3(0.3, 2.4, 0), new THREE.Vector3(0.8, 3.4, 0),
    ]);
    mesh(new THREE.TubeGeometry(curve, 32, 0.38, 14), black, this.neck);
    this.head.position.set(0.8, 3.5, 0);
    this.neck.add(this.head);
    mesh(new THREE.SphereGeometry(0.62, 28, 20), black, this.head);
    for (const s of [-1, 1]) {
      const cheek = mesh(new THREE.SphereGeometry(0.3, 16, 12), white, this.head, 0.05, -0.1, s * 0.45);
      cheek.scale.set(1.2, 0.8, 0.4);
      const eye = mesh(new THREE.SphereGeometry(0.09, 12, 10), std("#ff2d55", { emissive: "#ff0040", emissiveIntensity: 3 }), this.head, 0.35, 0.2, s * 0.42);
      eye.scale.set(1, 0.6, 1);
    }
    const upper = mesh(new THREE.ConeGeometry(0.28, 1.0, 16), orange, this.head, 0.85, -0.05, 0);
    upper.rotation.z = -Math.PI / 2;
    upper.scale.set(1, 1, 0.8);
    this.jaw.position.set(0.4, -0.2, 0);
    this.head.add(this.jaw);
    const lower = mesh(new THREE.ConeGeometry(0.2, 0.85, 16), orange, this.jaw, 0.42, 0, 0);
    lower.rotation.z = -Math.PI / 2;
    // menacing crown of spikes, very Baron
    for (let i = 0; i < 5; i++) mesh(new THREE.ConeGeometry(0.09, 0.5, 6), std("#a855f7", { emissive: "#7e22ce", emissiveIntensity: 2 }), this.head, -0.3 + i * 0.12, 0.6, (i - 2) * 0.12);

    this.pit = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.25, 8, 64), new THREE.MeshBasicMaterial({ color: "#a855f7", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    this.pit.rotation.x = Math.PI / 2;
    this.pit.position.y = 0.2;
    this.root.add(this.pit);

    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), new THREE.MeshStandardMaterial({ color: "#d8b4fe", emissive: "#a855f7", emissiveIntensity: 3, roughness: 0.1 }));
    this.root.scale.setScalar(1.5);
  }

  animate(t: number, dt: number) {
    this.honk = Math.max(0, this.honk - dt * 1.4);
    const h = Math.sin(Math.min(1, this.honk) * Math.PI);
    this.neck.rotation.z = Math.sin(t * 0.8) * 0.06 - h * 0.35;
    this.neck.scale.y = 1 + h * 0.15;
    this.jaw.rotation.z = -0.1 - h * 0.7 - Math.max(0, Math.sin(t * 2.3)) * 0.05;
    this.head.rotation.y = Math.sin(t * 0.5) * 0.3 * (1 - h);
    if (this.sulk) this.neck.rotation.z = -0.55 + Math.sin(t * 0.6) * 0.05;
    this.pit.scale.setScalar(1 + Math.sin(t * 2) * 0.03);
    this.orb.rotation.y = t;
    this.orb.position.y = 1.0 + Math.sin(t * 2.2) * 0.25;
  }
}

function powerupMesh(kind: PowerupKind): THREE.Group {
  const g = new THREE.Group();
  const item = new THREE.Group();
  item.name = "item";
  g.add(item);
  if (kind === "bread") {
    const loaf = mesh(new THREE.CapsuleGeometry(0.22, 0.75, 8, 16), std("#d9a35b", { roughness: 0.7 }), item);
    loaf.rotation.z = Math.PI / 2;
    for (let i = -1; i <= 1; i++) {
      const cut = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.3), std("#8a5a24"), item, i * 0.25, 0.21, 0);
      cut.rotation.y = 0.6;
    }
  }
  if (kind === "anchor") {
    const metal = std("#475569", { metalness: 0.9, roughness: 0.35 });
    mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 20), metal, item, 0, 0.55, 0);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 10), metal, item, 0, 0.05, 0);
    mesh(new THREE.BoxGeometry(0.45, 0.06, 0.06), metal, item, 0, 0.32, 0);
    const hook = mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 24, Math.PI), metal, item, 0, -0.18, 0);
    hook.rotation.z = Math.PI;
  }
  if (kind === "shield") {
    const disk = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 6), std("#22d3ee", { emissive: "#0891b2", emissiveIntensity: 1.5, metalness: 0.4, roughness: 0.2 }), item);
    disk.rotation.x = Math.PI / 2;
    const rim = mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 6), std("#facc15", { metalness: 1, roughness: 0.2 }), item);
    rim.rotation.z = Math.PI / 6;
  }
  if (kind === "portal") {
    mesh(new THREE.TorusGeometry(0.48, 0.08, 10, 40), std("#a78bfa", { emissive: "#7c3aed", emissiveIntensity: 3 }), item);
    mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: "#c4b5fd", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), item);
  }
  const colors: Record<PowerupKind, string> = { bread: "#facc15", anchor: "#94a3b8", shield: "#22d3ee", portal: "#a78bfa" };
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: colors[kind], transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  ring.name = "ring";
  g.add(ring);
  return g;
}

/** Glowing arena ring on the water while ducks brawl an objective. */
function fightRing(color: string) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const outer = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.09, 6, 80), mat);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.05, 6, 80), mat);
  for (const m of [outer, inner]) m.rotation.x = Math.PI / 2;
  g.add(outer, inner);
  for (let i = 0; i < 8; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.9), mat);
    const a = (i / 8) * Math.PI * 2;
    tick.position.set(Math.cos(a) * 3.8, 0, Math.sin(a) * 3.8);
    tick.rotation.y = -a;
    g.add(tick);
  }
  g.visible = false;
  return g;
}

type DuckPos = (id: number, out: THREE.Vector3) => THREE.Vector3;

/** Renders objectives and floating powerups from the sim state. */
export class ObjectivesView {
  readonly group = new THREE.Group();
  private dragon = new DragonDrake();
  private baron = new BaronGoose();
  private dragonPosW = new THREE.Vector3(0, -6, 0);
  private dragonLook = new THREE.Vector3(1, 0, 0);
  private dragonGone = 0;
  private powerups = new Map<number, THREE.Group>();
  private baronSide = -1;
  private dragonRing = fightRing("#c084fc");
  private baronRing = fightRing("#a855f7");
  private peck = 0;

  constructor() {
    this.dragon.root.scale.setScalar(1.25);
    this.group.add(this.dragon.root, this.baron.root, this.baron.orb, this.dragonRing, this.baronRing);
  }

  reset(race: Race) {
    this.dragonGone = 0;
    this.dragonPosW.set(race.objectives.dragon.x, -6, laneZ(race.objectives.dragon.lane, race.racers.length));
    this.dragon.setElement("#c084fc");
    this.dragon.root.visible = false;
    this.baron.root.visible = race.objectives.enabled;
    this.baron.orb.visible = false;
    this.dragonRing.visible = this.baronRing.visible = false;
    this.baronSide = race.objectives.baron.lane < race.racers.length / 2 ? -1 : 1;
    this.baron.root.position.set(race.objectives.baron.x + 2, 0, this.baronSide * (RIVER_HALF + 6));
    this.baron.root.rotation.y = this.baronSide < 0 ? -Math.PI / 2.4 : Math.PI / 2.4;
    for (const g of this.powerups.values()) this.group.remove(g);
    this.powerups.clear();
  }

  honk() {
    this.baron.honk = 1;
  }

  baronHeadPos(out: THREE.Vector3) {
    return out.set(this.baron.root.position.x, 8, this.baron.root.position.z * 0.85);
  }

  dragonPos(out: THREE.Vector3) {
    return out.copy(this.dragon.root.position);
  }

  /** Where drake breath comes from (its beak). */
  dragonMouth(out: THREE.Vector3) {
    return out.copy(this.dragon.root.position).add(new THREE.Vector3(3.6, 3.3, 0).applyQuaternion(this.dragon.root.quaternion));
  }

  update(race: Race, time: number, dt: number, duckPos: DuckPos) {
    const o = race.objectives;
    const n = race.racers.length;
    const tmp = new THREE.Vector3();
    if (o.enabled) {
      const d = o.dragon;
      const lairZ = laneZ(d.lane, n);
      const goal = new THREE.Vector3(d.x, -6, lairZ);
      let intensity = 1;
      if (d.state === "rising") goal.set(d.x, -6 + Math.min(1, d.timer / 2.5) * 6.6, lairZ);
      if (d.state === "up") goal.set(d.x, 0.6 + Math.sin(time * 1.2) * 0.3, lairZ);
      if (d.state === "fighting") {
        goal.set(d.x + 0.6, 1.4 + Math.sin(time * 6) * 0.35, lairZ);
        intensity = 2.4;
      }
      if (d.state === "taken" && d.takenBy !== null) {
        // escort: flies above and just behind its new owner, wings pumping
        duckPos(d.takenBy, tmp);
        goal.set(tmp.x - 2.5, 5.5 + Math.sin(time * 2) * 0.5, tmp.z + (tmp.z > 0 ? -2.5 : 2.5));
        intensity = 2;
      }
      if (d.state === "gone") {
        this.dragonGone += dt;
        goal.copy(this.dragonPosW).add(new THREE.Vector3(18 * dt, 6 * dt + this.dragonGone * dt * 4, 0));
        intensity = 2.2;
      }
      if (d.element) this.dragon.setElement(ELEMENT_COLORS[d.element]);
      const k = d.state === "taken" ? 4 : d.state === "gone" ? 1 : 2.2;
      const prev = this.dragonPosW.clone();
      this.dragonPosW.lerp(goal, Math.min(1, dt * k));
      const vel = this.dragonPosW.clone().sub(prev);
      if (vel.lengthSq() > 1e-6) this.dragonLook.lerp(vel.normalize(), Math.min(1, dt * 3));
      this.dragon.root.position.copy(this.dragonPosW);
      this.dragon.root.position.y += d.state === "up" || d.state === "rising" ? waveHeight(d.x, lairZ, time) : 0;
      // face the way it's flying; when lurking or brawling, face the oncoming ducks
      const facing = d.state === "taken" || d.state === "gone" ? Math.atan2(-this.dragonLook.z, this.dragonLook.x) : Math.PI;
      this.dragon.root.rotation.y += ((facing - this.dragon.root.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 4);
      this.dragon.root.visible = d.state !== "hidden" && !(d.state === "gone" && this.dragonGone > 5);
      this.dragon.showAura(d.state === "up" || d.state === "rising" || d.state === "fighting");
      this.dragon.animate(time, intensity);

      this.dragonRing.visible = d.state === "fighting";
      if (this.dragonRing.visible) {
        this.dragonRing.position.set(d.x - 1, 0.15, lairZ);
        this.dragonRing.rotation.y = time * 0.8;
        this.dragonRing.scale.setScalar(1 + Math.sin(time * 8) * 0.03);
      }

      const b = o.baron;
      this.baron.orb.visible = b.state === "up" || b.state === "fighting";
      this.baron.orb.position.set(b.x, 1, laneZ(b.lane, n));
      this.baron.orb.scale.setScalar(b.state === "fighting" ? 1.3 + Math.sin(time * 10) * 0.15 : 1);
      this.baronRing.visible = b.state === "fighting";
      if (this.baronRing.visible) {
        this.baronRing.position.set(b.x - 1, 0.15, laneZ(b.lane, n));
        this.baronRing.rotation.y = -time * 0.8;
      }
      // brawling ducks get pecked
      if (b.state === "fighting") {
        this.peck += dt;
        if (this.peck > 0.7) {
          this.peck = 0;
          this.baron.honk = Math.max(this.baron.honk, 0.45);
        }
      }
      this.baron.sulk = b.state === "taken";
      this.baron.animate(time, dt);
    }

    // powerups
    const live = new Set<number>();
    for (const p of race.powerups) {
      if (p.collected) continue;
      live.add(p.id);
      let g = this.powerups.get(p.id);
      if (!g) {
        g = powerupMesh(p.kind);
        g.scale.setScalar(0.01);
        this.powerups.set(p.id, g);
        this.group.add(g);
      }
      const z = laneZ(p.lane, n);
      g.position.set(p.x, waveHeight(p.x, z, time) + 0.55, z);
      g.scale.setScalar(Math.min(1.3, g.scale.x + dt * 4));
      const item = g.getObjectByName("item")!;
      item.rotation.y = time * 2;
      item.position.y = Math.sin(time * 3 + p.id) * 0.15;
      const ring = g.getObjectByName("ring")!;
      ring.scale.setScalar(1 + Math.sin(time * 4 + p.id) * 0.12);
    }
    for (const [id, g] of this.powerups) {
      if (!live.has(id)) {
        this.group.remove(g);
        this.powerups.delete(id);
      }
    }
  }
}
