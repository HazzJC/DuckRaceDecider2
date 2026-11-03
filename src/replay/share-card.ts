import type { Racer } from "../sim/types";

export interface CardData {
  snapshot: HTMLCanvasElement | null;
  order: Racer[];
  blue: string[];
  red: string[];
  mode: string;
  duration: number;
}

const fmt = (r: Racer) => (r.finishTime >= 0 ? `${r.finishTime.toFixed(2)}s` : "DNF");

/** 1200x630 results card (social preview size) with a 3D snapshot of the podium. */
export async function renderShareCard(d: CardData): Promise<Blob> {
  const W = 1200, H = 630;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  await document.fonts?.ready;

  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1530");
  bg.addColorStop(1, "#1a0b24");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  if (d.snapshot) {
    // cover-fit the snapshot into the left 60%
    const sw = d.snapshot.width, sh = d.snapshot.height;
    const tw = 720, th = H;
    const s = Math.max(tw / sw, th / sh);
    const w = sw * s, h = sh * s;
    c.save();
    c.beginPath();
    c.rect(0, 0, tw, th);
    c.clip();
    c.drawImage(d.snapshot, (tw - w) / 2, (th - h) / 2, w, h);
    const fade = c.createLinearGradient(tw - 200, 0, tw, 0);
    fade.addColorStop(0, "rgba(11,21,48,0)");
    fade.addColorStop(1, "rgba(11,21,48,1)");
    c.fillStyle = fade;
    c.fillRect(tw - 200, 0, 200, th);
    c.restore();
  }

  c.strokeStyle = "#d9b25a";
  c.lineWidth = 3;
  c.strokeRect(12, 12, W - 24, H - 24);

  const x0 = 690;
  c.fillStyle = "#d9b25a";
  c.font = "600 22px Cinzel, Georgia, serif";
  c.fillText("SUMMONER'S RIVER · " + d.mode.toUpperCase(), x0, 64);

  const winner = d.order[0];
  c.fillStyle = "#cbd5e1";
  c.font = "500 20px Inter, system-ui, sans-serif";
  c.fillText("VICTORY", x0, 110);
  c.fillStyle = "#f8e7b0";
  c.font = "700 54px Cinzel, Georgia, serif";
  const name = winner.name.length > 16 ? winner.name.slice(0, 15) + "…" : winner.name;
  c.fillText(name, x0, 166);
  c.fillStyle = "#94a3b8";
  c.font = "500 20px Inter, system-ui, sans-serif";
  c.fillText(fmt(winner), x0, 196);

  const col = (title: string, color: string, names: string[], x: number) => {
    c.fillStyle = color;
    c.font = "700 22px Cinzel, Georgia, serif";
    c.fillText(title, x, 262);
    c.fillStyle = "#e2e8f0";
    c.font = "500 21px Inter, system-ui, sans-serif";
    names.slice(0, 8).forEach((n, i) => c.fillText((n.length > 16 ? n.slice(0, 15) + "…" : n), x, 298 + i * 32));
    if (names.length > 8) c.fillText(`+${names.length - 8} more`, x, 298 + 8 * 32);
  };
  col("BLUE SIDE", "#60a5fa", d.blue, x0);
  col("RED SIDE", "#f87171", d.red, x0 + 250);

  c.fillStyle = "#64748b";
  c.font = "500 16px Inter, system-ui, sans-serif";
  c.fillText("Duck Race Decider", x0, H - 34);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}
