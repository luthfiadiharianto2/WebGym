"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getExercise } from "@/lib/exercises";
import { localized } from "@/lib/i18n";
import { exerciseMuscleColors, PRIMARY_COLOR, SECONDARY_COLOR } from "@/lib/muscleColors";
import { useT } from "@/lib/store/settings";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { Exercise } from "@/lib/types";

const AvatarViewer = dynamic(() => import("@/components/3d/AvatarViewer"), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-2xl bg-zinc-900" />,
});

export default function ExerciseDetail({ exercise }: { exercise: Exercise }) {
  const { t, locale } = useT();
  const reduced = useReducedMotion();
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  // Kurangi gerakan: animasi avatar dijeda secara default (pengguna tetap bisa memutar).
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);
  const isPlaying = playing;
  const name = localized(exercise.name, locale);

  const list = (title: string, items: { id: string; en: string }[], icon: string) => (
    <section className="card">
      <h2 className="font-semibold text-white">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-zinc-300">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-lime-400">
              {icon}
            </span>
            {localized(it, locale)}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav aria-label="breadcrumb" className="text-sm text-zinc-500">
        <Link href="/exercises" className="hover:text-lime-300">
          {t("ex.title")}
        </Link>{" "}
        / <span className="text-zinc-300">{name}</span>
      </nav>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <AvatarViewer
            animation={exercise.animation}
            speed={speed}
            playing={isPlaying}
            colors={exerciseMuscleColors(exercise)}
            label={`${name} — ${t("ex.rotateHint")}`}
            className="h-[420px] sm:h-[520px]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button type="button" className="btn-secondary" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>
              {playing ? `❚❚ ${t("ex.pause")}` : `▶ ${t("ex.play")}`}
            </button>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              {t("ex.speed")}
              <input type="range" min={0.25} max={2} step={0.25} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-valuetext={`${speed}×`} />
              <span className="w-10 font-mono text-xs">{speed}×</span>
            </label>
            <p className="text-xs text-zinc-500">↻ {t("ex.rotateHint")}</p>
            <div className="ml-auto flex gap-3 text-xs text-zinc-400">
              <span className="flex items-center gap-1">
                <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: PRIMARY_COLOR }} /> {t("ex.legend.primary")}
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: SECONDARY_COLOR }} /> {t("ex.legend.secondary")}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <header>
            <h1 className="text-3xl font-bold text-white">{name}</h1>
            <p className="mt-2 text-zinc-400">{localized(exercise.description, locale)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip">{t(`level.${exercise.level}`)}</span>
              <span className="chip">{t(`zone.${exercise.zone}`)}</span>
              {exercise.goals.map((g) => (
                <span key={g} className="chip">
                  {t(`goal.${g}`)}
                </span>
              ))}
            </div>
          </header>
          <section className="card text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-zinc-500">{t("ex.primary")}</dt>
              <dd className="text-lime-200">{exercise.primaryMuscles.map((m) => t(`muscle.${m}`)).join(", ")}</dd>
              <dt className="text-zinc-500">{t("ex.secondary")}</dt>
              <dd className="text-cyan-200">{exercise.secondaryMuscles.map((m) => t(`muscle.${m}`)).join(", ") || "—"}</dd>
              <dt className="text-zinc-500">{t("ex.equipment")}</dt>
              <dd>{exercise.equipment.map((q) => t(`equipment.${q}`)).join(", ")}</dd>
              {exercise.contraindications.length > 0 && (
                <>
                  <dt className="text-zinc-500">{t("ex.avoidFor")}</dt>
                  <dd className="text-orange-300">{exercise.contraindications.map((i) => t(`injury.${i}`)).join(", ")}</dd>
                </>
              )}
            </dl>
          </section>
          {exercise.tracking && (
            <Link href={`/scan?exercise=${exercise.id}`} className="btn-primary w-full">
              ◎ {t("ex.startTracking")}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {list(t("ex.cues"), exercise.cues, "✓")}
        {list(t("ex.mistakes"), exercise.commonMistakes, "✕")}
        <section className="card">
          <h2 className="font-semibold text-white">{t("ex.variations")}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {exercise.variations.map((v) => {
              const ex = getExercise(v);
              return ex ? (
                <li key={v}>
                  <Link href={`/exercises/${v}`} className="chip hover:border-lime-400/50 hover:text-lime-300">
                    {localized(ex.name, locale)}
                  </Link>
                </li>
              ) : null;
            })}
            {exercise.variations.length === 0 && <li className="text-sm text-zinc-500">—</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
