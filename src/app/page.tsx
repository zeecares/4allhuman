"use client";

import { useState } from "react";

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
  };
  score: ScoreResult;
};

type VerifyResponse = {
  score: ScoreResult;
  blockedCrawlers: string[];
  openCrawlers: string[];
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
                return (
                  <div key={ua} className={`chip ${blocked ? "blocked" : "open"}`}>
                    <span className="led" />
                    <span className="ua">{ua}</span>
                    <span className="state">{blocked ? "BLOCKED" : "CAN TRAIN"}</span>
                  </div>
                );
              })}
            </div>
            <p className="method-note">
              Read directly from this site&apos;s live robots.txt at scan time — follow the link above
              to check it yourself. Green means a group disallowing all paths was found for that
              user-agent.
            </p>
          </section>

          {/* ── 04 · the fix ── */}
          <section className="card">
            <h2>
              <span className="num">04</span> THE FIX — APPEND TO ROBOTS.TXT
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
              <span className="num">05</span> VERIFY THE FIX — PASTE WHAT YOU DEPLOYED
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
              <span className="num">06</span> ALSO PUBLISH AT /AI.TXT
              <CopyButton text={result.artifacts.aiTxt} />
            </h2>
            <div className="body">
              <pre>{result.artifacts.aiTxt}</pre>
            </div>
          </section>

          <section className="card">
            <h2>
              <span className="num">07</span> ADD TO EVERY PAGE&apos;S &lt;HEAD&gt;
              <CopyButton text={result.artifacts.metaTags} />
            </h2>
            <div className="body">
              <pre>{result.artifacts.metaTags}</pre>
            </div>
          </section>

          <section className="card">
            <h2>
              <span className="num">08</span> LEGAL NOTICE OF RESERVED RIGHTS
              <CopyButton text={result.artifacts.legalNotice} />
            </h2>
            <div className="body">
              <pre>{result.artifacts.legalNotice}</pre>
            </div>
          </section>
        </>
      )}

      {/* ── honesty module: what this can and cannot do ── */}
      <section className="card trust-card">
        <h2>
          <span className="num">§</span> WHAT THIS CAN AND CANNOT DO
        </h2>
        <div className="body trust-body">
          <div>
            <h3>✓ Can</h3>
            <ul>
              <li>Measure exposure against 19 documented AI training crawlers</li>
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

      <footer>
        Open source · nothing stored · methodology and research notes in{" "}
        <a href="https://github.com/zeecares/4allhuman" target="_blank" rel="noreferrer noopener">
          github.com/zeecares/4allhuman
        </a>
      </footer>
    </main>
  );
}
