import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

// Callback OAuth (Google) & magic link: menukar kode menjadi sesi cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const sb = await getSupabaseServer();
  if (sb && code) await sb.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
