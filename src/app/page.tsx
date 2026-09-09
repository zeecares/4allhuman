"use client";

import { useState } from "react";
import { analyzePair, makeMcq, scoreMcq } from "@/lib/radar";

type ScoreResult = {
  score: number;
  breakdown: { label: string; got: number; max: number }[];
};

type ScanResponse = {
  scan: {
    url: string;
    reachable: boolean;
    robotsFound: boolean;
    blockedCrawlers: string[];
    openCrawlers: string[];
    verdicts: { userAgent: string; allowed: boolean; reason: string }[];
    metaTagsFound: string[];
    aiTxtFound: boolean;
    scannedAt: string;
  };
  artifacts: {
    robotsSnippet: string;
    fullRobotsTxt: string;
    aiTxt: string;
    metaTags: string;
    legalNotice: string;
    rslXml: string;
  };
  score: ScoreResult;
};

type VerifyResponse = {
  score: ScoreResult;
  blockedCrawlers: string[];
  openCrawlers: string[];
};

type ProbeData = {
  domain: string;
  probes: string[];
  sourceHash: string;
  wordCount: number;
};

type CcCrawl = { id: string; name: string; captures: number | null; error?: string };
type CcResponse = {
  domain: string;
  inCorpus: boolean;
  totalCaptures: number;
  indexesChecked: number;
  crawls: CcCrawl[];
  checkedAt: string;
};

type EngineAnalysis = {
  engine: string;
  containment: number;
  level: "CLEAN" | "SUSPICIOUS" | "COPIED";
  matches: { source: string; answer: string }[];
};

const EXAMPLES = [
  { label: "en.wikipedia.org — unprotected", url: "en.wikipedia.org" },
  { label: "www.theverge.com — partial", url: "www.theverge.com" },
];

function scoreClass(score: number) {
  if (score >= 80) return "score-good";
  if (score >= 40) return "score-mid";
  return "score-bad";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy-btn"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "copied ✓" : "copy"}
    </button>
  );
}

/** Link to the raw evidence so every claim can be checked by hand. */
function EvidenceLink({ url, path }: { url: string; path: string }) {
  return (
    <a className="evidence-link" href={`${url}${path}`} target="_blank" rel="noreferrer noopener">
      view live ↗
    </a>
  );
}

function SkeletonCard() {
  return (
    <div className="card" aria-busy="true">
      <h2>
        <span className="num">··</span> SCANNING…
      </h2>
      <div className="body">
        <div className="skeleton-line" />
        <div className="skeleton-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton-chip" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);

  // radar state — manual flow: generate probes, user asks engines, pastes back
  const [radarUrl, setRadarUrl] = useState("");
  const [radarText, setRadarText] = useState("");
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [probeData, setProbeData] = useState<ProbeData | null>(null);
  const [sourceForAnalysis, setSourceForAnalysis] = useState("");
  const [engineResponses, setEngineResponses] = useState<Record<string, string>>({});
  const [analyses, setAnalyses] = useState<EngineAnalysis[] | null>(null);

  // common crawl state
  const [ccDomain, setCcDomain] = useState("");
  const [ccLoading, setCcLoading] = useState(false);
  const [ccError, setCcError] = useState<string | null>(null);
  const [ccData, setCcData] = useState<CcResponse | null>(null);

  // de-cop state
  const [mcqItems, setMcqItems] = useState<ReturnType<typeof makeMcq> | null>(null);
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, string>>({});
  const [mcqScore, setMcqScore] = useState<ReturnType<typeof scoreMcq>>(null);

  // verify-your-fix state
  const [robotsDraft, setRobotsDraft] = useState("");
  const [aiTxtDraft, setAiTxtDraft] = useState("");
  const [metaDraft, setMetaDraft] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyResponse | null>(null);

  async function runScan(target: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    setVerified(null);
    try {
      const res = await fetch("/api/protect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResult(data);
      setCcDomain(new URL(data.scan.url).hostname); // prefill corpus check
      // prefill verification drafts with our generated artifacts
      setRobotsDraft(data.artifacts.fullRobotsTxt);
      setAiTxtDraft(data.artifacts.aiTxt);
      setMetaDraft(data.artifacts.metaTags);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    runScan(url);
  }

  const ENGINE_NAMES = ["ChatGPT", "Perplexity", "Claude", "Gemini"];

  async function generateProbes() {
    setRadarLoading(true);
    setRadarError(null);
    setProbeData(null);
    setAnalyses(null);
    try {
      const res = await fetch("/api/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(radarUrl.trim() ? { url: radarUrl.trim() } : { text: radarText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Probe generation failed");
      setProbeData({ domain: data.domain, probes: data.probes, sourceHash: data.sourceHash, wordCount: data.wordCount });
      setSourceForAnalysis(data.sourceText ?? ""); // kept locally, never leaves the browser again

    } catch (err) {
      setRadarError(err instanceof Error ? err.message : "Probe generation failed");
    } finally {
      setRadarLoading(false);
    }
  }

  function analyzeResponses() {
    if (!probeData) return;
    const results: EngineAnalysis[] = [];
    for (const engine of ENGINE_NAMES) {
      const response = (engineResponses[engine] ?? "").trim();
      if (!response) continue;
      const a = analyzePair(sourceForAnalysis, response);
      results.push({ engine, ...a });
    }
    setAnalyses(results.length ? results : []);
  }

  async function checkCommonCrawl(domain?: string) {
    const target = (domain ?? ccDomain).trim();
    if (!target) return;
    setCcLoading(true);
    setCcError(null);
    setCcData(null);
    try {
      const res = await fetch(`/api/commoncrawl?domain=${encodeURIComponent(target)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Common Crawl lookup failed");
      setCcData(data);
    } catch (err) {
      setCcError(err instanceof Error ? err.message : "Common Crawl lookup failed");
    } finally {
      setCcLoading(false);
    }
  }

  function generateMcq() {
    if (!sourceForAnalysis) return;
    setMcqItems(makeMcq(sourceForAnalysis, 3));
    setMcqAnswers({});
    setMcqScore(null);
  }

  function analyzeMcq() {
    if (!mcqItems) return;
    setMcqScore(scoreMcq(mcqItems, mcqAnswers));
  }

  function downloadEvidencePack() {
    if (!probeData || !analyses) return;
    const pack = {
      tool: "Don't Train On Me — Radar v0.2 (manual probe mode)",
      generatedAt: new Date().toISOString(),
      subject: probeData.domain,
      sourceSha256: probeData.sourceHash,
      probesUsed: probeData.probes,
      findings: analyses.map((a) => ({
        engine: a.engine,
        verdict: a.level,
        containmentPercent: a.containment,
        matchedSpans: a.matches.map((m) => m.answer),
      })),
      methodology:
        "Word 8-gram containment between user-collected engine answers and source text; >=10% = COPIED, 2-9% = SUSPICIOUS. Analysis performed locally in the creator's browser.",
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `evidence-pack-${probeData.domain}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleVerify() {
    setVerifying(true);
    setVerifyError(null);
    setVerified(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ robotsTxt: robotsDraft, aiTxt: aiTxtDraft, metaHtml: metaDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      setVerified(data);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main>
      <h1>
        <span className="shield">🛡️</span> Don&apos;t Train On Me
      </h1>
      <p className="tagline">
        Measure your site&apos;s exposure to AI training crawlers. Deploy machine-readable opt-outs.
        Verify the fix yourself. Every result links to the raw evidence.
      </p>

      {/* ── 01 · input ── */}
      <form className="scan-form" onSubmit={handleScan}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="yourdomain.com"
          required
          type="text"
        />
        <button disabled={loading} type="submit">
          {loading ? "Scanning…" : "Scan"}
        </button>
      </form>

      <div className="examples">
        <span>or try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.url}
            className="example-btn"
            disabled={loading}
            onClick={() => {
              setUrl(ex.url);
              runScan(ex.url);
            }}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {error && <p className="error">⚠️ {error}</p>}
      {loading && <SkeletonCard />}

      {result && !loading && (
        <>
          {!result.scan.reachable && (
            <p className="error">
              ⚠️ Site unreachable — score shown is worst-case. Generated artifacts below remain valid
              to deploy.
            </p>
          )}

          {/* ── 02 · verdict ── */}
          <section className="card">
            <h2>
              <span className="num">02</span> VERDICT — {result.scan.url}
              <span className="muted-right">scanned {new Date(result.scan.scannedAt ?? Date.now()).toUTCString()}</span>
            </h2>
            <div className="body score-row">
              <div className={`score-big ${scoreClass(result.score.score)}`}>
                {result.score.score}
                <span className="score-sub">EXPOSURE SCORE / 100</span>
              </div>
              <ul className="breakdown">
                {result.score.breakdown.map((b) => (
                  <li key={b.label}>
                    <span>{b.label}</span>
                    <b>
                      {b.got}/{b.max}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
            <p className="method-note">
              Score = weighted coverage of known opt-out signals. Weights are fixed and published —
              no black box, no account, nothing stored.
            </p>
          </section>

          {/* ── 03 · evidence ── */}
          <section className="card">
            <h2>
              <span className="num">03</span> EVIDENCE — AI TRAINING CRAWLERS
              <EvidenceLink path="/robots.txt" url={result.scan.url} />
            </h2>
            <div className="body crawler-grid">
              {[...result.scan.blockedCrawlers, ...result.scan.openCrawlers].map((ua) => {
                const blocked = result.scan.blockedCrawlers.includes(ua);
                const reason = result.scan.verdicts?.find((v) => v.userAgent === ua)?.reason;
                return (
                  <div
                    key={ua}
                    className={`chip ${blocked ? "blocked" : "open"}`}
                    title={reason}
                  >
                    <span className="led" />
                    <span className="ua">{ua}</span>
                    <span className="state">{blocked ? "BLOCKED" : "CAN TRAIN"}</span>
                  </div>
                );
              })}
            </div>
            <p className="method-note">
              Read directly from this site&apos;s live robots.txt at scan time — follow the link above
              to check it yourself. Verdicts use full RFC 9309 matching: most specific user-agent
              group, longest-match rules, allow-wins ties, and * / $ wildcards. Hover any crawler
              to see the exact rule and line that decided it.
            </p>
          </section>

          {/* ── 04 · common crawl corpus check ── */}
          <section className="card">
            <h2>
              <span className="num">04</span> COMMON CRAWL — ARE YOU ALREADY IN THE TRAINING CORPUS?
            </h2>
            <div className="body">
              <p className="method-note" style={{ borderTop: "none", margin: "0 0 12px" }}>
                Common Crawl is the open web corpus most AI training datasets are built from. We
                check the six latest monthly indexes for your domain — free, keyless, factual.
              </p>
              <div className="scan-form" style={{ marginBottom: 12 }}>
                <input
                  onChange={(e) => setCcDomain(e.target.value)}
                  placeholder="example.com"
                  value={ccDomain}
                />
                <button disabled={ccLoading || !ccDomain.trim()} onClick={() => checkCommonCrawl()}>
                  {ccLoading ? "Checking indexes…" : "Check corpus"}
                </button>
              </div>
              {ccError && <p className="error">⚠️ {ccError}</p>}
              {ccData && (
                <>
                  <div className="score-row" style={{ marginBottom: 12 }}>
                    <div
                      className={`score-big ${ccData.inCorpus ? "score-bad" : "score-good"}`}
                      style={{ fontSize: "2.2rem", minWidth: 130 }}
                    >
                      {ccData.inCorpus ? "YES" : "NO"}
                      <span className="score-sub">IN CORPUS</span>
                    </div>
                    <ul className="breakdown">
                      {ccData.crawls.map((c) => (
                        <li key={c.id}>
                          <span>
                            {c.name}
                            {c.error ? ` (${c.error})` : ""}
                          </span>
                          <b>{c.captures === null ? "—" : c.captures}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="method-note" style={{ borderTop: "none", margin: 0 }}>
                    Numbers are capture counts (capped at 200 per index). Being in Common Crawl
                    means AI trainers could have taken it — not proof that a specific model did.
                  </p>
                </>
              )}
            </div>
          </section>

          {/* ── 04 · the fix ── */}
          <section className="card">
            <h2>
              <span className="num">05</span> THE FIX — APPEND TO ROBOTS.TXT
              <CopyButton text={result.artifacts.robotsSnippet} />
            </h2>
            <div className="body">
              <pre>{result.artifacts.fullRobotsTxt}</pre>
              <p className="method-note">
                This doubles as your rights reservation under EU DSM Directive Art. 4(3), which
                general-purpose AI providers must honor per EU AI Act Art. 53(1)(c). It binds only
                compliant crawlers — see “what this can and cannot do” below.
              </p>
            </div>
          </section>

          {/* ── 05 · verify ── */}
          <section className="card verify-card">
            <h2>
              <span className="num">06</span> VERIFY THE FIX — PASTE WHAT YOU DEPLOYED
            </h2>
            <div className="body">
              <label className="draft-label">
                robots.txt (as deployed)
                <textarea
                  onChange={(e) => setRobotsDraft(e.target.value)}
                  rows={8}
                  value={robotsDraft}
                />
              </label>
              <div className="draft-row">
                <label className="draft-label grow">
                  /ai.txt (optional)
                  <textarea
                    onChange={(e) => setAiTxtDraft(e.target.value)}
                    rows={4}
                    value={aiTxtDraft}
                  />
                </label>
                <label className="draft-label grow">
                  &lt;head&gt; meta tags (optional)
                  <textarea
                    onChange={(e) => setMetaDraft(e.target.value)}
                    rows={4}
                    value={metaDraft}
                  />
                </label>
              </div>
              <button className="verify-btn" disabled={verifying} onClick={handleVerify}>
                {verifying ? "Verifying…" : "Re-score deployment →"}
              </button>
              {verifyError && <p className="error">⚠️ {verifyError}</p>}

              {verified && (
                <div className="after-row">
                  <div className={`score-big ${scoreClass(result.score.score)}`}>
                    {result.score.score}
                    <span className="score-sub">BEFORE</span>
                  </div>
                  <div className="arrow">→</div>
                  <div className={`score-big ${scoreClass(verified.score.score)}`}>
                    {verified.score.score}
                    <span className="score-sub">AFTER</span>
                  </div>
                  <ul className="breakdown">
                    {verified.score.breakdown.map((b) => (
                      <li key={b.label}>
                        <span>{b.label}</span>
                        <b>
                          {b.got}/{b.max}
                        </b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* ── 06–08 · remaining artifacts ── */}
          <section className="card">
            <h2>
              <span className="num">07</span> ALSO PUBLISH AT /AI.TXT
              <CopyButton text={result.artifacts.aiTxt} />
            </h2>
            <div className="body">
              <pre>{result.artifacts.aiTxt}</pre>
            </div>
          </section>

          <section className="card">
            <h2>
              <span className="num">08</span> ADD TO EVERY PAGE&apos;S &lt;HEAD&gt;
              <CopyButton text={result.artifacts.metaTags} />
            </h2>
            <div className="body">
              <pre>{result.artifacts.metaTags}</pre>
            </div>
          </section>

          <section className="card">
            <h2>
              <span className="num">09</span> LEGAL NOTICE OF RESERVED RIGHTS
              <CopyButton text={result.artifacts.legalNotice} />
            </h2>
            <div className="body">
              <pre>{result.artifacts.legalNotice}</pre>
            </div>
          </section>
        </>
      )}

      {/* ── 10 · RSL license ── */}
      <section className="card">
        <h2>
          <span className="num">10</span> PUBLISH AT /LICENSE.XML — RSL 1.0 MACHINE-READABLE LICENSE
          {result && <CopyButton text={result.artifacts.rslXml} />}
        </h2>
        <div className="body">
          <pre>{result?.artifacts.rslXml ?? ""}</pre>
          <p className="method-note" style={{ borderTop: "none", marginTop: 10 }}>
            RSL (Really Simple Licensing, rslstandard.org) is the emerging standard for
            machine-readable licensing and payment terms — the robots.txt line in module 05 points
            compliant agents here. This template prohibits AI training/input; swap in a payment
            template to sell licenses instead.
          </p>
        </div>
      </section>

      {/* ── 09 · radar (manual probe mode) ── */}
      <section className="card verify-card">
        <h2>
          <span className="num">11</span> RADAR — CATCH ENGINES REPRODUCING YOUR WORK
        </h2>
        <div className="body">
          <p className="method-note" style={{ borderTop: "none", margin: "0 0 14px" }}>
            Three steps, zero API keys, nothing sent anywhere by us: generate probe questions from
            your article, ask the AI engines yourself, paste their answers back. The plagiarism
            forensics run locally in your browser.
          </p>

          {/* step 1 */}
          <label className="draft-label">STEP 1 — YOUR ORIGINAL WORK</label>
          <div className="draft-row">
            <label className="draft-label grow">
              Article URL
              <input
                className="radar-input"
                onChange={(e) => setRadarUrl(e.target.value)}
                placeholder="https://yoursite.com/your-article"
                value={radarUrl}
              />
            </label>
          </div>
          <label className="draft-label">
            …or paste the full text (≥80 words)
            <textarea
              onChange={(e) => setRadarText(e.target.value)}
              placeholder="Paste your original work here…"
              rows={6}
              value={radarText}
            />
          </label>
          <button
            className="verify-btn"
            disabled={radarLoading || (!radarUrl.trim() && radarText.split(/\s+/).length < 80)}
            onClick={generateProbes}
          >
            {radarLoading ? "Generating probes…" : "Generate probe questions →"}
          </button>
          {radarError && <p className="error">⚠️ {radarError}</p>}

          {probeData && (
            <>
              {/* step 2 */}
              <label className="draft-label" style={{ marginTop: 20 }}>
                STEP 2 — ASK THESE QUESTIONS, PASTE THE ANSWERS BACK
              </label>
              {probeData.probes.map((p, i) => (
                <div key={i} className="card" style={{ marginTop: 8 }}>
                  <h2>
                    <span className="num">Q{i + 1}</span>
                    <CopyButton text={p} />
                  </h2>
                  <div className="body">
                    <pre>{p}</pre>
                  </div>
                </div>
              ))}
              <p className="method-note" style={{ borderTop: "none" }}>
                Paste each question into ChatGPT / Perplexity / Claude / Gemini. If an engine has
                your content in its index or training data, it will answer with suspiciously
                familiar words.
              </p>

              <div className="draft-row" style={{ flexWrap: "wrap", gap: 12 }}>
                {["ChatGPT", "Perplexity", "Claude", "Gemini"].map((engine) => (
                  <label key={engine} className="draft-label grow" style={{ minWidth: 240 }}>
                    {engine}’s answer (optional)
                    <textarea
                      onChange={(e) =>
                        setEngineResponses((prev) => ({ ...prev, [engine]: e.target.value }))
                      }
                      placeholder={`Paste what ${engine} replied…`}
                      rows={5}
                      value={engineResponses[engine] ?? ""}
                    />
                  </label>
                ))}
              </div>
              <button
                className="verify-btn"
                disabled={
                  !Object.values(engineResponses).some((v) => v.trim()) || analyses !== null && !analyses.length
                }
                onClick={analyzeResponses}
              >
                Analyze pasted answers →
              </button>
            </>
          )}

          {/* DE-COP memorization probe */}
          {probeData && (
            <div style={{ marginTop: 24 }}>
              <label className="draft-label">
                MEMORIZATION PROBE (DE-COP METHOD, ARXIV 2402.09910) — DETECTS TRAINING EVEN
                WITHOUT VERBATIM OUTPUT
              </label>
              {!mcqItems ? (
                <button className="copy-btn" onClick={generateMcq}>
                  Generate memorization quiz from your text
                </button>
              ) : (
                <>
                  <p className="method-note" style={{ borderTop: "none", margin: "0 0 12px" }}>
                    Ask any chatbot each question and record the letter it picks. A model that
                    trained on your text picks the verbatim passage above chance (25%). Chance-level
                    results are evidence of innocence — this test cuts both ways.
                  </p>
                  {mcqItems.map((item) => (
                    <div key={item.id} className="card" style={{ marginTop: 8 }}>
                      <h2>
                        <span className="num">Q{item.id + 1}</span>
                        WHICH PASSAGE IS VERBATIM FROM THE SOURCE?
                        <CopyButton
                          text={
                            `Question ${item.id + 1}: Which of these passages appears verbatim in the original article?\n` +
                            item.options.map((o) => `${o.letter}. ${o.text}`).join("\n") +
                            `\nAnswer with just the letter (${item.options.map((o) => o.letter).join("/")}).`
                          }
                        />
                      </h2>
                      <div className="body">
                        {item.options.map((o) => (
                          <div key={o.letter} className="ref-list" style={{ marginBottom: 2 }}>
                            <li>
                              <b>{o.letter}.</b> {o.text.slice(0, 140)}
                              {o.text.length > 140 ? "…" : ""}
                            </li>
                          </div>
                        ))}
                        <div style={{ marginTop: 10 }}>
                          <span className="draft-label" style={{ display: "inline", marginRight: 8 }}>
                            Model picked:
                          </span>
                          {["A", "B", "C", "D"].map((L) => (
                            <button
                              key={L}
                              className="example-btn"
                              style={{
                                marginRight: 6,
                                background: mcqAnswers[item.id] === L ? "var(--orange)" : undefined,
                                color: mcqAnswers[item.id] === L ? "#fff" : undefined,
                              }}
                              onClick={() =>
                                setMcqAnswers((prev) => ({ ...prev, [item.id]: prev[item.id] === L ? "" : L }))
                              }
                            >
                              {L}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button className="verify-btn" disabled={!Object.keys(mcqAnswers).filter(Boolean).length} onClick={analyzeMcq} style={{ marginTop: 12 }}>
                    Score memorization probe →
                  </button>
                  {mcqScore && (
                    <div className="score-row" style={{ marginTop: 16 }}>
                      <div
                        className={`score-big ${mcqScore.aboveChance ? "score-bad" : "score-good"}`}
                        style={{ fontSize: "2rem", minWidth: 120 }}
                      >
                        {mcqScore.correct}/{mcqScore.total}
                        <span className="score-sub">
                          CHANCE IS ~{Math.ceil(mcqScore.chancePct / 100 * mcqScore.total)}/{mcqScore.total}
                        </span>
                      </div>
                      <ul className="breakdown">
                        <li><span>Accuracy</span><b>{mcqScore.accuracyPct}%</b></li>
                        <li><span>Chance level</span><b>{mcqScore.chancePct}%</b></li>
                        <li><span>p-value (approx.)</span><b>{mcqScore.pValueApprox}</b></li>
                        <li>
                          <span>{mcqScore.aboveChance ? "ABOVE CHANCE — possible training signal" : "Not distinguishable from chance"}</span>
                          <b>{mcqScore.aboveChance ? "⚠️" : "✓"}</b>
                        </li>
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* step 3 — verdicts */}
          {analyses && probeData && (
            <div style={{ marginTop: 20 }}>
              <label className="draft-label">STEP 3 — VERDICT</label>
              <div className="score-row">
                <div
                  className={`score-big ${
                    analyses.some((a) => a.level === "COPIED")
                      ? "score-bad"
                      : analyses.some((a) => a.level === "SUSPICIOUS")
                        ? "score-mid"
                        : "score-good"
                  }`}
                >
                  {analyses.length ? Math.max(...analyses.map((a) => a.containment)) : 0}%
                  <span className="score-sub">MAX OVERLAP FOUND</span>
                </div>
                <ul className="breakdown">
                  {analyses.length === 0 && (
                    <li>
                      <span>No answers were pasted.</span>
                      <b>—</b>
                    </li>
                  )}
                  {analyses.map((a) => (
                    <li key={a.engine}>
                      <span>
                        <span className="led" style={{
                          display: "inline-block",
                          marginRight: 8,
                          background:
                            a.level === "COPIED" ? "var(--red)" :
                            a.level === "SUSPICIOUS" ? "var(--orange)" : "var(--green)",
                        }} />
                        {a.engine}: {a.level.toLowerCase()}
                      </span>
                      <b>{a.containment}%</b>
                    </li>
                  ))}
                </ul>
              </div>

              {analyses.filter((a) => a.matches.length).map((a) => (
                <div key={a.engine} className="card" style={{ marginTop: 12 }}>
                  <h2>
                    MATCHED SPANS — {a.engine.toUpperCase()}
                    <span className="muted-right">{a.level} · {a.containment}% overlap</span>
                  </h2>
                  <div className="body">
                    {a.matches.map((m, i) => (
                      <blockquote key={i} className="match-quote">
                        “{m.answer}”
                      </blockquote>
                    ))}
                  </div>
                </div>
              ))}

              <button className="copy-btn" onClick={downloadEvidencePack} style={{ marginTop: 12 }}>
                ⬇ download evidence pack (.json)
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── honesty module: what this can and cannot do ── */}
      <section className="card trust-card">
        <h2>
          <span className="num">§</span> WHAT THIS CAN AND CANNOT DO
        </h2>
        <div className="body trust-body">
          <div>
            <h3>✓ Can</h3>
            <ul>
              <li>Measure exposure against 170+ documented AI crawlers (community ai.robots.txt list)</li>
              <li>Publish legally meaningful opt-outs (EU DSM Art. 4(3))</li>
              <li>Create obligations for GPAI providers under EU AI Act Art. 53(1)(c)</li>
              <li>Verify your deployed configuration, with evidence links</li>
            </ul>
          </div>
          <div>
            <h3>✗ Cannot</h3>
            <ul>
              <li>Physically stop a scraper that ignores robots.txt</li>
              <li>Audit what any model was actually trained on</li>
              <li>Detect unauthorized use of your content post-training</li>
              <li>Replace legal advice — this is a technical control, not counsel</li>
            </ul>
          </div>
        </div>
        <p className="method-note trust-footnote">
          The only complete protection is access control: content that was never fetched cannot be
          trained on. Everything here reduces exposure within the limits of public-web publishing.
        </p>
      </section>

      {/* ── research references ── */}
      <section className="card refs-card">
        <h2>
          <span className="num">§§</span> RESEARCH REFERENCES
        </h2>
        <div className="body">
          <ul className="ref-list">
            <li>
              Directive (EU) 2019/790 on Copyright in the Digital Single Market, Arts. 3–4 (TDM
              exception &amp; opt-out) —{" "}
              <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019L0790" target="_blank" rel="noreferrer noopener">eur-lex.europa.eu</a>
            </li>
            <li>
              Regulation (EU) 2024/1689 (AI Act), Art. 53(1)(c)–(d): GPAI copyright policy &amp;
              training-data summaries —{" "}
              <a href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401689" target="_blank" rel="noreferrer noopener">eur-lex.europa.eu</a>
            </li>
            <li>
              U.S. Copyright Office, <i>Copyright and AI, Part 3: Generative AI Training</i> (May
              2025) —{" "}
              <a href="https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-3-Generative-AI-Training-Report-Pre-Publication-Version.pdf" target="_blank" rel="noreferrer noopener">copyright.gov/ai</a>
            </li>
            <li>
              Glaze: protecting artists from style mimicry —{" "}
              <a href="https://glaze.cs.uchicago.edu/" target="_blank" rel="noreferrer noopener">glaze.cs.uchicago.edu</a>{" "}
              · Nightshade: data poisoning deterrent —{" "}
              <a href="https://nightshade.cs.uchicago.edu/" target="_blank" rel="noreferrer noopener">nightshade.cs.uchicago.edu</a>
            </li>
            <li>
              IETF AI Preferences (aipref) Working Group charter —{" "}
              <a href="https://datatracker.ietf.org/doc/charter-ietf-aipref/" target="_blank" rel="noreferrer noopener">datatracker.ietf.org</a>
            </li>
            <li>
              C2PA Content Credentials provenance standard —{" "}
              <a href="https://c2pa.org/" target="_blank" rel="noreferrer noopener">c2pa.org</a>
            </li>
            <li>
              Carlini et al., <i>Stealing Part of a Production Language Model</i> (2024):
              canary-based training-membership detection —{" "}
              <a href="https://arxiv.org/abs/2403.06634" target="_blank" rel="noreferrer noopener">arxiv.org/abs/2403.06634</a>
            </li>
            <li>
              DE-COP: Detecting Copyrighted Content in Language Models Training Data —{" "}
              <a href="https://arxiv.org/abs/2402.09910" target="_blank" rel="noreferrer noopener">arxiv.org/abs/2402.09910</a>
            </li>
            <li>
              Beyond Public Access in LLM Pre-Training Data (O'Reilly DE-COP study on GPT-4o) —{" "}
              <a href="https://arxiv.org/abs/2505.00020" target="_blank" rel="noreferrer noopener">arxiv.org/abs/2505.00020</a>
            </li>
            <li>
              Common Crawl — open web corpus &amp; CDX index API used by our corpus check —{" "}
              <a href="https://commoncrawl.org/" target="_blank" rel="noreferrer noopener">commoncrawl.org</a>
            </li>
            <li>
              RSL 1.0 — Really Simple Licensing standard &amp; Collective —{" "}
              <a href="https://rslstandard.org/" target="_blank" rel="noreferrer noopener">rslstandard.org</a>{" "}
              ·{" "}
              <a href="https://rslcollective.org/" target="_blank" rel="noreferrer noopener">rslcollective.org</a>
            </li>
            <li>
              Spawning AI: Have I Been Trained? / DO NOT TRAIN registry —{" "}
              <a href="https://spawning.ai/" target="_blank" rel="noreferrer noopener">spawning.ai</a>
            </li>
          </ul>
          <p className="method-note" style={{ borderTop: "none", marginBottom: 0 }}>
            Full analysis with findings and limitations:{" "}
            <a href="https://github.com/zeecares/4allhuman/blob/main/research/protecting-human-content-from-ai-training.md" target="_blank" rel="noreferrer noopener">
              /research/protecting-human-content-from-ai-training.md
            </a>
          </p>
        </div>
      </section>

      <footer>
        Open source · nothing stored · no API keys · methodology and research notes in{" "}
        <a href="https://github.com/zeecares/4allhuman" target="_blank" rel="noreferrer noopener">
          github.com/zeecares/4allhuman
        </a>
      </footer>
    </main>
  );
}
