// Klip animasi keyframe untuk avatar prosedural. Sudut dalam derajat, konvensi anatomis:
//  *Flex  + = ke depan (fleksi)           *Abd  + = menjauh dari badan (abduksi)
//  *Knee/*Elbow + = menekuk               ShHorz + = abduksi horizontal (lengan depan → samping)
//  rootPitch + = tubuh condong/tengkurap ke depan, - = telentang
import type { AnimationId } from "@/lib/types";

export type PoseKey =
  | "spineFlex" | "spineSide" | "neckFlex" | "headForward"
  | "lShFlex" | "rShFlex" | "lShAbd" | "rShAbd" | "lShHorz" | "rShHorz"
  | "lElbow" | "rElbow" | "lElbowZ" | "rElbowZ"
  | "lHipFlex" | "rHipFlex" | "lHipAbd" | "rHipAbd"
  | "lKnee" | "rKnee" | "lAnkle" | "rAnkle"
  | "rootPitch" | "rootRoll" | "rootYaw" | "rootLift";

export type Pose = Partial<Record<PoseKey, number>>;

export interface Clip {
  /** Durasi satu siklus (detik) pada kecepatan 1×. */
  duration: number;
  keys: { t: number; pose: Pose }[];
  /** floor: titik terendah menyentuh lantai. hang: tangan menggantung di palang. */
  ground: "floor" | "hang";
  prop?: "bench" | "bar" | "barbell" | "dumbbells" | "kettlebell" | "mat" | "treadmill";
}

const STAND: Pose = { lShAbd: 8, rShAbd: 8, lElbow: 8, rElbow: 8 };
const sym = (p: Record<string, number>): Pose => {
  const out: Pose = {};
  for (const [k, v] of Object.entries(p)) {
    out[`l${k}` as PoseKey] = v;
    out[`r${k}` as PoseKey] = v;
  }
  return out;
};
const loop = (a: Pose, b: Pose, duration: number, extra: Partial<Clip> = {}): Clip => ({
  duration,
  ground: "floor",
  keys: [
    { t: 0, pose: a },
    { t: 0.5, pose: b },
    { t: 1, pose: a },
  ],
  ...extra,
});

const QUAD: Pose = { rootPitch: 90, ...sym({ ShFlex: 90, HipFlex: 90, Knee: 90 }) };
const SUPINE: Pose = { rootPitch: -90 };

export const CLIPS: Record<AnimationId, Clip> = {
  squat: loop(
    { ...STAND, ...sym({ ShFlex: 70, Elbow: 60 }) },
    { spineFlex: 35, ...sym({ HipFlex: 105, Knee: 115, ShFlex: 75, Elbow: 60 }) },
    2.6,
    { prop: "dumbbells" },
  ),
  hinge: loop(
    { ...sym({ ShFlex: 0, HipFlex: 0, Knee: 5 }) },
    { spineFlex: 80, ...sym({ ShFlex: 80, HipFlex: 10, Knee: 22 }) },
    2.8,
    { prop: "barbell" },
  ),
  swing: loop(
    { spineFlex: 70, ...sym({ ShFlex: 40, Knee: 25, HipFlex: 10 }) },
    { spineFlex: -5, ...sym({ ShFlex: 95, Knee: 0 }) },
    1.3,
    { prop: "kettlebell" },
  ),
  bench: loop(
    { ...SUPINE, rootLift: 0.42, ...sym({ ShFlex: 90, Elbow: 0, HipFlex: 75, Knee: 95 }) },
    { ...SUPINE, rootLift: 0.42, ...sym({ ShFlex: 30, ShAbd: 55, Elbow: 100, HipFlex: 75, Knee: 95 }) },
    2.4,
    { prop: "bench" },
  ),
  pushup: loop(
    { rootPitch: 88, ...sym({ ShFlex: 90, Elbow: 0, Ankle: -30 }) },
    { rootPitch: 88, ...sym({ ShFlex: 25, Elbow: 70, ShAbd: 20, Ankle: -30 }) },
    2,
  ),
  ohp: loop(
    { ...sym({ ShFlex: 45, ShAbd: 60, Elbow: 135 }) },
    { ...sym({ ShFlex: 172, ShAbd: 8, Elbow: 0 }) },
    2.2,
    { prop: "dumbbells" },
  ),
  row: loop(
    { spineFlex: 60, ...sym({ ShFlex: 60, Elbow: 5, Knee: 20, HipFlex: 10 }) },
    { spineFlex: 60, ...sym({ ShFlex: 5, Elbow: 95, Knee: 20, HipFlex: 10 }) },
    2,
    { prop: "dumbbells" },
  ),
  pullup: {
    duration: 2.4,
    ground: "hang",
    prop: "bar",
    keys: [
      { t: 0, pose: { ...sym({ ShFlex: 175, ShAbd: 15, Elbow: 0, Knee: 20 }) } },
      { t: 0.5, pose: { ...sym({ ShFlex: 150, ShAbd: 40, Elbow: 125, Knee: 20 }) } },
      { t: 1, pose: { ...sym({ ShFlex: 175, ShAbd: 15, Elbow: 0, Knee: 20 }) } },
    ],
  },
  plank: loop(
    { rootPitch: 85, ...sym({ ShFlex: 90, Elbow: 90, Ankle: -30 }) },
    { rootPitch: 83, spineFlex: 2, ...sym({ ShFlex: 90, Elbow: 90, Ankle: -30 }) },
    3,
    { prop: "mat" },
  ),
  side_plank: loop(
    { rootRoll: -72, lShAbd: 90, lElbowZ: 90, rShAbd: 10, ...sym({ HipAbd: 0 }) },
    { rootRoll: -68, lShAbd: 90, lElbowZ: 90, rShAbd: 150 },
    3,
    { prop: "mat" },
  ),
  lunge: loop(
    { ...STAND, lHipFlex: 25, rHipFlex: -15, lKnee: 5, rKnee: 5 },
    { lHipFlex: 85, lKnee: 95, rHipFlex: -25, rKnee: 105, rAnkle: -40, ...sym({ ShAbd: 10 }) },
    2.4,
  ),
  split_squat: loop(
    { lHipFlex: 30, lKnee: 10, rHipFlex: -40, rKnee: 70, rAnkle: -50, ...sym({ ShAbd: 8 }) },
    { lHipFlex: 90, lKnee: 100, rHipFlex: -35, rKnee: 115, rAnkle: -50, spineFlex: 10, ...sym({ ShAbd: 8 }) },
    2.4,
    { prop: "dumbbells" },
  ),
  curl: loop({ ...sym({ ShFlex: 3, Elbow: 8 }) }, { ...sym({ ShFlex: 10, Elbow: 140 }) }, 2, { prop: "dumbbells" }),
  tricep_ext: loop({ ...sym({ ShFlex: 170, Elbow: 10 }) }, { ...sym({ ShFlex: 170, Elbow: 145 }) }, 2.2, { prop: "dumbbells" }),
  dip: loop(
    { rootLift: 0.1, ...sym({ HipFlex: 90, Knee: 30, ShFlex: -35, Elbow: 0 }) },
    { ...sym({ HipFlex: 90, Knee: 30, ShFlex: -55, Elbow: 90 }) },
    2,
    { prop: "bench" },
  ),
  lateral_raise: loop({ ...sym({ ShAbd: 10, Elbow: 10 }) }, { ...sym({ ShAbd: 88, Elbow: 15 }) }, 2.2, { prop: "dumbbells" }),
  bridge: loop(
    { ...SUPINE, ...sym({ HipFlex: 75, Knee: 105, ShFlex: 0, ShAbd: 20 }) },
    { ...SUPINE, rootLift: 0.18, spineFlex: -8, ...sym({ HipFlex: 15, Knee: 95, ShFlex: 0, ShAbd: 20 }) },
    2.4,
    { prop: "mat" },
  ),
  mountain_climber: loop(
    { rootPitch: 70, ...sym({ ShFlex: 75 }), lHipFlex: 95, lKnee: 110, rHipFlex: 0, rAnkle: -30 },
    { rootPitch: 70, ...sym({ ShFlex: 75 }), rHipFlex: 95, rKnee: 110, lHipFlex: 0, lAnkle: -30 },
    0.8,
  ),
  burpee: {
    duration: 3.2,
    ground: "floor",
    keys: [
      { t: 0, pose: STAND },
      { t: 0.2, pose: { spineFlex: 30, ...sym({ HipFlex: 110, Knee: 120, ShFlex: 60 }) } },
      { t: 0.4, pose: { rootPitch: 80, ...sym({ ShFlex: 90, Ankle: -30 }) } },
      { t: 0.6, pose: { spineFlex: 30, ...sym({ HipFlex: 110, Knee: 120, ShFlex: 60 }) } },
      { t: 0.8, pose: { rootLift: 0.35, ...sym({ ShFlex: 170, Ankle: 30 }) } },
      { t: 1, pose: STAND },
    ],
  },
  jumping_jack: loop(
    { ...sym({ ShAbd: 10, HipAbd: 2 }) },
    { rootLift: 0.08, ...sym({ ShAbd: 165, HipAbd: 18, Ankle: 25 }) },
    0.9,
  ),
  calf_raise: loop({ ...STAND }, { ...STAND, ...sym({ Ankle: 35 }) }, 1.8),
  dead_bug: loop(
    { ...SUPINE, ...sym({ ShFlex: 90, HipFlex: 90, Knee: 90 }) },
    { ...SUPINE, lShFlex: 170, rShFlex: 90, lHipFlex: 90, lKnee: 90, rHipFlex: 20, rKnee: 5 },
    2.6,
    { prop: "mat" },
  ),
  bird_dog: loop(
    { ...QUAD },
    { ...QUAD, lShFlex: 175, rHipFlex: 0, rKnee: 0 },
    3,
    { prop: "mat" },
  ),
  cat_cow: loop({ ...QUAD, spineFlex: 22, neckFlex: 30 }, { ...QUAD, spineFlex: -18, neckFlex: -25 }, 3.4, { prop: "mat" }),
  hip_90_90: loop(
    { ...sym({ HipFlex: 90 }), lHipAbd: 40, lKnee: 90, rHipAbd: 5, rKnee: 90, ...sym({ ShAbd: 20 }) },
    { ...sym({ HipFlex: 90 }), lHipAbd: 5, lKnee: 90, rHipAbd: 40, rKnee: 90, ...sym({ ShAbd: 20 }) },
    3.2,
    { prop: "mat" },
  ),
  chin_tuck: loop({ ...STAND, headForward: 0.04 }, { ...STAND, headForward: -0.025, neckFlex: 6 }, 2.4),
  wall_slide: loop({ ...sym({ ShAbd: 85, ElbowZ: 95 }) }, { ...sym({ ShAbd: 150, ElbowZ: 15 }) }, 2.6),
  pull_apart: loop({ ...sym({ ShFlex: 90, Elbow: 5 }) }, { ...sym({ ShFlex: 90, ShHorz: 80, Elbow: 5 }) }, 1.8),
  run: {
    duration: 0.75,
    ground: "floor",
    prop: "treadmill",
    keys: [
      { t: 0, pose: { spineFlex: 8, lHipFlex: 45, lKnee: 40, rHipFlex: -20, rKnee: 95, lShFlex: -35, rShFlex: 40, ...sym({ Elbow: 90 }) } },
      { t: 0.25, pose: { spineFlex: 8, rootLift: 0.06, lHipFlex: 10, lKnee: 20, rHipFlex: 10, rKnee: 60, ...sym({ Elbow: 90, ShFlex: 0 }) } },
      { t: 0.5, pose: { spineFlex: 8, rHipFlex: 45, rKnee: 40, lHipFlex: -20, lKnee: 95, rShFlex: -35, lShFlex: 40, ...sym({ Elbow: 90 }) } },
      { t: 0.75, pose: { spineFlex: 8, rootLift: 0.06, rHipFlex: 10, rKnee: 20, lHipFlex: 10, lKnee: 60, ...sym({ Elbow: 90, ShFlex: 0 }) } },
      { t: 1, pose: { spineFlex: 8, lHipFlex: 45, lKnee: 40, rHipFlex: -20, rKnee: 95, lShFlex: -35, rShFlex: 40, ...sym({ Elbow: 90 }) } },
    ],
  },
  toe_touch: loop({ ...STAND }, { spineFlex: 105, neckFlex: 20, ...sym({ ShFlex: 105, Knee: 5 }) }, 4),
};

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Interpolasi pose pada fase t ∈ [0,1). */
export function samplePose(clip: Clip, t: number): Pose {
  const keys = clip.keys;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const local = smooth(Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-6, b.t - a.t))));
  const out: Pose = {};
  const allKeys = new Set([...Object.keys(a.pose), ...Object.keys(b.pose)]) as Set<PoseKey>;
  for (const k of allKeys) {
    const va = a.pose[k] ?? 0;
    const vb = b.pose[k] ?? 0;
    out[k] = va + (vb - va) * local;
  }
  return out;
}
