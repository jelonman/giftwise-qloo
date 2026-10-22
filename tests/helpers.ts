import { Qloo } from "../lib/qloo";
import * as F from "./fixtures";

export const j = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Fake fetch for api.qloo.com that answers like the documented endpoints. */
export function fakeQlooFetch(log: URL[] = []): typeof fetch {
  return (async (input: any, init?: any) => {
    const url = new URL(String(input));
    log.push(url);
    if (init?.headers?.["X-Api-Key"] !== "test-key") return j({ error: "unauthorized" }, 401);
    if (url.pathname === "/search") return j(F.searchByName[url.searchParams.get("query")!] ?? { results: [] });
    if (url.pathname === "/v2/tags") return j(F.tagsCozy);
    if (url.pathname === "/v2/insights") {
      const t = url.searchParams.get("filter.type")!;
      if (t === "urn:tag") return j(F.dnaTags);
      return j(F.insightsByType[t] ?? { results: { entities: [] } });
    }
    return j({}, 404);
  }) as typeof fetch;
}
export const fakeQloo = (log: URL[] = []) => new Qloo({ apiKey: "test-key", fetch: fakeQlooFetch(log), sleep: async () => {} });

export function fakeLlm(profile: unknown, compose: unknown): typeof fetch {
  return (async (_u: any, init: any) => {
    const sys = JSON.parse(init.body).messages[0].content as string;
    const body = sys.includes("gift advisor") ? compose : profile;
    return j({ choices: [{ message: { content: "```json\n" + JSON.stringify(body) + "\n```" } }] });
  }) as typeof fetch;
}
