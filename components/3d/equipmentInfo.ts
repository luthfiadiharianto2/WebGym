// Metadata alat gym tanpa dependensi three.js (aman untuk bundle halaman non-3D).
import type { Equipment, Muscle } from "@/lib/types";

export type EquipmentId = "rack" | "bench" | "dumbbell_rack" | "treadmill" | "kettlebell" | "pullup" | "mat";

export const EQUIPMENT_INFO: Record<EquipmentId, { nameKey: string; muscles: Muscle[]; filter: Equipment; zone: number }> = {
  rack: { nameKey: "equip.rack", muscles: ["quads", "glutes", "hamstrings", "lower_back"], filter: "barbell", zone: 0 },
  bench: { nameKey: "equip.bench", muscles: ["chest", "triceps", "front_delts"], filter: "bench", zone: 0 },
  dumbbell_rack: { nameKey: "equip.dumbbell_rack", muscles: ["biceps", "side_delts", "chest", "lats"], filter: "dumbbell", zone: 0 },
  treadmill: { nameKey: "equip.treadmill", muscles: ["quads", "calves", "hamstrings"], filter: "treadmill", zone: 1 },
  kettlebell: { nameKey: "equip.kettlebell", muscles: ["glutes", "hamstrings", "abs"], filter: "kettlebell", zone: 2 },
  pullup: { nameKey: "equip.pullup", muscles: ["lats", "upper_back", "biceps"], filter: "pullup_bar", zone: 2 },
  mat: { nameKey: "equip.mat", muscles: ["abs", "hamstrings", "hip_flexors"], filter: "mat", zone: 3 },
};
