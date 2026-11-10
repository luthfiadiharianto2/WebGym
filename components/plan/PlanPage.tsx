"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getExercise } from "@/lib/exercises";
import { localized, translateReason } from "@/lib/i18n";
import { generatePlan, planSignals } from "@/lib/recommendation/engine";
import { ExplainResponseSchema, type ExplainRequest } from "@/lib/schemas";
import { useT } from "@/lib/store/settings";
import { uid } from "@/lib/data/repository";
import { useUserData } from "@/lib/useUserData";
import type { WorkoutPlan } from "@/lib/types";

export default function PlanPage() {
  const { t, tr, locale } = useT();
  const { data, loading, repo, reload } = useUserData();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [llmState, setLlmState] = useState<"idle" | "loading" | "failed">("idle");

  const build = async () => {
    if (!data.profile || !repo) return;
    const p = generatePlan({ ...data, profile: data.profile, idGen: uid });
    await repo.savePlan(p);
    setPlan(p);
  };

  useEffect(() => {
    if (loading) return;
    if (data.plan) setPlan(data.plan);
    else if (data.profile) void build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const explain = async () => {
    if (!plan || !data.profile || !repo) return;
    setLlmState("loading");
    await repo.logConsent({ id: uid(), type: "llm", granted: true, version: "1.0", createdAt: new Date().toISOString() }).catch(() => {});
    // Hanya ringkasan anonim: tanpa nama, email, umur, berat, atau ID pengguna.
    const body: ExplainRequest = {
      locale,
      goal: data.profile.goal,
      level: data.profile.level,
      daysPerWeek: plan.daysPerWeek,
      split: plan.split,
      injuries: data.profile.injuries,
      signals: planSignals({ ...data, profile: data.profile }),
      items: plan.items.slice(0, 60).map((i) => ({
        exerciseId: i.exerciseId,
        exerciseName: localized(getExercise(i.exerciseId)!.name, locale),
        day: t(i.dayLabel),
        kind: i.kind,
        sets: i.sets,
        reps: `${i.repsMin}-${i.repsMax}`,
        reasons: i.reasons.slice(0, 6).map((r) => translateReason(locale, r).slice(0, 300)),
      })),
    };
    try {
      const res = await fetch("/api/recommendation/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      const parsed = ExplainResponseSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error("invalid");
      const byId = new Map(parsed.data.items.map((i) => [i.exerciseId, i.explanation]));
      const next: WorkoutPlan = {
        ...plan,
        id: uid(),
        source: "rules+llm",
        llmSummary: parsed.data.summary,
        items: plan.items.map((i) => ({ ...i, id: uid(), llmExplanation: byId.get(i.exerciseId) ?? null })),
      };
      next.items.forEach((i) => (i.planId = next.id));
      await repo.savePlan(next);
      setPlan(next);
      setLlmState("idle");
    } catch {
      // Fallback: tetap pakai penjelasan berbasis aturan.
      setLlmState("failed");
    }
  };

  if (loading) return <div className="mx-auto max-w-7xl px-4 py-10 text-zinc-400">{t("common.loading")}</div>;

  if (!data.profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-white">{t("plan.title")}</h1>
        <p className="mt-4 text-zinc-400">{t("plan.empty")}</p>
        <Link href="/profile" className="btn-primary mt-6">
          {t("profile.onboarding")} →
        </Link>
      </div>
    );
  }

  const days = plan ? [...new Set(plan.items.map((i) => i.dayIndex))].sort((a, b) => a - b) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">{t("plan.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">{t("plan.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={async () => { await reload(); await build(); }} data-testid="regen-plan">
            ↺ {t("plan.generate")}
          </button>
          <button type="button" className="btn-primary" onClick={explain} disabled={!plan || llmState === "loading"}>
            ✦ {llmState === "loading" ? t("common.loading") : t("plan.explainLLM")}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-400">ⓘ {t("plan.llmNote")}</p>
      {llmState === "failed" && (
        <p role="status" className="mt-3 rounded-xl bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
          {t("plan.llmUnavailable")}
        </p>
      )}

      {plan && (
        <>
          <section className="card mt-6" aria-labelledby="sum-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="sum-title" className="font-semibold text-white">
                {t("plan.summary")}
              </h2>
              <span className="chip">{plan.source === "rules" ? t("plan.source.rules") : t("plan.source.llm")}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {plan.summary.map((r, i) => (
                <li key={i}>• {tr(r)}</li>
              ))}
            </ul>
            {plan.llmSummary && <p className="mt-3 rounded-xl bg-cyan-500/10 p-3 text-sm text-cyan-100">✦ {plan.llmSummary}</p>}
          </section>

          <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {days.map((d) => {
              const items = plan.items.filter((i) => i.dayIndex === d).sort((a, b) => a.position - b.position);
              return (
                <section key={d} className="card" aria-labelledby={`day-${d}`} data-testid="plan-day">
                  <h2 id={`day-${d}`} className="text-lg font-semibold text-white">
                    {t("plan.day", { n: d + 1 })} · <span className="text-lime-300">{t(items[0]?.dayLabel ?? "")}</span>
                  </h2>
                  <ol className="mt-3 space-y-3">
                    {items.map((it) => {
                      const ex = getExercise(it.exerciseId)!;
                      const replaced = it.replacedFrom ? getExercise(it.replacedFrom) : null;
                      const kindColor = it.kind === "main" ? "text-lime-300 border-lime-400/30" : it.kind === "corrective" ? "text-orange-300 border-orange-400/30" : "text-cyan-300 border-cyan-400/30";
                      return (
                        <li key={it.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <Link href={`/exercises/${ex.id}`} className="font-medium text-white hover:text-lime-300">
                              {localized(ex.name, locale)}
                            </Link>
                            <span className={`chip shrink-0 ${kindColor}`}>{t(`plan.kind.${it.kind}`)}</span>
                          </div>
                          <p className="mt-1 font-mono text-sm text-zinc-300">
                            {it.sets} × {it.repsMin}–{it.repsMax}
                            {ex.timed ? ` ${t("common.sec")}` : ""} · {t("plan.rest", { s: it.restSec })}
                            {it.targetWeightKg ? ` · ${t("plan.target", { w: it.targetWeightKg })}` : ""}
                          </p>
                          {replaced && <p className="mt-1 text-xs text-orange-300">↔ {t("plan.replaced", { name: localized(replaced.name, locale) })}</p>}
                          {it.llmExplanation && <p className="mt-2 text-xs text-cyan-100">✦ {it.llmExplanation}</p>}
                          <details className="mt-2 text-xs text-zinc-400">
                            <summary className="cursor-pointer text-zinc-300 hover:text-lime-300">{t("common.why")}</summary>
                            <ul className="mt-1 space-y-0.5 pl-3">
                              {it.reasons.map((r, i) => (
                                <li key={i}>• {tr(r)}</li>
                              ))}
                            </ul>
                          </details>
                          {ex.tracking && (
                            <Link href={`/scan?exercise=${ex.id}&planItem=${it.id}`} className="mt-2 inline-block text-xs font-semibold text-lime-300 hover:underline">
                              ◎ {t("plan.startSession")} →
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        </>
      )}
      <p className="mt-6 text-xs text-zinc-400">⚕ {t("disclaimer.short")}</p>
    </div>
  );
}
