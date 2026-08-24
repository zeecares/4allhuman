---
type: api-route
title: POST /api/protect — Scan Orchestrator
description: The protect route handler orchestrates scanSite, generateAllArtifacts, and scoreFromScan into the single protect endpoint that returns scan evidence, deployable artifacts, and a protection score, in src/app/api/protect/route.ts.
tags: [api, route-handler, protect, orchestrator, nextjs]
---

# POST /api/protect — Scan Orchestrator

`src/app/api/protect/route.ts` is the orchestrator for the [protect flow](../architecture/overview.md#the-protect-flow-scan-a-live-site). It is a thin composition layer: it validates the request body, calls [`scanSite`](../lib/scanner.md) to inspect the live site, feeds the result to [`generateAllArtifacts`](../lib/generator.md) and [`scoreFromScan`](../lib/generator.md), and returns the three-part `{ scan, artifacts, score }` payload that the [UI](../ui/page.md) renders.

## Route contract

| Property | Value |
|---|---|
| Method | `POST` |
| Path | `/api/protect` |
| Runtime | `nodejs` (set via `export const runtime = "nodejs"`) |
| Body | `{ url?: string }` (JSON) |
| Success | `200` `{ scan: ScanResult, artifacts: GeneratedArtifacts, score: ScoreResult }` |
| Client error | `400` `{ error: "Missing \`url\` in body" }` when `url` is absent or not a string |
| Server error | `500` `{ error: string }` for any thrown error (e.g. invalid URL) |

## Handler body

```ts
export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing `url` in body" }, { status: 400 });
    }
    const scan: ScanResult = await scanSite(url);
    const artifacts = generateAllArtifacts(scan);
    const score = scoreFromScan(scan, AI_CRAWLERS.length);
    return NextResponse.json({ scan, artifacts, score });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## Composition

The handler wires three lib modules in sequence, with no intermediate transformation:

1. **`scanSite(url)`** — fetches `/robots.txt`, the homepage, and `/ai.txt` in parallel, parses the robots file with RFC 9309 semantics, and returns a `ScanResult`. Throws `Invalid URL: …` if the URL is malformed (caught by the outer `try`).
2. **`generateAllArtifacts(scan)`** — produces the robots block, ai.txt, meta tags, and legal notice. Even when the site is unreachable (`scan.reachable === false`), this still returns deployable artifacts because the generator falls back to blocking all crawlers.
3. **`scoreFromScan(scan, AI_CRAWLERS.length)`** — computes the 50/20/15/15 weighted score. `AI_CRAWLERS.length` (19) is the denominator for the 50-point crawler band; it is imported from [crawlers.ts](../lib/crawlers.md).

## Why `runtime = "nodejs"`

`scanSite` uses the global `fetch` with `AbortSignal.timeout(8000)` and `redirect: "follow"`. The Next.js Edge runtime does not provide the Node global `fetch` with the same `AbortSignal` semantics, so the route pins itself to the Node runtime. The [verify route](../api/verify-route.md) does the same for consistency.

## Error handling

- A missing or non-string `url` → `400` with a clear message before any fetch happens.
<!-- openwiki: broken internal link [../lib/scanner.md#fetchText] heading anchor "fetchText" does not exist in "../lib/scanner.md". Fix the href or restore the target, then delete this comment. -->
- Any thrown error (invalid URL, network failure surfaced as a thrown `Error`, etc.) → `500` with the error message. Note that `scanSite`'s own fetch failures never throw — [`fetchText`](../lib/scanner.md#fetchText) returns `null` — so a 500 here typically means the URL could not be parsed into a `URL` object.

## Upstream and downstream

<!-- openwiki: broken internal link [../ui/page.md#scan-form] heading anchor "scan-form" does not exist in "../ui/page.md". Fix the href or restore the target, then delete this comment. -->
- **Upstream** — called only by the [scan form / example buttons](../ui/page.md#scan-form) in the client component, via `fetch("/api/protect", { method: "POST", body: { url } })`.
- **Downstream** — composes [`scanSite`](../lib/scanner.md), [`generateAllArtifacts`](../lib/generator.md), and [`scoreFromScan`](../lib/generator.md); imports `AI_CRAWLERS` from [crawlers.ts](../lib/crawlers.md) for `totalCrawlers`.

## Scope boundary

This route is pure orchestration — it contains no scanning, generating, or scoring logic of its own. To change the scan behavior, edit [scanner.ts](../lib/scanner.md); to change the artifacts or the score, edit [generator.ts](../lib/generator.md). The related [verify route](../api/verify-route.md) reuses the same parser and scorer but skips the live fetch.
