"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getExercise, TRACKABLE } from "@/lib/exercises";
import { localized } from "@/lib/i18n";
import { getProfile } from "@/lib/pose/profiles";
import { ExerciseTracker, type SetSummary, type TrackerState } from "@/lib/pose/tracker";
import { useSettings, useT } from "@/lib/store/settings";
import { useRepo } from "@/lib/store/auth";
import { uid } from "@/lib/data/repository";
import { speak } from "@/lib/voice";
import type { SetLog } from "@/lib/types";
import { useFrames, useScan } from "./ScanContext";

interface DoneSet extends SetSummary {
  exerciseId: string;
  weightKg: number | null;
  createdAt: string;
}

function scoreColor(s: number) {
  return s >= 80 ? "text-lime-300" : s >= 60 ? "text-yellow-300" : "text-red-400";
}

export default function LiveTracking() {
  const { t, locale } = useT();
  const params = useSearchParams();
  const scan = useScan();
  const repo = useRepo();
  const voice = useSettings((s) => s.voice);
  const initial = params.get("exercise");
  const [exerciseId, setExerciseId] = useState(TRACKABLE.some((e) => e.id === initial) ? initial! : "bodyweight_squat");
  const [weight, setWeight] = useState("");
  const [active, setActive] = useState(false);
  const [view, setView] = useState<TrackerState | null>(null);
  const [sets, setSets] = useState<DoneSet[]>([]);
  const [lastSummary, setLastSummary] = useState<DoneSet | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const trackerRef = useRef<ExerciseTracker | null>(null);
  const sessionStart = useRef<string | null>(null);
  const lastUi = useRef(0);
  const lastReps = useRef(0);
  const planItemId = params.get("planItem");

  const exercise = getExercise(exerciseId)!;
  const profile = getProfile(exercise.tracking);

  useEffect(() => {
    scan.setDemoKey(exercise.tracking ?? "squat");
  }, [exercise.tracking, scan]);

  useFrames((f) => {
    const tr = trackerRef.current;
    if (!tr || !active) {
      scan.setJointStatus({});
      return;
    }
    if (!f.frame || (!f.quality.ok && !scan.isDemo && f.quality.issues.some((i) => i !== "low_light"))) {
      // Frame berkualitas rendah dilewati agar tidak menghasilkan hitungan palsu.
      return;
    }
    const st = tr.process(f.frame);
    scan.setJointStatus(st.jointStatus);
    if (voice && st.reps > lastReps.current) speak(String(st.reps), locale);
    if (voice && st.activeIssues[0]) speak(t(st.activeIssues[0]).split("—")[0], locale, { cue: true });
    lastReps.current = st.reps;
    if (f.t - lastUi.current > 100 || st.reps !== view?.reps) {
      lastUi.current = f.t;
      setView(st);
    }
  });

  const startSet = () => {
    if (!profile) return;
    trackerRef.current = new ExerciseTracker(profile);
    lastReps.current = 0;
    sessionStart.current ??= new Date().toISOString();
    setSaved(false);
    setLastSummary(null);
    setView(null);
    setActive(true);
    if (voice) speak(locale === "en" ? "Go" : "Mulai", locale);
  };

  const endSet = () => {
    const tr = trackerRef.current;
    setActive(false);
    scan.setJointStatus({});
    if (!tr) return;
    const s = tr.summary();
    trackerRef.current = null;
    if (s.reps === 0 && s.holdSec === 0) return;
    const w = parseFloat(weight);
    const done: DoneSet = { ...s, exerciseId, weightKg: Number.isFinite(w) && w > 0 ? w : null, createdAt: new Date().toISOString() };
    setSets((xs) => [...xs, done]);
    setLastSummary(done);
    if (voice) speak(locale === "en" ? `${s.reps} reps, form ${s.formScore}` : `${s.reps} repetisi, skor form ${s.formScore}`, locale);
  };

  const finish = async () => {
    if (!repo || !sets.length) return;
    setSaving(true);
    const sessionId = uid();
    const startedAt = sessionStart.current ?? new Date().toISOString();
    const endedAt = new Date().toISOString();
    const logs: SetLog[] = sets.map((s, i) => ({
      id: uid(),
      sessionId,
      exerciseId: s.exerciseId,
      setIndex: i,
      reps: s.reps,
      weightKg: s.weightKg,
      formScore: s.formScore,
      romDeg: s.romDeg,
      romPct: s.romPct,
      symmetry: s.symmetry,
      tempoDownMs: s.tempoDownMs,
      tempoUpMs: s.tempoUpMs,
      consistency: s.consistency,
      holdSec: s.holdSec || null,
      issues: s.issues,
      createdAt: s.createdAt,
    }));
    try {
      await repo.saveSession(
        {
          id: sessionId,
          startedAt,
          endedAt,
          durationSec: Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000),
          source: "camera",
          planItemId: planItemId && /^[0-9a-f-]{36}$/i.test(planItemId) ? planItemId : null,
        },
        logs,
      );
      setSets([]);
      sessionStart.current = null;
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const phaseKey = view ? `scan.phase.${view.phase}` : "scan.phase.rest";
  const issue = view?.activeIssues[0];

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="ex-select">
            {t("scan.selectExercise")}
          </label>
          <select id="ex-select" className="input" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} disabled={active}>
            {TRACKABLE.map((e) => (
              <option key={e.id} value={e.id}>
                {localized(e.name, locale)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-cyan-300">📐 {t(`scan.viewHint.${profile?.view ?? "any"}`)}</p>
        </div>
        {exercise.loadable && (
          <div>
            <label className="label" htmlFor="weight">
              {t("scan.weight")}
            </label>
            <input id="weight" className="input" inputMode="decimal" type="number" min={0} max={500} step={0.5} value={weight} onChange={(e) => setWeight(e.target.value)} disabled={active} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!active ? (
            <button type="button" className="btn-primary" onClick={startSet} disabled={!scan.running} data-testid="start-set">
              ▶ {t("scan.startSet")}
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={endSet} data-testid="end-set">
              ■ {t("scan.endSet")}
            </button>
          )}
        </div>
      </div>

      {/* Tampilan real-time */}
      <div className="card" aria-live="polite">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="label">{exercise.timed ? t("scan.hold") : t("scan.reps")}</p>
            <p className="font-mono text-6xl font-black text-white" data-testid="rep-count">
              {exercise.timed ? `${Math.floor(view?.holdSec ?? 0)}s` : (view?.reps ?? 0)}
            </p>
            <p className="text-xs text-zinc-400">{t(phaseKey)}</p>
          </div>
          <div>
            <p className="label">{t("scan.formScore")}</p>
            <p className={`font-mono text-6xl font-black ${scoreColor(view?.formScoreLive ?? 100)}`}>{active ? (view?.formScoreLive ?? 100) : "—"}</p>
            <div className="mx-auto mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
              <div className="h-full bg-gradient-to-r from-cyan-400 to-lime-400 transition-all" style={{ width: `${Math.max(0, Math.min(1, view?.progress ?? 0)) * 100}%` }} />
            </div>
          </div>
        </div>
        {active && (
          <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${issue ? "bg-red-500/10 text-red-200" : view?.partialRep ? "bg-yellow-500/10 text-yellow-200" : "bg-lime-500/10 text-lime-200"}`}>
            {issue ? `⚠ ${t(issue)}` : view?.partialRep ? `↓ ${t("scan.partial")}` : `✓ ${t("scan.goodForm")}`}
          </p>
        )}
      </div>

      {lastSummary && <SetCard set={lastSummary} n={sets.length} />}

      {sets.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-white">{t("scan.sessionSets")}</h3>
          <ol className="mt-2 space-y-1 text-sm text-zinc-300">
            {sets.map((s, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {i + 1}. {localized(getExercise(s.exerciseId)!.name, locale)}
                </span>
                <span className="font-mono">
                  {s.holdSec ? `${s.holdSec}s` : `${s.reps}×`}
                  {s.weightKg ? ` @ ${s.weightKg}kg` : ""} · <span className={scoreColor(s.formScore)}>{s.formScore}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-primary" onClick={finish} disabled={saving || active} data-testid="finish-session">
              💾 {t("scan.finishSession")}
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setSets([]); setLastSummary(null); sessionStart.current = null; }} disabled={active}>
              {t("scan.discard")}
            </button>
          </div>
        </div>
      )}
      {saved && (
        <p role="status" className="rounded-xl bg-lime-500/10 px-3 py-2 text-sm text-lime-200">
          ✓ {t("scan.sessionSaved")}{" "}
          <Link href="/dashboard" className="underline">
            {t("nav.dashboard")} →
          </Link>
        </p>
      )}
    </div>
  );
}

function SetCard({ set, n }: { set: DoneSet; n: number }) {
  const { t } = useT();
  const row = (label: string, value: string) => (
    <div className="flex justify-between border-b border-white/5 py-1.5 text-sm">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="font-mono text-zinc-100">{value}</dd>
    </div>
  );
  return (
    <section className="card border-lime-400/20" aria-label={t("scan.setSummary", { n })}>
      <h3 className="font-semibold text-white">{t("scan.setSummary", { n })}</h3>
      <dl className="mt-2">
        {row(set.holdSec ? t("scan.hold") : t("scan.reps"), set.holdSec ? `${set.holdSec}s` : String(set.reps))}
        {row(t("scan.formScore"), `${set.formScore}/100`)}
        {!set.holdSec && row(t("scan.metric.rom"), `${set.romDeg}° (${Math.round(set.romPct * 100)}%)`)}
        {!set.holdSec && row(t("scan.metric.symmetry"), `${set.symmetry}%`)}
        {!set.holdSec && row(t("scan.metric.tempo"), `${(set.tempoDownMs / 1000).toFixed(1)}s / ${(set.tempoUpMs / 1000).toFixed(1)}s`)}
        {!set.holdSec && row(t("scan.metric.consistency"), `${set.consistency}%`)}
      </dl>
      {set.issues.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-yellow-200">
          {set.issues.slice(0, 3).map((i) => (
            <li key={i}>⚠ {t(i)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
