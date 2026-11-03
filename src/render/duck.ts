import * as THREE from "three";
import type { DuckState, Element, Hat, Pattern } from "../sim/types";
import { flameMaterial, fresnelMaterial } from "./fx-materials";
import { DUCK_MODEL, getDuckAsset, rubberMaterial, type DuckAsset } from "./duck-asset";

export interface DuckLook {
  body: THREE.ColorRepresentation;
  head?: THREE.ColorRepresentation;
  pattern: Pattern;
  hat: Hat;
  extras?: ("headset" | "glasses" | "bowtie" | "captain" | "monocle")[];
}

export const ELEMENT_COLORS: Record<Element, string> = {
  infernal: "#ff5a1f",
  ocean: "#22d3ee",
  cloud: "#e2e8f0",
  mountain: "#d97706",
};

export const lookFromHue = (hue: number, hat: Hat, pattern: Pattern): DuckLook => ({
  body: new THREE.Color().setHSL(hue / 360, 0.9, 0.5),
  pattern,
  hat,
});

const BEAK = "#ff9a1f";

let collarTex: THREE.Texture | null = null;
/** Soft foam ring texture shared by every duck's water collar. */
function getCollarTexture(): THREE.Texture {
  if (collarTex) return collarTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(64, 64, 18, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.42, "rgba(255,255,255,0.85)");
  g.addColorStop(0.55, "rgba(220,240,255,0.35)");
  g.addColorStop(0.8, "rgba(200,230,255,0.12)");
  g.addColorStop(1, "rgba(200,230,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  collarTex = new THREE.CanvasTexture(cv);
  return collarTex;
}

/** Cool fresnel rim so ducks read against the water (painted-cel style). */
function addRim(mat: THREE.MeshPhysicalMaterial, color = "#a8dcff", strength = 0.4) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(color) };
    shader.uniforms.uRimStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform vec3 uRimColor;
uniform float uRimStrength;`)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += uRimColor * rimF * uRimStrength;`,
      );
  };
}

/** Body texture: base colour plus the pattern painted in sphere UV space. */
function patternTexture(base: THREE.Color, pattern: Pattern): THREE.Texture | null {
  if (pattern === "none" || pattern === "bandit") return null;
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 256;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 512, 256);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const accent = new THREE.Color().setHSL((hsl.h + 0.5) % 1, 0.75, 0.6);
  const light = new THREE.Color().setHSL(hsl.h, 0.6, 0.85);
  if (pattern === "dots") {
    ctx.fillStyle = `#${light.getHexString()}`;
    for (let i = 0; i < 70; i++) {
      const x = ((i * 97) % 512) + ((i * 13) % 17);
      const y = 40 + ((i * 53) % 170);
      ctx.beginPath();
      ctx.arc(x, y, 9 + (i % 4) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (pattern === "stripes") {
    ctx.fillStyle = `#${accent.getHexString()}`;
    for (let x = 0; x < 512; x += 64) ctx.fillRect(x, 0, 22, 256);
  }
  if (pattern === "belly") {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.55, "rgba(255,255,255,0)");
    g.addColorStop(0.7, `#${light.getHexString()}`);
    g.addColorStop(1, `#${light.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });

function buildHat(hat: Hat): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const black = std("#1a1a1a", { roughness: 0.6 });
  const gold = std("#f2c14e", { metalness: 0.9, roughness: 0.25 });
  switch (hat) {
    case "tophat":
      add(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 32), black, 0, 0.02);
      add(new THREE.CylinderGeometry(0.27, 0.29, 0.55, 32), black, 0, 0.3);
      add(new THREE.CylinderGeometry(0.295, 0.295, 0.09, 32), std("#b91c1c"), 0, 0.1);
      break;
    case "cap": {
      add(new THREE.SphereGeometry(0.37, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std("#2563eb"), 0, -0.02);
      const brim = add(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24, 1, false, -Math.PI / 2, Math.PI), std("#1d4ed8"), 0.2, 0.0);
      brim.scale.set(1.2, 1, 0.9);
      add(new THREE.SphereGeometry(0.05, 8, 6), std("#fff"), 0, 0.36);
      break;
    }
    case "crown": {
      add(new THREE.CylinderGeometry(0.3, 0.27, 0.22, 24, 1, true), gold, 0, 0.11);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.07, 0.2, 6), gold, Math.cos(a) * 0.28, 0.3, Math.sin(a) * 0.28);
        add(new THREE.SphereGeometry(0.04, 8, 6), std(i % 2 ? "#e11d48" : "#2563eb", { roughness: 0.1 }), Math.cos(a) * 0.29, 0.12, Math.sin(a) * 0.29);
      }
      break;
    }
    case "viking": {
      add(new THREE.SphereGeometry(0.39, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std("#9ca3af", { metalness: 0.7, roughness: 0.35 }), 0, -0.03);
      for (const s of [-1, 1]) {
        const horn = add(new THREE.ConeGeometry(0.08, 0.5, 10), std("#f5f0e1"), 0, 0.25, s * 0.38);
        horn.rotation.x = s * -0.9;
      }
      break;
    }
    case "propeller": {
      add(new THREE.SphereGeometry(0.34, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std("#ef4444"), 0, -0.02);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8), black, 0, 0.4);
      const prop = new THREE.Group();
      prop.name = "prop";
      prop.position.y = 0.5;
      for (const [i, c] of ["#60a5fa", "#facc15"].entries()) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.1), std(c));
        blade.rotation.y = i * (Math.PI / 2);
        prop.add(blade);
      }
      g.add(prop);
      break;
    }
    case "wizard": {
      const cone = add(new THREE.ConeGeometry(0.34, 0.95, 24), std("#7c3aed"), -0.04, 0.45);
      cone.rotation.z = 0.18;
      add(new THREE.CylinderGeometry(0.55, 0.55, 0.03, 32), std("#6d28d9"), 0, 0.02);
      add(new THREE.OctahedronGeometry(0.07), std("#fde047", { emissive: "#fde047", emissiveIntensity: 1.5 }), 0.12, 0.5, 0.25);
      break;
    }
    case "halo": {
      const halo = add(new THREE.TorusGeometry(0.3, 0.04, 10, 40), std("#fde68a", { emissive: "#fde047", emissiveIntensity: 2.5 }), 0, 0.35);
      halo.rotation.x = Math.PI / 2;
      halo.name = "halo";
      break;
    }
    case "sombrero":
      add(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 40), std("#f59e0b"), 0, 0.02);
      add(new THREE.ConeGeometry(0.3, 0.5, 24), std("#f59e0b"), 0, 0.28);
      add(new THREE.CylinderGeometry(0.29, 0.31, 0.08, 24), std("#dc2626"), 0, 0.09);
      break;
    case "pirate": {
      const body = add(new THREE.CylinderGeometry(0.45, 0.45, 0.26, 3), black, 0, 0.13);
      body.rotation.y = Math.PI / 6;
      add(new THREE.SphereGeometry(0.06, 10, 8), std("#f8fafc"), 0.32, 0.16, 0);
      break;
    }
    default:
      break;
  }
  return g;
}

/**
 * A stylised rubber duck. Forward is +x, origin at the waterline. Animated procedurally:
 * paddle bob, wing flaps, boost lean, stumble wobble, freeze, ignite, celebrate, talk (beak).
 */
export class DuckModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private wingL = new THREE.Group();
  private wingR = new THREE.Group();
  /** accessory anchor on the head (x forward), for hats and headsets */
  readonly head = new THREE.Group();
  private jaw = new THREE.Group();
  private hat: THREE.Group;
  private bodyMat: THREE.MeshPhysicalMaterial;
  private ice: THREE.Mesh;
  private shield: THREE.Mesh;
  private flames: THREE.Group;
  private aura: THREE.Mesh;
  private baronAura: THREE.Mesh;
  private collar: THREE.Mesh;
  private iceAmt = 0;
  private shieldAmt = 0;
  private fireAmt = 0;
  private phase = Math.random() * 10;
  private blink = 0;
  private eyes: THREE.Group[] = [];
  mouth = 0;

  /** neck joint of the scanned rubber duck; null when using the procedural fallback */
  private headPivot: THREE.Group | null = null;
  private headUniform: { value: THREE.Matrix4 } | null = null;
  private static negPivot = new THREE.Matrix4().makeTranslation(-DUCK_MODEL.pivot.x, -DUCK_MODEL.pivot.y, -DUCK_MODEL.pivot.z);

  constructor(look: DuckLook) {
    const rubber = getDuckAsset();
    if (rubber) {
      this.bodyMat = rubberMaterial(rubber, look.body, look.pattern);
      this.buildRubber(rubber, look);
    } else {
      this.bodyMat = this.buildProcedural(look);
    }

    this.hat = buildHat(look.hat);
    this.hat.position.set(-0.02, rubber ? 0.42 : 0.36, 0);
    this.head.add(this.hat);

    for (const extra of look.extras ?? []) this.addExtra(extra);
    this.ice = new THREE.Mesh();
    this.shield = new THREE.Mesh();
    this.flames = new THREE.Group();
    this.aura = new THREE.Mesh();
    this.baronAura = new THREE.Mesh();
    this.collar = new THREE.Mesh();
    this.buildStatus();
  }

  /** Scanned model: body + head meshes under a model-space group, head on a neck pivot. */
  private buildRubber(a: DuckAsset, look: DuckLook) {
    const M = DUCK_MODEL;
    const modelRoot = new THREE.Group();
    modelRoot.rotation.y = Math.PI / 2; // model faces +Z, our ducks face +X
    modelRoot.scale.setScalar(M.scale);
    modelRoot.position.y = M.sink;
    this.body.add(modelRoot);
    const mesh = new THREE.Mesh(a.geometry, this.bodyMat);
    mesh.castShadow = true;
    modelRoot.add(mesh);
    this.headUniform = this.bodyMat.userData.head;
    this.headPivot = new THREE.Group();
    this.headPivot.position.copy(M.pivot);
    modelRoot.add(this.headPivot);
    // caster heads get their own tint (Captain Drake's mallard-green head): same mesh drawn again,
    // clipped to the head in the shader by a second material sharing the neck uniform
    if (look.head) {
      const headMat = rubberMaterial(a, look.head, "none", this.headUniform ?? undefined);
      headMat.userData.headOnly = true;
      headMat.polygonOffset = true;
      headMat.polygonOffsetFactor = -1;
      const headMesh = new THREE.Mesh(a.geometry, headMat);
      modelRoot.add(headMesh);
    }
    // accessory anchor in the old procedural head's frame (x forward, ~0.43 radius at 0.75 scale)
    this.head.position.copy(M.headCenter).sub(M.pivot);
    this.head.rotation.y = -Math.PI / 2;
    this.head.scale.setScalar(0.75 / M.scale);
    this.headPivot.add(this.head);
  }

  private buildProcedural(look: DuckLook): THREE.MeshPhysicalMaterial {
    const base = new THREE.Color(look.body);
    const map = patternTexture(base, look.pattern);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: map ? "#ffffff" : base,
      map,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      sheen: 0.3,
      sheenColor: new THREE.Color("#ffffff"),
    });
    addRim(bodyMat);
    const headMat = look.head
      ? new THREE.MeshPhysicalMaterial({ color: look.head, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 })
      : bodyMat;
    const beakMat = new THREE.MeshPhysicalMaterial({ color: BEAK, roughness: 0.35, clearcoat: 0.8 });

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // body: main ellipsoid, chest, perky tail
    const torso = mesh(new THREE.SphereGeometry(0.62, 48, 32), bodyMat, this.body, 0, 0.32, 0);
    torso.scale.set(1.25, 0.8, 1.0);
    mesh(new THREE.SphereGeometry(0.46, 32, 24), bodyMat, this.body, 0.38, 0.45, 0);
    const tail = mesh(new THREE.SphereGeometry(0.3, 24, 16), bodyMat, this.body, -0.66, 0.58, 0);
    tail.scale.set(1.1, 0.75, 0.85);
    tail.rotation.z = -0.6;

    // head
    this.head.position.set(0.48, 1.05, 0);
    this.body.add(this.head);
    mesh(new THREE.SphereGeometry(0.43, 40, 28), headMat, this.head);
    if (look.pattern === "bandit") {
      mesh(new THREE.SphereGeometry(0.437, 32, 8, -Math.PI / 2.6, Math.PI / 1.3, 1.2, 0.42), std("#111", { roughness: 0.4 }), this.head).rotation.y = -Math.PI / 2;
    }
    const upper = mesh(new THREE.SphereGeometry(0.2, 24, 16), beakMat, this.head, 0.42, -0.06, 0);
    upper.scale.set(1.55, 0.42, 1.15);
    this.jaw.position.set(0.3, -0.1, 0);
    this.head.add(this.jaw);
    const lower = mesh(new THREE.SphereGeometry(0.17, 20, 12), beakMat, this.jaw, 0.1, -0.03, 0);
    lower.scale.set(1.5, 0.32, 1.0);

    const white = std("#ffffff", { roughness: 0.15 });
    const black = std("#0b0b0b", { roughness: 0.1 });
    const shine = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(0.28, 0.13, s * 0.22);
      this.head.add(eye);
      mesh(new THREE.SphereGeometry(0.12, 20, 14), white, eye);
      mesh(new THREE.SphereGeometry(0.07, 16, 12), black, eye, 0.07, 0.01, s * 0.02);
      mesh(new THREE.SphereGeometry(0.022, 8, 6), shine, eye, 0.12, 0.05, s * 0.0);
      this.eyes.push(eye);
    }

    // wings hinge at the shoulder
    for (const [wing, s] of [[this.wingL, 1], [this.wingR, -1]] as const) {
      wing.position.set(0.05, 0.55, s * 0.52);
      this.body.add(wing);
      const w = mesh(new THREE.SphereGeometry(0.38, 24, 16), bodyMat, wing, -0.18, 0, s * 0.04);
      w.scale.set(1.2, 0.42, 0.45);
      w.rotation.z = 0.25;
    }

    return bodyMat;
  }

  /** Ice block, shield bubble, flames, buff auras and the foam collar. */
  private buildStatus() {
    this.ice = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), fresnelMaterial("#9bd7ff", { base: 0.18, power: 1.6 }));
    this.ice.position.y = 0.65;
    this.ice.visible = false;
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 24), fresnelMaterial("#22d3ee", { hex: true, base: 0.02 }));
    this.shield.position.y = 0.6;
    this.shield.visible = false;
    this.flames = new THREE.Group();
    const fmat = flameMaterial();
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 10, 4, true).translate(0, 0.45, 0), fmat);
      const a = (i / 5) * Math.PI * 2;
      f.position.set(Math.cos(a) * 0.45, 0.35, Math.sin(a) * 0.45);
      f.scale.setScalar(0.8 + (i % 3) * 0.2);
      this.flames.add(f);
    }
    this.flames.visible = false;
    this.aura = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: "#fff", transparent: true, opacity: 0.9 }));
    this.aura.rotation.x = Math.PI / 2;
    this.aura.position.y = 0.08;
    this.aura.visible = false;
    this.baronAura = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), fresnelMaterial("#a855f7", { base: 0.0, power: 3 }));
    this.baronAura.position.y = 0.6;
    this.baronAura.visible = false;

    this.collar = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: getCollarTexture(), color: "#9fb8c8", transparent: true, depthWrite: false, opacity: 0.45 }),
    );
    this.collar.position.y = 0.06;
    this.collar.renderOrder = 1;

    this.root.add(this.body, this.ice, this.shield, this.flames, this.aura, this.baronAura, this.collar);
  }

  private addExtra(extra: string): void {
    const add = (geo: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x: number, y: number, z: number, extraMat: THREE.MeshStandardMaterialParameters = {}) => {
      const m = new THREE.Mesh(geo, std(color, extraMat));
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    if (extra === "headset") {
      const band = add(new THREE.TorusGeometry(0.45, 0.035, 8, 32, Math.PI), "#222", this.head, -0.02, 0.0, 0);
      band.rotation.y = Math.PI / 2;
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 20).rotateX(Math.PI / 2), "#333", this.head, -0.02, 0, s * 0.44);
      const boom = add(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), "#333", this.head, 0.18, -0.2, 0.4);
      boom.rotation.set(0.4, 0, 1.2);
      add(new THREE.SphereGeometry(0.05, 10, 8), "#111", this.head, 0.38, -0.27, 0.32);
    }
    if (extra === "glasses") {
      for (const s of [-1, 1]) {
        const lens = add(new THREE.TorusGeometry(0.11, 0.018, 8, 24), "#111", this.head, 0.39, 0.13, s * 0.22);
        lens.rotation.y = Math.PI / 2;
      }
      add(new THREE.BoxGeometry(0.02, 0.02, 0.18), "#111", this.head, 0.41, 0.15, 0);
    }
    if (extra === "monocle") {
      const lens = add(new THREE.TorusGeometry(0.12, 0.02, 8, 24), "#d4af37", this.head, 0.39, 0.13, 0.22, { metalness: 1, roughness: 0.2 });
      lens.rotation.y = Math.PI / 2;
    }
    if (extra === "bowtie") {
      for (const s of [-1, 1]) {
        const w = add(new THREE.ConeGeometry(0.12, 0.2, 4), "#b91c1c", this.body, 0.78, 0.72, s * 0.11);
        w.rotation.x = (s * Math.PI) / 2;
      }
      add(new THREE.SphereGeometry(0.05, 8, 6), "#7f1d1d", this.body, 0.8, 0.72, 0);
    }
    if (extra === "captain") {
      const cap = add(new THREE.CylinderGeometry(0.36, 0.32, 0.2, 28), "#f8fafc", this.head, -0.02, 0.42, 0);
      add(new THREE.CylinderGeometry(0.37, 0.37, 0.06, 28), "#0f172a", cap, 0, -0.08, 0);
      const peak = add(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 20, 1, false, -Math.PI / 2, Math.PI), "#0f172a", cap, 0.16, -0.1, 0);
      peak.scale.set(1.1, 1, 0.9);
      add(new THREE.OctahedronGeometry(0.06), "#facc15", cap, 0.33, 0.0, 0, { metalness: 1, roughness: 0.2 });
    }
  }

  setElement(el: Element | null, baron: boolean): void {
    this.aura.visible = !!el;
    if (el) (this.aura.material as THREE.MeshBasicMaterial).color.set(ELEMENT_COLORS[el]);
    this.baronAura.visible = baron;
  }

  /**
   * Per-frame animation. `speedNorm` ~1 at average race pace.
   */
  animate(dt: number, time: number, state: DuckState, speedNorm: number, shield: boolean, mode: "race" | "idle" | "celebrate" | "sad" | "fight" = "race"): void {
    const t = time + this.phase;
    const s = Math.min(speedNorm, 2.5);

    const target = (v: number, goal: number, rate: number) => v + (goal - v) * Math.min(1, dt * rate);
    this.iceAmt = target(this.iceAmt, state === "frozen" ? 1 : 0, 12);
    this.fireAmt = target(this.fireAmt, state === "ignite" ? 1 : 0, 10);
    this.shieldAmt = target(this.shieldAmt, shield ? 1 : 0, 8);

    // body motion
    let pitch = -0.08 * s + Math.sin(t * 3.1) * 0.04;
    // waddle-paddle: side-to-side rock and a little bob on every stroke
    let roll = Math.sin(t * 5.2) * 0.11 * (0.5 + s * 0.5);
    let yaw = Math.sin(t * 2.6) * 0.09 + Math.sin(t * 0.9) * 0.05;
    let lift = Math.abs(Math.sin(t * 5.2)) * 0.07 * (0.4 + s * 0.6);
    // every few seconds, an over-eager hop
    const hop = Math.max(0, Math.sin(t * 0.9 + this.phase) - 0.96) * 25;
    lift += hop * 0.35;
    pitch -= hop * 0.15;
    let flapAmp = 0.12, flapRate = 5;

    if (state === "boost") {
      pitch = -0.28;
      flapAmp = 0.9;
      flapRate = 22;
      lift += 0.12;
    }
    if (state === "stumble") {
      roll = Math.sin(t * 18) * 0.35;
      yaw = Math.sin(t * 9) * 0.4;
      flapAmp = 0.5;
      flapRate = 9;
    }
    if (state === "frozen") {
      pitch = 0;
      roll = 0;
      yaw = 0;
      flapAmp = 0;
    }
    if (state === "ignite") {
      roll += Math.sin(t * 30) * 0.06;
      flapAmp = 0.6;
      flapRate = 16;
    }
    if (mode === "idle") {
      pitch = Math.sin(t * 1.4) * 0.05;
      flapAmp = 0.06;
      flapRate = 2;
    }
    if (mode === "celebrate") {
      lift = Math.abs(Math.sin(t * 4.5)) * 0.9;
      yaw = t * 2.5;
      flapAmp = 1.0;
      flapRate = 14;
      pitch = -0.2;
    }
    if (mode === "fight") {
      // brawling an objective: furious bouncing, flapping and lunging pecks
      const lunge = Math.max(0, Math.sin(t * 9));
      pitch = -0.25 * lunge - 0.05;
      roll = Math.sin(t * 13) * 0.12;
      yaw = Math.sin(t * 5) * 0.2;
      lift = Math.abs(Math.sin(t * 9)) * 0.28;
      flapAmp = 0.9;
      flapRate = 20;
    }
    if (mode === "sad") {
      pitch = 0.25;
      flapAmp = 0.03;
      flapRate = 1;
    }

    this.collar.visible = mode === "race" || mode === "fight";
    const cs = 0.9 + Math.min(s, 2) * 0.18 + Math.sin(t * 2.6) * 0.04;
    this.collar.scale.set(cs * (1 + s * 0.15), 1, cs);
    this.collar.position.x = -s * 0.12;
    this.body.rotation.set(roll, yaw, pitch);
    this.body.position.y = lift;
    const flap = Math.sin(t * flapRate) * flapAmp;
    this.wingL.rotation.x = -flap - (state === "boost" ? 0.5 : 0);
    this.wingR.rotation.x = flap + (state === "boost" ? 0.5 : 0);

    // head look + talk + blink
    const look = Math.sin(t * 0.7) * 0.15;
    if (this.headPivot) {
      // no jaw on the scanned duck: talking reads as quick nods, sad ducks hang their heads
      this.headPivot.rotation.y = look;
      this.headPivot.rotation.x = (mode === "sad" ? 0.35 : 0) - this.mouth * 0.16 + (state === "boost" ? 0.12 : 0) + (mode === "fight" ? Math.max(0, Math.sin(t * 9)) * 0.35 : 0);
      this.headPivot.rotation.z = Math.sin(t * 1.1) * 0.05;
      this.headPivot.updateMatrix();
      this.headUniform!.value.multiplyMatrices(this.headPivot.matrix, DuckModel.negPivot);
    } else {
      this.head.rotation.y = look;
      this.head.rotation.z = mode === "sad" ? 0.3 : 0;
      this.jaw.rotation.z = -this.mouth * 0.45;
    }
    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 2 + Math.random() * 3;
    const lid = this.blink < 0 ? 0.1 : 1;
    for (const e of this.eyes) e.scale.y = lid;

    const prop = this.hat.getObjectByName("prop");
    if (prop) prop.rotation.y += dt * (8 + s * 20);
    const halo = this.hat.getObjectByName("halo");
    if (halo) halo.position.y = 0.35 + Math.sin(t * 2) * 0.05;

    // ice
    this.ice.visible = this.iceAmt > 0.02;
    this.ice.scale.setScalar(0.6 + this.iceAmt * 0.4);
    (this.ice.material as THREE.ShaderMaterial).uniforms.uAlpha.value = this.iceAmt;
    this.bodyMat.emissive.setRGB(this.fireAmt * 0.6 + this.iceAmt * 0.1, this.fireAmt * 0.12 + this.iceAmt * 0.25, this.iceAmt * 0.5);

    // shield
    this.shield.visible = this.shieldAmt > 0.02;
    const sm = this.shield.material as THREE.ShaderMaterial;
    sm.uniforms.uTime.value = t;
    sm.uniforms.uAlpha.value = this.shieldAmt;
    this.shield.scale.setScalar(0.85 + this.shieldAmt * 0.15 + Math.sin(t * 3) * 0.02);

    // flames
    this.flames.visible = this.fireAmt > 0.02;
    this.flames.children.forEach((f, i) => {
      const m = (f as THREE.Mesh).material as THREE.ShaderMaterial;
      m.uniforms.uTime.value = t + i;
      m.uniforms.uAlpha.value = this.fireAmt;
    });

    if (this.aura.visible) {
      this.aura.rotation.z = t;
      this.aura.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    }
    if (this.baronAura.visible) (this.baronAura.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
