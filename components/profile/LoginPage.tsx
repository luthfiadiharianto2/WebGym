"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useT } from "@/lib/store/settings";

const Creds = z.object({ email: z.email(), password: z.string().min(8).max(72) });

export default function LoginPage() {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sb = getSupabaseBrowser();
  const redirect = () => `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback?next=/profile`;

  if (!isSupabaseConfigured || !sb) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="card space-y-4">
          <h1 className="text-2xl font-bold text-white">{t("auth.title")}</h1>
          <p className="text-sm text-yellow-200">{t("auth.notConfigured")}</p>
          <Link href="/profile" className="btn-primary w-full">
            {t("auth.continueGuest")}
          </Link>
        </div>
      </div>
    );
  }

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setMsg({ kind: "err", text: error.message });
    else if (okText) setMsg({ kind: "ok", text: okText });
    else router.push("/profile");
  };

  const withCreds = (mode: "in" | "up") => {
    const parsed = Creds.safeParse({ email, password });
    if (!parsed.success) return setMsg({ kind: "err", text: parsed.error.issues.map((i) => i.message).join(", ") });
    if (mode === "in") void run(() => sb.auth.signInWithPassword(parsed.data));
    else void run(() => sb.auth.signUp({ ...parsed.data, options: { emailRedirectTo: redirect() } }), t("auth.checkEmail"));
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card space-y-4">
        <h1 className="text-2xl font-bold text-white">{t("auth.title")}</h1>
        <p className="text-sm text-zinc-400">{t("auth.desc")}</p>
        <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => run(() => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect() } }))}>
          G · {t("auth.google")}
        </button>
        <p className="text-center text-xs text-zinc-400">— {t("auth.or")} —</p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            withCreds("in");
          }}
        >
          <div>
            <label className="label" htmlFor="email">
              {t("auth.email")}
            </label>
            <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">
              {t("auth.password")}
            </label>
            <input id="password" className="input" type="password" autoComplete="current-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {t("auth.signin")}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => withCreds("up")}>
              {t("auth.signup")}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy || !email}
              onClick={() => run(() => sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect() } }), t("auth.checkEmail"))}
            >
              {t("auth.magic")}
            </button>
          </div>
        </form>
        {msg && (
          <p role={msg.kind === "err" ? "alert" : "status"} className={`text-sm ${msg.kind === "err" ? "text-red-300" : "text-lime-300"}`}>
            {msg.text}
          </p>
        )}
        <Link href="/profile" className="block text-center text-xs text-zinc-400 underline">
          {t("auth.continueGuest")}
        </Link>
      </div>
    </div>
  );
}
