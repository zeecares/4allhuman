import { useState } from "react";
import { PHASE_LABEL } from "./scan-types";
import type { TimelineResponse } from "./scan-types";

/** Claim window (module 12): date the reservation via archived robots.txt bisection. */
export function TimelineSection() {
  const [tlDomain, setTlDomain] = useState("");
  const [tlLoading, setTlLoading] = useState(false);
  const [tlError, setTlError] = useState<string | null>(null);
  const [tlData, setTlData] = useState<TimelineResponse | null>(null);

  async function buildTimeline() {
    const target = tlDomain.trim();
    if (!target) return;
    setTlLoading(true);
    setTlError(null);
    setTlData(null);
    try {
      const res = await fetch(`/api/timeline?domain=${encodeURIComponent(target)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Timeline lookup failed");
      setTlData(data);
    } catch (err) {
      setTlError(err instanceof Error ? err.message : "Timeline lookup failed");
    } finally {
      setTlLoading(false);
    }
  }

  function downloadReservationRecord() {
    if (!tlData) return;
    const blob = new Blob([tlData.record], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reservation-record-${tlData.domain}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
  <>
    {/* ── 12 · claim window: since when has the reservation existed? ── */}
    <section className="card">
      <h2>
        <span className="num">12</span> CLAIM WINDOW — SINCE WHEN HAVE YOU RESERVED?
      </h2>
      <div className="body">
        <p className="method-note" style={{ borderTop: "none", margin: "0 0 12px" }}>
          Art. 4(3) is a timing rule: a reservation only bites on mining that happens after it is
          machine-readable. We bisect your archived robots.txt history at the Internet Archive to
          date the change, then place the published Common Crawl windows on either side of it.
          A dozen reads, no key, every date a public permalink.
        </p>
        <div className="scan-form" style={{ marginBottom: 12 }}>
          <input
            onChange={(e) => setTlDomain(e.target.value)}
            placeholder="example.com"
            value={tlDomain}
          />
          <button disabled={tlLoading || !tlDomain.trim()} onClick={buildTimeline}>
            {tlLoading ? "Reading the archive…" : "Date my reservation"}
          </button>
        </div>
        {tlError && <p className="error">⚠️ {tlError}</p>}
        {tlLoading && (
          <p className="method-note" style={{ borderTop: "none", margin: 0 }}>
            Bisecting {tlDomain.trim()}&apos;s archived robots.txt — the Internet Archive answers
            slowly, so this can take up to a minute.
          </p>
        )}
        {tlData && (
          <>
            <div className="score-row" style={{ marginBottom: 12 }}>
              <div
                className={`score-big ${tlData.history.reservedSince ? "score-good" : "score-bad"}`}
                style={{ fontSize: "1.5rem", minWidth: 170 }}
              >
                {tlData.history.reservedSince ? tlData.history.reservedSince.at.slice(0, 10) : "NEVER"}
                <span className="score-sub">
                  {tlData.history.bracketed ? "RESERVED SINCE" : "RESERVED BY (OR EARLIER)"}
                </span>
              </div>
              <ul className="breakdown">
                {tlData.crawls.map((c) => (
                  <li key={c.id} title={c.note}>
                    <span>
                      {c.name} · {c.from.slice(0, 10)} → {c.to.slice(0, 10)}
                    </span>
                    <b>{PHASE_LABEL[c.phase]}</b>
                  </li>
                ))}
              </ul>
            </div>
            <p className="method-note" style={{ borderTop: "none", margin: "0 0 12px" }}>
              {tlData.verdict}
            </p>
            <ul className="breakdown" style={{ marginBottom: 12 }}>
              {tlData.history.lastUnreserved && (
                <li>
                  <span>Last archived robots.txt with no reservation</span>
                  <b>
                    <a
                      href={tlData.history.lastUnreserved.archiveUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {tlData.history.lastUnreserved.at.slice(0, 10)} ↗
                    </a>
                  </b>
                </li>
              )}
              {tlData.history.reservedSince && (
                <li>
                  <span>
                    Earliest archived robots.txt that reserves ({tlData.history.reservedSince.blocked}
                    /{tlData.history.reservedSince.total} crawlers)
                  </span>
                  <b>
                    <a
                      href={tlData.history.reservedSince.archiveUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {tlData.history.reservedSince.at.slice(0, 10)} ↗
                    </a>
                  </b>
                </li>
              )}
              <li>
                <span>Today&apos;s robots.txt</span>
                <b>
                  {tlData.current.checked
                    ? `${tlData.current.blocked}/${tlData.current.total} blocked`
                    : "unreadable"}
                </b>
              </li>
              <li>
                <span>
                  Archive months searched · captures read
                  {tlData.history.complete ? "" : " · stopped on budget"}
                </span>
                <b>
                  {tlData.history.monthsSearched} · {tlData.history.probes.length}
                </b>
              </li>
            </ul>
            <button className="copy-btn" onClick={downloadReservationRecord}>
              ⬇ download reservation record (.txt)
            </button>
            <p className="method-note" style={{ marginBottom: 0 }}>
              {tlData.history.bracketed
                ? "The date is bracketed: an archived revision without the reservation is followed by an archived revision with it. Both permalinks are above — check them yourself."
                : "The oldest revision we could read already reserved, so this date is an upper bound: the real reservation may be older."}{" "}
              A crawl inside the window is evidence of collection opportunity, not proof that any
              model trained on your work.
            </p>
          </>
        )}
      </div>
    </section>
  </>
  );
}
