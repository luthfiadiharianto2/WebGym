// Agregasi statistik untuk dashboard & mesin rekomendasi (fungsi murni, mudah diuji).
import { getExercise } from "./exercises";
import type { Muscle, SetLog, WorkoutSession } from "./types";

const DAY = 24 * 60 * 60 * 1000;

/** Estimasi 1RM rumus Epley. */
export function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Senin = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export interface WeekSummary {
  sessions: number;
  totalReps: number;
  volumeKg: number;
  durationMin: number;
  streakDays: number;
}

export function weekSummary(sessions: WorkoutSession[], sets: SetLog[], now = new Date()): WeekSummary {
  const from = startOfWeek(now).getTime();
  const weekSessions = sessions.filter((s) => new Date(s.startedAt).getTime() >= from);
  const ids = new Set(weekSessions.map((s) => s.id));
  const weekSets = sets.filter((s) => ids.has(s.sessionId));
  return {
    sessions: weekSessions.length,
    totalReps: weekSets.reduce((a, s) => a + s.reps, 0),
    volumeKg: Math.round(weekSets.reduce((a, s) => a + s.reps * (s.weightKg ?? 0), 0)),
    durationMin: Math.round(weekSessions.reduce((a, s) => a + s.durationSec, 0) / 60),
    streakDays: streak(sessions, now),
  };
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Hari berturut-turut dengan sesi, berakhir hari ini atau kemarin. */
export function streak(sessions: WorkoutSession[], now = new Date()): number {
  const days = new Set(sessions.map((s) => dayKey(new Date(s.startedAt))));
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(cursor))) cursor.setTime(cursor.getTime() - DAY);
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor.setTime(cursor.getTime() - DAY);
  }
  return n;
}

/** Jumlah set "efektif" per otot dalam N hari (otot utama = 1, pendukung = 0.5). */
export function muscleLoad(sets: SetLog[], days = 28, now = new Date()): Record<Muscle, number> {
  const from = now.getTime() - days * DAY;
  const load = {} as Record<Muscle, number>;
  for (const s of sets) {
    if (new Date(s.createdAt).getTime() < from) continue;
    const ex = getExercise(s.exerciseId);
    if (!ex) continue;
    for (const m of ex.primaryMuscles) load[m] = (load[m] ?? 0) + 1;
    for (const m of ex.secondaryMuscles) load[m] = (load[m] ?? 0) + 0.5;
  }
  return load;
}

export interface PRRow {
  exerciseId: string;
  bestWeight: number;
  bestReps: number;
  est1RM: number;
  date: string;
}

export function personalRecords(sets: SetLog[]): PRRow[] {
  const best = new Map<string, PRRow>();
  for (const s of sets) {
    if (!s.weightKg || s.reps <= 0) continue;
    const est = epley1RM(s.weightKg, s.reps);
    const cur = best.get(s.exerciseId);
    if (!cur || est > cur.est1RM) {
      best.set(s.exerciseId, { exerciseId: s.exerciseId, bestWeight: s.weightKg, bestReps: s.reps, est1RM: est, date: s.createdAt });
    }
  }
  return [...best.values()].sort((a, b) => b.est1RM - a.est1RM);
}

/** Rangkaian waktu rata-rata per hari untuk satu latihan. */
export function exerciseTrend(sets: SetLog[], exerciseId: string) {
  const byDay = new Map<string, SetLog[]>();
  for (const s of sets.filter((x) => x.exerciseId === exerciseId)) {
    const k = s.createdAt.slice(0, 10);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, xs]) => ({
      date,
      formScore: avg(xs.map((x) => x.formScore)),
      symmetry: avg(xs.map((x) => x.symmetry)),
      rom: avg(xs.map((x) => x.romDeg)),
      reps: xs.reduce((a, x) => a + x.reps, 0),
    }));
}

export function setsToCSV(sessions: WorkoutSession[], sets: SetLog[]): string {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const header = [
    "session_id", "session_started_at", "exercise_id", "set_index", "reps", "weight_kg", "form_score",
    "rom_deg", "rom_pct", "symmetry", "tempo_down_ms", "tempo_up_ms", "consistency", "hold_sec", "issues", "created_at",
  ];
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = sets.map((s) =>
    [
      s.sessionId, byId.get(s.sessionId)?.startedAt ?? "", s.exerciseId, s.setIndex, s.reps, s.weightKg, s.formScore,
      s.romDeg, s.romPct, s.symmetry, s.tempoDownMs, s.tempoUpMs, s.consistency, s.holdSec ?? "", s.issues.join("|"), s.createdAt,
    ].map(q).join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
