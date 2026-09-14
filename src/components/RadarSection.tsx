import { useState } from "react";
import { analyzePair, makeMcq, scoreMcq } from "@/lib/radar";
import { CopyButton } from "./ui";
import type { EngineAnalysis, ProbeData } from "./scan-types";

const ENGINE_NAMES = ["ChatGPT", "Perplexity", "Claude", "Gemini"];

/** Radar (module 11): manual probe flow — generate probes, collect engine
 *  answers, analyze locally. Source text never leaves the browser. */
export function RadarSection() {
  const [radarUrl, setRadarUrl] = useState("");
  const [radarText, setRadarText] = useState("");
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [probeData, setProbeData] = useState<ProbeData | null>(null);
  const [sourceForAnalysis, setSourceForAnalysis] = useState("");
  const [engineResponses, setEngineResponses] = useState<Record<string, string>>({});
  const [analyses, setAnalyses] = useState<EngineAnalysis[] | null>(null);

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

  return (
  <>
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
          {probeData && <MemorizationProbe sourceText={sourceForAnalysis} />}

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
  </>
  );
}

/** DE-COP memorization probe (arXiv 2402.09910): MCQ quiz built from the source text. */
function MemorizationProbe({ sourceText }: { sourceText: string }) {
  const [mcqItems, setMcqItems] = useState<ReturnType<typeof makeMcq> | null>(null);
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, string>>({});
  const [mcqScore, setMcqScore] = useState<ReturnType<typeof scoreMcq>>(null);

  function generateMcq() {
    if (!sourceText) return;
    setMcqItems(makeMcq(sourceText, 3));
    setMcqAnswers({});
    setMcqScore(null);
  }

  function analyzeMcq() {
    if (!mcqItems) return;
    setMcqScore(scoreMcq(mcqItems, mcqAnswers));
  }

  return (
    <>
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
    </>
  );
}
