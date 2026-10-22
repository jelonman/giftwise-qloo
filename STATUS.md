# Giftwise - Qloo Agentic Hackathon status (2026-10-22)

Demo: https://giftwise-mocha.vercel.app (HTTP 200; /api/status = qloo:false, llm:true)
Repo: https://github.com/jelonman/giftwise-qloo (public, MIT, Piotr Sarna)
Deadline: 2026-10-30 23:45 EDT

## Built
- Next.js 15 app, streaming agent (NDJSON) with animated step trail, taste-DNA tags, gift cards.
- Pipeline: LLM extracts loves/vibes -> Qloo GET /search -> GET /v2/tags (semantic) -> GET /v2/insights urn:tag (taste DNA)
  -> GET /v2/insights x7 categories with signal.interests.entities/tags + feature.explainability -> LLM writes 5-8 gifts,
  validated against Qloo candidates (invented ids dropped; raw-Qloo fallback if the writing step fails).
- Single env var QLOO_API_KEY (server only). LLM: owner's Agnes key (LLM_API_KEY on Vercel prod, not in repo).
- Without the key the demo runs the understanding step live and states plainly that taste results need the key. Nothing faked.
- Endpoint/shape sources: kit docs/API_ACCESS.md, kit starter/cli-workflow/README.md, @qloo/qloo-harness 0.1.26 (--dry-run output + QlooClient), docs.qloo.com MCP pages (insights-api, cross-category-insights, interpreting-affinity-scores).
- impeccable detect: 0 findings after fixing gradient-text and side-tab.

## Tests
`npm test`: 2 files, 16 tests passed (client headers/params/retry/auth, normalisers, matching, ranking, hallucination guard, full agent run on fixtures, no-key path, bad-key path). `tsc --noEmit` clean. `next build` ok.
Fixtures are invented names in the documented response shape (results.entities[], query.affinity, query.explainability, results.tags[]).

## Remaining
1. Qloo key (email to petesarney@gmail.com): `vercel env add QLOO_API_KEY production`, redeploy, then `QLOO_API_KEY=... scripts/smoke.sh https://giftwise-mocha.vercel.app`.
2. Live check of unverified shapes: explainability blob structure (cites currently fall back to the top signal names if not parsable), tag operator `union` accepted on signal.interests.tags, `urn:entity:artist` as filter.type. Fix from smoke output.
3. Visual pass in a real browser (not done: no browser allowed this run). Desktop + mobile once.
4. Demo video (about 2 min: describe person, watch steps, gifts with reasons).
5. Devpost text: problem, how Qloo is used (7-step list above), what we learned; link demo + repo.
Note: kit says serverless is not a supported route for `qloo mcp`; we call the REST API directly from a server route instead.
