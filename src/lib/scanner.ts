/**
 * Scanner: inspects a live site's current AI-training protection posture.
 * Multi-layer audit (src/lib/layers.ts):
 * - robots.txt evaluated with the RFC 9309 matcher for every known AI crawler
 * - X-Robots-Tag HTTP headers (noai / noimageai / none, global and per-bot)
 * - noai/noimageai meta tags on the homepage
 * - TDMRep (W3C tdm-reservation / tdm-policy, header and meta forms)
 * - /ai.txt (Spawning proposal) and /llms.txt (allow-side counterpart)
 * - aipref (IETF draft vocabulary) signals where detectable
 * Pure Node fetch, zero deps.
 */
import { AI_CRAWLERS } from "./crawlers";
import { explain, parseRobots } from "./robots9309";
import {
  aiPrefLayer,
  aiTxtLayer,
  detectAiPref,
  detectTdmRep,
  headersLayer,
  llmsTxtLayer,
  metaLayer,
  reachableLayer,
  robotsLayer,
  tdmRepLayer,
  extractMetaTags,
  type LayerResult,
  type TdmSignals,
} from "./layers";

// Meta extraction moved to layers.ts; re-export for existing callers.
export { extractMetaTags };

export type CrawlerVerdict = {
  userAgent: string;
  /** false = robots.txt blocks this crawler from the site root. */
  allowed: boolean;
  /** Plain-language reason naming the deciding rule and line. */
  reason: string;
};

export type ScanResult = {
  url: string;
  reachable: boolean;
  robotsFound: boolean;
  blockedCrawlers: string[];
  openCrawlers: string[];
  /** Per-crawler verdicts from the RFC 9309 matcher, one per known crawler. */
  verdicts: CrawlerVerdict[];
  metaTagsFound: string[]; // e.g. ["noai", "noimageai"]
  aiTxtFound: boolean;
  /** Raw X-Robots-Tag header values from the homepage response. */
  xRobotsTagHeaders: string[];
  /** TDMRep signals detected in headers or HTML. */
  tdm: TdmSignals;
  llmsTxtFound: boolean;
  /** aipref (IETF draft) preference tokens detected in headers/HTML. */
  aiPrefSignals: string[];
  /** The layered audit: one verdict per opt-out standard, plain language. */
  layers: LayerResult[];
  scannedAt: string;
};

function normalizeUrl(input: string): URL {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return new URL(withScheme);
}

type FetchedPage = {
  text: string | null;
  /** All X-Robots-Tag header values (a response can carry several). */
  xRobotsTag: string[];
  tdmReservation: string[];
  tdmPolicy: string[];
};

async function fetchText(url: string, timeoutMs = 8000): Promise<string | null> {
  const page = await fetchPage(url, timeoutMs);
  return page.text;
}

async function fetchPage(url: string, timeoutMs = 8000): Promise<FetchedPage> {
  const empty: FetchedPage = { text: null, xRobotsTag: [], tdmReservation: [], tdmPolicy: [] };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "DontTrainOnMe-Scanner/0.1 (hackathon project)" },
      redirect: "follow",
    });
    if (!res.ok) return empty;
    // getSettled()/getAll aren't universal; headers.forEach yields one entry
    // per distinct field, with repeats already comma-joined by the spec.
    const collect = (name: string): string[] => {
      const v = res.headers.get(name);
      return v ? [v] : [];
    };
    return {
      text: await res.text(),
      xRobotsTag: collect("x-robots-tag"),
      tdmReservation: collect("tdm-reservation"),
      tdmPolicy: collect("tdm-policy"),
    };
  } catch {
    return empty;
  }
}

/**
 * Which known AI crawlers does this robots.txt block from the site root?
 * Full RFC 9309 semantics: most-specific user-agent group (falling back to
 * "*", then to unrestricted), longest-match rules, allow-wins ties,
 * "*" / "$" wildcards, and percent-encoding per spec.
 */
export function evaluateCrawlers(robotsTxt: string): CrawlerVerdict[] {
  const parsed = parseRobots(robotsTxt);
  return AI_CRAWLERS.map((crawler) => {
    const verdict = explain(parsed, crawler.userAgent, "/");
    return {
      userAgent: crawler.userAgent,
      allowed: verdict.allowed,
      reason: verdict.reason,
    };
  });
}

export async function scanSite(rawUrl: string): Promise<ScanResult> {
  let base: URL;
  try {
    base = normalizeUrl(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  const origin = base.origin;
  const [robotsTxt, homepage, aiTxt, llmsTxt] = await Promise.all([
    fetchText(`${origin}/robots.txt`),
    fetchPage(base.toString()),
    fetchText(`${origin}/ai.txt`),
    fetchText(`${origin}/llms.txt`),
  ]);

  const verdicts = robotsTxt ? evaluateCrawlers(robotsTxt) : [];
  const blockedCrawlers = verdicts.filter((v) => !v.allowed).map((v) => v.userAgent);
  const openCrawlers = robotsTxt
    ? verdicts.filter((v) => v.allowed).map((v) => v.userAgent)
    : AI_CRAWLERS.map((c) => c.userAgent);

  const metaTagsFound = homepage.text ? extractMetaTags(homepage.text) : [];
  const tdm = detectTdmRep({
    headerValues: homepage.tdmReservation,
    policyHeaderValues: homepage.tdmPolicy,
    html: homepage.text,
  });
  const aiPrefSignals = detectAiPref([...homepage.xRobotsTag, homepage.text]);
  const reachable = !!(robotsTxt || homepage.text);

  const layers: LayerResult[] = [
    robotsLayer({
      blockedCount: blockedCrawlers.length,
      totalCrawlers: AI_CRAWLERS.length,
      robotsFound: !!robotsTxt,
    }),
    headersLayer(homepage.xRobotsTag),
    metaLayer(metaTagsFound),
    tdmRepLayer(tdm),
    aiTxtLayer(!!aiTxt, aiTxt),
    llmsTxtLayer(!!llmsTxt),
    aiPrefLayer(aiPrefSignals),
    reachableLayer(reachable),
  ];

  return {
    url: origin,
    reachable,
    robotsFound: !!robotsTxt,
    blockedCrawlers,
    openCrawlers,
    verdicts,
    metaTagsFound,
    aiTxtFound: !!aiTxt,
    xRobotsTagHeaders: homepage.xRobotsTag,
    tdm,
    llmsTxtFound: !!llmsTxt,
    aiPrefSignals,
    layers,
    scannedAt: new Date().toISOString(),
  };
}
