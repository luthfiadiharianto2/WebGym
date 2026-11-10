import { POSE_CONNECTIONS, type Landmark } from "@/lib/pose/landmarks";
import type { Severity } from "@/lib/pose/profiles";

const COLORS = ["#a3e635", "#facc15", "#ef4444"];

/** Menggambar 33 landmark + koneksi; sendi diwarnai hijau/kuning/merah sesuai status form. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  lm: Landmark[] | null,
  w: number,
  h: number,
  jointStatus: Record<number, Severity> = {},
): void {
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  ctx.lineWidth = Math.max(2, w / 300);
  ctx.lineCap = "round";
  for (const [a, b] of POSE_CONNECTIONS) {
    const pa = lm[a];
    const pb = lm[b];
    if ((pa.visibility ?? 1) < 0.4 || (pb.visibility ?? 1) < 0.4) continue;
    const sev = Math.max(jointStatus[a] ?? 0, jointStatus[b] ?? 0);
    ctx.strokeStyle = sev ? COLORS[sev] : "rgba(34, 211, 238, 0.85)";
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i];
    if ((p.visibility ?? 1) < 0.4 || (i > 0 && i < 11) || (i > 16 && i < 23)) continue;
    const sev = jointStatus[i] ?? 0;
    ctx.fillStyle = COLORS[sev];
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(3, w / 160) * (sev ? 1.5 : 1), 0, Math.PI * 2);
    ctx.fill();
  }
}
