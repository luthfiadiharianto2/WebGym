"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/store/settings";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { detectCapability } from "@/components/3d/webgl";
import { EQUIPMENT_INFO, type EquipmentId } from "@/components/3d/equipmentInfo";

// Scene 3D di-lazy-load (code splitting) dan tidak dirender di server.
const GymScene = dynamic(() => import("@/components/3d/GymScene"), { ssr: false });

const ZONE_KEYS = ["strength", "cardio", "functional", "stretching"] as const;
const ZONE_EQUIP: Record<(typeof ZONE_KEYS)[number], EquipmentId[]> = {
  strength: ["rack", "bench", "dumbbell_rack"],
  cardio: ["treadmill"],
  functional: ["kettlebell", "pullup"],
  stretching: ["mat"],
};

export default function Landing() {
  const { t } = useT();
  const reduced = useReducedMotion();
  const progress = useRef(0);
  const tourRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"pending" | "3d" | "fallback">("pending");
  const [ready, setReady] = useState(false);
  const [loadPct, setLoadPct] = useState(5);

  useEffect(() => {
    const cap = detectCapability();
    setMode(cap.webgl && !cap.weak ? "3d" : "fallback");
  }, []);

  // Progres loading bertahap sampai scene melaporkan frame pertama.
  useEffect(() => {
    if (mode !== "3d" || ready) return;
    const id = setInterval(() => setLoadPct((p) => Math.min(92, p + (100 - p) * 0.12)), 120);
    return () => clearInterval(id);
  }, [mode, ready]);

  // Kamera mengikuti scroll (GSAP ScrollTrigger), atau lompat per zona saat kurangi gerakan.
  useEffect(() => {
    const el = tourRef.current;
    if (!el || mode !== "3d") return;
    const sections = Array.from(el.querySelectorAll<HTMLElement>("[data-zone]"));
    if (reduced) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) progress.current = Number(e.target.getAttribute("data-zone")) / 3;
        },
        { threshold: 0.6 },
      );
      sections.forEach((s) => io.observe(s));
      return () => io.disconnect();
    }
    let cleanup = () => {};
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      const st = ScrollTrigger.create({
        trigger: el,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.6,
        onUpdate: (self) => (progress.current = self.progress),
      });
      const fades = sections.map((s) =>
        gsap.fromTo(s.querySelector(".zone-card"), { opacity: 0, y: 40 }, { opacity: 1, y: 0, scrollTrigger: { trigger: s, start: "top 75%", end: "top 35%", scrub: true } }),
      );
      cleanup = () => {
        st.kill();
        fades.forEach((f) => f.scrollTrigger?.kill());
      };
    })();
    return () => cleanup();
  }, [mode, reduced]);

  return (
    <div>
      <div ref={tourRef} className="relative">
        {/* Latar 3D lengket */}
        <div className="sticky top-14 -mb-[calc(100vh-3.5rem)] h-[calc(100vh-3.5rem)] w-full overflow-hidden">
          {mode === "3d" && (
            <GymScene
              progress={progress}
              reducedMotion={reduced}
              onReady={() => {
                setLoadPct(100);
                setReady(true);
              }}
            />
          )}
          {mode === "fallback" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/fallback-gym.svg" alt={t("home.fallback")} className="h-full w-full object-cover opacity-80" />
          )}
          {mode === "3d" && !ready && (
            <div className="absolute inset-0 grid place-items-center bg-[#050608]" role="progressbar" aria-valuenow={Math.round(loadPct)} aria-valuemin={0} aria-valuemax={100} aria-label={t("home.loading")}>
              <div className="w-64 text-center">
                <p className="mb-3 text-sm text-zinc-300">{t("home.loading")}</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-gradient-to-r from-lime-400 to-cyan-400 transition-all" style={{ width: `${loadPct}%` }} />
                </div>
                <p className="mt-2 font-mono text-xs text-zinc-400">{Math.round(loadPct)}%</p>
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#050608] to-transparent" />
        </div>

        {/* Hero */}
        <section className="pointer-events-none relative z-10 flex min-h-[calc(100vh-3.5rem)] items-center px-4" aria-labelledby="hero-title">
          <div className="mx-auto w-full max-w-7xl">
            <div className="pointer-events-auto max-w-xl rounded-3xl border border-white/10 bg-black/55 p-6 backdrop-blur-md sm:p-8">
              <p className="chip mb-4 border-lime-400/30 text-lime-300">AI · 3D · On-device</p>
              <h1 id="hero-title" className="text-4xl font-black leading-tight text-white sm:text-5xl">
                {t("home.hero.title")}
              </h1>
              <p className="mt-4 text-zinc-300">{t("home.hero.subtitle")}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/scan" className="btn-primary">
                  {t("home.cta.scan")}
                </Link>
                <Link href="/exercises" className="btn-secondary">
                  {t("home.cta.explore")}
                </Link>
              </div>
              {mode === "fallback" && <p className="mt-4 text-xs text-zinc-400">{t("home.fallback")}</p>}
              <p className="mt-6 text-xs text-zinc-400" aria-hidden>
                ↓ {t("home.scrollHint")}
              </p>
            </div>
          </div>
        </section>

        {/* Zona tur */}
        {ZONE_KEYS.map((z, i) => (
          <section key={z} data-zone={i} className="pointer-events-none relative z-10 flex min-h-screen items-center px-4" aria-labelledby={`zone-${z}`}>
            <div className={`mx-auto flex w-full max-w-7xl ${i % 2 ? "justify-end" : "justify-start"}`}>
              <div className="zone-card pointer-events-auto max-w-md rounded-3xl border border-white/10 bg-black/60 p-6 backdrop-blur-md">
                <p className="font-mono text-xs text-cyan-300">0{i + 1} / 04</p>
                <h2 id={`zone-${z}`} className="mt-1 text-3xl font-bold text-white">
                  {t(`home.zone.${z}`)}
                </h2>
                <p className="mt-3 text-zinc-300">{t(`home.zone.${z}.desc`)}</p>
                <ul className="mt-4 flex flex-wrap gap-2" aria-label={t("ex.equipment")}>
                  {ZONE_EQUIP[z].map((eq) => (
                    <li key={eq}>
                      <Link href={`/exercises?equipment=${EQUIPMENT_INFO[eq].filter}`} className="chip hover:border-lime-400/60 hover:text-lime-300">
                        {t(EQUIPMENT_INFO[eq].nameKey)} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Fitur */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 py-20" aria-labelledby="features-title">
        <h2 id="features-title" className="text-3xl font-bold text-white">
          {t("home.features.title")}
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { k: "scan", href: "/scan", icon: "◎" },
            { k: "library", href: "/exercises", icon: "◆" },
            { k: "plan", href: "/plan", icon: "▤" },
          ].map((f) => (
            <Link key={f.k} href={f.href} className="card group transition hover:border-lime-400/40">
              <span aria-hidden className="text-2xl text-lime-400">
                {f.icon}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-white group-hover:text-lime-300">{t(`home.feature.${f.k}`)}</h3>
              <p className="mt-2 text-sm text-zinc-400">{t(`home.feature.${f.k}.desc`)}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
