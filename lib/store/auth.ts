"use client";
import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { LocalRepository, SupabaseRepository, type Repository } from "../data/repository";
import { getSupabaseBrowser } from "../supabase/client";

interface AuthState {
  ready: boolean;
  user: User | null;
  repo: Repository | null;
  init(): () => void;
}

function repoFor(user: User | null): Repository {
  const sb = getSupabaseBrowser();
  if (sb && user) return new SupabaseRepository(sb, user.id);
  return new LocalRepository();
}

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  user: null,
  repo: null,
  init() {
    const sb = getSupabaseBrowser();
    if (!sb) {
      set({ ready: true, user: null, repo: repoFor(null) });
      return () => {};
    }
    sb.auth.getUser().then(({ data }) => set({ ready: true, user: data.user, repo: repoFor(data.user) }));
    const { data } = sb.auth.onAuthStateChange((_e, session) => {
      const user = session?.user ?? null;
      set({ ready: true, user, repo: repoFor(user) });
    });
    return () => data.subscription.unsubscribe();
  },
}));

/** Repository aktif (null sampai status auth diketahui). */
export function useRepo(): Repository | null {
  return useAuth((s) => s.repo);
}
