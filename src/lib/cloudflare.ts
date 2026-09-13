/**
 * Cloudflare infrastructure audit check.
 *
 * On September 15, 2026, Cloudflare changes how its AI crawler blocking works:
 * crawlers are now categorised by ALL their behaviours. Multi-purpose crawlers
 * (Googlebot, Applebot, BingBot) are subject to the most restrictive rule that
 * applies to any of their behaviours. The "Block AI bots" preset many site
 * owners turned on will now also block Googlebot — Cloudflare explicitly states
 * this. It applies to new customers, new sites, AND all existing free-plan
 * customers who haven't changed settings. Google drives ~88% of referral traffic.
 *
 * The fix: use Google-Extended in robots.txt (a robots.txt token, not a
 * separate crawler) to opt out of Google's AI training without blocking
 * Googlebot for search.
 *
 * This module detects whether a site is behind Cloudflare, checks for
 * Google-Extended in robots.txt, classifies the risk, and provides
 * remediation steps. Zero dependencies; uses the existing robots9309 parser.
 */
import { governingGroup, parseRobots, winningRule, type ParsedRobots } from "./robots9309.ts";

export type GoogleExtendedStatus = "CORRECT" | "DANGEROUS" | "MISSING" | "ALLOW";

export type CloudflareRiskLevel = "HIGH_RISK" | "GOOD" | "NEUTRAL" | "SKIPPED";

export interface RemediationStep {
  step: number;
  title: string;
  description: string;
  code?: string;
}

export interface CloudflareCheckResult {
  isCloudflare: boolean;
  riskLevel: CloudflareRiskLevel;
  googleExtendedStatus: GoogleExtendedStatus | null;
  scoreDelta: number;
  headline: string;
  detail: string;
  remediation: RemediationStep[] | null;
}

// ── Cloudflare detection ───────────────────────────────────────────────────

/**
 * Detect whether a site is behind Cloudflare by inspecting response headers.
 * Primary signals: cf-ray, cf-cache-status, server: cloudflare.
 */
export function detectCloudflare(headers: Record<string, string | string[] | undefined>): boolean {
  const get = (name: string): string | undefined => {
    const v = headers[name];
    if (Array.isArray(v)) return v[0];
    return v;
  };
  // cf-ray is the most reliable signal — Cloudflare injects it on every response.
  if (get("cf-ray")) return true;
  if (get("cf-cache-status")) return true;
  const server = get("server");
  if (server && /cloudflare/i.test(server)) return true;
  return false;
}

// ── Google-Extended classification ─────────────────────────────────────────

/**
 * Classify the Google-Extended entry in robots.txt.
 *
 * Google-Extended is a robots.txt user-agent token (not a separate crawler)
 * that Google's AI training pipeline honours. Disallow: / under it opts out
 * of Gemini training without affecting Google Search indexing (Googlebot is a
 * different token).
 *
 * Classifications:
 * - CORRECT: Google-Extended present with Disallow: / (targeted AI opt-out)
 * - DANGEROUS: Googlebot itself has Disallow: / (blocks search entirely)
 * - MISSING: No Google-Extended entry (missed targeted opt-out opportunity)
 * - ALLOW: Google-Extended present with Allow: / (explicitly allowing AI training)
 */
export function classifyGoogleExtended(robotsTxt: string | null): GoogleExtendedStatus {
  if (!robotsTxt) return "MISSING";

  const parsed: ParsedRobots = parseRobots(robotsTxt);

  // Check Google-Extended group
  const geGroup = governingGroup(parsed, "Google-Extended");
  if (geGroup) {
    const rootRule = winningRule(geGroup.rules, "/");
    if (rootRule) {
      if (rootRule.kind === "disallow") return "CORRECT";
      if (rootRule.kind === "allow") return "ALLOW";
    }
    // Group exists but no rule matches "/" — treat as MISSING (no effective directive)
    return "MISSING";
  }

  // Check if Googlebot itself is blocked at root (dangerous — kills search)
  const googlebotGroup = governingGroup(parsed, "Googlebot");
  if (googlebotGroup) {
    const rootRule = winningRule(googlebotGroup.rules, "/");
    if (rootRule && rootRule.kind === "disallow") return "DANGEROUS";
  }

  return "MISSING";
}

// ── Remediation copy ───────────────────────────────────────────────────────

const HIGH_RISK_REMEDIATION: RemediationStep[] = [
  {
    step: 1,
    title: "Review your Cloudflare AI blocking preset",
    description:
      "Go to Security → Bots in your Cloudflare dashboard. Check if you have a site-wide AI training block enabled. After September 15, this preset will also block Googlebot — not just AI training crawlers — because Googlebot is now categorised by all its behaviours, and AI training is one of them.",
  },
  {
    step: 2,
    title: "Add Google-Extended to robots.txt",
    description:
      "Google-Extended is a robots.txt user-agent token that opts out of Google's Gemini AI training without affecting Google Search indexing. Add this to your robots.txt:",
    code: "User-agent: Google-Extended\nDisallow: /",
  },
  {
    step: 3,
    title: "Keep your other AI opt-out signals",
    description:
      "Your existing robots.txt entries for other AI crawlers, /ai.txt, meta tags, and TDMRep rights reservation remain correct and should stay in place. Google-Extended is an addition, not a replacement — it specifically targets Google's AI training pipeline while leaving Googlebot free to crawl for search.",
  },
];

// ── Main check function ────────────────────────────────────────────────────

/**
 * Run the Cloudflare infrastructure audit check.
 *
 * @param headers  - Response headers from the homepage fetch (Record<string, string | string[] | undefined>)
 * @param robotsTxt - Raw robots.txt content (null if not found)
 * @returns CloudflareCheckResult with risk classification, score delta, and remediation
 */
export function checkCloudflareConfiguration(
  headers: Record<string, string | string[] | undefined>,
  robotsTxt: string | null,
): CloudflareCheckResult {
  const isCloudflare = detectCloudflare(headers);

  // Non-Cloudflare sites: skip entirely
  if (!isCloudflare) {
    return {
      isCloudflare: false,
      riskLevel: "SKIPPED",
      googleExtendedStatus: null,
      scoreDelta: 0,
      headline: "Not behind Cloudflare",
      detail: "This site is not proxied through Cloudflare — the September 15 AI crawler blocking change does not apply.",
      remediation: null,
    };
  }

  const geStatus = classifyGoogleExtended(robotsTxt);

  // DANGEROUS: Googlebot itself is blocked — this is bad regardless of Cloudflare
  if (geStatus === "DANGEROUS") {
    return {
      isCloudflare: true,
      riskLevel: "HIGH_RISK",
      googleExtendedStatus: "DANGEROUS",
      scoreDelta: -15,
      headline: "Googlebot is blocked in robots.txt — search traffic is at risk",
      detail:
        "Your robots.txt has Disallow: / under Googlebot. This blocks Google Search from indexing your site entirely. After September 15, Cloudflare's AI blocking change makes this worse — but blocking Googlebot was already catastrophic for search traffic. Remove the Googlebot block and use Google-Extended instead to opt out of AI training only.",
      remediation: [
        {
          step: 1,
          title: "Remove the Googlebot Disallow: / from robots.txt",
          description:
            "Find the User-agent: Googlebot group in your robots.txt and remove any Disallow: / rule. Googlebot must be allowed to crawl for Google Search to function.",
        },
        {
          step: 2,
          title: "Add Google-Extended to robots.txt instead",
          description:
            "Google-Extended opts out of Google's Gemini AI training without affecting Google Search indexing. Add this to your robots.txt:",
          code: "User-agent: Google-Extended\nDisallow: /",
        },
        {
          step: 3,
          title: "Review your Cloudflare AI blocking preset",
          description:
            "Go to Security → Bots in your Cloudflare dashboard. After September 15, the 'Block AI bots' preset will also block Googlebot. Ensure you are not relying on a blanket block — use Google-Extended in robots.txt for targeted AI opt-out.",
        },
      ],
    };
  }

  // HIGH_RISK: on Cloudflare + no Google-Extended (likely affected by Sept 15 change)
  if (geStatus === "MISSING") {
    return {
      isCloudflare: true,
      riskLevel: "HIGH_RISK",
      googleExtendedStatus: "MISSING",
      scoreDelta: -15,
      headline: "Cloudflare site missing Google-Extended — at risk from September 15 change",
      detail:
        "This site is behind Cloudflare but has no Google-Extended entry in robots.txt. On September 15, 2026, Cloudflare changes how its AI crawler blocking works: the 'Block AI bots' preset will also block Googlebot (not just AI training crawlers). Without Google-Extended, you have no targeted opt-out from Google's AI training — your only options are to let Google train on your content or block Googlebot entirely (losing ~88% of referral traffic). Add Google-Extended now to opt out of AI training while keeping Google Search working.",
      remediation: HIGH_RISK_REMEDIATION,
    };
  }

  // ALLOW: Google-Extended present but explicitly allowing AI training
  if (geStatus === "ALLOW") {
    return {
      isCloudflare: true,
      riskLevel: "NEUTRAL",
      googleExtendedStatus: "ALLOW",
      scoreDelta: 0,
      headline: "Google-Extended is set to Allow — AI training is explicitly permitted",
      detail:
        "Your robots.txt has an Allow: / rule under Google-Extended, which explicitly permits Google to use your content for AI training. This is a deliberate choice. After September 15, Cloudflare's AI blocking change may still affect Googlebot if you have a blanket AI block enabled — but since you've allowed Google-Extended, you likely intend for Google to access your content for both search and training.",
      remediation: null,
    };
  }

  // GOOD: on Cloudflare + Google-Extended CORRECT
  // geStatus === "CORRECT"
  return {
    isCloudflare: true,
    riskLevel: "GOOD",
    googleExtendedStatus: "CORRECT",
    scoreDelta: 5,
    headline: "Cloudflare configured correctly — Google-Extended is set",
    detail:
      "This site is behind Cloudflare and has Google-Extended with Disallow: / in robots.txt. This is the correct configuration: it opts out of Google's Gemini AI training without affecting Google Search indexing. The September 15 Cloudflare AI crawler blocking change will not harm your search traffic because Google-Extended provides the targeted opt-out that the blanket 'Block AI bots' preset cannot.",
    remediation: null,
  };
}
