import { NextRequest, NextResponse } from "next/server";
import {
  classifyCrawls,
  findFirstReservation,
  parseWaybackCdx,
  renderReservationRecord,
  reservationIn,
  summarize,
  waybackRawUrl,
  type CrawlWindow,
  type ReservationState,
  type ReservationTimeline,
  type WaybackSnapshot,
} from "@/lib/timeline";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Leave room inside `maxDuration` to serialise whatever the search has found.
 * The Internet Archive answers a CDX query in anywhere from 3s to 30s, so the
 * budget buys a useful number of probes without ever hanging the request.
 */
const SEARCH_BUDGET_MS = 90_000;
const ARCHIVE_TIMEOUT_MS = 30_000;

const CDX = "https://web.archive.org/cdx/search/cdx";
const COLLINFO = "https://index.commoncrawl.org/collinfo.json";

/**
 * Archive endpoints answer in ~3s but time out often enough that a single miss
 * would silently truncate a search, so every read gets one retry.
 */
async function fetchText(url: string, timeoutMs: number, attempts = 2): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "4allhuman-timeline/0.1 (+https://github.com/zeecares/4allhuman)" },
        redirect: "follow",
      });
      if (res.ok) return await res.text();
    } catch {
      // fall through to the retry
    }
  }
  return null;
}

/**
 * The oldest archived capture of robots.txt at or after `from`. One row per
 * probe is what keeps this cheap: sites like theverge.com have six-figure
 * capture counts, and the full index listing runs to megabytes.
 */
async function cdxCapture(robotsUrl: string, from?: string): Promise<WaybackSnapshot | null> {
  const query = new URLSearchParams({
    url: robotsUrl,
    output: "json",
    fl: "timestamp,statuscode,digest",
    filter: "statuscode:200",
    limit: "1",
  });
  if (from) query.set("from", from);
  const body = await fetchText(`${CDX}?${query}`, ARCHIVE_TIMEOUT_MS);
  return body === null ? null : (parseWaybackCdx(body)[0] ?? null);
}

/** Now, as an archive timestamp: the upper bound of any history search. */
function nowTimestamp(): string {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

/**
 * GET /api/timeline?domain=example.com
 * Dates the site's AI rights reservation from its archived robots.txt history
 * and places the published Common Crawl windows on either side of that date.
 */
export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const domain = req.nextUrl.searchParams.get("domain")?.trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return NextResponse.json({ error: "Provide ?domain=example.com" }, { status: 400 });
  }
  const robotsUrl = `${domain}/robots.txt`;

  try {
    const [oldest, liveRobots, collinfoBody] = await Promise.all([
      cdxCapture(robotsUrl),
      fetchText(`https://${domain}/robots.txt`, 8_000),
      fetchText(COLLINFO, 15_000),
    ]);

    if (!oldest) {
      return NextResponse.json(
        {
          error:
            "No archived robots.txt found for this domain (or the Internet Archive did not answer) — the reservation cannot be dated.",
        },
        { status: 404 },
      );
    }

    const history = await findFirstReservation(
      { first: oldest.timestamp, last: nowTimestamp() },
      async (from) => {
        const snapshot = await cdxCapture(robotsUrl, from);
        if (!snapshot) return null;
        const body = await fetchText(waybackRawUrl(snapshot.timestamp, robotsUrl), ARCHIVE_TIMEOUT_MS);
        return body === null ? null : { snapshot, state: reservationIn(body) };
      },
      { url: robotsUrl, deadline: startedAt + SEARCH_BUDGET_MS },
    );

    const current: ReservationState & { checked: boolean } = {
      ...reservationIn(liveRobots),
      checked: liveRobots !== null,
    };

    let crawlWindows: CrawlWindow[] = [];
    if (collinfoBody) {
      try {
        crawlWindows = (JSON.parse(collinfoBody) as CrawlWindow[])
          .slice(0, 12)
          .map(({ id, name, from, to }) => ({ id, name, from, to }));
      } catch {
        crawlWindows = [];
      }
    }
    const crawls = classifyCrawls(crawlWindows, history.reservedSince?.at ?? null);

    const timeline: ReservationTimeline = {
      domain,
      robotsUrl,
      history,
      current,
      crawls,
      verdict: summarize({ domain, history, current, crawls }),
      builtAt: new Date().toISOString(),
    };

    return NextResponse.json({ ...timeline, record: renderReservationRecord(timeline) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Timeline lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
