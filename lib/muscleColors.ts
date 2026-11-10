import type { Exercise, Muscle } from "./types";

export const PRIMARY_COLOR = "#a3e635";
export const SECONDARY_COLOR = "#22d3ee";

export function exerciseMuscleColors(ex: Exercise): Partial<Record<Muscle, string>> {
  const c: Partial<Record<Muscle, string>> = {};
  for (const m of ex.secondaryMuscles) c[m] = SECONDARY_COLOR;
  for (const m of ex.primaryMuscles) c[m] = PRIMARY_COLOR;
  return c;
}

/** Skala warna heatmap: biru tua (jarang) → cyan → lime → oranye (sering). */
export function heatColor(v: number): string {
  const stops = [
    [0, [30, 58, 138]],
    [0.33, [34, 211, 238]],
    [0.66, [163, 230, 53]],
    [1, [251, 146, 60]],
  ] as const;
  const x = Math.min(1, Math.max(0, v));
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (x <= b) {
      const t = (x - a) / (b - a);
      const c = ca.map((cv, k) => Math.round(cv + (cb[k] - cv) * t));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return "rgb(251, 146, 60)";
}
