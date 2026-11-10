import { en, id, type DictKey } from "./dictionaries";
import type { Locale, LocalizedText, ReasonRef } from "../types";

export type { DictKey };

export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const dict = locale === "en" ? en : id;
  let s: string = (dict as Record<string, string | undefined>)[key] ?? (id as Record<string, string>)[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

export function localized(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.id;
}

/** Menerjemahkan alasan rekomendasi; parameter berawalan "@" diterjemahkan sebagai kunci. */
export function translateReason(locale: Locale, r: ReasonRef): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r.params ?? {})) {
    params[k] = typeof v === "string" && v.startsWith("@") ? translate(locale, v.slice(1)) : v;
  }
  return translate(locale, r.key, params);
}
