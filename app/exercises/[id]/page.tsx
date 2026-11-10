import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ExerciseDetail from "@/components/exercises/ExerciseDetail";
import { EXERCISES, getExercise } from "@/lib/exercises";

export function generateStaticParams() {
  return EXERCISES.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const ex = getExercise(id);
  return { title: ex?.name.id ?? "Latihan", description: ex?.description.id };
}

export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ex = getExercise(id);
  if (!ex) notFound();
  return <ExerciseDetail exercise={ex} />;
}
