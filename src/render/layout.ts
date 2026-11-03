import { TRACK_LENGTH } from "../sim/race";

/** World layout: x runs down the river (0 = start, TRACK_LENGTH = Nexus finish), z across lanes, y up. */
export const L = TRACK_LENGTH;
export const RIVER_HALF = 18;
export const LANE_SPAN = 30;
export const CHANNEL = { x0: L * 0.5, x1: L * 0.64, z: RIVER_HALF + 3.2 };
export const WORLD_X0 = -90;
export const WORLD_X1 = L + 140;

export const laneWidth = (n: number) => Math.min(4.5, LANE_SPAN / Math.max(n, 1));
export const laneZ = (lane: number, n: number) => (lane - (n - 1) / 2) * laneWidth(n);

/** Wave height shared by the water shader (GLSL copy below) and CPU bobbing. Keep the two in sync. */
export function waveHeight(x: number, z: number, t: number): number {
  return (
    Math.sin(x * 0.21 + t * 1.3) * 0.09 +
    Math.sin(z * 0.37 - t * 1.1 + x * 0.05) * 0.07 +
    Math.sin((x + z) * 0.53 + t * 2.1) * 0.035
  );
}

export const WAVE_GLSL = /* glsl */ `
float waveHeight(vec2 p, float t) {
  return sin(p.x * 0.21 + t * 1.3) * 0.09
       + sin(p.y * 0.37 - t * 1.1 + p.x * 0.05) * 0.07
       + sin((p.x + p.y) * 0.53 + t * 2.1) * 0.035;
}
`;
