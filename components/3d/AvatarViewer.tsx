"use client";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/store/settings";
import type { AnimationId, Muscle } from "@/lib/types";
import { Avatar } from "./Avatar";
import { detectCapability } from "./webgl";

export interface AvatarViewerProps {
  animation: AnimationId;
  speed?: number;
  playing?: boolean;
  colors?: Partial<Record<Muscle, string>>;
  autoRotate?: boolean;
  label: string;
  className?: string;
  staticPhase?: number;
  showProp?: boolean;
  /** "demand": render hanya saat ada interaksi/perubahan (hemat CPU untuk tampilan statis). */
  frameloop?: "always" | "demand";
  /** Pasang kanvas hanya ketika masuk viewport. */
  lazy?: boolean;
}

/** Kanvas 3D untuk avatar latihan: bisa diputar 360° dengan seret/tombol panah. */
export default function AvatarViewer({
  animation,
  speed = 1,
  playing = true,
  colors,
  autoRotate = false,
  label,
  className = "h-[420px]",
  staticPhase,
  showProp,
  frameloop = "always",
  lazy = false,
}: AvatarViewerProps) {
  const { t } = useT();
  const [ok, setOk] = useState<boolean | null>(null);
  // Rotasi yaw yang bisa dikendalikan keyboard/tombol (alternatif aksesibel untuk seret).
  const [yaw, setYaw] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  useEffect(() => {
    if (!lazy || !wrapRef.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "100px" });
    io.observe(wrapRef.current);
    return () => io.disconnect();
  }, [lazy]);
  const step = Math.PI / 12;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setYaw((y) => y - step);
    else if (e.key === "ArrowRight") setYaw((y) => y + step);
    else if (e.key === "Home") setYaw(0);
    else return;
    e.preventDefault();
  };
  useEffect(() => setOk(detectCapability().webgl), []);

  if (ok === false) {
    return (
      <div className={`${className} grid place-items-center rounded-2xl border border-white/10 bg-zinc-900 text-sm text-zinc-400`} role="img" aria-label={label}>
        WebGL tidak tersedia / WebGL unavailable
      </div>
    );
  }
  return (
    <div
      ref={wrapRef}
      className={`${className} relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black`}
      role="group"
      aria-roledescription="3D viewer"
      aria-label={`${label}. ${t("ex.rotateKeys")}`}
      tabIndex={0}
      onKeyDown={onKey}
      data-testid="avatar-viewer"
      data-yaw={Math.round((yaw * 180) / Math.PI)}
    >
      {ok && visible && (
        <Canvas frameloop={frameloop} shadows dpr={[1, 1.75]} camera={{ position: [2.7, 1.9, 3.5], fov: 40 }} gl={{ antialias: true }}>
          <color attach="background" args={["#07090d"]} />
          <hemisphereLight args={["#e0fbff", "#0b0f14", 1.2]} />
          <Environment resolution={64} frames={1}>
            <Lightformer form="rect" intensity={2} position={[0, 5, 2]} rotation-x={Math.PI / 2} scale={[8, 4, 1]} />
          </Environment>
          <directionalLight position={[3, 5, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
          <pointLight position={[-2, 2, -2]} intensity={6} color="#a3e635" distance={6} />
          <Suspense fallback={null}>
            <group rotation-y={yaw}>
              <Avatar animation={animation} speed={speed} playing={playing} colors={colors} staticPhase={staticPhase} showProp={showProp} />
            </group>
          </Suspense>
          <ContactShadows position={[0, 0, 0]} opacity={0.55} scale={6} blur={2.2} far={3} />
          <gridHelper args={[8, 16, "#164e63", "#0f172a"]} position={[0, 0.001, 0]} />
          <OrbitControls target={[0, 1.05, 0]} enablePan={false} minDistance={2} maxDistance={6} autoRotate={autoRotate} autoRotateSpeed={1.2} makeDefault />
        </Canvas>
      )}
      <div className="absolute bottom-2 right-2 flex gap-1">
        <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setYaw((y) => y - step)} aria-label={t("ex.rotateLeft")} title={t("ex.rotateLeft")}>
          ⟲
        </button>
        <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setYaw(0)} aria-label={t("ex.rotateReset")} title={t("ex.rotateReset")}>
          ⌂
        </button>
        <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setYaw((y) => y + step)} aria-label={t("ex.rotateRight")} title={t("ex.rotateRight")}>
          ⟳
        </button>
      </div>
    </div>
  );
}
