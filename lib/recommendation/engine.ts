// Mesin rekomendasi berbasis aturan: transparan & deterministik.
// Input yang sama SELALU menghasilkan rencana yang sama (tanpa randomness).
import { EXERCISES, getExercise } from "../exercises";
import { muscleLoad } from "../stats";
import type {
  Equipment,
  Exercise,
  Goal,
  Injury,
  Level,
  MobilityAssessment,
  MovementPattern,
  Muscle,
  PlanItem,
  PostureAssessment,
  Profile,
  ReasonRef,
  SetLog,
  WorkoutPlan,
  WorkoutSession,
} from "../types";

export interface RecInput {
  profile: Profile;
  sessions: WorkoutSession[];
  sets: SetLog[];
  posture: PostureAssessment[];
  mobility: MobilityAssessment[];
  now?: Date;
  idGen?: () => string;
}

// ------------------------------------------------------------ konfigurasi

type DayType = "full_a" | "full_b" | "full_c" | "upper" | "lower" | "push" | "pull" | "legs";

export const SPLITS: Record<number, { split: string; days: DayType[] }> = {
  1: { split: "full_body", days: ["full_a"] },
  2: { split: "full_body", days: ["full_a", "full_b"] },
  3: { split: "full_body", days: ["full_a", "full_b", "full_c"] },
  4: { split: "upper_lower", days: ["upper", "lower", "upper", "lower"] },
  5: { split: "ppl_ul", days: ["push", "pull", "legs", "upper", "lower"] },
  6: { split: "ppl", days: ["push", "pull", "legs", "push", "pull", "legs"] },
};

type Slot = { pattern: MovementPattern; prefer?: Muscle };

const DAY_SLOTS: Record<DayType, Slot[]> = {
  full_a: [{ pattern: "squat" }, { pattern: "horizontal_push" }, { pattern: "horizontal_pull" }, { pattern: "hinge" }, { pattern: "core" }],
  full_b: [{ pattern: "hinge" }, { pattern: "vertical_push" }, { pattern: "vertical_pull" }, { pattern: "lunge" }, { pattern: "core" }],
  full_c: [{ pattern: "lunge" }, { pattern: "horizontal_push" }, { pattern: "horizontal_pull" }, { pattern: "shoulders" }, { pattern: "arms", prefer: "biceps" }],
  upper: [{ pattern: "horizontal_push" }, { pattern: "horizontal_pull" }, { pattern: "vertical_push" }, { pattern: "vertical_pull" }, { pattern: "shoulders" }, { pattern: "arms", prefer: "triceps" }],
  lower: [{ pattern: "squat" }, { pattern: "hinge" }, { pattern: "lunge" }, { pattern: "calves" }, { pattern: "core" }],
  push: [{ pattern: "horizontal_push" }, { pattern: "vertical_push" }, { pattern: "shoulders" }, { pattern: "arms", prefer: "triceps" }, { pattern: "core" }],
  pull: [{ pattern: "vertical_pull" }, { pattern: "horizontal_pull" }, { pattern: "hinge" }, { pattern: "arms", prefer: "biceps" }, { pattern: "corrective", prefer: "rear_delts" }],
  legs: [{ pattern: "squat" }, { pattern: "hinge" }, { pattern: "lunge" }, { pattern: "calves" }, { pattern: "core" }],
};

interface Scheme {
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
}

export const SCHEMES: Record<Goal, { main: Scheme; accessory: Scheme }> = {
  strength: { main: { sets: 5, repsMin: 3, repsMax: 6, restSec: 180 }, accessory: { sets: 3, repsMin: 6, repsMax: 10, restSec: 120 } },
  hypertrophy: { main: { sets: 4, repsMin: 6, repsMax: 10, restSec: 120 }, accessory: { sets: 3, repsMin: 10, repsMax: 15, restSec: 75 } },
  fat_loss: { main: { sets: 3, repsMin: 10, repsMax: 15, restSec: 60 }, accessory: { sets: 3, repsMin: 12, repsMax: 20, restSec: 45 } },
  endurance: { main: { sets: 3, repsMin: 15, repsMax: 20, restSec: 45 }, accessory: { sets: 2, repsMin: 15, repsMax: 25, restSec: 30 } },
};

const CORRECTIVE_SCHEME: Scheme = { sets: 2, repsMin: 8, repsMax: 12, restSec: 30 };
const LEVEL_RANK: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };
/** Alat yang wajib ada bersama alat utama (mis. bench untuk bench press). */
const REQUIRED_COMPANIONS: Equipment[] = ["rack", "bench", "treadmill", "pullup_bar", "cable"];
const LOWER_PATTERNS: MovementPattern[] = ["squat", "hinge", "lunge"];

// ------------------------------------------------------------ helper

export function hasEquipment(ex: Exercise, available: Equipment[]): boolean {
  const avail = new Set<Equipment>([...available, "bodyweight", "mat"]);
  const required = ex.equipment.filter((e) => REQUIRED_COMPANIONS.includes(e));
  const alternatives = ex.equipment.filter((e) => !REQUIRED_COMPANIONS.includes(e) && e !== "mat");
  if (!required.every((e) => avail.has(e))) return false;
  return alternatives.length === 0 || alternatives.some((e) => avail.has(e));
}

function blockedBy(ex: Exercise, injuries: Injury[]): Injury | null {
  return ex.contraindications.find((c) => injuries.includes(c)) ?? null;
}

function levelAllowed(ex: Exercise, level: Level): boolean {
  return LEVEL_RANK[ex.level] <= LEVEL_RANK[level];
}

/** Rata-rata form score 3 set terakhir untuk latihan tertentu. */
function recentForm(sets: SetLog[], exerciseId: string): number | null {
  const xs = sets
    .filter((s) => s.exerciseId === exerciseId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
  if (!xs.length) return null;
  return Math.round(xs.reduce((a, s) => a + s.formScore, 0) / xs.length);
}

function roundLoad(kg: number, ex: Exercise): number {
  const step = ex.equipment.includes("barbell") ? 2.5 : 1;
  return Math.max(step, Math.round(kg / step) * step);
}

interface OverloadResult {
  targetWeightKg: number | null;
  reason: ReasonRef | null;
}

/** Progressive overload otomatis berdasarkan sesi terakhir latihan tersebut. */
export function progressiveOverload(ex: Exercise, sets: SetLog[], scheme: Scheme): OverloadResult {
  const mine = sets.filter((s) => s.exerciseId === ex.id);
  if (!mine.length) return { targetWeightKg: null, reason: null };
  const lastSession = mine.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).sessionId;
  const last = mine.filter((s) => s.sessionId === lastSession);
  const avgForm = Math.round(last.reduce((a, s) => a + s.formScore, 0) / last.length);
  const allHit = last.every((s) => s.reps >= scheme.repsMax);
  const weights = last.map((s) => s.weightKg ?? 0).filter((w) => w > 0);
  if (!weights.length || !ex.loadable) {
    return allHit && avgForm >= 75 ? { targetWeightKg: null, reason: { key: "reason.overload_reps" } } : { targetWeightKg: null, reason: null };
  }
  const w = Math.max(...weights);
  if (avgForm < 65) {
    const nw = roundLoad(w * 0.9, ex);
    return { targetWeightKg: nw, reason: { key: "reason.overload_deload", params: { form: avgForm, weight: nw } } };
  }
  if (allHit && avgForm >= 80) {
    const pct = LOWER_PATTERNS.includes(ex.pattern) ? 0.05 : 0.025;
    const step = ex.equipment.includes("barbell") ? 2.5 : 1;
    const nw = roundLoad(Math.max(w + step, w * (1 + pct)), ex);
    return { targetWeightKg: nw, reason: { key: "reason.overload_increase", params: { form: avgForm, weight: nw } } };
  }
  return { targetWeightKg: w, reason: { key: "reason.overload_hold", params: { weight: w } } };
}

// ------------------------------------------------------------ korektif

interface CorrectiveNeed {
  /** Tiap grup = daftar alternatif; dipilih latihan pertama yang bisa dilakukan dari setiap grup. */
  groups: string[][];
  reason: ReasonRef;
}

export function detectCorrectiveNeeds(input: RecInput): CorrectiveNeed[] {
  const needs: CorrectiveNeed[] = [];
  const mob = input.mobility[input.mobility.length - 1];
  const pos = input.posture[input.posture.length - 1];
  if (mob) {
    if (mob.hip < 60) needs.push({ groups: [["hip_90_90"], ["goblet_squat", "bodyweight_squat"]], reason: { key: "reason.corrective_hip", params: { score: mob.hip } } });
    if (mob.shoulder < 60) needs.push({ groups: [["wall_slide"], ["band_pull_apart"]], reason: { key: "reason.corrective_shoulder", params: { score: mob.shoulder } } });
    if (mob.hamstring < 50) needs.push({ groups: [["toe_touch"], ["glute_bridge"]], reason: { key: "reason.corrective_hamstring", params: { score: mob.hamstring } } });
    if (mob.ankle < 50) needs.push({ groups: [["calf_raise"]], reason: { key: "reason.corrective_ankle" } });
  }
  if (pos) {
    if (pos.forwardHeadRatio !== null && pos.forwardHeadRatio > 0.15) {
      needs.push({ groups: [["chin_tuck"], ["band_pull_apart", "wall_slide"]], reason: { key: "reason.corrective_forward_head" } });
    }
    const tilt = Math.max(Math.abs(pos.shoulderTiltDeg), Math.abs(pos.pelvicTiltDeg));
    if (tilt > 3) needs.push({ groups: [["side_plank"], ["dumbbell_row", "lunge"]], reason: { key: "reason.corrective_tilt", params: { deg: Math.round(tilt * 10) / 10 } } });
  }
  const squatSets = input.sets.filter((s) => getExercise(s.exerciseId)?.pattern === "squat");
  if (squatSets.length >= 3) {
    const valgus = squatSets.filter((s) => s.issues.includes("form.knee_valgus")).length / squatSets.length;
    if (valgus >= 0.3) needs.push({ groups: [["glute_bridge"]], reason: { key: "reason.corrective_valgus" } });
  }
  const symSets = input.sets.filter((s) => s.reps > 0);
  if (symSets.length >= 3) {
    const sym = Math.round(symSets.reduce((a, s) => a + s.symmetry, 0) / symSets.length);
    if (sym < 85) needs.push({ groups: [["dumbbell_row", "lunge", "bulgarian_split_squat"]], reason: { key: "reason.corrective_asymmetry", params: { sym } } });
  }
  return needs;
}

// ------------------------------------------------------------ engine utama

export function generatePlan(input: RecInput): WorkoutPlan {
  const { profile, sets } = input;
  const idGen = input.idGen ?? (() => crypto.randomUUID());
  const now = input.now ?? new Date();
  const level: Level = profile.parqFlag ? "beginner" : profile.level;
  const days = Math.min(6, Math.max(1, profile.daysPerWeek));
  const { split, days: dayTypes } = SPLITS[days];
  const goal = profile.goal;
  const planId = idGen();
  const usable = (ex: Exercise) => hasEquipment(ex, profile.equipment) && levelAllowed(ex, level);

  // Otot yang jarang dilatih (hanya bila ada cukup riwayat).
  const load = muscleLoad(sets, 28, now);
  const majors: Muscle[] = ["chest", "lats", "upper_back", "quads", "hamstrings", "glutes", "side_delts", "abs"];
  const undertrained = input.sessions.length >= 3 ? majors.filter((m) => !(load[m] > 0)) : [];

  const usedCount = new Map<string, number>();
  const items: PlanItem[] = [];

  dayTypes.forEach((dayType, dayIndex) => {
    const slots = [...DAY_SLOTS[dayType]];
    if (goal === "fat_loss" || goal === "endurance") slots.push({ pattern: "conditioning" });
    let position = 0;
    slots.forEach((slot, slotIdx) => {
      const kind: PlanItem["kind"] = slotIdx < 2 && slot.pattern !== "core" ? "main" : "accessory";
      const candidates = EXERCISES.filter((e) => e.pattern === slot.pattern && usable(e));
      if (!candidates.length) return;
      const score = (e: Exercise) => {
        let s = 0;
        if (e.goals.includes(goal)) s += 3;
        if (e.level === level) s += 2;
        else s += 1;
        if (slot.prefer && e.primaryMuscles.includes(slot.prefer)) s += 3;
        if (kind === "main" && e.loadable) s += 1;
        if (e.tracking) s += 0.5;
        if (undertrained.some((m) => e.primaryMuscles.includes(m))) s += 1;
        s -= (usedCount.get(e.id) ?? 0) * 2.5; // variasi antar-hari
        const form = recentForm(sets, e.id);
        if (form !== null && form < 60) s -= 3;
        return s;
      };
      const rank = (list: Exercise[]) => [...list].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
      const ideal = rank(candidates)[0];
      const safe = rank(candidates.filter((e) => !blockedBy(e, profile.injuries)));
      const chosen = safe[0];
      if (!chosen) return;

      const reasons: ReasonRef[] = [];
      let replacedFrom: string | null = null;
      const blockInjury = blockedBy(ideal, profile.injuries);
      if (ideal.id !== chosen.id && blockInjury) {
        replacedFrom = ideal.id;
        reasons.push({ key: "reason.injury_swap", params: { from: ideal.name.id, injury: `@injury.${blockInjury}` } });
      }
      // Regresi bila form buruk pada latihan yang semestinya dipilih.
      const formPenalty = (e: Exercise) => ((recentForm(sets, e.id) ?? 100) < 60 ? 3 : 0);
      const formIdeal = [...candidates.filter((e) => !blockedBy(e, profile.injuries))].sort(
        (a, b) => score(b) + formPenalty(b) - (score(a) + formPenalty(a)) || a.id.localeCompare(b.id),
      )[0];
      if (formIdeal && formIdeal.id !== chosen.id && formPenalty(formIdeal) > 0) {
        reasons.push({ key: "reason.form_regress", params: { form: recentForm(sets, formIdeal.id) ?? 0, exercise: formIdeal.name.id } });
      }

      const base = SCHEMES[goal][kind === "main" ? "main" : "accessory"];
      const scheme: Scheme = { ...base, sets: Math.max(2, base.sets - (level === "beginner" ? 1 : 0)) };
      if (chosen.timed) {
        Object.assign(scheme, level === "beginner" ? { repsMin: 20, repsMax: 30 } : { repsMin: 30, repsMax: 60 });
      }
      reasons.push({ key: "reason.goal_scheme", params: { sets: scheme.sets, reps: `${scheme.repsMin}–${scheme.repsMax}`, rest: scheme.restSec, goal: `@goal.${goal}` } });
      reasons.push({ key: "reason.pattern_slot", params: { pattern: `@pattern.${slot.pattern}` } });
      reasons.push({ key: "reason.level_fit", params: { level: `@level.${level}` } });
      const ov = progressiveOverload(chosen, sets, scheme);
      if (ov.reason) reasons.push(ov.reason);
      const under = undertrained.find((m) => chosen.primaryMuscles.includes(m));
      if (under) reasons.push({ key: "reason.undertrained", params: { muscle: `@muscle.${under}` } });

      usedCount.set(chosen.id, (usedCount.get(chosen.id) ?? 0) + 1);
      items.push({
        id: idGen(),
        planId,
        dayIndex,
        dayLabel: `day.${dayType}`,
        position: position++,
        exerciseId: chosen.id,
        sets: scheme.sets,
        repsMin: scheme.repsMin,
        repsMax: scheme.repsMax,
        restSec: scheme.restSec,
        targetWeightKg: ov.targetWeightKg,
        kind,
        reasons,
        replacedFrom,
      });
    });
  });

  // Korektif: maks 3 per hari, digilir agar setiap kebutuhan muncul.
  const canDo = (e: Exercise | undefined): e is Exercise =>
    !!e && hasEquipment(e, profile.equipment) && !blockedBy(e, profile.injuries);
  const needs = detectCorrectiveNeeds(input).flatMap((n) =>
    n.groups
      .map((g) => g.map(getExercise).find(canDo))
      .filter((e): e is Exercise => !!e)
      .map((ex) => ({ ex, reason: n.reason })),
  );
  // Gabungkan kebutuhan yang menunjuk latihan sama.
  const merged = new Map<string, { ex: Exercise; reasons: ReasonRef[] }>();
  for (const n of needs) {
    const cur = merged.get(n.ex.id);
    if (cur) cur.reasons.push(n.reason);
    else merged.set(n.ex.id, { ex: n.ex, reasons: [n.reason] });
  }
  const correctiveList = [...merged.values()];
  if (correctiveList.length) {
    const perDay = Math.min(3, correctiveList.length);
    dayTypes.forEach((_, dayIndex) => {
      for (let k = 0; k < perDay; k++) {
        const c = correctiveList[(dayIndex * perDay + k) % correctiveList.length];
        if (items.some((i) => i.dayIndex === dayIndex && i.exerciseId === c.ex.id)) continue;
        const scheme = c.ex.timed ? { ...CORRECTIVE_SCHEME, repsMin: 20, repsMax: 30 } : CORRECTIVE_SCHEME;
        items.push({
          id: idGen(),
          planId,
          dayIndex,
          dayLabel: `day.${dayTypes[dayIndex]}`,
          position: -1 - k, // korektif sebagai pemanasan di awal hari
          exerciseId: c.ex.id,
          ...scheme,
          targetWeightKg: null,
          kind: "corrective",
          reasons: [...c.reasons, { key: "reason.goal_scheme", params: { sets: scheme.sets, reps: `${scheme.repsMin}–${scheme.repsMax}`, rest: scheme.restSec, goal: `@goal.${goal}` } }],
          replacedFrom: null,
        });
      }
    });
  }

  // Normalisasi urutan per hari.
  items.sort((a, b) => a.dayIndex - b.dayIndex || a.position - b.position || a.exerciseId.localeCompare(b.exerciseId));
  let lastDay = -1;
  let pos = 0;
  for (const it of items) {
    if (it.dayIndex !== lastDay) {
      lastDay = it.dayIndex;
      pos = 0;
    }
    it.position = pos++;
  }

  const summary: ReasonRef[] = [
    { key: "reason.summary_split", params: { split: `@split.${split}`, days } },
    { key: "reason.summary_goal", params: { goal: `@goal.${goal}` } },
  ];
  if (profile.injuries.length) {
    summary.push({ key: "reason.summary_injury", params: { injuries: profile.injuries.join(", ") } });
    for (const inj of profile.injuries) summary.push({ key: "reason.injury_avoid", params: { injury: `@injury.${inj}` } });
  }
  if (input.sessions.length || input.posture.length || input.mobility.length) {
    summary.push({ key: "reason.summary_data", params: { sessions: input.sessions.length, assessments: input.posture.length + input.mobility.length } });
  } else {
    summary.push({ key: "reason.summary_nodata" });
  }
  if (profile.parqFlag) summary.push({ key: "reason.parq" });

  return {
    id: planId,
    createdAt: now.toISOString(),
    goal,
    daysPerWeek: days,
    split,
    source: "rules",
    summary,
    llmSummary: null,
    items,
  };
}

/** Sinyal ringkas (anonim) untuk lapisan LLM. */
export function planSignals(input: RecInput) {
  const recent = input.sets.slice(-50);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const now = (input.now ?? new Date()).getTime();
  return {
    avgFormScore: avg(recent.map((s) => s.formScore)),
    avgSymmetry: avg(recent.map((s) => s.symmetry)),
    postureScore: input.posture.at(-1)?.postureScore ?? null,
    mobilityScore: input.mobility.at(-1)?.overall ?? null,
    sessionsLast28d: input.sessions.filter((s) => now - new Date(s.startedAt).getTime() < 28 * 864e5).length,
  };
}
