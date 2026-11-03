import * as THREE from "three";
import { DuckModel } from "../render/duck";

export interface CasterDef {
  name: string;
  role: string;
  color: string;
  look: ConstructorParameters<typeof DuckModel>[0];
  pitch: number;
  rasp?: number;
  rate: number;
}

/** Original parody casters. Archetypes only: the hype play-by-play and the calm analyst. */
export const CASTERS: CasterDef[] = [
  {
    name: "Captain Drake",
    role: "Play-by-play",
    color: "#facc15",
    look: { body: "#efe6d2", head: "#1f7a4a", pattern: "belly", hat: "none", extras: ["captain"] },
    pitch: 1.3,
    rate: 1.2,
    rasp: 0.8,
  },
  {
    name: "Professor Mallard",
    role: "Analyst",
    color: "#60a5fa",
    look: { body: "#8a6a4a", head: "#6b4f35", pattern: "none", hat: "none", extras: ["glasses", "bowtie"] },
    pitch: 0.78,
    rate: 0.9,
    rasp: 1.3,
  },
];

const canvasTex = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

function hexPattern(c: CanvasRenderingContext2D, w: number, h: number, stroke: string, size = 26) {
  c.strokeStyle = stroke;
  c.lineWidth = 2;
  for (let y = -size; y < h + size; y += size * 1.75) {
    for (let x = -size; x < w + size * 2; x += size * 3.05) {
      for (const [ox, oy] of [[0, 0], [size * 1.52, size * 0.875]]) {
        c.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          c.lineTo(x + ox + Math.cos(a) * size, y + oy + Math.sin(a) * size);
        }
        c.stroke();
      }
    }
  }
}

/** Front panel of the desk: glowing hex mesh with the league crest. */
function deskFrontTexture() {
  return canvasTex(2048, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#0d1a33");
    g.addColorStop(1, "#04080f");
    c.fillStyle = g;
    c.fillRect(0, 0, 2048, 256);
    hexPattern(c, 2048, 256, "rgba(10,200,185,0.22)", 22);
    c.fillStyle = "rgba(200,170,110,0.9)";
    c.fillRect(0, 6, 2048, 4);
    c.fillRect(0, 246, 2048, 4);
    c.save();
    c.translate(1024, 128);
    const hexShape = (r: number) => {
      c.beginPath();
      c.moveTo(0, -r);
      c.lineTo(r * 0.87, -r * 0.43);
      c.lineTo(r * 0.87, r * 0.43);
      c.lineTo(0, r);
      c.lineTo(-r * 0.87, r * 0.43);
      c.lineTo(-r * 0.87, -r * 0.43);
      c.closePath();
    };
    c.fillStyle = "#c8aa6e";
    hexShape(96);
    c.fill();
    c.fillStyle = "#0a1428";
    hexShape(82);
    c.fill();
    c.fillStyle = "#f5d98b";
    c.font = "800 66px Cinzel, Georgia, serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Q", 0, 6);
    c.restore();
    c.font = "700 46px Cinzel, Georgia, serif";
    c.fillStyle = "#f0e6d2";
    c.textBaseline = "middle";
    c.textAlign = "right";
    c.fillText("QUACK CHAMPIONSHIP", 890, 132);
    c.textAlign = "left";
    c.fillText("SERIES  ·  LIVE", 1158, 132);
  });
}

function sideBanner(color: string, label: string) {
  return canvasTex(512, 1024, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 1024);
    g.addColorStop(0, color);
    g.addColorStop(1, "#05080f");
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 1024);
    hexPattern(c, 512, 1024, "rgba(255,255,255,0.08)", 34);
    c.strokeStyle = "#c8aa6e";
    c.lineWidth = 8;
    c.strokeRect(14, 14, 484, 996);
    c.save();
    c.translate(256, 520);
    c.rotate(-Math.PI / 2);
    c.fillStyle = "#f0e6d2";
    c.font = "800 92px Cinzel, Georgia, serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(`${label} SIDE`, 0, 0);
    c.restore();
  });
}

/** Studio headset in the duck's head frame (x forward, ~0.45 head radius). */
export function buildHeadset(color: string): THREE.Group {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: "#16181d", roughness: 0.4, metalness: 0.35 });
  const pad = new THREE.MeshStandardMaterial({ color: "#2b2e36", roughness: 0.95 });
  const gold = new THREE.MeshStandardMaterial({ color: "#d9b25a", roughness: 0.25, metalness: 1 });
  const led = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 3 });
  const foam = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // padded band arcing over the crown, ear to ear
  const band = add(new THREE.TorusGeometry(0.5, 0.05, 12, 48, Math.PI), black);
  band.rotation.y = Math.PI / 2;
  band.position.x = -0.04;
  const cushion = add(new THREE.CapsuleGeometry(0.06, 0.32, 6, 12), pad);
  cushion.rotation.x = Math.PI / 2;
  cushion.position.set(-0.04, 0.48, 0);
  for (const s of [-1, 1]) {
    const cup = add(new THREE.CylinderGeometry(0.19, 0.19, 0.13, 28).rotateX(Math.PI / 2), black);
    cup.position.set(-0.04, -0.02, s * 0.5);
    const cushionRing = add(new THREE.TorusGeometry(0.15, 0.045, 10, 28), pad);
    cushionRing.position.set(-0.04, -0.02, s * 0.43);
    const ring = add(new THREE.TorusGeometry(0.17, 0.022, 8, 32), gold);
    ring.position.set(-0.04, -0.02, s * 0.57);
    const light = add(new THREE.CircleGeometry(0.05, 20), led);
    light.position.set(-0.04, -0.02, s * 0.572);
    if (s < 0) light.rotation.y = Math.PI;
  }
  // boom mic from the right cup around to just off the beak
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.02, -0.08, 0.56),
    new THREE.Vector3(0.25, -0.24, 0.55),
    new THREE.Vector3(0.52, -0.3, 0.38),
    new THREE.Vector3(0.66, -0.26, 0.2),
  ]);
  add(new THREE.TubeGeometry(curve, 24, 0.022, 8), black);
  const mic = add(new THREE.SphereGeometry(0.085, 18, 14), foam);
  mic.position.set(0.69, -0.25, 0.17);
  mic.scale.set(1.25, 1, 1);
  return g;
}

/** Points along the desk's front arc (bowing toward the camera). */
const arcPoint = (r: number, th: number, y: number, cz: number) => new THREE.Vector3(r * Math.sin(th), y, cz + r * Math.cos(th));

/**
 * The casters' broadcast desk: an LED wall showing the live race, team banners, a curved desk with a glowing
 * crest panel and LED trim, laptops and team mugs, key + coloured rim spotlights with soft light cones.
 * Rendered picture-in-picture into a rect the DOM lays out.
 */
export class Booth {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 60);
  readonly ducks: DuckModel[];
  /** low-res render of the main race camera, shown on the LED wall (the app fills it) */
  readonly feedTarget = new THREE.WebGLRenderTarget(448, 252);
  private hype = [0, 0];
  private talk = [0, 0];
  private time = 0;
  private cones: THREE.Mesh[] = [];
  private ledStrip: THREE.MeshStandardMaterial;

  constructor() {
    this.scene.background = new THREE.Color("#050914");
    this.scene.fog = new THREE.Fog("#050914", 10, 24);

    this.scene.add(new THREE.HemisphereLight("#bcd4ff", "#1a1020", 0.45));
    const key = new THREE.SpotLight("#fff1dc", 70, 22, 0.5, 0.6, 1.4);
    key.position.set(1.5, 5, 6.5);
    key.target.position.set(0, 0.8, 0);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(1024);
    key.shadow.bias = -0.0006;
    const rimL = new THREE.SpotLight("#4f8dff", 55, 16, 0.6, 0.7, 1.4);
    rimL.position.set(-5, 4, -2.5);
    rimL.target.position.set(-1, 1, 0);
    const rimR = new THREE.SpotLight("#ff4f6d", 55, 16, 0.6, 0.7, 1.4);
    rimR.position.set(5, 4, -2.5);
    rimR.target.position.set(1, 1, 0);
    this.scene.add(key, key.target, rimL, rimL.target, rimR, rimR.target);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ color: "#0a0f1c", roughness: 0.22, metalness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // LED wall: live race feed in a gold frame, team banners either side
    const wall = new THREE.Group();
    wall.position.set(0, 1.85, -3.4);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.04), new THREE.MeshBasicMaterial({ map: this.feedTarget.texture }));
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(5.62, 3.26), new THREE.MeshStandardMaterial({ color: "#c8aa6e", metalness: 1, roughness: 0.3 }));
    frame.position.z = -0.02;
    const liveTag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.3),
      new THREE.MeshBasicMaterial({
        map: canvasTex(256, 86, (c) => {
          c.fillStyle = "#c81e3a";
          c.fillRect(0, 0, 256, 86);
          c.fillStyle = "#fff";
          c.font = "800 50px Cinzel, Georgia, serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText("● LIVE", 128, 46);
        }),
      }),
    );
    liveTag.position.set(-2.1, 1.25, 0.02);
    wall.add(frame, screen, liveTag);
    for (const [x, col, label] of [[-4.1, "#1d4ed8", "BLUE"], [4.1, "#b91c1c", "RED"]] as const) {
      const tex = sideBanner(col, label);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.4), new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.35 }));
      b.position.set(x, 0, 0.3);
      b.rotation.y = -Math.sign(x) * 0.35;
      wall.add(b);
    }
    this.scene.add(wall);

    // curved desk in front of the casters: wood top (ring sector), glowing crest front, LED trim
    const arc = Math.PI * 0.6;
    const cz = -1.85;
    const deskTop = new THREE.Mesh(
      new THREE.RingGeometry(2.25, 3.05, 72, 1, -Math.PI / 2 - arc / 2, arc),
      new THREE.MeshStandardMaterial({ color: "#2b1d13", roughness: 0.32, metalness: 0.1, side: THREE.DoubleSide }),
    );
    deskTop.rotation.x = -Math.PI / 2;
    deskTop.position.set(0, 0.37, cz);
    deskTop.receiveShadow = true;
    const frontTex = deskFrontTexture();
    const front = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 2.9, 0.98, 72, 1, true, -arc / 2, arc),
      new THREE.MeshStandardMaterial({ map: frontTex, emissive: "#ffffff", emissiveMap: frontTex, emissiveIntensity: 0.55, roughness: 0.4 }),
    );
    front.position.set(0, -0.13, cz);
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => arcPoint(3.06, -arc / 2 + (arc * i) / 23, 0.37, cz)));
    this.ledStrip = new THREE.MeshStandardMaterial({ color: "#c8aa6e", emissive: "#f5d98b", emissiveIntensity: 2.2 });
    const strip = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.03, 6), this.ledStrip);
    this.scene.add(deskTop, front, strip);

    // props: laptops (backs toward camera, glowing crest on the lid) and team mugs
    const metal = new THREE.MeshStandardMaterial({ color: "#9aa3b2", metalness: 0.9, roughness: 0.3 });
    const lidLogo = new THREE.MeshStandardMaterial({ color: "#0a1428", emissive: "#5eead4", emissiveIntensity: 1.2 });
    for (const x of [-1.45, 1.45]) {
      const laptop = new THREE.Group();
      laptop.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.42), metal));
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.02), metal);
      lid.position.set(0, 0.2, 0.2);
      lid.rotation.x = 0.25;
      const logo = new THREE.Mesh(new THREE.CircleGeometry(0.06, 6), lidLogo);
      logo.position.set(0, 0.21, 0.217);
      logo.rotation.x = 0.25;
      laptop.add(lid, logo);
      const p = arcPoint(2.6, Math.asin(x / 2.6), 0.39, cz);
      laptop.position.copy(p);
      laptop.rotation.y = Math.asin(x / 2.6);
      laptop.traverse((o) => (o.castShadow = true));
      this.scene.add(laptop);
    }
    for (const [x, col] of [[-0.75, "#1d4ed8"], [0.75, "#b91c1c"]] as const) {
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.2, 20), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 }));
      mug.position.copy(arcPoint(2.75, Math.asin(x / 2.75), 0.47, cz));
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.015, 8, 16), mug.material);
      handle.position.set(0.1, 0, 0);
      mug.add(handle);
      mug.castShadow = true;
      this.scene.add(mug);
    }

    // soft light cones from the rig
    for (const [x, col] of [[-2.6, "#4f8dff"], [0, "#fff1dc"], [2.6, "#ff4f6d"]] as const) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 5.5, 32, 1, true),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      cone.position.set(x, 2.6, -0.8);
      cone.rotation.z = x * -0.06;
      this.cones.push(cone);
      this.scene.add(cone);
    }

    this.ducks = CASTERS.map((c, i) => {
      const d = new DuckModel(c.look);
      d.root.position.set(i === 0 ? -0.95 : 0.95, 0.05, 0.05);
      d.root.rotation.y = this.baseYaw(i);
      d.head.add(buildHeadset(c.color));
      d.root.traverse((o) => (o.castShadow = true));
      this.scene.add(d.root);
      return d;
    });

    this.camera.position.set(0, 1.55, 5.6);
    this.camera.lookAt(0, 0.95, 0);
  }

  /** ducks face +x; turn them to the camera and slightly toward each other */
  private baseYaw(i: number) {
    return i === 0 ? -Math.PI / 2 + 0.42 : -Math.PI / 2 - 0.42;
  }

  setMouth(i: number, open: number) {
    this.ducks[i].mouth = open;
    if (open > 0.05) this.talk[i] = 1;
  }

  setHype(i: number, amount: number) {
    this.hype[i] = Math.max(this.hype[i], amount);
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    this.ducks.forEach((d, i) => {
      this.hype[i] = Math.max(0, this.hype[i] - dt * 0.8);
      this.talk[i] = Math.max(0, this.talk[i] - dt * 1.6);
      const hype = this.hype[i];
      d.animate(dt, t + i * 3, "normal", 0, false, "idle");
      // talking: hop on every syllable with squash and stretch, and lean in toward the camera
      const m = d.mouth;
      const talking = this.talk[i];
      d.body.position.y = m * 0.16 + talking * 0.03 + hype * Math.abs(Math.sin(t * 10)) * 0.2 + Math.sin(t * 1.3 + i) * 0.015;
      d.body.scale.set(1 - m * 0.04, 1 + m * 0.08 + hype * 0.04, 1 - m * 0.04);
      d.body.rotation.z = -0.08 * talking - hype * 0.12 + Math.sin(t * 0.8 + i) * 0.02;
      d.body.rotation.y = Math.sin(t * 0.6 + i * 2) * 0.06 + (hype > 0.3 ? Math.sin(t * 7) * 0.12 : 0);
      // the listener glances across at whoever is talking
      d.root.rotation.y = this.baseYaw(i) + (i === 0 ? -1 : 1) * this.talk[1 - i] * 0.28;
    });
    this.cones.forEach((c, i) => ((c.material as THREE.MeshBasicMaterial).opacity = 0.05 + Math.sin(t * 0.7 + i) * 0.015));
    this.ledStrip.emissiveIntensity = 1.8 + Math.sin(t * 2) * 0.4;
  }

  /** Render into a CSS-pixel rect (relative to the canvas). */
  render(r: THREE.WebGLRenderer, rect: DOMRect | null, canvasRect: DOMRect) {
    if (!rect || rect.width < 10) return;
    // viewport/scissor take CSS pixels; three applies the pixel ratio
    const x = rect.left - canvasRect.left;
    const y = canvasRect.bottom - rect.bottom;
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    // slow broadcast camera drift
    this.camera.position.set(Math.sin(this.time * 0.15) * 0.35, 1.55 + Math.sin(this.time * 0.11) * 0.05, 5.6);
    this.camera.lookAt(0, 0.95, 0);
    r.setScissorTest(true);
    r.setViewport(x, y, rect.width, rect.height);
    r.setScissor(x, y, rect.width, rect.height);
    r.autoClear = false;
    r.clear(true, true, false);
    r.render(this.scene, this.camera);
    r.setScissorTest(false);
    r.setViewport(0, 0, canvasRect.width, canvasRect.height);
    r.autoClear = true;
  }
}
