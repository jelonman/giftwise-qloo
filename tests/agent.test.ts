import { describe, expect, it } from "vitest";
import { diversify, mergeCandidates, pickMatch, runAgent, sanitizeProfile, validateGifts } from "../lib/agent";
import type { AgentEvent, Candidate } from "../lib/types";
import { fakeLlm, fakeQloo } from "./helpers";
import * as F from "./fixtures";

const llm = (compose: unknown = F.composeReply) => ({ apiKey: "x", baseUrl: "https://llm.test/v1", fetch: fakeLlm(F.profileReply, compose) });
const collect = async (qloo: any, l: any) => { const ev: AgentEvent[] = []; await runAgent("My sister loves Fleabag", { qloo, llm: l, emit: (e) => ev.push(e) }); return ev; };

describe("profile", () => {
  it("drops interests with an unknown type", () => {
    const p = sanitizeProfile(F.profileReply);
    expect(p.interests.map((i) => i.name)).toEqual(["Fleabag", "Phoebe Bridgers", "Normal People"]);
  });
});
describe("matching and ranking", () => {
  it("prefers the exact name over the first hit", () => {
    const r = pickMatch("Fleabag: The Scriptures", F.searchFleabag.results)!;
    expect(r.id).toBe("ENT-FLEABAG-2");
  });
  it("merges duplicates and removes things the person already named", () => {
    const c = (id: string, cites: string[]): Candidate => ({ id, name: id, domain: "book", cites });
    const m = mergeCandidates([c("a", ["x"]), c("a", ["y"]), c("own", [])], new Set(["own"]));
    expect(m).toHaveLength(1); expect(m[0].cites).toEqual(["x", "y"]);
  });
  it("spreads picks across categories", () => {
    const mk = (id: string, domain: any, affinity: number): Candidate => ({ id, name: id, domain, affinity, cites: [] });
    const out = diversify([mk("b1", "book", 0.9), mk("b2", "book", 0.89), mk("b3", "book", 0.88), mk("a1", "artist", 0.5), mk("p1", "podcast", 0.4)], 3);
    expect(out.map((c) => c.domain).sort()).toEqual(["artist", "book", "podcast"]);
  });
  it("rejects gifts whose id Qloo never returned and cites not linked to the pick", () => {
    const cands: Candidate[] = [{ id: "A1", name: "Big Thief", domain: "artist", cites: ["Fleabag"] }];
    const g = validateGifts(F.composeReply, cands);
    expect(g).toHaveLength(1); expect(g[0].cites).toEqual(["Fleabag"]);
  });
});
describe("full agent run with fake Qloo + fake LLM", () => {
  it("emits steps, entities, taste tags and 5+ gifts with links", async () => {
    const ev = await collect(fakeQloo(), llm());
    const gifts = ev.find((e) => e.type === "gifts") as Extract<AgentEvent, { type: "gifts" }>;
    expect(gifts.usedFallback).toBe(false);
    expect(gifts.gifts.length).toBeGreaterThanOrEqual(5);
    expect(gifts.gifts.every((g) => g.link.startsWith("https://") && g.why.length > 0)).toBe(true);
    expect(gifts.gifts.map((g) => g.candidateId)).not.toContain("NOT-REAL");
    expect(gifts.gifts.map((g) => g.candidateId)).not.toContain("ENT-NP"); // already loved, never gifted back
    const resolved = ev.find((e) => e.type === "resolved") as any;
    expect(resolved.entities.map((e: any) => e.name)).toEqual(["Fleabag", "Phoebe Bridgers", "Normal People"]);
    expect((ev.find((e) => e.type === "taste") as any).tags[0].name).toBe("Comedy-drama");
    expect(ev.some((e) => e.type === "error")).toBe(false);
  });
  it("falls back to raw Qloo picks if the writing step returns nonsense", async () => {
    const ev = await collect(fakeQloo(), llm({ gifts: [] }));
    const gifts = ev.find((e) => e.type === "gifts") as any;
    expect(gifts.usedFallback).toBe(true); expect(gifts.gifts.length).toBeGreaterThanOrEqual(5);
  });
  it("without a Qloo key: runs the understanding step, then says so and returns no gifts", async () => {
    const ev = await collect(null, llm());
    expect(ev.some((e) => e.type === "profile")).toBe(true);
    expect(ev.some((e) => e.type === "gifts")).toBe(false);
    expect(ev.find((e) => e.type === "error")).toMatchObject({ code: "QLOO_API_KEY_MISSING" });
  });
  it("reports a rejected key", async () => {
    const { Qloo } = await import("../lib/qloo");
    const bad = new Qloo({ apiKey: "wrong", fetch: (await import("./helpers")).fakeQlooFetch(), sleep: async () => {} });
    const ev = await collect(bad, llm());
    expect(ev.find((e) => e.type === "error")).toMatchObject({ code: "QLOO_AUTH" });
  });
});
