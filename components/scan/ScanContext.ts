"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import type { Landmark, PoseFrame } from "@/lib/pose/landmarks";
import type { SegMask } from "@/lib/pose/posture";
import type { QualityReport } from "@/lib/pose/quality";
import type { Severity } from "@/lib/pose/profiles";

export interface ProcessedFrame {
  /** Landmark mentah 0..1 (untuk kualitas, proporsi, overlay). */
  raw: Landmark[] | null;
  /** Frame aspek-terkoreksi untuk mesin pose. */
  frame: PoseFrame | null;
  mask: SegMask | null;
  quality: QualityReport;
  t: number;
}

export interface ScanCtx {
  subscribe(fn: (f: ProcessedFrame) => void): () => void;
  setJointStatus(s: Record<number, Severity>): void;
  setDemoKey(k: string): void;
  setWantMask(v: boolean): void;
  captureFrame(): Promise<Blob | null>;
  isDemo: boolean;
  running: boolean;
}

export const ScanContext = createContext<ScanCtx | null>(null);

export function useScan(): ScanCtx {
  const c = useContext(ScanContext);
  if (!c) throw new Error("useScan di luar ScanContext");
  return c;
}

/** Berlangganan frame pose tanpa memicu re-render tiap frame. */
export function useFrames(fn: (f: ProcessedFrame) => void): void {
  const { subscribe } = useScan();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe((f) => ref.current(f)), [subscribe]);
}
