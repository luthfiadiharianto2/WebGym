export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Supabase aktif hanya bila URL & anon key diisi (bukan placeholder .env.example). */
export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("xxxxxxxx") && SUPABASE_ANON_KEY.length > 20;

export const PROGRESS_BUCKET = "progress-photos";
