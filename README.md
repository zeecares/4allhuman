# 🛡️ Don't Train On Me

**Protect any creator's content from AI training in 60 seconds.**

Paste your domain → get a protection score → receive ready-to-deploy opt-out artifacts:

1. **robots.txt** section blocking 170+ known AI crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot, Bytespider…) — doubling as a machine-readable **EU DSM Directive Art. 4(3)** rights reservation
2. **/ai.txt** — Spawning-spec machine-readable access policy
3. **`<meta name="robots" content="noai, noimageai">`** tags for every page head
4. **Legal notice** of reserved rights

## Why it matters (the legal hook)

- **EU DSM Directive Art. 4(3):** creators may expressly reserve their content from text-and-data-mining "in an appropriate manner, such as machine-readable means."
- **EU AI Act Art. 53(1)(c):** GPAI providers *must* identify and comply with those reservations — honoring this output is a regulatory obligation for them.
- **US:** no opt-out statute; fair use is uncertain (USCO Part 3 report). Blocking crawlers + keeping content behind access control is currently the strongest lever.

Research notes:
- [`research/protecting-human-content-from-ai-training.md`](./research/protecting-human-content-from-ai-training.md) — legal & technical landscape (EU DSM Art. 4(3), AI Act Art. 53(1)(c), USCO Part 3, Glaze/Nightshade, IETF aipref, C2PA)
- [`research/enhancement-research.md`](./research/enhancement-research.md) — verified build opportunities: Common Crawl CDX corpus check, DE-COP memorization detection, RSL licensing standard, x402 payments

## What this can and cannot guarantee

**No tool can make already-public content untrainable.** Anyone can download what anyone
can read. Our artifacts are signals + legal reservations, not force fields:

| Level | Mechanism | Strength |
|---|---|---|
| Never expose it | Login/paywall/app | ✅ True guarantee — unfetched bytes can't be trained on |
| Legal reservation (EU) | robots.txt Art. 4(3) statement | ⚠️ Doesn't prevent copying; makes it *infringing* for EU-regulated GPAI providers |
| Contract | No-training terms on private sharing | ⚠️ After-the-fact claim |
| Public + signals only | robots.txt alone, no jurisdiction | ❌ Honor system |

This tool sits in rows 2–3: it measures exposure, perfects the strongest legal lever available,
and verifies deployment. For a true guarantee, keep content behind access control.

See `research/protecting-human-content-from-ai-training.md` for sources.

## Design principles (first-principles trust)

The product reduces an information asymmetry between creators and AI trainers. Trust
follows from three commitments baked into the UI:

1. **Verifiability over assertion** — every scan result links to the raw evidence
   (the live `robots.txt` we read), with a UTC timestamp. Users can re-do any check by hand.
2. **Honest limits, stated up front** — the "What this can / cannot do" module says plainly:
   signals bind compliant crawlers only; we cannot audit what a model was trained on; access
   control is the only complete protection. Overclaiming is the fastest way to lose trust.
3. **No black boxes** — fixed, published score weights; no accounts; nothing stored;
   open-source methodology.

Visual language follows Teenage Engineering's industrial design: flat panels, hard edges,
warm-grey chassis, signature orange accents, monospace labels, LED status indicators,
numbered modules — instruments, not marketing.

## CLI

Run the same audit from your terminal or CI - no config, zero dependencies:

```bash
npx 4allhuman audit example.com
```

```
npx 4allhuman audit example.com [--json] [--fail-below <0-100>] [--timeout <ms>]

  --json                Machine-readable report (all layers, verdicts, score).
  --fail-below <0-100>  Exit 1 when the score is below this threshold (CI gate).
  --timeout <ms>        Per-request timeout (default 8000).
```

The report prints one plain-language verdict per layer (PROTECTED / PARTIAL /
MISSING / NOTE) with the evidence behind it, then the total score out of 100.

Exit codes: `0` audit ran and meets `--fail-below` (if given) · `1` score below
`--fail-below` · `2` usage error or the site could not be reached.

Runs directly from TypeScript via Node's type stripping - requires Node >= 22.18.
The CLI and the web app share the exact same audit engine (`src/lib/scanner.ts` +
`src/lib/layers.ts`), so a terminal score always matches a web score.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run update:crawlers   # refresh the crawler blocklist from the ai.robots.txt community dataset
npm test               # RFC 9309 + multi-layer audit tests (node:test, zero deps)
npm run typecheck      # tsc --strict, no emit
```

## Architecture

```
bin/
└── 4allhuman.ts          # CLI entry point (shebang, zero deps, Node >= 22.18)
src/
├── cli.ts                # CLI core: arg parsing, report rendering, exit codes
├── app/
│   ├── page.tsx              # scan UI + artifact viewer with copy buttons
│   └── api/protect/route.ts  # orchestrator: scan → generate → score
└── lib/
    ├── crawlers.ts           # re-exports the crawler blocklist + legal text
    │   ├── crawlers.generated.ts  # 170+ crawlers, generated from the community ai.robots.txt dataset
    ├── robots9309.ts         # RFC 9309 matcher: group selection, longest-match, wildcards
    ├── layers.ts             # multi-layer audit: X-Robots-Tag, TDMRep, aipref, llms.txt, meta
    ├── scanner.ts            # live scan, per-crawler verdicts with rule-level reasons
    └── generator.ts          # artifact generation + layered protection score
tests/
├── robots9309.test.ts        # spec-case tests: ties, wildcards, group precedence
└── layers.test.ts            # multi-layer parsing + score tests
```

## Radar (module 09) — manual probe mode

Paste an article (or its URL) → get generated probe questions → ask ChatGPT /
Perplexity / Claude / Gemini yourself → paste their answers back → 8-gram plagiarism
forensics run **locally in your browser**.

No API keys. No AI-company calls from our servers. Nothing stored. The evidence pack
(.json download) seals the source text with SHA-256 and records every verdict with
matched spans.

Thresholds: ≥10% word-8-gram containment = **COPIED**, 2–9% = SUSPICIOUS, else CLEAN.
8 consecutive shared words is the classical plagiarism-forensics threshold — chance
co-occurrence is effectively zero.

## The multi-layer audit

One report across every opt-out standard, each layer with its own plain-language
verdict and evidence:

| Layer | Weight | What we check |
|---|---|---|
| robots.txt (RFC 9309) | 40 | Live evaluation against 170+ known AI crawlers: most-specific group, longest-match, allow-wins ties, wildcards |
| X-Robots-Tag header | 15 | `noai` / `noimageai` (global = full, per-bot or `none`/`noindex` = partial) |
| noai meta tags | 15 | `<meta name="robots" content="noai, noimageai">` on the homepage |
| TDMRep (W3C) | 10 | `tdm-reservation: 1` header or meta — the machine-readable EU DSM Art. 4(3) reservation |
| ai.txt | 10 | `/ai.txt` published and actually denying training/dataset use (honor-based) |
| aipref (IETF draft) | 5 | `ai-train=n`-style preference tokens (draft-ietf-aipref-vocab) |
| Reachable | 5 | The site answered the scan, so every verdict is live evidence |
| llms.txt | 0 | Informational only — it is the ALLOW-side counterpart (guides LLM use), not an opt-out |

The same layer builders score user-pasted artifacts in verify-your-fix, so the
before/after score is computed identically to a live scan.

## Dogfooding: this site scores itself

4allhuman.vercel.app runs its own full fix. `/robots.txt` blocks all 174 known
AI crawlers with the RSL `License:` pointer, `/ai.txt` denies training and
dataset use under the Spawning spec, every response carries
`X-Robots-Tag: noai, noimageai` and the TDMRep `tdm-reservation: 1` header, the
homepage `<head>` publishes the noai/noimageai, TDMRep, and aipref meta tags,
`/license.xml` serves the RSL 1.0 no-training license, `/tdm-policy.txt`
publishes the reserved-rights notice, and the module 13 canary
`dtom-c30c29e5` is embedded as an HTML comment on every page and at
`/canary.txt`. Its own audit went 5/100 to 100/100;
`tests/site-artifacts.test.ts` keeps the artifacts from rotting.

## Modules

| # | Module | What it does |
|---|---|---|
| 02 | Verdict | Multi-layer audit — one 0–100 score across every opt-out standard (weights below) |
| 03 | Evidence | Live robots.txt check across 170+ AI crawlers (community ai.robots.txt dataset), with source links |
| 04 | Common Crawl | Checks the 6 latest CC indexes for your domain — the open corpus most training sets build on |
| 05–09 | The Fix | robots.txt (+ EU Art. 4(3) reservation + RSL `License:` line), verify-your-fix, ai.txt, meta tags, legal notice |
| 10 | RSL License | `/license.xml` in RSL 1.0 schema — machine-readable licensing for the AI-first web |
| 11 | Radar | Manual probe mode: generate questions → ask engines yourself → local 8-gram forensics; plus **DE-COP memorization quiz** (arXiv 2402.09910) scoring verbatim-recognition against the 25% chance line |
| 12 | Claim window | Dates the site's rights reservation by bisecting its archived robots.txt at the Internet Archive, then sorts published Common Crawl windows into before/after that date — with both boundary permalinks and a downloadable plain-text record |
| 13 | Canary | Mints a unique publish-time fingerprint (HTML comment + `/canary.txt`), generates prefix-completion probe questions, and scores pasted engine answers — a surfaced token proves the engine had access to your content (lab-validated ~0.9 AUC, never court-tested, covers only content published after the canary goes in) |
| §§ | Honesty layer | What this can and cannot do |

## Key references


- Directive (EU) 2019/790 Arts. 3–4 (TDM opt-out) — [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019L0790)
- Regulation (EU) 2024/1689 (AI Act) Art. 53(1)(c)–(d) — [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401689)
- U.S. Copyright Office, *Copyright and AI Part 3: Generative AI Training* (2025) — [copyright.gov/ai](https://www.copyright.gov/ai/)
- DE-COP: detecting copyrighted content in training data — [arXiv 2402.09910](https://arxiv.org/abs/2402.09910)
- SIGIL: publish-time canary watermarks for training-membership evidence — [arXiv 2606.06502](https://arxiv.org/html/2606.06502)
- Beyond Public Access in LLM Pre-Training Data — [arXiv 2505.00020](https://arxiv.org/abs/2505.00020)
- Stealing Part of a Production Language Model (canary extraction) — [arXiv 2403.06634](https://arxiv.org/abs/2403.06634)
- RSL 1.0 Really Simple Licensing — [rslstandard.org](https://rslstandard.org/) · [RSL Collective](https://rslcollective.org/)
- IETF AI Preferences WG — [datatracker](https://datatracker.ietf.org/wg/aipref/) · C2PA — [c2pa.org](https://c2pa.org/)
- Glaze / Nightshade — [UChicago SAND Lab](https://glaze.cs.uchicago.edu/) · Spawning DO NOT TRAIN — [spawning.ai](https://spawning.ai/)
- Common Crawl corpus & index API — [commoncrawl.org](https://commoncrawl.org/)
- Internet Archive CDX server (archived robots.txt history) — [Wayback CDX API](https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server)

## Roadmap (see TASKS.md)

- [x] Scanner, generators, scoring, UI
- [ ] One-click deploy: open a PR to the site's repo / upload via FTP
- [ ] C2PA "Proof of Human" content signing
- [ ] Spawning DO NOT TRAIN registry submission


