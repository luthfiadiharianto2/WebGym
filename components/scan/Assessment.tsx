"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Landmark } from "@/lib/pose/landmarks";
import { scoreOverheadSquat, scoreShoulderReach, scoreToeTouch } from "@/lib/pose/mobility";
import { analyzeFront, analyzeSide, averageLandmarks, estimateProportions, postureScore, type SegMask } from "@/lib/pose/posture";
import { useAuth, useRepo } from "@/lib/store/auth";
import { useSettings, useT } from "@/lib/store/settings";
import { uid } from "@/lib/data/repository";
import { speak } from "@/lib/voice";
import type { MobilityAssessment, PostureAssessment } from "@/lib/types";
import { useFrames, useScan } from "./ScanContext";

const STEPS = ["front", "side", "ohs", "reach", "toe"] as const;
type Step = (typeof STEPS)[number];
const RECORD_SEC: Record<Step, number> = { front: 2.5, side: 2.5, ohs: 9, reach: 4, toe: 5 };
const COUNTDOWN = 5;

export default function Assessment() {
  const { t, locale } = useT();
  const scan = useScan();
  const repo = useRepo();
  const user = useAuth((s) => s.user);
  const voice = useSettings((s) => s.voice);
  const [stepIdx, setStepIdx] = useState(-1);
  const [phase, setPhase] = useState<"instr" | "countdown" | "record">("instr");
  const [count, setCount] = useState(COUNTDOWN);
  const [photoOptIn, setPhotoOptIn] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const frames = useRef<Record<Step, Landmark[][]>>({ front: [], side: [], ohs: [], reach: [], toe: [] });
  const rawFront = useRef<Landmark[][]>([]);
  const mask = useRef<SegMask | null>(null);
  const photo = useRef<Blob | null>(null);
  const [done, setDone] = useState<Partial<Record<Step, boolean>>>({});
  const step: Step | null = stepIdx >= 0 && stepIdx < STEPS.length ? STEPS[stepIdx] : null;

  useEffect(() => {
    scan.setDemoKey(step ? `assess:${step}` : "assess:front");
    scan.setWantMask(step === "front" && phase === "record");
  }, [step, phase, scan]);

  useEffect(() => () => scan.setWantMask(false), [scan]);

  // Hitung mundur → rekam → langkah berikut.
  useEffect(() => {
    if (!step) return;
    if (phase === "countdown") {
      if (voice) speak(String(count), locale, {});
      if (count <= 0) {
        setPhase("record");
        return;
      }
      const id = setTimeout(() => setCount((c) => c - 1), 1000);
      return () => clearTimeout(id);
    }
    if (phase === "record") {
      const id = setTimeout(async () => {
        if (step === "front" && photoOptIn && user) photo.current = await scan.captureFrame();
        setDone((d) => ({ ...d, [step]: frames.current[step].length > 3 }));
        next();
      }, RECORD_SEC[step] * 1000);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count, step]);

  useFrames((f) => {
    if (!step || phase !== "record" || !f.frame || !f.raw) return;
    if (!scan.isDemo && !f.quality.ok && f.quality.issues.some((i) => i !== "low_light")) return;
    frames.current[step].push(f.frame.landmarks);
    if (step === "front") {
      rawFront.current.push(f.raw);
      if (f.mask) mask.current = f.mask;
    }
  });

  const next = () => {
    setPhase("instr");
    setCount(COUNTDOWN);
    setStepIdx((i) => i + 1);
  };
  const begin = () => {
    frames.current = { front: [], side: [], ohs: [], reach: [], toe: [] };
    rawFront.current = [];
    mask.current = null;
    photo.current = null;
    setDone({});
    setSaved(false);
    setStepIdx(0);
    setPhase("instr");
  };

  // Hasil
  const result = useMemo(() => {
    if (stepIdx < STEPS.length) return null;
    const f = frames.current;
    const front = f.front.length ? analyzeFront(averageLandmarks(f.front)) : null;
    const side = f.side.length ? analyzeSide(averageLandmarks(f.side)) : null;
    const proportions = rawFront.current.length ? estimateProportions(averageLandmarks(rawFront.current), mask.current) : null;
    const ohs = f.ohs.length ? scoreOverheadSquat(f.ohs) : null;
    const reach = f.reach.length ? scoreShoulderReach(f.reach) : null;
    const toe = f.toe.length ? scoreToeTouch(f.toe) : null;
    const posture: PostureAssessment | null = front
      ? {
          id: uid(),
          createdAt: new Date().toISOString(),
          shoulderTiltDeg: front.shoulderTiltDeg,
          pelvicTiltDeg: front.pelvicTiltDeg,
          forwardHeadRatio: side?.forwardHeadRatio ?? null,
          spineDeviationDeg: front.spineDeviationDeg,
          symmetryScore: front.symmetryScore,
          postureScore: postureScore(front, side?.forwardHeadRatio ?? null),
          proportions,
          photoPath: null,
        }
      : null;
    const mobility: MobilityAssessment | null =
      ohs && reach && toe
        ? (() => {
            const hip = ohs.hipScore;
            const shoulder = Math.round((reach.score + ohs.armScore) / 2);
            const hamstring = toe.score;
            const ankle = ohs.ankleScore;
            return {
              id: uid(),
              createdAt: new Date().toISOString(),
              overheadSquat: ohs.score,
              shoulderReach: reach.score,
              toeTouch: toe.score,
              hip,
              shoulder,
              hamstring,
              ankle,
              overall: Math.round((hip + shoulder + hamstring + ankle) / 4),
              details: { minKneeDeg: ohs.minKneeDeg, torsoLeanDeg: ohs.torsoLeanDeg, armAngleDeg: ohs.armAngleDeg, shoulderFlexDeg: reach.maxAngleDeg, toeReach: toe.minReach },
            };
          })()
        : null;
    return { posture, mobility };
  }, [stepIdx]);

  const save = async () => {
    if (!repo || !result) return;
    setSaving(true);
    try {
      if (result.posture) {
        const p = { ...result.posture };
        if (photo.current && photoOptIn && repo.kind === "supabase") {
          await repo.logConsent({ id: uid(), type: "progress_photos", granted: true, version: "1.0", createdAt: new Date().toISOString() });
          p.photoPath = await repo.uploadProgressPhoto(photo.current, p.id);
        }
        await repo.savePosture(p);
      }
      if (result.mobility) await repo.saveMobility(result.mobility);
      photo.current = null; // tidak disimpan lebih lama dari perlu
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const guide = typeof document !== "undefined" ? document.getElementById("guide-slot") : null;

  // ---------------- Intro
  if (stepIdx === -1) {
    return (
      <div className="card space-y-4">
        <p className="text-sm text-zinc-300">{t("assess.intro")}</p>
        <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-400">
          {STEPS.map((s) => (
            <li key={s}>{t(`assess.step.${s}`)}</li>
          ))}
        </ol>
        {user ? (
          <label className="flex items-start gap-2 text-sm text-zinc-300">
            <input type="checkbox" className="mt-1" checked={photoOptIn} onChange={(e) => setPhotoOptIn(e.target.checked)} />
            {t("assess.photo.optin")}
          </label>
        ) : (
          <p className="text-xs text-zinc-500">📷 {t("assess.photo.guest")}</p>
        )}
        <button type="button" className="btn-primary" onClick={begin} disabled={!scan.running} data-testid="assess-begin">
          ▶ {t("common.start")}
        </button>
      </div>
    );
  }

  // ---------------- Langkah-langkah
  if (step) {
    return (
      <div className="card space-y-4" aria-live="polite">
        <div className="flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i < stepIdx ? "bg-lime-400" : i === stepIdx ? "bg-cyan-400" : "bg-white/10"}`} />
          ))}
        </div>
        <h2 className="text-xl font-bold text-white">
          {stepIdx + 1}/{STEPS.length} · {t(`assess.step.${step}`)}
        </h2>
        <p className="text-sm text-zinc-300">{t(`assess.instr.${step}`)}</p>
        {phase === "instr" && (
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => setPhase("countdown")} data-testid="assess-ready">
              {t("assess.ready")}
            </button>
            <button type="button" className="btn-secondary" onClick={next}>
              {t("assess.skip")}
            </button>
          </div>
        )}
        {phase === "countdown" && <p className="text-lg text-cyan-300">{t("assess.countdown", { n: count })}</p>}
        {phase === "record" && <p className="animate-pulse text-lg text-red-300">● {t("assess.recording")}</p>}
        {guide &&
          createPortal(
            <div className="absolute inset-0 grid place-items-center">
              <Silhouette view={step === "front" || step === "ohs" ? "front" : "side"} />
              {phase === "countdown" && <span className="absolute font-mono text-8xl font-black text-white/90 drop-shadow">{count}</span>}
            </div>,
            guide,
          )}
      </div>
    );
  }

  // ---------------- Hasil
  const p = result?.posture;
  const m = result?.mobility;
  const tiltText = (deg: number) => (Math.abs(deg) < 1 ? t("assess.level") : deg > 0 ? t("assess.rightLower") : t("assess.leftLower"));
  return (
    <div className="space-y-4">
      {p && (
        <section className="card">
          <h2 className="text-lg font-semibold text-white">
            {t("assess.posture")}: <span className="text-lime-300">{p.postureScore}/100</span>
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row k={t("assess.shoulderTilt")} v={`${Math.abs(p.shoulderTiltDeg)}° · ${tiltText(p.shoulderTiltDeg)}`} />
            <Row k={t("assess.pelvicTilt")} v={`${Math.abs(p.pelvicTiltDeg)}° · ${tiltText(p.pelvicTiltDeg)}`} />
            <Row k={t("assess.spine")} v={`${p.spineDeviationDeg}°`} />
            <Row k={t("assess.forwardHead")} v={p.forwardHeadRatio === null ? "—" : `${Math.round(p.forwardHeadRatio * 100)}%`} />
            <Row k={t("assess.symmetry")} v={`${p.symmetryScore}%`} />
          </dl>
          {p.proportions && (
            <div className="mt-4 rounded-xl bg-white/5 p-3">
              <h3 className="text-sm font-semibold text-zinc-200">{t("assess.proportions")}</h3>
              <dl className="mt-2 space-y-1 text-sm">
                <Row k={t("assess.ratio.sh")} v={`1 : ${(1 / p.proportions.shoulderToHip).toFixed(2)} (${p.proportions.shoulderToHip})`} />
                {p.proportions.shoulderToWaist && <Row k={t("assess.ratio.sw")} v={String(p.proportions.shoulderToWaist)} />}
                {p.proportions.waistToHip && <Row k={t("assess.ratio.wh")} v={String(p.proportions.waistToHip)} />}
              </dl>
              <p className="mt-2 text-xs text-zinc-500">ⓘ {t("assess.proportions.note")}</p>
            </div>
          )}
        </section>
      )}
      {m && (
        <section className="card">
          <h2 className="text-lg font-semibold text-white">
            {t("assess.mobility")}: <span className="text-cyan-300">{m.overall}/100</span>
          </h2>
          <ul className="mt-3 space-y-2">
            {(["hip", "shoulder", "hamstring", "ankle"] as const).map((k) => (
              <li key={k}>
                <div className="flex justify-between text-sm text-zinc-300">
                  <span>{t(`assess.area.${k}`)}</span>
                  <span className="font-mono">{m[k]}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuenow={m[k]} aria-valuemin={0} aria-valuemax={100} aria-label={t(`assess.area.${k}`)}>
                  <div className={`h-full ${m[k] >= 70 ? "bg-lime-400" : m[k] >= 50 ? "bg-yellow-400" : "bg-red-400"}`} style={{ width: `${m[k]}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-zinc-500">⚕ {t("disclaimer.short")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={save} disabled={saving || saved || (!p && !m)} data-testid="assess-save">
          💾 {t("assess.save")}
        </button>
        <button type="button" className="btn-secondary" onClick={begin}>
          ↺ {t("scan.retry")}
        </button>
      </div>
      {saved && (
        <p role="status" className="rounded-xl bg-lime-500/10 px-3 py-2 text-sm text-lime-200">
          ✓ {t("assess.saved")}{" "}
          <Link href="/plan" className="underline">
            {t("nav.plan")} →
          </Link>
        </p>
      )}
      {!done.front && !p && <p className="text-sm text-yellow-200">⚠ {t("scan.quality.not_full_body")}</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-white/5 pb-1">
      <dt className="text-zinc-400">{k}</dt>
      <dd className="font-mono text-zinc-100">{v}</dd>
    </div>
  );
}

/** Siluet pemandu posisi tubuh (depan/samping). */
function Silhouette({ view }: { view: "front" | "side" }) {
  return (
    <svg viewBox="0 0 100 200" className="h-[85%] opacity-40" aria-hidden>
      <g fill="none" stroke="#a3e635" strokeWidth="1.5" strokeDasharray="4 3">
        {view === "front" ? (
          <>
            <circle cx="50" cy="18" r="11" />
            <path d="M30 34 L70 34 L66 95 L34 95 Z" />
            <path d="M30 36 L20 95 M70 36 L80 95" />
            <path d="M38 95 L36 190 M62 95 L64 190" />
          </>
        ) : (
          <>
            <circle cx="52" cy="18" r="11" />
            <path d="M44 34 L58 34 L58 95 L44 95 Z" />
            <path d="M51 36 L51 95" />
            <path d="M50 95 L50 190 M50 190 L62 190" />
          </>
        )}
      </g>
    </svg>
  );
}
