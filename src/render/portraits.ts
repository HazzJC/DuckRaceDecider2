import * as THREE from "three";
import { DuckModel, type DuckLook } from "./duck";

/**
 * Renders "champion portraits" of ducks with a small dedicated renderer (so tone mapping and colour space
 * match the screen) and caches them as data URLs for the UI.
 */
export class Portraits {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private cache = new Map<string, string>();

  constructor(hdr: THREE.Texture | null) {
    const canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(256, 256, false);
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    if (hdr) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
      pmrem.dispose();
    }
    this.scene.environmentIntensity = 0.8;
    const key = new THREE.DirectionalLight("#fff3df", 2.8);
    key.position.set(3, 4, 3);
    const rim = new THREE.DirectionalLight("#7dd3fc", 3.5);
    rim.position.set(-3, 2, -3);
    const rim2 = new THREE.DirectionalLight("#f5c56b", 2);
    rim2.position.set(-2, 3, 3);
    this.scene.add(key, rim, rim2, new THREE.HemisphereLight("#d6e4ff", "#2a1f12", 0.8));
    this.camera.position.set(2.85, 1.75, 1.7);
    this.camera.lookAt(0.25, 1.15, 0);
  }

  get(key: string, look: DuckLook, decorate?: (d: DuckModel) => void): string {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const duck = new DuckModel(look);
    decorate?.(duck);
    duck.animate(0, 0.4, "normal", 0, false, "idle");
    duck.root.rotation.y = 0.15;
    this.scene.add(duck.root);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.scene.remove(duck.root);
    duck.dispose();
    this.cache.set(key, url);
    return url;
  }
}
