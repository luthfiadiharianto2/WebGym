"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Environment, Html, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { useT } from "@/lib/store/settings";
import {
  Bench,
  DumbbellRack,
  EQUIPMENT_INFO,
  Kettlebells,
  Mats,
  mats,
  PullupBar,
  Rack,
  Treadmill,
  type EquipmentId,
} from "./equipment";

/** Titik kamera per zona: [posisi kamera, target pandang]. */
const ZONES: [THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(-6.5, 2.4, 6.2), new THREE.Vector3(-3.2, 1.1, 0)], // Strength (diframing ke kanan, di samping kartu hero)
  [new THREE.Vector3(7, 2.4, 5.5), new THREE.Vector3(11, 0.9, 0)], // Cardio
  [new THREE.Vector3(17, 2.2, 5.5), new THREE.Vector3(21, 1, 0)], // Functional
  [new THREE.Vector3(27.5, 3.4, 6), new THREE.Vector3(31, 0.2, 0)], // Stretching
];

const posCurve = new THREE.CatmullRomCurve3(ZONES.map((z) => z[0]), false, "centripetal");
const lookCurve = new THREE.CatmullRomCurve3(ZONES.map((z) => z[1]), false, "centripetal");

function CameraRig({ progress, reducedMotion }: { progress: MutableRefObject<number>; reducedMotion: boolean }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const pos = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const p = THREE.MathUtils.clamp(progress.current, 0, 1);
    posCurve.getPoint(p, pos);
    lookCurve.getPoint(p, target);
    if (reducedMotion) {
      camera.position.copy(pos);
      look.current.copy(target);
    } else {
      const k = 1 - Math.exp(-dt * 4);
      camera.position.lerp(pos, k);
      look.current.lerp(target, k);
    }
    camera.lookAt(look.current);
  });
  return null;
}

function Interactive({
  id,
  uid = id,
  position,
  rotation,
  active,
  setActive,
  children,
}: {
  id: EquipmentId;
  uid?: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  active: string | null;
  setActive: (id: string | null) => void;
  children: (hovered: boolean) => React.ReactNode;
}) {
  const { t } = useT();
  const info = EQUIPMENT_INFO[id];
  const hovered = active === uid;
  return (
    <group
      position={position}
      rotation={rotation}
      onPointerOver={(e) => {
        e.stopPropagation();
        setActive(uid);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setActive(null);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        setActive(uid);
      }}
    >
      {children(hovered)}
      {hovered && (
        <Html position={[0, 2.6, 0]} center distanceFactor={9} zIndexRange={[35, 30]} portal={{ current: document.body }}>
          <div className="pointer-events-auto w-56 rounded-xl border border-lime-400/40 bg-black/85 p-3 text-xs text-zinc-200 shadow-[0_0_30px_rgba(163,230,53,0.25)] backdrop-blur">
            <p className="text-sm font-semibold text-lime-300">{t(info.nameKey)}</p>
            <p className="mt-1 text-zinc-400">{t("home.tooltip.targets")}:</p>
            <p>{info.muscles.map((m) => t(`muscle.${m}`)).join(", ")}</p>
            <Link href={`/exercises?equipment=${info.filter}`} className="mt-2 inline-block rounded-lg bg-lime-400 px-3 py-1 font-semibold text-black">
              {t("home.tooltip.view")} →
            </Link>
          </div>
        </Html>
      )}
    </group>
  );
}

function NeonStrip({ position, length, color }: { position: [number, number, number]; length: number; color: "lime" | "cyan" }) {
  return (
    <mesh position={position} material={color === "lime" ? mats.lime : mats.cyan}>
      <boxGeometry args={[length, 0.05, 0.05]} />
    </mesh>
  );
}

function Gym({ active, setActive }: { active: string | null; setActive: (id: string | null) => void }) {
  const props = { active, setActive };
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[14, 0, 0]} receiveShadow>
        <planeGeometry args={[52, 16]} />
        <meshStandardMaterial color="#0b0d11" roughness={0.85} metalness={0.1} />
      </mesh>
      <mesh position={[14, 4, -5]} receiveShadow>
        <boxGeometry args={[52, 8, 0.2]} />
        <meshStandardMaterial color="#0e1116" roughness={0.9} />
      </mesh>
      {[-4, 6, 16, 26].map((x, i) => (
        <NeonStrip key={x} position={[x + 3, 3.2, -4.85]} length={8} color={i % 2 ? "cyan" : "lime"} />
      ))}
      <NeonStrip position={[14, 0.03, 4]} length={50} color="cyan" />

      {/* Zona Strength */}
      <Interactive id="rack" position={[-0.5, 0, -1.5]} {...props}>
        {(h) => <Rack hovered={h} />}
      </Interactive>
      <Interactive id="bench" position={[2.2, 0, 0.5]} rotation={[0, 0.3, 0]} {...props}>
        {(h) => <Bench hovered={h} />}
      </Interactive>
      <Interactive id="dumbbell_rack" position={[-2.5, 0, 1.2]} rotation={[0, 0.6, 0]} {...props}>
        {(h) => <DumbbellRack hovered={h} />}
      </Interactive>

      {/* Zona Cardio */}
      {[9.5, 11, 12.5].map((x, i) => (
        <Interactive key={x} id="treadmill" uid={`treadmill-${i}`} position={[x, 0, -0.5]} {...props}>
          {(h) => <Treadmill hovered={h} />}
        </Interactive>
      ))}

      {/* Zona Functional */}
      <Interactive id="kettlebell" position={[20.5, 0, 1.2]} {...props}>
        {(h) => <Kettlebells hovered={h} />}
      </Interactive>
      <Interactive id="pullup" position={[22, 0, -1.8]} {...props}>
        {(h) => <PullupBar hovered={h} />}
      </Interactive>

      {/* Zona Stretching */}
      <Interactive id="mat" position={[32, 0, 0]} {...props}>
        {(h) => <Mats hovered={h} />}
      </Interactive>
    </group>
  );
}

export interface GymSceneProps {
  progress: MutableRefObject<number>;
  reducedMotion: boolean;
  onReady: () => void;
}

export default function GymScene({ progress, reducedMotion, onReady }: GymSceneProps) {
  const [active, setActive] = useState<string | null>(null);
  const [quality, setQuality] = useState<"high" | "low">("high");
  const frames = useRef(0);

  useEffect(() => () => void (document.body.style.cursor = ""), []);

  return (
    <Canvas
      shadows={quality === "high"}
      dpr={quality === "high" ? [1, 1.75] : [0.75, 1]}
      camera={{ position: ZONES[0][0].toArray(), fov: 50, near: 0.1, far: 80 }}
      gl={{ antialias: quality === "high", powerPreference: "high-performance" }}
      onCreated={({ gl, scene, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.compile(scene, camera);
      }}
      frameloop={reducedMotion ? "demand" : "always"}
      aria-hidden
    >
      <FrameCounter
        onFrame={() => {
          frames.current += 1;
          if (frames.current === (reducedMotion ? 1 : 3)) onReady();
        }}
      />
      <PerformanceMonitor onDecline={() => setQuality("low")} onIncline={() => setQuality("high")} flipflops={3} onFallback={() => setQuality("low")}>
        <AdaptiveDpr pixelated />
      </PerformanceMonitor>
      <color attach="background" args={["#050608"]} />
      <fog attach="fog" args={["#050608", 14, 40]} />
      <hemisphereLight args={["#c7f9ff", "#0b0f14", 1.1]} />
      <ambientLight intensity={0.25} />
      {/* Environment prosedural (tanpa unduhan HDR) agar material metal memantulkan cahaya. */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.5} color="#ffffff" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[40, 6, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#a3e635" position={[-10, 3, 6]} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#22d3ee" position={[30, 3, 6]} scale={[10, 2, 1]} />
      </Environment>
      <directionalLight
        position={[6, 9, 6]}
        intensity={2.2}
        castShadow={quality === "high"}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={40}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      {[0, 11, 21, 31].map((x, i) => (
        <spotLight key={x} position={[x, 5.5, 2.5]} angle={0.7} penumbra={0.6} intensity={40} distance={14} color={i % 2 ? "#cffafe" : "#ecfccb"} />
      ))}
      <pointLight position={[0, 3, 1]} intensity={12} color="#a3e635" distance={10} />
      <pointLight position={[21, 3, 1]} intensity={12} color="#22d3ee" distance={10} />
      <CameraRig progress={progress} reducedMotion={reducedMotion} />
      <Gym active={active} setActive={setActive} />
      {quality === "high" && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.7} luminanceThreshold={0.75} luminanceSmoothing={0.2} mipmapBlur />
          <Vignette eskil={false} offset={0.2} darkness={0.75} />
        </EffectComposer>
      )}
      {reducedMotion && <Invalidator progress={progress} />}
    </Canvas>
  );
}

function FrameCounter({ onFrame }: { onFrame: () => void }) {
  useFrame(onFrame);
  return null;
}

/** Pada mode kurangi-gerakan, render hanya saat progres zona berubah. */
function Invalidator({ progress }: { progress: MutableRefObject<number> }) {
  const { invalidate } = useThree();
  const last = useRef(-1);
  useEffect(() => {
    const id = setInterval(() => {
      if (progress.current !== last.current) {
        last.current = progress.current;
        invalidate();
      }
    }, 120);
    return () => clearInterval(id);
  }, [invalidate, progress]);
  return null;
}
