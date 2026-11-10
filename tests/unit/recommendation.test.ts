import { describe, expect, it } from "vitest";
import { generatePlan, hasEquipment, progressiveOverload, SCHEMES, type RecInput } from "@/lib/recommendation/engine";
import { EXERCISES, getExercise } from "@/lib/exercises";
import { epley1RM, muscleLoad, personalRecords, setsToCSV, streak, weekSummary } from "@/lib/stats";
import { ExplainResponseSchema, ProfileSchema } from "@/lib/schemas";
import type { MobilityAssessment, Profile, SetLog, WorkoutSession } from "@/lib/types";

const baseProfile: Profile = {
  id: "u1",
  displayName: "Tes",
  age: 28,
  heightCm: 170,
  weightKg: 70,
  level: "intermediate",
  goal: "hypertrophy",
  injuries: [],
  daysPerWeek: 3,
  equipment: ["barbell", "dumbbell", "bench", "rack", "kettlebell", "pullup_bar", "cable", "band"],
  parqAnswers: {},
  parqFlag: false,
  onboardedAt: "2026-11-01T00:00:00.000Z",
  locale: "id",
};

const now = new Date("2026-11-10T10:00:00Z");
let n = 0;
const idGen = () => `id-${++n}`;
const input = (over: Partial<RecInput> = {}): RecInput => ({
  profile: baseProfile,
  sessions: [],
  sets: [],
  posture: [],
  mobility: [],
  now,
  idGen,
  ...over,
});

const strip = (p: ReturnType<typeof generatePlan>) =>
  p.items.map(({ id: _id, planId: _p, ...rest }) => rest);

function mkSet(over: Partial<SetLog>): SetLog {
  return {
    id: "s" + Math.random(),
    sessionId: "sess1",
    exerciseId: "back_squat",
    setIndex: 0,
    reps: 10,
    weightKg: 60,
    formScore: 90,
    romDeg: 80,
    romPct: 1,
    symmetry: 95,
    tempoDownMs: 1500,
    tempoUpMs: 1000,
    consistency: 90,
    issues: [],
    createdAt: "2026-11-08T10:00:00.000Z",
    ...over,
  };
}

describe("data latihan", () => {
  it("minimal 30 latihan dengan ID unik dan variasi yang valid", () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(30);
    const ids = new Set(EXERCISES.map((e) => e.id));
    expect(ids.size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      for (const v of e.variations) expect(ids.has(v), `${e.id} → ${v}`).toBe(true);
      expect(e.primaryMuscles.length).toBeGreaterThan(0);
      expect(e.cues.length).toBeGreaterThan(0);
    }
  });
});

describe("mesin rekomendasi", () => {
  it("deterministik: input sama → rencana sama", () => {
    expect(strip(generatePlan(input()))).toEqual(strip(generatePlan(input())));
  });

  it("split mengikuti hari per minggu", () => {
    for (const days of [1, 2, 3, 4, 5, 6]) {
      const plan = generatePlan(input({ profile: { ...baseProfile, daysPerWeek: days } }));
      expect(new Set(plan.items.map((i) => i.dayIndex)).size).toBe(days);
    }
    expect(generatePlan(input({ profile: { ...baseProfile, daysPerWeek: 4 } })).split).toBe("upper_lower");
  });

  it("menghormati alat yang tersedia (hanya berat badan)", () => {
    const plan = generatePlan(input({ profile: { ...baseProfile, equipment: ["bodyweight"] } }));
    expect(plan.items.length).toBeGreaterThan(0);
    for (const it of plan.items) expect(hasEquipment(getExercise(it.exerciseId)!, ["bodyweight"])).toBe(true);
    expect(plan.items.some((i) => i.exerciseId === "back_squat")).toBe(false);
  });

  it("cedera lutut: latihan berisiko diganti dengan alasan", () => {
    const plan = generatePlan(input({ profile: { ...baseProfile, injuries: ["knee"] } }));
    for (const it of plan.items) expect(getExercise(it.exerciseId)!.contraindications).not.toContain("knee");
    const swapped = plan.items.find((i) => i.replacedFrom);
    expect(swapped).toBeDefined();
    expect(swapped!.reasons.some((r) => r.key === "reason.injury_swap")).toBe(true);
    expect(plan.summary.some((r) => r.key === "reason.injury_avoid")).toBe(true);
  });

  it("mobilitas pinggul terbatas → hip opener + goblet squat korektif", () => {
    const mob: MobilityAssessment = {
      id: "m1", createdAt: "2026-11-05T00:00:00Z", overheadSquat: 40, shoulderReach: 80, toeTouch: 70,
      hip: 35, shoulder: 80, hamstring: 70, ankle: 70, overall: 55, details: {},
    };
    const plan = generatePlan(input({ mobility: [mob] }));
    const corr = plan.items.filter((i) => i.kind === "corrective");
    expect(corr.map((c) => c.exerciseId)).toEqual(expect.arrayContaining(["hip_90_90", "goblet_squat"]));
    expect(corr.every((c) => c.reasons.some((r) => r.key === "reason.corrective_hip"))).toBe(true);
    // korektif berada di awal hari (pemanasan)
    const day0 = plan.items.filter((i) => i.dayIndex === 0);
    expect(day0[0].kind).toBe("corrective");
  });

  it("progressive overload: naik, tahan, deload", () => {
    const sq = getExercise("back_squat")!;
    const scheme = SCHEMES.hypertrophy.main;
    const up = progressiveOverload(sq, [mkSet({ reps: 10 }), mkSet({ reps: 10, setIndex: 1 })], scheme);
    expect(up.reason?.key).toBe("reason.overload_increase");
    expect(up.targetWeightKg).toBe(62.5);
    const hold = progressiveOverload(sq, [mkSet({ reps: 7 })], scheme);
    expect(hold.reason?.key).toBe("reason.overload_hold");
    expect(hold.targetWeightKg).toBe(60);
    const down = progressiveOverload(sq, [mkSet({ formScore: 50 })], scheme);
    expect(down.reason?.key).toBe("reason.overload_deload");
    expect(down.targetWeightKg).toBe(55);
  });

  it("setiap item punya alasan 'Kenapa ini?'", () => {
    const plan = generatePlan(input());
    for (const it of plan.items) expect(it.reasons.length).toBeGreaterThan(0);
  });

  it("PAR-Q positif → level konservatif & catatan", () => {
    const plan = generatePlan(input({ profile: { ...baseProfile, level: "advanced", parqFlag: true } }));
    expect(plan.summary.some((r) => r.key === "reason.parq")).toBe(true);
    for (const it of plan.items) expect(getExercise(it.exerciseId)!.level).toBe("beginner");
  });
});

describe("statistik", () => {
  it("Epley 1RM", () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(100, 10)).toBeCloseTo(133.3, 1);
    expect(epley1RM(0, 5)).toBe(0);
  });
  it("streak & ringkasan minggu", () => {
    const mk = (d: string): WorkoutSession => ({ id: d, startedAt: d, endedAt: d, durationSec: 1800, source: "camera" });
    const sessions = [mk("2026-11-10T08:00:00"), mk("2026-11-09T08:00:00"), mk("2026-11-08T08:00:00"), mk("2026-11-05T08:00:00")];
    expect(streak(sessions, new Date("2026-11-10T20:00:00"))).toBe(3);
    const sets = [mkSet({ sessionId: "2026-11-10T08:00:00", reps: 10, weightKg: 50 })];
    const w = weekSummary(sessions, sets, new Date("2026-11-10T20:00:00"));
    expect(w.sessions).toBe(2); // minggu dimulai Senin 9 Nov; sesi 8 Nov masuk minggu lalu
    expect(w.volumeKg).toBe(500);
  });
  it("muscle load, PR, CSV", () => {
    const sets = [mkSet({}), mkSet({ exerciseId: "bench_press", weightKg: 80, reps: 5 })];
    const load = muscleLoad(sets, 28, now);
    expect(load.quads).toBe(1);
    expect(load.chest).toBe(1);
    expect(personalRecords(sets)[0].exerciseId).toBe("bench_press");
    const csv = setsToCSV([], sets);
    expect(csv.split("\n")).toHaveLength(3);
  });
});

describe("skema Zod", () => {
  it("validasi profil", () => {
    expect(ProfileSchema.safeParse(baseProfile).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...baseProfile, daysPerWeek: 9 }).success).toBe(false);
  });
  it("output LLM yang tidak valid ditolak", () => {
    expect(ExplainResponseSchema.safeParse({ summary: "ok", items: [] }).success).toBe(true);
    expect(ExplainResponseSchema.safeParse({ summary: "", items: [] }).success).toBe(false);
    expect(ExplainResponseSchema.safeParse({ items: [{ exerciseId: "x" }] }).success).toBe(false);
  });
});
