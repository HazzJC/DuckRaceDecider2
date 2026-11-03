import * as THREE from "three";

/** Rim-lit transparent shell (ice blocks, shield bubbles, auras). Optional hex pattern for shields. */
export function fresnelMaterial(color: THREE.ColorRepresentation, opts: { hex?: boolean; base?: number; power?: number } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uBase: { value: opts.base ?? 0.08 },
      uPower: { value: opts.power ?? 2.5 },
      uHex: { value: opts.hex ? 1 : 0 },
      uCrack: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vP = position;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uAlpha, uBase, uPower, uHex, uCrack;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float hexGrid(vec2 p){
        p *= 7.0;
        vec2 r = vec2(1.0, 1.732);
        vec2 h = r * 0.5;
        vec2 a = mod(p, r) - h;
        vec2 b = mod(p - h, r) - h;
        vec2 g = dot(a, a) < dot(b, b) ? a : b;
        float d = max(abs(g.x) * 0.866 + abs(g.y) * 0.5, abs(g.y));
        return smoothstep(0.42, 0.48, d);
      }
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        float a = uBase + f;
        if (uHex > 0.5) {
          vec2 uv = vec2(atan(vP.z, vP.x), vP.y * 1.6);
          a += hexGrid(uv) * (0.25 + 0.2 * sin(uTime * 4.0 + vP.y * 6.0));
        }
        a *= 1.0 - uCrack * step(0.5, fract(sin(dot(floor(vP.xy * 9.0), vec2(12.9, 78.2))) * 43758.5));
        gl_FragColor = vec4(uColor * (0.6 + f * 1.6), clamp(a, 0.0, 1.0) * uAlpha);
      }`,
  });
}

/** Flickering additive flame for Ignite. */
export function flameMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        p.x += sin(uTime * 13.0 + p.y * 6.0) * 0.06 * p.y;
        p.z += cos(uTime * 11.0 + p.y * 5.0) * 0.06 * p.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAlpha; varying vec2 vUv;
      void main(){
        float h = vUv.y;
        float flick = 0.75 + 0.25 * sin(uTime * 25.0 + vUv.x * 20.0);
        vec3 col = mix(vec3(1.0, 0.85, 0.3), vec3(1.0, 0.25, 0.05), h);
        float a = (1.0 - h) * flick * uAlpha;
        gl_FragColor = vec4(col * 2.0, a);
      }`,
  });
}
