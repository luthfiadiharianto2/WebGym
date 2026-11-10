// Mengunduh model Pose Landmarker (lite & full) ke /public/models agar bisa di-host sendiri.
// Setelah itu set NEXT_PUBLIC_MEDIAPIPE_MODEL_BASE=/models di .env.local
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const models = {
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "pose_landmarker_full.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
};
const dir = join(process.cwd(), "public", "models");
mkdirSync(dir, { recursive: true });
for (const [name, url] of Object.entries(models)) {
  process.stdout.write(`Mengunduh ${name} ... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal ${res.status} untuk ${url}`);
  writeFileSync(join(dir, name), Buffer.from(await res.arrayBuffer()));
  console.log("ok");
}
