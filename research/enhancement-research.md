# Enhancement Research — verified opportunities

**Date:** 2026-08-24
**Question:** What can we verifiably build next to make Don't Train On Me more powerful?
**Method:** every claim below checked against a live API response or primary paper during this session.

---

## 1. Common Crawl Exposure Check ⭐ strongest candidate (API verified working)

**The gap:** creators ask "am I being scraped?" but never learn the concrete fact: *is my site already inside Common Crawl* — the open corpus that most model trainers (GPT, LLaMA-class models via LAION/the Pile lineage) draw from?

**The mechanism:** Common Crawl publishes a free CDX API per monthly crawl (`collinfo.json` lists all indexes; `https://index.commoncrawl.org/CC-MAIN-2026-34-index?url=domain/*&output=json`). Verified live this session: prefix queries return capture records (URL, timestamp, digest) for crawled domains.

**Feature:** paste domain → query last N crawl indexes → *"Your site appears X times across Y recent Common Crawl crawls — the datasets behind most open-model training."* Free, keyless, instant, and answers the question nobody else answers for ordinary creators. Pairs perfectly with our existing scan (exposure → actual ingestion evidence).

**Caveat:** CC index API rate-limits; cache results server-side per domain (we already claim "nothing stored" — cache with TTL or do client-side fetches; CDX supports CORS-less JSON so a small serverless proxy is needed regardless).

## 2. DE-COP upgrade for Radar (paper-verified method)

**Source:** *DE-COP: Detecting Copyrighted Content in Language Models Training Data* (arXiv 2402.09910, Feb 2024).

**Method:** instead of open-ended questions + n-gram diffing (our v0.2), present the model multiple-choice questions where one option is your verbatim passage and distractors are paraphrases. Models that trained on the text pick the verbatim option at above-chance rates. Works even when the model never reproduces text openly.

**Proof it works on production models:** *Beyond Public Access in LLM Pre-Training Data* (arXiv 2505.00020) applied DE-COP with O'Reilly books against OpenAI models — GPT-4o showed recognition of paywalled content at AUROC 0.82 despite it never being public.

**Enhancement:** add a "memorization probe" mode to Radar: user pastes N distinctive passages → we generate MCQ items (verbatim + paraphrased distractors, paraphrases generated locally via simple synonym/structure rules) → user runs them through any chatbot → chance-level vs above-chance scoring computed client-side. This catches *training ingestion*, which plain output-diffing misses entirely.

## 3. Prior art to study (and differentiate from)

*An open-source copyright detection platform…* (arXiv 2511.20623, Nov 2025) — explicitly targets independent creators, builds on DE-COP. Read before building #2. Our differentiation stays: fully local analysis, no accounts, plus the legal-artifact layer (opt-outs, reservations, evidence packs) which they don't have.

## 4. RSL — Really Simple Licensing (spec published)

**Source:** rslcollective.org + github.com/rslstandard/rsl (verified this session): RSL 1.0 is an XML standard for machine-readable licensing & compensation terms, backed by the nonprofit RSL Collective (Cloudflare-aligned ecosystem). It automates "license discovery, acquisition and payment."

**Enhancement:** generate `/rsl.xml` alongside our robots.txt/ai.txt artifacts — moves creators from pure opt-out to *opt-in-with-payment*. This completes the ladder: block → reserve → license. Small build; high strategic value since the ecosystem (Cloudflare bots, TollBit-class intermediaries) is converging on it.

## 5. IETF aipref — track and adopt when RFC lands

Verified current drafts: `draft-ietf-aipref-vocab-07`, `draft-ietf-aipref-attach-05`. When finalized, our generated artifacts should emit aipref signals (well-known URI / HTTP headers) so opt-outs remain standards-current. Low effort, keeps credibility.

## 6. x402 — payments for agents

x402 Foundation (formerly coinbase/x402): HTTP-402-based internet-native payments middleware. Longer-term: let publishers charge agents per document fetch. Park as roadmap slide; too heavy for hackathon.

## 7. Monitoring loop (Vercel Cron)

Protection decays: new crawlers appear, configs regress. A scheduled function (Vercel Cron) could re-run scans weekly and expose a status badge/RSS feed. Cheap, sticky — turns a one-shot tool into a service people keep.

## 8. Smaller items

- **Crawler list freshness:** consider Dark Visitors API (robots.txt generation from maintained crawler DB) as an optional sync source; fallback stays our static curated list.
- **Image path:** Glaze/Nightshade CLI integration and C2PA signing remain open roadmap items (T8).
- **Evidence pack hardening:** RFC 3161 trusted timestamping (free via freetsa.org) would upgrade "timestamped by us" to "independently timestamped."

---

## Recommended priority for hackathon scope

1. **#1 Common Crawl check** — verified API, keyless, jaw-drop demo value, half-day build
2. **#2 DE-COP mode in Radar** — differentiates with real science; medium build (MCQ generation + chance scoring)
3. **#4 RSL generator** — one more artifact card; positions us inside the emerging licensing ecosystem
4. #7 cron monitoring if time remains
