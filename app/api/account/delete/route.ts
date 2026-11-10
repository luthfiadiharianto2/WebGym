// Hak pengguna untuk menghapus seluruh data: memverifikasi JWT pengguna, lalu menghapus
// akun auth (ON DELETE CASCADE menghapus seluruh baris di tabel publik).
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { clientKey, rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rl = rateLimit(`delete:${clientKey(req)}`, 3, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error: delErr } = await admin.auth.admin.deleteUser(data.user.id);
  if (delErr) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
