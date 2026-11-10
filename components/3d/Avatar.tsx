"use client";
// Avatar humanoid prosedural dengan hierarki sendi (rig) + overlay otot yang bisa diwarnai.
// Untuk mengganti dengan model glTF ber-rig (mis. dari Mixamo), lihat README → "Mengganti aset 3D".
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { AnimationId, Muscle } from "@/lib/types";
import { CLIPS, samplePose, type Pose } from "./animations";

const DEG = Math.PI / 180;

type JointName =
  | "pelvis" | "spine" | "chest" | "neck" | "head"
  | "lShoulder" | "rShoulder" | "lElbow" | "rElbow" | "lWrist" | "rWrist"
  | "lHip" | "rHip" | "lKnee" | "rKnee" | "lAnkle" | "rAnkle";

interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  joints: Record<JointName, THREE.Group>;
  overlays: Map<Muscle, THREE.Mesh[]>;
  effectors: THREE.Object3D[];
  hands: THREE.Object3D[];
  baseMat: THREE.MeshStandardMaterial;
  idleMat: THREE.MeshStandardMaterial;
  muscleMats: Map<Muscle, THREE.MeshStandardMaterial>;
  dispose(): void;
}

function capsule(radius: number, length: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat);
  m.position.y = -length / 2 - radius * 0.2;
  m.castShadow = true;
  return m;
}

function ellipsoid(sx: number, sy: number, sz: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

function buildRig(): Rig {
  const baseMat = new THREE.MeshStandardMaterial({ color: "#2a2f3a", roughness: 0.55, metalness: 0.15 });
  const idleMat = new THREE.MeshStandardMaterial({ color: "#3d4452", roughness: 0.5, metalness: 0.1 });
  const muscleMats = new Map<Muscle, THREE.MeshStandardMaterial>();
  const overlays = new Map<Muscle, THREE.Mesh[]>();
  const effectors: THREE.Object3D[] = [];
  const hands: THREE.Object3D[] = [];
  const g = () => new THREE.Group();
  const J = {} as Record<JointName, THREE.Group>;

  const muscle = (m: Muscle, parent: THREE.Object3D, mesh: THREE.Mesh) => {
    let mat = muscleMats.get(m);
    if (!mat) {
      mat = idleMat.clone();
      muscleMats.set(m, mat);
    }
    mesh.material = mat;
    parent.add(mesh);
    overlays.set(m, [...(overlays.get(m) ?? []), mesh]);
  };
  const at = (mesh: THREE.Mesh, x: number, y: number, z: number) => {
    mesh.position.set(x, y, z);
    return mesh;
  };

  const root = g();
  const body = g();
  root.add(body);
  J.pelvis = g();
  body.add(J.pelvis);
  J.pelvis.add(at(ellipsoid(0.16, 0.1, 0.11, baseMat), 0, 0, 0));
  muscle("glutes", J.pelvis, at(ellipsoid(0.15, 0.09, 0.06, baseMat), 0, -0.03, -0.08));
  muscle("hip_flexors", J.pelvis, at(ellipsoid(0.12, 0.06, 0.04, baseMat), 0, -0.02, 0.08));

  J.spine = g();
  J.spine.position.y = 0.08;
  J.pelvis.add(J.spine);
  J.spine.add(at(ellipsoid(0.14, 0.14, 0.1, baseMat), 0, 0.12, 0));
  muscle("abs", J.spine, at(ellipsoid(0.09, 0.13, 0.04, baseMat), 0, 0.1, 0.075));
  muscle("obliques", J.spine, at(ellipsoid(0.04, 0.1, 0.07, baseMat), 0.12, 0.1, 0.02));
  muscle("obliques", J.spine, at(ellipsoid(0.04, 0.1, 0.07, baseMat), -0.12, 0.1, 0.02));
  muscle("lower_back", J.spine, at(ellipsoid(0.1, 0.11, 0.04, baseMat), 0, 0.1, -0.08));

  J.chest = g();
  J.chest.position.y = 0.24;
  J.spine.add(J.chest);
  J.chest.add(at(ellipsoid(0.19, 0.17, 0.12, baseMat), 0, 0.12, 0));
  muscle("chest", J.chest, at(ellipsoid(0.08, 0.06, 0.04, baseMat), 0.08, 0.16, 0.1));
  muscle("chest", J.chest, at(ellipsoid(0.08, 0.06, 0.04, baseMat), -0.08, 0.16, 0.1));
  muscle("upper_back", J.chest, at(ellipsoid(0.14, 0.09, 0.04, baseMat), 0, 0.2, -0.1));
  muscle("lats", J.chest, at(ellipsoid(0.06, 0.12, 0.05, baseMat), 0.12, 0.06, -0.07));
  muscle("lats", J.chest, at(ellipsoid(0.06, 0.12, 0.05, baseMat), -0.12, 0.06, -0.07));

  J.neck = g();
  J.neck.position.y = 0.3;
  J.chest.add(J.neck);
  muscle("neck", J.neck, at(ellipsoid(0.05, 0.06, 0.05, baseMat), 0, 0.04, 0));
  J.head = g();
  J.head.position.y = 0.09;
  J.neck.add(J.head);
  const head = at(ellipsoid(0.1, 0.12, 0.11, baseMat), 0, 0.08, 0.01);
  J.head.add(head);
  // Visor neon (memberi arah hadap, tanpa fitur wajah).
  const visor = at(ellipsoid(0.08, 0.025, 0.04, new THREE.MeshStandardMaterial({ color: "#22d3ee", emissive: "#22d3ee", emissiveIntensity: 1.2 })), 0, 0.1, 0.09);
  J.head.add(visor);
  effectors.push(head);

  for (const side of ["l", "r"] as const) {
    const s = side === "l" ? 1 : -1;
    // Lengan
    const sh = g();
    sh.position.set(0.21 * s, 0.25, 0);
    sh.rotation.order = "YXZ";
    J.chest.add(sh);
    J[`${side}Shoulder`] = sh;
    sh.add(at(ellipsoid(0.065, 0.065, 0.065, baseMat), 0, 0, 0));
    muscle("front_delts", sh, at(ellipsoid(0.04, 0.06, 0.035, baseMat), 0.01 * s, -0.02, 0.045));
    muscle("side_delts", sh, at(ellipsoid(0.035, 0.06, 0.04, baseMat), 0.05 * s, -0.02, 0));
    muscle("rear_delts", sh, at(ellipsoid(0.04, 0.06, 0.035, baseMat), 0.01 * s, -0.02, -0.045));
    sh.add(capsule(0.045, 0.22, baseMat));
    muscle("biceps", sh, at(ellipsoid(0.035, 0.09, 0.03, baseMat), 0, -0.15, 0.03));
    muscle("triceps", sh, at(ellipsoid(0.035, 0.1, 0.03, baseMat), 0, -0.14, -0.03));
    const el = g();
    el.position.y = -0.3;
    J[`${side}Elbow`] = el;
    sh.add(el);
    el.add(capsule(0.038, 0.2, baseMat));
    muscle("forearms", el, at(ellipsoid(0.035, 0.08, 0.035, baseMat), 0, -0.08, 0.01));
    const wr = g();
    wr.position.y = -0.27;
    J[`${side}Wrist`] = wr;
    el.add(wr);
    const hand = at(ellipsoid(0.04, 0.05, 0.025, baseMat), 0, -0.04, 0);
    wr.add(hand);
    effectors.push(hand);
    hands.push(hand);

    // Tungkai
    const hip = g();
    hip.position.set(0.095 * s, -0.04, 0);
    hip.rotation.order = "YXZ";
    J.pelvis.add(hip);
    J[`${side}Hip`] = hip;
    hip.add(capsule(0.068, 0.32, baseMat));
    muscle("quads", hip, at(ellipsoid(0.055, 0.15, 0.04, baseMat), 0, -0.2, 0.04));
    muscle("hamstrings", hip, at(ellipsoid(0.05, 0.15, 0.04, baseMat), 0, -0.2, -0.04));
    muscle("adductors", hip, at(ellipsoid(0.03, 0.12, 0.04, baseMat), -0.04 * s, -0.16, 0));
    const kn = g();
    kn.position.y = -0.43;
    J[`${side}Knee`] = kn;
    hip.add(kn);
    kn.add(capsule(0.05, 0.32, baseMat));
    muscle("calves", kn, at(ellipsoid(0.042, 0.11, 0.04, baseMat), 0, -0.13, -0.035));
    effectors.push(at(ellipsoid(0.04, 0.04, 0.04, baseMat), 0, 0, 0.02));
    kn.add(effectors[effectors.length - 1]);
    const an = g();
    an.position.y = -0.43;
    J[`${side}Ankle`] = an;
    kn.add(an);
    const foot = at(ellipsoid(0.045, 0.035, 0.11, baseMat), 0, -0.04, 0.06);
    an.add(foot);
    const toe = new THREE.Object3D();
    toe.position.set(0, -0.06, 0.16);
    const heel = new THREE.Object3D();
    heel.position.set(0, -0.07, -0.04);
    an.add(toe, heel);
    effectors.push(toe, heel);
  }
  effectors.push(J.pelvis, J.chest);

  return {
    root,
    body,
    joints: J,
    overlays,
    effectors,
    hands,
    baseMat,
    idleMat,
    muscleMats,
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      baseMat.dispose();
      idleMat.dispose();
      for (const m of muscleMats.values()) m.dispose();
    },
  };
}

function applyPose(rig: Rig, p: Pose): void {
  const J = rig.joints;
  const v = (k: keyof Pose) => (p[k] ?? 0) * DEG;
  rig.body.rotation.set(v("rootPitch"), v("rootYaw"), v("rootRoll"), "YXZ");
  J.spine.rotation.set(v("spineFlex") * 0.55, 0, v("spineSide"));
  J.chest.rotation.set(v("spineFlex") * 0.45, 0, 0);
  J.neck.rotation.set(v("neckFlex"), 0, 0);
  J.head.position.z = p.headForward ?? 0;
  for (const side of ["l", "r"] as const) {
    const s = side === "l" ? 1 : -1;
    const k = (n: string) => (p[`${side}${n}` as keyof Pose] ?? 0) * DEG;
    J[`${side}Shoulder`].rotation.set(-k("ShFlex"), k("ShHorz") * s, k("ShAbd") * s);
    J[`${side}Elbow`].rotation.set(-k("Elbow"), 0, k("ElbowZ") * s);
    J[`${side}Hip`].rotation.set(-k("HipFlex"), 0, k("HipAbd") * s);
    J[`${side}Knee`].rotation.set(k("Knee"), 0, 0);
    // Telapak kaki rata otomatis + plantarfleksi (Ankle +) / dorsifleksi.
    J[`${side}Ankle`].rotation.set(k("HipFlex") - k("Knee") + k("Ankle"), 0, 0);
  }
}

const tmp = new THREE.Vector3();

export interface AvatarProps {
  animation: AnimationId;
  speed?: number;
  playing?: boolean;
  colors?: Partial<Record<Muscle, string>>;
  showProp?: boolean;
  /** Fase tetap (0..1) bila tidak diputar — dipakai untuk heatmap statis. */
  staticPhase?: number;
}

export function Avatar({ animation, speed = 1, playing = true, colors = {}, showProp = true, staticPhase = 0 }: AvatarProps) {
  const rig = useMemo(buildRig, []);
  const phase = useRef(staticPhase);
  const clip = CLIPS[animation] ?? CLIPS.squat;

  useEffect(() => () => rig.dispose(), [rig]);

  useEffect(() => {
    for (const [m, mat] of rig.muscleMats) {
      const c = colors[m];
      if (c) {
        mat.color.set(c);
        mat.emissive.set(c);
        mat.emissiveIntensity = 0.55;
      } else {
        mat.color.copy(rig.idleMat.color);
        mat.emissive.set("#000000");
        mat.emissiveIntensity = 0;
      }
    }
  }, [colors, rig]);

  useEffect(() => {
    phase.current = staticPhase;
  }, [animation, staticPhase]);

  useFrame((_, dt) => {
    if (playing) phase.current = (phase.current + (dt * speed) / clip.duration) % 1;
    const pose = samplePose(clip, phase.current);
    applyPose(rig, pose);
    rig.root.position.set(0, 0, 0);
    rig.root.updateMatrixWorld(true);
    if (clip.ground === "hang") {
      let maxY = -Infinity;
      for (const h of rig.hands) maxY = Math.max(maxY, h.getWorldPosition(tmp).y);
      rig.root.position.y = 2.25 - maxY;
    } else {
      let minY = Infinity;
      for (const e of rig.effectors) minY = Math.min(minY, e.getWorldPosition(tmp).y);
      rig.root.position.y = -minY + 0.02 + (pose.rootLift ?? 0);
    }
  });

  return (
    <group>
      <primitive object={rig.root} />
      {showProp && clip.prop && <Prop kind={clip.prop} />}
    </group>
  );
}

const propMat = new THREE.MeshStandardMaterial({ color: "#1b1f27", metalness: 0.6, roughness: 0.35 });
const accentMat = new THREE.MeshStandardMaterial({ color: "#a3e635", emissive: "#a3e635", emissiveIntensity: 0.6 });

function Prop({ kind }: { kind: NonNullable<(typeof CLIPS)[AnimationId]["prop"]> }) {
  switch (kind) {
    case "bench":
      return (
        <group position={[0, 0, -0.1]}>
          <mesh position={[0, 0.4, 0]} material={propMat} castShadow receiveShadow>
            <boxGeometry args={[0.32, 0.08, 1.2]} />
          </mesh>
          <mesh position={[0, 0.2, 0]} material={accentMat}>
            <boxGeometry args={[0.06, 0.4, 0.06]} />
          </mesh>
        </group>
      );
    case "bar":
      return (
        <mesh position={[0, 2.27, 0]} rotation={[0, 0, Math.PI / 2]} material={accentMat}>
          <cylinderGeometry args={[0.02, 0.02, 1.4, 12]} />
        </mesh>
      );
    case "mat":
      return (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[0.8, 1.9]} />
          <meshStandardMaterial color="#164e63" roughness={0.9} />
        </mesh>
      );
    case "treadmill":
      return (
        <mesh position={[0, 0.03, 0]} material={propMat} receiveShadow>
          <boxGeometry args={[0.7, 0.06, 1.8]} />
        </mesh>
      );
    default:
      return null;
  }
}
