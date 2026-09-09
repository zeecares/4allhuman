/**
 * Scanner: inspects a live site's current AI-training protection posture.
 * - fetches /robots.txt and evaluates it with the RFC 9309 matcher
 *   (src/lib/robots9309.ts) for every known AI crawler
 * - fetches the homepage HTML and looks for noai/noimageai meta tags
 * Pure Node fetch, zero deps.
 */
import { AI_CRAWLERS } from "./crawlers";
import { explain, parseRobots } from "./robots9309";

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
  scannedAt: string;
};

function normalizeUrl(input: string): URL {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  return new URL(withScheme);
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "DontTrainOnMe-Scanner/0.1 (hackathon project)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
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

export function extractMetaTags(html: string): string[] {
  const found: string[] = [];
  const metaRe = /<meta\s+[^>]*>/gi;
  for (const tag of html.match(metaRe) ?? []) {
    if (/name\s*=\s*["']robots["']/i.test(tag)) {
      for (const directive of ["noai", "noimageai", "notranslate"]) {
        if (new RegExp(`\\b${directive}\\b`, "i").test(tag)) found.push(directive);
      }
    }
  }
  return [...new Set(found)];
}

export async function scanSite(rawUrl: string): Promise<ScanResult> {
  let base: URL;
  try {
    base = normalizeUrl(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  const origin = base.origin;
  const [robotsTxt, homepage, aiTxt] = await Promise.all([
    fetchText(`${origin}/robots.txt`),
    fetchText(base.toString()),
    fetchText(`${origin}/ai.txt`),
  ]);

  const verdicts = robotsTxt ? evaluateCrawlers(robotsTxt) : [];
  const blockedCrawlers = verdicts.filter((v) => !v.allowed).map((v) => v.userAgent);
  const openCrawlers = robotsTxt
    ? verdicts.filter((v) => v.allowed).map((v) => v.userAgent)
    : AI_CRAWLERS.map((c) => c.userAgent);

  return {
    url: origin,
    reachable: !!(robotsTxt || homepage),
    robotsFound: !!robotsTxt,
    blockedCrawlers,
    openCrawlers,
    verdicts,
    metaTagsFound: homepage ? extractMetaTags(homepage) : [],
    aiTxtFound: !!aiTxt,
    scannedAt: new Date().toISOString(),
  };
}

