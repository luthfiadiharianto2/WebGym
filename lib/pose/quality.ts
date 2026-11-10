// Pemeriksaan kualitas input kamera: tubuh utuh, jarak, pencahayaan, visibilitas.
import { FULL_BODY_LANDMARKS, LM, vis, type Landmark } from "./landmarks";

export type QualityIssue =
  | "no_person"
  | "not_full_body"
  | "out_of_frame"
  | "too_close"
  | "too_far"
  | "low_light"
  | "low_visibility";

export interface QualityReport {
  ok: boolean;
  issues: QualityIssue[];
  /** Rata-rata visibilitas landmark wajib (0..1). */
  visibility: number;
}

/**
 * @param lm Landmark ternormalisasi MENTAH (0..1, tanpa koreksi aspek).
 * @param opts.brightness Rata-rata luminansi frame 0..1 (opsional).
 */
export function assessQuality(
  lm: Landmark[] | null | undefined,
  opts: { brightness?: number; required?: number[] } = {},
): QualityReport {
  const issues: QualityIssue[] = [];
  if (opts.brightness !== undefined && opts.brightness < 0.22) issues.push("low_light");
  if (!lm || lm.length < 33) return { ok: false, issues: ["no_person", ...issues], visibility: 0 };

  const required = opts.required ?? FULL_BODY_LANDMARKS;
  const visibilities = required.map((i) => vis(lm[i]));
  const avgVis = visibilities.reduce((s, v) => s + v, 0) / visibilities.length;
  if (visibilities.some((v) => v < 0.5)) issues.push("not_full_body");
  else if (avgVis < 0.7) issues.push("low_visibility");

  const visible = required.map((i) => lm[i]).filter((l) => vis(l) >= 0.5);
  if (visible.some((l) => l.x < 0.01 || l.x > 0.99 || l.y < 0.01 || l.y > 0.99)) issues.push("out_of_frame");

  const top = Math.min(lm[LM.NOSE].y, lm[LM.LEFT_SHOULDER].y, lm[LM.RIGHT_SHOULDER].y);
  const bottom = Math.max(lm[LM.LEFT_ANKLE].y, lm[LM.RIGHT_ANKLE].y, lm[LM.LEFT_HIP].y);
  const span = bottom - top;
  // Posisi berbaring (plank/push-up) tidak dinilai dari tinggi badan.
  const horizontal = Math.abs(lm[LM.LEFT_SHOULDER].x - lm[LM.LEFT_ANKLE].x) > span;
  if (!horizontal && !issues.includes("not_full_body")) {
    if (span > 0.95) issues.push("too_close");
    else if (span < 0.4) issues.push("too_far");
  }
  return { ok: issues.length === 0, issues, visibility: avgVis };
}

/** Luminansi rata-rata dari data RGBA (sampling tiap `step` piksel). 0..1 */
export function averageLuminance(data: Uint8ClampedArray, step = 16): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return n ? sum / n / 255 : 0;
}
