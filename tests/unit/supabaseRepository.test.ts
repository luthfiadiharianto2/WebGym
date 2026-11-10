import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "@/lib/data/repository";
import type { Profile, WorkoutPlan } from "@/lib/types";

/** Klien Supabase palsu: mencatat setiap operasi dan mengembalikan data dari tabel in-memory. */
function fakeSupabase(tables: Record<string, Record<string, unknown>[]> = {}) {
  const log: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = [];
  const uploads: { bucket: string; path: string }[] = [];

  function query(table: string) {
    const entry = { table, op: "select", payload: undefined as unknown, filters: [] as [string, unknown][] };
    log.push(entry);
    const rows = () => (tables[table] ?? []).filter((r) => entry.filters.every(([k, v]) => r[k] === v));
    const result = () => ({ data: entry.op === "select" ? rows() : null, error: null });
    const q = {
      select: () => q,
      insert: (p: unknown) => ((entry.op = "insert"), (entry.payload = p), q),
      upsert: (p: unknown) => ((entry.op = "upsert"), (entry.payload = p), q),
      update: (p: unknown) => ((entry.op = "update"), (entry.payload = p), q),
      delete: () => ((entry.op = "delete"), q),
      eq: (k: string, v: unknown) => (entry.filters.push([k, v]), q),
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
    };
    return q;
  }

  const client = {
    from: query,
    storage: {
      from: (bucket: string) => ({
        upload: (path: string) => (uploads.push({ bucket, path }), Promise.resolve({ error: null })),
        createSignedUrl: (path: string) => Promise.resolve({ data: { signedUrl: `https://signed/${path}` } }),
        list: () => Promise.resolve({ data: [] }),
        remove: () => Promise.resolve({ error: null }),
      }),
    },
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), signOut: () => Promise.resolve({}) },
  };
  return { client: client as unknown as SupabaseClient, log, uploads };
}

const USER = "11111111-1111-4111-8111-111111111111";

describe("SupabaseRepository (pemetaan & kepemilikan data)", () => {
  it("saveProfile memaksa id = user login dan memakai snake_case", async () => {
    const { client, log } = fakeSupabase();
    const repo = new SupabaseRepository(client, USER);
    const p = { id: "attacker-id", displayName: "A", daysPerWeek: 3, parqFlag: false } as unknown as Profile;
    await repo.saveProfile(p);
    const up = log.find((l) => l.op === "upsert")!;
    expect(up.table).toBe("profiles");
    expect(up.payload).toMatchObject({ id: USER, display_name: "A", days_per_week: 3, parq_flag: false });
    expect(up.payload).not.toHaveProperty("displayName");
  });

  it("saveSession menempelkan user_id ke sesi & setiap set", async () => {
    const { client, log } = fakeSupabase();
    const repo = new SupabaseRepository(client, USER);
    await repo.saveSession(
      { id: "s1", startedAt: "a", endedAt: "b", durationSec: 60, source: "camera" },
      [{ id: "x", sessionId: "s1", exerciseId: "push_up", setIndex: 0, reps: 10, weightKg: null, formScore: 90, romDeg: 1, romPct: 1, symmetry: 99, tempoDownMs: 1, tempoUpMs: 1, consistency: 99, issues: [], createdAt: "c" }],
    );
    const sess = log.find((l) => l.table === "workout_sessions")!;
    expect(sess.payload).toMatchObject({ id: "s1", user_id: USER, duration_sec: 60 });
    const sets = log.find((l) => l.table === "set_logs")!.payload as Record<string, unknown>[];
    expect(sets[0]).toMatchObject({ user_id: USER, session_id: "s1", form_score: 90, tempo_down_ms: 1 });
  });

  it("listSessions memetakan snake_case → camelCase", async () => {
    const { client } = fakeSupabase({
      workout_sessions: [{ id: "s1", user_id: USER, started_at: "2026-11-10", duration_sec: 120 }],
      set_logs: [{ id: "x", session_id: "s1", exercise_id: "lunge", form_score: 77, rom_pct: 0.9 }],
    });
    const { sessions, sets } = await new SupabaseRepository(client, USER).listSessions();
    expect(sessions[0]).toMatchObject({ id: "s1", startedAt: "2026-11-10", durationSec: 120 });
    expect(sets[0]).toMatchObject({ sessionId: "s1", exerciseId: "lunge", formScore: 77, romPct: 0.9 });
  });

  it("savePlan menonaktifkan rencana lama lalu menyimpan rencana + item", async () => {
    const { client, log } = fakeSupabase();
    const plan: WorkoutPlan = {
      id: "p1", createdAt: "now", goal: "strength", daysPerWeek: 3, split: "full_body", source: "rules", summary: [], items: [
        { id: "i1", planId: "p1", dayIndex: 0, dayLabel: "day.full_a", position: 0, exerciseId: "back_squat", sets: 4, repsMin: 3, repsMax: 6, restSec: 180, targetWeightKg: 60, kind: "main", reasons: [] },
      ],
    };
    await new SupabaseRepository(client, USER).savePlan(plan);
    const ops = log.map((l) => `${l.table}:${l.op}`);
    expect(ops).toEqual(["workout_plans:update", "workout_plans:insert", "plan_items:insert"]);
    expect(log[0].filters).toContainEqual(["user_id", USER]);
    expect(log[1].payload).toMatchObject({ id: "p1", user_id: USER, active: true, days_per_week: 3 });
    expect(log[1].payload).not.toHaveProperty("items");
    expect((log[2].payload as Record<string, unknown>[])[0]).toMatchObject({ plan_id: "p1", reps_max: 6, target_weight_kg: 60, user_id: USER });
  });

  it("getActivePlan merakit item rencana", async () => {
    const { client } = fakeSupabase({
      workout_plans: [{ id: "p1", user_id: USER, active: true, days_per_week: 2, split: "full_body", summary: [] }],
      plan_items: [{ id: "i1", plan_id: "p1", day_index: 0, exercise_id: "plank", reps_min: 20 }],
    });
    const plan = await new SupabaseRepository(client, USER).getActivePlan();
    expect(plan).toMatchObject({ id: "p1", daysPerWeek: 2 });
    expect(plan).not.toHaveProperty("active");
    expect(plan!.items[0]).toMatchObject({ planId: "p1", exerciseId: "plank", repsMin: 20 });
  });

  it("foto progres disimpan di folder milik user (sesuai kebijakan Storage RLS)", async () => {
    const { client, uploads } = fakeSupabase();
    const repo = new SupabaseRepository(client, USER);
    const path = await repo.uploadProgressPhoto(new Blob(["x"], { type: "image/jpeg" }), "a1");
    expect(path).toBe(`${USER}/a1.jpg`);
    expect(uploads[0]).toEqual({ bucket: "progress-photos", path: `${USER}/a1.jpg` });
    expect(await repo.getPhotoUrl(path!)).toBe(`https://signed/${USER}/a1.jpg`);
  });
});
