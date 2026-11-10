import { Suspense } from "react";
import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = { title: "AI Camera Scan" };

// Halaman scan (MediaPipe, kamera) dimuat hanya di klien.
const ScanPage = dynamic(() => import("@/components/scan/ScanPage"));

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-10 text-zinc-500">…</div>}>
      <ScanPage />
    </Suspense>
  );
}
