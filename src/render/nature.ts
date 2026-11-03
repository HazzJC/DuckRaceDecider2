import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fbm, hash2 } from "./noise";

/** Shared GLSL value-noise helpers. */
export const NOISE_GLSL = /* glsl */ `
float n_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n_noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(n_hash(i), n_hash(i + vec2(1, 0)), u.x), mix(n_hash(i + vec2(0, 1)), n_hash(i + vec2(1, 1)), u.x), u.y);
}
float n_fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += n_noise(p) * a; p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}
`;

export type Wind = { value: number };

/**
 * Painterly terrain. With the CC0 photo textures loaded it samples grass and sand top-down (two scales blended
 * by noise to hide tiling) and rock triplanar on slopes, then pushes them toward a saturated hand-painted
 * palette so they sit with the stylised ducks. Normal maps add surface detail; wet sand is glossier.
 * Without textures it falls back to purely procedural colour.
 */
export function terrainMaterial(t: import("./assets").TerrainTextures | null): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    if (t) {
      shader.uniforms.tGrass = { value: t.grass };
      shader.uniforms.tGrassN = { value: t.grassN };
      shader.uniforms.tRock = { value: t.rock };
      shader.uniforms.tRockN = { value: t.rockN };
      shader.uniforms.tSand = { value: t.sand };
      shader.uniforms.tSandN = { value: t.sandN };
    }
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNormal;
        ${t ? "#define TERRAIN_TEX\nuniform sampler2D tGrass, tGrassN, tRock, tRockN, tSand, tSandN;" : ""}
        ${NOISE_GLSL}`,
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        vec2 tp = vWPos.xz;
        float tSlope = 1.0 - clamp(vWNormal.y, 0.0, 1.0);
        float tBig = n_fbm(tp * 0.035);
        float tMid = n_fbm(tp * 0.18 + 3.0);
        float tH = vWPos.y;
        float tSandW = 1.0 - smoothstep(0.25, 0.8, tH + (tMid - 0.5) * 0.3);
        float tWetW = (1.0 - smoothstep(-0.1, 0.25, tH)) * 0.85;
        float tRockW = smoothstep(0.36, 0.58, tSlope + (tMid - 0.5) * 0.25);
        float tSnowW = smoothstep(13.0, 17.0, tH + tMid * 3.0) * (1.0 - tSlope);
        {
          vec3 grassPal = mix(vec3(0.16, 0.37, 0.09), vec3(0.44, 0.66, 0.19), smoothstep(0.25, 0.75, tBig));
          grassPal = mix(grassPal, vec3(0.62, 0.66, 0.24), smoothstep(0.62, 0.85, tMid) * 0.5);
          vec3 sandPal = vec3(0.86, 0.76, 0.52);
          vec3 rockPal = vec3(0.5, 0.48, 0.45);
          #ifdef TERRAIN_TEX
            vec3 g1 = texture2D(tGrass, tp * 0.21).rgb;
            vec3 g2 = texture2D(tGrass, tp * 0.057 + 0.37).rgb;
            vec3 gT = mix(g1, g2, smoothstep(0.35, 0.65, tBig));
            float gL = dot(gT, vec3(0.3, 0.59, 0.11));
            // keep the photo's detail (its luminance) but take colour from the painted palette
            vec3 grass = grassPal * (0.45 + gL * 2.4);
            vec3 sT = texture2D(tSand, tp * 0.28).rgb;
            vec3 sand = mix(sT * 1.15, sandPal * (0.5 + dot(sT, vec3(0.33)) * 1.4), 0.5);
            vec3 bw = pow(abs(vWNormal), vec3(4.0));
            bw /= (bw.x + bw.y + bw.z);
            vec3 rT = texture2D(tRock, vWPos.zy * 0.16).rgb * bw.x + texture2D(tRock, tp * 0.16).rgb * bw.y + texture2D(tRock, vWPos.xy * 0.16).rgb * bw.z;
            vec3 rock = mix(rT * 1.1, rockPal * (0.4 + dot(rT, vec3(0.33)) * 1.6), 0.35);
          #else
            float ang = n_noise(tp * 0.02) * 6.283;
            vec2 dir = vec2(cos(ang), sin(ang));
            float stroke = n_noise(vec2(dot(tp, dir) * 0.9, dot(tp, vec2(-dir.y, dir.x)) * 3.5));
            vec3 grass = grassPal * (0.86 + stroke * 0.28);
            vec3 sand = sandPal * (0.9 + tMid * 0.15);
            vec3 rock = mix(vec3(0.42, 0.40, 0.38), vec3(0.62, 0.58, 0.52), n_noise(vec2(tp.x * 0.3, tH * 1.6)));
          #endif
          vec3 dirt = vec3(0.45, 0.34, 0.2) * (0.85 + tMid * 0.3);
          grass = mix(grass, dirt, smoothstep(0.66, 0.74, n_fbm(tp * 0.07 + 9.0)) * 0.6);
          vec3 col = mix(grass, sand, tSandW);
          col = mix(col, sand * 0.5, tWetW);
          col = mix(col, rock, tRockW);
          col = mix(col, vec3(0.92, 0.94, 0.98), tSnowW);
          diffuseColor.rgb = col * mix(vec3(1.0), vColor * 1.6, 0.18);
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(0.95, 0.82, tRockW), 0.35, tWetW);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
        #ifdef TERRAIN_TEX
        {
          vec3 gn = texture2D(tGrassN, tp * 0.21).xyz * 2.0 - 1.0;
          vec3 sn = texture2D(tSandN, tp * 0.28).xyz * 2.0 - 1.0;
          vec3 rn = texture2D(tRockN, tp * 0.16).xyz * 2.0 - 1.0;
          vec3 tn = mix(mix(gn, sn, tSandW), rn, tRockW);
          // UVs are world XZ, so tangent = +X and bitangent = +Z
          vec3 wN = normalize(vWNormal + vec3(tn.x, 0.0, tn.y) * 0.85);
          normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
        }
        #endif`,
      );
  };
  return mat;
}

/** Bend normals away from a centre so blobby canopies shade like soft painted clumps. */
function sphericalNormals(geo: THREE.BufferGeometry, center: THREE.Vector3) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(center).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
}

function colored(geo: THREE.BufferGeometry, bottom: THREE.ColorRepresentation, top: THREE.ColorRepresentation, y0: number, y1: number) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const a = new THREE.Color(bottom), b = new THREE.Color(top), c = new THREE.Color();
  const pos = g.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    c.copy(a).lerp(b, k);
    arr.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

function jitter(geo: THREE.BufferGeometry, amount: number, seed: number) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = fbm(x * 1.7 + seed, z * 1.7 + y * 1.3) - 0.5;
    pos.setXYZ(i, x * (1 + n * amount), y * (1 + n * amount * 0.6), z * (1 + n * amount));
  }
  return geo;
}

/** Wind sway for instanced foliage. Height-weighted so trunks stay planted. */
export function addWind(mat: THREE.Material, wind: Wind, strength: number, heightScale: number) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float wh = max(0.0, position.y) / ${heightScale.toFixed(2)};
          float gust = sin(uWind * 1.3 + wOrigin.x * 0.08 + wOrigin.z * 0.05) * 0.6 + sin(uWind * 2.7 + wOrigin.x * 0.21) * 0.4;
          transformed.x += gust * wh * wh * ${strength.toFixed(3)};
          transformed.z += cos(uWind * 1.9 + wOrigin.z * 0.13) * wh * wh * ${(strength * 0.5).toFixed(3)};
        #endif`,
      );
  };
}

export function fluffyTreeGeometries() {
  // broadleaf: trunk + clustered soft canopy blobs
  const trunk = colored(new THREE.CylinderGeometry(0.16, 0.3, 2.0, 7).translate(0, 1.0, 0), "#4a3220", "#6e4d2e", 0, 2);
  const blobs: THREE.BufferGeometry[] = [];
  const center = new THREE.Vector3(0, 2.9, 0);
  const spec = [
    [0, 2.9, 0, 1.25], [0.75, 2.55, 0.35, 0.85], [-0.7, 2.6, -0.3, 0.9], [0.2, 3.55, -0.2, 0.85], [-0.3, 2.5, 0.75, 0.8], [0.35, 2.4, -0.75, 0.75],
  ];
  spec.forEach(([x, y, z, r], i) => {
    const b = jitter(new THREE.IcosahedronGeometry(r, 3), 0.18, i * 3.1).translate(x, y, z);
    sphericalNormals(b, center);
    blobs.push(colored(b, "#2c5a1e", "#8cc04a", 1.8, 4.1));
  });
  const broadleaf = mergeGeometries([trunk, ...blobs], false)!;

  // conifer: softened stacked cones
  const pineParts: THREE.BufferGeometry[] = [colored(new THREE.CylinderGeometry(0.14, 0.24, 1.4, 7).translate(0, 0.7, 0), "#3f2b1b", "#5e4128", 0, 1.4)];
  const pc = new THREE.Vector3(0, 2.6, 0);
  [[1.45, 2.0, 1.7], [1.1, 1.8, 2.7], [0.75, 1.5, 3.55], [0.42, 1.1, 4.3]].forEach(([r, h, y], i) => {
    const cone = jitter(new THREE.ConeGeometry(r, h, 14, 3), 0.12, i * 5.7).translate(0, y, 0);
    sphericalNormals(cone, pc.clone().setY(y - h * 0.3));
    pineParts.push(colored(cone, "#163f26", "#4f9a55", y - h / 2, y + h / 2));
  });
  const conifer = mergeGeometries(pineParts, false)!;

  // bush
  const bushParts: THREE.BufferGeometry[] = [];
  const bc = new THREE.Vector3(0, 0.4, 0);
  [[0, 0.45, 0, 0.7], [0.5, 0.35, 0.2, 0.5], [-0.45, 0.35, -0.15, 0.55]].forEach(([x, y, z, r], i) => {
    const b = jitter(new THREE.IcosahedronGeometry(r, 2), 0.2, i * 2.3 + 40).translate(x, y, z);
    sphericalNormals(b, bc);
    bushParts.push(colored(b, "#2a5520", "#7fb446", -0.1, 1.1));
  });
  const bush = mergeGeometries(bushParts, false)!;
  return { broadleaf, conifer, bush };
}

/** Thousands of instanced grass blades with root-to-tip colour and wind. */
export function buildGrass(count: number, place: (i: number) => { x: number; y: number; z: number } | null, wind: Wind): THREE.InstancedMesh {
  const blade = new THREE.BufferGeometry();
  // tapered 3-segment blade, normals up so it lights softly from both sides
  const h = 0.9;
  const verts = [-0.06, 0, 0, 0.06, 0, 0, -0.045, h * 0.4, 0, 0.045, h * 0.4, 0, -0.025, h * 0.75, 0.02, 0.025, h * 0.75, 0.02, 0, h, 0.05];
  const idx = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6];
  blade.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  blade.setIndex(idx);
  blade.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(7).fill(0).flatMap(() => [0, 1, 0]), 3));
  const cols: number[] = [];
  const root = new THREE.Color("#1f4214"), tip = new THREE.Color("#b5d65a"), c = new THREE.Color();
  for (let i = 0; i < 7; i++) {
    c.copy(root).lerp(tip, verts[i * 3 + 1] / h);
    cols.push(c.r, c.g, c.b);
  }
  blade.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  addWind(mat, wind, 0.35, h);
  const inst = new THREE.InstancedMesh(blade, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const tc = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count * 2 && n < count; i++) {
    const spot = place(i);
    if (!spot) continue;
    q.setFromEuler(new THREE.Euler((hash2(i, 1) - 0.5) * 0.4, hash2(i, 2) * Math.PI * 2, (hash2(i, 3) - 0.5) * 0.4));
    const sc = 0.6 + hash2(i, 4) * 0.9;
    s.set(sc, sc * (0.7 + hash2(i, 5) * 0.8), sc);
    m.compose(p.set(spot.x, spot.y - 0.05, spot.z), q, s);
    inst.setMatrixAt(n, m);
    inst.setColorAt(n, tc.setHSL(0.24 + (hash2(i, 6) - 0.5) * 0.06, 0.55, 0.5 + hash2(i, 7) * 0.25));
    n++;
  }
  inst.count = n;
  inst.receiveShadow = true;
  return inst;
}

export function rockGeometry(seed: number) {
  const g = jitter(new THREE.DodecahedronGeometry(1, 1), 0.35, seed);
  g.scale(1, 0.62, 1);
  g.computeVertexNormals();
  return colored(g, "#5d5850", "#9a958b", -0.6, 0.6);
}

export function flowerGeometry(petalColor: THREE.ColorRepresentation) {
  const parts: THREE.BufferGeometry[] = [colored(new THREE.CylinderGeometry(0.015, 0.02, 0.45, 4).translate(0, 0.22, 0), "#2f5a1d", "#4f8a2e", 0, 0.45)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(0.07, 6, 4).scale(1, 0.4, 0.6).translate(Math.cos(a) * 0.07, 0.46, Math.sin(a) * 0.07);
    parts.push(colored(petal, petalColor, petalColor, 0, 1));
  }
  parts.push(colored(new THREE.SphereGeometry(0.045, 6, 4).translate(0, 0.48, 0), "#ffcc33", "#ffcc33", 0, 1));
  return mergeGeometries(parts, false)!;
}

/** Drifting painterly cloud dome lit by the low sun. */
export function buildClouds(sunDir: THREE.Vector3): { mesh: THREE.Mesh; time: { value: number } } {
  const time = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    uniforms: { uTime: time, uSun: { value: sunDir.clone().normalize() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun; varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        if (vDir.y < 0.0) discard;
        vec2 uv = vDir.xz / (vDir.y + 0.18) * 1.6;
        uv += vec2(uTime * 0.012, uTime * 0.004);
        float d = n_fbm(uv * 1.2) * 0.65 + n_fbm(uv * 3.1 + 7.0) * 0.35;
        float cover = smoothstep(0.48, 0.72, d);
        float horizon = smoothstep(0.0, 0.08, vDir.y) * (1.0 - smoothstep(0.55, 0.9, vDir.y) * 0.5);
        float sunAmt = pow(max(dot(vDir, uSun), 0.0), 6.0);
        // thick parts darker, edges glowing gold toward the sun
        float thick = smoothstep(0.6, 0.85, d);
        vec3 lit = mix(vec3(1.0, 0.86, 0.68), vec3(1.0, 0.95, 0.88), vDir.y);
        vec3 shade = vec3(0.55, 0.5, 0.62);
        vec3 col = mix(lit, shade, thick * 0.55);
        col += vec3(1.0, 0.7, 0.35) * sunAmt * (1.0 - thick) * 1.6;
        gl_FragColor = vec4(col * 1.25, cover * horizon * 0.85);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, time };
}

/** Glowing pollen / firefly motes that drift around the camera's area. */
export class Motes {
  readonly points: THREE.Points;
  private time = { value: 0 };
  private center = { value: new THREE.Vector3() };

  constructor(count: number) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 12 + 0.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
      seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.time, uCenter: this.center },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform vec3 uCenter; varying float vA;
        void main() {
          vec3 p = position;
          p.x = mod(p.x - uCenter.x + 60.0 + uTime * 0.6, 120.0) - 60.0 + uCenter.x;
          p.y += sin(uTime * 0.7 + aSeed) * 0.6;
          p.z += cos(uTime * 0.5 + aSeed * 1.3) * 0.8;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (90.0 + 60.0 * sin(aSeed)) / -mv.z;
          vA = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 3.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(1.0, 0.92, 0.6) * 1.6, a * a * vA * 0.75);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  update(t: number, focusX: number) {
    this.time.value = t;
    this.center.value.set(focusX, 0, 0);
  }
}
