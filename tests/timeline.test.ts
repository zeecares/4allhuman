import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyCrawls,
  findFirstReservation,
  monthCursors,
  parseWaybackCdx,
  renderReservationRecord,
  reservationIn,
  summarize,
  waybackIso,
  waybackRawUrl,
  type ReservationState,
  type WaybackSnapshot,
} from "../src/lib/timeline.ts";

// ── CDX parsing ─────────────────────────────────────────────────────────────

test("parseWaybackCdx reads header-indexed rows and sorts ascending", () => {
  const body = JSON.stringify([
    ["timestamp", "statuscode", "digest"],
    ["20240301000000", "200", "BBB"],
    ["20210101000000", "200", "AAA"],
  ]);
  const snaps = parseWaybackCdx(body);
  assert.deepEqual(
    snaps.map((s) => s.timestamp),
    ["20210101000000", "20240301000000"],
  );
  assert.equal(snaps[0].digest, "AAA");
});

test("parseWaybackCdx drops non-2xx captures and survives junk", () => {
  const body = JSON.stringify([
    ["timestamp", "statuscode", "digest"],
    ["20200101000000", "404", "X"],
    ["20200201000000", "301", "Y"],
    ["20200301000000", "200", "Z"],
  ]);
  assert.deepEqual(
    parseWaybackCdx(body).map((s) => s.timestamp),
    ["20200301000000"],
  );
  assert.deepEqual(parseWaybackCdx(""), []);
  assert.deepEqual(parseWaybackCdx("not json"), []);
  assert.deepEqual(parseWaybackCdx("[]"), []);
});

test("waybackIso and waybackRawUrl produce checkable references", () => {
  assert.equal(waybackIso("20240115120000"), "2024-01-15T12:00:00Z");
  assert.equal(waybackIso("20240115"), "2024-01-15T00:00:00Z");
  assert.equal(
    waybackRawUrl("20240115120000", "example.com/robots.txt"),
    "https://web.archive.org/web/20240115120000id_/example.com/robots.txt",
  );
});

// ── reservation detection ───────────────────────────────────────────────────

test("reservationIn uses RFC 9309 semantics on archived text", () => {
  assert.equal(reservationIn(null).reserved, false);
  assert.equal(reservationIn("User-agent: *\nAllow: /").reserved, false);
  const gptOnly = reservationIn("User-agent: GPTBot\nDisallow: /");
  assert.equal(gptOnly.reserved, true);
  assert.equal(gptOnly.blocked, 1);
  const all = reservationIn("User-agent: *\nDisallow: /");
  assert.equal(all.blocked, all.total);
});

// ── bisection over the time axis ────────────────────────────────────────────

test("monthCursors spans whole months inclusively across year ends", () => {
  assert.deepEqual(monthCursors("20231115120000", "20240210000000"), [
    "20231101000000",
    "20231201000000",
    "20240101000000",
    "20240201000000",
  ]);
  assert.deepEqual(monthCursors("20240210000000", "20231115120000"), []);
});

/**
 * A fake archive holding one capture per month, reserving from `reservedFrom`.
 * Months in `missing` have no capture, so a probe lands on a later one.
 */
function fakeArchive(options: {
  first: string;
  last: string;
  reservedFrom: string;
  missing?: Set<string>;
}) {
  const months = monthCursors(options.first, options.last).filter(
    (m) => !options.missing?.has(m.slice(0, 6)),
  );
  return async (from: string) => {
    const month = months.find((m) => m >= from);
    if (!month) return null;
    const snapshot: WaybackSnapshot = {
      timestamp: `${month.slice(0, 6)}15000000`,
      status: "200",
      digest: month,
    };
    const state: ReservationState =
      month.slice(0, 6) >= options.reservedFrom
        ? { reserved: true, blocked: 3, total: 10 }
        : { reserved: false, blocked: 0, total: 10 };
    return { snapshot, state };
  };
}

test("findFirstReservation brackets the change in logarithmic reads", async () => {
  const bounds = { first: "20150101000000", last: "20261201000000" };
  const history = await findFirstReservation(
    bounds,
    fakeArchive({ ...bounds, reservedFrom: "202308" }),
    { url: "example.com/robots.txt" },
  );
  assert.equal(history.reservedSince?.timestamp, "20230815000000");
  assert.equal(history.lastUnreserved?.timestamp, "20230715000000");
  assert.equal(history.bracketed, true);
  assert.equal(history.complete, true);
  assert.equal(history.monthsSearched, 144);
  assert.ok(history.probes.length <= 8, `expected <= 8 reads, made ${history.probes.length}`);
});

test("findFirstReservation reports nothing when no capture reserves", async () => {
  const bounds = { first: "20200101000000", last: "20211201000000" };
  const history = await findFirstReservation(
    bounds,
    fakeArchive({ ...bounds, reservedFrom: "209901" }),
  );
  assert.equal(history.reservedSince, null);
  assert.ok(history.lastUnreserved);
  assert.equal(history.bracketed, false);
});

test("a reservation older than the archive is reported unbracketed", async () => {
  const bounds = { first: "20240101000000", last: "20241201000000" };
  const history = await findFirstReservation(
    bounds,
    fakeArchive({ ...bounds, reservedFrom: "202401" }),
  );
  assert.equal(history.reservedSince?.timestamp, "20240115000000");
  assert.equal(history.lastUnreserved, null);
  assert.equal(history.bracketed, false);
});

test("gaps in the archive move the bounds to the capture actually found", async () => {
  const missing = new Set(["202302", "202303", "202304", "202305", "202306", "202307"]);
  const bounds = { first: "20220101000000", last: "20231201000000" };
  const history = await findFirstReservation(
    bounds,
    fakeArchive({ ...bounds, reservedFrom: "202308", missing }),
  );
  assert.equal(history.reservedSince?.timestamp, "20230815000000");
  assert.equal(history.lastUnreserved?.timestamp, "20230115000000");
  assert.ok(history.probes.every((p) => !missing.has(p.timestamp.slice(0, 6))));
});

test("an unreadable archive never fabricates a date", async () => {
  const history = await findFirstReservation(
    { first: "20200101000000", last: "20211201000000" },
    async () => null,
  );
  assert.equal(history.reservedSince, null);
  assert.equal(history.lastUnreserved, null);
  assert.equal(history.probes.length, 0);
});

test("an empty range reads nothing", async () => {
  const history = await findFirstReservation(
    { first: "20240301000000", last: "20240101000000" },
    async () => {
      throw new Error("should not probe");
    },
  );
  assert.equal(history.monthsSearched, 0);
  assert.equal(history.probes.length, 0);
});

test("a spent time budget stops the search and says so", async () => {
  const bounds = { first: "20150101000000", last: "20261201000000" };
  const archive = fakeArchive({ ...bounds, reservedFrom: "202308" });
  const history = await findFirstReservation(
    bounds,
    async (from) => {
      const found = await archive(from);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return found;
    },
    { deadline: Date.now() + 6 },
  );
  assert.equal(history.complete, false);
  assert.ok(history.probes.length >= 1);
});

// ── crawl classification ────────────────────────────────────────────────────

const CRAWLS = [
  { id: "CC-MAIN-2023-50", name: "Dec 2023", from: "2023-11-28T00:00:00", to: "2023-12-12T00:00:00" },
  { id: "CC-MAIN-2024-10", name: "Feb 2024", from: "2024-02-20T00:00:00", to: "2024-03-05T00:00:00" },
  { id: "CC-MAIN-2024-22", name: "May 2024", from: "2024-05-18T00:00:00", to: "2024-06-01T00:00:00" },
];

test("classifyCrawls splits windows around the reservation date", () => {
  const out = classifyCrawls(CRAWLS, "2024-03-01T00:00:00Z");
  assert.deepEqual(
    out.map((c) => c.phase),
    ["pre", "straddles", "post"],
  );
  assert.match(out[0].note, /lawful TDM/);
});

test("classifyCrawls refuses to place crawls without a reservation date", () => {
  assert.ok(classifyCrawls(CRAWLS, null).every((c) => c.phase === "unknown"));
});

// ── summary + record ────────────────────────────────────────────────────────

const HISTORY = {
  reservedSince: {
    reserved: true,
    blocked: 8,
    total: 10,
    timestamp: "20240301000000",
    at: "2024-03-01T00:00:00Z",
    archiveUrl: "https://web.archive.org/web/20240301000000/example.com/robots.txt",
  },
  lastUnreserved: {
    reserved: false,
    blocked: 0,
    total: 10,
    timestamp: "20240201000000",
    at: "2024-02-01T00:00:00Z",
    archiveUrl: "https://web.archive.org/web/20240201000000/example.com/robots.txt",
  },
  probes: [],
  monthsSearched: 120,
  complete: true,
  bracketed: true,
};

test("summarize counts the post-reservation crawl windows", () => {
  const crawls = classifyCrawls(CRAWLS, HISTORY.reservedSince.at);
  const verdict = summarize({
    domain: "example.com",
    history: HISTORY,
    current: { reserved: true, blocked: 8, total: 10, checked: true },
    crawls,
  });
  assert.match(verdict, /since 2024-03-01T00:00:00Z/);
  assert.match(verdict, /1 published Common Crawl window/);
});

test("summarize calls out a lapsed reservation", () => {
  const verdict = summarize({
    domain: "example.com",
    history: HISTORY,
    current: { reserved: false, blocked: 0, total: 10, checked: true },
    crawls: [],
  });
  assert.match(verdict, /lapsed/);
});

test("summarize admits when today's protection cannot be dated", () => {
  const verdict = summarize({
    domain: "example.com",
    history: {
      reservedSince: null,
      lastUnreserved: null,
      probes: [],
      monthsSearched: 0,
      complete: true,
      bracketed: false,
    },
    current: { reserved: true, blocked: 5, total: 10, checked: true },
    crawls: [],
  });
  assert.match(verdict, /cannot be dated/);
});

test("renderReservationRecord carries both boundary permalinks and the limits", () => {
  const crawls = classifyCrawls(CRAWLS, HISTORY.reservedSince.at);
  const record = renderReservationRecord({
    domain: "example.com",
    robotsUrl: "example.com/robots.txt",
    history: HISTORY,
    current: { reserved: true, blocked: 8, total: 10, checked: true },
    crawls,
    verdict: "…",
    builtAt: "2024-06-01T00:00:00Z",
  });
  assert.match(record, /20240301000000id_\/example\.com\/robots\.txt/);
  assert.match(record, /20240201000000id_\/example\.com\/robots\.txt/);
  assert.match(record, /POST {6}CC-MAIN-2024-22/);
  assert.match(record, /does not prove any model trained on this content/);
});
