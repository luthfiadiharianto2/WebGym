"use client";

export interface DeviceCapability {
  webgl: boolean;
  weak: boolean;
}

/** Deteksi dukungan WebGL & perangkat lemah (untuk fallback gambar statis). */
export function detectCapability(): DeviceCapability {
  if (typeof window === "undefined") return { webgl: false, weak: true };
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const weak =
    (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) ||
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) ||
    nav.connection?.saveData === true ||
    new URLSearchParams(window.location.search).has("lite");
  return { webgl, weak };
}
