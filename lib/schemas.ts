// Skema Zod untuk validasi input (form, API route) dan output LLM.
import { z } from "zod";
import { EQUIPMENT, INJURIES } from "./types";

export const ProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().max(60),
  age: z.number().int().min(13).max(100).nullable(),
  heightCm: z.number().min(100).max(250).nullable(),
  weightKg: z.number().min(30).max(300).nullable(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  goal: z.enum(["hypertrophy", "strength", "fat_loss", "endurance"]),
  injuries: z.array(z.enum(INJURIES)).max(INJURIES.length),
  daysPerWeek: z.number().int().min(1).max(6),
  equipment: z.array(z.enum(EQUIPMENT)).min(1),
  parqAnswers: z.record(z.string(), z.boolean()),
  parqFlag: z.boolean(),
  onboardedAt: z.string().nullable(),
  locale: z.enum(["id", "en"]),
});

/** Ringkasan anonim yang dikirim ke API penjelasan LLM (tanpa nama/email/ID pengguna). */
export const ExplainRequestSchema = z.object({
  locale: z.enum(["id", "en"]),
  goal: z.enum(["hypertrophy", "strength", "fat_loss", "endurance"]),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  daysPerWeek: z.number().int().min(1).max(6),
  split: z.string().max(40),
  injuries: z.array(z.enum(INJURIES)).max(8),
  signals: z
    .object({
      avgFormScore: z.number().min(0).max(100).nullable(),
      avgSymmetry: z.number().min(0).max(100).nullable(),
      postureScore: z.number().min(0).max(100).nullable(),
      mobilityScore: z.number().min(0).max(100).nullable(),
      sessionsLast28d: z.number().int().min(0).max(500),
    })
    .strict(),
  items: z
    .array(
      z
        .object({
          exerciseId: z.string().max(60),
          exerciseName: z.string().max(80),
          day: z.string().max(40),
          kind: z.enum(["main", "accessory", "corrective"]),
          sets: z.number().int().min(1).max(10),
          reps: z.string().max(20),
          reasons: z.array(z.string().max(300)).max(6),
        })
        .strict(),
    )
    .min(1)
    .max(60),
});
export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

/** Skema output LLM — divalidasi sebelum ditampilkan; gagal → fallback rule-based. */
export const ExplainResponseSchema = z.object({
  summary: z.string().min(1).max(1200),
  items: z
    .array(
      z.object({
        exerciseId: z.string().max(60),
        explanation: z.string().min(1).max(500),
      }),
    )
    .max(60),
});
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;
