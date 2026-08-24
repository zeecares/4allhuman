/**
 * Scanner: inspects a live site's current AI-training protection posture.
 * - fetches /robots.txt and parses UA-specific blocks for known AI crawlers
 * - fetches the homepage HTML and looks for noai/noimageai meta tags
 * Pure Node fetch, zero deps.
 */
import { AI_CRAWLERS } from "./crawlers";

export type ScanResult = {
  url: string;
  reachable: boolean;
  robotsFound: boolean;
  blockedCrawlers: string[];
  openCrawlers: string[];
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

export function parseRobotsForUA(robotsTxt: string): Map<string, boolean> {
  /**
   * Returns which user-agents have `Disallow: /` in their group.
   * Group semantics per RFC 9309: consecutive `user-agent` lines belong to the
   * same group until the first rule (Disallow/Allow/etc.) appears; blank lines
   * do NOT end a group.
   */
  const result = new Map<string, boolean>();
  let currentUAs: string[] = [];
  let sawRuleSinceLastUA = false;
  let groupBlocksRoot = false;

  const flush = () => {
    for (const ua of currentUAs) result.set(ua.toLowerCase(), groupBlocksRoot);
    currentUAs = [];
    sawRuleSinceLastUA = false;
    groupBlocksRoot = false;
  };

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "user-agent") {
      if (sawRuleSinceLastUA) flush(); // rule seen -> next UA starts a new group
      currentUAs.push(value);
    } else if (key === "sitemap") {
      continue; // global directive, not part of a group
    } else {
      sawRuleSinceLastUA = true;
      if (key === "disallow" && (value === "/" || value === "*")) {
        groupBlocksRoot = true;
      }
    }
  }
  flush();
  return result;
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

  const robotsMap = robotsTxt ? parseRobotsForUA(robotsTxt) : new Map<string, boolean>();
  const blockedCrawlers: string[] = [];
  const openCrawlers: string[] = [];

  for (const crawler of AI_CRAWLERS) {
    const isBlocked = robotsMap.get(crawler.userAgent.toLowerCase()) ?? false;
    (isBlocked ? blockedCrawlers : openCrawlers).push(crawler.userAgent);
  }

  return {
    url: origin,
    reachable: !!(robotsTxt || homepage),
    robotsFound: !!robotsTxt,
    blockedCrawlers,
    openCrawlers,
    metaTagsFound: homepage ? extractMetaTags(homepage) : [],
    aiTxtFound: !!aiTxt,
    scannedAt: new Date().toISOString(),
  };
}
