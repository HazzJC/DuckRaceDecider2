import * as THREE from "three";
import { L, RIVER_HALF } from "./layout";

export type ShotKind =
  | "flyover" | "lineup" | "establish" | "chase" | "side" | "front" | "action" | "objective" | "finish" | "podium" | "replay";

export interface Shot {
  kind: ShotKind;
  /** duck ids this shot is about */
  focus?: number[];
  point?: THREE.Vector3;
  priority: number;
  /** minimum time on this shot before a lower-priority shot can cut in */
  hold: number;
  /** maximum time before falling back to the default shot */
  max: number;
}

export interface DirectorContext {
  duckPos(id: number, out: THREE.Vector3): THREE.Vector3;
  leaderId: number;
  pack: number[]; // ids of the front group
  podium: THREE.Vector3;
}

const v = () => new THREE.Vector3();

/** Broadcast camera director: picks shots from race events, hard-cuts between them, eases within them. */
export class Director {
  calm = false;
  private shot: Shot = { kind: "flyover", priority: 0, hold: 0, max: Infinity };
  private shotTime = 0;
  private pos = v();
  private look = v();
  private wantPos = v();
  private wantLook = v();
  /** moving subject the camera rides with; only the offset from it is eased, so fast ducks never outrun the frame */
  private anchor = v();
  private offPos = v();
  private offLook = v();
  private shake = 0;
  private fov = 50;
  private cutPending = true;
  private orbit = 0;

  constructor(private camera: THREE.PerspectiveCamera) {}

  get current(): Shot {
    return this.shot;
  }

  /** Request a shot; honoured if it outranks the current one or the current one has held long enough. */
  request(shot: Partial<Shot> & { kind: ShotKind }, force = false): boolean {
    const s: Shot = { priority: 1, hold: 1.2, max: 4, ...shot };
    if (this.calm && !["flyover", "lineup", "side", "finish", "podium", "establish"].includes(s.kind)) return false;
    const canCut = force || s.priority > this.shot.priority || this.shotTime >= this.shot.hold;
    if (!canCut) return false;
    if (s.kind === this.shot.kind && s.focus?.[0] === this.shot.focus?.[0] && !force) {
      this.shotTime = Math.min(this.shotTime, this.shot.hold * 0.5);
      return true;
    }
    this.shot = s;
    this.shotTime = 0;
    this.cutPending = s.kind !== "chase" || force;
    return true;
  }

  addShake(amount: number) {
    if (!this.calm) this.shake = Math.min(1.2, this.shake + amount);
  }

  update(dt: number, time: number, ctx: DirectorContext, defaultShot: ShotKind) {
    this.shotTime += dt;
    if (this.shotTime > this.shot.max && this.shot.kind !== defaultShot) {
      this.shot = { kind: defaultShot, priority: 0, hold: 1, max: Infinity };
      this.shotTime = 0;
      this.cutPending = true;
    }

    const a = v(), b = v();
    const pack = ctx.pack.length ? ctx.pack : [ctx.leaderId];
    const packCenter = v();
    for (const id of pack) packCenter.add(ctx.duckPos(id, a));
    packCenter.divideScalar(pack.length);
    const leader = ctx.duckPos(ctx.leaderId, v());
    let fov = 50;
    this.anchor.set(0, 0, 0);

    switch (this.shot.kind) {
      case "flyover": {
        const x = ((time * 7) % (L + 120)) - 40;
        this.wantPos.set(x, 13 + Math.sin(time * 0.2) * 3, RIVER_HALF + 14);
        this.wantLook.set(x + 30, 1, -2);
        fov = 55;
        break;
      }
      case "lineup":
        this.wantPos.set(17 + Math.sin(time * 0.15) * 3, 5.5, 19);
        this.wantLook.set(-3, 0.6, -1);
        fov = 50;
        break;
      case "establish":
        this.wantPos.set(-20 + this.shotTime * 2.5, 13 - this.shotTime * 0.8, 26 - this.shotTime);
        this.wantLook.set(12, 0.5, 0);
        fov = 52;
        break;
      case "chase":
        this.anchor.set(leader.x, 0, 0);
        this.wantPos.set(leader.x - 11, 5.2, packCenter.z * 0.6 + 10);
        this.wantLook.set(leader.x + 4, 0.4, packCenter.z * 0.8 - 1);
        fov = 48;
        break;
      case "side":
        this.anchor.set(leader.x, 0, 0);
        this.wantPos.set(leader.x - 2, 4.5, RIVER_HALF + 18);
        this.wantLook.set(leader.x - 2, 0.6, 0);
        fov = 45;
        break;
      case "front":
        this.anchor.copy(leader);
        this.wantPos.set(leader.x + 9, 1.8, leader.z * 0.4 + 4);
        this.wantLook.set(leader.x - 5, 0.9, leader.z * 0.8);
        fov = 42;
        break;
      case "action": {
        const t = ctx.duckPos(this.shot.focus?.[0] ?? ctx.leaderId, v());
        this.anchor.copy(t);
        this.wantPos.copy(t).add(b.set(-4.2, 2.4, 5.2));
        this.wantLook.copy(t).add(b.set(1.2, 0.7, 0));
        fov = 40;
        break;
      }
      case "replay": {
        const t = ctx.duckPos(this.shot.focus?.[0] ?? ctx.leaderId, v());
        this.anchor.copy(t);
        this.orbit += dt * 0.35;
        const ang = -0.9 + Math.sin(this.orbit) * 0.7;
        this.wantPos.set(t.x + Math.cos(ang) * 7, 2.6, t.z + Math.sin(ang) * -7 + 1);
        this.wantLook.copy(t).add(b.set(1, 0.6, 0));
        fov = 38;
        break;
      }
      case "objective": {
        const p = this.shot.point ?? packCenter;
        const camZ = Math.max(-RIVER_HALF + 3, Math.min(RIVER_HALF - 3, p.z + (p.z > 0 ? -13 : 13)));
        this.wantPos.set(p.x - 10, p.y + 4.5, camZ);
        this.wantLook.copy(p).add(b.set(0, 2, 0));
        fov = 46;
        break;
      }
      case "finish":
        this.wantPos.set(L + 2.5, 2.4, RIVER_HALF + 2);
        this.wantLook.set(L - 8, 0.8, 0);
        fov = 44;
        break;
      case "podium": {
        this.orbit += dt * 0.15;
        const p = ctx.podium;
        this.wantPos.set(p.x - 13 + Math.sin(this.orbit) * 3, p.y + 5.5, p.z - 2 + Math.cos(this.orbit) * 2);
        this.wantLook.set(p.x, p.y + 2.2, p.z);
        fov = 42;
        break;
      }
    }

    // portrait screens: widen the vertical FOV so the horizontal framing survives
    if (this.camera.aspect < 1.3) fov = Math.min(85, fov * Math.pow(1.3 / this.camera.aspect, 0.6));
    const wantOffPos = b.copy(this.wantPos).sub(this.anchor);
    const wantOffLook = v().copy(this.wantLook).sub(this.anchor);
    if (this.cutPending) {
      this.offPos.copy(wantOffPos);
      this.offLook.copy(wantOffLook);
      this.fov = fov;
      this.cutPending = false;
    } else {
      const k = 1 - Math.exp(-dt * (this.shot.kind === "chase" || this.shot.kind === "side" ? 3.2 : 4.5));
      this.offPos.lerp(wantOffPos, k);
      this.offLook.lerp(wantOffLook, k);
      this.fov += (fov - this.fov) * k;
    }
    this.pos.copy(this.anchor).add(this.offPos);
    this.look.copy(this.anchor).add(this.offLook);

    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 0.5;
    this.camera.position.copy(this.pos).add(a.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    this.camera.lookAt(this.look);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  get lookAt(): THREE.Vector3 {
    return this.look;
  }
}
