"use client";
// Umpan balik suara via Web Speech API, dengan throttling agar tidak berisik.
let lastCue = 0;
let lastText = "";

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, locale: "id" | "en", opts: { cue?: boolean; minGapMs?: number } = {}): void {
  if (!voiceSupported()) return;
  const now = Date.now();
  if (opts.cue) {
    if (now - lastCue < (opts.minGapMs ?? 4000) || text === lastText) return;
    lastCue = now;
    lastText = text;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = locale === "en" ? "en-US" : "id-ID";
  u.rate = 1.05;
  if (!opts.cue) window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
