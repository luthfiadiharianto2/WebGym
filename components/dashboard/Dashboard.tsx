"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getExercise } from "@/lib/exercises";
import { localized } from "@/lib/i18n";
import { heatColor } from "@/lib/muscleColors";
import { exerciseTrend, muscleLoad, personalRecords, setsToCSV, weekSummary } from "@/lib/stats";
import { useT } from "@/lib/store/settings";
import { useUserData } from "@/lib/useUserData";
import { MUSCLES, type Muscle, type PostureAssessment } from "@/lib/types";

const TrendChart = dynamic(() => import("./Charts"), { ssr: false, loading: () => <div className="h-60 animate-pulse rounded-xl bg-zinc-900" /> });
const AvatarViewer = dynamic(() => import("@/components/3d/AvatarViewer"), { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-2xl bg-zinc-900" /> });

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Dashboard() {
  const { t, locale } = useT();
  const { data, loading, repo, reload } = useUserData();
  const { sessions, sets, posture, mobility } = data;
  const exerciseIds = useMemo(() => [...new Set(sets.map((s) => s.exerciseId))], [sets]);
  const [exId, setExId] = useState<string>("");
  useEffect(() => {
    if (!exId && exerciseIds[0]) setExId(exerciseIds[0]);
  }, [exerciseIds, exId]);

  const week = useMemo(() => weekSummary(sessions, sets), [sessions, sets]);
  const trend = useMemo(() => (exId ? exerciseTrend(sets, exId) : []), [sets, exId]);
  const prs = useMemo(() => personalRecords(sets), [sets]);
  const load = useMemo(() => muscleLoad(sets), [sets]);
  const heat = useMemo(() => {
    const max = Math.max(1, ...Object.values(load));
    const c: Partial<Record<Muscle, string>> = {};
    for (const m of MUSCLES) c[m] = heatColor((load[m] ?? 0) / max);
    return c;
  }, [load]);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });

  if (loading) return <div className="mx-auto max-w-7xl px-4 py-10 text-zinc-500">{t("common.loading")}</div>;
  const empty = sessions.length === 0 && posture.length === 0 && mobility.length === 0;

  const stat = (label: string, value: string) => (
    <div className="card">
      <p className="label">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-white">{value}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold text-white">
        {t("dash.title")}
        {data.profile?.displayName ? <span className="text-zinc-500"> · {data.profile.displayName}</span> : null}
      </h1>

      {empty && (
        <div className="card mt-6 text-center">
          <p className="text-zinc-400">{t("dash.empty")}</p>
          <Link href="/scan" className="btn-primary mt-4">
            ◎ {t("home.cta.scan")}
          </Link>
        </div>
      )}

      <section aria-labelledby="week-title" className="mt-6">
        <h2 id="week-title" className="text-lg font-semibold text-white">
          {t("dash.week")}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          {stat(t("dash.sessions"), String(week.sessions))}
          {stat(t("dash.totalReps"), String(week.totalReps))}
          {stat(t("dash.volume"), `${week.volumeKg.toLocaleString(locale)} kg`)}
          {stat(t("dash.duration"), t("dash.min", { n: week.durationMin }))}
          {stat(t("dash.streak"), `🔥 ${t("dash.days", { n: week.streakDays })}`)}
        </div>
      </section>

      {exerciseIds.length > 0 && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="card" aria-labelledby="form-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="form-title" className="font-semibold text-white">
                {t("dash.formTrend")}
              </h2>
              <label className="sr-only" htmlFor="dash-ex">
                {t("dash.exercise")}
              </label>
              <select id="dash-ex" className="input w-auto" value={exId} onChange={(e) => setExId(e.target.value)}>
                {exerciseIds.map((id) => (
                  <option key={id} value={id}>
                    {localized(getExercise(id)?.name ?? { id, en: id }, locale)}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              <TrendChart label={t("dash.formTrend")} data={trend} series={[{ key: "formScore", name: t("scan.formScore"), color: "#a3e635" }]} />
            </div>
          </section>
          <section className="card" aria-labelledby="symrom-title">
            <h2 id="symrom-title" className="font-semibold text-white">
              {t("dash.symRom")}
            </h2>
            <div className="mt-3">
              <TrendChart
                label={t("dash.symRom")}
                data={trend}
                series={[
                  { key: "symmetry", name: t("scan.metric.symmetry"), color: "#22d3ee" },
                  { key: "rom", name: `${t("scan.metric.rom")} (°)`, color: "#fb923c", yAxisId: "right" },
                ]}
              />
            </div>
          </section>
        </div>
      )}

      {(posture.length > 0 || mobility.length > 0) && (
        <section className="card mt-4" aria-labelledby="pm-title">
          <h2 id="pm-title" className="font-semibold text-white">
            {t("dash.postureHistory")}
          </h2>
          <div className="mt-3">
            <TrendChart
              label={t("dash.postureHistory")}
              data={mergeByDate(posture.map((p) => ({ date: fmtDate(p.createdAt), posture: p.postureScore })), mobility.map((m) => ({ date: fmtDate(m.createdAt), mobility: m.overall })))}
              series={[
                { key: "posture", name: t("dash.posture"), color: "#a3e635" },
                { key: "mobility", name: t("dash.mobility"), color: "#22d3ee" },
              ]}
            />
          </div>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card" aria-labelledby="pr-title">
          <h2 id="pr-title" className="font-semibold text-white">
            🏆 {t("dash.prs")}
          </h2>
          {prs.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">{t("dash.noPR")}</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th scope="col" className="py-1">{t("dash.exercise")}</th>
                  <th scope="col">{t("dash.bestSet")}</th>
                  <th scope="col">{t("dash.est1rm")}</th>
                </tr>
              </thead>
              <tbody>
                {prs.map((p) => (
                  <tr key={p.exerciseId} className="border-t border-white/5">
                    <td className="py-1.5 text-zinc-200">{localized(getExercise(p.exerciseId)!.name, locale)}</td>
                    <td className="font-mono text-zinc-300">
                      {p.bestWeight} kg × {p.bestReps}
                    </td>
                    <td className="font-mono text-lime-300">{p.est1RM} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-zinc-500">{t("dash.prs.note")}</p>
        </section>

        <section className="card" aria-labelledby="heat-title">
          <h2 id="heat-title" className="font-semibold text-white">
            {t("dash.heatmap")}
          </h2>
          <AvatarViewer
            animation="calf_raise"
            playing={false}
            staticPhase={0}
            showProp={false}
            autoRotate
            colors={heat}
            className="mt-3 h-80"
            label={`${t("dash.heatmap")}: ${MUSCLES.map((m) => `${t(`muscle.${m}`)} ${load[m] ?? 0}`).join(", ")}`}
          />
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400" aria-hidden>
            {t("dash.heatmap.rare")}
            <span className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.33)}, ${heatColor(0.66)}, ${heatColor(1)})` }} />
            {t("dash.heatmap.often")}
          </div>
        </section>
      </div>

      <CompareScans posture={posture} />

      <section className="card mt-4" aria-labelledby="hist-title">
        <h2 id="hist-title" className="font-semibold text-white">
          {t("dash.history")}
        </h2>
        {sessions.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">—</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th scope="col" className="py-1">{t("dash.date")}</th>
                  <th scope="col">{t("dash.exercise")}</th>
                  <th scope="col">{t("scan.reps")}</th>
                  <th scope="col">{t("scan.formScore")}</th>
                  <th scope="col">{t("dash.duration")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 50).map((s) => {
                  const ss = sets.filter((x) => x.sessionId === s.id);
                  const avg = ss.length ? Math.round(ss.reduce((a, x) => a + x.formScore, 0) / ss.length) : 0;
                  return (
                    <tr key={s.id} className="border-t border-white/5">
                      <td className="py-1.5 text-zinc-300">{new Date(s.startedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td className="text-zinc-200">{[...new Set(ss.map((x) => localized(getExercise(x.exerciseId)?.name ?? { id: x.exerciseId, en: x.exerciseId }, locale)))].join(", ")}</td>
                      <td className="font-mono">{ss.reduce((a, x) => a + x.reps, 0)}</td>
                      <td className="font-mono text-lime-300">{avg}</td>
                      <td className="font-mono text-zinc-400">{t("dash.min", { n: Math.max(1, Math.round(s.durationSec / 60)) })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DataControls
        onCSV={() => download(`ironvision-sets-${Date.now()}.csv`, setsToCSV(sessions, sets), "text/csv")}
        onJSON={async () => repo && download(`ironvision-export-${Date.now()}.json`, JSON.stringify(await repo.exportAll(), null, 2), "application/json")}
        onDelete={async () => {
          if (!repo) return;
          await repo.deleteAll();
          try {
            sessionStorage.clear();
          } catch {}
          await reload();
        }}
      />
    </div>
  );
}

function mergeByDate(...lists: Record<string, string | number>[][]) {
  const map = new Map<string, Record<string, string | number>>();
  for (const l of lists) for (const row of l) map.set(String(row.date), { ...(map.get(String(row.date)) ?? {}), ...row });
  return [...map.values()];
}

function CompareScans({ posture }: { posture: PostureAssessment[] }) {
  const { t, locale } = useT();
  const [a, setA] = useState(0);
  const [b, setB] = useState(Math.max(0, posture.length - 1));
  useEffect(() => setB(Math.max(0, posture.length - 1)), [posture.length]);
  const pa = posture[a];
  const pb = posture[b];
  const rows: [string, (p: PostureAssessment) => number | null, boolean][] = [
    [t("assess.posture"), (p) => p.postureScore, true],
    [t("assess.symmetry"), (p) => p.symmetryScore, true],
    [t("assess.shoulderTilt"), (p) => Math.abs(p.shoulderTiltDeg), false],
    [t("assess.pelvicTilt"), (p) => Math.abs(p.pelvicTiltDeg), false],
    [t("assess.forwardHead"), (p) => (p.forwardHeadRatio === null ? null : Math.round(p.forwardHeadRatio * 100)), false],
  ];
  const opt = (p: PostureAssessment, i: number) => (
    <option key={p.id} value={i}>
      {new Date(p.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
    </option>
  );
  return (
    <section className="card mt-4" aria-labelledby="cmp-title">
      <h2 id="cmp-title" className="font-semibold text-white">
        {t("dash.compare")}
      </h2>
      {posture.length < 2 ? (
        <p className="mt-2 text-sm text-zinc-500">{t("dash.compare.empty")}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-zinc-400">
              {t("dash.compare.before")}
              <select className="input mt-1" value={a} onChange={(e) => setA(Number(e.target.value))}>
                {posture.map(opt)}
              </select>
            </label>
            <label className="text-sm text-zinc-400">
              {t("dash.compare.after")}
              <select className="input mt-1" value={b} onChange={(e) => setB(Number(e.target.value))}>
                {posture.map(opt)}
              </select>
            </label>
          </div>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {rows.map(([label, fn, higherBetter]) => {
                const va = pa ? fn(pa) : null;
                const vb = pb ? fn(pb) : null;
                const d = va !== null && vb !== null ? Math.round((vb - va) * 10) / 10 : null;
                const good = d !== null && (higherBetter ? d > 0 : d < 0);
                return (
                  <tr key={label} className="border-t border-white/5">
                    <th scope="row" className="py-1.5 text-left font-normal text-zinc-400">
                      {label}
                    </th>
                    <td className="font-mono text-zinc-300">{va ?? "—"}</td>
                    <td className="font-mono text-zinc-100">{vb ?? "—"}</td>
                    <td className={`font-mono ${d === null || d === 0 ? "text-zinc-500" : good ? "text-lime-300" : "text-red-300"}`}>
                      {d === null ? "" : `${d > 0 ? "+" : ""}${d}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function DataControls({ onCSV, onJSON, onDelete }: { onCSV: () => void; onJSON: () => void; onDelete: () => Promise<void> }) {
  const { t, locale } = useT();
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const word = locale === "en" ? "DELETE" : "HAPUS";
  return (
    <section id="data" className="card mt-4" aria-labelledby="data-title">
      <h2 id="data-title" className="font-semibold text-white">
        🔒 {t("profile.privacy")}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={onCSV}>
          ⬇ {t("dash.export.csv")}
        </button>
        <button type="button" className="btn-secondary" onClick={onJSON}>
          ⬇ {t("dash.export.json")}
        </button>
        <button type="button" className="btn-danger" onClick={() => setConfirming(true)} data-testid="delete-all">
          🗑 {t("dash.deleteAll")}
        </button>
      </div>
      {confirming && (
        <div role="alertdialog" aria-labelledby="del-title" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <p id="del-title" className="text-sm text-red-200">
            {t("dash.deleteConfirm")}
          </p>
          <label className="sr-only" htmlFor="del-confirm">
            {word}
          </label>
          <input id="del-confirm" className="input mt-3" value={text} onChange={(e) => setText(e.target.value)} placeholder={word} />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-danger"
              disabled={text !== word}
              onClick={async () => {
                await onDelete();
                setDone(true);
                setConfirming(false);
                setText("");
              }}
            >
              {t("common.delete")}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      {done && (
        <p role="status" className="mt-3 text-sm text-lime-300">
          ✓ {t("dash.deleted")}
        </p>
      )}
    </section>
  );
}
