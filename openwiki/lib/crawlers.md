---
type: data-layer
title: Crawler Blocklist & Legal Text
description: The AI_CRAWLERS blocklist of 19 AI training crawlers and the LEGAL EU DSM Art. 4(3) reservation strings that every generated artifact embeds, in src/lib/crawlers.ts.
tags: [crawlers, blocklist, legal, eu-dsm, ai-crawlers]
---

# Crawler Blocklist & Legal Text

`src/lib/crawlers.ts` is the shared data layer for the whole application. It exports two things: the [`AI_CRAWLERS`](#the-ai_crawlers-blocklist) blocklist that defines which AI training crawlers the product tracks, and the [`LEGAL`](#the-legal-object) strings that embed the EU DSM Directive Art. 4(3) rights reservation into every generated artifact. It is a pure data module — no fetch, no side effects — imported by [scanner.ts](../lib/scanner.md), [generator.ts](../lib/generator.md), and both [API routes](../api/protect-route.md).

## The `AICrawler` type

```ts
export type AICrawler = {
  userAgent: string;
  operator: string;
  purpose: string;
  /** true if this crawler also powers a search/discovery product users may want to keep */
  dualUse?: boolean;
};
```

<!-- openwiki: broken internal link [../lib/scanner.md#parseRobotsForUA] heading anchor "parseRobotsForUA" does not exist in "../lib/scanner.md". Fix the href or restore the target, then delete this comment. -->
Each entry carries the exact `userAgent` token that appears in a `robots.txt` `User-agent:` line (case-sensitive in the source list; the [parser](../lib/scanner.md#parseRobotsForUA) lowercases both sides for comparison). `operator` and `purpose` are human-readable provenance shown in the research/trace context. The optional `dualUse` flag marks crawlers that also power a search/discovery product a creator may want to keep (e.g. `OAI-SearchBot`), so a blocking recommendation could be made with awareness — though the current generator blocks every crawler in `AI_CRAWLERS` unconditionally.

## The `AI_CRAWLERS` blocklist

`AI_CRAWLERS` is an array of 19 entries, each cited to its operator's official crawler documentation. The count (`AI_CRAWLERS.length`) is passed to `scoreFromScan` as `totalCrawlers`, so the 50-point "crawlers blocked" band in [the score](../lib/generator.md#the-score-model) scales as `blockedCount / 19`.

| `userAgent` | `operator` | `purpose` | `dualUse` |
|---|---|---|---|
| `GPTBot` | OpenAI | LLM training data collection | |
| `OAI-SearchBot` | OpenAI | ChatGPT Search index | ✓ |
| `ChatGPT-User` | OpenAI | Real-time user-initiated fetching | ✓ |
| `Google-Extended` | Google | Gemini / Vertex AI training | ✓ |
| `ClaudeBot` | Anthropic | LLM training data collection | |
| `Claude-Web` | Anthropic | Legacy web fetch | |
| `anthropic-ai` | Anthropic | AI assistant fetching | |
| `CCBot` | Common Crawl | Open dataset used by many model trainers | |
| `Bytespider` | ByteDance | TikTok / Doubao LLM training | |
| `PerplexityBot` | Perplexity | Answer engine index + training | ✓ |
| `Amazonbot` | Amazon | Alexa / Nova training | ✓ |
| `Applebot-Extended` | Apple | Apple Intelligence training | ✓ |
| `Meta-ExternalAgent` | Meta | LLaMA training data collection | |
| `YouBot` | You.com | Answer engine index + training | ✓ |
| `Diffbot` | Diffbot | Knowledge-graph / dataset extraction | |
| `Cotoyogi` | NII (Japan) | Research LLM corpus | |
| `Timpibot` | Timpi | Web-scale dataset | |
| `iaskspider` | iAsk.AI | LLM training data collection | |
| `ImagesiftBot` | Hive | Image dataset collection | |

## The `LEGAL` object

```ts
export const LEGAL = {
  euReservation: "# EU DSM Directive (EU) 2019/790 Article 4(3) rights reservation\n" + …,
  notice: "This site reserves all rights regarding the use of its content for machine learning,\n" + …,
};
```

<!-- openwiki: broken internal link [../lib/generator.md#generateAiTxt] heading anchor "generateAiTxt" does not exist in "../lib/generator.md". Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../lib/generator.md#generateLegalNotice] heading anchor "generateLegalNotice" does not exist in "../lib/generator.md". Fix the href or restore the target, then delete this comment. -->
`LEGAL.euReservation` is the comment-prefixed text of the EU DSM Directive (EU) 2019/790 Article 4(3) rights reservation, citing Directive 96/9/EC, 2001/29/EC, and 2009/24/EC. It is embedded verbatim into the [generated `/ai.txt`](../lib/generator.md#generateAiTxt) and the [legal notice](../lib/generator.md#generateLegalNotice), and referenced (with the leading `# ` stripped) in the notice. `LEGAL.notice` is the human-readable statement of reserved rights used in the legal notice.

The legal basis for these strings — why a machine-readable reservation is the accepted form under EU law, and how EU AI Act Art. 53(1)(c) turns honoring it into a GPAI compliance duty — is documented in [Legal Foundations](../research/legal-foundations.md).

## How it is consumed

- **`scanner.ts`** imports `AI_CRAWLERS` and iterates it to classify each crawler as blocked or open against the parsed robots map.
- **`generator.ts`** imports `AI_CRAWLERS` (to produce the full block snippet when `openCrawlers` is empty) and `LEGAL` (to embed the reservation).
- **`/api/protect`** passes `AI_CRAWLERS.length` to `scoreFromScan` as `totalCrawlers`.
- **`/api/verify`** imports `AI_CRAWLERS` to compute `blocked`/`open` from the pasted robots text and to get `totalCrawlers` for `computeScore`.

## Extension point

To track a new AI training crawler, append an `AICrawler` to `AI_CRAWLERS`. The score's 50-point crawler band automatically rescales to the new `totalCrawlers` denominator, the [generator](../lib/generator.md) emits a `Disallow:` line for it, and both API routes reflect it without any further change. To change the embedded legal text, edit `LEGAL`; the generator and the legal notice pick it up.

## Scope boundary

This module only holds data and text. It does not fetch, parse, or score — those live in [scanner.ts](../lib/scanner.md) and [generator.ts](../lib/generator.md). The legal text here is a technical control, not legal counsel; see the [honesty module](../ui/page.md#honesty-module) and [Legal Foundations](../research/legal-foundations.md).
