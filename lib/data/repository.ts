// Abstraksi penyimpanan: LocalRepository (Mode Tamu, localStorage) dan
// SupabaseRepository (akun login, Postgres + RLS). UI hanya bergantung pada interface ini.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConsentLog,
  MobilityAssessment,
  PlanItem,
  PostureAssessment,
  Profile,
  SetLog,
  WorkoutPlan,
  WorkoutSession,
} from "../types";
import { PROGRESS_BUCKET } from "../supabase/config";

export interface ExportBundle {
  exportedAt: string;
  profile: Profile | null;
  sessions: WorkoutSession[];
  sets: SetLog[];
  posture: PostureAssessment[];
  mobility: MobilityAssessment[];
  plans: WorkoutPlan[];
  consents: ConsentLog[];
}

export interface Repository {
  kind: "local" | "supabase";
  getProfile(): Promise<Profile | null>;
  saveProfile(p: Profile): Promise<void>;
  saveSession(s: WorkoutSession, sets: SetLog[]): Promise<void>;
  listSessions(): Promise<{ sessions: WorkoutSession[]; sets: SetLog[] }>;
  savePosture(a: PostureAssessment): Promise<void>;
  listPosture(): Promise<PostureAssessment[]>;
  saveMobility(a: MobilityAssessment): Promise<void>;
  listMobility(): Promise<MobilityAssessment[]>;
  savePlan(p: WorkoutPlan): Promise<void>;
  getActivePlan(): Promise<WorkoutPlan | null>;
  logConsent(c: ConsentLog): Promise<void>;
  listConsents(): Promise<ConsentLog[]>;
  uploadProgressPhoto(blob: Blob, assessmentId: string): Promise<string | null>;
  getPhotoUrl(path: string): Promise<string | null>;
  exportAll(): Promise<ExportBundle>;
  deleteAll(): Promise<void>;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------- Local

const KEY = "ironvision:data:v1";

interface LocalDB {
  profile: Profile | null;
  sessions: WorkoutSession[];
  sets: SetLog[];
  posture: PostureAssessment[];
  mobility: MobilityAssessment[];
  plans: WorkoutPlan[];
  consents: ConsentLog[];
}

const emptyDB = (): LocalDB => ({ profile: null, sessions: [], sets: [], posture: [], mobility: [], plans: [], consents: [] });

export class LocalRepository implements Repository {
  kind = "local" as const;
  constructor(private storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = globalThis.localStorage) {}

  private read(): LocalDB {
    try {
      const raw = this.storage.getItem(KEY);
      return raw ? { ...emptyDB(), ...JSON.parse(raw) } : emptyDB();
    } catch {
      return emptyDB();
    }
  }
  private write(db: LocalDB): void {
    this.storage.setItem(KEY, JSON.stringify(db));
  }
  private update(fn: (db: LocalDB) => void): void {
    const db = this.read();
    fn(db);
    this.write(db);
  }

  async getProfile() {
    return this.read().profile;
  }
  async saveProfile(p: Profile) {
    this.update((db) => (db.profile = p));
  }
  async saveSession(s: WorkoutSession, sets: SetLog[]) {
    this.update((db) => {
      db.sessions = [...db.sessions.filter((x) => x.id !== s.id), s];
      db.sets = [...db.sets.filter((x) => x.sessionId !== s.id), ...sets];
    });
  }
  async listSessions() {
    const db = this.read();
    return { sessions: [...db.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), sets: db.sets };
  }
  async savePosture(a: PostureAssessment) {
    this.update((db) => db.posture.push(a));
  }
  async listPosture() {
    return [...this.read().posture].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async saveMobility(a: MobilityAssessment) {
    this.update((db) => db.mobility.push(a));
  }
  async listMobility() {
    return [...this.read().mobility].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async savePlan(p: WorkoutPlan) {
    // Hanya simpan 5 rencana terakhir di perangkat.
    this.update((db) => (db.plans = [...db.plans.filter((x) => x.id !== p.id), p].slice(-5)));
  }
  async getActivePlan() {
    const plans = this.read().plans;
    return plans[plans.length - 1] ?? null;
  }
  async logConsent(c: ConsentLog) {
    this.update((db) => db.consents.push(c));
  }
  async listConsents() {
    return this.read().consents;
  }
  async uploadProgressPhoto() {
    return null; // Foto progres hanya untuk akun login (Storage + RLS).
  }
  async getPhotoUrl() {
    return null;
  }
  async exportAll(): Promise<ExportBundle> {
    return { exportedAt: new Date().toISOString(), ...this.read() };
  }
  async deleteAll() {
    this.storage.removeItem(KEY);
  }
}

// ---------------------------------------------------------------- Supabase

type Row = Record<string, unknown>;

const toSnake = (o: Row): Row =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()), v]));
const toCamel = <T,>(o: Row): T =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()), v])) as T;

export class SupabaseRepository implements Repository {
  kind = "supabase" as const;
  constructor(
    private sb: SupabaseClient,
    private userId: string,
  ) {}

  private async must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
  }

  async getProfile() {
    const data = await this.must(this.sb.from("profiles").select("*").eq("id", this.userId).maybeSingle());
    return data ? toCamel<Profile>(data as Row) : null;
  }
  async saveProfile(p: Profile) {
    await this.must(this.sb.from("profiles").upsert(toSnake({ ...p, id: this.userId })));
  }
  async saveSession(s: WorkoutSession, sets: SetLog[]) {
    await this.must(this.sb.from("workout_sessions").upsert(toSnake({ ...s, userId: this.userId })));
    if (sets.length) {
      await this.must(this.sb.from("set_logs").upsert(sets.map((x) => toSnake({ ...x, userId: this.userId }))));
    }
  }
  async listSessions() {
    const sessions = await this.must(
      this.sb.from("workout_sessions").select("*").order("started_at", { ascending: false }).limit(500),
    );
    const sets = await this.must(this.sb.from("set_logs").select("*").limit(5000));
    return {
      sessions: (sessions as Row[]).map((r) => toCamel<WorkoutSession>(r)),
      sets: (sets as Row[]).map((r) => toCamel<SetLog>(r)),
    };
  }
  async savePosture(a: PostureAssessment) {
    await this.must(this.sb.from("posture_assessments").insert(toSnake({ ...a, userId: this.userId })));
  }
  async listPosture() {
    const d = await this.must(this.sb.from("posture_assessments").select("*").order("created_at"));
    return (d as Row[]).map((r) => toCamel<PostureAssessment>(r));
  }
  async saveMobility(a: MobilityAssessment) {
    await this.must(this.sb.from("mobility_assessments").insert(toSnake({ ...a, userId: this.userId })));
  }
  async listMobility() {
    const d = await this.must(this.sb.from("mobility_assessments").select("*").order("created_at"));
    return (d as Row[]).map((r) => toCamel<MobilityAssessment>(r));
  }
  async savePlan(p: WorkoutPlan) {
    const { items, ...plan } = p;
    await this.must(this.sb.from("workout_plans").update({ active: false }).eq("user_id", this.userId));
    await this.must(this.sb.from("workout_plans").insert(toSnake({ ...plan, userId: this.userId, active: true })));
    if (items.length) {
      await this.must(this.sb.from("plan_items").insert(items.map((i) => toSnake({ ...i, userId: this.userId }))));
    }
  }
  async getActivePlan() {
    const plan = await this.must(
      this.sb.from("workout_plans").select("*").eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    );
    if (!plan) return null;
    const items = await this.must(
      this.sb.from("plan_items").select("*").eq("plan_id", (plan as Row).id as string).order("day_index").order("position"),
    );
    const p = toCamel<WorkoutPlan & { active?: boolean; userId?: string }>(plan as Row);
    delete p.active;
    delete p.userId;
    return { ...p, items: (items as Row[]).map((r) => toCamel<PlanItem>(r)) };
  }
  async logConsent(c: ConsentLog) {
    await this.must(
      this.sb.from("consent_logs").insert(toSnake({ ...c, userId: this.userId, userAgent: navigator.userAgent.slice(0, 200) })),
    );
  }
  async listConsents() {
    const d = await this.must(this.sb.from("consent_logs").select("id,type,granted,version,created_at").order("created_at"));
    return (d as Row[]).map((r) => toCamel<ConsentLog>(r));
  }
  async uploadProgressPhoto(blob: Blob, assessmentId: string) {
    // Path diawali user id → kebijakan Storage RLS membatasi akses ke pemiliknya.
    const path = `${this.userId}/${assessmentId}.jpg`;
    const { error } = await this.sb.storage.from(PROGRESS_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(error.message);
    return path;
  }
  async getPhotoUrl(path: string) {
    const { data } = await this.sb.storage.from(PROGRESS_BUCKET).createSignedUrl(path, 60 * 10);
    return data?.signedUrl ?? null;
  }
  async exportAll(): Promise<ExportBundle> {
    const [profile, { sessions, sets }, posture, mobility, consents] = await Promise.all([
      this.getProfile(),
      this.listSessions(),
      this.listPosture(),
      this.listMobility(),
      this.listConsents(),
    ]);
    const active = await this.getActivePlan();
    return { exportedAt: new Date().toISOString(), profile, sessions, sets, posture, mobility, plans: active ? [active] : [], consents };
  }
  async deleteAll() {
    // Hapus foto progres milik pengguna.
    const { data: files } = await this.sb.storage.from(PROGRESS_BUCKET).list(this.userId);
    if (files?.length) {
      await this.sb.storage.from(PROGRESS_BUCKET).remove(files.map((f) => `${this.userId}/${f.name}`));
    }
    // Hapus akun (cascade ke seluruh tabel) via API route server.
    const { data } = await this.sb.auth.getSession();
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    });
    if (!res.ok) {
      // Fallback: hapus baris data via RLS bila service role tidak dikonfigurasi.
      for (const t of ["set_logs", "plan_items", "workout_plans", "workout_sessions", "posture_assessments", "mobility_assessments", "consent_logs", "profiles"]) {
        const col = t === "profiles" ? "id" : "user_id";
        await this.must(this.sb.from(t).delete().eq(col, this.userId));
      }
    }
    await this.sb.auth.signOut();
  }
}
