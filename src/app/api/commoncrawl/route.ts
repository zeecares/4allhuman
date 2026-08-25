import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type CrawlInfo = { id: string; name: string; "cdx-api": string };
type CrawlResult = { id: string; name: string; captures: number | null; error?: string };

let collCache: { data: CrawlInfo[]; at: number } | null = null;

async function getCrawls(): Promise<CrawlInfo[]> {
  if (collCache && Date.now() - collCache.at < 12 * 3600_000) return collCache.data;
  const res = await fetch("https://index.commoncrawl.org/collinfo.json", {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Common Crawl index list unavailable (${res.status})`);
  const data = (await res.json()) as CrawlInfo[];
  collCache = { data, at: Date.now() };
  return data;
}

/**
 * GET /api/commoncrawl?domain=example.com
 * Checks the latest N Common Crawl indexes for captures of the domain.
 * These crawls are the open corpora most AI training datasets are built from.
 */
export async function GET(req: NextRequest) {
  try {
    const domain = req.nextUrl.searchParams.get("domain")?.trim().toLowerCase();
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      return NextResponse.json({ error: "Provide ?domain=example.com" }, { status: 400 });
    }

    const crawls = (await getCrawls()).slice(0, 6); // latest 6 monthly indexes
    const checked = await Promise.allSettled(
      crawls.map(async (c): Promise<CrawlResult> => {
        const url = `${c["cdx-api"]}?url=${encodeURIComponent(`${domain}/*`)}&output=json&limit=200`;
        const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
        if (res.status === 503 || res.status === 429) {
          return { id: c.id, name: c.name, captures: null, error: "index busy — retry later" };
        }
        if (!res.ok) {
          return { id: c.id, name: c.name, captures: null, error: `HTTP ${res.status}` };
        }
        const text = await res.text();
        if (!text.trim() || text.includes("No Captures found")) {
          return { id: c.id, name: c.name, captures: 0 };
        }
        // each non-empty line is a JSON capture record
        const lines = text.trim().split("\n").filter((l) => l.startsWith("{"));
        return { id: c.id, name: c.name, captures: lines.length };
      }),
    );

    const results = checked.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { id: "?", name: "unknown crawl", captures: null, error: String(r.reason).slice(0, 80) },
    );

    const found = results.reduce((s, r) => s + (r.captures ?? 0), 0);
    return NextResponse.json({
      domain,
      inCorpus: results.some((r) => (r.captures ?? 0) > 0),
      totalCaptures: found,
      indexesChecked: results.length,
      crawls: results,
      checkedAt: new Date().toISOString(),
      note: "Counts capped at 200 per crawl. Common Crawl is the open corpus behind many AI training datasets.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Common Crawl lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
