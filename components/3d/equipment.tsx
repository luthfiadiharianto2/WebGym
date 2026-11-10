"use client";
// Alat gym low-poly prosedural. Objek berulang memakai InstancedMesh untuk menekan draw call.
// Untuk memakai model glTF (Draco/meshopt), lihat README → "Mengganti aset 3D".
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export { EQUIPMENT_INFO, type EquipmentId } from "./equipmentInfo";

export const mats = {
  metal: new THREE.MeshStandardMaterial({ color: "#2b313c", metalness: 0.8, roughness: 0.3 }),
  dark: new THREE.MeshStandardMaterial({ color: "#14171d", metalness: 0.2, roughness: 0.7 }),
  rubber: new THREE.MeshStandardMaterial({ color: "#0d0f13", roughness: 0.95 }),
  lime: new THREE.MeshStandardMaterial({ color: "#a3e635", emissive: "#a3e635", emissiveIntensity: 1.6, toneMapped: false }),
  cyan: new THREE.MeshStandardMaterial({ color: "#22d3ee", emissive: "#22d3ee", emissiveIntensity: 1.6, toneMapped: false }),
  pad: new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.8 }),
  mat: new THREE.MeshStandardMaterial({ color: "#155e75", roughness: 0.95 }),
};

const highlight = (hovered: boolean) => (hovered ? mats.lime : mats.metal);

export function Rack({ hovered }: { hovered: boolean }) {
  const frame = highlight(hovered);
  return (
    <group>
      {[-0.6, 0.6].map((x) =>
        [-0.5, 0.5].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.1, z]} material={frame} castShadow>
            <boxGeometry args={[0.07, 2.2, 0.07]} />
          </mesh>
        )),
      )}
      <mesh position={[0, 2.2, 0]} material={frame} castShadow>
        <boxGeometry args={[1.3, 0.07, 1.07]} />
      </mesh>
      {/* Barbel + piringan */}
      <group position={[0, 1.4, 0.5]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={mats.metal} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 2.1, 10]} />
        </mesh>
        {[-0.85, 0.85].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.rubber} castShadow>
            <cylinderGeometry args={[0.23, 0.23, 0.06, 24]} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0.02, 0]} material={mats.dark} receiveShadow>
        <boxGeometry args={[2.2, 0.04, 2]} />
      </mesh>
    </group>
  );
}

export function Bench({ hovered }: { hovered: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} material={mats.pad} castShadow>
        <boxGeometry args={[0.35, 0.1, 1.3]} />
      </mesh>
      {[-0.5, 0.5].map((z) => (
        <mesh key={z} position={[0, 0.2, z]} material={highlight(hovered)} castShadow>
          <boxGeometry args={[0.3, 0.4, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/** Rak dumbel: 10 pasang dumbel sebagai satu InstancedMesh per bagian. */
export function DumbbellRack({ hovered }: { hovered: boolean }) {
  const heads = useRef<THREE.InstancedMesh>(null);
  const handles = useRef<THREE.InstancedMesh>(null);
  const count = 20;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
    let hi = 0;
    for (let i = 0; i < count; i++) {
      const row = i < 10 ? 0 : 1;
      const x = -1.1 + (i % 10) * 0.25;
      const y = row === 0 ? 0.55 : 0.95;
      const size = 0.06 + (i % 10) * 0.006;
      handles.current?.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, 0), q, new THREE.Vector3(1, 1, 1)));
      for (const dx of [-0.09, 0.09]) {
        heads.current?.setMatrixAt(hi++, m.compose(new THREE.Vector3(x + dx, y, 0), q, new THREE.Vector3(size / 0.08, 1, size / 0.08)));
      }
    }
    if (heads.current) heads.current.instanceMatrix.needsUpdate = true;
    if (handles.current) handles.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <instancedMesh ref={handles} args={[undefined, undefined, count]} material={mats.metal} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.22, 6]} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, count * 2]} material={mats.rubber} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.05, 8]} />
      </instancedMesh>
      {[0.45, 0.85].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={highlight(hovered)}>
          <boxGeometry args={[2.7, 0.04, 0.4]} />
        </mesh>
      ))}
      {[-1.3, 1.3].map((x) => (
        <mesh key={x} position={[x, 0.5, 0]} material={mats.metal}>
          <boxGeometry args={[0.05, 1, 0.4]} />
        </mesh>
      ))}
    </group>
  );
}

export function Treadmill({ hovered }: { hovered: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.12, 0]} material={mats.dark} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.2, 1.9]} />
      </mesh>
      <mesh position={[0, 0.23, 0]} material={mats.rubber}>
        <boxGeometry args={[0.6, 0.02, 1.7]} />
      </mesh>
      {[-0.38, 0.38].map((x) => (
        <mesh key={x} position={[x, 0.7, -0.8]} material={highlight(hovered)}>
          <boxGeometry args={[0.05, 1.0, 0.05]} />
        </mesh>
      ))}
      <mesh position={[0, 1.2, -0.85]} rotation={[-0.4, 0, 0]} material={mats.dark}>
        <boxGeometry args={[0.8, 0.3, 0.06]} />
      </mesh>
      <mesh position={[0, 1.21, -0.82]} rotation={[-0.4, 0, 0]} material={mats.cyan}>
        <planeGeometry args={[0.5, 0.15]} />
      </mesh>
    </group>
  );
}

/** Kettlebell berjajar dengan instancing (badan + gagang). */
export function Kettlebells({ hovered }: { hovered: boolean }) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const handles = useRef<THREE.InstancedMesh>(null);
  const count = 8;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < count; i++) {
      const s = 0.8 + i * 0.07;
      const pos = new THREE.Vector3(-1.4 + i * 0.4, 0.13 * s, 0);
      bodies.current?.setMatrixAt(i, m.compose(pos, q, new THREE.Vector3(s, s, s)));
      handles.current?.setMatrixAt(i, m.compose(pos.clone().setY(0.28 * s), q, new THREE.Vector3(s, s, s)));
    }
    if (bodies.current) bodies.current.instanceMatrix.needsUpdate = true;
    if (handles.current) handles.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, count]} material={hovered ? mats.lime : mats.rubber} castShadow>
        <sphereGeometry args={[0.13, 12, 10]} />
      </instancedMesh>
      <instancedMesh ref={handles} args={[undefined, undefined, count]} material={mats.metal} castShadow>
        <torusGeometry args={[0.07, 0.015, 6, 12, Math.PI]} />
      </instancedMesh>
    </group>
  );
}

export function PullupBar({ hovered }: { hovered: boolean }) {
  return (
    <group>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 1.2, 0]} material={mats.metal} castShadow>
          <boxGeometry args={[0.08, 2.4, 0.08]} />
        </mesh>
      ))}
      <mesh position={[0, 2.35, 0]} rotation={[0, 0, Math.PI / 2]} material={highlight(hovered)}>
        <cylinderGeometry args={[0.025, 0.025, 1.5, 10]} />
      </mesh>
    </group>
  );
}

/** Matras peregangan (instanced). */
export function Mats({ hovered }: { hovered: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 6;
  const geom = useMemo(() => new THREE.BoxGeometry(0.75, 0.02, 1.8), []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m.makeTranslation(-2 + (i % 3) * 1.1, 0.01, i < 3 ? -1.2 : 1.2);
      ref.current?.setMatrixAt(i, m);
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, []);
  return <instancedMesh ref={ref} args={[geom, undefined, count]} material={hovered ? mats.lime : mats.mat} receiveShadow />;
}
