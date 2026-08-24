---
type: api-route
title: POST /api/verify — Re-score Deployed Artifacts
description: The verify route handler scores user-pasted robots.txt, ai.txt, and meta-tag content using the same RFC 9309 parser and computeScore as the protect flow, enabling a before/after comparison without a live fetch, in src/app/api/verify/route.ts.
tags: [api, route-handler, verify, scoring, nextjs]
---

# POST /api/verify — Re-score Deployed Artifacts

<!-- openwiki: broken internal link [../ui/page.md#verify-your-fix] heading anchor "verify-your-fix" does not exist in "../ui/page.md". Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../lib/scanner.md#parseRobotsForUA] heading anchor "parseRobotsForUA" does not exist in "../lib/scanner.md". Fix the href or restore the target, then delete this comment. -->
`src/app/api/verify/route.ts` powers the "verify-your-fix" panel in the [UI](../ui/page.md#verify-your-fix). It lets a creator paste the artifacts they actually deployed (robots.txt, ai.txt, `<head>` meta tags) and re-score them using the **same** [`parseRobotsForUA`](../lib/scanner.md#parseRobotsForUA) parser and [`computeScore`](../lib/generator.md#the-score-model) as the [protect flow](../architecture/overview.md#the-protect-flow-scan-a-live-site) — without re-fetching the live site. This is what makes the before/after comparison honest: the only difference between the two scores is the user's deployed content, not the scoring function.

## Route contract

| Property | Value |
|---|---|
| Method | `POST` |
| Path | `/api/verify` |
| Runtime | `nodejs` (`export const runtime = "nodejs"`) |
| Body | `{ robotsTxt?: string, aiTxt?: string, metaHtml?: string }` (JSON) |
| Success | `200` `{ score: ScoreResult, blockedCrawlers: string[], openCrawlers: string[] }` |
| Client error | `400` `{ error: "Provide at least one of robotsTxt, aiTxt, metaHtml" }` when all three are empty |
| Server error | `500` `{ error: string }` for any thrown error |

## Handler body

```ts
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { robotsTxt?: string; aiTxt?: string; metaHtml?: string };
    if (!body.robotsTxt && !body.aiTxt && !body.metaHtml) {
      return NextResponse.json(
        { error: "Provide at least one of robotsTxt, aiTxt, metaHtml" },
        { status: 400 },
      );
    }

    let blocked: string[] = [];
    if (body.robotsTxt) {
      const map = parseRobotsForUA(body.robotsTxt);
      blocked = AI_CRAWLERS.filter((c) => map.get(c.userAgent.toLowerCase()) ?? false).map((c) => c.userAgent);
    }

<!-- openwiki: broken internal link [training|dataset] file "training|dataset" does not exist. Fix the href or restore the target, then delete this comment. -->
    const aiTxtFound = !!body.aiTxt && /deny[- ](training|dataset)|permission:\s*deny/i.test(body.aiTxt);
    const hasNoaiMeta =
      !!body.metaHtml &&
      /<meta\s+[^>]*name\s*=\s*["']robots["'][^>]*>/i.test(body.metaHtml) &&
      /\bnoai\b|\bnoimageai\b/i.test(body.metaHtml);

    const score = computeScore({
      blockedCount: blocked.length,
      totalCrawlers: AI_CRAWLERS.length,
      hasNoaiMeta,
      aiTxtFound,
      reachable: true, // pasted content is definitionally "deployed" for scoring
    });

    return NextResponse.json({
      score,
      blockedCrawlers: blocked,
      openCrawlers: AI_CRAWLERS.filter((c) => !blocked.includes(c.userAgent)).map((c) => c.userAgent),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## How it differs from `/api/protect`

| Concern | `/api/protect` | `/api/verify` |
|---|---|---|
| Input | `{ url }` — a domain to scan | `{ robotsTxt, aiTxt, metaHtml }` — pasted text |
| Live fetch | Yes (`scanSite`) | No — parses what the user pasted |
| Robots parsing | `parseRobotsForUA(liveText)` | `parseRobotsForUA(pastedText)` — same function |
| `ai.txt` detection | `scan.aiTxtFound` (fetched file exists) | regex on pasted `aiTxt` text |
| Meta detection | `extractMetaTags(homepageHtml)` | regex on pasted `metaHtml` |
| `reachable` in score | from `scan.reachable` | hardcoded `true` |
| Returns | `{ scan, artifacts, score }` | `{ score, blockedCrawlers, openCrawlers }` |

## Detection logic

<!-- openwiki: broken internal link [../lib/scanner.md#parseRobotsForUA] heading anchor "parseRobotsForUA" does not exist in "../lib/scanner.md". Fix the href or restore the target, then delete this comment. -->
- **`blocked`** — only computed when `robotsTxt` is present. Reuses [`parseRobotsForUA`](../lib/scanner.md#parseRobotsForUA) on the pasted text and filters `AI_CRAWLERS` by the resulting map (case-insensitive UA match, absent → open).
<!-- openwiki: broken internal link [training|dataset] file "training|dataset" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../lib/generator.md#generateAiTxt-domain] heading anchor "generateAiTxt-domain" does not exist in "../lib/generator.md". Fix the href or restore the target, then delete this comment. -->
- **`aiTxtFound`** — `true` when the pasted `aiTxt` text matches `/deny[- ](training|dataset)|permission:\s*deny/i`. This recognizes the `Permission: deny-training` / `deny-dataset` lines that [`generateAiTxt`](../lib/generator.md#generateAiTxt-domain) emits.
- **`hasNoaiMeta`** — `true` when the pasted `metaHtml` contains a `<meta name="robots" …>` tag whose content includes `noai` or `noimageai`. Two regex tests are AND-ed: the meta tag must exist *and* the directive must be present.

## `reachable: true` — the key invariant

The handler hardcodes `reachable: true` in the `computeScore` input. The comment explains why: "pasted content is definitionally 'deployed' for scoring." This means the 15-point reachability band is always awarded on verify, so the only variables in the before/after delta are the crawler coverage, the meta tag, and the ai.txt — i.e. exactly the things the user can change by deploying the generated artifacts. Without this, the verify score would always be 15 points lower than the protect score for the same configuration, which would be misleading.

## Upstream and downstream

<!-- openwiki: broken internal link [../ui/page.md#verify-your-fix] heading anchor "verify-your-fix" does not exist in "../ui/page.md". Fix the href or restore the target, then delete this comment. -->
- **Upstream** — called by the [verify-your-fix panel](../ui/page.md#verify-your-fix) in the client component, via `fetch("/api/verify", { method: "POST", body: { robotsTxt, aiTxt, metaHtml } })`. The panel is prefilled with the artifacts returned by `/api/protect`, so a creator can paste their deployed version directly.
- **Downstream** — imports `parseRobotsForUA` from [scanner.ts](../lib/scanner.md), `computeScore` from [generator.ts](../lib/generator.md), and `AI_CRAWLERS` from [crawlers.ts](../lib/crawlers.md). Returns `{ score, blockedCrawlers, openCrawlers }` — the UI renders the after score and the blocked/open chip lists.

## Scope boundary

This route does **not** generate artifacts — it only scores. It does **not** fetch the live site — that is `/api/protect`'s job. It trusts that the pasted text is what the user deployed; it has no way to confirm a live site matches it. The before/after comparison in the [UI](../ui/page.md) pairs the `/api/protect` score (before) with the `/api/verify` score (after) so the delta reflects the deployed fix.
