import type { Landmark } from "./landmarks";

export const RAD2DEG = 180 / Math.PI;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

export function dist2D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

/** Sudut di titik b (derajat, 0..180) antara segmen b→a dan b→c, 3D. */
export function angle3(a: Landmark, b: Landmark, c: Landmark, use3D = true): number {
  const z = use3D ? 1 : 0;
  const v1 = [a.x - b.x, a.y - b.y, ((a.z ?? 0) - (b.z ?? 0)) * z];
  const v2 = [c.x - b.x, c.y - b.y, ((c.z ?? 0) - (b.z ?? 0)) * z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const m1 = Math.hypot(v1[0], v1[1], v1[2]);
  const m2 = Math.hypot(v2[0], v2[1], v2[2]);
  if (m1 === 0 || m2 === 0) return 0;
  return Math.acos(clamp(dot / (m1 * m2), -1, 1)) * RAD2DEG;
}

/** Sudut segmen a→b terhadap garis vertikal (0 = tegak lurus), 2D. */
export function angleFromVertical(a: Landmark, b: Landmark): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.atan2(Math.abs(dx), Math.abs(dy)) * RAD2DEG;
}

/** Kemiringan garis a→b terhadap horizontal, bertanda (derajat). Positif = b lebih rendah (y lebih besar). */
export function tiltDeg(a: Landmark, b: Landmark): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0) return 90;
  let deg = Math.atan2(dy, Math.abs(dx)) * RAD2DEG;
  if (dx < 0) deg = -deg;
  return deg;
}

/**
 * Deviasi bertanda titik p dari garis a→c pada sumbu y, dinormalisasi panjang a→c.
 * Positif = p di bawah garis (y lebih besar) → mis. pinggul turun saat plank.
 */
export function signedLineDeviation(a: Landmark, p: Landmark, c: Landmark): number {
  const len = dist2D(a, c);
  if (len === 0) return 0;
  const dx = c.x - a.x;
  const t = dx === 0 ? 0.5 : clamp((p.x - a.x) / dx, 0, 1);
  const lineY = a.y + (c.y - a.y) * t;
  return (p.y - lineY) / len;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Koefisien variasi (0 = sangat konsisten). */
export function coefVar(xs: number[]): number {
  const m = mean(xs);
  return m === 0 ? 0 : stdDev(xs) / Math.abs(m);
}
