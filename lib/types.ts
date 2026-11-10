// Tipe domain bersama untuk seluruh aplikasi.

export type Locale = "id" | "en";
export type LocalizedText = { id: string; en: string };

export const MUSCLES = [
  "chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "triceps",
  "biceps",
  "forearms",
  "upper_back",
  "lats",
  "lower_back",
  "abs",
  "obliques",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "calves",
  "hip_flexors",
  "neck",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const EQUIPMENT = [
  "bodyweight",
  "barbell",
  "dumbbell",
  "kettlebell",
  "bench",
  "pullup_bar",
  "cable",
  "band",
  "mat",
  "treadmill",
  "rack",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export type Level = "beginner" | "intermediate" | "advanced";
export type Goal = "hypertrophy" | "strength" | "fat_loss" | "endurance";
export type Zone = "strength" | "cardio" | "functional" | "stretching";

export const INJURIES = ["knee", "lower_back", "shoulder", "wrist", "neck", "hip", "ankle", "elbow"] as const;
export type Injury = (typeof INJURIES)[number];

/** Pola gerak — dipakai mesin rekomendasi untuk menyusun split. */
export type MovementPattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "core"
  | "arms"
  | "shoulders"
  | "conditioning"
  | "mobility"
  | "corrective"
  | "calves";

/** Nama klip animasi avatar prosedural. */
export type AnimationId =
  | "squat"
  | "hinge"
  | "swing"
  | "bench"
  | "pushup"
  | "ohp"
  | "row"
  | "pullup"
  | "plank"
  | "side_plank"
  | "lunge"
  | "split_squat"
  | "curl"
  | "tricep_ext"
  | "dip"
  | "lateral_raise"
  | "bridge"
  | "mountain_climber"
  | "burpee"
  | "jumping_jack"
  | "calf_raise"
  | "dead_bug"
  | "bird_dog"
  | "cat_cow"
  | "hip_90_90"
  | "chin_tuck"
  | "wall_slide"
  | "pull_apart"
  | "run"
  | "toe_touch";

export interface Exercise {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  zone: Zone;
  pattern: MovementPattern;
  animation: AnimationId;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment[];
  level: Level;
  goals: Goal[];
  commonMistakes: LocalizedText[];
  cues: LocalizedText[];
  variations: string[];
  /** Cedera yang membuat latihan ini sebaiknya dihindari/diganti. */
  contraindications: Injury[];
  /** ID profil pelacakan kamera, jika latihan bisa dihitung otomatis. */
  tracking?: string;
  unilateral?: boolean;
  /** Latihan tahan waktu (plank dll.). */
  timed?: boolean;
  loadable?: boolean;
}

export interface Profile {
  id: string;
  displayName: string;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  level: Level;
  goal: Goal;
  injuries: Injury[];
  daysPerWeek: number;
  equipment: Equipment[];
  parqAnswers: Record<string, boolean>;
  parqFlag: boolean;
  onboardedAt: string | null;
  locale: Locale;
}

export interface WorkoutSession {
  id: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  source: "camera" | "manual";
  planItemId?: string | null;
  notes?: string | null;
}

export interface SetLog {
  id: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  weightKg: number | null;
  formScore: number;
  romDeg: number;
  romPct: number;
  symmetry: number;
  tempoDownMs: number;
  tempoUpMs: number;
  consistency: number;
  holdSec?: number | null;
  issues: string[];
  createdAt: string;
}

export interface BodyProportions {
  shoulderToHip: number;
  shoulderToWaist: number | null;
  waistToHip: number | null;
  method: "landmarks" | "segmentation";
}

export interface PostureAssessment {
  id: string;
  createdAt: string;
  shoulderTiltDeg: number;
  pelvicTiltDeg: number;
  forwardHeadRatio: number | null;
  spineDeviationDeg: number;
  symmetryScore: number;
  postureScore: number;
  proportions: BodyProportions | null;
  photoPath?: string | null;
}

export interface MobilityAssessment {
  id: string;
  createdAt: string;
  overheadSquat: number;
  shoulderReach: number;
  toeTouch: number;
  hip: number;
  shoulder: number;
  hamstring: number;
  ankle: number;
  overall: number;
  details: Record<string, number>;
}

export interface ReasonRef {
  key: string;
  params?: Record<string, string | number>;
}

export interface PlanItem {
  id: string;
  planId: string;
  dayIndex: number;
  dayLabel: string;
  position: number;
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
  targetWeightKg: number | null;
  kind: "main" | "accessory" | "corrective";
  reasons: ReasonRef[];
  replacedFrom?: string | null;
  llmExplanation?: string | null;
}

export interface WorkoutPlan {
  id: string;
  createdAt: string;
  goal: Goal;
  daysPerWeek: number;
  split: string;
  source: "rules" | "rules+llm";
  summary: ReasonRef[];
  llmSummary?: string | null;
  items: PlanItem[];
}

export type ConsentType = "camera" | "progress_photos" | "llm" | "parq" | "terms";

export interface ConsentLog {
  id: string;
  type: ConsentType;
  granted: boolean;
  version: string;
  createdAt: string;
}
