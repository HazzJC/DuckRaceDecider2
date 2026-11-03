import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

export type Quality = "low" | "med" | "high";

export function detectQuality(): Quality {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth < 760;
  if (mobile) return "low";
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? "high" : "med";
}

/** Colour grade, vignette, impact chromatic aberration and photo-finish desaturation. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.32 },
    uAberration: { value: 0 },
    uDesat: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette, uAberration, uDesat, uFlash; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5;
      vec2 off = d * uAberration * 0.02;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(l) * vec3(1.05, 1.0, 0.92), uDesat);
      c = mix(c, (c - 0.5) * 1.06 + 0.5, 0.5); // gentle contrast
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(lum), c, 1.12); // a touch more saturation, painted-game look
      c += vec3(-0.012, 0.004, 0.03) * (1.0 - lum) + vec3(0.025, 0.012, -0.018) * lum; // cool shadows, warm highlights
      c *= 1.0 - uVignette * dot(d, d) * 2.2;
      c += uFlash;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** Screen-space sun shafts: radial blur of the brightest (HDR) pixels toward the sun. */
const SunShaftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uStrength; uniform float uAspect; varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStrength <= 0.001) { gl_FragColor = base; return; }
      vec2 delta = (vUv - uSun) / 36.0 * 0.9;
      vec2 uv = vUv;
      float decay = 1.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 36; i++) {
        uv -= delta;
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        float l = max(dot(s, vec3(0.3, 0.59, 0.11)) - 1.1, 0.0);
        acc += s * l * decay;
        decay *= 0.955;
      }
      acc /= 36.0;
      float fall = 1.0 - smoothstep(0.0, 1.0, length((vUv - uSun) * vec2(uAspect, 1.0)));
      gl_FragColor = vec4(base.rgb + acc * uStrength * fall * vec3(1.0, 0.82, 0.55), base.a);
    }`,
};

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2000);
  readonly labels: CSS2DRenderer;
  readonly sun: THREE.DirectionalLight;
  readonly sunDir = new THREE.Vector3();
  readonly grade: ShaderPass;
  quality: Quality;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private shafts: ShaderPass;
  private overlays: ((r: THREE.WebGLRenderer, w: number, h: number) => void)[] = [];
  private preRenders: (() => void)[] = [];

  constructor(private container: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality === "low", powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "high" ? 2 : quality === "med" ? 1.5 : 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = "label-layer";
    container.appendChild(this.labels.domElement);

    // golden-hour sky, sun low and ahead down the river
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = 7;
    u.rayleigh.value = 2.4;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.86;
    const phi = THREE.MathUtils.degToRad(90 - 9);
    const theta = THREE.MathUtils.degToRad(70);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);
    this.scene.add(sky);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(sky.clone());
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();

    this.scene.fog = new THREE.Fog("#e6b48c", 160, 720);

    this.scene.add(new THREE.HemisphereLight("#ffe2c0", "#3d5a2e", 0.9));
    this.sun = new THREE.DirectionalLight("#ffd6a3", 2.6);
    this.sun.position.copy(this.sunDir).multiplyScalar(120);
    this.sun.castShadow = quality !== "low";
    this.sun.shadow.mapSize.setScalar(quality === "high" ? 4096 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality === "low" ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.4, 1.1);
    this.bloom.enabled = quality !== "low";
    this.composer.addPass(this.bloom);
    this.shafts = new ShaderPass(SunShaftShader);
    this.shafts.enabled = quality !== "low";
    this.composer.addPass(this.shafts);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** Swap the procedural-sky lighting for an HDRI (reflections on the ducks get much richer). */
  setEnvironment(hdr: THREE.Texture) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();
  }

  addPreRender(fn: () => void) {
    this.preRenders.push(fn);
  }

  addOverlay(fn: (r: THREE.WebGLRenderer, w: number, h: number) => void) {
    this.overlays.push(fn);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  /** Performance fallback: cheaper pixel ratio, no bloom. */
  degrade() {
    this.renderer.setPixelRatio(1);
    this.bloom.enabled = false;
    this.shafts.enabled = false;
    this.resize();
  }

  get height() {
    return this.renderer.domElement.clientHeight;
  }

  /** Keep the shadow frustum centred on whatever the camera is looking at. */
  followShadow(target: THREE.Vector3) {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 150);
  }

  private updateShafts() {
    if (!this.shafts.enabled) return;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const facing = fwd.dot(this.sunDir);
    const sun = this.sunDir.clone().multiplyScalar(1000).add(this.camera.position).project(this.camera);
    const u = this.shafts.uniforms;
    u.uSun.value.set(sun.x * 0.5 + 0.5, sun.y * 0.5 + 0.5);
    u.uAspect.value = this.camera.aspect;
    u.uStrength.value = facing > 0 ? 1.1 * THREE.MathUtils.smoothstep(facing, 0.1, 0.6) : 0;
  }

  render() {
    this.camera.updateMatrixWorld();
    this.updateShafts();
    for (const p of this.preRenders) p();
    this.composer.render();
    const r = this.renderer;
    const w = r.domElement.width, h = r.domElement.height;
    for (const o of this.overlays) o(r, w, h);
    this.labels.render(this.scene, this.camera);
  }
}
