import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// Menyegarkan sesi Supabase (cookie) di setiap request bila Supabase dikonfigurasi.
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
  if (!isSupabaseConfigured) return res;
  const sb = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options?: Parameters<typeof res.cookies.set>[2] }[]) => {
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  await sb.auth.getUser();
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mediapipe|models|.*\.(?:svg|png|jpg|webp|glb|task|wasm)$).*)"],
};
