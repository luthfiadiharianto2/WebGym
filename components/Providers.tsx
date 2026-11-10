"use client";
import { useEffect } from "react";
import { useSettings } from "@/lib/store/settings";
import { useAuth } from "@/lib/store/auth";
import { useReducedMotion } from "@/lib/useReducedMotion";

export function Providers({ children }: { children: React.ReactNode }) {
  const locale = useSettings((s) => s.locale);
  const reduced = useReducedMotion();

  useEffect(() => {
    void useSettings.persist.rehydrate();
    return useAuth.getState().init();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduced);
  }, [reduced]);

  return <>{children}</>;
}
