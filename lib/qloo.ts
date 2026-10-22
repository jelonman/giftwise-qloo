// Thin client for the Qloo Insights API.
// Source of truth for base URL, header and endpoints:
//   - kit docs/API_ACCESS.md (credential rules: server side only, bounded retries)
//   - kit starter/cli-workflow/README.md (`qloo api search`, key via QLOO_API_KEY)
//   - @qloo/qloo-harness 0.1.26 `qloo ... --dry-run` output and its QlooClient:
//       base https://api.qloo.com, header "X-Api-Key",
//       GET /search, GET /v2/insights, GET /v2/tags, GET /entities,
//       GET /v2/audiences, GET /v2/analysis/compare
//   - docs.qloo.com (docs MCP): Insights API, cross-category insights, affinity scores
export const QLOO_BASE = "https://api.qloo.com";

export class QlooError extends Error {
  constructor(public code: string, message: string, public retryable = false, public status?: number) {
    super(message);
  }
}

type Fetch = typeof fetch;
type Query = Record<string, string | number | boolean | string[] | undefined>;

export interface QlooOptions {
  apiKey?: string;
  fetch?: Fetch;
  maxAttempts?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class Qloo {
  private key: string;
  private f: Fetch;
  private attempts: number;
  private timeout: number;
  private sleep: (ms: number) => Promise<void>;
  calls: { path: string; params: Record<string, string> }[] = [];

  constructor(o: QlooOptions = {}) {
    const key = (o.apiKey ?? process.env.QLOO_API_KEY ?? "").trim();
    if (!key) throw new QlooError("QLOO_API_KEY_MISSING", "QLOO_API_KEY is not set.");
    this.key = key;
    this.f = o.fetch ?? fetch;
    this.attempts = o.maxAttempts ?? 3;
    this.timeout = o.timeoutMs ?? 20000;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async get(path: string, q: Query): Promise<any> {
    const url = new URL(path, QLOO_BASE);
    const rec: Record<string, string> = {};
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined) continue;
      const s = Array.isArray(v) ? v.join(",") : String(v);
      url.searchParams.set(k, s);
      rec[k] = s;
    }
    this.calls.push({ path, params: rec });
    for (let a = 1; a <= this.attempts; a++) {
      let res: Response;
      try {
        res = await this.f(url, {
          method: "GET",
          headers: { Accept: "application/json", "X-Api-Key": this.key },
          signal: AbortSignal.timeout(this.timeout),
        });
      } catch (e) {
        if (a < this.attempts) { await this.sleep(250 * 2 ** (a - 1)); continue; }
        throw new QlooError("QLOO_NETWORK", "Could not reach the Qloo API.", true);
      }
      if (res.ok) {
        const text = await res.text();
        return text.trim() ? JSON.parse(text) : {};
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && a < this.attempts) { await this.sleep(250 * 2 ** (a - 1)); continue; }
      const code = res.status === 401 || res.status === 403 ? "QLOO_AUTH" : res.status === 429 ? "QLOO_RATE_LIMIT" : "QLOO_HTTP";
      throw new QlooError(code, `Qloo returned HTTP ${res.status}.`, retryable, res.status);
    }
    throw new QlooError("QLOO_NETWORK", "Could not reach the Qloo API.", true);
  }

  /** GET /search: resolve a name to entities. */
  search(query: string, type?: string, take = 5) {
    return this.get("/search", { query, types: type, take });
  }
  /** GET /v2/tags with semantic search: turn a vibe word into tag ids. */
  tags(query: string, take = 3) {
    return this.get("/v2/tags", { "filter.query": query, "feature.semantic_search": true, take });
  }
  /** GET /v2/insights: recommendations / correlations. */
  insights(q: Query) {
    return this.get("/v2/insights", q);
  }
  /** GET /entities: fetch entities by id (used to enrich a pick). */
  entities(ids: string[]) {
    return this.get("/entities", { entity_ids: ids });
  }
}

// ---- response normalisers (shapes per harness resolution-provider/qloo-tools) ----
export function resultList(resp: any, key: string): any[] {
  const r = resp?.results;
  if (Array.isArray(r)) return r;
  const v = r?.[key];
  return Array.isArray(v) ? v : [];
}

export function entityOf(raw: any): { id: string; name: string; description?: string; image?: string; affinity?: number; explain?: unknown } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const id = raw.entity_id ?? raw.id;
  if (typeof id !== "string" || typeof raw.name !== "string") return undefined;
  const p = raw.properties ?? {};
  const image = typeof p.image === "string" ? p.image : typeof p.image?.url === "string" ? p.image.url : undefined;
  const description = p.short_description ?? p.description ?? raw.short_description ?? raw.description;
  return {
    id,
    name: raw.name,
    description: typeof description === "string" ? description.slice(0, 280) : undefined,
    image,
    affinity: typeof raw.query?.affinity === "number" ? raw.query.affinity : typeof raw.affinity === "number" ? raw.affinity : undefined,
    explain: raw.query?.explainability,
  };
}

export function tagOf(raw: any): { id: string; name: string; affinity?: number } | undefined {
  const id = raw?.id ?? raw?.tag_id;
  if (typeof id !== "string" || typeof raw?.name !== "string") return undefined;
  return { id, name: raw.name, affinity: typeof raw.query?.affinity === "number" ? raw.query.affinity : raw.affinity };
}

/** Pull entity names out of an explainability blob without assuming its exact shape. */
export function explainNames(explain: unknown, known: Map<string, string>): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") { const n = known.get(v); if (n) out.add(n); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const id = o.entity_id ?? o.id;
      if (typeof id === "string" && known.has(id)) out.add(known.get(id)!);
      if (typeof o.name === "string" && [...known.values()].includes(o.name)) out.add(o.name);
      Object.values(o).forEach((x) => walk(x, depth + 1));
    }
  };
  walk(explain);
  return [...out];
}
