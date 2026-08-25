# 🛡️ Don't Train On Me

**Protect any creator's content from AI training in 60 seconds.**

Paste your domain → get a protection score → receive ready-to-deploy opt-out artifacts:

1. **robots.txt** section blocking 19 known AI training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot, Bytespider…) — doubling as a machine-readable **EU DSM Directive Art. 4(3)** rights reservation
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

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

## Architecture

```
src/
├── app/
│   ├── page.tsx              # scan UI + artifact viewer with copy buttons
│   └── api/protect/route.ts  # orchestrator: scan → generate → score
└── lib/
    ├── crawlers.ts           # blocklist of 19 AI training crawlers + legal text
    ├── scanner.ts            # live robots.txt parser (RFC 9309 groups) + meta tag check
    └── generator.ts          # artifact generation + weighted protection score
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

## Modules

| # | Module | What it does |
|---|---|---|
| 02 | Verdict | Weighted 0–100 protection score with published weights |
| 03 | Evidence | Live robots.txt check across 19 AI crawlers, with source links |
| 04 | Common Crawl | Checks the 6 latest CC indexes for your domain — the open corpus most training sets build on |
| 05–09 | The Fix | robots.txt (+ EU Art. 4(3) reservation + RSL `License:` line), verify-your-fix, ai.txt, meta tags, legal notice |
| 10 | RSL License | `/license.xml` in RSL 1.0 schema — machine-readable licensing for the AI-first web |
| 11 | Radar | Manual probe mode: generate questions → ask engines yourself → local 8-gram forensics; plus **DE-COP memorization quiz** (arXiv 2402.09910) scoring verbatim-recognition against the 25% chance line |
| §§ | Honesty layer | What this can and cannot do |

## Key references

- Directive (EU) 2019/790 Arts. 3–4 (TDM opt-out) — [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019L0790)
- Regulation (EU) 2024/1689 (AI Act) Art. 53(1)(c)–(d) — [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401689)
- U.S. Copyright Office, *Copyright and AI Part 3: Generative AI Training* (2025) — [copyright.gov/ai](https://www.copyright.gov/ai/)
- DE-COP: detecting copyrighted content in training data — [arXiv 2402.09910](https://arxiv.org/abs/2402.09910)
- Beyond Public Access in LLM Pre-Training Data — [arXiv 2505.00020](https://arxiv.org/abs/2505.00020)
- Stealing Part of a Production Language Model (canary extraction) — [arXiv 2403.06634](https://arxiv.org/abs/2403.06634)
- RSL 1.0 Really Simple Licensing — [rslstandard.org](https://rslstandard.org/) · [RSL Collective](https://rslcollective.org/)
- IETF AI Preferences WG — [datatracker](https://datatracker.ietf.org/wg/aipref/) · C2PA — [c2pa.org](https://c2pa.org/)
- Glaze / Nightshade — [UChicago SAND Lab](https://glaze.cs.uchicago.edu/) · Spawning DO NOT TRAIN — [spawning.ai](https://spawning.ai/)
- Common Crawl corpus & index API — [commoncrawl.org](https://commoncrawl.org/)

## Roadmap (see TASKS.md)

- [x] Scanner, generators, scoring, UI
- [ ] One-click deploy: open a PR to the site's repo / upload via FTP
- [ ] C2PA "Proof of Human" content signing
- [ ] Spawning DO NOT TRAIN registry submission
