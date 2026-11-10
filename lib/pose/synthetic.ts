// Generator landmark sintetis: dipakai untuk unit test dan "Mode Demo" tanpa kamera.
// Koordinat dalam meter, y mengarah ke BAWAH (sama dengan konvensi MediaPipe).
import { LM, type Landmark, type PoseFrame } from "./landmarks";

const DEG = Math.PI / 180;
const SHIN = 0.45;
const THIGH = 0.45;
const TORSO = 0.55;
const UPPER_ARM = 0.3;
const FOREARM = 0.27;

type V = { x: number; y: number; z?: number };
const add = (a: V, dx: number, dy: number): V => ({ x: a.x + dx, y: a.y + dy });

function blank(): Landmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.99 }));
}

function set(arr: Landmark[], i: number, p: V, z = 0): void {
  arr[i] = { x: p.x, y: p.y, z: p.z ?? z, visibility: 0.99 };
}

export interface SideParams {
  /** Sudut lutut interior (180 = lurus). */
  knee?: number;
  /** Kecondongan torso dari vertikal (derajat, + = ke depan). */
  torsoLean?: number;
  /** Sudut siku interior (180 = lurus). */
  elbow?: number;
  /** Elevasi lengan atas dari posisi menggantung (0 = di samping badan, 180 = lurus ke atas). */
  shoulderFlex?: number;
  /** Kepala condong ke depan (meter). */
  headForward?: number;
  /** Tumit terangkat (meter). */
  heelLift?: number;
}

/** Pose tampak samping (bidang sagital), orang menghadap +x. */
export function sideViewPose(p: SideParams = {}): Landmark[] {
  const knee = p.knee ?? 175;
  const lean = (p.torsoLean ?? Math.max(0, (180 - knee) * 0.45)) * DEG;
  const elbow = (p.elbow ?? 175) * DEG;
  const flex = (p.shoulderFlex ?? 5) * DEG;
  const out = blank();
  const flexion = (180 - knee) * DEG;
  const a = flexion * 0.45; // kemiringan tulang kering ke depan
  const b = flexion - a; // kemiringan paha ke belakang
  const heel = p.heelLift ?? 0;
  const ankle: V = { x: 0, y: -heel };
  const kneeP = add(ankle, SHIN * Math.sin(a), -SHIN * Math.cos(a));
  const hip = add(kneeP, -THIGH * Math.sin(b), -THIGH * Math.cos(b));
  const shoulder = add(hip, TORSO * Math.sin(lean), -TORSO * Math.cos(lean));
  // Lengan atas: rotasi dari arah "turun" sebesar flex ke depan.
  const elbowP = add(shoulder, UPPER_ARM * Math.sin(flex), UPPER_ARM * Math.cos(flex));
  // Lengan bawah: sudut interior siku = elbow.
  const upperDir = Math.atan2(shoulder.y - elbowP.y, shoulder.x - elbowP.x);
  const foreDir = upperDir - elbow; // putar searah menuju depan
  const wrist = add(elbowP, FOREARM * Math.cos(foreDir), FOREARM * Math.sin(foreDir));
  const ear = add(shoulder, 0.02 + (p.headForward ?? 0), -0.14);
  const nose = add(ear, 0.09, 0.02);
  for (const [side, z] of [["L", -0.15], ["R", 0.15]] as const) {
    const L = side === "L";
    set(out, L ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE, ankle, z);
    set(out, L ? LM.LEFT_HEEL : LM.RIGHT_HEEL, add(ankle, -0.06, 0.05), z);
    set(out, L ? LM.LEFT_FOOT : LM.RIGHT_FOOT, { x: 0.15, y: 0.06 }, z);
    set(out, L ? LM.LEFT_KNEE : LM.RIGHT_KNEE, kneeP, z);
    set(out, L ? LM.LEFT_HIP : LM.RIGHT_HIP, hip, z * 0.7);
    set(out, L ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER, shoulder, z * 1.2);
    set(out, L ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW, elbowP, z * 1.3);
    set(out, L ? LM.LEFT_WRIST : LM.RIGHT_WRIST, wrist, z * 1.3);
    set(out, L ? LM.LEFT_EAR : LM.RIGHT_EAR, ear, z * 0.5);
    set(out, L ? LM.LEFT_EYE : LM.RIGHT_EYE, add(ear, 0.07, -0.02), z * 0.3);
  }
  set(out, LM.NOSE, nose);
  fillHands(out);
  return out;
}

export interface FrontParams {
  shoulderTiltDeg?: number;
  pelvicTiltDeg?: number;
  /** Rasio jarak lutut/jarak pergelangan kaki (1 = lurus, <0.8 = valgus). */
  kneeRatio?: number;
  /** Abduksi lengan dari badan (0 = di samping, 90 = horizontal, 170 = ke atas). */
  armAbduction?: number;
  shoulderHalfWidth?: number;
  hipHalfWidth?: number;
  /** Lengan kiri vs kanan berbeda (derajat), untuk uji asimetri. */
  armAsymmetry?: number;
}

/** Pose tampak depan; x kanan gambar = sisi KIRI pengguna (seperti kamera tidak di-mirror). */
export function frontViewPose(p: FrontParams = {}): Landmark[] {
  const out = blank();
  const sw = p.shoulderHalfWidth ?? 0.2;
  const hw = p.hipHalfWidth ?? 0.15;
  const st = (p.shoulderTiltDeg ?? 0) * DEG;
  const pt = (p.pelvicTiltDeg ?? 0) * DEG;
  const ankleHalf = 0.14;
  const kneeHalf = ankleHalf * (p.kneeRatio ?? 1);
  const hipY = -(SHIN + THIGH);
  const shY = hipY - TORSO;
  // tilt positif = sisi kanan pengguna (x negatif) lebih rendah
  set(out, LM.LEFT_HIP, { x: hw, y: hipY - Math.sin(pt) * hw });
  set(out, LM.RIGHT_HIP, { x: -hw, y: hipY + Math.sin(pt) * hw });
  set(out, LM.LEFT_SHOULDER, { x: sw, y: shY - Math.sin(st) * sw });
  set(out, LM.RIGHT_SHOULDER, { x: -sw, y: shY + Math.sin(st) * sw });
  set(out, LM.LEFT_KNEE, { x: kneeHalf, y: hipY + THIGH });
  set(out, LM.RIGHT_KNEE, { x: -kneeHalf, y: hipY + THIGH });
  set(out, LM.LEFT_ANKLE, { x: ankleHalf, y: 0 });
  set(out, LM.RIGHT_ANKLE, { x: -ankleHalf, y: 0 });
  set(out, LM.LEFT_HEEL, { x: ankleHalf, y: 0.05 });
  set(out, LM.RIGHT_HEEL, { x: -ankleHalf, y: 0.05 });
  set(out, LM.LEFT_FOOT, { x: ankleHalf + 0.03, y: 0.06 });
  set(out, LM.RIGHT_FOOT, { x: -ankleHalf - 0.03, y: 0.06 });
  const abd = p.armAbduction ?? 8;
  const asym = p.armAsymmetry ?? 0;
  for (const [side, sign, extra] of [["L", 1, 0], ["R", -1, asym]] as const) {
    const sh = out[side === "L" ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER];
    const ang = (abd + extra) * DEG;
    const elbow = { x: sh.x + sign * UPPER_ARM * Math.sin(ang), y: sh.y + UPPER_ARM * Math.cos(ang) };
    const wrist = { x: elbow.x + sign * FOREARM * Math.sin(ang), y: elbow.y + FOREARM * Math.cos(ang) };
    set(out, side === "L" ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW, elbow);
    set(out, side === "L" ? LM.LEFT_WRIST : LM.RIGHT_WRIST, wrist);
  }
  const headY = shY - 0.2;
  set(out, LM.NOSE, { x: 0, y: headY });
  set(out, LM.LEFT_EYE, { x: 0.03, y: headY - 0.03 });
  set(out, LM.RIGHT_EYE, { x: -0.03, y: headY - 0.03 });
  set(out, LM.LEFT_EAR, { x: 0.07, y: headY - 0.01 });
  set(out, LM.RIGHT_EAR, { x: -0.07, y: headY - 0.01 });
  fillHands(out);
  return out;
}

/** Pose push-up/plank tampak samping. sag: + = pinggul turun (meter). */
export function pushupPose(elbowDeg: number, sag = 0): Landmark[] {
  const out = blank();
  const wrist: V = { x: 0, y: 0 };
  const elbow = add(wrist, 0, -FOREARM);
  const e = elbowDeg * DEG;
  const shoulder = add(elbow, -UPPER_ARM * Math.sin(e), UPPER_ARM * Math.cos(e));
  const ankle: V = { x: shoulder.x + 1.45, y: -0.05 };
  const hipBase = { x: shoulder.x + 0.55, y: shoulder.y + (ankle.y - shoulder.y) * (0.55 / 1.45) };
  const hip = add(hipBase, 0, sag);
  const knee = { x: (hip.x + ankle.x) / 2, y: (hip.y + ankle.y) / 2 };
  for (const [side, z] of [["L", -0.15], ["R", 0.15]] as const) {
    const L = side === "L";
    set(out, L ? LM.LEFT_WRIST : LM.RIGHT_WRIST, wrist, z);
    set(out, L ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW, elbow, z);
    set(out, L ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER, shoulder, z);
    set(out, L ? LM.LEFT_HIP : LM.RIGHT_HIP, hip, z * 0.7);
    set(out, L ? LM.LEFT_KNEE : LM.RIGHT_KNEE, knee, z * 0.7);
    set(out, L ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE, ankle, z * 0.7);
    set(out, L ? LM.LEFT_HEEL : LM.RIGHT_HEEL, add(ankle, 0.04, -0.03), z * 0.7);
    set(out, L ? LM.LEFT_FOOT : LM.RIGHT_FOOT, add(ankle, 0.03, 0.06), z * 0.7);
    set(out, L ? LM.LEFT_EAR : LM.RIGHT_EAR, add(shoulder, -0.14, -0.04), z * 0.5);
  }
  set(out, LM.NOSE, add(shoulder, -0.22, 0));
  fillHands(out);
  return out;
}

function fillHands(out: Landmark[]): void {
  // 17-22 jari & 1,3,4,6,9,10 wajah: salin dari titik terdekat agar array lengkap.
  const copy = (to: number, from: number) => (out[to] = { ...out[from] });
  copy(17, 15); copy(19, 15); copy(21, 15);
  copy(18, 16); copy(20, 16); copy(22, 16);
  copy(1, 2); copy(3, 2); copy(4, 5); copy(6, 5); copy(9, 0); copy(10, 0);
}

/** Proyeksi meter → koordinat gambar ternormalisasi (0..1, y bawah). */
export function toImage(lms: Landmark[], opts: { scale?: number; cx?: number; baseY?: number } = {}): Landmark[] {
  const scale = opts.scale ?? 0.42;
  const cx = opts.cx ?? 0.5;
  const baseY = opts.baseY ?? 0.92;
  return lms.map((l) => ({ x: cx + l.x * scale, y: baseY + l.y * scale, z: (l.z ?? 0) * scale, visibility: l.visibility }));
}

/** Pseudo-random deterministik (LCG) agar test stabil. */
export function seededNoise(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff - 0.5;
  };
}

function jitter(lms: Landmark[], amount: number, rnd: () => number): Landmark[] {
  return lms.map((l) => ({ ...l, x: l.x + rnd() * amount, y: l.y + rnd() * amount }));
}

export interface SequenceOptions {
  reps?: number;
  fps?: number;
  repSec?: number;
  pauseSec?: number;
  noise?: number;
  seed?: number;
}

/**
 * Membuat urutan frame dari fungsi pose berparameter s ∈ [0,1]
 * (0 = posisi istirahat, 1 = puncak gerakan) dengan profil kosinus.
 */
export function makeSequence(poseAt: (s: number) => Landmark[], opts: SequenceOptions = {}): PoseFrame[] {
  const { reps = 5, fps = 30, repSec = 2, pauseSec = 0.6, noise = 0.004, seed = 7 } = opts;
  const rnd = seededNoise(seed);
  const frames: PoseFrame[] = [];
  let t = 0;
  const dt = 1000 / fps;
  const push = (s: number) => {
    const world = poseAt(s);
    frames.push({ landmarks: jitter(toImage(world), noise, rnd), world: jitter(world, noise, rnd), t });
    t += dt;
  };
  for (let i = 0; i < Math.round(pauseSec * fps); i++) push(0);
  for (let r = 0; r < reps; r++) {
    const n = Math.round(repSec * fps);
    for (let i = 0; i <= n; i++) push((1 - Math.cos((i / n) * 2 * Math.PI)) / 2);
    for (let i = 0; i < Math.round(pauseSec * fps); i++) push(0);
  }
  return frames;
}

/** Urutan squat: lutut dari 172° ke `minKnee`. */
export function squatSequence(opts: SequenceOptions & { minKnee?: number } = {}): PoseFrame[] {
  const minKnee = opts.minKnee ?? 85;
  return makeSequence((s) => sideViewPose({ knee: 172 - (172 - minKnee) * s }), opts);
}

export { LM };
