/// <reference lib="webworker" />
// Inferensi MediaPipe Pose Landmarker di Web Worker (OffscreenCanvas + GPU delegate bila ada).
// Frame video dikirim sebagai ImageBitmap (transferable) dan TIDAK PERNAH keluar dari perangkat.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

type InitMsg = { type: "init"; wasmBase: string; modelUrl: string; segmentation: boolean };
type DetectMsg = { type: "detect"; bitmap: ImageBitmap; t: number; wantMask: boolean };
type InMsg = InitMsg | DetectMsg | { type: "close" };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let landmarker: PoseLandmarker | null = null;
let lastT = -1;

async function init(msg: InitMsg) {
  const fileset = await FilesetResolver.forVisionTasks(msg.wasmBase);
  const make = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: msg.modelUrl, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: msg.segmentation,
      canvas: typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : undefined,
    });
  let delegate: "GPU" | "CPU" = "GPU";
  try {
    landmarker = await make("GPU");
  } catch {
    delegate = "CPU";
    landmarker = await make("CPU");
  }
  ctx.postMessage({ type: "ready", delegate });
}

function detect(msg: DetectMsg) {
  if (!landmarker) {
    msg.bitmap.close();
    return;
  }
  const t = msg.t <= lastT ? lastT + 1 : msg.t; // timestamp harus naik monoton
  lastT = t;
  const start = performance.now();
  const res = landmarker.detectForVideo(msg.bitmap, t);
  const inferMs = performance.now() - start;
  msg.bitmap.close();
  const lm = res.landmarks[0] ?? null;
  const world = res.worldLandmarks[0] ?? null;
  let mask: { width: number; height: number; data: Float32Array } | null = null;
  if (msg.wantMask && res.segmentationMasks?.[0]) {
    const m = res.segmentationMasks[0];
    mask = { width: m.width, height: m.height, data: m.getAsFloat32Array().slice() };
  }
  res.segmentationMasks?.forEach((m) => m.close());
  const plain = (arr: typeof lm) => (arr ? arr.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) : null);
  ctx.postMessage({ type: "result", t: msg.t, landmarks: plain(lm), world: plain(world), mask, inferMs }, mask ? [mask.data.buffer] : []);
}

ctx.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") await init(msg);
    else if (msg.type === "detect") detect(msg);
    else if (msg.type === "close") {
      landmarker?.close();
      landmarker = null;
    }
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
