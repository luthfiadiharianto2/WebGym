import { Suspense } from "react";
import type { Metadata } from "next";
import ExerciseLibrary from "@/components/exercises/ExerciseLibrary";

export const metadata: Metadata = { title: "Latihan" };

export default function ExercisesPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-10 text-zinc-500">…</div>}>
      <ExerciseLibrary />
    </Suspense>
  );
}
