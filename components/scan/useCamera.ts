"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCameraStatus } from "@/lib/store/settings";

export type CameraError = "denied" | "notfound" | "inuse" | "insecure" | "unknown";

function mapError(err: unknown): CameraError {
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "notfound";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "inuse";
  return "unknown";
}

/** Mengelola stream kamera: start/stop, error yang dipetakan, dan indikator global "kamera aktif". */
export function useCamera(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [error, setError] = useState<CameraError | null>(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const setGlobal = useCameraStatus((s) => s.setActive);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setGlobal(false);
  }, [setGlobal, videoRef]);

  const start = useCallback(
    async (facingMode: "user" | "environment") => {
      setError(null);
      setStarting(true);
      stop();
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("no mediaDevices"), { name: window.isSecureContext ? "NotFoundError" : "SecurityError" });
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        });
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setActive(true);
        setGlobal(true);
      } catch (err) {
        setError(mapError(err));
      } finally {
        setStarting(false);
      }
    },
    [setGlobal, stop, videoRef],
  );

  useEffect(() => stop, [stop]);

  return { start, stop, error, active, starting };
}
