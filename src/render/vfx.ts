import * as THREE from "three";

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  size: number; r: number; g: number; b: number;
  grav: number; drag: number;
}

/** CPU-simulated, GPU-drawn point particles with soft round sprites. */
class PointPool {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private siz: Float32Array;
  private alp: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor(private max: number, private additive: boolean) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.siz = new Float32Array(max);
    this.alp = new Float32Array(max);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 } },
      defines: additive ? { STAR: 1 } : {},
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        uniform float uScale;
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.15, d);
          vec3 col = vColor;
          #ifdef STAR
            float star = max(1.0 - smoothstep(0.0, 0.06, abs(c.x)) , 1.0 - smoothstep(0.0, 0.06, abs(c.y))) * smoothstep(0.5, 0.0, d);
            float core = smoothstep(0.18, 0.0, d);
            a = max(a * 0.7, star);
            col = mix(col, vec3(1.0), core * 0.7) * (1.0 + core * 1.5);
          #endif
          a *= vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  setScale(px: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = px;
  }

  add(p: P) {
    if (this.ps.length >= this.max) this.ps.shift();
    this.ps.push(p);
  }

  clear() {
    this.ps.length = 0;
  }

  update(dt: number) {
    this.ps = this.ps.filter((p) => (p.age += dt) < p.life);
    const n = this.ps.length;
    for (let i = 0; i < n; i++) {
      const p = this.ps[i];
      p.vy -= p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.age / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.siz[i] = p.size * (1 - k * 0.5);
      this.alp[i] = 1 - k * k;
    }
    this.geo.setDrawRange(0, n);
    for (const a of ["position", "aColor", "aSize", "aAlpha"]) (this.geo.attributes[a] as THREE.BufferAttribute).needsUpdate = true;
  }
}

interface Ring { mesh: THREE.Mesh; age: number; life: number; max: number; alpha: number }
interface Timed { mesh: THREE.Object3D; mat: THREE.Material & { opacity: number }; age: number; life: number; kind: "sigil" | "beam" | "pillar"; size: number; spin: number }

let sigilTex: THREE.Texture | null = null;
/** Runic magic-circle texture used under spell impacts and objectives. */
function getSigilTexture(): THREE.Texture {
  if (sigilTex) return sigilTex;
  const S = 512;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d")!;
  c.translate(S / 2, S / 2);
  c.strokeStyle = "#fff";
  c.fillStyle = "#fff";
  c.shadowColor = "#fff";
  c.shadowBlur = 10;
  const ring = (r: number, w: number) => {
    c.lineWidth = w;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.stroke();
  };
  ring(240, 6);
  ring(222, 2);
  ring(150, 4);
  ring(132, 1.5);
  // runes between the outer rings
  for (let i = 0; i < 36; i++) {
    c.save();
    c.rotate((i / 36) * Math.PI * 2);
    c.translate(0, -231);
    c.lineWidth = 2.5;
    c.beginPath();
    const k = i % 4;
    if (k === 0) { c.moveTo(-5, -6); c.lineTo(0, 6); c.lineTo(5, -6); }
    if (k === 1) { c.moveTo(-6, 0); c.lineTo(6, 0); c.moveTo(0, -6); c.lineTo(0, 6); }
    if (k === 2) { c.arc(0, 0, 5, 0, Math.PI * 1.5); }
    if (k === 3) { c.moveTo(-5, 6); c.lineTo(0, -6); c.lineTo(5, 6); c.closePath(); }
    c.stroke();
    c.restore();
  }
  // hexagram in the middle
  c.lineWidth = 3;
  for (const off of [0, Math.PI / 3]) {
    c.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2;
      i ? c.lineTo(Math.cos(a) * 150, Math.sin(a) * 150) : c.moveTo(Math.cos(a) * 150, Math.sin(a) * 150);
    }
    c.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    c.beginPath();
    c.arc(Math.cos(a) * 186, Math.sin(a) * 186, 9, 0, Math.PI * 2);
    c.fill();
  }
  sigilTex = new THREE.CanvasTexture(cv);
  sigilTex.colorSpace = THREE.SRGBColorSpace;
  return sigilTex;
}

/** Soft vertical gradient for beams and light pillars. */
function beamMaterial(color: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, opacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float opacity; uniform float uTime; varying vec2 vUv;
      void main(){
        float edge = sin(vUv.x * 3.14159);
        float core = pow(edge, 6.0);
        float flow = 0.75 + 0.25 * sin(vUv.y * 30.0 - uTime * 25.0);
        float fade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        vec3 col = mix(uColor, vec3(1.0), core * 0.8) * (1.5 + core * 2.0);
        gl_FragColor = vec4(col, (edge * 0.6 + core) * flow * fade * opacity);
      }`,
  }) as THREE.ShaderMaterial & { opacity: number };
}
interface Confetti { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; spin: number; age: number; life: number }

export class VFX {
  readonly group = new THREE.Group();
  private glow: PointPool;
  private soft: PointPool;
  private rings: Ring[] = [];
  private confetti: Confetti[] = [];
  private confettiMesh: THREE.InstancedMesh;
  private budget: number;
  private ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 56);
  private timed: Timed[] = [];
  private sigilGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0);
  private tmp = new THREE.Color();

  constructor(quality: "low" | "med" | "high") {
    this.budget = quality === "low" ? 0.4 : quality === "med" ? 0.7 : 1;
    this.glow = new PointPool(Math.round(3000 * this.budget), true);
    this.soft = new PointPool(Math.round(3000 * this.budget), false);
    const maxConfetti = Math.round(700 * this.budget);
    this.confettiMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.22, 0.12),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      maxConfetti,
    );
    this.confettiMesh.count = 0;
    this.confettiMesh.frustumCulled = false;
    this.group.add(this.glow.points, this.soft.points, this.confettiMesh);
  }

  setViewportHeight(px: number) {
    this.glow.setScale(px * 0.9);
    this.soft.setScale(px * 0.9);
  }

  private n(count: number) {
    return Math.max(1, Math.round(count * this.budget));
  }

  private emit(pool: PointPool, x: number, y: number, z: number, color: THREE.ColorRepresentation, o: Partial<P> & { spread?: number; up?: number; jitter?: number }) {
    this.tmp.set(color);
    const sp = o.spread ?? 3;
    const j = o.jitter ?? 0.1;
    pool.add({
      x: x + (Math.random() - 0.5) * j, y: y + (Math.random() - 0.5) * j, z: z + (Math.random() - 0.5) * j,
      vx: (o.vx ?? 0) + (Math.random() - 0.5) * sp,
      vy: (o.vy ?? 0) + (o.up ?? 0) + Math.random() * sp * 0.5,
      vz: (o.vz ?? 0) + (Math.random() - 0.5) * sp,
      age: 0, life: (o.life ?? 0.6) * (0.7 + Math.random() * 0.6),
      size: (o.size ?? 0.2) * (0.6 + Math.random() * 0.8),
      r: this.tmp.r, g: this.tmp.g, b: this.tmp.b,
      grav: o.grav ?? 9, drag: o.drag ?? 0.5,
    });
  }

  /** Spray behind a paddling duck. */
  wake(x: number, z: number, speed: number) {
    if (Math.random() > Math.min(1, speed / 40) * this.budget) return;
    this.emit(this.soft, x, 0.15, z, "#e6f7ff", { vx: -speed * 0.08, up: 1.2, spread: 1.4, life: 0.45, size: 0.18, grav: 7 });
  }

  splash(x: number, y: number, z: number, strength = 1) {
    for (let i = 0; i < this.n(26 * strength); i++)
      this.emit(this.soft, x, y, z, i % 3 ? "#dff4ff" : "#9fd8ff", { up: 3.5 * strength, spread: 4 * strength, life: 0.8, size: 0.28, grav: 11 });
  }

  sparkle(x: number, y: number, z: number, color: THREE.ColorRepresentation, count = 30, speed = 5) {
    for (let i = 0; i < this.n(count); i++) this.emit(this.glow, x, y, z, color, { spread: speed, up: speed * 0.3, life: 0.8, size: 0.25, grav: 1.5, drag: 1.6 });
  }

  embers(x: number, y: number, z: number) {
    for (let i = 0; i < this.n(4); i++) this.emit(this.glow, x, y, z, i % 2 ? "#ff7a1a" : "#ffd04a", { up: 2.2, spread: 1.2, life: 0.7, size: 0.16, grav: -1.5, jitter: 0.8 });
  }

  iceShards(x: number, y: number, z: number) {
    for (let i = 0; i < this.n(40); i++) this.emit(this.glow, x, y, z, i % 2 ? "#bfe6ff" : "#5fb3ff", { up: 3, spread: 6, life: 0.7, size: 0.22, grav: 12, drag: 0.4 });
  }

  boostTrail(x: number, y: number, z: number, color: THREE.ColorRepresentation) {
    for (let i = 0; i < this.n(2); i++) this.emit(this.glow, x, y, z, color, { vx: -6, spread: 0.6, life: 0.35, size: 0.22, grav: 0, drag: 2, jitter: 0.5 });
  }

  ring(x: number, y: number, z: number, color: THREE.ColorRepresentation, max = 6, life = 0.7, vertical = false, alpha = 1) {
    const mesh = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.position.set(x, y, z);
    if (!vertical) mesh.rotation.x = Math.PI / 2;
    else mesh.rotation.y = Math.PI / 2;
    this.group.add(mesh);
    this.rings.push({ mesh, age: 0, life, max, alpha });
  }

  /** Rotating rune circle on the water. */
  sigil(x: number, z: number, color: THREE.ColorRepresentation, size = 4, life = 1.4, y = 0.12) {
    const mat = new THREE.MeshBasicMaterial({ map: getSigilTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(this.sigilGeo, mat);
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    this.timed.push({ mesh, mat, age: 0, life, kind: "sigil", size, spin: (Math.random() < 0.5 ? -1 : 1) * 1.4 });
  }

  /** Energy beam between two points (turret shots, spell links). */
  beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, width = 0.18, life = 0.35) {
    const mat = beamMaterial(color);
    const mesh = new THREE.Mesh(this.beamGeo, mat);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.scale.set(width, len, width);
    this.group.add(mesh);
    this.timed.push({ mesh, mat, age: 0, life, kind: "beam", size: width, spin: 0 });
  }

  /** Column of light rising from the water (objective taken, Nexus destroyed). */
  pillar(x: number, z: number, color: THREE.ColorRepresentation, height = 30, radius = 1.6, life = 1.6) {
    const mat = beamMaterial(color);
    const mesh = new THREE.Mesh(this.beamGeo, mat);
    mesh.position.set(x, -0.5, z);
    mesh.scale.set(radius, height, radius);
    this.group.add(mesh);
    this.timed.push({ mesh, mat, age: 0, life, kind: "pillar", size: radius, spin: 0 });
  }

  confettiBurst(x: number, y: number, z: number, count = 300) {
    const max = this.confettiMesh.instanceMatrix.count;
    for (let i = 0; i < this.n(count); i++) {
      if (this.confetti.length >= max) this.confetti.shift();
      this.confetti.push({
        x, y, z,
        vx: (Math.random() - 0.5) * 18, vy: 8 + Math.random() * 14, vz: (Math.random() - 0.5) * 18,
        rx: Math.random() * 6, ry: Math.random() * 6, spin: 4 + Math.random() * 10,
        age: 0, life: 3 + Math.random() * 2,
      });
    }
  }

  clear() {
    this.glow.clear();
    this.soft.clear();
    this.confetti.length = 0;
    for (const r of this.rings) this.group.remove(r.mesh);
    this.rings.length = 0;
    for (const t of this.timed) this.group.remove(t.mesh);
    this.timed.length = 0;
  }

  update(dt: number) {
    this.glow.update(dt);
    this.soft.update(dt);

    this.rings = this.rings.filter((r) => {
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      const s = 0.3 + (1 - Math.pow(1 - k, 3)) * r.max;
      r.mesh.scale.set(s, s, 1 + k * 2);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * r.alpha;
      return true;
    });

    this.timed = this.timed.filter((t) => {
      t.age += dt;
      const k = t.age / t.life;
      if (k >= 1) {
        this.group.remove(t.mesh);
        t.mat.dispose();
        return false;
      }
      const shader = t.mat as unknown as THREE.ShaderMaterial;
      if (shader.uniforms?.uTime) shader.uniforms.uTime.value += dt;
      if (t.kind === "sigil") {
        const grow = 1 - Math.pow(1 - Math.min(1, k * 3), 3);
        t.mesh.scale.setScalar(t.size * (0.4 + grow * 0.6));
        t.mesh.rotation.y += t.spin * dt;
        t.mat.opacity = Math.min(1, (1 - k) * 2) * 0.9;
      } else if (t.kind === "beam") {
        const w = t.size * (1 - k * 0.7);
        t.mesh.scale.x = t.mesh.scale.z = w;
        if (shader.uniforms) shader.uniforms.opacity.value = 1 - k * k;
      } else {
        const w = t.size * (0.6 + Math.sin(Math.min(1, k * 2.5) * Math.PI * 0.5) * 0.6) * (1 - k * 0.6);
        t.mesh.scale.x = t.mesh.scale.z = w;
        if (shader.uniforms) shader.uniforms.opacity.value = Math.min(1, (1 - k) * 1.5);
      }
      return true;
    });

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const c = new THREE.Color();
    this.confetti = this.confetti.filter((p) => (p.age += dt) < p.life);
    this.confetti.forEach((p, i) => {
      p.vy -= 9 * dt;
      p.vx *= 1 - 1.2 * dt; p.vz *= 1 - 1.2 * dt; p.vy *= 1 - 0.6 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.spin * dt; p.ry += p.spin * 0.7 * dt;
      q.setFromEuler(e.set(p.rx, p.ry, 0));
      m.compose(new THREE.Vector3(p.x, Math.max(p.y, 0.05), p.z), q, one);
      this.confettiMesh.setMatrixAt(i, m);
      this.confettiMesh.setColorAt(i, c.setHSL((i * 0.137) % 1, 0.85, 0.6));
    });
    this.confettiMesh.count = this.confetti.length;
    this.confettiMesh.instanceMatrix.needsUpdate = true;
    if (this.confettiMesh.instanceColor) this.confettiMesh.instanceColor.needsUpdate = true;
  }
}
