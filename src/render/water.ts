import * as THREE from "three";
import { RIVER_HALF, WAVE_GLSL, WORLD_X0, WORLD_X1, CHANNEL } from "./layout";

const WAKE_X0 = -40;
const WAKE_X1 = WORLD_X1 - 60;
const WAKE_Z = 26;

/**
 * Shader water: shared sine waves for displacement, procedural ripple normals, real planar reflections
 * (mirrored camera, oblique clip plane) distorted by the ripples, sun glitter, depth tint toward the banks,
 * sunlight ribbons in the shallows and foam read from a top-down wake canvas the ducks paint into.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private wakeCanvas: HTMLCanvasElement;
  private wakeCtx: CanvasRenderingContext2D;
  private wakeTex: THREE.CanvasTexture;
  private reflectRT: THREE.WebGLRenderTarget | null;
  private reflectScale: number;
  private mirrorCam = new THREE.PerspectiveCamera();
  private texMatrix = new THREE.Matrix4();

  constructor(sunDir: THREE.Vector3, wakeRes: number, reflectScale: number) {
    this.wakeCanvas = document.createElement("canvas");
    this.wakeCanvas.width = wakeRes;
    this.wakeCanvas.height = wakeRes / 8;
    this.wakeCtx = this.wakeCanvas.getContext("2d")!;
    this.wakeCtx.fillStyle = "#000";
    this.wakeCtx.fillRect(0, 0, this.wakeCanvas.width, this.wakeCanvas.height);
    this.wakeTex = new THREE.CanvasTexture(this.wakeCanvas);
    this.wakeTex.minFilter = THREE.LinearFilter;

    this.reflectScale = reflectScale;
    this.reflectRT = reflectScale > 0 ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 }) : null;

    const width = WORLD_X1 - WORLD_X0;
    const geo = new THREE.PlaneGeometry(width, WAKE_Z * 2 + 8, Math.round(width / 1.2), 52);
    geo.rotateX(-Math.PI / 2);
    geo.translate((WORLD_X0 + WORLD_X1) / 2, 0, 0);

    this.material = new THREE.ShaderMaterial({
      fog: true,
      lights: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        THREE.UniformsLib.lights,
        {
          uTime: { value: 0 },
          uSunDir: { value: sunDir.clone().normalize() },
          uWake: { value: null },
          uWakeRect: { value: new THREE.Vector4(WAKE_X0, -WAKE_Z, WAKE_X1 - WAKE_X0, WAKE_Z * 2) },
          uDeep: { value: new THREE.Color("#06324f") },
          uMid: { value: new THREE.Color("#0d5a73") },
          uShallow: { value: new THREE.Color("#2fa8a0") },
          uSkyHorizon: { value: new THREE.Color("#ffc58a") },
          uSkyZenith: { value: new THREE.Color("#4a78c2") },
          uSunColor: { value: new THREE.Color("#fff1d6") },
          uRiverHalf: { value: RIVER_HALF },
          uChannel: { value: new THREE.Vector3(CHANNEL.x0, CHANNEL.x1, CHANNEL.z) },
          tReflect: { value: null },
          uTexMatrix: { value: new THREE.Matrix4() },
          uUseReflect: { value: reflectScale > 0 ? 1 : 0 },
        },
      ]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        #include <shadowmap_pars_vertex>
        uniform float uTime;
        uniform mat4 uTexMatrix;
        varying vec3 vWorld;
        varying vec3 vNormal2;
        varying vec4 vReflUv;
        ${WAVE_GLSL}
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vReflUv = uTexMatrix * vec4(wp.xyz, 1.0);
          float h = waveHeight(wp.xz, uTime);
          float e = 0.15;
          float hx = waveHeight(wp.xz + vec2(e, 0.0), uTime);
          float hz = waveHeight(wp.xz + vec2(0.0, e), uTime);
          wp.y += h;
          vNormal2 = normalize(vec3(h - hx, e, h - hz));
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          vec4 worldPosition = wp;
          vec3 transformedNormal = normalMatrix * vNormal2;
          #include <shadowmap_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <packing>
        #include <fog_pars_fragment>
        #include <lights_pars_begin>
        #include <shadowmap_pars_fragment>
        #include <shadowmask_pars_fragment>
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform sampler2D uWake;
        uniform vec4 uWakeRect;
        uniform vec3 uDeep, uMid, uShallow, uSkyHorizon, uSkyZenith, uSunColor;
        uniform float uRiverHalf;
        uniform vec3 uChannel;
        uniform sampler2D tReflect;
        uniform float uUseReflect;
        varying vec3 vWorld;
        varying vec3 vNormal2;
        varying vec4 vReflUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float layered(vec2 p) {
          return noise(p * 0.9 + vec2(uTime * 0.42, uTime * 0.1))
               + 0.55 * noise(p * 2.3 - vec2(uTime * 0.25, -uTime * 0.33))
               + 0.25 * noise(p * 5.1 + vec2(uTime * 0.6, uTime * 0.2));
        }
        vec2 ripple(vec2 p) {
          float e = 0.06;
          float n0 = layered(p);
          return vec2(n0 - layered(p + vec2(e, 0)), n0 - layered(p + vec2(0, e))) / e;
        }
        // cheap cellular "caustic" ribbons
        float caustic(vec2 p) {
          vec2 q = p * 0.55;
          float c = 0.0;
          for (int i = 0; i < 2; i++) {
            q += vec2(sin(q.y * 1.7 + uTime * 0.9), cos(q.x * 1.3 - uTime * 0.7)) * 0.6;
            c += abs(sin(q.x + q.y));
          }
          return pow(1.0 - c * 0.5, 6.0);
        }

        void main() {
          vec2 r = ripple(vWorld.xz);
          vec3 N = normalize(vNormal2 + vec3(r.x, 0.0, r.y) * 0.09);
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 R = reflect(-V, N);
          float NdV = max(dot(N, V), 0.0);
          float fres = 0.03 + 0.97 * pow(1.0 - NdV, 5.0);

          vec3 sky = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.55, R.y));
          vec3 refl = sky;
          if (uUseReflect > 0.5) {
            vec4 uv = vReflUv;
            uv.xy += N.xz * 0.9 * uv.w * 0.06;
            vec3 planar = texture2DProj(tReflect, uv).rgb;
            refl = planar;
          }

          // depth tint: shallow near the banks / in the jungle channel, deep mid-river
          float edge = abs(vWorld.z) / uRiverHalf;
          float inChannel = step(uChannel.x, vWorld.x) * step(vWorld.x, uChannel.y) * step(uRiverHalf, vWorld.z);
          float shallow = max(smoothstep(0.6, 1.02, edge), inChannel);
          vec3 body = mix(uDeep, uMid, smoothstep(0.1, 0.7, edge));
          body = mix(body, uShallow, shallow);
          float bands = noise(vWorld.xz * 0.08 + uTime * 0.03);
          body *= 0.82 + 0.3 * bands;
          // subsurface glow where wave crests face the sun
          float sss = pow(max(dot(V, -uSunDir), 0.0), 3.0) * smoothstep(0.0, 0.2, vWorld.y + 0.1);
          body += uShallow * sss * 0.45;
          // sunlight ribbons in the shallows
          body += vec3(0.75, 0.95, 0.85) * caustic(vWorld.xz) * shallow * 0.35;

          // ducks, turrets and trees shade the water; the reflection dims a little too
          float shadow = mix(0.45, 1.0, getShadowMask());
          body *= shadow;
          refl *= mix(0.8, 1.0, shadow);
          vec3 col = mix(body, refl, clamp(fres + 0.12, 0.0, 1.0));

          // sun glitter: sharp spec + sparkly noise
          float sd = max(dot(R, uSunDir), 0.0);
          float spark = step(0.86, hash(floor(vWorld.xz * 6.0) + floor(uTime * 8.0)));
          col += uSunColor * (pow(sd, 600.0) * 9.0 + pow(sd, 60.0) * 0.35 + pow(sd, 18.0) * spark * 0.8) * step(0.9, shadow);

          // wake foam from the ducks, broken up so it reads as bubbles
          vec2 wuv = (vWorld.xz - uWakeRect.xy) / uWakeRect.zw;
          float wake = texture2D(uWake, vec2(wuv.x, 1.0 - wuv.y)).r;
          float breakup = noise(vWorld.xz * 4.0 + uTime * 0.9) * 0.6 + noise(vWorld.xz * 11.0 - uTime) * 0.4;
          float foam = smoothstep(0.18, 0.55, wake * (0.5 + breakup));
          float shore = smoothstep(0.94, 1.0, edge) * smoothstep(0.4, 0.8, noise(vWorld.xz * 1.8 + uTime * 0.7));
          foam = max(foam, shore * (1.0 - inChannel));
          col = mix(col, vec3(0.94, 0.98, 1.0), foam * 0.8);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    this.material.uniforms.uWake.value = this.wakeTex;
    if (this.reflectRT) this.material.uniforms.tReflect.value = this.reflectRT.texture;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
  }

  /**
   * Render the mirrored scene into the reflection target. Mirrors across y = 0 with an oblique near plane
   * so nothing below the surface leaks into the reflection (same maths as three's Reflector).
   */
  renderReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const rt = this.reflectRT;
    if (!rt) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(1, Math.round(size.x * this.reflectScale));
    const h = Math.max(1, Math.round(size.y * this.reflectScale));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);

    const normal = new THREE.Vector3(0, 1, 0);
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y <= 0.05) return;
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const view = new THREE.Vector3(camPos.x, -camPos.y, camPos.z);
    const lookDir = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const target = new THREE.Vector3(lookDir.x, -lookDir.y, lookDir.z);
    const mc = this.mirrorCam;
    mc.position.copy(view);
    mc.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    mc.lookAt(target);
    mc.far = camera.far;
    mc.near = camera.near;
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(camera.projectionMatrix);

    this.texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMatrix.multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);
    this.material.uniforms.uTexMatrix.value.copy(this.texMatrix);

    // oblique clip plane at the water surface (slightly below to hide the wave seam)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, -0.15, 0));
    plane.applyMatrix4(mc.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = mc.projectionMatrix.elements;
    const q = new THREE.Vector4(
      (Math.sign(clip.x) + p[8]) / p[0],
      (Math.sign(clip.y) + p[9]) / p[5],
      -1,
      (1 + p[10]) / p[14],
    );
    clip.multiplyScalar(2 / clip.dot(q));
    p[2] = clip.x;
    p[6] = clip.y;
    p[10] = clip.z + 1 - 0.003;
    p[14] = clip.w;

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    this.mesh.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, mc);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadow;
    this.mesh.visible = true;
  }

  /** Fade the wake canvas a little each frame, then switch to additive stamping. */
  beginWake(dt: number): void {
    const c = this.wakeCtx;
    c.globalCompositeOperation = "source-over";
    c.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 1.8)})`;
    c.fillRect(0, 0, this.wakeCanvas.width, this.wakeCanvas.height);
    c.globalCompositeOperation = "lighter";
  }

  /** Stamp foam at a world position. */
  stamp(x: number, z: number, radius: number, strength: number): void {
    const w = this.wakeCanvas.width, h = this.wakeCanvas.height;
    const px = ((x - WAKE_X0) / (WAKE_X1 - WAKE_X0)) * w;
    const py = (1 - (z + WAKE_Z) / (WAKE_Z * 2)) * h;
    const pr = Math.max(1.5, (radius / (WAKE_X1 - WAKE_X0)) * w);
    const g = this.wakeCtx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, `rgba(255,255,255,${Math.min(1, strength)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    this.wakeCtx.fillStyle = g;
    this.wakeCtx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  endWake(): void {
    this.wakeTex.needsUpdate = true;
  }

  clearWake(): void {
    this.wakeCtx.globalCompositeOperation = "source-over";
    this.wakeCtx.fillStyle = "#000";
    this.wakeCtx.fillRect(0, 0, this.wakeCanvas.width, this.wakeCanvas.height);
    this.wakeTex.needsUpdate = true;
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }
}
