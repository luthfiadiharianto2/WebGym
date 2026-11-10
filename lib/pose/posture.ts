// Analisis postur & proporsi tubuh dari landmark. Semua nilai adalah ESTIMASI,
// bukan pengukuran medis.
import { LM, vis, type Landmark } from "./landmarks";
import { angleFromVertical, clamp, dist2D, midpoint, tiltDeg } from "./math";
import type { BodyProportions } from "../types";

/** Rata-rata landmark dari beberapa frame agar hasil lebih stabil. */
export function averageLandmarks(frames: Landmark[][]): Landmark[] {
  if (!frames.length) return [];
  const n = frames[0].length;
  const out: Landmark[] = [];
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    let v = 0;
    for (const f of frames) {
      x += f[i].x;
      y += f[i].y;
      z += f[i].z ?? 0;
      v += f[i].visibility ?? 1;
    }
    const k = frames.length;
    out.push({ x: x / k, y: y / k, z: z / k, visibility: v / k });
  }
  return out;
}

export interface FrontPosture {
  /** Bertanda: positif = bahu kanan (milik pengguna) lebih rendah. */
  shoulderTiltDeg: number;
  pelvicTiltDeg: number;
  /** Kemiringan garis tengah panggul→bahu dari vertikal (proksi kelurusan tulang belakang). */
  spineDeviationDeg: number;
  symmetryScore: number;
}

export function analyzeFront(lm: Landmark[]): FrontPosture {
  const ls = lm[LM.LEFT_SHOULDER];
  const rs = lm[LM.RIGHT_SHOULDER];
  const lh = lm[LM.LEFT_HIP];
  const rh = lm[LM.RIGHT_HIP];
  // Dari kiri-pengguna ke kanan-pengguna; normalisasi agar tidak bergantung arah gambar.
  const shoulderTiltDeg = round1(tiltDeg(ls, rs));
  const pelvicTiltDeg = round1(tiltDeg(lh, rh));
  const spineDeviationDeg = round1(angleFromVertical(midpoint(lh, rh), midpoint(ls, rs)));
  const pairs: [number, number, number, number][] = [
    [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
    [LM.LEFT_HIP, LM.LEFT_KNEE, LM.RIGHT_HIP, LM.RIGHT_KNEE],
    [LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
    [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  ];
  const diffs = pairs.map(([a, b, c, d]) => {
    const l = dist2D(lm[a], lm[b]);
    const r = dist2D(lm[c], lm[d]);
    return Math.abs(l - r) / Math.max(1e-6, (l + r) / 2);
  });
  const avgDiff = diffs.reduce((s, x) => s + x, 0) / diffs.length;
  const symmetryScore = Math.round(
    clamp(100 - avgDiff * 300 - Math.abs(shoulderTiltDeg) * 2 - Math.abs(pelvicTiltDeg) * 2, 0, 100),
  );
  return { shoulderTiltDeg, pelvicTiltDeg, spineDeviationDeg, symmetryScore };
}

/**
 * Tampak samping: rasio jarak horizontal telinga–bahu terhadap panjang torso.
 * > ~0.15 mengindikasikan kepala condong ke depan (forward head).
 */
export function analyzeSide(lm: Landmark[]): { forwardHeadRatio: number } {
  const left =
    vis(lm[LM.LEFT_EAR]) + vis(lm[LM.LEFT_SHOULDER]) >= vis(lm[LM.RIGHT_EAR]) + vis(lm[LM.RIGHT_SHOULDER]);
  const ear = lm[left ? LM.LEFT_EAR : LM.RIGHT_EAR];
  const sh = lm[left ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER];
  const hip = lm[left ? LM.LEFT_HIP : LM.RIGHT_HIP];
  const facing = Math.sign(lm[LM.NOSE].x - ear.x) || 1;
  const torso = Math.max(1e-6, dist2D(sh, hip));
  return { forwardHeadRatio: Math.round((((ear.x - sh.x) * facing) / torso) * 100) / 100 };
}

export function postureScore(front: FrontPosture, forwardHeadRatio: number | null): number {
  let penalty = 0;
  penalty += Math.min(25, Math.max(0, Math.abs(front.shoulderTiltDeg) - 2) * 4);
  penalty += Math.min(20, Math.max(0, Math.abs(front.pelvicTiltDeg) - 2) * 4);
  penalty += Math.min(15, Math.max(0, front.spineDeviationDeg - 2) * 3);
  if (forwardHeadRatio !== null) penalty += Math.min(30, Math.max(0, forwardHeadRatio - 0.08) * 150);
  penalty += (100 - front.symmetryScore) * 0.15;
  return Math.round(clamp(100 - penalty, 0, 100));
}

export interface SegMask {
  width: number;
  height: number;
  /** Nilai kepercayaan 0..1 per piksel (baris demi baris). */
  data: ArrayLike<number>;
}

/** Lebar siluet (piksel) pada baris yNorm yang memuat titik tengah xCenterNorm. */
export function silhouetteWidthAt(mask: SegMask, yNorm: number, xCenterNorm: number, threshold = 0.5): number {
  const y = Math.round(clamp(yNorm, 0, 1) * (mask.height - 1));
  const xc = Math.round(clamp(xCenterNorm, 0, 1) * (mask.width - 1));
  const row = y * mask.width;
  if (mask.data[row + xc] < threshold) return 0;
  let l = xc;
  let r = xc;
  while (l > 0 && mask.data[row + l - 1] >= threshold) l--;
  while (r < mask.width - 1 && mask.data[row + r + 1] >= threshold) r++;
  return r - l + 1;
}

/**
 * Proporsi bahu:pinggang:pinggul. Bila mask segmentasi tersedia, dipakai lebar siluet;
 * jika tidak, hanya rasio bahu:pinggul dari titik sendi (pinggang tidak terdeteksi landmark).
 * @param lm landmark ternormalisasi MENTAH (0..1).
 */
export function estimateProportions(lm: Landmark[], mask?: SegMask | null): BodyProportions {
  const ls = lm[LM.LEFT_SHOULDER];
  const rs = lm[LM.RIGHT_SHOULDER];
  const lh = lm[LM.LEFT_HIP];
  const rh = lm[LM.RIGHT_HIP];
  const shMid = midpoint(ls, rs);
  const hipMid = midpoint(lh, rh);
  if (mask) {
    const xAt = (t: number) => shMid.x + (hipMid.x - shMid.x) * t;
    const yAt = (t: number) => shMid.y + (hipMid.y - shMid.y) * t;
    const shoulderW = silhouetteWidthAt(mask, yAt(0.12), xAt(0.12));
    let waistW = Infinity;
    for (let t = 0.45; t <= 0.85; t += 0.05) {
      const w = silhouetteWidthAt(mask, yAt(t), xAt(t));
      if (w > 0) waistW = Math.min(waistW, w);
    }
    let hipW = 0;
    for (let t = 1.0; t <= 1.25; t += 0.05) hipW = Math.max(hipW, silhouetteWidthAt(mask, yAt(t), xAt(t)));
    if (shoulderW > 0 && hipW > 0 && Number.isFinite(waistW)) {
      return {
        shoulderToHip: round2(shoulderW / hipW),
        shoulderToWaist: round2(shoulderW / waistW),
        waistToHip: round2(waistW / hipW),
        method: "segmentation",
      };
    }
  }
  return {
    shoulderToHip: round2(dist2D(ls, rs) / Math.max(1e-6, dist2D(lh, rh))),
    shoulderToWaist: null,
    waistToHip: null,
    method: "landmarks",
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round1 = (x: number) => Math.round(x * 10) / 10;
