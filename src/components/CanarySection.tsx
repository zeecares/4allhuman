import { useState } from "react";
import type { CanaryArtifacts, CanaryCheck } from "@/lib/canary";
import { CopyButton } from "./ui";

/** Canary (module 13): mint a publish-time fingerprint, probe engines, check answers. */
export function CanarySection() {
  const [cnDomain, setCnDomain] = useState("");
  const [cnLoading, setCnLoading] = useState(false);
  const [cnError, setCnError] = useState<string | null>(null);
  const [cnData, setCnData] = useState<CanaryArtifacts | null>(null);
  const [cnReport, setCnReport] = useState("");
  const [cnVerdict, setCnVerdict] = useState<CanaryCheck | null>(null);

  async function mintCanary() {
    const target = cnDomain.trim();
    if (!target) return;
    setCnLoading(true);
    setCnError(null);
    setCnData(null);
    setCnVerdict(null);
    setCnReport("");
    try {
      const res = await fetch("/api/canary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Canary minting failed");
      setCnData(data);
    } catch (err) {
      setCnError(err instanceof Error ? err.message : "Canary minting failed");
    } finally {
      setCnLoading(false);
    }
  }

  async function checkCanaryAnswer() {
    if (!cnData || !cnReport.trim()) return;
    setCnError(null);
    setCnVerdict(null);
    try {
      const res = await fetch("/api/canary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check: true, canaryId: cnData.canaryId, report: cnReport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed");
      setCnVerdict(data);
    } catch (err) {
      setCnError(err instanceof Error ? err.message : "Check failed");
    }
  }

  function downloadCanaryRecord() {
    if (!cnData) return;
    const record = [
      `CANARY RECORD — ${cnData.domain}`,
      `Minted for: ${cnData.mintedFor}`,
      `Canary token: ${cnData.canaryId}`,
      "",
      "Embedded as:",
      `1. HTML comment on every page: ${cnData.htmlComment}`,
      "2. Published file at /canary.txt:",
      cnData.canaryTxt,
      "",
      "Probe questions:",
      ...cnData.probes.map((p, i) => `Q${i + 1}. ${p}`),
      "",
      "Method: publish-time membership canary (SIGIL-style). A model that reproduces this",
      "token had access to the page. Attribute to training by probing with browsing disabled.",
      "Lab-validated signal (~0.9 AUC), never tested in court; covers only content published",
      "after the canary was embedded.",
    ].join("\n");
    const blob = new Blob([record], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `canary-record-${cnData.domain}-${cnData.mintedFor}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
  <>
    {/* ── 13 · canary: publish-time membership fingerprint ── */}
    <section className="card">
      <h2>
        <span className="num">13</span> CANARY — PROVE YOUR CONTENT GOT INGESTED
      </h2>
      <div className="body">
        <p className="method-note" style={{ borderTop: "none", margin: "0 0 12px" }}>
          Mint a unique fingerprint for your site, embed it in your pages, then probe the AI
          engines every few weeks. The token exists nowhere else, so if a model reproduces it,
          your content was inside what it read. Lab-validated in research settings (~0.9 AUC),
          never tested in court, and forward-looking only — it covers content published after
          the canary goes in.
        </p>
        <div className="scan-form" style={{ marginBottom: 12 }}>
          <input
            onChange={(e) => setCnDomain(e.target.value)}
            placeholder="example.com"
            value={cnDomain}
          />
          <button disabled={cnLoading || !cnDomain.trim()} onClick={mintCanary}>
            {cnLoading ? "Minting…" : "Mint canary"}
          </button>
        </div>
        {cnError && <p className="error">⚠️ {cnError}</p>}
        {cnData && (
          <>
            <label className="draft-label">STEP 1 — EMBED THESE TWO SNIPPETS</label>
            <div className="card" style={{ marginTop: 8 }}>
              <h2>
                HTML COMMENT — EVERY PAGE
                <CopyButton text={cnData.htmlComment} />
              </h2>
              <div className="body">
                <pre>{cnData.htmlComment}</pre>
              </div>
            </div>
            <div className="card" style={{ marginTop: 8 }}>
              <h2>
                PUBLISH AT /CANARY.TXT
                <CopyButton text={cnData.canaryTxt} />
              </h2>
              <div className="body">
                <pre>{cnData.canaryTxt}</pre>
              </div>
            </div>
            <button className="copy-btn" onClick={downloadCanaryRecord} style={{ marginTop: 12 }}>
              ⬇ download canary record (.txt)
            </button>
            <label className="draft-label" style={{ marginTop: 20 }}>
              STEP 2 — EVERY FEW WEEKS, ASK THE ENGINES THESE QUESTIONS
            </label>
            {cnData.probes.map((p, i) => (
              <div key={i} className="card" style={{ marginTop: 8 }}>
                <h2>
                  <span className="num">Q{i + 1}</span>
                  <CopyButton text={p} />
                </h2>
                <div className="body">
                  <p style={{ margin: 0 }}>{p}</p>
                </div>
              </div>
            ))}
            <label className="draft-label" style={{ marginTop: 20 }}>
              STEP 3 — PASTE THE ANSWER BACK
              <textarea
                onChange={(e) => setCnReport(e.target.value)}
                placeholder="Paste the engine's answer here…"
                rows={4}
                value={cnReport}
              />
            </label>
            <button
              className="verify-btn"
              disabled={!cnReport.trim()}
              onClick={checkCanaryAnswer}
              style={{ marginTop: 8 }}
            >
              Check answer
            </button>
            {cnVerdict && (
              <>
                <div className="score-row" style={{ marginTop: 12 }}>
                  <div
                    className={`score-big ${cnVerdict.surfaced ? "score-bad" : "score-good"}`}
                    style={{ fontSize: "1.3rem", minWidth: 170 }}
                  >
                    {cnVerdict.surfaced ? "SURFACED" : "CLEAN"}
                    <span className="score-sub">
                      {cnVerdict.surfaced ? "CANARY FOUND IN OUTPUT" : "NO CANARY IN ANSWER"}
                    </span>
                  </div>
                </div>
                <p className="method-note" style={{ marginTop: 12, marginBottom: 0 }}>
                  {cnVerdict.caveat}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </section>
  </>
  );
}
