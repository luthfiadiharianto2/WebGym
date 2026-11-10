"use client";
// Pelaksana inferensi pose: Web Worker (utama), main thread (fallback), atau demo sintetis.
import type { Landmark } from "./landmarks";
import type { SegMask } from "./posture";
import { frontViewPose, pushupPose, sideViewPose, toImage } from "./synthetic";

export interface PoseResult {
  /** Landmark ternormalisasi mentah (0..1). */
  landmarks: Landmark[] | null;
  world: Landmark[] | null;
  mask: SegMask | null;
  inferMs: number;
}

export interface PoseRunner {
  kind: "worker" | "main" | "demo";
  delegate?: string;
  detect(source: HTMLVideoElement, t: number, wantMask: boolean): Promise<PoseResult>;
  close(): void;
}

export type ModelVariant = "lite" | "full";

export function modelUrl(variant: ModelVariant): string {
  const base = process.env.NEXT_PUBLIC_MEDIAPIPE_MODEL_BASE;
  if (base) return `${base.replace(/\/$/, "")}/pose_landmarker_${variant}.task`;
  return `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/1/pose_landmarker_${variant}.task`;
}

function wasmBase(): string {
  const base = process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_URL || "/mediapipe/wasm";
  return base.startsWith("http") ? base : new URL(base, window.location.origin).toString();
}

// ------------------------------------------------------------ Worker

class WorkerRunner implements PoseRunner {
  kind = "worker" as const;
  delegate = "GPU";
  private pending: ((r: PoseResult) => void) | null = null;
  constructor(private worker: Worker) {
    worker.onmessage = (e) => {
      if (e.data.type === "result" && this.pending) {
        const cb = this.pending;
        this.pending = null;
        cb({ landmarks: e.data.landmarks, world: e.data.world, mask: e.data.mask, inferMs: e.data.inferMs });
      } else if (e.data.type === "error" && this.pending) {
        const cb = this.pending;
        this.pending = null;
        cb({ landmarks: null, world: null, mask: null, inferMs: 0 });
      }
    };
  }
  async detect(video: HTMLVideoElement, t: number, wantMask: boolean): Promise<PoseResult> {
    const bitmap = await createImageBitmap(video);
    return new Promise((resolve) => {
      this.pending = resolve;
      this.worker.postMessage({ type: "detect", bitmap, t, wantMask }, [bitmap]);
    });
  }
  close() {
    this.worker.postMessage({ type: "close" });
    this.worker.terminate();
  }
}

async function createWorkerRunner(variant: ModelVariant, segmentation: boolean): Promise<PoseRunner> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    throw new Error("worker_unsupported");
  }
  const worker = new Worker(new URL("../../workers/pose.worker.ts", import.meta.url));
  const delegate = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("worker_timeout")), 30_000);
    worker.onmessage = (e) => {
      if (e.data.type === "ready") {
        clearTimeout(timer);
        resolve(e.data.delegate);
      } else if (e.data.type === "error") {
        clearTimeout(timer);
        reject(new Error(e.data.message));
      }
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error(e.message || "worker_error"));
    };
    worker.postMessage({ type: "init", wasmBase: wasmBase(), modelUrl: modelUrl(variant), segmentation });
  }).catch((err) => {
    worker.terminate();
    throw err;
  });
  const runner = new WorkerRunner(worker);
  runner.delegate = delegate;
  return runner;
}

// ------------------------------------------------------------ Main thread

async function createMainRunner(variant: ModelVariant, segmentation: boolean): Promise<PoseRunner> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(wasmBase());
  const make = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelUrl(variant), delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      outputSegmentationMasks: segmentation,
    });
  let delegate = "GPU";
  let lm;
  try {
    lm = await make("GPU");
  } catch {
    delegate = "CPU";
    lm = await make("CPU");
  }
  let lastT = -1;
  return {
    kind: "main",
    delegate,
    async detect(video, t, wantMask) {
      const ts = t <= lastT ? lastT + 1 : t;
      lastT = ts;
      const start = performance.now();
      const res = lm.detectForVideo(video, ts);
      const inferMs = performance.now() - start;
      let mask: SegMask | null = null;
      if (wantMask && res.segmentationMasks?.[0]) {
        const m = res.segmentationMasks[0];
        mask = { width: m.width, height: m.height, data: m.getAsFloat32Array().slice() };
      }
      res.segmentationMasks?.forEach((m) => m.close());
      return { landmarks: res.landmarks[0] ?? null, world: res.worldLandmarks[0] ?? null, mask, inferMs };
    },
    close() {
      lm.close();
    },
  };
}

/** Membuat runner: coba Worker dulu, lalu fallback ke main thread. */
export async function createPoseRunner(variant: ModelVariant, segmentation: boolean): Promise<PoseRunner> {
  try {
    return await createWorkerRunner(variant, segmentation);
  } catch (err) {
    console.warn("[pose] Worker tidak tersedia, fallback ke main thread:", err);
    return createMainRunner(variant, segmentation);
  }
}

// ------------------------------------------------------------ Demo (tanpa kamera)

/** Pose sintetis berparameter s ∈ [0,1] untuk tiap profil pelacakan. */
function demoPose(profile: string, s: number): Landmark[] {
  switch (profile) {
    case "pushup":
    case "plank":
      return pushupPose(profile === "plank" ? 170 : 165 - 85 * s, 0);
    case "curl":
      return sideViewPose({ elbow: 170 - 130 * s });
    case "row":
      return sideViewPose({ knee: 160, torsoLean: 55, shoulderFlex: 60 - 40 * s, elbow: 165 - 85 * s });
    case "ohp":
      return frontViewPose({ armAbduction: 90 + 80 * s });
    case "lateral_raise":
      return frontViewPose({ armAbduction: 15 + 75 * s });
    case "jumping_jack":
      return frontViewPose({ armAbduction: 20 + 140 * s });
    case "hinge":
      return sideViewPose({ knee: 165, torsoLean: 75 * s });
    case "tricep_ext":
      return sideViewPose({ shoulderFlex: 170, elbow: 160 - 100 * s });
    case "calf_raise":
      return sideViewPose({ heelLift: 0.06 * s });
    case "assess:front":
      return frontViewPose({ shoulderTiltDeg: 2.5, pelvicTiltDeg: 1 });
    case "assess:side":
      return sideViewPose({ headForward: 0.07 });
    case "assess:ohs":
      return sideViewPose({ knee: 172 - 80 * s, torsoLean: 38 * s, shoulderFlex: 160, elbow: 178 });
    case "assess:reach":
      return sideViewPose({ shoulderFlex: 20 + 140 * s, elbow: 178 });
    case "assess:toe":
      return sideViewPose({ torsoLean: 95 * s, shoulderFlex: 10 });
    default:
      return sideViewPose({ knee: 172 - 87 * s });
  }
}

export function createDemoRunner(getKey: () => string): PoseRunner {
  const startT = performance.now();
  return {
    kind: "demo",
    async detect(_v, t) {
      const elapsed = (t - startT) / 1000;
      const rep = 2.4;
      const phase = (elapsed % (rep + 0.8)) / rep;
      const s = phase <= 1 ? (1 - Math.cos(phase * 2 * Math.PI)) / 2 : 0;
      const world = demoPose(getKey(), s);
      return { landmarks: toImage(world), world, mask: null, inferMs: 0.1 };
    },
    close() {},
  };
}
