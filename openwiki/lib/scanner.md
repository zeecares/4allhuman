---
type: logic-layer
title: Scanner — Live Site Inspection
description: scanSite fetches a site's robots.txt, homepage, and ai.txt in parallel and parses the robots file with RFC 9309 group semantics and extracts noai/noimageai meta tags, in src/lib/scanner.ts.
tags: [scanner, robots-txt, rfc9309, fetch, meta-tags]
---

# Scanner — Live Site Inspection

`src/lib/scanner.ts` inspects a live site's current AI-training protection posture. It is the first stage of the [protect pipeline](../architecture/overview.md#the-protect-flow-scan-a-live-site): it fetches `/robots.txt`, the homepage HTML, and `/ai.txt` in parallel, parses the robots file with RFC 9309 group semantics, and extracts `noai`/`noimageai`/`notranslate` meta tags from the homepage. It uses the global `fetch` with **zero npm dependencies** beyond the Node runtime.

It exports the `ScanResult` shape, the top-level `scanSite` entrypoint, and two functions reused by the [verify route](../api/verify-route.md) to parse pasted text identically.

## `ScanResult`

```ts
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
```

`url` is the normalized origin (`https://…`). `reachable` is `true` if *either* `robots.txt` or the homepage responded; an unreachable site still produces a complete `ScanResult` with every crawler in `openCrawlers` and `scannedAt` set to the current UTC ISO timestamp. `blockedCrawlers` and `openCrawlers` partition the [19 `AI_CRAWLERS`](../lib/crawlers.md#the-ai_crawlers-blocklist) by whether a blocking group was found.

## `scanSite(rawUrl)`

The top-level entrypoint. It normalizes the input, then issues three parallel fetches:

1. `normalizeUrl(rawUrl)` → prepends `https://` if the input has no scheme, constructs a `URL`. Throws `Invalid URL: …` on a `URL` construction failure (caught by the [protect route](../api/protect-route.md)).
2. `Promise.all` over:
   - `fetchText(\`${origin}/robots.txt\`)` — 8 s timeout.
   - `fetchText(base.toString())` — the homepage.
   - `fetchText(\`${origin}/ai.txt\`)` — 8 s timeout.
<!-- openwiki: broken internal link [#parseRobotsForUA] heading anchor "parseRobotsForUA" does not exist in /openwiki/lib/scanner.md. Fix the href or restore the target, then delete this comment. -->
3. Parses the robots text with [`parseRobotsForUA`](#parseRobotsForUA) (or an empty map if `robots.txt` was not fetched).
4. Partitions `AI_CRAWLERS` into `blockedCrawlers` / `openCrawlers` by looking up each `crawler.userAgent.toLowerCase()` in the parsed map; absent UAs default to open (`?? false`).
<!-- openwiki: broken internal link [#extractMetaTags] heading anchor "extractMetaTags" does not exist in /openwiki/lib/scanner.md. Fix the href or restore the target, then delete this comment. -->
5. Returns the `ScanResult`, with `metaTagsFound` from [`extractMetaTags`](#extractMetaTags) on the homepage HTML (or `[]`) and `aiTxtFound` from whether `ai.txt` was non-null.

The `origin` (not the full URL) becomes the `url` field, so `en.wikipedia.org/wiki/…` and `en.wikipedia.org/` both scan `https://en.wikipedia.org`.

## `fetchText(url, timeoutMs = 8000)`

A defensive fetch wrapper used by all three parallel calls:

```ts
const res = await fetch(url, {
  signal: AbortSignal.timeout(timeoutMs),
  headers: { "User-Agent": "DontTrainOnMe-Scanner/0.1 (hackathon project)" },
  redirect: "follow",
});
if (!res.ok) return null;
return await res.text();
```

It **never throws** — any failure (timeout, non-2xx, network error) returns `null`, which the caller treats as "not found." This is the load-bearing decision behind the [graceful-unreachability invariant](../architecture/overview.md#invariants): a downed or slow site still produces a complete `ScanResult` and the [generator](../lib/generator.md) still emits deployable artifacts. The custom `User-Agent` identifies the scanner so a target's server logs show the project rather than a generic browser UA.

## `parseRobotsForUA(robotsTxt)`

The RFC 9309 robots parser. It returns a `Map<string, boolean>` keyed by lowercase user-agent, where `true` means that UA's group contains `Disallow: /` (or `Disallow: *`), i.e. the group blocks the root.

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    Start["rawLine"] --> Stripped["strip #comment, trim"]
    Stripped --> Empty{"empty?"}
    Empty -->|"yes"| NextLine["skip"]
    Empty -->|"no"| Colon{"has ':' ?"}
    Colon -->|"no"| NextLine2["skip"]
    Colon -->|"yes"| Key["key = lower(before colon)"]
    Key --> UA{"key == 'user-agent'?"}
    UA -->|"yes"| SawRule{"rule seen\nsince last UA?"}
    SawRule -->|"yes"| Flush["flush group → map"]
    SawRule -->|"no"| Collect["push UA to currentUAs"]
    UA -->|"no"| Sitemap{"key == 'sitemap'?"}
    Sitemap -->|"yes"| NextLine3["global directive — skip"]
    Sitemap -->|"no"| Rule["mark sawRule=true"]
    Rule --> Disallow{"disallow /\nor disallow *?"}
    Disallow -->|"yes"| Block["groupBlocksRoot = true"]
    Disallow -->|"no"| NextLine4["ignore"]
    Flush & Collect & NextLine & NextLine2 & NextLine3 & Block & NextLine4 --> LoopEnd["after loop: flush()"]
    LoopEnd --> Result["Map<ua, blocked>"]
```

The subtle invariant is the **group-merge semantics**: per RFC 9309, consecutive `User-agent:` lines belong to the same group until the first rule (`Disallow`/`Allow`/etc.) appears. The `sawRuleSinceLastUA` flag detects the transition — when a new `User-agent:` line appears *after* a rule was seen, `flush()` commits the previous group's UAs to the map and starts a new group. Blank lines and comment-only lines do **not** end a group (they are skipped by the empty-check). The `flush` at the end commits the final group. `Sitemap:` is a global directive, not part of any group, so it is skipped without setting `sawRule`.

This parser is the reason the [verify route](../api/verify-route.md) can re-score pasted `robots.txt` content identically to a live scan — it imports and reuses `parseRobotsForUA` directly.

## `extractMetaTags(html)`

Scans the homepage HTML for `<meta name="robots" …>` tags and collects which of `noai`, `noimageai`, `notranslate` directives appear in their `content`. It uses a `/<meta\s+[^>]*>/gi` regex to find all meta tags, then for each matching tag checks each directive with a `\b${directive}\b` word-boundary regex. The result is de-duplicated with a `Set` (`[...new Set(found)]`) so a directive repeated across multiple tags is reported once. Returns `[]` when there is no homepage or no matching tags. Note that `notranslate` is detected but **not scored** — the [score model](../lib/generator.md#the-score-model) awards the 20-point meta band only when `noai` or `noimageai` is present. This differs from the [verify route](../api/verify-route.md), which uses an inline regex requiring both a `<meta name="robots" …>` tag and a `\bnoai\b|\bnoimageai\b` match rather than calling `extractMetaTags`.

## `normalizeUrl`

Prepends `https://` when the input lacks an `http(s)://` scheme, then constructs a `URL`. The user can paste either `yourdomain.com` or `https://yourdomain.com`; both resolve to the same origin. The function throws if `new URL(…)` fails, and the [protect route](../api/protect-route.md) catches that into a 500 (the UI surfaces the message).

## Upstream and downstream

- **Upstream** — `scanSite` is called only from [`POST /api/protect`](../api/protect-route.md); `parseRobotsForUA` and `extractMetaTags` are also called from [`POST /api/verify`](../api/verify-route.md).
- **Downstream** — `ScanResult` feeds [`generateAllArtifacts` and `scoreFromScan`](../lib/generator.md) in the protect route.
- **Shared dependency** — `AI_CRAWLERS` from [crawlers.ts](../lib/crawlers.md) defines the partition.

## Scope boundary

The scanner reads; it never writes, posts, or scores. Scoring lives in [generator.ts](../lib/generator.md); the blocklist lives in [crawlers.ts](../lib/crawlers.md). It does not detect crawler identity spoofing, cannot audit what a model was trained on, and binds only crawlers that honor `robots.txt` — see [Legal Foundations](../research/legal-foundations.md).
