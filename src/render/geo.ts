import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Paint a whole geometry one vertex colour (so several parts can be merged into one mesh). */
export function tint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  // drop uvs so merged parts always share the same attribute set
  g.deleteAttribute("uv");
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error("geometry merge failed");
  g.computeVertexNormals();
  return g;
}

export const at = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => geo.translate(x, y, z);

/**
 * Injects a gentle wave bob into an instanced material (each instance floats on the shared water waves).
 * Returns the time uniform to drive per frame.
 */
export function addInstanceBob(
  material: THREE.Material,
  waveGlsl: string,
  extra = "",
): { uTime: { value: number }; uExcite: { value: number } } {
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uExcite = uniforms.uExcite;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;\nuniform float uExcite;\n${waveGlsl}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 ip = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          ${extra || "transformed.y += waveHeight(ip.xz, uTime);"}
        #endif`,
      );
  };
  return uniforms;
}
