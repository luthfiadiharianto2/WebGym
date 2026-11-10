import { describe, expect, it } from "vitest";
import { LocalRepository } from "@/lib/data/repository";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("LocalRepository (Mode Tamu)", () => {
  it("menyimpan sesi + set, ekspor, lalu hapus semua", async () => {
    const repo = new LocalRepository(memoryStorage());
    await repo.saveSession(
      { id: "s1", startedAt: "2026-11-10T08:00:00Z", endedAt: "2026-11-10T08:20:00Z", durationSec: 1200, source: "camera" },
      [{ id: "x1", sessionId: "s1", exerciseId: "push_up", setIndex: 0, reps: 12, weightKg: null, formScore: 88, romDeg: 70, romPct: 0.9, symmetry: 95, tempoDownMs: 1200, tempoUpMs: 900, consistency: 90, issues: [], createdAt: "2026-11-10T08:05:00Z" }],
    );
    await repo.logConsent({ id: "c1", type: "camera", granted: true, version: "1.0", createdAt: "2026-11-10T07:59:00Z" });
    const { sessions, sets } = await repo.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sets[0].reps).toBe(12);
    const bundle = await repo.exportAll();
    expect(bundle.consents).toHaveLength(1);
    expect(JSON.stringify(bundle)).not.toMatch(/video|image\/jpeg/);
    await repo.deleteAll();
    expect((await repo.listSessions()).sessions).toHaveLength(0);
    expect(await repo.getProfile()).toBeNull();
  });

  it("foto progres tidak tersedia di Mode Tamu", async () => {
    const repo = new LocalRepository(memoryStorage());
    expect(await repo.uploadProgressPhoto()).toBeNull();
  });
});
