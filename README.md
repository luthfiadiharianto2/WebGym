# IronVision 3D

Gym virtual 3D dengan **AI Camera Scan on-device**, statistik pribadi, dan rekomendasi latihan yang dipersonalisasi.

- **Landing 3D** — gym low-poly prosedural (rak barbel, bench, treadmill, rak dumbel, kettlebell, matras, lampu neon), kamera mengikuti scroll melewati zona Strength → Cardio → Functional → Stretching, tooltip alat, bloom, auto-kualitas, loading screen, dan fallback gambar statis.
- **Library 3D** — 39 latihan (`data/exercises.json`) dengan avatar humanoid ber-rig prosedural yang beranimasi, bisa diputar 360°, kecepatan bisa diatur, dan highlight otot utama/pendukung.
- **AI Camera Scan** — MediaPipe Pose Landmarker (lite/full) di **Web Worker + OffscreenCanvas + GPU delegate**, fallback ke main thread. Video tidak pernah diunggah.
  - *Mode A — Live Workout Tracking*: hitung rep otomatis (state machine sudut sendi + One Euro filter + hysteresis), form score real-time, sendi hijau/kuning/merah, umpan balik teks & suara, metrik per set (rep, tempo, ROM, simetri, konsistensi).
  - *Mode B — Posture & Body Assessment*: siluet pemandu + hitung mundur, postur depan/samping, tes mobilitas (overhead squat, shoulder reach, toe touch), proporsi bahu:pinggang:pinggul (estimasi dari mask segmentasi).
  - *Mode Demo*: landmark sintetis tanpa kamera (berguna untuk perangkat tanpa kamera dan untuk E2E test).
- **Dashboard** — ringkasan minggu (sesi, rep, volume, durasi, streak), tren form score, simetri & ROM, riwayat postur/mobilitas, PR + estimasi 1RM (Epley), heatmap otot 3D, riwayat sesi, perbandingan scan sebelum/sesudah, ekspor CSV/JSON, hapus semua data.
- **Rencana** — mesin aturan deterministik (split sesuai hari, set/rep/istirahat sesuai tujuan, progressive overload, korektif, penggantian karena cedera, "Kenapa ini?") + lapisan LLM opsional (Claude) yang hanya menjelaskan, divalidasi Zod, fallback ke penjelasan berbasis aturan.
- **Privasi & aksesibilitas** — consent kamera eksplisit + indikator kamera aktif, PAR-Q, disclaimer, RLS, rate limit, i18n ID/EN, navigasi keyboard, ARIA, mode "kurangi gerakan".

---

## Menjalankan

Butuh Node.js 20+.

```bash
npm install
npm run dev
```

Buka http://localhost:3000. **Tanpa konfigurasi apa pun aplikasi berjalan penuh di "Mode Tamu"**: semua data numerik disimpan di `localStorage` browser. Isi variabel Supabase untuk login & sinkronisasi.

`npm install` otomatis menyalin file WASM MediaPipe ke `public/mediapipe/wasm` (skrip `postinstall`). Model `.task` diunduh browser dari `storage.googleapis.com` saat pertama kali scan; untuk self-host jalankan `npm run models:download` lalu set `NEXT_PUBLIC_MEDIAPIPE_MODEL_BASE=/models`.

> Kamera hanya tersedia di **HTTPS atau localhost**. Untuk mencoba dari ponsel di jaringan lokal, gunakan tunnel HTTPS (mis. `cloudflared`, `ngrok`) atau `next dev --experimental-https`.

### Skrip

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` / `npm start` | Build & jalankan produksi |
| `npm run typecheck` | Pemeriksaan TypeScript |
| `npm test` | Unit test Vitest (pose engine dengan landmark sintetis, rekomendasi, statistik, skema) |
| `npm run test:e2e` | E2E Playwright (pertama kali: `npx playwright install chromium`) |
| `npm run models:download` | Unduh model pose lite & full ke `public/models` |
| `npm run db:seed-sql` | Regenerasi `supabase/seed.sql` dari `data/exercises.json` |

## Variabel environment

Salin `.env.example` → `.env.local`.

| Variabel | Wajib | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Tidak | URL proyek Supabase. Kosong → Mode Tamu |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tidak | Anon key (aman di klien; dilindungi RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Tidak | **Server saja**, untuk `/api/account/delete` (hapus akun). Jangan pernah diberi awalan `NEXT_PUBLIC_` |
| `ANTHROPIC_API_KEY` | Tidak | **Server saja**, mengaktifkan penjelasan LLM opsional |
| `ANTHROPIC_MODEL` | Tidak | Default `claude-opus-5-5` |
| `NEXT_PUBLIC_MEDIAPIPE_WASM_URL` | Tidak | Default `/mediapipe/wasm` |
| `NEXT_PUBLIC_MEDIAPIPE_MODEL_BASE` | Tidak | Kosong = model resmi Google; `/models` untuk self-host |
| `NEXT_PUBLIC_SITE_URL` | Tidak | Untuk redirect OAuth/magic link |

Tidak ada API key di sisi klien: kunci Anthropic dan service role hanya dibaca di API route server.

## Supabase: migrasi & auth

1. Buat proyek di https://supabase.com, lalu isi `.env.local`.
2. Jalankan migrasi — salah satu:
   - **CLI**: `npx supabase link --project-ref <ref>` lalu `npx supabase db push`
   - **Manual**: buka *SQL Editor*, jalankan isi `supabase/migrations/20261110000000_init.sql`, lalu `supabase/seed.sql`.
3. Auth → Providers: aktifkan **Email** dan **Google** (isi Client ID/Secret Google OAuth). Tambahkan `http://localhost:3000/auth/callback` (dan URL produksi) ke *Redirect URLs*.

Skema: `profiles`, `exercises`, `workout_sessions`, `set_logs` (rep, form_score, rom, symmetry, tempo, …), `posture_assessments`, `mobility_assessments`, `workout_plans`, `plan_items`, `consent_logs`. Setiap tabel milik pengguna memakai RLS `auth.uid() = user_id` untuk select/insert/update/delete; `set_logs`/`plan_items` hanya boleh menempel pada induk milik sendiri; `consent_logs` append-only. Foto progres disimpan di bucket **privat** `progress-photos` dengan path `<user_id>/<file>` dan kebijakan Storage per folder; Supabase mengenkripsi objek saat disimpan (at rest). Foto hanya diambil bila pengguna mencentang opsi di Mode B dan sudah login.

Hapus semua data: tombol di Dashboard menghapus foto, lalu memanggil `/api/account/delete` (memverifikasi JWT, menghapus user → cascade). Jika service role tidak dikonfigurasi, baris data dihapus lewat RLS lalu pengguna di-logout.

## Struktur proyek

```
app/                    Route App Router (/, /exercises, /exercises/[id], /scan, /dashboard, /plan, /profile, /login, /api/*)
components/3d/          GymScene, equipment (instancing), Avatar (rig prosedural), animations, AvatarViewer
components/scan/        ScanPage (kamera + loop inferensi), LiveTracking (Mode A), Assessment (Mode B), ConsentDialog
components/dashboard/   Dashboard, Charts (Recharts, lazy)
lib/pose/               math (sudut), smoothing (One Euro), repCounter, profiles (form rules), tracker,
                        quality, posture, mobility, synthetic (landmark sintetis), runner (worker/main/demo)
lib/recommendation/     engine.ts (mesin aturan deterministik)
lib/data/               repository.ts (LocalRepository & SupabaseRepository)
data/exercises.json     Katalog latihan
workers/pose.worker.ts  MediaPipe di Web Worker
supabase/migrations/    Migrasi SQL + RLS + Storage
tests/unit, e2e/        Vitest & Playwright
```

## Menambah latihan baru

1. Tambahkan objek ke `data/exercises.json` (lihat tipe `Exercise` di `lib/types.ts`): `id` unik (snake_case), `name`/`description` bilingual, `zone`, `pattern` (untuk mesin rekomendasi), `animation` (salah satu `AnimationId`), otot utama/pendukung, `equipment`, `level`, `goals`, `commonMistakes`, `cues`, `variations` (ID lain), `contraindications` (cedera).
2. Opsional — pelacakan kamera: set `"tracking"` ke ID profil di `lib/pose/profiles.ts` (`squat`, `lunge`, `pushup`, `curl`, `ohp`, `lateral_raise`, `hinge`, `bridge`, `jumping_jack`, `row`, `calf_raise`, `tricep_ext`, `plank`) atau buat profil baru: metrik sudut, ambang `rest/peak/target`, dan aturan form.
3. Opsional — animasi baru: tambahkan klip keyframe di `components/3d/animations.ts` dan ID-nya ke `AnimationId`.
4. `npm test` (memvalidasi ID unik & variasi), lalu `npm run db:seed-sql` bila memakai Supabase.

## Mengganti aset 3D

Semua aset 3D saat ini **prosedural** (dibangun dari primitif) agar proyek bisa langsung jalan tanpa file biner.

- **Alat gym**: ganti komponen di `components/3d/equipment.tsx` dengan model glTF. Kompres dulu: `npx gltf-transform optimize in.glb public/models/rack.glb --compress draco --texture-compress webp` (atau `--compress meshopt`, tekstur KTX2 via `--texture-compress ktx2`). Muat dengan `useGLTF("/models/rack.glb")` dari drei (dukung Draco/meshopt otomatis), bungkus `<Suspense>` — loading screen memakai `useProgress` bila diperlukan.
- **Avatar**: rig prosedural di `components/3d/Avatar.tsx` memakai sendi bernama (`pelvis`, `spine`, `chest`, `l/rShoulder`, `l/rElbow`, `l/rHip`, `l/rKnee`, `l/rAnkle`). Untuk model ber-rig (mis. Mixamo): muat `.glb`, petakan nama tulang ke kunci tersebut, lalu ganti `applyPose` agar menulis rotasi ke tulang model, atau putar klip animasi glTF dengan `useAnimations`. Highlight otot: beri material per-mesh/vertex group bernama otot dan warnai lewat prop `colors`.

## Arsitektur pose & performa

- Loop memakai `requestVideoFrameCallback`; frame dikirim ke worker sebagai `ImageBitmap` (transferable). Saat inferensi sebelumnya belum selesai, frame dilewati (backpressure) sehingga UI tetap mulus.
- Landmark dihaluskan One Euro filter, metrik sudut dihaluskan lagi, state machine memakai ambang masuk/keluar berbeda (hysteresis) dan durasi rep minimum → tidak ada hitungan ganda (diuji di `tests/unit/pose.test.ts`).
- Frame berkualitas rendah (tubuh tidak utuh, terlalu dekat/jauh, visibilitas rendah) tidak diproses untuk penghitungan.
- 3D: lazy-load scene & avatar (`next/dynamic`, `ssr: false`), instancing untuk dumbel/kettlebell/matras, `PerformanceMonitor` menurunkan DPR, mematikan bayangan & postprocessing saat FPS turun; perangkat lemah/tanpa WebGL mendapat gambar statis (`?lite` untuk memaksa).
- Halaman non-3D tidak memuat three.js; Recharts di-lazy-load.

## Keterbatasan (jujur)

- **Akurasi pose**: MediaPipe adalah estimasi 2D/3D dari satu kamera. Sudut sendi bisa meleset 5–15°, terutama saat bagian tubuh tertutup (self-occlusion), dari sudut kamera miring, atau pakaian longgar. Kedalaman (z) kurang akurat dibanding x/y.
- **Aturan form adalah heuristik**, bukan penilaian pelatih. Deteksi "punggung membungkuk" memakai proksi sudut telinga–bahu–pinggul; landmark tidak mengukur kelengkungan tulang belakang. Beberapa aturan hanya valid dari sudut pandang tertentu (valgus lutut: tampak depan; pinggul turun: tampak samping) — aplikasi menampilkan petunjuk posisi kamera.
- **Pencahayaan**: cahaya redup, backlight (jendela di belakang), atau latar ramai menurunkan visibilitas landmark; aplikasi memperingatkan tetapi tidak bisa memperbaikinya.
- **Perangkat**: target ≥24 FPS laptop menengah / ≥15 FPS ponsel tercapai dengan model *lite* + GPU delegate di browser Chromium modern. Safari/iOS lama mungkin tidak mendukung OffscreenCanvas di worker → fallback main thread (lebih lambat). Model *full* lebih akurat tetapi lebih berat.
- **Postur & proporsi** adalah ESTIMASI dari siluet/landmark, dipengaruhi pakaian, jarak, dan lensa. Bukan pengukuran medis, bukan body fat %, bukan diagnosis.
- **Rep counter** dioptimalkan untuk gerakan bilateral; latihan alternating (curl bergantian) dihitung dari lengan yang paling menekuk; latihan unilateral lain sebaiknya dilakukan satu sisi per set.
- **Rate limiter** di memori per instance; untuk deployment serverless multi-instance gunakan store bersama (Upstash Redis/Supabase).
- **Model pose** diunduh dari Google Storage kecuali di-self-host; pertama kali scan butuh koneksi internet (~5–10 MB).
- **Animasi avatar** adalah keyframe prosedural yang disederhanakan — cukup untuk ilustrasi pola gerak, bukan motion capture.

## Disclaimer

IronVision 3D **bukan alat diagnosis atau saran medis**. Berhentilah jika merasa nyeri dan konsultasikan dengan dokter atau fisioterapis. Isi PAR-Q saat onboarding; jawaban "Ya" akan menampilkan anjuran konsultasi dan membuat rencana lebih konservatif.
