// Menghasilkan supabase/seed.sql dari data/exercises.json (katalog latihan publik).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const list = JSON.parse(readFileSync(join(root, "data", "exercises.json"), "utf8"));
const esc = (s) => s.replace(/'/g, "''");
const rows = list.map((e) => `  ('${esc(e.id)}', '${esc(JSON.stringify(e))}'::jsonb)`);
const sql = `-- AUTO-GENERATED oleh scripts/generate-seed.mjs — jangan diedit manual.
insert into public.exercises (id, data) values
${rows.join(",\n")}
on conflict (id) do update set data = excluded.data, updated_at = now();
`;
writeFileSync(join(root, "supabase", "seed.sql"), sql);
console.log(`seed.sql ditulis (${list.length} latihan)`);
