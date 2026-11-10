"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCameraStatus, useSettings, useT } from "@/lib/store/settings";
import { useAuth } from "@/lib/store/auth";
import { useReducedMotion } from "@/lib/useReducedMotion";

const NAV = [
  { href: "/", key: "nav.home" },
  { href: "/exercises", key: "nav.exercises" },
  { href: "/scan", key: "nav.scan" },
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/plan", key: "nav.plan" },
  { href: "/profile", key: "nav.profile" },
];

export function Header() {
  const { t, locale } = useT();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const setLocale = useSettings((s) => s.setLocale);
  const setReduced = useSettings((s) => s.setReducedMotion);
  const reduced = useReducedMotion();
  const cameraOn = useCameraStatus((s) => s.active);
  const user = useAuth((s) => s.user);
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-lime-400 focus:px-3 focus:py-2 focus:text-black">
        {t("nav.skip")}
      </a>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-white" aria-label="IronVision 3D">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-lime-400 text-xs font-black text-black">IV</span>
          <span className="hidden sm:inline">
            IronVision<span className="text-lime-400"> 3D</span>
          </span>
        </Link>

        <nav aria-label={t("nav.menu")} className="ml-4 hidden md:block">
          <ul className="flex gap-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${isActive(n.href) ? "bg-white/10 text-lime-300" : "text-zinc-300 hover:text-white"}`}
                >
                  {t(n.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {cameraOn && (
            <span role="status" className="flex items-center gap-1.5 rounded-full border border-red-500/50 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300">
              <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              {t("camera.active")}
            </span>
          )}
          <button
            type="button"
            onClick={() => setReduced(!reduced)}
            aria-pressed={reduced}
            className="hidden rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 sm:block"
            title={t("nav.reducedMotion")}
          >
            {reduced ? "◼" : "▶"} <span className="sr-only lg:not-sr-only">{t("nav.reducedMotion")}</span>
          </button>
          <label className="sr-only" htmlFor="lang-select">
            {t("nav.language")}
          </label>
          <select
            id="lang-select"
            value={locale}
            onChange={(e) => setLocale(e.target.value as "id" | "en")}
            className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
          >
            <option value="id">ID</option>
            <option value="en">EN</option>
          </select>
          {!user && (
            <Link href="/login" className="hidden rounded-lg bg-lime-400 px-3 py-1.5 text-xs font-semibold text-black sm:block">
              {t("common.signIn")}
            </Link>
          )}
          <button
            type="button"
            className="rounded-lg border border-white/10 p-2 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={t("nav.menu")}
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden className="block h-0.5 w-5 bg-white" />
            <span aria-hidden className="mt-1 block h-0.5 w-5 bg-white" />
            <span aria-hidden className="mt-1 block h-0.5 w-5 bg-white" />
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label={t("nav.menu")} className="border-t border-white/10 md:hidden">
          <ul className="grid grid-cols-2 gap-1 p-3">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm ${isActive(n.href) ? "bg-white/10 text-lime-300" : "text-zinc-300"}`}
                >
                  {t(n.key)}
                </Link>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => setReduced(!reduced)} aria-pressed={reduced} className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-300">
                {t("nav.reducedMotion")}: {reduced ? t("common.yes") : t("common.no")}
              </button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  const { t } = useT();
  const user = useAuth((s) => s.user);
  return (
    <footer className="mt-16 border-t border-white/10 py-8 text-center text-xs text-zinc-500">
      <p className="mx-auto max-w-2xl px-4">⚕ {t("disclaimer.short")}</p>
      {!user && <p className="mt-2">{t("common.guestMode")}</p>}
      <p className="mt-2">© {new Date().getFullYear()} IronVision 3D</p>
    </footer>
  );
}
