"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { EXERCISES, filterExercises, type ExerciseFilter } from "@/lib/exercises";
import { localized } from "@/lib/i18n";
import { useT } from "@/lib/store/settings";
import { EQUIPMENT, MUSCLES, type Equipment, type Goal, type Level, type Muscle } from "@/lib/types";

const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
const GOALS: Goal[] = ["hypertrophy", "strength", "fat_loss", "endurance"];
const levelColor: Record<Level, string> = {
  beginner: "text-lime-300 border-lime-400/30",
  intermediate: "text-cyan-300 border-cyan-400/30",
  advanced: "text-orange-300 border-orange-400/30",
};

export default function ExerciseLibrary() {
  const { t, locale } = useT();
  const params = useSearchParams();
  const router = useRouter();
  const filter: ExerciseFilter = {
    q: params.get("q") ?? "",
    muscle: (params.get("muscle") as Muscle) ?? "",
    equipment: (params.get("equipment") as Equipment) ?? "",
    level: (params.get("level") as Level) ?? "",
    goal: (params.get("goal") as Goal) ?? "",
  };
  const list = useMemo(() => filterExercises(EXERCISES, filter), [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key: keyof ExerciseFilter, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/exercises${next.toString() ? `?${next}` : ""}`, { scroll: false });
  };

  const select = (key: keyof ExerciseFilter, label: string, options: readonly string[], prefix: string) => (
    <div>
      <label className="label" htmlFor={`f-${key}`}>
        {label}
      </label>
      <select id={`f-${key}`} className="input" value={(filter[key] as string) ?? ""} onChange={(e) => update(key, e.target.value)}>
        <option value="">{t("common.all")}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {t(`${prefix}.${o}`)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-bold text-white">{t("ex.title")}</h1>
      <p className="mt-2 text-zinc-400">{t("ex.subtitle")}</p>

      <form className="card mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="label" htmlFor="f-q">
            {t("ex.search")}
          </label>
          <input id="f-q" className="input" type="search" placeholder={t("ex.search")} value={filter.q} onChange={(e) => update("q", e.target.value)} />
        </div>
        {select("muscle", t("ex.filter.muscle"), MUSCLES, "muscle")}
        {select("equipment", t("ex.filter.equipment"), EQUIPMENT, "equipment")}
        {select("level", t("ex.filter.level"), LEVELS, "level")}
        {select("goal", t("ex.filter.goal"), GOALS, "goal")}
      </form>

      <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
        <p aria-live="polite">{t("ex.count", { n: list.length })}</p>
        <button type="button" className="text-lime-300 hover:underline" onClick={() => router.replace("/exercises", { scroll: false })}>
          {t("ex.filter.reset")}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="card mt-6 text-center text-zinc-400">{t("ex.empty")}</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => (
            <li key={e.id}>
              <Link href={`/exercises/${e.id}`} className="card group block h-full transition hover:border-lime-400/40" data-testid="exercise-card">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-white group-hover:text-lime-300">{localized(e.name, locale)}</h2>
                  <span className={`chip shrink-0 ${levelColor[e.level]}`}>{t(`level.${e.level}`)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{localized(e.description, locale)}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {e.primaryMuscles.map((m) => (
                    <span key={m} className="chip border-lime-400/30 text-lime-200">
                      {t(`muscle.${m}`)}
                    </span>
                  ))}
                  {e.secondaryMuscles.slice(0, 2).map((m) => (
                    <span key={m} className="chip text-cyan-200">
                      {t(`muscle.${m}`)}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span>{e.equipment.map((q) => t(`equipment.${q}`)).join(" · ")}</span>
                  {e.tracking && <span className="chip border-cyan-400/30 text-cyan-300">◎ {t("ex.trackable")}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
