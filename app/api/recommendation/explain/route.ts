// Lapisan LLM OPSIONAL: memberi penjelasan bahasa natural untuk rencana yang sudah
// dihasilkan mesin aturan. LLM tidak memilih latihan — hanya menjelaskan.
// Output divalidasi Zod; bila gagal/tidak dikonfigurasi, klien memakai penjelasan rule-based.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { ExplainRequestSchema, ExplainResponseSchema } from "@/lib/schemas";
import { clientKey, rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32_000;

export async function POST(req: Request) {
  const rl = rateLimit(`explain:${clientKey(req)}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "llm_not_configured" }, { status: 503 });
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = ExplainRequestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const input = parsed.data;

  const language = input.locale === "en" ? "English" : "Bahasa Indonesia";
  const system = [
    `You are a certified strength & conditioning coach writing short, friendly explanations in ${language}.`,
    "A deterministic rules engine has already chosen every exercise, set and rep. Do not add, remove or change exercises, sets, reps or loads.",
    "Explain why each item fits this person using only the reasons and signals provided. Do not give medical diagnoses or claims about body fat, disease or injury status; if pain is mentioned, recommend seeing a professional.",
    "Return one explanation per item, using the exact exerciseId values given. Keep each explanation under 2 sentences and the summary under 4 sentences.",
  ].join(" ");

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(ExplainResponseSchema) },
      system,
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return NextResponse.json({ error: "llm_no_output" }, { status: 502 });
    }
    // Validasi ulang + pastikan LLM tidak mengarang exerciseId baru.
    const out = ExplainResponseSchema.safeParse(response.parsed_output);
    if (!out.success) return NextResponse.json({ error: "llm_invalid_output" }, { status: 502 });
    const allowed = new Set(input.items.map((i) => i.exerciseId));
    const items = out.data.items.filter((i) => allowed.has(i.exerciseId));
    return NextResponse.json({ summary: out.data.summary, items });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "llm_rate_limited" }, { status: 503 });
    if (err instanceof Anthropic.APIError) return NextResponse.json({ error: `llm_api_${err.status ?? "error"}` }, { status: 502 });
    return NextResponse.json({ error: "llm_failed" }, { status: 502 });
  }
}
