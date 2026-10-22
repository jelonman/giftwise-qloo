import { runAgent } from "@/lib/agent";
import { Qloo } from "@/lib/qloo";
import type { AgentEvent } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let text = "";
  try { text = String((await req.json())?.text ?? "").trim().slice(0, 1200); } catch { /* empty */ }
  if (text.length < 8) return Response.json({ error: "Describe the person in a sentence or two." }, { status: 400 });
  let qloo: Qloo | null = null;
  try { qloo = new Qloo(); } catch { qloo = null; }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try { await runAgent(text, { qloo, emit }); } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
