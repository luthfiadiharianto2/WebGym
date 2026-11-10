// Profil pelacakan per jenis gerakan: metrik sudut, ambang rep, dan aturan form.
import { LM, vis, type Landmark, type PoseFrame } from "./landmarks";
import { angle3, angleFromVertical, dist2D, midpoint, signedLineDeviation } from "./math";
import type { RepCounterConfig } from "./repCounter";

export type Severity = 0 | 1 | 2; // 0 ok, 1 peringatan (kuning), 2 salah (merah)

export interface FrameCtx {
  frame: PoseFrame;
  /** Landmark gambar (2D, aspek terkoreksi). */
  lm: Landmark[];
  /** Landmark untuk sudut 3D (world bila ada). */
  w: Landmark[];
  /** Progres rep 0..1 (bisa <0 atau >1). */
  p: number;
}

export interface FormRule {
  id: string;
  /** Kunci i18n untuk umpan balik, mis. "form.knee_valgus". */
  messageKey: string;
  /** Penalti maksimum terhadap skor rep (0..100). */
  weight: number;
  /** Landmark yang diwarnai bila aturan dilanggar. */
  joints: number[];
  /** Hanya dievaluasi saat progres ≥ nilai ini (mis. hanya di dasar squat). */
  minProgress?: number;
  check(ctx: FrameCtx): Severity;
}

export interface MetricValue {
  value: number;
  left: number | null;
  right: number | null;
}

export interface TrackingProfile {
  id: string;
  view: "front" | "side" | "any";
  metric(f: PoseFrame): MetricValue | null;
  counter: RepCounterConfig;
  rules: FormRule[];
  /** Untuk latihan tahan (plank): tidak menghitung rep, melainkan durasi. */
  hold?: { inPosition(ctx: FrameCtx): boolean };
  requiredLandmarks: number[];
}

const L = LM;
const pts = (f: PoseFrame) => f.world ?? f.landmarks;

/** Metrik bilateral: rata-rata kiri & kanan, menimbang visibilitas. */
function bilateral(
  f: PoseFrame,
  left: [number, number, number],
  right: [number, number, number],
  mode: "avg" | "min" | "max" = "avg",
): MetricValue | null {
  const w = pts(f);
  const lm = f.landmarks;
  const visL = Math.min(...left.map((i) => vis(lm[i])));
  const visR = Math.min(...right.map((i) => vis(lm[i])));
  const a = visL >= 0.4 ? angle3(w[left[0]], w[left[1]], w[left[2]]) : null;
  const b = visR >= 0.4 ? angle3(w[right[0]], w[right[1]], w[right[2]]) : null;
  if (a === null && b === null) return null;
  if (a === null) return { value: b!, left: null, right: b };
  if (b === null) return { value: a, left: a, right: null };
  const value = mode === "min" ? Math.min(a, b) : mode === "max" ? Math.max(a, b) : (a + b) / 2;
  return { value, left: a, right: b };
}

// ---------- Aturan form yang dapat dipakai ulang ----------

const kneeValgus: FormRule = {
  id: "knee_valgus",
  messageKey: "form.knee_valgus",
  weight: 25,
  joints: [L.LEFT_KNEE, L.RIGHT_KNEE],
  minProgress: 0.5,
  check: ({ lm }) => {
    // Tampak depan: jarak antar-lutut dibanding jarak antar-pergelangan kaki.
    const knees = Math.abs(lm[L.LEFT_KNEE].x - lm[L.RIGHT_KNEE].x);
    const ankles = Math.abs(lm[L.LEFT_ANKLE].x - lm[L.RIGHT_ANKLE].x);
    const hips = Math.abs(lm[L.LEFT_HIP].x - lm[L.RIGHT_HIP].x);
    // Abaikan bila kamera dari samping (lebar pinggul sangat kecil).
    if (hips < 0.04 || ankles < 0.04) return 0;
    const ratio = knees / ankles;
    if (ratio < 0.7) return 2;
    if (ratio < 0.85) return 1;
    return 0;
  },
};

function torsoLean(maxWarn: number, maxBad: number, minProgress = 0.5): FormRule {
  return {
    id: "torso_lean",
    messageKey: "form.back_lean",
    weight: 20,
    joints: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
    minProgress,
    check: ({ lm }) => {
      const sh = midpoint(lm[L.LEFT_SHOULDER], lm[L.RIGHT_SHOULDER]);
      const hp = midpoint(lm[L.LEFT_HIP], lm[L.RIGHT_HIP]);
      const a = angleFromVertical(hp, sh);
      return a > maxBad ? 2 : a > maxWarn ? 1 : 0;
    },
  };
}

const heelLift: FormRule = {
  id: "heel_lift",
  messageKey: "form.heel_lift",
  weight: 10,
  joints: [L.LEFT_HEEL, L.RIGHT_HEEL],
  minProgress: 0.6,
  check: ({ lm }) => {
    const leg = dist2D(lm[L.LEFT_HIP], lm[L.LEFT_ANKLE]) || 1;
    const lift = Math.max(
      lm[L.LEFT_FOOT].y - lm[L.LEFT_HEEL].y,
      lm[L.RIGHT_FOOT].y - lm[L.RIGHT_HEEL].y,
    );
    return lift / leg > 0.1 ? 1 : 0;
  },
};

/** Membandingkan sisi kiri & kanan metrik utama. */
function asymmetry(profileMetric: (f: PoseFrame) => MetricValue | null, warnDeg = 12, badDeg = 20): FormRule {
  return {
    id: "asymmetry",
    messageKey: "form.asymmetry",
    weight: 10,
    joints: [L.LEFT_KNEE, L.RIGHT_KNEE, L.LEFT_ELBOW, L.RIGHT_ELBOW],
    minProgress: 0.3,
    check: ({ frame }) => {
      const m = profileMetric(frame);
      if (!m || m.left === null || m.right === null) return 0;
      const d = Math.abs(m.left - m.right);
      return d > badDeg ? 2 : d > warnDeg ? 1 : 0;
    },
  };
}

function bodyLine(id: "hip_sag" | "hip_pike"): FormRule {
  return {
    id,
    messageKey: `form.${id}`,
    weight: 25,
    joints: [L.LEFT_HIP, L.RIGHT_HIP],
    check: ({ lm }) => {
      const side = vis(lm[L.LEFT_HIP]) >= vis(lm[L.RIGHT_HIP]) ? "L" : "R";
      const s = lm[side === "L" ? L.LEFT_SHOULDER : L.RIGHT_SHOULDER];
      const h = lm[side === "L" ? L.LEFT_HIP : L.RIGHT_HIP];
      const a = lm[side === "L" ? L.LEFT_ANKLE : L.RIGHT_ANKLE];
      const dev = signedLineDeviation(s, h, a);
      if (id === "hip_sag") return dev > 0.1 ? 2 : dev > 0.06 ? 1 : 0;
      return dev < -0.14 ? 2 : dev < -0.09 ? 1 : 0;
    },
  };
}

/** Perkiraan punggung membulat: sudut telinga–bahu–pinggul (proksi kasar, bukan pengukuran tulang belakang). */
const backRounding: FormRule = {
  id: "back_rounding",
  messageKey: "form.back_rounding",
  weight: 25,
  joints: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.NOSE],
  minProgress: 0.4,
  check: ({ lm }) => {
    const side = vis(lm[L.LEFT_EAR]) >= vis(lm[L.RIGHT_EAR]) ? "L" : "R";
    const ear = lm[side === "L" ? L.LEFT_EAR : L.RIGHT_EAR];
    const sh = lm[side === "L" ? L.LEFT_SHOULDER : L.RIGHT_SHOULDER];
    const hip = lm[side === "L" ? L.LEFT_HIP : L.RIGHT_HIP];
    const a = angle3(ear, sh, hip, false);
    return a < 125 ? 2 : a < 140 ? 1 : 0;
  },
};

const elbowDrift: FormRule = {
  id: "elbow_drift",
  messageKey: "form.elbow_drift",
  weight: 20,
  joints: [L.LEFT_ELBOW, L.RIGHT_ELBOW],
  check: ({ lm }) => {
    const a = Math.max(
      angleFromVertical(lm[L.LEFT_SHOULDER], lm[L.LEFT_ELBOW]),
      angleFromVertical(lm[L.RIGHT_SHOULDER], lm[L.RIGHT_ELBOW]),
    );
    return a > 40 ? 2 : a > 28 ? 1 : 0;
  },
};

const torsoSwing: FormRule = { ...torsoLean(12, 22, 0), id: "torso_swing", messageKey: "form.torso_swing", weight: 15 };

const backArch: FormRule = { ...torsoLean(12, 20, 0.3), id: "back_arch", messageKey: "form.back_arch", weight: 20 };

const raiseTooHigh: FormRule = {
  id: "raise_too_high",
  messageKey: "form.raise_too_high",
  weight: 10,
  joints: [L.LEFT_WRIST, L.RIGHT_WRIST],
  check: ({ w }) => {
    const a = Math.max(
      angle3(w[L.LEFT_HIP], w[L.LEFT_SHOULDER], w[L.LEFT_ELBOW]),
      angle3(w[L.RIGHT_HIP], w[L.RIGHT_SHOULDER], w[L.RIGHT_ELBOW]),
    );
    return a > 120 ? 1 : 0;
  },
};

const lockout: FormRule = {
  id: "no_lockout",
  messageKey: "form.no_lockout",
  weight: 10,
  joints: [L.LEFT_ELBOW, L.RIGHT_ELBOW],
  minProgress: 0.95,
  check: ({ w }) => {
    const e = Math.min(
      angle3(w[L.LEFT_SHOULDER], w[L.LEFT_ELBOW], w[L.LEFT_WRIST]),
      angle3(w[L.RIGHT_SHOULDER], w[L.RIGHT_ELBOW], w[L.RIGHT_WRIST]),
    );
    return e < 145 ? 1 : 0;
  },
};

const elbowFlare: FormRule = {
  id: "elbow_flare",
  messageKey: "form.elbow_flare",
  weight: 15,
  joints: [L.LEFT_ELBOW, L.RIGHT_ELBOW],
  check: ({ lm }) => {
    const sh = Math.abs(lm[L.LEFT_SHOULDER].x - lm[L.RIGHT_SHOULDER].x);
    const el = Math.abs(lm[L.LEFT_ELBOW].x - lm[L.RIGHT_ELBOW].x);
    if (sh < 0.05) return 0;
    return el / sh > 1.6 ? 2 : el / sh > 1.35 ? 1 : 0;
  },
};

const torsoTooUpright: FormRule = {
  id: "torso_upright",
  messageKey: "form.torso_upright",
  weight: 15,
  joints: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER],
  check: ({ lm }) => {
    const sh = midpoint(lm[L.LEFT_SHOULDER], lm[L.RIGHT_SHOULDER]);
    const hp = midpoint(lm[L.LEFT_HIP], lm[L.RIGHT_HIP]);
    const a = angleFromVertical(hp, sh);
    return a < 25 ? 1 : 0;
  },
};

// ---------- Metrik ----------

const kneeAngle = (f: PoseFrame) => bilateral(f, [L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE], [L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE]);
const frontKneeAngle = (f: PoseFrame) =>
  bilateral(f, [L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE], [L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE], "min");
const elbowAngle = (f: PoseFrame) =>
  bilateral(f, [L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST], [L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST]);
const elbowAngleMin = (f: PoseFrame) =>
  bilateral(f, [L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST], [L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST], "min");
const shoulderElevElbow = (f: PoseFrame) =>
  bilateral(f, [L.LEFT_HIP, L.LEFT_SHOULDER, L.LEFT_ELBOW], [L.RIGHT_HIP, L.RIGHT_SHOULDER, L.RIGHT_ELBOW]);
const shoulderElevWrist = (f: PoseFrame) =>
  bilateral(f, [L.LEFT_HIP, L.LEFT_SHOULDER, L.LEFT_WRIST], [L.RIGHT_HIP, L.RIGHT_SHOULDER, L.RIGHT_WRIST]);
const hipAngle = (f: PoseFrame) =>
  bilateral(f, [L.LEFT_SHOULDER, L.LEFT_HIP, L.LEFT_KNEE], [L.RIGHT_SHOULDER, L.RIGHT_HIP, L.RIGHT_KNEE]);
const ankleAngle = (f: PoseFrame) =>
  bilateral(f, [L.LEFT_KNEE, L.LEFT_ANKLE, L.LEFT_FOOT], [L.RIGHT_KNEE, L.RIGHT_ANKLE, L.RIGHT_FOOT]);

const BODY = [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP];
const LEGS = [...BODY, L.LEFT_KNEE, L.RIGHT_KNEE, L.LEFT_ANKLE, L.RIGHT_ANKLE];
const ARMS = [...BODY, L.LEFT_ELBOW, L.RIGHT_ELBOW, L.LEFT_WRIST, L.RIGHT_WRIST];

export const PROFILES: Record<string, TrackingProfile> = {
  squat: {
    id: "squat",
    view: "any",
    metric: kneeAngle,
    counter: { rest: 165, peak: 105, target: 85 },
    rules: [kneeValgus, torsoLean(45, 58), heelLift, asymmetry(kneeAngle)],
    requiredLandmarks: LEGS,
  },
  lunge: {
    id: "lunge",
    view: "side",
    metric: frontKneeAngle,
    counter: { rest: 160, peak: 115, target: 90 },
    rules: [torsoLean(22, 35), kneeValgus],
    requiredLandmarks: LEGS,
  },
  pushup: {
    id: "pushup",
    view: "side",
    metric: elbowAngle,
    counter: { rest: 155, peak: 105, target: 80 },
    rules: [bodyLine("hip_sag"), bodyLine("hip_pike"), asymmetry(elbowAngle, 15, 25)],
    requiredLandmarks: [...ARMS, L.LEFT_ANKLE, L.RIGHT_ANKLE],
  },
  curl: {
    id: "curl",
    view: "any",
    metric: elbowAngleMin,
    counter: { rest: 145, peak: 65, target: 45 },
    rules: [elbowDrift, torsoSwing],
    requiredLandmarks: ARMS,
  },
  ohp: {
    id: "ohp",
    view: "front",
    metric: shoulderElevElbow,
    counter: { rest: 95, peak: 150, target: 170 },
    rules: [backArch, lockout, asymmetry(shoulderElevElbow, 12, 22)],
    requiredLandmarks: ARMS,
  },
  lateral_raise: {
    id: "lateral_raise",
    view: "front",
    metric: shoulderElevElbow,
    counter: { rest: 25, peak: 70, target: 88 },
    rules: [raiseTooHigh, torsoSwing, asymmetry(shoulderElevElbow, 12, 20)],
    requiredLandmarks: ARMS,
  },
  hinge: {
    id: "hinge",
    view: "side",
    metric: hipAngle,
    counter: { rest: 165, peak: 115, target: 90 },
    rules: [backRounding],
    requiredLandmarks: LEGS,
  },
  bridge: {
    id: "bridge",
    view: "side",
    metric: hipAngle,
    counter: { rest: 135, peak: 162, target: 175 },
    rules: [asymmetry(hipAngle, 10, 18)],
    requiredLandmarks: LEGS,
  },
  jumping_jack: {
    id: "jumping_jack",
    view: "front",
    metric: shoulderElevWrist,
    counter: { rest: 35, peak: 135, target: 160, minRepMs: 300 },
    rules: [asymmetry(shoulderElevWrist, 18, 30)],
    requiredLandmarks: ARMS,
  },
  row: {
    id: "row",
    view: "side",
    metric: elbowAngleMin,
    counter: { rest: 150, peak: 100, target: 75 },
    rules: [torsoTooUpright],
    requiredLandmarks: ARMS,
  },
  calf_raise: {
    id: "calf_raise",
    view: "side",
    metric: ankleAngle,
    counter: { rest: 115, peak: 132, target: 145 },
    rules: [],
    requiredLandmarks: LEGS,
  },
  tricep_ext: {
    id: "tricep_ext",
    view: "any",
    metric: elbowAngle,
    counter: { rest: 150, peak: 85, target: 60 },
    rules: [elbowFlare],
    requiredLandmarks: ARMS,
  },
  plank: {
    id: "plank",
    view: "side",
    metric: (f) => bilateral(f, [L.LEFT_SHOULDER, L.LEFT_HIP, L.LEFT_ANKLE], [L.RIGHT_SHOULDER, L.RIGHT_HIP, L.RIGHT_ANKLE]),
    counter: { rest: 0, peak: 1 },
    rules: [bodyLine("hip_sag"), bodyLine("hip_pike")],
    hold: {
      inPosition: ({ lm }) => {
        // Badan kurang lebih horizontal: bahu & pergelangan kaki berada pada ketinggian yang mirip.
        const sh = midpoint(lm[L.LEFT_SHOULDER], lm[L.RIGHT_SHOULDER]);
        const an = midpoint(lm[L.LEFT_ANKLE], lm[L.RIGHT_ANKLE]);
        return angleFromVertical(an, sh) > 55;
      },
    },
    requiredLandmarks: [...BODY, L.LEFT_ANKLE, L.RIGHT_ANKLE],
  },
};

export function getProfile(id: string | undefined): TrackingProfile | null {
  return id ? (PROFILES[id] ?? null) : null;
}
