-- IronVision 3D — skema awal + Row Level Security
-- Prinsip: setiap pengguna hanya dapat membaca/menulis datanya sendiri.
-- Video TIDAK pernah disimpan; hanya data numerik. Foto progres opsional di Storage privat.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ profiles
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 60),
  age           smallint check (age between 13 and 100),
  height_cm     numeric(5,1) check (height_cm between 100 and 250),
  weight_kg     numeric(5,1) check (weight_kg between 30 and 300),
  level         text not null default 'beginner' check (level in ('beginner','intermediate','advanced')),
  goal          text not null default 'hypertrophy' check (goal in ('hypertrophy','strength','fat_loss','endurance')),
  injuries      text[] not null default '{}',
  days_per_week smallint not null default 3 check (days_per_week between 1 and 6),
  equipment     text[] not null default '{bodyweight}',
  parq_answers  jsonb not null default '{}'::jsonb,
  parq_flag     boolean not null default false,
  onboarded_at  timestamptz,
  locale        text not null default 'id' check (locale in ('id','en')),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------ exercises (katalog publik, read-only)
create table if not exists public.exercises (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ workout_sessions
create table if not exists public.workout_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  started_at    timestamptz not null,
  ended_at      timestamptz not null,
  duration_sec  integer not null check (duration_sec >= 0),
  source        text not null default 'camera' check (source in ('camera','manual')),
  plan_item_id  uuid,
  notes         text check (char_length(notes) <= 1000),
  created_at    timestamptz not null default now()
);
create index if not exists workout_sessions_user_started_idx on public.workout_sessions (user_id, started_at desc);

-- ------------------------------------------------------------------ set_logs
create table if not exists public.set_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  session_id    uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id   text not null,
  set_index     smallint not null check (set_index >= 0),
  reps          smallint not null check (reps between 0 and 1000),
  weight_kg     numeric(6,2) check (weight_kg >= 0 and weight_kg <= 1000),
  form_score    smallint not null check (form_score between 0 and 100),
  rom_deg       numeric(6,2) not null default 0,
  rom_pct       numeric(4,2) not null default 0,
  symmetry      smallint not null default 100 check (symmetry between 0 and 100),
  tempo_down_ms integer not null default 0,
  tempo_up_ms   integer not null default 0,
  consistency   smallint not null default 100 check (consistency between 0 and 100),
  hold_sec      integer,
  issues        text[] not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists set_logs_user_exercise_idx on public.set_logs (user_id, exercise_id, created_at);
create index if not exists set_logs_session_idx on public.set_logs (session_id);

-- ------------------------------------------------------------------ posture_assessments
create table if not exists public.posture_assessments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  created_at          timestamptz not null default now(),
  shoulder_tilt_deg   numeric(5,2) not null,
  pelvic_tilt_deg     numeric(5,2) not null,
  forward_head_ratio  numeric(5,3),
  spine_deviation_deg numeric(5,2) not null,
  symmetry_score      smallint not null check (symmetry_score between 0 and 100),
  posture_score       smallint not null check (posture_score between 0 and 100),
  proportions         jsonb,
  photo_path          text
);
create index if not exists posture_user_idx on public.posture_assessments (user_id, created_at);

-- ------------------------------------------------------------------ mobility_assessments
create table if not exists public.mobility_assessments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  overhead_squat  smallint not null check (overhead_squat between 0 and 100),
  shoulder_reach  smallint not null check (shoulder_reach between 0 and 100),
  toe_touch       smallint not null check (toe_touch between 0 and 100),
  hip             smallint not null check (hip between 0 and 100),
  shoulder        smallint not null check (shoulder between 0 and 100),
  hamstring       smallint not null check (hamstring between 0 and 100),
  ankle           smallint not null check (ankle between 0 and 100),
  overall         smallint not null check (overall between 0 and 100),
  details         jsonb not null default '{}'::jsonb
);
create index if not exists mobility_user_idx on public.mobility_assessments (user_id, created_at);

-- ------------------------------------------------------------------ workout_plans & plan_items
create table if not exists public.workout_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  goal          text not null,
  days_per_week smallint not null,
  split         text not null,
  source        text not null default 'rules' check (source in ('rules','rules+llm')),
  summary       jsonb not null default '[]'::jsonb,
  llm_summary   text,
  active        boolean not null default true
);
create index if not exists plans_user_active_idx on public.workout_plans (user_id, active, created_at desc);

create table if not exists public.plan_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  plan_id           uuid not null references public.workout_plans (id) on delete cascade,
  day_index         smallint not null,
  day_label         text not null,
  position          smallint not null,
  exercise_id       text not null,
  sets              smallint not null check (sets between 1 and 10),
  reps_min          smallint not null,
  reps_max          smallint not null,
  rest_sec          smallint not null,
  target_weight_kg  numeric(6,2),
  kind              text not null check (kind in ('main','accessory','corrective')),
  reasons           jsonb not null default '[]'::jsonb,
  replaced_from     text,
  llm_explanation   text
);
create index if not exists plan_items_plan_idx on public.plan_items (plan_id, day_index, position);

-- ------------------------------------------------------------------ consent_logs
create table if not exists public.consent_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        text not null check (type in ('camera','progress_photos','llm','parq','terms')),
  granted     boolean not null,
  version     text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists consent_user_idx on public.consent_logs (user_id, created_at);

-- ================================================================== RLS
alter table public.profiles             enable row level security;
alter table public.exercises            enable row level security;
alter table public.workout_sessions     enable row level security;
alter table public.set_logs             enable row level security;
alter table public.posture_assessments  enable row level security;
alter table public.mobility_assessments enable row level security;
alter table public.workout_plans        enable row level security;
alter table public.plan_items           enable row level security;
alter table public.consent_logs         enable row level security;

-- profiles: kunci = id
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

-- exercises: semua boleh membaca, tidak ada yang boleh menulis lewat API (hanya migrasi/seed).
drop policy if exists "exercises_read_all" on public.exercises;
create policy "exercises_read_all" on public.exercises for select to anon, authenticated using (true);

-- Tabel milik pengguna dengan kolom user_id: kebijakan seragam.
do $$
declare t text;
begin
  foreach t in array array['workout_sessions','set_logs','posture_assessments','mobility_assessments','workout_plans','plan_items','consent_logs']
  loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- consent_logs bersifat append-only: larang update.
drop policy if exists "consent_logs_update_own" on public.consent_logs;

-- set_logs & plan_items hanya boleh menempel pada induk milik sendiri.
drop policy if exists "set_logs_insert_own" on public.set_logs;
create policy "set_logs_insert_own" on public.set_logs for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
drop policy if exists "plan_items_insert_own" on public.plan_items;
create policy "plan_items_insert_own" on public.plan_items for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.workout_plans p where p.id = plan_id and p.user_id = (select auth.uid())));

-- ================================================================== Storage: foto progres
-- Bucket PRIVAT; Supabase Storage mengenkripsi objek saat disimpan (AES-256 at rest).
-- Path wajib "<user_id>/<file>" sehingga kebijakan membatasi akses ke pemilik folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 2097152, array['image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "progress_photos_select_own" on storage.objects;
create policy "progress_photos_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "progress_photos_insert_own" on storage.objects;
create policy "progress_photos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "progress_photos_update_own" on storage.objects;
create policy "progress_photos_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "progress_photos_delete_own" on storage.objects;
create policy "progress_photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ================================================================== updated_at trigger
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
