import { describe, expect, it } from "vitest";
import { Qloo, QlooError, entityOf, explainNames, resultList, tagOf } from "../lib/qloo";
import { fakeQloo, fakeQlooFetch, j } from "./helpers";
import * as F from "./fixtures";

describe("Qloo client", () => {
  it("refuses to start without a key", () => {
    const old = process.env.QLOO_API_KEY; delete process.env.QLOO_API_KEY;
    expect(() => new Qloo()).toThrowError(QlooError);
    if (old) process.env.QLOO_API_KEY = old;
  });
  it("sends X-Api-Key to api.qloo.com with documented param names", async () => {
    const log: URL[] = [];
    const q = new Qloo({ apiKey: "test-key", fetch: fakeQlooFetch(log), sleep: async () => {} });
    await q.search("Fleabag", "urn:entity:tv_show", 5);
    await q.tags("cozy", 1);
    await q.insights({ "filter.type": "urn:entity:book", "signal.interests.entities": ["A", "B"], "feature.explainability": true, take: 6 });
    expect(log.map((u) => u.origin)).toEqual(Array(3).fill("https://api.qloo.com"));
    expect(log[0].pathname).toBe("/search");
    expect(log[0].searchParams.get("types")).toBe("urn:entity:tv_show");
    expect(log[1].pathname).toBe("/v2/tags");
    expect(log[1].searchParams.get("filter.query")).toBe("cozy");
    expect(log[1].searchParams.get("feature.semantic_search")).toBe("true");
    expect(log[2].searchParams.get("signal.interests.entities")).toBe("A,B");
    expect(log[2].searchParams.get("feature.explainability")).toBe("true");
  });
  it("maps 401 to QLOO_AUTH without retrying", async () => {
    let n = 0;
    const q = new Qloo({ apiKey: "bad", fetch: (async () => { n++; return j({}, 401); }) as typeof fetch, sleep: async () => {} });
    await expect(q.search("x")).rejects.toMatchObject({ code: "QLOO_AUTH" });
    expect(n).toBe(1);
  });
  it("retries 429 a bounded number of times", async () => {
    let n = 0;
    const q = new Qloo({ apiKey: "k", maxAttempts: 3, fetch: (async () => { n++; return j({}, 429); }) as typeof fetch, sleep: async () => {} });
    await expect(q.search("x")).rejects.toMatchObject({ code: "QLOO_RATE_LIMIT" });
    expect(n).toBe(3);
  });
  it("recovers after one 503", async () => {
    let n = 0;
    const q = new Qloo({ apiKey: "k", fetch: (async () => (++n === 1 ? j({}, 503) : j(F.dnaTags))) as typeof fetch, sleep: async () => {} });
    expect(resultList(await q.insights({}), "tags")).toHaveLength(2);
  });
});

describe("normalisers", () => {
  it("reads entities, tags and affinity from documented shapes", () => {
    const e = entityOf(F.insightsByType["urn:entity:book"].results.entities[0])!;
    expect(e).toMatchObject({ id: "B1", name: "Conversations with Friends", affinity: 0.92 });
    expect(tagOf(F.dnaTags.results.tags[0])).toMatchObject({ id: "urn:tag:genre:media:comedy_drama", name: "Comedy-drama" });
    expect(resultList({ results: [1, 2] }, "entities")).toEqual([1, 2]);
    expect(entityOf({ name: "no id" })).toBeUndefined();
  });
  it("finds signal names inside an explainability blob of unknown depth", () => {
    const known = new Map([["ENT-FLEABAG", "Fleabag"]]);
    expect(explainNames({ a: [{ b: { entity_id: "ENT-FLEABAG" } }] }, known)).toEqual(["Fleabag"]);
    expect(explainNames(undefined, known)).toEqual([]);
  });
});
