---
type: quickstart
title: Don't Train On Me — Wiki Quickstart
description: Entry point to the OpenWiki code wiki for the Don't Train On Me repository — the high-level map, main concepts, API surface, and a task-routing table from change intent to the owning page, source symbols, and validation.
tags: [quickstart, overview, navigation]
---

# Don't Train On Me — Wiki Quickstart

**Don't Train On Me** is a single-page [Next.js](https://nextjs.org/) 15 / [React](https://react.dev/) 19 web app that measures a website's exposure to 19 known AI training crawlers, generates deployable machine-readable opt-out artifacts (robots.txt, ai.txt, meta tags, a legal notice), scores the protection posture on a fixed 0–100 scale, and lets a creator verify a deployed fix by re-scoring pasted artifacts. It has no database, no accounts, and stores nothing — every scan is a stateless request that re-fetches the live target site.

<!-- openwiki: broken internal link [../research/legal-foundations.md] file "../research/legal-foundations.md" does not exist. Fix the href or restore the target, then delete this comment. -->
The legal and technical research that grounds the product lives in [`research/protecting-human-content-from-ai-training.md`](../research/protecting-human-content-from-ai-training.md); the app turns its conclusions into a 60-second operation. See [Legal & Technical Foundations](../research/legal-foundations.md) for the distilled map.

## High-level map

```mermaid
flowchart LR
    UI["UI · page.tsx"] -->|POST {url}| Protect["POST /api/protect"]
    Protect --> Scanner["scanner.ts\nscanSite"]
    Scanner --> Generator["generator.ts\ngenerateAllArtifacts\ncomputeScore"]
    Generator -->|{scan,artifacts,score}| UI
    UI -->|POST {robotsTxt,aiTxt,metaHtml}| Verify["POST /api/verify"]
    Verify -->|parseRobotsForUA + computeScore| Generator
    Crawlers["crawlers.ts\nAI_CRAWLERS + LEGAL"] -.-> Scanner
    Crawlers -.-> Generator
    Crawlers -.-> Verify
```

The app is a four-stage pipeline — **scan → generate → score → verify** — across three pure lib modules, two API routes, one client page, and a CSS design system. There is one user flow (the protect flow) and one verification flow (the verify-your-fix panel). Everything is stateless.

## Main concepts

| Concept | What it is | Page |
|---|---|---|
<!-- openwiki: broken internal link [../architecture/overview.md] file "../architecture/overview.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../architecture/overview.md] file "../architecture/overview.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| [Architecture overview](../architecture/overview.md) | The scan→generate→score→verify pipeline, module boundaries, invariants, lifecycle | [Architecture](../architecture/overview.md) |
<!-- openwiki: broken internal link [../lib/crawlers.md] file "../lib/crawlers.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../lib/crawlers.md] file "../lib/crawlers.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| [Crawler blocklist & legal text](../lib/crawlers.md) | The 19 `AI_CRAWLERS` + `LEGAL` EU Art. 4(3) strings in `src/lib/crawlers.ts` | [crawlers.md](../lib/crawlers.md) |
<!-- openwiki: broken internal link [../lib/scanner.md] file "../lib/scanner.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../lib/scanner.md] file "../lib/scanner.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| [Scanner](../lib/scanner.md) | `scanSite` + the RFC 9309 `parseRobotsForUA` parser + `extractMetaTags` in `src/lib/scanner.ts` | [scanner.md](../lib/scanner.md) |
<!-- openwiki: broken internal link [../lib/generator.md] file "../lib/generator.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../lib/generator.md] file "../lib/generator.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| [Generator & score](../lib/generator.md) | `generateAllArtifacts` + the 50/20/15/15 `computeScore` model + `ScoreInput` decoupling in `src/lib/generator.ts` | [generator.md](../lib/generator.md) |
<!-- openwiki: broken internal link [../api/protect-route.md] file "../api/protect-route.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../api/protect-route.md] file "../api/protect-route.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| [POST /api/protect](../api/protect-route.md) | The protect orchestrator route in `src/app/api/protect/route.ts` | [protect-route.md](../api/protect-route.md) |
<!-- openwiki: broken internal link [../api/verify-route.md] file "../api/verify-route.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../api/verify-route.md] file "../api/verify-route.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| [POST /api/verify](../api/verify-route.md) | The verify re-scoring route in `src/app/api/verify/route.ts` | [verify-route.md](../api/verify-route.md) |
<!-- openwiki: broken internal link [../ui/page.md] file "../ui/page.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../ui/page.md] file "../ui/page.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| [Scan UI page](../ui/page.md) | The single client component + the 8 numbered modules + honesty module in `src/app/page.tsx` | [page.md](../ui/page.md) |
<!-- openwiki: broken internal link [../ui/design-system.md] file "../ui/design-system.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../ui/design-system.md] file "../ui/design-system.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| [Design system](../ui/design-system.md) | The Teenage Engineering CSS + root layout in `src/app/globals.css` + `src/app/layout.tsx` | [design-system.md](../ui/design-system.md) |
<!-- openwiki: broken internal link [../research/legal-foundations.md] file "../research/legal-foundations.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../research/legal-foundations.md] file "../research/legal-foundations.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| [Legal & technical foundations](../research/legal-foundations.md) | The research that grounds the product (EU DSM, EU AI Act, US fair use, signals, playbook) | [legal-foundations.md](../research/legal-foundations.md) |

## API surface

| Endpoint | Body | Returns | Orchestrates |
|---|---|---|---|
| `POST /api/protect` | `{ url: string }` | `{ scan, artifacts, score }` | `scanSite` → `generateAllArtifacts` → `scoreFromScan` |
| `POST /api/verify` | `{ robotsTxt?, aiTxt?, metaHtml? }` | `{ score, blockedCrawlers, openCrawlers }` | `parseRobotsForUA` + regexes → `computeScore(reachable: true)` |

<!-- openwiki: broken internal link [../lib/scanner.md#parseRobotsForUA] file "../lib/scanner.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../lib/generator.md#the-score-model] file "../lib/generator.md" does not exist. Fix the href or restore the target, then delete this comment. -->
Both routes set `runtime = "nodejs"` and return `400` on missing input and `500` on thrown errors. The verify route reuses the same [`parseRobotsForUA`](../lib/scanner.md#parseRobotsForUA) and [`computeScore`](../lib/generator.md#the-score-model) as the protect route, which is what makes the before/after comparison honest.

## The 19 AI training crawlers

<!-- openwiki: broken internal link [../lib/crawlers.md] file "../lib/crawlers.md" does not exist. Fix the href or restore the target, then delete this comment. -->
`AI_CRAWLERS` in [`src/lib/crawlers.ts`](../lib/crawlers.md) lists 19 crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, Google-Extended, ClaudeBot, Claude-Web, anthropic-ai, CCBot, Bytespider, PerplexityBot, Amazonbot, Applebot-Extended, Meta-ExternalAgent, YouBot, Diffbot, Cotoyogi, Timpibot, iaskspider, ImagesiftBot), each with `operator`, `purpose`, and an optional `dualUse` flag. The score's 50-point "crawlers blocked" band scales as `blockedCount / 19`.

## Task routing

| If you want to… | Read | Source symbols | Validation |
|---|---|---|---|
<!-- openwiki: broken internal link [../lib/crawlers.md] file "../lib/crawlers.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Add a new AI training crawler | [crawlers.md](../lib/crawlers.md) | `AI_CRAWLERS` (`src/lib/crawlers.ts`); `scoreFromScan(scan, AI_CRAWLERS.length)` in `src/lib/generator.ts` | `npm run dev`, scan a site, confirm the new UA appears in the evidence grid |
<!-- openwiki: broken internal link [../lib/generator.md#the-score-model] file "../lib/generator.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Change the score weights | [generator.md](../lib/generator.md#the-score-model) | `computeScore` `breakdown` in `src/lib/generator.ts` | `npm run dev`, scan `en.wikipedia.org`, confirm the `breakdown` labels/maxes change |
<!-- openwiki: broken internal link [../lib/generator.md] file "../lib/generator.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Change the generated artifacts | [generator.md](../lib/generator.md) | `generateRobotsSnippet`, `generateAiTxt`, `generateMetaTags`, `generateLegalNotice`, `generateAllArtifacts` | `npm run dev`, scan, copy each artifact, paste into the verify panel, confirm `computeScore` scores it |
<!-- openwiki: broken internal link [../lib/scanner.md#parseRobotsForUA] file "../lib/scanner.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Change the robots parser | [scanner.md](../lib/scanner.md#parseRobotsForUA) | `parseRobotsForUA`, `scanSite`, `fetchText` in `src/lib/scanner.ts` | `npm run dev`, scan `en.wikipedia.org` (unprotected) and `www.theverge.com` (partial), confirm blocked/open split |
<!-- openwiki: broken internal link [../api/protect-route.md] file "../api/protect-route.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Change the protect flow | [protect-route.md](../api/protect-route.md) | `POST` in `src/app/api/protect/route.ts` | `npm run dev`, `curl -X POST localhost:3000/api/protect -d '{"url":"en.wikipedia.org"}'` |
<!-- openwiki: broken internal link [../api/verify-route.md] file "../api/verify-route.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Change the verify flow | [verify-route.md](../api/verify-route.md) | `POST` in `src/app/api/verify/route.ts` | `npm run dev`, use the verify-your-fix panel; `curl -X POST localhost:3000/api/verify -d '{"robotsTxt":"User-agent: GPTBot\nDisallow: /"}'` |
<!-- openwiki: broken internal link [../ui/page.md] file "../ui/page.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Add a UI module / change the page | [page.md](../ui/page.md) | `Home`, `ScanResponse`, `VerifyResponse`, `EXAMPLES`, `scoreClass`, `CopyButton`, `EvidenceLink`, `SkeletonCard` in `src/app/page.tsx` | `npm run dev`, render the page, exercise scan + verify |
<!-- openwiki: broken internal link [../ui/design-system.md] file "../ui/design-system.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Restyle / rebrand | [design-system.md](../ui/design-system.md) | `:root` tokens + component classes in `src/app/globals.css`; `RootLayout` in `src/app/layout.tsx` | `npm run dev`, visual check |
<!-- openwiki: broken internal link [../lib/scanner.md#fetchText] file "../lib/scanner.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Change the scan timeout / UA / fetch behavior | [scanner.md](../lib/scanner.md#fetchText) | `fetchText(url, timeoutMs = 8000)`, `scanSite` in `src/lib/scanner.ts` | `npm run dev`, scan a slow/timeout site, confirm `reachable: false` + warning + artifacts still generated |
<!-- openwiki: broken internal link [../lib/crawlers.md#the-legal-object] file "../lib/crawlers.md" does not exist. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [../research/legal-foundations.md] file "../research/legal-foundations.md" does not exist. Fix the href or restore the target, then delete this comment. -->
| Update the legal text | [crawlers.md](../lib/crawlers.md#the-legal-object) + [legal-foundations.md](../research/legal-foundations.md) | `LEGAL` in `src/lib/crawlers.ts`; `research/protecting-human-content-from-ai-training.md` | `npm run dev`, scan, confirm the robots/ai.txt/notice text reflects the edit |

## Build, run, and validation

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint       # next lint
```

**Manual validation (there is no test suite):**

1. Scan `en.wikipedia.org` (the "unprotected" example) — expect a low score (≈15), all chips red/"CAN TRAIN", the robots/ai.txt/meta/notice artifacts generated, and the honesty module present.
2. Scan `www.theverge.com` (the "partial" example) — expect a mid-range score with a mix of blocked/open chips.
3. Open the verify-your-fix panel — it is prefilled with the generated artifacts. Paste a robots.txt that blocks all crawlers, click "Re-score deployment →" — expect the AFTER score to rise toward 85 (crawlers 50 + meta 20 + ai.txt 15; reachability is hardcoded `true` in the verify route).
4. Scan an unreachable/timeout domain — expect the "Site unreachable — score shown is worst-case" warning, `reachable: false` reflected in the score, and the artifacts still generated.

## Directory layout (source)

```
src/
├── app/
│   ├── page.tsx              # the single client component (8 modules + honesty + verify)
│   ├── layout.tsx            # root layout + <head> metadata
│   ├── globals.css           # Teenage Engineering design system
│   └── api/
│       ├── protect/route.ts  # POST /api/protect — scan → generate → score
│       └── verify/route.ts   # POST /api/verify — re-score pasted artifacts
└── lib/
    ├── crawlers.ts           # AI_CRAWLERS (19) + LEGAL (EU Art. 4(3) text)
    ├── scanner.ts            # scanSite + parseRobotsForUA (RFC 9309) + extractMetaTags
    └── generator.ts          # generateAllArtifacts + computeScore (50/20/15/15)
research/
└── protecting-human-content-from-ai-training.md   # the grounding research
.github/workflows/openwiki-update.yml              # daily OpenWiki self-refresh (tooling)
```

## Key invariants

- **Stateless** — no persistence; every request re-fetches the live site.
- **No dependencies in lib** — `scanner.ts` uses the global `fetch` + `AbortSignal`; the lib layer adds zero npm dependencies beyond Next/React.
- **Graceful unreachability** — a downed/timeout site still yields a complete `ScanResult`, deployable artifacts, and a worst-case score; the UI shows a warning.
- **Score reproducibility** — the 50/20/15/15 weights are fixed in `computeScore`; the verify route scores pasted content identically via `ScoreInput`.
- **Honor-system honesty** — the honesty module refuses to overclaim; the only complete protection is access control.

## Backlog (roadmap, not built)

From `TASKS.md`; each is demo-enhancing, not core MVP (T1–T4 are done).

| ID | Task | Source anchor | Reason for deferral |
|---|---|---|---|
| T7 | Spawning DO NOT TRAIN registry submission | `TASKS.md` ⬜ T7; `research/…` §4 (Spawning) | Requires Spawning API availability; fallback is a "download registry file" offline path |
| T8 | C2PA "Proof of Human" content signing | `TASKS.md` ⬜ T8; `research/…` §3.3 (C2PA) | Requires `@contentauth/c2pa-node`; stretch goal; provenance is evidence, not prevention |
| T9 | Pitch assets (slide + 60s backup video) | `TASKS.md` ⬜ T9 | Non-code demo assets |
| — | One-click deploy (open a PR to the site's repo / FTP upload) | `README.md` Roadmap | Not started |

## OpenWiki tooling

The `/.github/workflows/openwiki-update.yml` workflow runs `openwiki code --update` on a daily schedule (and on `workflow_dispatch`) to refresh this wiki, opening a PR against `openwiki/`, `AGENTS.md`, `CLAUDE.md`, and the workflow itself. It is documentation tooling, not product logic — it does not affect the runtime app.
