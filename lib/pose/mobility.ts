// Skor tes mobilitas sederhana dari rekaman landmark (aspek-terkoreksi, 2D).
import { LM, type Landmark } from "./landmarks";
import { angle3, angleFromVertical, clamp, dist2D, midpoint } from "./math";

/** Skala linear: nilai `worst` → 0, `best` → 100. */
const lin = (v: number, worst: number, best: number) => clamp(((v - worst) / (best - worst)) * 100, 0, 100);

export interface OverheadSquatResult {
  score: number;
  minKneeDeg: number;
  torsoLeanDeg: number;
  armAngleDeg: number;
  heelLift: boolean;
  hipScore: number;
  ankleScore: number;
  armScore: number;
}

export function scoreOverheadSquat(frames: Landmark[][]): OverheadSquatResult {
  let minKnee = 180;
  let bottom: Landmark[] | null = null;
  for (const f of frames) {
    const k =
      (angle3(f[LM.LEFT_HIP], f[LM.LEFT_KNEE], f[LM.LEFT_ANKLE], false) +
        angle3(f[LM.RIGHT_HIP], f[LM.RIGHT_KNEE], f[LM.RIGHT_ANKLE], false)) /
      2;
    if (k < minKnee) {
      minKnee = k;
      bottom = f;
    }
  }
  if (!bottom) {
    return { score: 0, minKneeDeg: 180, torsoLeanDeg: 0, armAngleDeg: 0, heelLift: false, hipScore: 0, ankleScore: 0, armScore: 0 };
  }
  const torsoLeanDeg = angleFromVertical(
    midpoint(bottom[LM.LEFT_HIP], bottom[LM.RIGHT_HIP]),
    midpoint(bottom[LM.LEFT_SHOULDER], bottom[LM.RIGHT_SHOULDER]),
  );
  const armAngleDeg =
    (angle3(bottom[LM.LEFT_HIP], bottom[LM.LEFT_SHOULDER], bottom[LM.LEFT_WRIST], false) +
      angle3(bottom[LM.RIGHT_HIP], bottom[LM.RIGHT_SHOULDER], bottom[LM.RIGHT_WRIST], false)) /
    2;
  const leg = dist2D(bottom[LM.LEFT_HIP], bottom[LM.LEFT_ANKLE]) || 1;
  const heelLift =
    Math.max(bottom[LM.LEFT_FOOT].y - bottom[LM.LEFT_HEEL].y, bottom[LM.RIGHT_FOOT].y - bottom[LM.RIGHT_HEEL].y) / leg >
    0.1;
  const hipScore = lin(minKnee, 150, 85);
  const torsoScore = lin(torsoLeanDeg, 60, 25);
  const ankleScore = clamp(torsoScore - (heelLift ? 30 : 0), 0, 100);
  const armScore = lin(armAngleDeg, 120, 168);
  const score = Math.round(hipScore * 0.4 + torsoScore * 0.3 + armScore * 0.3);
  return {
    score,
    minKneeDeg: Math.round(minKnee),
    torsoLeanDeg: Math.round(torsoLeanDeg),
    armAngleDeg: Math.round(armAngleDeg),
    heelLift,
    hipScore: Math.round(hipScore),
    ankleScore: Math.round(ankleScore),
    armScore: Math.round(armScore),
  };
}

/** Fleksi bahu maksimum (lengan lurus ke atas kepala). */
export function scoreShoulderReach(frames: Landmark[][]): {
  score: number;
  maxAngleDeg: number;
  leftDeg: number;
  rightDeg: number;
} {
  let best = { l: 0, r: 0 };
  for (const f of frames) {
    const l = angle3(f[LM.LEFT_HIP], f[LM.LEFT_SHOULDER], f[LM.LEFT_ELBOW], false);
    const r = angle3(f[LM.RIGHT_HIP], f[LM.RIGHT_SHOULDER], f[LM.RIGHT_ELBOW], false);
    if (l + r > best.l + best.r) best = { l, r };
  }
  const maxAngleDeg = (best.l + best.r) / 2;
  return {
    score: Math.round(lin(maxAngleDeg, 120, 172)),
    maxAngleDeg: Math.round(maxAngleDeg),
    leftDeg: Math.round(best.l),
    rightDeg: Math.round(best.r),
  };
}

/** Jarak vertikal terdekat pergelangan tangan → pergelangan kaki, relatif panjang tungkai. */
export function scoreToeTouch(frames: Landmark[][]): { score: number; minReach: number } {
  let minReach = Infinity;
  for (const f of frames) {
    const leg = (dist2D(f[LM.LEFT_HIP], f[LM.LEFT_ANKLE]) + dist2D(f[LM.RIGHT_HIP], f[LM.RIGHT_ANKLE])) / 2 || 1;
    const wrist = midpoint(f[LM.LEFT_WRIST], f[LM.RIGHT_WRIST]);
    const ankle = midpoint(f[LM.LEFT_ANKLE], f[LM.RIGHT_ANKLE]);
    minReach = Math.min(minReach, Math.max(0, ankle.y - wrist.y) / leg);
  }
  if (!Number.isFinite(minReach)) return { score: 0, minReach: 1 };
  return { score: Math.round(lin(minReach, 0.6, 0.05)), minReach: Math.round(minReach * 100) / 100 };
}
