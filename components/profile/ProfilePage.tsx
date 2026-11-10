"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProfileSchema } from "@/lib/schemas";
import { useAuth } from "@/lib/store/auth";
import { useSettings, useT } from "@/lib/store/settings";
import { uid } from "@/lib/data/repository";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useUserData } from "@/lib/useUserData";
import { EQUIPMENT, INJURIES, type ConsentLog, type Equipment, type Goal, type Injury, type Level, type Profile } from "@/lib/types";

const PARQ = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];

function defaultProfile(id: string, locale: "id" | "en"): Profile {
  return {
    id,
    displayName: "",
    age: null,
    heightCm: null,
    weightKg: null,
    level: "beginner",
    goal: "hypertrophy",
    injuries: [],
    daysPerWeek: 3,
    equipment: ["bodyweight", "dumbbell"],
    parqAnswers: {},
    parqFlag: false,
    onboardedAt: null,
    locale,
  };
}

export default function ProfilePage() {
  const { t, locale } = useT();
  const { data, loading, repo, reload } = useUserData();
  const user = useAuth((s) => s.user);
  const setLocale = useSettings((s) => s.setLocale);
  const [form, setForm] = useState<Profile | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [consents, setConsents] = useState<ConsentLog[]>([]);

  useEffect(() => {
    if (loading) return;
    setForm(data.profile ?? defaultProfile(user?.id ?? "local", locale));
    setAccepted(!!data.profile?.onboardedAt);
    repo?.listConsents().then(setConsents).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data.profile, user]);

  if (!form) return <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-400">{t("common.loading")}</div>;
  const onboarding = !data.profile?.onboardedAt;
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setForm({ ...form, [k]: v });
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const num = (v: string) => (v === "" ? null : Number(v));
  const parqFlag = PARQ.some((q) => form.parqAnswers[q]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo) return;
    const candidate: Profile = { ...form, parqFlag, onboardedAt: form.onboardedAt ?? new Date().toISOString(), locale, id: user?.id ?? "local" };
    const parsed = ProfileSchema.safeParse(candidate);
    if (!parsed.success || !accepted) {
      setErrors([...(parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)), ...(accepted ? [] : [t("profile.disclaimer.accept")])]);
      return;
    }
    setErrors([]);
    await repo.saveProfile(parsed.data as Profile);
    const now = new Date().toISOString();
    if (onboarding) {
      await repo.logConsent({ id: uid(), type: "terms", granted: true, version: "1.0", createdAt: now });
      await repo.logConsent({ id: uid(), type: "parq", granted: true, version: "1.0", createdAt: now });
    }
    setMsg(t("profile.saved"));
    await reload();
  };

  const signOut = async () => {
    await getSupabaseBrowser()?.auth.signOut();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold text-white">{onboarding ? t("profile.onboarding") : t("profile.title")}</h1>
      <p className="mt-2 text-sm text-zinc-400">{t("profile.onboarding.desc")}</p>

      <section className="card mt-6 flex flex-wrap items-center justify-between gap-3" aria-label={t("profile.account")}>
        <div className="text-sm">
          <p className="font-semibold text-white">{t("profile.account")}</p>
          <p className="text-zinc-400">{user ? user.email : t("common.guestMode")}</p>
        </div>
        {user ? (
          <button type="button" className="btn-secondary" onClick={signOut}>
            {t("common.signOut")}
          </button>
        ) : (
          <Link href="/login" className="btn-primary">
            {t("common.signIn")}
          </Link>
        )}
      </section>

      <form onSubmit={save} className="mt-6 space-y-6" noValidate>
        <fieldset className="card grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">{t("profile.title")}</legend>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="p-name">
              {t("profile.name")}
            </label>
            <input id="p-name" className="input" maxLength={60} value={form.displayName} onChange={(e) => set("displayName", e.target.value)} autoComplete="nickname" />
          </div>
          <div>
            <label className="label" htmlFor="p-age">
              {t("profile.age")}
            </label>
            <input id="p-age" className="input" type="number" min={13} max={100} value={form.age ?? ""} onChange={(e) => set("age", num(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="p-h">
              {t("profile.height")}
            </label>
            <input id="p-h" className="input" type="number" min={100} max={250} value={form.heightCm ?? ""} onChange={(e) => set("heightCm", num(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="p-w">
              {t("profile.weight")}
            </label>
            <input id="p-w" className="input" type="number" min={30} max={300} step={0.1} value={form.weightKg ?? ""} onChange={(e) => set("weightKg", num(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="p-days">
              {t("profile.days")}
            </label>
            <input id="p-days" className="input" type="number" min={1} max={6} value={form.daysPerWeek} onChange={(e) => set("daysPerWeek", Number(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="p-level">
              {t("profile.level")}
            </label>
            <select id="p-level" className="input" value={form.level} onChange={(e) => set("level", e.target.value as Level)}>
              {(["beginner", "intermediate", "advanced"] as const).map((l) => (
                <option key={l} value={l}>
                  {t(`level.${l}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="p-goal">
              {t("profile.goal")}
            </label>
            <select id="p-goal" className="input" value={form.goal} onChange={(e) => set("goal", e.target.value as Goal)}>
              {(["hypertrophy", "strength", "fat_loss", "endurance"] as const).map((g) => (
                <option key={g} value={g}>
                  {t(`goal.${g}`)}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-white">{t("profile.injuries")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {INJURIES.map((i) => (
              <label key={i} className={`chip cursor-pointer ${form.injuries.includes(i) ? "border-orange-400/60 text-orange-200" : ""}`}>
                <input type="checkbox" className="sr-only" checked={form.injuries.includes(i)} onChange={() => set("injuries", toggle<Injury>(form.injuries, i))} />
                {form.injuries.includes(i) ? "✓ " : ""}
                {t(`injury.${i}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-white">{t("profile.equipment")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {EQUIPMENT.map((q) => (
              <label key={q} className={`chip cursor-pointer ${form.equipment.includes(q) ? "border-lime-400/60 text-lime-200" : ""}`}>
                <input type="checkbox" className="sr-only" checked={form.equipment.includes(q)} onChange={() => set("equipment", toggle<Equipment>(form.equipment, q))} />
                {form.equipment.includes(q) ? "✓ " : ""}
                {t(`equipment.${q}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-white">{t("profile.parq")}</legend>
          <p className="mt-1 text-xs text-zinc-400">{t("profile.parq.desc")}</p>
          <ol className="mt-3 space-y-3">
            {PARQ.map((q, idx) => (
              <li key={q} className="text-sm text-zinc-300">
                <p id={`parq-${q}`}>
                  {idx + 1}. {t(`profile.parq.${q}`)}
                </p>
                <div className="mt-1 flex gap-4" role="radiogroup" aria-labelledby={`parq-${q}`}>
                  {[true, false].map((v) => (
                    <label key={String(v)} className="flex items-center gap-1.5">
                      <input type="radio" name={`parq-${q}`} checked={form.parqAnswers[q] === v} onChange={() => set("parqAnswers", { ...form.parqAnswers, [q]: v })} />
                      {v ? t("common.yes") : t("common.no")}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          {parqFlag && (
            <p role="alert" className="mt-4 rounded-xl bg-orange-500/10 p-3 text-sm text-orange-200">
              ⚕ {t("profile.parq.flag")}
            </p>
          )}
        </fieldset>

        <label className="card flex items-start gap-3 text-sm text-zinc-300">
          <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          {t("profile.disclaimer.accept")}
        </label>

        {errors.length > 0 && (
          <ul role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
            {errors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" data-testid="save-profile">
            {t("common.save")}
          </button>
          {msg && (
            <p role="status" className="text-sm text-lime-300">
              ✓ {msg}{" "}
              <Link href="/plan" className="underline">
                {t("nav.plan")} →
              </Link>
            </p>
          )}
        </div>
      </form>

      <section className="card mt-6" aria-labelledby="privacy-title">
        <h2 id="privacy-title" className="font-semibold text-white">
          🔒 {t("profile.privacy")}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">{t("profile.privacy.desc")}</p>
        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
          <label htmlFor="p-locale">{t("nav.language")}</label>
          <select id="p-locale" className="input w-auto" value={locale} onChange={(e) => setLocale(e.target.value as "id" | "en")}>
            <option value="id">Bahasa Indonesia</option>
            <option value="en">English</option>
          </select>
        </div>
        <h3 className="mt-4 text-sm font-semibold text-zinc-200">{t("profile.consents")}</h3>
        <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-zinc-400">
          {consents.length === 0 && <li>—</li>}
          {consents.map((c) => (
            <li key={c.id}>
              {new Date(c.createdAt).toLocaleString(locale)} · {c.type} · v{c.version} · {c.granted ? "✓" : "✕"}
            </li>
          ))}
        </ul>
        <Link href="/dashboard#data" className="mt-3 inline-block text-sm text-lime-300 underline">
          {t("dash.export.json")} / {t("dash.deleteAll")} →
        </Link>
      </section>
    </div>
  );
}
