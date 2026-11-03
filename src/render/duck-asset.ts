import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Poly Haven "Rubber Duck Toy" (CC0, by Plat251): the base mesh for every duck.
 * Model space: Y up, head toward +Z, ~0.29 units tall. We split it at the neck so the head can turn.
 */
export interface DuckAsset {
  geometry: THREE.BufferGeometry;
  map: THREE.Texture;
  normalMap: THREE.Texture | null;
  arm: THREE.Texture | null;
}

export const DUCK_MODEL = {
  /** model units -> world units (matches the old procedural duck's ~1.6 length) */
  scale: 5.3,
  /** sink it so roughly the bottom fifth sits under the waterline */
  sink: -0.2,
  /** neck pivot in model space */
  pivot: new THREE.Vector3(0, 0.15, 0.045),
  /** head centre in model space (hats and headsets hang off this) */
  headCenter: new THREE.Vector3(0, 0.215, 0.06),
  bboxMin: new THREE.Vector3(-0.107, 0, -0.146),
  bboxMax: new THREE.Vector3(0.107, 0.285, 0.154),
};

let asset: DuckAsset | null = null;

export const getDuckAsset = () => asset;

export async function loadDuckAsset(url: string): Promise<DuckAsset | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    let src: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
    });
    if (!src) return null;
    const mesh = src as THREE.Mesh;
    const geo = mesh.geometry;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    asset = { geometry: geo, map: mat.map!, normalMap: mat.normalMap, arm: mat.roughnessMap ?? mat.metalnessMap };
    for (const t of [asset.map, asset.normalMap, asset.arm]) if (t) t.anisotropy = 8;
    return asset;
  } catch (err) {
    console.warn("Duck model failed to load, using the procedural duck instead", err);
    return null;
  }
}

const PATTERN_IDS: Record<string, number> = { none: 0, dots: 1, stripes: 2, belly: 3, bandit: 4 };

/**
 * One shader for every rubber duck (so they share a single GPU program): per-duck colour rides in the
 * standard `diffuse` uniform and the pattern id in `opacity`. The orange body of the scanned texture is
 * re-hued to the duck's colour while the red beak, eyes and grime stay as authored.
 */
function rubberCompile(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms) {
  const min = DUCK_MODEL.bboxMin, max = DUCK_MODEL.bboxMax;
  // per-material uniform (three calls onBeforeCompile per material even when the GL program is shared)
  shader.uniforms.uHead = this.userData.head;
  if (this.userData.headOnly) shader.fragmentShader = "#define RD_HEAD_ONLY\n" + shader.fragmentShader;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>
      varying vec3 vMPos;
      uniform mat4 uHead;
      // how much of the neck rotation a vertex takes: head and neck yes, tail and body no
      float rdHeadW(vec3 p) { return smoothstep(0.128, 0.168, p.y) * smoothstep(-0.07, -0.025, p.z); }`)
    .replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>
      objectNormal = normalize(mix(objectNormal, mat3(uHead) * objectNormal, rdHeadW(position)));`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vMPos = position;
      transformed = mix(transformed, (uHead * vec4(transformed, 1.0)).xyz, rdHeadW(position));`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vMPos;")
    .replace(
      "#include <map_fragment>",
      /* glsl */ `
      // Branch-free on purpose: the D3D compiler behind ANGLE mis-optimised an HSV + if/else version.
      vec4 rdTex = texture2D(map, vMapUv);
      vec3 rdT = max(rdTex.rgb, vec3(1e-4));
      // orange plastic: green ~1/3 of red (linear). The red beak is ~0.03, the eyes are dark, the screw grey.
      float rdRatio = rdT.g / rdT.r;
      float rdBody = smoothstep(0.12, 0.2, rdRatio) * (1.0 - smoothstep(0.62, 0.8, rdRatio))
                   * smoothstep(0.2, 0.4, rdT.r) * (1.0 - smoothstep(0.25, 0.45, rdT.b / rdT.r));
      float rdShade = clamp(rdT.r / 0.84, 0.0, 1.25);
      vec3 rdTarget = diffuse;
      vec3 rdN = (vMPos - vec3(${min.x.toFixed(3)}, ${min.y.toFixed(3)}, ${min.z.toFixed(3)})) /
                 vec3(${(max.x - min.x).toFixed(3)}, ${(max.y - min.y).toFixed(3)}, ${(max.z - min.z).toFixed(3)});
      float rdId = floor((1.0 - opacity) * 100.0 + 0.5);
      float wDots = 1.0 - min(abs(rdId - 1.0), 1.0);
      float wStripes = 1.0 - min(abs(rdId - 2.0), 1.0);
      float wBelly = 1.0 - min(abs(rdId - 3.0), 1.0);
      float wBandit = 1.0 - min(abs(rdId - 4.0), 1.0);
      vec3 rdLight = mix(rdTarget, vec3(1.0), 0.6);
      vec3 rdAccent = mix(vec3(1.0) - rdTarget, vec3(0.95, 0.92, 0.85), 0.25);
      float dots = 1.0 - smoothstep(0.24, 0.29, length(fract(vMPos * 48.0) - 0.5));
      float stripes = smoothstep(0.42, 0.48, abs(fract(rdN.z * 7.0) - 0.5));
      float belly = 1.0 - smoothstep(0.18, 0.32, rdN.y);
      float band = smoothstep(0.71, 0.735, rdN.y) * (1.0 - smoothstep(0.79, 0.815, rdN.y)) * smoothstep(0.66, 0.72, rdN.z);
      vec3 rdCol = rdTarget;
      rdCol = mix(rdCol, rdLight, dots * wDots);
      rdCol = mix(rdCol, rdAccent, stripes * wStripes);
      rdCol = mix(rdCol, rdLight, belly * wBelly);
      rdCol = mix(rdCol, vec3(0.012), band * wBandit);
      #ifdef RD_HEAD_ONLY
        if (smoothstep(0.128, 0.168, vMPos.y) * smoothstep(-0.07, -0.025, vMPos.z) < 0.5) discard;
      #endif
      diffuseColor.rgb = mix(rdTex.rgb, rdCol * rdShade, rdBody);
      diffuseColor.a = 1.0;
      `,
    )
    .replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `#include <emissivemap_fragment>
      float rdRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
      totalEmissiveRadiance += vec3(0.66, 0.86, 1.0) * rdRim * 0.35;`,
    );
}

/** `head` lets a second material (a caster's tinted head) share the same neck rotation uniform. */
export function rubberMaterial(a: DuckAsset, color: THREE.ColorRepresentation, pattern: string, head?: { value: THREE.Matrix4 }): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    map: a.map,
    normalMap: a.normalMap,
    roughnessMap: a.arm,
    metalnessMap: a.arm,
    aoMap: a.arm,
    aoMapIntensity: 0.8,
    roughness: 0.9,
    metalness: 0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.1,
    specularIntensity: 0.65,
    envMapIntensity: 1.05,
    sheen: 0.12,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color("#fff3d6"),
    normalScale: new THREE.Vector2(1.4, 1.4),
    opacity: 1 - (PATTERN_IDS[pattern] ?? 0) / 100,
    side: THREE.FrontSide,
  });
  mat.userData.head = head ?? { value: new THREE.Matrix4() };
  mat.onBeforeCompile = rubberCompile;
  mat.customProgramCacheKey = function (this: THREE.Material) {
    return this.userData.headOnly ? "rubber-duck-head-v3" : "rubber-duck-v3";
  };
  return mat;
}
