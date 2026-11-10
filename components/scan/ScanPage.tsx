"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSettings, useT } from "@/lib/store/settings";
import { useRepo } from "@/lib/store/auth";
import { uid } from "@/lib/data/repository";
import { assessQuality, averageLuminance } from "@/lib/pose/quality";
import type { Landmark } from "@/lib/pose/landmarks";
import type { Severity } from "@/lib/pose/profiles";
import { createDemoRunner, createPoseRunner, type PoseRunner } from "@/lib/pose/runner";
import { voiceSupported } from "@/lib/voice";
import { ConsentDialog } from "./ConsentDialog";
import { drawSkeleton } from "./draw";
import { ScanContext, type ProcessedFrame, type ScanCtx } from "./ScanContext";
import { useCamera } from "./useCamera";
import LiveTracking from "./LiveTracking";
import Assessment from "./Assessment";

const CONSENT_KEY = "ironvision:camera-consent:v1";
const CONSENT_VERSION = "1.0";

type Source = "idle" | "camera" | "demo";

export default function ScanPage() {
  const { t } = useT();
  const params = useSearchParams();
  const repo = useRepo();
  const settings = useSettings();
  const [tab, setTab] = useState<"track" | "assess">(params.get("mode") === "assess" ? "assess" : "track");
  const [source, setSource] = useState<Source>("idle");
  const [showConsent, setShowConsent] = useState(false);
  const [runnerState, setRunnerState] = useState<"off" | "loading" | "ready" | "error">("off");
  const [runtime, setRuntime] = useState<string>("");
  const [fps, setFps] = useState(0);
  const [qualityMsg, setQualityMsg] = useState<string[]>([]);
  const [retryNonce, setRetryNonce] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<PoseRunner | null>(null);
  const listeners = useRef(new Set<(f: ProcessedFrame) => void>());
  const jointStatus = useRef<Record<number, Severity>>({});
  const demoKey = useRef("squat");
  const wantMask = useRef(false);
  const brightness = useRef<number | undefined>(undefined);
  const camera = useCamera(videoRef);
  const segmentation = tab === "assess";

  // ------------------------------------------------ persetujuan kamera
  const hasConsent = () => {
    try {
      return sessionStorage.getItem(CONSENT_KEY) === "yes";
    } catch {
      return false;
    }
  };
  const requestCamera = () => {
    if (hasConsent()) {
      setSource("camera");
      void camera.start(settings.facingMode);
    } else setShowConsent(true);
  };
  const onConsent = async (granted: boolean) => {
    setShowConsent(false);
    await repo?.logConsent({ id: uid(), type: "camera", granted, version: CONSENT_VERSION, createdAt: new Date().toISOString() }).catch(() => {});
    if (!granted) return;
    try {
      sessionStorage.setItem(CONSENT_KEY, "yes");
    } catch {}
    setSource("camera");
    void camera.start(settings.facingMode);
  };
  const stopAll = () => {
    camera.stop();
    setSource("idle");
  };

  // ------------------------------------------------ runner (model) lifecycle
  useEffect(() => {
    if (source === "idle" || (source === "camera" && !camera.active)) return;
    let cancelled = false;
    setRunnerState("loading");
    (async () => {
      try {
        const r = source === "demo" ? createDemoRunner(() => demoKey.current) : await createPoseRunner(settings.modelVariant, segmentation);
        if (cancelled) return r.close();
        runnerRef.current = r;
        setRuntime(r.kind === "demo" ? t("scan.runtime.demo") : `${r.kind === "worker" ? t("scan.runtime.worker") : t("scan.runtime.main")} · ${r.delegate}`);
        setRunnerState("ready");
      } catch (err) {
        console.error("[pose] model gagal dimuat", err);
        if (!cancelled) setRunnerState("error");
      }
    })();
    return () => {
      cancelled = true;
      runnerRef.current?.close();
      runnerRef.current = null;
      setRunnerState("off");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, camera.active, settings.modelVariant, segmentation, retryNonce]);

  // ------------------------------------------------ loop inferensi
  useEffect(() => {
    if (runnerState !== "ready") return;
    let stop = false;
    let busy = false;
    let frameCount = 0;
    let fpsEma = 0;
    let lastTs = performance.now();
    let lastQualityUpdate = 0;
    const lumCanvas = document.createElement("canvas");
    lumCanvas.width = 32;
    lumCanvas.height = 18;
    const lumCtx = lumCanvas.getContext("2d", { willReadFrequently: true });

    const tick = async () => {
      if (stop) return;
      const runner = runnerRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const isDemo = runner?.kind === "demo";
      if (runner && canvas && !busy && (isDemo || (video && video.readyState >= 2 && video.videoWidth > 0))) {
        busy = true;
        const now = performance.now();
        try {
          const res = await runner.detect(video!, now, wantMask.current);
          if (stop) return;
          const w = isDemo ? 960 : video!.videoWidth;
          const h = isDemo ? 720 : video!.videoHeight;
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;
          // Pencahayaan (sampling ringan tiap 15 frame).
          if (!isDemo && lumCtx && frameCount % 15 === 0) {
            lumCtx.drawImage(video!, 0, 0, 32, 18);
            brightness.current = averageLuminance(lumCtx.getImageData(0, 0, 32, 18).data, 1);
          }
          const aspect = isDemo ? 1 : w / h;
          const raw = res.landmarks;
          const quality = assessQuality(raw, { brightness: isDemo ? undefined : brightness.current });
          const frame = raw
            ? {
                landmarks: raw.map((l) => ({ x: l.x * aspect, y: l.y, z: (l.z ?? 0) * aspect, visibility: l.visibility })),
                world: res.world,
                t: now,
              }
            : null;
          const pf: ProcessedFrame = { raw, frame, mask: res.mask, quality, t: now };
          listeners.current.forEach((fn) => fn(pf));
          const ctx2d = canvas.getContext("2d");
          if (ctx2d) {
            const disp: Landmark[] | null = raw && isDemo ? raw.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * (h / w) })) : raw;
            drawSkeleton(ctx2d, disp, w, h, jointStatus.current);
          }
          // FPS (EMA)
          const dt = now - lastTs;
          lastTs = now;
          if (dt > 0) fpsEma = fpsEma ? fpsEma * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
          frameCount++;
          if (now - lastQualityUpdate > 400) {
            lastQualityUpdate = now;
            setFps(Math.round(fpsEma));
            setQualityMsg(quality.issues);
          }
        } finally {
          busy = false;
        }
      }
      schedule();
    };
    const schedule = () => {
      if (stop) return;
      const v = videoRef.current as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }) | null;
      if (runnerRef.current?.kind !== "demo" && v?.requestVideoFrameCallback) v.requestVideoFrameCallback(() => void tick());
      else requestAnimationFrame(() => void tick());
    };
    schedule();
    return () => {
      stop = true;
    };
  }, [runnerState]);

  const ctx: ScanCtx = useMemo(
    () => ({
      subscribe: (fn) => {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
      setJointStatus: (s) => (jointStatus.current = s),
      setDemoKey: (k) => (demoKey.current = k),
      setWantMask: (v) => (wantMask.current = v),
      captureFrame: async () => {
        const v = videoRef.current;
        if (!v || !v.videoWidth || source !== "camera") return null;
        const c = document.createElement("canvas");
        const scale = Math.min(1, 720 / v.videoHeight);
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
        return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.85));
      },
      isDemo: source === "demo",
      running: runnerState === "ready",
    }),
    [source, runnerState],
  );

  const mirrored = settings.mirror && source === "camera";
  const errorKey = camera.error ? `scan.error.${camera.error}` : runnerState === "error" ? "scan.error.model" : null;

  return (
    <ScanContext.Provider value={ctx}>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-3xl font-bold text-white">{t("scan.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">🔒 {t("scan.subtitle")}</p>

        <div role="tablist" aria-label={t("scan.title")} className="mt-5 inline-flex rounded-xl border border-white/10 bg-zinc-950 p-1">
          {(["track", "assess"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`panel-${k}`}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? "bg-lime-400 text-black" : "text-zinc-300 hover:text-white"}`}
            >
              {k === "track" ? `A · ${t("scan.modeA")}` : `B · ${t("scan.modeB")}`}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          {/* Panel kamera */}
          <div>
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
              <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-contain ${mirrored ? "-scale-x-100" : ""} ${source === "camera" ? "" : "hidden"}`} />
              <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full object-contain ${mirrored ? "-scale-x-100" : ""}`} aria-label="Pose skeleton overlay" role="img" />
              {tab === "assess" && <div id="guide-slot" className="pointer-events-none absolute inset-0" />}
              {source === "idle" && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center">
                  <div>
                    <p className="text-sm text-zinc-400">{t("scan.placement")}</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-3">
                      <button type="button" className="btn-primary" onClick={requestCamera} disabled={camera.starting}>
                        ◉ {t("scan.camera.start")}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setSource("demo")} data-testid="demo-button">
                        {t("scan.consent.demo")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {runnerState === "loading" && (
                <div className="absolute inset-0 grid place-items-center bg-black/70" role="status">
                  <p className="animate-pulse text-sm text-cyan-300">{t("scan.loadingModel")}</p>
                </div>
              )}
              {errorKey && (
                <div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center" role="alert">
                  <div>
                    <p className="text-sm text-red-300">{t(errorKey)}</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <button type="button" className="btn-secondary" onClick={() => (camera.error ? requestCamera() : setRetryNonce((n) => n + 1))}>
                        {t("scan.retry")}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => { camera.stop(); setSource("demo"); }}>
                        {t("scan.consent.demo")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {runnerState === "ready" && (
                <div className="absolute left-2 top-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded bg-black/70 px-2 py-0.5 font-mono text-lime-300">{t("scan.fps", { fps })}</span>
                  <span className="rounded bg-black/70 px-2 py-0.5 text-zinc-300">{runtime}</span>
                  {source === "camera" && (
                    <span className="rounded bg-red-600/80 px-2 py-0.5 font-semibold text-white">● REC — on-device</span>
                  )}
                </div>
              )}
            </div>

            {runnerState === "ready" && (
              <p
                role="status"
                aria-live="polite"
                className={`mt-2 rounded-xl px-3 py-2 text-sm ${qualityMsg.length ? "bg-yellow-500/10 text-yellow-200" : "bg-lime-500/10 text-lime-200"}`}
              >
                {qualityMsg.length ? qualityMsg.map((q) => t(`scan.quality.${q}`)).join(" ") : `✓ ${t("scan.quality.ok")}`}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {source !== "idle" && (
                <button type="button" className="btn-danger" onClick={stopAll}>
                  ■ {source === "camera" ? t("scan.camera.stop") : t("common.stop")}
                </button>
              )}
              <label className="flex items-center gap-2 text-zinc-300">
                <span className="sr-only">{t("scan.camera.front")}</span>
                <select
                  className="input w-auto"
                  value={settings.facingMode}
                  onChange={(e) => {
                    const f = e.target.value as "user" | "environment";
                    settings.setFacingMode(f);
                    if (source === "camera") void camera.start(f);
                  }}
                >
                  <option value="user">{t("scan.camera.front")}</option>
                  <option value="environment">{t("scan.camera.back")}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-zinc-300">
                <input type="checkbox" checked={settings.mirror} onChange={(e) => settings.setMirror(e.target.checked)} />
                {t("scan.camera.mirror")}
              </label>
              <label className="flex items-center gap-2 text-zinc-300">
                {t("scan.model")}
                <select className="input w-auto" value={settings.modelVariant} onChange={(e) => settings.setModelVariant(e.target.value as "lite" | "full")}>
                  <option value="lite">{t("scan.model.lite")}</option>
                  <option value="full">{t("scan.model.full")}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-zinc-300" title={voiceSupported() ? undefined : t("scan.voice.unsupported")}>
                <input type="checkbox" checked={settings.voice} onChange={(e) => settings.setVoice(e.target.checked)} disabled={typeof window !== "undefined" && !voiceSupported()} />
                🔊 {t("scan.voice")}
              </label>
            </div>
          </div>

          {/* Panel mode */}
          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === "track" ? <LiveTracking /> : <Assessment />}
          </div>
        </div>
        <p className="mt-6 text-xs text-zinc-500">⚕ {t("disclaimer.short")}</p>
      </div>
      {showConsent && <ConsentDialog onDecide={onConsent} onDemo={() => { setShowConsent(false); setSource("demo"); }} />}
    </ScanContext.Provider>
  );
}
