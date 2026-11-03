import * as THREE from "three";
import { fbm, hash2, smoothstep } from "./noise";
import { at, addInstanceBob, merge, tint } from "./geo";
import { CHANNEL, L, RIVER_HALF, WAVE_GLSL, WORLD_X0, WORLD_X1, laneWidth } from "./layout";
import { TURRET_FRACS } from "../sim/objectives";
import { addWind, buildGrass, flowerGeometry, fluffyTreeGeometries, rockGeometry, terrainMaterial } from "./nature";
import type { TerrainTextures } from "./assets";

export const BLUE = new THREE.Color("#3b82f6");
export const RED = new THREE.Color("#ef4444");

/** Ground height of the banks. Below 0 is under water. */
export function groundHeight(x: number, z: number): number {
  const d = Math.abs(z) - RIVER_HALF;
  let h = -2.2 + smoothstep(-3, 1.5, d) * 2.7;
  h += smoothstep(4, 45, d) * (2.5 + fbm(x * 0.015 + 7, z * 0.02) * 14);
  h += (fbm(x * 0.12, z * 0.12) - 0.5) * 0.9 * smoothstep(0, 4, d);
  if (z > 0) {
    const w = smoothstep(CHANNEL.x0 - 8, CHANNEL.x0, x) * (1 - smoothstep(CHANNEL.x1, CHANNEL.x1 + 8, x));
    const zc = Math.abs(z - CHANNEL.z);
    const carve = w * (1 - smoothstep(2.4, 4.4, zc));
    h = h * (1 - carve) - 1.4 * carve;
  }
  return h;
}

/** Room on both banks for Baron Goose (its side is picked per race). */
const inBaronArea = (x: number, z: number) => Math.abs(x - (L * 0.66 + 2)) < 14 && Math.abs(z) < RIVER_HALF + 16;

const inChannelArea = (x: number, z: number, pad = 0) =>
  z > 0 && x > CHANNEL.x0 - 8 - pad && x < CHANNEL.x1 + 8 + pad && Math.abs(z - CHANNEL.z) < 5 + pad;

export interface WorldUniforms {
  time: { value: number }[];
  crowdExcite: { value: number };
}

export class World {
  readonly group = new THREE.Group();
  readonly turretBeams: THREE.ShaderMaterial[] = [];
  readonly turretCrystals: THREE.Mesh[] = [];
  private lanes = new THREE.Group();
  private timeUniforms: { value: number }[] = [];
  private crowdBob!: { uTime: { value: number }; uExcite: { value: number } };
  private nexusCrystal!: THREE.Mesh;
  private reeds!: THREE.InstancedMesh;
  private reedUniforms!: { uTime: { value: number }; uExcite: { value: number } };
  private wind = { value: 0 };

  constructor(quality: "low" | "med" | "high", private textures: TerrainTextures | null = null) {
    this.group.add(this.buildTerrain(quality));
    this.group.add(this.buildTrees(quality));
    this.group.add(this.buildMountains());
    this.group.add(this.buildCrowd(quality));
    this.group.add(this.buildTurrets());
    this.group.add(this.buildNexus());
    this.group.add(this.buildStartGate());
    this.group.add(this.buildReeds());
    this.group.add(this.buildGroundCover(quality));
    this.group.add(this.lanes);
  }

  private buildTerrain(quality: string): THREE.Group {
    const g = new THREE.Group();
    const width = WORLD_X1 - WORLD_X0;
    const xSegs = quality === "low" ? 200 : quality === "med" ? 340 : 460;
    const sand = new THREE.Color("#d9c38f");
    const grassA = new THREE.Color("#4e8a39");
    const grassB = new THREE.Color("#79b04f");
    const dark = new THREE.Color("#2f5a2a");
    const rock = new THREE.Color("#7b7266");
    const mat = terrainMaterial(this.textures);

    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(width, 70, xSegs, 64);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + (WORLD_X0 + WORLD_X1) / 2;
        // rows run from just inside the river bed to far out
        const zLocal = pos.getZ(i) + 35; // 0..70
        const z = side * (RIVER_HALF - 4 + zLocal);
        const h = groundHeight(x, z);
        pos.setXYZ(i, x, h, z);
        const n = fbm(x * 0.05, z * 0.05);
        c.copy(grassA).lerp(grassB, n).lerp(dark, smoothstep(0.55, 0.8, fbm(x * 0.02 + 3, z * 0.03)) * 0.6);
        if (h < 0.55) c.lerp(sand, 1 - smoothstep(0.2, 0.55, h));
        if (h > 6) c.lerp(rock, smoothstep(6, 12, h) * 0.8);
        colors.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      if (side < 0) geo.index!.array.reverse(); // keep faces pointing up after mirroring
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    // riverbed so the water has something under it at glancing angles
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(width, RIVER_HALF * 2 + 6).rotateX(-Math.PI / 2).translate((WORLD_X0 + WORLD_X1) / 2, -2.2, 0),
      new THREE.MeshStandardMaterial({ color: "#2a4a3a", roughness: 1 }),
    );
    g.add(bed);
    return g;
  }

  private buildTrees(quality: string): THREE.Group {
    const g = new THREE.Group();
    const { broadleaf, conifer } = fluffyTreeGeometries();
    const pine = conifer;
    const round = broadleaf;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    addWind(mat, this.wind, 0.22, 5);

    const spots: { x: number; z: number; s: number; r: number }[] = [];
    const step = quality === "low" ? 7 : 4.2;
    for (let x = WORLD_X0; x < WORLD_X1; x += step) {
      for (let zz = RIVER_HALF + 7; zz < RIVER_HALF + 66; zz += step) {
        for (const side of [-1, 1]) {
          const jx = x + (hash2(x * 7, zz * 3 + side) - 0.5) * step;
          const jz = side * (zz + (hash2(x * 5 + side, zz * 11) - 0.5) * step);
          if (fbm(jx * 0.03, jz * 0.03) < 0.42) continue; // clearings
          if (inChannelArea(jx, jz, 2) || inBaronArea(jx, jz)) continue;
          if (jx > L + 30 && jx < L + 75 && side > 0 && zz < RIVER_HALF + 30) continue; // podium clearing
          spots.push({ x: jx, z: jz, s: 0.8 + hash2(jx, jz) * 0.9, r: hash2(jz, jx) * Math.PI * 2 });
        }
      }
    }
    const pines = spots.filter((_, i) => i % 3 !== 0);
    const rounds = spots.filter((_, i) => i % 3 === 0);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tmpC = new THREE.Color();
    for (const [geo, list] of [[pine, pines], [round, rounds]] as const) {
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.r);
        m.compose(new THREE.Vector3(p.x, groundHeight(p.x, p.z) - 0.1, p.z), q, new THREE.Vector3(p.s, p.s * (0.9 + hash2(i, 3) * 0.4), p.s));
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, tmpC.setHSL(0.18 + hash2(i, 9) * 0.12, 0.35 + hash2(i, 8) * 0.3, 0.72 + hash2(i, 4) * 0.25));
      });
      inst.castShadow = quality !== "low";
      inst.receiveShadow = true;
      g.add(inst);
    }
    return g;
  }

  private buildMountains(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    for (let i = 0; i < 28; i++) {
      const side = i % 2 ? 1 : -1;
      const x = WORLD_X0 + (i / 28) * (WORLD_X1 - WORLD_X0 + 200) + hash2(i, 1) * 30;
      const z = side * (120 + hash2(i, 2) * 70);
      const h = 40 + hash2(i, 3) * 55;
      const r = 30 + hash2(i, 4) * 30;
      const cone = new THREE.Mesh(mountainGeometry(r, h, i), mat);
      cone.position.set(x, -4, z);
      cone.rotation.y = hash2(i, 5) * 3;
      g.add(cone);
    }
    // the far end so the river doesn't just stop
    const far = new THREE.Mesh(mountainGeometry(90, 120, 99), mat);
    far.position.set(WORLD_X1 + 120, -15, 0);
    g.add(far);
    return g;
  }

  private buildCrowd(quality: string): THREE.Group {
    const g = new THREE.Group();
    const duck = merge([
      tint(new THREE.SphereGeometry(0.42, 18, 12).scale(1.2, 0.85, 1), "#ffd23f"),
      tint(at(new THREE.SphereGeometry(0.28, 16, 12), 0.3, 0.45, 0), "#ffd23f"),
      tint(at(new THREE.ConeGeometry(0.1, 0.25, 6).rotateZ(-Math.PI / 2), 0.62, 0.42, 0), "#ff8a1f"),
      tint(at(new THREE.SphereGeometry(0.045, 6, 4), 0.5, 0.55, 0.14), "#111"),
      tint(at(new THREE.SphereGeometry(0.045, 6, 4), 0.5, 0.55, -0.14), "#111"),
    ]);
    // baked ambient occlusion: undersides and the neck crease go dark so the crowd doesn't glow
    {
      const pos = duck.attributes.position;
      const col = duck.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const ao = 0.38 + 0.62 * smoothstep(-0.32, 0.38, y);
        col.setXYZ(i, col.getX(i) * ao, col.getY(i) * ao, col.getZ(i) * ao);
      }
    }
    // matte vinyl rather than glossy: they're background, the racers should own the highlights
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.35 });
    // bob each crowd duck by its instance id; uExcite makes them bounce harder when the race is close
    this.crowdBob = addInstanceBob(
      mat,
      WAVE_GLSL,
      `float ph = float(gl_InstanceID) * 1.73;
       transformed.y += abs(sin(uTime * (3.0 + uExcite * 5.0) + ph)) * (0.08 + uExcite * 0.45);
       transformed.x += sin(uTime * 1.5 + ph) * 0.04;`,
    );
    const spots: { x: number; z: number; side: number }[] = [];
    const step = quality === "low" ? 3.2 : 2.0;
    for (let x = -10; x < L + 25; x += step) {
      for (const row of [2.4, 4.0, 5.6]) {
        for (const side of [-1, 1]) {
          const z = side * (RIVER_HALF + row + (hash2(x, row) - 0.5) * 0.6);
          const xx = x + (hash2(row, x) - 0.5) * 0.8;
          if (inChannelArea(xx, z, 3) || inBaronArea(xx, z)) continue;
          if (TURRET_FRACS.some((f) => Math.abs(xx - f * L) < 5)) continue;
          if (Math.abs(xx - L) < 6) continue;
          spots.push({ x: xx, z, side });
        }
      }
    }
    const inst = new THREE.InstancedMesh(duck, mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    spots.forEach((p, i) => {
      // face the river
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.side > 0 ? Math.PI / 2 : -Math.PI / 2);
      const s = 0.9 + hash2(i, 7) * 0.4;
      m.compose(new THREE.Vector3(p.x, Math.max(groundHeight(p.x, p.z), 0) + 0.3, p.z), q, new THREE.Vector3(s, s, s));
      inst.setMatrixAt(i, m);
      const roll = hash2(i, 11);
      // slightly dimmed and varied so the stands read as a crowd, not a wall of bright yellow
      const shade = 0.72 + hash2(i, 17) * 0.22;
      if (roll < 0.62) c.setRGB(shade, shade * 0.97, shade * 0.9);
      else if (roll < 0.85) c.copy(p.side < 0 ? BLUE : RED).lerp(new THREE.Color("#fff"), 0.3).multiplyScalar(shade);
      else c.setHSL(hash2(i, 13), 0.55, 0.55 * shade);
      inst.setColorAt(i, c);
    });
    inst.castShadow = quality !== "low";
    inst.receiveShadow = true;
    g.add(inst);
    return g;
  }

  private buildTurrets(): THREE.Group {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: "#8d8a83", roughness: 0.8, flatShading: true });
    const trim = new THREE.MeshStandardMaterial({ color: "#c9a54a", roughness: 0.35, metalness: 0.8 });
    TURRET_FRACS.forEach((f) => {
      const x = f * L;
      for (const side of [-1, 1]) {
        const color = side < 0 ? BLUE : RED;
        const t = new THREE.Group();
        const z = side * (RIVER_HALF + 2.6);
        t.position.set(x, Math.max(groundHeight(x, z), 0), z);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 2.2, 8), stone);
        base.position.y = 1.1;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.3, 5, 8), stone);
        shaft.position.y = 4.6;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.18, 8, 24), trim);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 7.2;
        const crystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.9, 0),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.2 }),
        );
        crystal.position.y = 8.6;
        crystal.scale.y = 1.6;
        this.turretCrystals.push(crystal);
        for (const p of [base, shaft, ring]) p.castShadow = true;
        t.add(base, shaft, ring, crystal);
        g.add(t);
      }
      // the gate beam spanning the river, lights up when the turret fires
      const beamMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uActive: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform float uActive; varying vec2 vUv;
          void main(){
            float fade = smoothstep(1.0, 0.0, vUv.y) * smoothstep(0.0, 0.08, vUv.y);
            float bands = 0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * 18.0);
            float side = mix(1.0, 0.0, step(0.5, vUv.x));
            vec3 col = mix(vec3(1.0, 0.35, 0.3), vec3(0.35, 0.6, 1.0), side);
            float a = fade * (0.05 + uActive * (0.55 + 0.45 * bands));
            gl_FragColor = vec4(col * (1.0 + uActive * 2.0), a);
          }`,
      });
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_HALF * 2, 5), beamMat);
      beam.rotation.y = Math.PI / 2;
      beam.position.set(x, 2.5, 0);
      this.turretBeams.push(beamMat);
      this.timeUniforms.push(beamMat.uniforms.uTime);
      g.add(beam);
    });
    return g;
  }

  private buildNexus(): THREE.Group {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: "#a39d93", roughness: 0.7, flatShading: true });
    const gold = new THREE.MeshStandardMaterial({ color: "#d9b25a", roughness: 0.3, metalness: 0.9 });
    const glow = new THREE.MeshStandardMaterial({ color: "#7dd3fc", emissive: "#38bdf8", emissiveIntensity: 3, roughness: 0.2 });
    const R = RIVER_HALF + 2.5;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(R, 1.3, 10, 64, Math.PI), stone);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(L, -1, 0);
    arch.castShadow = true;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R - 1.4, 0.22, 8, 96, Math.PI), glow);
    inner.rotation.y = Math.PI / 2;
    inner.position.set(L, -1, 0);
    const trimRing = new THREE.Mesh(new THREE.TorusGeometry(R + 1.25, 0.3, 8, 64, Math.PI), gold);
    trimRing.rotation.y = Math.PI / 2;
    trimRing.position.set(L, -1, 0);
    g.add(arch, inner, trimRing);
    this.nexusCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.6, 0),
      new THREE.MeshStandardMaterial({ color: "#a5f3fc", emissive: "#22d3ee", emissiveIntensity: 2.5, roughness: 0.1 }),
    );
    this.nexusCrystal.scale.y = 1.5;
    this.nexusCrystal.position.set(L, R + 4.5, 0);
    g.add(this.nexusCrystal);

    // floating checkered finish strip
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 32;
    const ctx = cv.getContext("2d")!;
    for (let i = 0; i < 64; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#111" : "#f8f8f8";
      ctx.fillRect(i * 8, j * 8, 8, 8);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, RIVER_HALF * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    tex.center.set(0.5, 0.5);
    tex.rotation = Math.PI / 2;
    strip.position.set(L, 0.05, 0);
    g.add(strip);
    return g;
  }

  private buildStartGate(): THREE.Group {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: "#7a5532", roughness: 0.9 });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 12, 8), wood);
      post.position.set(-3, 4, side * (RIVER_HALF + 1));
      post.castShadow = true;
      g.add(post);
    }
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 128;
    const ctx = cv.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, "#1d4ed8");
    grad.addColorStop(0.5, "#0f172a");
    grad.addColorStop(1, "#b91c1c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 128);
    ctx.strokeStyle = "#d9b25a";
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 1016, 120);
    ctx.fillStyle = "#f5d98b";
    ctx.font = "bold 64px Cinzel, Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SUMMONER'S RIVER", 512, 68);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_HALF * 2, 4.5), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    banner.material.side = THREE.FrontSide;
    banner.rotation.y = -Math.PI / 2;
    banner.position.set(-3.05, 8.5, 0);
    // second copy facing the other way so the text never reads mirrored
    const back = banner.clone();
    back.rotation.y = Math.PI / 2;
    back.position.x = -2.95;
    g.add(banner, back);
    return g;
  }

  private buildReeds(): THREE.Group {
    const g = new THREE.Group();
    const geo = tint(new THREE.ConeGeometry(0.06, 1.8, 4).translate(0, 0.9, 0), "#7f9b3c");
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.reedUniforms = addInstanceBob(mat, WAVE_GLSL, `transformed.x += sin(uTime * 1.7 + ip.x * 0.7 + ip.z) * 0.12 * position.y;`);
    const spots: THREE.Vector3[] = [];
    for (let i = 0; i < 1400; i++) {
      const x = CHANNEL.x0 - 6 + hash2(i, 1) * (CHANNEL.x1 - CHANNEL.x0 + 12);
      const z = CHANNEL.z + (hash2(i, 2) - 0.5) * 9;
      if (Math.abs(z - CHANNEL.z) < 1.1 && hash2(i, 3) < 0.85) continue; // keep the middle swimmable
      spots.push(new THREE.Vector3(x, Math.max(groundHeight(x, z), -0.6), z));
    }
    this.reeds = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => {
      const s = 0.7 + hash2(i, 5) * 0.8;
      m.makeScale(s, s * (0.8 + hash2(i, 6) * 0.8), s).setPosition(p);
      this.reeds.setMatrixAt(i, m);
    });
    g.add(this.reeds);
    return g;
  }

  /** Lane ropes with floating buoys. Rebuilt per race since lane count changes. */
  setLanes(n: number): void {
    this.lanes.clear();
    const lw = laneWidth(n);
    const ropes: number[] = [];
    for (let i = 0; i <= n; i++) ropes.push((i - n / 2) * lw);
    const buoyGeo = new THREE.SphereGeometry(0.15, 10, 8);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.35 });
    const bob = addInstanceBob(mat, WAVE_GLSL);
    this.timeUniforms.push(bob.uTime);
    const spacing = 3.4;
    const perRope = Math.ceil((L + 10) / spacing);
    const inst = new THREE.InstancedMesh(buoyGeo, mat, ropes.length * perRope);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let k = 0;
    ropes.forEach((z, ri) => {
      for (let j = 0; j < perRope; j++) {
        const x = -5 + j * spacing;
        m.makeTranslation(x, 0.05, z);
        inst.setMatrixAt(k, m);
        if (ri === 0) c.copy(BLUE);
        else if (ri === ropes.length - 1) c.copy(RED);
        else c.set(j % 2 ? "#f8fafc" : "#facc15");
        inst.setColorAt(k, c);
        k++;
      }
    });
    this.lanes.add(inst);
  }

  /** Grass, bushes, flowers and shoreline rocks. */
  private buildGroundCover(quality: string): THREE.Group {
    const g = new THREE.Group();
    const grassCount = quality === "high" ? 70000 : quality === "med" ? 32000 : 9000;
    const grass = buildGrass(grassCount, (i) => {
      const side = hash2(i, 31) < 0.5 ? -1 : 1;
      const x = -30 + hash2(i, 32) * (L + 110);
      const zz = RIVER_HALF + 0.6 + Math.pow(hash2(i, 33), 1.6) * 34;
      const z = side * zz;
      if (inChannelArea(x, z, -1)) return null;
      const y = groundHeight(x, z);
      if (y < 0.3) return null;
      return { x, y, z };
    }, this.wind);
    g.add(grass);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const { bush } = fluffyTreeGeometries();
    const bushMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    addWind(bushMat, this.wind, 0.08, 1.2);
    const bushes = new THREE.InstancedMesh(bush, bushMat, 700);
    let n = 0;
    for (let i = 0; i < 2000 && n < 700; i++) {
      const side = hash2(i, 41) < 0.5 ? -1 : 1;
      const x = -40 + hash2(i, 42) * (L + 140);
      const z = side * (RIVER_HALF + 5 + hash2(i, 43) * 28);
      if (inChannelArea(x, z, 1) || inBaronArea(x, z) || TURRET_FRACS.some((f) => Math.abs(x - f * L) < 6)) continue;
      const y = groundHeight(x, z);
      if (y < 0.4) continue;
      const sc = 0.8 + hash2(i, 44) * 1.2;
      m.compose(p.set(x, y - 0.1, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash2(i, 45) * 6), s.set(sc, sc * 0.9, sc));
      bushes.setMatrixAt(n++, m);
    }
    bushes.count = n;
    bushes.castShadow = quality !== "low";
    bushes.receiveShadow = true;
    g.add(bushes);

    const flowerColors = ["#ff7eb6", "#fff1a8", "#b8a4ff", "#ffffff", "#ff9f5a"];
    const flowerMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    addWind(flowerMat, this.wind, 0.18, 0.5);
    flowerColors.forEach((col, ci) => {
      const per = quality === "low" ? 120 : 520;
      const inst = new THREE.InstancedMesh(flowerGeometry(col), flowerMat, per);
      let k = 0;
      for (let i = 0; i < per * 3 && k < per; i++) {
        const seed = i * 7 + ci * 1000;
        // flowers grow in little patches
        const patchX = -20 + hash2(Math.floor(seed / 40), 51) * (L + 80);
        const side = hash2(Math.floor(seed / 40), 52) < 0.5 ? -1 : 1;
        const x = patchX + (hash2(seed, 53) - 0.5) * 9;
        const z = side * (RIVER_HALF + 1.5 + hash2(Math.floor(seed / 40), 54) * 20 + (hash2(seed, 55) - 0.5) * 5);
        if (inChannelArea(x, z)) continue;
        const y = groundHeight(x, z);
        if (y < 0.35) continue;
        const sc = 0.8 + hash2(seed, 56) * 0.7;
        m.compose(p.set(x, y - 0.02, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash2(seed, 57) * 6), s.set(sc, sc, sc));
        inst.setMatrixAt(k++, m);
      }
      inst.count = k;
      g.add(inst);
    });

    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    for (let v = 0; v < 3; v++) {
      const inst = new THREE.InstancedMesh(rockGeometry(v * 13 + 1), rockMat, 120);
      let k = 0;
      for (let i = 0; i < 400 && k < 120; i++) {
        const seed = i + v * 997;
        const side = hash2(seed, 61) < 0.5 ? -1 : 1;
        const x = -40 + hash2(seed, 62) * (L + 150);
        const shore = hash2(seed, 63) < 0.55;
        const z = side * (shore ? RIVER_HALF - 0.4 + hash2(seed, 64) * 2.2 : RIVER_HALF + 6 + hash2(seed, 64) * 30);
        if (inChannelArea(x, z, 2) || Math.abs(x - L) < 8) continue;
        const y = groundHeight(x, z);
        const sc = shore ? 0.35 + hash2(seed, 65) * 0.6 : 0.5 + hash2(seed, 65) * 1.6;
        m.compose(p.set(x, Math.max(y, -0.4) - sc * 0.15, z), q.setFromEuler(new THREE.Euler(hash2(seed, 66), hash2(seed, 67) * 6, hash2(seed, 68))), s.set(sc, sc, sc));
        inst.setMatrixAt(k++, m);
      }
      inst.count = k;
      inst.castShadow = quality !== "low";
      inst.receiveShadow = true;
      g.add(inst);
    }
    return g;
  }

  update(time: number, turretActive: boolean[], crowdExcite: number): void {
    this.wind.value = time;
    for (const u of this.timeUniforms) u.value = time;
    this.crowdBob.uTime.value = time;
    this.crowdBob.uExcite.value += (crowdExcite - this.crowdBob.uExcite.value) * 0.05;
    this.reedUniforms.uTime.value = time;
    this.turretBeams.forEach((m, i) => {
      const target = turretActive[i] ? 1 : 0;
      m.uniforms.uActive.value += (target - m.uniforms.uActive.value) * 0.35;
    });
    this.turretCrystals.forEach((c, i) => {
      c.rotation.y = time * 0.8 + i;
      c.position.y = 8.6 + Math.sin(time * 1.6 + i) * 0.25;
      const active = turretActive[Math.floor(i / 2)];
      (c.material as THREE.MeshStandardMaterial).emissiveIntensity = active ? 6 : 2.2;
    });
    this.nexusCrystal.rotation.y = time * 0.5;
    this.nexusCrystal.position.y = RIVER_HALF + 2.5 + 4.5 + Math.sin(time) * 0.6;
  }
}

/** Craggy mountain with rock-to-snow vertex colours (smooth shaded, fades into the fog). */
function mountainGeometry(r: number, h: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(r, h, 24, 10).toNonIndexed();
  geo.translate(0, h / 2, 0);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const rock = new THREE.Color("#55606e"), rockHi = new THREE.Color("#8d8f96"), snow = new THREE.Color("#f2f5fa"), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = y / h;
    const ang = Math.atan2(z, x);
    const n = fbm(ang * 2.2 + seed, k * 4 + seed * 0.3);
    const ridge = 1 + (n - 0.5) * 0.55 * (1 - k * 0.6);
    pos.setXYZ(i, x * ridge, y * (1 + (n - 0.5) * 0.12), z * ridge);
    c.copy(rock).lerp(rockHi, n);
    c.lerp(snow, smoothstep(0.62, 0.78, k + (n - 0.5) * 0.25));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}
