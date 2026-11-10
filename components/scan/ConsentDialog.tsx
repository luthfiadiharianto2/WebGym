"use client";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/store/settings";

/** Dialog persetujuan eksplisit sebelum kamera menyala. */
export function ConsentDialog({ onDecide, onDemo }: { onDecide: (granted: boolean) => void; onDemo: () => void }) {
  const { t } = useT();
  const acceptRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    acceptRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDecide(false);
      if (e.key === "Tab" && dialogRef.current) {
        // Perangkap fokus sederhana di dalam dialog.
        const f = dialogRef.current.querySelectorAll<HTMLElement>("button");
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecide]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-body" className="card max-w-lg border-lime-400/30">
        <h2 id="consent-title" className="text-xl font-bold text-white">
          📷 {t("scan.consent.title")}
        </h2>
        <ul id="consent-body" className="mt-4 space-y-2 text-sm text-zinc-300">
          {[1, 2, 3, 4].map((i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-lime-400">✓</span>
              {t(`scan.consent.body${i}`)}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-zinc-400">⚕ {t("disclaimer.short")}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button ref={acceptRef} type="button" className="btn-primary" onClick={() => onDecide(true)}>
            {t("scan.consent.accept")}
          </button>
          <button type="button" className="btn-secondary" onClick={() => onDecide(false)}>
            {t("scan.consent.decline")}
          </button>
          <button type="button" className="btn-secondary" onClick={onDemo}>
            {t("scan.consent.demo")}
          </button>
        </div>
      </div>
    </div>
  );
}
