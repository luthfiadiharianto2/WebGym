import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/** Klien Supabase berbasis cookie sesi pengguna (menghormati RLS). */
export async function getSupabaseServer() {
  if (!isSupabaseConfigured) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: Parameters<typeof store.set>[2] }[]) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Dipanggil dari Server Component: abaikan, middleware yang menyegarkan sesi.
        }
      },
    },
  });
}

/** Klien admin (service role) — HANYA untuk operasi server yang sudah memverifikasi pengguna. */
export function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isSupabaseConfigured || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
