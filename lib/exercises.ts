import raw from "@/data/exercises.json";
import type { Equipment, Exercise, Goal, Level, Muscle } from "./types";

export const EXERCISES: Exercise[] = raw as Exercise[];
const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export interface ExerciseFilter {
  q?: string;
  muscle?: Muscle | "";
  equipment?: Equipment | "";
  level?: Level | "";
  goal?: Goal | "";
}

export function filterExercises(list: Exercise[], f: ExerciseFilter): Exercise[] {
  const q = f.q?.trim().toLowerCase();
  return list.filter((e) => {
    if (q && !`${e.name.id} ${e.name.en} ${e.id}`.toLowerCase().includes(q)) return false;
    if (f.muscle && !e.primaryMuscles.includes(f.muscle) && !e.secondaryMuscles.includes(f.muscle)) return false;
    if (f.equipment && !e.equipment.includes(f.equipment)) return false;
    if (f.level && e.level !== f.level) return false;
    if (f.goal && !e.goals.includes(f.goal)) return false;
    return true;
  });
}

export const TRACKABLE = EXERCISES.filter((e) => e.tracking);
