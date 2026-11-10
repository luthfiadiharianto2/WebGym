"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRepo } from "./store/auth";
import type { MobilityAssessment, PostureAssessment, Profile, SetLog, WorkoutPlan, WorkoutSession } from "./types";

export interface UserData {
  profile: Profile | null;
  sessions: WorkoutSession[];
  sets: SetLog[];
  posture: PostureAssessment[];
  mobility: MobilityAssessment[];
  plan: WorkoutPlan | null;
}

const EMPTY: UserData = { profile: null, sessions: [], sets: [], posture: [], mobility: [], plan: null };

/** Memuat seluruh data pengguna dari repository aktif (lokal atau Supabase). */
export function useUserData() {
  const repo = useRepo();
  const [data, setData] = useState<UserData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const reload = useCallback(async () => {
    if (!repo) return;
    // Spinner hanya untuk muat pertama; muat ulang dilakukan diam-diam agar UI tidak ter-unmount.
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    try {
      const [profile, { sessions, sets }, posture, mobility, plan] = await Promise.all([
        repo.getProfile(),
        repo.listSessions(),
        repo.listPosture(),
        repo.listMobility(),
        repo.getActivePlan(),
      ]);
      setData({ profile, sessions, sets, posture, mobility, plan });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, repo };
}
