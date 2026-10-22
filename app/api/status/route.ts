import { llmConfigured } from "@/lib/llm";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ qloo: Boolean(process.env.QLOO_API_KEY?.trim()), llm: llmConfigured() });
}
