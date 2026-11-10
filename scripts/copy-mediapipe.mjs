// Menyalin file WASM MediaPipe dari node_modules ke /public agar versi selalu cocok
// dengan paket yang terpasang dan tidak bergantung pada CDN.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = join(process.cwd(), "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(process.cwd(), "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.warn("[copy-mediapipe] @mediapipe/tasks-vision belum terpasang, dilewati.");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-mediapipe] WASM disalin ke public/mediapipe/wasm");
