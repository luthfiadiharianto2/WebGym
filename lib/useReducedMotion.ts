"use client";
import { useEffect, useState } from "react";
import { useSettings } from "./store/settings";

/** Menggabungkan preferensi sistem (prefers-reduced-motion) dengan override pengguna. */
export function useReducedMotion(): boolean {
  const override = useSettings((s) => s.reducedMotionOverride);
  const [system, setSystem] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystem(mq.matches);
    const fn = (e: MediaQueryListEvent) => setSystem(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return override ?? system;
}
