import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

/** CC0 Poly Haven textures (see CREDITS.md). */
export interface TerrainTextures {
  grass: THREE.Texture;
  grassN: THREE.Texture;
  rock: THREE.Texture;
  rockN: THREE.Texture;
  sand: THREE.Texture;
  sandN: THREE.Texture;
}

const base = `${import.meta.env.BASE_URL}assets/`;

async function tex(path: string, srgb: boolean): Promise<THREE.Texture> {
  const t = await new THREE.TextureLoader().loadAsync(base + path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function loadTerrainTextures(): Promise<TerrainTextures | null> {
  try {
    const [grass, grassN, rock, rockN, sand, sandN] = await Promise.all([
      tex("tex/aerial_grass_rock_diff_1k.jpg", true),
      tex("tex/aerial_grass_rock_nor_gl_1k.jpg", false),
      tex("tex/rock_face_diff_1k.jpg", true),
      tex("tex/rock_face_nor_gl_1k.jpg", false),
      tex("tex/coast_sand_01_diff_1k.jpg", true),
      tex("tex/coast_sand_01_nor_gl_1k.jpg", false),
    ]);
    return { grass, grassN, rock, rockN, sand, sandN };
  } catch (err) {
    console.warn("Terrain textures failed to load, using procedural ground", err);
    return null;
  }
}

/** Equirectangular HDR sky used only for image-based lighting and reflections. */
export async function loadHdri(): Promise<THREE.DataTexture | null> {
  try {
    const t = await new RGBELoader().loadAsync(base + "hdri/qwantani_sunset_puresky_1k.hdr");
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  } catch (err) {
    console.warn("HDRI failed to load, using the procedural sky for lighting", err);
    return null;
  }
}
