/**
 * Reservation timeline: when did this site's AI opt-out actually start?
 *
 * A protection score is a snapshot, but EU DSM Art. 4(3) is a timing rule —
 * a rights reservation only bears on mining that happens after it is published
 * in machine-readable form. So the legally interesting question is not "is the
 * site protected today" but "since when", and "which known crawls of the site
 * happened after that date".
 *
 * This module reconstructs that history from two free, keyless public archives:
 *
 *   1. Internet Archive captures of /robots.txt, read as raw archived bytes.
 *   2. Common Crawl's index list, whose crawl windows (from/to) are published.
 *
 * The date is found by bisecting the *time axis* rather than replaying the
 * archive: a reservation is a monotone property in practice (sites add the
 * opt-out and keep it), so a lower-bound search over months lands on the
 * boundary in ~log2(months) reads — a dozen fetches for a site with a hundred
 * thousand archived revisions. The result reports both sides of the boundary,
 * the earliest capture that reserves and the latest that does not, so a reader
 * can check the change by hand instead of trusting the search.
 *
 * Pure functions plus an injected probe; zero deps.
 */
import { AI_CRAWLERS } from "./crawlers.ts";
import { evaluateCrawlers } from "./scanner.ts";

export type WaybackSnapshot = {
  /** Archive timestamp, YYYYMMDDhhmmss UTC. */
  timestamp: string;
  status: string;
  digest: string;
};

/**
 * Parse an Internet Archive CDX `output=json` body: a JSON array whose first
 * row is the field header. Rows that 404'd are dropped — an archived 404 means
 * the site had no robots.txt then, which is the same as no reservation, and
 * keeping them only wastes probes.
 */
export function parseWaybackCdx(body: string): WaybackSnapshot[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const [header, ...data] = rows as string[][];
  const col = (name: string) => header.indexOf(name);
  const iTs = col("timestamp");
  const iStatus = col("statuscode");
  const iDigest = col("digest");
  if (iTs < 0) return [];
  const out: WaybackSnapshot[] = [];
  for (const row of data) {
    const status = iStatus >= 0 ? (row[iStatus] ?? "") : "";
    if (status && !status.startsWith("2")) continue;
    out.push({
      timestamp: row[iTs],
      status,
      digest: iDigest >= 0 ? (row[iDigest] ?? "") : "",
    });
  }
  return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** "20240115120000" → "2024-01-15T12:00:00Z". */
export function waybackIso(timestamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(timestamp);
  if (!m) return timestamp;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

/** Permalink to the archived bytes, unrewritten (`id_`) so it is the raw file. */
export function waybackRawUrl(timestamp: string, url: string): string {
  return `https://web.archive.org/web/${timestamp}id_/${url}`;
}

/** Human-facing permalink for the same capture. */
export function waybackViewUrl(timestamp: string, url: string): string {
  return `https://web.archive.org/web/${timestamp}/${url}`;
}

export type ReservationState = {
  /** At least one known AI training crawler is disallowed at the site root. */
  reserved: boolean;
  blocked: number;
  total: number;
};

/**
 * Does this robots.txt reserve anything against AI training? Evaluated with the
 * same RFC 9309 matcher the live scan uses, so a historical verdict and a
 * present-day verdict are produced by identical code.
 */
export function reservationIn(robotsTxt: string | null | undefined): ReservationState {
  const total = AI_CRAWLERS.length;
  if (!robotsTxt || !robotsTxt.trim()) return { reserved: false, blocked: 0, total };
  const blocked = evaluateCrawlers(robotsTxt).filter((v) => !v.allowed).length;
  return { reserved: blocked > 0, blocked, total };
}

export type Probe = ReservationState & {
  timestamp: string;
  /** ISO form of `timestamp`, for readers and for date arithmetic. */
  at: string;
  archiveUrl: string;
};

export type ReservationHistory = {
  /** Earliest capture found that reserves against AI crawlers. */
  reservedSince: Probe | null;
  /** Latest capture known to carry no reservation — the other side of the boundary. */
  lastUnreserved: Probe | null;
  /** Every capture actually read, in probe order: the audit trail. */
  probes: Probe[];
  /** Months of archive covered by the search. */
  monthsSearched: number;
  /**
   * True when the bisection ran to its end. False means it stopped on the probe
   * budget or the time budget, so an earlier reserving capture may exist.
   */
  complete: boolean;
  /**
   * True when the change is pinned between a known unreserved capture and a
   * known reserved one. False means the earliest capture we could read already
   * reserved, so the real date is "at or before" the one reported.
   */
  bracketed: boolean;
};

/** Month cursors (`YYYYMM01000000`) spanning two archive timestamps. */
export function monthCursors(firstTimestamp: string, lastTimestamp: string): string[] {
  const toIndex = (ts: string) => Number(ts.slice(0, 4)) * 12 + (Number(ts.slice(4, 6)) - 1);
  const start = toIndex(firstTimestamp);
  const end = toIndex(lastTimestamp);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const cursors: string[] = [];
  for (let i = start; i <= end; i++) {
    const year = Math.floor(i / 12);
    const month = String((i % 12) + 1).padStart(2, "0");
    cursors.push(`${year}${month}01000000`);
  }
  return cursors;
}

/**
 * Lower-bound bisection over months for the first reservation.
 *
 * `probe(cursor)` resolves the first capture at or after that month and reads
 * it; returning null means the archive had nothing readable from there on, and
 * the search narrows instead of guessing a verdict. Because a probe answers
 * about the capture it actually found — often later than the month asked for —
 * the bounds move to that capture's month, which keeps the invariant tight and
 * saves reads on sparsely archived sites.
 */
export async function findFirstReservation(
  bounds: { first: string; last: string },
  probe: (fromTimestamp: string) => Promise<{ snapshot: WaybackSnapshot; state: ReservationState } | null>,
  options: { url?: string; maxProbes?: number; deadline?: number } = {},
): Promise<ReservationHistory> {
  const url = options.url ?? "";
  const maxProbes = options.maxProbes ?? 14;
  const outOfTime = () => options.deadline !== undefined && Date.now() >= options.deadline;
  const cursors = monthCursors(bounds.first, bounds.last);
  const monthOf = (ts: string) => cursors.findIndex((c) => c.slice(0, 6) === ts.slice(0, 6));
  const probes: Probe[] = [];
  let reservedSince: Probe | null = null;
  let lastUnreserved: Probe | null = null;

  let lo = 0;
  let hi = cursors.length; // exclusive: first month known to reserve
  while (lo < hi && probes.length < maxProbes && !outOfTime()) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const found = await probe(cursors[mid]);
    if (!found) {
      hi = mid;
      continue;
    }
    const { snapshot, state } = found;
    const record: Probe = {
      ...state,
      timestamp: snapshot.timestamp,
      at: waybackIso(snapshot.timestamp),
      archiveUrl: waybackViewUrl(snapshot.timestamp, url),
    };
    probes.push(record);
    const landed = monthOf(snapshot.timestamp);
    if (state.reserved) {
      if (!reservedSince || snapshot.timestamp < reservedSince.timestamp) reservedSince = record;
      hi = Math.min(hi, landed < 0 ? mid : landed);
    } else {
      if (!lastUnreserved || snapshot.timestamp > lastUnreserved.timestamp) lastUnreserved = record;
      lo = Math.max(mid, landed) + 1;
    }
  }

  return {
    reservedSince,
    lastUnreserved,
    probes,
    monthsSearched: cursors.length,
    complete: lo >= hi,
    bracketed: !!(
      reservedSince &&
      lastUnreserved &&
      lastUnreserved.timestamp < reservedSince.timestamp
    ),
  };
}

// ── Common Crawl windows vs the reservation date ────────────────────────────

export type CrawlWindow = { id: string; name: string; from: string; to: string };

export type CrawlPhase = "pre" | "post" | "straddles" | "unknown";

export type ClassifiedCrawl = CrawlWindow & {
  phase: CrawlPhase;
  /** Plain-language consequence of the phase. */
  note: string;
};

const PHASE_NOTES: Record<CrawlPhase, string> = {
  pre: "Crawled before the reservation existed — lawful TDM under Art. 4(3); no claim.",
  post: "Crawled after the reservation was machine-readable — inside the claim window.",
  straddles:
    "Crawl window spans the reservation date — check the capture timestamps before relying on it.",
  unknown: "No reservation date established, so this crawl cannot be placed on either side.",
};

/** Compare ISO-ish timestamps that may or may not carry a trailing Z. */
function cmpTime(a: string, b: string): number {
  const norm = (t: string) => t.replace(/Z$/, "");
  return norm(a).localeCompare(norm(b));
}

/**
 * Split published Common Crawl windows around the reservation date. A crawl is
 * only "post" when it started after the reservation was already readable, which
 * is the conservative reading: a crawl that straddles the date is reported as
 * straddling rather than counted for the creator.
 */
export function classifyCrawls(
  crawls: CrawlWindow[],
  reservedSinceIso: string | null,
): ClassifiedCrawl[] {
  return crawls.map((crawl) => {
    const phase: CrawlPhase = !reservedSinceIso
      ? "unknown"
      : cmpTime(crawl.from, reservedSinceIso) >= 0
        ? "post"
        : cmpTime(crawl.to, reservedSinceIso) <= 0
          ? "pre"
          : "straddles";
    return { ...crawl, phase, note: PHASE_NOTES[phase] };
  });
}

export type ReservationTimeline = {
  domain: string;
  robotsUrl: string;
  history: ReservationHistory;
  /** Reservation state of the site right now, for continuity. */
  current: ReservationState & { checked: boolean };
  crawls: ClassifiedCrawl[];
  /** One-line verdict for the module header. */
  verdict: string;
  builtAt: string;
};

export function summarize(input: {
  domain: string;
  history: ReservationHistory;
  current: ReservationState & { checked: boolean };
  crawls: ClassifiedCrawl[];
}): string {
  const { history, current, crawls } = input;
  if (!history.reservedSince) {
    return current.reserved
      ? "Reserved today, but no archived robots.txt proves when it started — the claim window cannot be dated."
      : "No AI reservation found in this site's archived robots.txt history, and none today.";
  }
  if (!current.reserved && current.checked) {
    return `Reserved from ${history.reservedSince.at}, but today's robots.txt blocks no AI crawler — the reservation has lapsed.`;
  }
  const since = history.bracketed
    ? `since ${history.reservedSince.at}`
    : `since at least ${history.reservedSince.at} (the oldest capture we could read already reserved, so it may be older)`;
  const post = crawls.filter((c) => c.phase === "post").length;
  return `Machine-readable reservation in place ${since}; ${post} published Common Crawl window${post === 1 ? "" : "s"} started after that date.`;
}

/**
 * A plain-text record a creator can attach to a complaint: what was reserved,
 * since when, the two archive permalinks that bracket the change, and which
 * crawls fall inside the window. Every line is independently checkable — no
 * claim rests on this tool having been run.
 */
export function renderReservationRecord(timeline: ReservationTimeline): string {
  const { history, current, crawls } = timeline;
  const lines = [
    `# Rights reservation record — ${timeline.domain}`,
    `# Built ${timeline.builtAt} by 4allhuman. Every line below is re-checkable from public archives.`,
    "",
    `Verdict: ${timeline.verdict}`,
    "",
    "## Reservation boundary (Internet Archive)",
  ];
  if (history.reservedSince) {
    lines.push(
      `${history.bracketed ? "First" : "Earliest read"} archived robots.txt reserving against AI crawlers: ${history.reservedSince.at}`,
      `  blocks ${history.reservedSince.blocked}/${history.reservedSince.total} known AI crawlers`,
      `  ${waybackRawUrl(history.reservedSince.timestamp, timeline.robotsUrl)}`,
    );
  } else {
    lines.push("No archived revision of robots.txt reserves against AI crawlers.");
  }
  if (history.lastUnreserved) {
    lines.push(
      `Last archived robots.txt without a reservation: ${history.lastUnreserved.at}`,
      `  ${waybackRawUrl(history.lastUnreserved.timestamp, timeline.robotsUrl)}`,
    );
  }
  lines.push(
    "",
    `Today: ${current.checked ? `${current.blocked}/${current.total} known AI crawlers blocked` : "live robots.txt could not be read"}`,
    `Archive months searched: ${history.monthsSearched} · captures read: ${history.probes.length} · boundary ${history.bracketed ? "bracketed" : "not bracketed (date is an upper bound)"}${history.complete ? "" : " · search stopped on its read/time budget"}`,
    "",
    "## Common Crawl windows",
  );
  for (const crawl of crawls) {
    lines.push(`${crawl.phase.toUpperCase().padEnd(9)} ${crawl.id}  ${crawl.from} → ${crawl.to}`);
  }
  lines.push(
    "",
    "## Basis and limits",
    "EU DSM Directive (EU) 2019/790 Art. 4(3): a reservation expressed in machine-readable form",
    "removes the TDM exception for mining that happens afterwards. EU AI Act Art. 53(1)(c)",
    "obliges GPAI providers to identify and respect it.",
    "",
    "This record dates a reservation; it does not prove any model trained on this content, and",
    "a crawl inside the window is evidence of collection, not of an infringement finding.",
    "Dates come from the Internet Archive and Common Crawl and are only as complete as their",
    "coverage: a reservation may predate the earliest archived revision.",
  );
  return lines.join("\n");
}
