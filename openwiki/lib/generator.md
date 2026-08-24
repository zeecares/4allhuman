---
type: logic-layer
title: Generator — Artifacts & Protection Score
description: generateAllArtifacts produces the robots.txt block, ai.txt, meta tags, and legal notice from a scan; computeScore applies a fixed 50/20/15/15 weighted model that both the protect and verify flows share, in src/lib/generator.ts.
tags: [generator, artifacts, scoring, robots-txt, ai-txt, meta-tags]
---

# Generator — Artifacts & Protection Score

`src/lib/generator.ts` is the second and third stage of the [protect pipeline](../architecture/overview.md#the-protect-flow-scan-a-live-site): it turns a `ScanResult` into deployable opt-out artifacts and computes a fixed weighted protection score. It is a pure module — no I/O — that imports the [`AI_CRAWLERS` blocklist and `LEGAL` strings](../lib/crawlers.md) and the `ScanResult` type from [scanner.ts](../lib/scanner.md).

## `GeneratedArtifacts`

```ts
export type GeneratedArtifacts = {
  robotsSnippet: string;
  fullRobotsTxt: string;
  aiTxt: string;
  metaTags: string;
  legalNotice: string;
};
```

All five fields are rendered by the [UI](../ui/page.md) with copy buttons and, for the robots block, a hint to append it to an existing file.

## `generateAllArtifacts(scan)`

The composition entrypoint. It decides which crawlers to block, then delegates:

1. **`toBlock`** — if `scan.openCrawlers` is non-empty, block the open ones; otherwise (e.g. an unreachable site with everything already open, or a fully-protected site) fall back to blocking **all** `AI_CRAWLERS` via `AI_CRAWLERS.map((c) => c.userAgent)`. This is the [graceful-unreachability invariant](../architecture/overview.md#invariants): even a downed site gets a complete, deployable block snippet.
2. **`robotsSnippet`** — `generateRobotsSnippet(toBlock)` (the snippet alone).
3. **`fullRobotsTxt`** — the same snippet, prefixed with `# Append the section below to your existing robots.txt` *only if* `scan.robotsFound` is true, so the user gets a drop-in replacement when they already have a robots file.
4. **`aiTxt`** — `generateAiTxt(scan.url)`.
5. **`metaTags`** — `generateMetaTags()`.
6. **`legalNotice`** — `generateLegalNotice(scan.url)`.

## The artifact generators

### `generateRobotsSnippet(blocked)`

Produces the robots.txt block: a header comment (citing EU DSM Art. 4(3)), then every blocked UA on its own `User-agent:` line, then a single `Disallow: /`. Grouping all AI UAs under one group with a blanket disallow is valid per RFC 9309 (consecutive `User-agent` lines form one group). Returns `""` when `blocked` is empty — but `generateAllArtifacts` never passes an empty list because of the all-crawlers fallback.

### `generateAiTxt(domain)`

A [Spawning-spec](https://spawning.ai/documents/ai.txt) `/ai.txt` body: header comments, `User-Agent: *`, three `Permission:` lines (`deny-training`, `deny-dataset`, `deny-inference-prompting`), and the [`LEGAL.euReservation`](../lib/crawlers.md#the-legal-object) text verbatim. The domain and generation timestamp are stamped in the header.

### `generateMetaTags()`

A single static line:

```html
<meta name="robots" content="noai, noimageai">
```

### `generateLegalNotice(domain)`

A `# Notice of Reserved Rights — <domain>` header, the [`LEGAL.notice`](../lib/crawlers.md#the-legal-object) text, and the `LEGAL.euReservation` with the leading `# ` stripped (so it reads as a plain statement rather than a robots.txt comment).

## The score model

### `computeScore(input: ScoreInput)`

The shared, fixed weighted model. It is the single source of truth for the 0–100 score in **both** the [protect](../api/protect-route.md) and [verify](../api/verify-route.md) flows.

| Band | Weight | Condition | Max |
|---|---|---|---|
| AI crawlers blocked in `robots.txt` | 50 | `round((blockedCount / totalCrawlers) * 50)` | 50 |
| `noai`/`noimageai` meta tags | 20 | `input.hasNoaiMeta ? 20 : 0` | 20 |
| `ai.txt` published | 15 | `input.aiTxtFound ? 15 : 0` | 15 |
| Site reachable for verification | 15 | `input.reachable ? 15 : 0` | 15 |

The total is the sum of the four `got` values. The 50-point band is computed from a `crawlerCoverage` ratio (`totalCrawlers > 0 ? blockedCount / totalCrawlers : 0`) with a **zero-total guard**: if `totalCrawlers` is ever `0` the coverage falls back to `0` rather than dividing by zero, yielding `0` points. In practice `totalCrawlers` is always `AI_CRAWLERS.length` (19), so the guard is a defensive invariant, not a live path. The weights are deliberately fixed and published (no black box): the UI states "Weights are fixed and published — no black box, no account, nothing stored." This is the [trust principle](../architecture/overview.md#lifecycle-and-trust).

### `ScoreInput` — the decoupling seam

```ts
export type ScoreInput = {
  blockedCount: number;
  totalCrawlers: number;
  hasNoaiMeta: boolean;
  aiTxtFound: boolean;
  reachable: boolean;
};
```

`ScoreInput` exists so the [verify route](../api/verify-route.md) can score pasted artifact content **identically** to a live scan without re-fetching the site. The protect route derives it from a `ScanResult` via `scoreFromScan`; the verify route constructs it directly (with `reachable: true`, since pasted content is definitionally "deployed"). This is the core design seam that makes the before/after verification honest.

### `scoreFromScan(scan, totalCrawlers)`

The adapter from a live `ScanResult` to `ScoreInput` + `computeScore`:

```ts
computeScore({
  blockedCount: scan.blockedCrawlers.length,
  totalCrawlers,
  hasNoaiMeta: scan.metaTagsFound.includes("noai") || scan.metaTagsFound.includes("noimageai"),
  aiTxtFound: scan.aiTxtFound,
  reachable: scan.reachable,
});
```

`totalCrawlers` is passed by the caller as `AI_CRAWLERS.length` (19), keeping `computeScore` independent of the [blocklist](../lib/crawlers.md) size so the 50-point band scales with the denominator.

## Upstream and downstream

- **Upstream** — `generateAllArtifacts` and `scoreFromScan` are called by [`POST /api/protect`](../api/protect-route.md); `computeScore` is called by [`POST /api/verify`](../api/verify-route.md).
- **Downstream** — the `GeneratedArtifacts` and the score breakdown are rendered by the [UI](../ui/page.md); the `ScoreResult` shape (`{ score, breakdown: { label, got, max }[] }`) drives the verdict card and the before/after row.
- **Shared dependency** — `AI_CRAWLERS` (for the all-crawlers fallback) and `LEGAL` (for the embedded text) from [crawlers.ts](../lib/crawlers.md); `ScanResult` from [scanner.ts](../lib/scanner.md).

## Extension point

To add a new scoring band, extend the `breakdown` array in `computeScore` and the `ScoreInput` type — both flows pick it up automatically. To change a weight, edit the `got` expression. The UI reads `breakdown` dynamically, so new bands appear without UI changes.

## Scope boundary

The generator produces text and a number; it does not fetch (that's [scanner.ts](../lib/scanner.md)) or define the crawler list (that's [crawlers.ts](../lib/crawlers.md)). The score measures *coverage of known opt-out signals*, not real-world protection — it cannot reflect whether a scraper honors the signals, and the honesty module in the [UI](../ui/page.md#honesty-module) states this plainly.
