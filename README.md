# Giftwise

A gift-finding agent built on the Qloo Insights API for the Qloo Agentic Hackathon.

Describe someone in plain words ("my sister loves Fleabag, Phoebe Bridgers and cozy, melancholy things"). The agent:

1. **Understands** the text with an LLM and extracts named loves plus vibe words.
2. **Resolves** each name to a Qloo entity (`GET /search`).
3. **Maps vibes to taste tags** with Qloo's semantic tag search (`GET /v2/tags`).
4. **Reads their taste DNA** (`GET /v2/insights` with `filter.type=urn:tag`).
5. **Crosses categories** (`GET /v2/insights` for books, brands, music, podcasts, film, series, games) with `signal.interests.entities`, tag signals and `feature.explainability=true`, so every pick carries the loved things that led to it.
6. **Writes 5 to 8 gifts**, each with a one-line reason citing those links and a plain search link to buy or learn more. The LLM may only choose Qloo candidates; ids it invents are dropped (`validateGifts`), and if the writing step fails the raw Qloo picks are shown instead.

Why Qloo matters here: gifts live across categories. The cross-category embedding space is what lets a TV show lead to a hand balm or a record.

## Run it

```sh
npm install
cp .env.example .env.local   # fill QLOO_API_KEY and LLM_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # unit tests, fixtures shaped like Qloo responses
QLOO_API_KEY=... scripts/smoke.sh [https://your-deployment]   # live check against api.qloo.com
```

Environment: `QLOO_API_KEY` (server side only, never sent to the browser), `LLM_API_KEY`, optional `LLM_BASE_URL` (any OpenAI-compatible endpoint, default Agnes) and `LLM_MODEL`.

Without `QLOO_API_KEY` the app still runs the understanding step live and then says plainly that taste results need the key. It never fabricates results.

## Layout

- `lib/qloo.ts` client (base URL, `X-Api-Key`, bounded retries, error codes) and response normalisers
- `lib/agent.ts` the pipeline, emitting step events
- `app/api/gifts` streams the events as NDJSON; `app/page.tsx` renders them as they arrive
- `tests/` fixtures and tests; `scripts/smoke.sh` live check

Endpoint shapes follow the official kit and `@qloo/qloo-harness` 0.1.26 (`--dry-run` output and client) plus docs.qloo.com. The kit recommends a long-running Node host for `qloo mcp`; this project calls the REST API directly from a server route so the key never reaches the browser.

MIT licence, Piotr Sarna.
