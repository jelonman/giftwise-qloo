"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentEvent, Gift, Profile, Resolved } from "@/lib/types";

interface Step { id: string; label: string; status: "running" | "done" | "skipped"; detail?: string; endpoint?: string }

const EXAMPLES = [
  "My sister is turning 30. She loves Fleabag, Phoebe Bridgers, Normal People by Sally Rooney and anything cozy and a little melancholy. Budget around 60 euros.",
  "Dad is retiring. He is into Miles Davis, Anthony Bourdain, Breaking Bad and Patagonia. Nothing gadgety.",
  "My best friend lives in Berlin, obsessed with Studio Ghibli, Tame Impala and ramen. Birthday next week.",
];

const LABEL: Record<string, string> = { book: "Book", brand: "Brand", artist: "Music", podcast: "Podcast", movie: "Film", tv_show: "Series", videogame: "Game", place: "Place" };

export default function Home() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resolved, setResolved] = useState<{ entities: Resolved[]; unresolved: string[] } | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [status, setStatus] = useState<{ qloo: boolean; llm: boolean } | null>(null);
  const out = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null)); }, []);

  async function go() {
    if (busy || text.trim().length < 8) return;
    setBusy(true); setSteps([]); setProfile(null); setResolved(null); setTags([]); setGifts([]); setError(null); setFallback(false);
    setTimeout(() => out.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const res = await fetch("/api/gifts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok || !res.body) { setError({ code: "HTTP", message: (await res.json().catch(() => ({}))).error ?? "Request failed." }); return; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (line) apply(JSON.parse(line) as AgentEvent);
        }
      }
    } catch { setError({ code: "NETWORK", message: "Connection lost. Try again." }); }
    finally { setBusy(false); }
  }

  function apply(e: AgentEvent) {
    if (e.type === "step") setSteps((s) => { const k = s.findIndex((x) => x.id === e.id); const n = { id: e.id, label: e.label, status: e.status, detail: e.detail, endpoint: e.endpoint ?? s[k]?.endpoint }; return k < 0 ? [...s, n] : s.map((x, j) => (j === k ? n : x)); });
    else if (e.type === "profile") setProfile(e.profile);
    else if (e.type === "resolved") setResolved({ entities: e.entities, unresolved: e.unresolved });
    else if (e.type === "taste") setTags(e.tags.map((t) => t.name));
    else if (e.type === "gifts") { setGifts(e.gifts); setFallback(e.usedFallback); }
    else if (e.type === "error") setError({ code: e.code, message: e.message });
  }

  const started = busy || steps.length > 0 || error;

  return (
    <main>
      <div className="aurora" aria-hidden><i /><i /><i /></div>
      <header className="hero">
        <div className="brand"><span className="ribbon" aria-hidden />Giftwise</div>
        <h1>Gifts that already <em>know</em> them.</h1>
        <p className="lede">Tell us who it is for in your own words. An agent reads their taste through Qloo, crosses it from books to brands to music, and hands back ideas that say why they fit.</p>
        <div className={"pill " + (status?.qloo ? "live" : "wait")}>
          <span className="dot" />{status === null ? "Checking connection" : status.qloo ? "Qloo live" : "Waiting for the Qloo API key: understanding runs live, taste results do not yet"}
        </div>
      </header>

      <section className="composer" aria-label="Describe the person">
        <label htmlFor="who" className="sr">Describe the person</label>
        <textarea id="who" value={text} onChange={(e) => setText(e.target.value)} maxLength={1200} rows={4}
          placeholder="Who is it for, and what do they love? Shows, artists, books, brands, places, food." onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") go(); }} />
        <div className="row">
          <div className="examples">{EXAMPLES.map((x, i) => <button key={i} type="button" className="ex" onClick={() => setText(x)}>{x.split(".")[0].slice(0, 34)}…</button>)}</div>
          <button className="go" onClick={go} disabled={busy || text.trim().length < 8}>{busy ? "Reading their taste" : "Find gifts"}<span aria-hidden>→</span></button>
        </div>
      </section>

      <div ref={out} className="stage">
        {started && (
          <section className="trail" aria-live="polite" aria-label="What the agent is doing">
            {steps.map((s) => (
              <div key={s.id} className={"step " + s.status}>
                <span className="mark">{s.status === "done" ? "✓" : s.status === "skipped" ? "–" : <b className="spin" />}</span>
                <span className="lab">{s.label}</span>
                {s.detail && <span className="det">{s.detail}</span>}
                {s.endpoint && <code>{s.endpoint}</code>}
              </div>
            ))}
          </section>
        )}

        {profile && (
          <section className="who">
            <h2>{profile.label}{profile.occasion ? ` · ${profile.occasion}` : ""}{profile.budget ? ` · ${profile.budget}` : ""}</h2>
            <div className="chips">
              {profile.interests.map((i) => {
                const hit = resolved?.entities.find((r) => r.input === i.name);
                const miss = resolved?.unresolved.includes(i.name);
                return <span key={i.name} className={"chip " + i.type + (miss ? " miss" : "")} title={hit ? `Matched: ${hit.name}` : miss ? "Not found in Qloo" : "Matching…"}><small>{LABEL[i.type]}</small>{hit?.name ?? i.name}{hit && <u>✓</u>}</span>;
              })}
            </div>
          </section>
        )}

        {tags.length > 0 && (
          <section className="dna" aria-label="Taste DNA">
            <h3>Their taste DNA</h3>
            <div className="chips">{tags.map((t, i) => <span key={t} className="tag" style={{ animationDelay: `${i * 70}ms` }}>{t}</span>)}</div>
          </section>
        )}

        {error && (
          <section className={"note " + (error.code === "QLOO_API_KEY_MISSING" ? "wait" : "bad")} role="status">
            <strong>{error.code === "QLOO_API_KEY_MISSING" ? "Live taste data is not switched on yet" : "That did not work"}</strong>
            <p>{error.message}</p>
          </section>
        )}

        {gifts.length > 0 && (
          <section className="gifts" aria-label="Gift ideas">
            <h2>{gifts.length} ideas that fit</h2>
            {fallback && <p className="sub">The writing step was unavailable, so these are Qloo&apos;s raw picks.</p>}
            <div className="grid">
              {gifts.map((g, i) => (
                <article key={g.candidateId} className={"card " + g.domain} style={{ animationDelay: `${i * 90}ms` }}>
                  <div className="top"><span className="badge">{LABEL[g.domain]}</span>{typeof g.affinity === "number" && <span className="aff" title="Qloo affinity score"><i style={{ width: `${Math.round(g.affinity * 100)}%` }} /></span>}</div>
                  <h3>{g.idea}</h3>
                  <p className="nm">{g.name}</p>
                  <p className="why">{g.why}</p>
                  {g.cites.length > 0 && <div className="via">{g.cites.slice(0, 3).map((c) => <span key={c}>{c}</span>)}</div>}
                  <a href={g.link} target="_blank" rel="noopener noreferrer">Find it <span aria-hidden>↗</span></a>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer>Built for the Qloo Agentic Hackathon. Taste data by Qloo; wording by an LLM that may only choose from what Qloo returned. Links are plain searches, no affiliate tags.</footer>
    </main>
  );
}
