import { CopyButton } from "./ui";
import type { CloudflareCheckResult } from "./scan-types";


/**
 * Cloudflare infrastructure audit card.
 * Shows the September 15 AI crawler blocking change and Google-Extended status.
 * WARNING: orange check-your-settings card (dashboard setting not observable,
 *   no score penalty) with remediation steps.
 * HIGH_RISK: red urgent card (Googlebot blocked in robots.txt — scored -15).
 * GOOD: green confirmation card.
 * NEUTRAL: grey informational card.
 * SKIPPED: nothing shown (non-Cloudflare sites).
 */
export function CloudflareCheckCard({ cf }: { cf: CloudflareCheckResult }) {
  if (cf.riskLevel === "SKIPPED") return null;

  const isHighRisk = cf.riskLevel === "HIGH_RISK";
  const isWarning = cf.riskLevel === "WARNING";
  const isGood = cf.riskLevel === "GOOD";
  const isNeutral = cf.riskLevel === "NEUTRAL";

  const cardClass = isHighRisk
    ? "card cf-card cf-card-high"
    : isWarning
      ? "card cf-card cf-card-warning"
      : isGood
        ? "card cf-card cf-card-good"
        : "card cf-card cf-card-neutral";

  const pillClass = isHighRisk
    ? "layer-pill layer-pill-absent"
    : isWarning
      ? "layer-pill layer-pill-partial"
      : isGood
        ? "layer-pill layer-pill-protected"
        : "layer-pill layer-pill-info";

  const pillLabel = isHighRisk
    ? "HIGH RISK"
    : isWarning
      ? "CHECK SETTINGS"
      : isGood
        ? "CONFIGURED"
        : "INFO";

  return (
    <section className={cardClass}>
      <h2>
        <span className="num">⚡</span> CLOUDFLARE AUDIT — SEPTEMBER 15 AI CRAWLER CHANGE
        <span className={`layer-pill ${pillClass}`}>{pillLabel}</span>
      </h2>
      <div className="body">
        <p style={{ fontWeight: 700, fontSize: "0.95rem", margin: "0 0 8px" }}>
          {cf.headline}
        </p>
        <p className="method-note" style={{ borderTop: "none", margin: "0 0 12px" }}>
          {cf.detail}
        </p>

        {(isHighRisk || isWarning) && (
          <div className="cf-deadline-banner" style={{
            background: isHighRisk ? "var(--red)" : "var(--orange)",
            color: "#fff",
            padding: "10px 14px",
            margin: "0 0 16px",
            fontWeight: 700,
            fontSize: "0.85rem",
            textTransform: "uppercase",
            letterSpacing: "0.02em",
          }}>
            ⚠️ DEADLINE: TUESDAY, SEPTEMBER 15, 2026 — if Cloudflare&apos;s &quot;Block AI
            bots&quot; preset is on for this site, it will also block Googlebot. Check Security →
            Bots in your dashboard; only you can see that setting.
          </div>
        )}

        {cf.remediation && cf.remediation.length > 0 && (
          <ol className="cf-remediation" style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
            {cf.remediation.map((step) => (
              <li key={step.step} style={{
                marginBottom: 16,
                padding: "12px 14px",
                background: "var(--panel-dark)",
                border: "2px solid var(--line)",
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {step.step}. {step.title}
                </div>
                <p style={{ margin: "0 0 8px", fontSize: "0.85rem", lineHeight: 1.5 }}>
                  {step.description}
                </p>
                {step.code && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <pre style={{
                      flex: 1,
                      margin: 0,
                      padding: "10px 12px",
                      background: "var(--bg)",
                      border: "2px solid var(--line)",
                      fontSize: "0.8rem",
                      overflowX: "auto",
                    }}>
                      {step.code}
                    </pre>
                    <CopyButton text={step.code} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {isGood && (
          <p className="method-note" style={{ borderTop: "none", margin: 0 }}>
            Google-Extended with Disallow: / is set in robots.txt. This opts out of Google&apos;s
            Gemini AI training without affecting Google Search indexing — exactly the targeted
            opt-out the September 15 Cloudflare change requires.
          </p>
        )}

        {isNeutral && (
          <p className="method-note" style={{ borderTop: "none", margin: 0 }}>
            No urgent action required. Review the detail above for your specific configuration.
          </p>
        )}
      </div>
    </section>
  );
}
