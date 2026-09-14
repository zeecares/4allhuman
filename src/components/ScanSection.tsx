import { useState } from "react";
import { CloudflareCheckCard } from "./CloudflareCheckCard";
import { CopyButton, EvidenceLink, SkeletonCard, scoreClass } from "./ui";
import { LAYER_STATUS_LABEL } from "./scan-types";
import type { CcResponse, ScanResponse, VerifyResponse } from "./scan-types";

export const EXAMPLES = [
  { label: "en.wikipedia.org — unprotected", url: "en.wikipedia.org" },
  { label: "www.theverge.com — partial", url: "www.theverge.com" },
];

/** Hostname for prefilling the corpus check; "" when the URL will not parse. */
function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Scan flow: URL form, the verdict/report cards, and the RSL license card. */
export function ScanSection() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);

  async function runScan(target: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/protect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResult(data);
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

  return (
    <>
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
        <ScanResults key={result.scan.scannedAt} result={result} />
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
    </>
  );
}

/** The report for one scan result. Remounts (via key) when a new scan lands,
 *  so per-card state (corpus input, verify drafts) always starts from the new result. */
function ScanResults({ result }: { result: ScanResponse }) {
  return (
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
        {result.scan.layers && (
          <ul className="layer-list">
            {result.scan.layers.map((layer) => (
              <li key={layer.id} className={`layer-row layer-${layer.status}`}>
                <span className={`layer-pill layer-pill-${layer.status}`}>
                  {LAYER_STATUS_LABEL[layer.status]}
                </span>
                <div className="layer-body">
                  <div className="layer-head">
                    <b>{layer.name}</b>
                    <span className="layer-pts">
                      {layer.points}/{layer.maxPoints}
                    </span>
                  </div>
                  <p>{layer.summary}</p>
                  {layer.details.length > 0 && (
                    <p className="layer-details">{layer.details.join(" · ")}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="method-note">
          Score = weighted coverage of known opt-out signals across every standard: robots.txt
          (RFC 9309), X-Robots-Tag, meta noai, TDMRep, ai.txt, aipref. Weights are fixed and
          published — no black box, no account, nothing stored.
        </p>
      </section>

      {/* ── Cloudflare infrastructure audit ── */}
      {result.scan.cloudflare && (
        <CloudflareCheckCard cf={result.scan.cloudflare} />
      )}

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

      <CorpusCard defaultDomain={hostnameOf(result.scan.url)} />

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

      <VerifyCard
        beforeScore={result.score.score}
        drafts={{
          robotsTxt: result.artifacts.fullRobotsTxt,
          aiTxt: result.artifacts.aiTxt,
          metaTags: result.artifacts.metaTags,
        }}
      />

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
  );
}

/** Common Crawl corpus check (module 04). */
function CorpusCard({ defaultDomain }: { defaultDomain: string }) {
  const [ccDomain, setCcDomain] = useState(defaultDomain);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccError, setCcError] = useState<string | null>(null);
  const [ccData, setCcData] = useState<CcResponse | null>(null);

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

  return (
  <>
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
  </>
  );
}

/** Verify-your-fix card (module 06): re-score what the user actually deployed. */
function VerifyCard({
  beforeScore,
  drafts,
}: {
  beforeScore: number;
  drafts: { robotsTxt: string; aiTxt: string; metaTags: string };
}) {
  const [robotsDraft, setRobotsDraft] = useState(drafts.robotsTxt);
  const [aiTxtDraft, setAiTxtDraft] = useState(drafts.aiTxt);
  const [metaDraft, setMetaDraft] = useState(drafts.metaTags);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyResponse | null>(null);

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
  <>
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
            <div className={`score-big ${scoreClass(beforeScore)}`}>
              {beforeScore}
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
  </>
  );
}
