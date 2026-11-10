"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Locale } from "../types";
import { translate, translateReason } from "../i18n";
import type { ReasonRef } from "../types";

interface SettingsState {
  locale: Locale;
  /** null = ikuti preferensi sistem (prefers-reduced-motion). */
  reducedMotionOverride: boolean | null;
  voice: boolean;
  mirror: boolean;
  facingMode: "user" | "environment";
  modelVariant: "lite" | "full";
  setLocale(l: Locale): void;
  setReducedMotion(v: boolean | null): void;
  setVoice(v: boolean): void;
  setMirror(v: boolean): void;
  setFacingMode(v: "user" | "environment"): void;
  setModelVariant(v: "lite" | "full"): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      locale: "id",
      reducedMotionOverride: null,
      voice: false,
      mirror: true,
      facingMode: "user",
      modelVariant: "lite",
      setLocale: (locale) => set({ locale }),
      setReducedMotion: (reducedMotionOverride) => set({ reducedMotionOverride }),
      setVoice: (voice) => set({ voice }),
      setMirror: (mirror) => set({ mirror }),
      setFacingMode: (facingMode) => set({ facingMode }),
      setModelVariant: (modelVariant) => set({ modelVariant }),
    }),
    {
      name: "ironvision-settings",
      skipHydration: true,
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
      }),
    },
  ),
);

/** Status kamera global (tidak dipersistenkan) untuk indikator di header. */
export const useCameraStatus = create<{ active: boolean; setActive(v: boolean): void }>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));

export function useT() {
  const locale = useSettings((s) => s.locale);
  const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
  const tr = (r: ReasonRef) => translateReason(locale, r);
  return { t, tr, locale };
}
