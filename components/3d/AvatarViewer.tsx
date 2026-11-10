"use client";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useState } from "react";
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
}: AvatarViewerProps) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => setOk(detectCapability().webgl), []);

  if (ok === false) {
    return (
      <div className={`${className} grid place-items-center rounded-2xl border border-white/10 bg-zinc-900 text-sm text-zinc-400`} role="img" aria-label={label}>
        WebGL tidak tersedia / WebGL unavailable
      </div>
    );
  }
  return (
    <div className={`${className} relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black`} role="img" aria-label={label}>
      {ok && (
        <Canvas shadows dpr={[1, 1.75]} camera={{ position: [2.7, 1.9, 3.5], fov: 40 }} gl={{ antialias: true }}>
          <color attach="background" args={["#07090d"]} />
          <hemisphereLight args={["#e0fbff", "#0b0f14", 1.2]} />
          <Environment resolution={64} frames={1}>
            <Lightformer form="rect" intensity={2} position={[0, 5, 2]} rotation-x={Math.PI / 2} scale={[8, 4, 1]} />
          </Environment>
          <directionalLight position={[3, 5, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
          <pointLight position={[-2, 2, -2]} intensity={6} color="#a3e635" distance={6} />
          <Suspense fallback={null}>
            <Avatar animation={animation} speed={speed} playing={playing} colors={colors} staticPhase={staticPhase} showProp={showProp} />
          </Suspense>
          <ContactShadows position={[0, 0, 0]} opacity={0.55} scale={6} blur={2.2} far={3} />
          <gridHelper args={[8, 16, "#164e63", "#0f172a"]} position={[0, 0.001, 0]} />
          <OrbitControls target={[0, 1.05, 0]} enablePan={false} minDistance={2} maxDistance={6} autoRotate={autoRotate} autoRotateSpeed={1.2} makeDefault />
        </Canvas>
      )}
    </div>
  );
}
