import { Qloo, QlooError, entityOf, tagOf, resultList, explainNames } from "./qloo";
import { chatJson, LlmError, type LlmOptions } from "./llm";
import { giftLink } from "./links";
import { DOMAIN_URN, type AgentEvent, type Candidate, type Domain, type Gift, type Profile, type Resolved } from "./types";

const DOMAINS: Domain[] = ["book", "brand", "artist", "podcast", "movie", "tv_show", "videogame"];
const VALID = new Set<string>([...Object.keys(DOMAIN_URN), "person"]);

export interface AgentDeps { qloo: Qloo | null; llm?: LlmOptions; emit: (e: AgentEvent) => void }

const PROFILE_SYSTEM = `You read a short description of a person someone wants to buy a gift for.
Return JSON: {"label": string (how the giver refers to them, e.g. "your sister"), "occasion": string ("" if none), "budget": string ("" if none), "location": string (city, "" if none),
"interests": [{"name": string (the exact title/artist/brand/place as a catalogue would spell it), "type": one of book|brand|artist|podcast|movie|tv_show|videogame|place|person (artist = musicians only; a chef, writer or TV presenter is person)}],
"vibes": [up to 3 short taste words the text implies, e.g. "cozy", "minimalist"]}.
Only include things the text names or clearly implies. Never invent titles. Max 8 interests.`;

export function sanitizeProfile(raw: any): Profile {
  const interests = (Array.isArray(raw?.interests) ? raw.interests : [])
    .filter((i: any) => i && typeof i.name === "string" && i.name.trim() && VALID.has(i.type))
    .slice(0, 8)
    .map((i: any) => ({ name: i.name.trim().slice(0, 80), type: i.type as Domain | "person" }));
  return {
    label: String(raw?.label ?? "them").slice(0, 60),
    occasion: String(raw?.occasion ?? "").slice(0, 60),
    budget: String(raw?.budget ?? "").slice(0, 40),
    location: String(raw?.location ?? "").slice(0, 60),
    interests,
    vibes: (Array.isArray(raw?.vibes) ? raw.vibes : []).filter((v: any) => typeof v === "string").slice(0, 3),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function pickMatch(input: string, results: any[]): Resolved | undefined {
  const ents = results.map(entityOf).filter(Boolean) as NonNullable<ReturnType<typeof entityOf>>[];
  if (!ents.length) return undefined;
  const exact = ents.find((e) => norm(e.name) === norm(input));
  const e = exact ?? ents[0];
  return { input, id: e.id, name: e.name, type: "book", description: e.description };
}

/** Keep one candidate per id, merge their cites, drop things the person already named. */
export function mergeCandidates(list: Candidate[], owned: Set<string>): Candidate[] {
  const m = new Map<string, Candidate>();
  for (const c of list) {
    if (owned.has(c.id)) continue;
    const prev = m.get(c.id);
    if (!prev) m.set(c.id, { ...c, cites: [...c.cites] });
    else prev.cites = [...new Set([...prev.cites, ...c.cites])];
  }
  return [...m.values()];
}

/** Choose up to n picks spread across domains, highest affinity first. */
export function diversify(cands: Candidate[], n = 8): Candidate[] {
  const byDomain = new Map<Domain, Candidate[]>();
  for (const c of [...cands].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0))) {
    byDomain.set(c.domain, [...(byDomain.get(c.domain) ?? []), c]);
  }
  const out: Candidate[] = [];
  while (out.length < n && [...byDomain.values()].some((l) => l.length)) {
    for (const l of byDomain.values()) { const c = l.shift(); if (c && out.length < n) out.push(c); }
  }
  return out;
}

const COMPOSE_SYSTEM = `You are a gift advisor. You receive a person profile, their taste tags and a list of CANDIDATES that Qloo's taste data linked to things they love.
Choose 5 to 8 candidates from different categories and write a gift for each.
Return JSON: {"gifts":[{"candidate_id": string (copied exactly), "idea": string (max 9 words, the concrete thing to give), "why": string (max 28 words, one sentence naming which loved things it connects to; use only the "linked_to" names for that candidate), "cites": [names copied from linked_to]}]}.
Rules: use only candidate ids from the list. Never invent facts about a candidate beyond its description. Respect the budget if given.`;

export function fallbackGifts(picks: Candidate[], limit = 6): Gift[] {
  return picks.slice(0, limit).map((c) => toGift(c, {
    idea: c.name,
    why: c.cites.length ? `Qloo links this to ${c.cites.slice(0, 3).join(", ")}.` : "Qloo ranks this highly for their taste profile.",
    cites: c.cites,
  }));
}

function toGift(c: Candidate, g: { idea: string; why: string; cites: string[] }): Gift {
  return { candidateId: c.id, name: c.name, domain: c.domain, idea: g.idea, why: g.why, cites: g.cites, affinity: c.affinity, link: giftLink(c.domain, c.name), image: c.image };
}

export function validateGifts(raw: any, cands: Candidate[]): Gift[] {
  const byId = new Map(cands.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: Gift[] = [];
  for (const g of Array.isArray(raw?.gifts) ? raw.gifts : []) {
    const c = byId.get(g?.candidate_id);
    if (!c || seen.has(c.id) || typeof g.why !== "string" || typeof g.idea !== "string") continue;
    seen.add(c.id);
    const cites = (Array.isArray(g.cites) ? g.cites : []).filter((x: any) => c.cites.includes(x));
    out.push(toGift(c, { idea: g.idea.slice(0, 90), why: g.why.slice(0, 220), cites: cites.length ? cites : c.cites.slice(0, 3) }));
  }
  return out.slice(0, 8);
}

export async function runAgent(text: string, deps: AgentDeps): Promise<void> {
  const { qloo, llm, emit } = deps;
  const step = (id: string, label: string, status: "running" | "done" | "skipped", detail?: string, endpoint?: string) =>
    emit({ type: "step", id, label, status, detail, endpoint });

  // 1. Understand the person (LLM)
  step("understand", "Reading who this gift is for", "running");
  let profile: Profile;
  try {
    profile = sanitizeProfile(await chatJson(PROFILE_SYSTEM, text, llm));
  } catch (e) {
    emit({ type: "error", code: e instanceof LlmError ? e.code : "LLM_FAILED", message: "The language step failed. Try again in a moment." });
    return;
  }
  emit({ type: "profile", profile });
  step("understand", "Reading who this gift is for", "done", `${profile.interests.length} loves found`);
  if (!profile.interests.length) {
    emit({ type: "error", code: "NO_ENTITIES", message: "Name at least one show, band, book, brand or place they love." });
    return;
  }
  if (!qloo) {
    emit({ type: "error", code: "QLOO_API_KEY_MISSING", message: "Live taste results need the Qloo API key, which this demo is still waiting for. The step above ran live; nothing below is simulated." });
    return;
  }

  try {
    // 2. Resolve names to Qloo entities: GET /search
    step("resolve", "Matching them in Qloo's taste graph", "running", undefined, "GET /search");
    const found = await Promise.all(profile.interests.map(async (i) => {
      const r = await qloo.search(i.name, i.type === "person" ? undefined : DOMAIN_URN[i.type], 5);
      const hit = pickMatch(i.name, resultList(r, "entities"));
      return hit ? { ...hit, type: i.type } : undefined;
    }));
    const entities = found.filter(Boolean) as Resolved[];
    const unresolved = profile.interests.filter((_, k) => !found[k]).map((i) => i.name);
    emit({ type: "resolved", entities, unresolved });
    step("resolve", "Matching them in Qloo's taste graph", "done", `${entities.length} of ${profile.interests.length} matched`, "GET /search");
    if (!entities.length) { emit({ type: "error", code: "NOTHING_RESOLVED", message: "Qloo did not recognise any of those names. Try the exact titles." }); return; }
    const known = new Map(entities.map((e) => [e.id, e.name]));
    const ids = entities.map((e) => e.id);

    // 3. Vibe words to tags: GET /v2/tags (semantic)
    let tagIds: string[] = [];
    if (profile.vibes.length) {
      step("tags", "Turning their vibe into taste tags", "running", undefined, "GET /v2/tags");
      const tr = await Promise.all(profile.vibes.map((v) => qloo.tags(v, 1).catch(() => ({}))));
      tagIds = tr.flatMap((r) => resultList(r, "tags").map(tagOf).filter(Boolean).map((t) => t!.id)).slice(0, 3);
      step("tags", "Turning their vibe into taste tags", "done", `${tagIds.length} tags`, "GET /v2/tags");
    } else step("tags", "Turning their vibe into taste tags", "skipped");

    // 4. Taste DNA: insights filter.type=urn:tag
    step("dna", "Reading their taste DNA", "running", undefined, "GET /v2/insights (urn:tag)");
    const dna = await qloo.insights({ "filter.type": "urn:tag", "signal.interests.entities": ids, take: 8 });
    const tags = resultList(dna, "tags").map(tagOf).filter(Boolean).map((t) => ({ id: t!.id, name: t!.name }));
    emit({ type: "taste", tags });
    step("dna", "Reading their taste DNA", "done", `${tags.length} defining tags`, "GET /v2/insights (urn:tag)");

    // 5. Cross-category recommendations with explainability
    step("cross", "Searching across books, brands, music, podcasts and screen", "running", undefined, "GET /v2/insights x" + DOMAINS.length);
    const lists = await Promise.all(DOMAINS.map(async (d) => {
      try {
        const r = await qloo.insights({
          "filter.type": DOMAIN_URN[d],
          "signal.interests.entities": ids,
          ...(tagIds.length ? { "signal.interests.tags": tagIds, "operator.signal.interests.tags": "union" } : {}),
          "feature.explainability": true,
          take: 6,
        });
        return resultList(r, "entities").map((raw): Candidate | undefined => {
          const e = entityOf(raw);
          if (!e) return undefined;
          const cites = explainNames(e.explain, known);
          return { id: e.id, name: e.name, domain: d, affinity: e.affinity, description: e.description, image: e.image, cites: cites.length ? cites : entities.slice(0, 3).map((x) => x.name) };
        }).filter(Boolean) as Candidate[];
      } catch (err) {
        if (err instanceof QlooError && (err.code === "QLOO_AUTH" || err.code === "QLOO_RATE_LIMIT")) throw err;
        return [];
      }
    }));
    const cands = mergeCandidates(lists.flat(), new Set(ids));
    step("cross", "Searching across books, brands, music, podcasts and screen", "done", `${cands.length} candidates`, "GET /v2/insights x" + DOMAINS.length);
    if (!cands.length) { emit({ type: "error", code: "NO_CANDIDATES", message: "Qloo returned no recommendations for those signals." }); return; }

    // 6. Compose with the LLM, verified against the candidate list
    step("compose", "Writing the gift ideas", "running");
    const picks = diversify(cands, 14);
    let gifts: Gift[] = [];
    let usedFallback = false;
    try {
      const payload = {
        person: profile,
        taste_tags: tags.map((t) => t.name),
        candidates: picks.map((c) => ({ candidate_id: c.id, name: c.name, category: c.domain, affinity: c.affinity, description: c.description, linked_to: c.cites })),
      };
      gifts = validateGifts(await chatJson(COMPOSE_SYSTEM, JSON.stringify(payload), llm), picks);
    } catch { /* fall through to deterministic ideas */ }
    if (gifts.length < 5) { gifts = fallbackGifts(diversify(cands, 8)); usedFallback = true; }
    emit({ type: "gifts", gifts, usedFallback });
    step("compose", "Writing the gift ideas", "done", `${gifts.length} ideas`);
  } catch (e) {
    if (e instanceof QlooError) emit({ type: "error", code: e.code, message: e.code === "QLOO_AUTH" ? "Qloo rejected the API key." : e.code === "QLOO_RATE_LIMIT" ? "Qloo rate limit reached. Try again shortly." : "Qloo could not be reached. Try again." });
    else emit({ type: "error", code: "UNEXPECTED", message: "Something went wrong." });
  }
}
