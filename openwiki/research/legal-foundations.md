---
type: research
title: Legal & Technical Foundations
description: The legal and technical research in research/protecting-human-content-from-ai-training.md that grounds the product — EU DSM Art. 4(3) opt-out, EU AI Act Art. 53(1)(c) compliance duty, US fair-use posture, machine-readable signals, access control as the only complete protection, and how each app artifact maps to a lever.
tags: [legal, eu-dsm, eu-ai-act, fair-use, robots-txt, ai-txt, c2pa, research]
---

# Legal & Technical Foundations

`research/protecting-human-content-from-ai-training.md` is the deep-research document that grounds the product. It was checked against primary sources wherever possible (EUR-Lex statute text, the U.S. Copyright Office report, the IETF aipref charter, the SAND Lab / C2PA project pages) and dates to 2026-08-22. The product turns its conclusions into a 60-second operation; this page is the distilled map of what the research establishes and how it maps to the code.

## The thesis

There is no global "do not train" right. Protection is jurisdiction-dependent, and machine-readable opt-outs are honor-system — they bind only compliant crawlers. But in the EU, publishing a machine-readable rights reservation under **EU DSM Directive Art. 4(3)** plus the **EU AI Act Art. 53(1)(c)** compliance duty on GPAI providers is the closest thing today to a legally backed "don't train on me." The app exists to make publishing that reservation correctly trivial, and to score whether a site has done it.

## Legal levers by jurisdiction

### European Union — the strongest statutory protection

**DSM Directive (EU) 2019/790, Article 4** creates a mandatory text-and-data-mining exception — AI trainers generally don't need permission — **but Article 4(3) lets rightholders opt out** "in an appropriate manner, such as machine-readable means in the case of content made publicly available online." Key properties:

- The opt-out must be "appropriate" and, for online content, "machine-readable" — `robots.txt`-style signals are the accepted form.
- It applies to *commercial* TDM. Research organizations doing scientific research get an unconditional exception under **Article 3** (cannot be overridden).
- It applies to works "lawfully accessible" — it does not bless circumventing paywalls or access controls.

**EU AI Act (Regulation (EU) 2024/1689), Article 53(1)(c)** turns that opt-out into an enforceable compliance duty for general-purpose AI providers: they must "identify and comply with … a reservation of rights expressed pursuant to Article 4(3) of Directive (EU) 2019/790," including "through state-of-the-art technologies." This is the first time honoring opt-outs became a regulatory obligation — which is why the app's honesty module says it "create[s] obligations for GPAI providers under EU AI Act Art. 53(1)(c)."

### United States — uncertain fair use, no opt-out statute

Per the U.S. Copyright Office's *Copyright and AI, Part 3: Generative-AI Training* (pre-publication, May 2025): training is prima facie infringement, everything hinges on **fair use (17 U.S.C. §107)**, uses "are likely transformative" but commercial training on "vast troves of copyrighted works" that "competes with them in existing markets, especially where this is accomplished through illegal access, goes beyond established fair use boundaries." There is **no opt-out statute** — a US creator cannot file a "do not train" notice with legal effect. Indirect tools: **DMCA §1202** (Copyright Management Information removal), contract / ToS breach, computer-misuse (CFAA) theories.

### Other jurisdictions *(secondary)*

UK requires a license (no TDM exception for commercial training); Japan (Copyright Act Art. 30-4) is the most permissive; Singapore has a computational data analysis exception with a lawful-access condition; South Korea, Israel, Switzerland have various TDM exceptions but none offer a formal opt-out.

## How the app maps to the levers

| App artifact | Source symbol | Legal/technical lever |
|---|---|---|
| robots.txt block snippet | [`generateRobotsSnippet`](../lib/generator.md#generaterobotssnippetblocked) | EU Art. 4(3) machine-readable reservation; crawler opt-out for the 19 [`AI_CRAWLERS`](../lib/crawlers.md#the-ai_crawlers-blocklist) |
<!-- openwiki: broken internal link [../lib/generator.md#generateAiTxt2domain] heading anchor "generateAiTxt2domain" does not exist in "../lib/generator.md". Fix the href or restore the target, then delete this comment. -->
| `/ai.txt` | [`generateAiTxt`](../lib/generator.md#generateAiTxt2domain) | Spawning-spec structured permissions file; embeds `LEGAL.euReservation` |
| `<meta name="robots" content="noai, noimageai">` | [`generateMetaTags`](../lib/generator.md#generatemetatags) | Page-level opt-out tags (informal, not standardized) |
| Legal notice | [`generateLegalNotice`](../lib/generator.md#generatelegalnoticedomain) | Human-readable rights reservation; `LEGAL.notice` + `LEGAL.euReservation` |
| Exposure score | [`computeScore`](../lib/generator.md#the-score-model) | Coverage of known opt-out signals — a measurement, not protection |

The robots.txt block **doubles as** the Art. 4(3) reservation: the [generator](../lib/generator.md) header comment cites the directive, and `LEGAL.euReservation` is embedded into both the robots-adjacent ai.txt and the legal notice. The score measures *coverage of signals*, not real-world protection — the [honesty module](../ui/page.md#honesty-module) states this plainly.

## Machine-readable signals

| Signal | Mechanism | Honor-system? |
|---|---|---|
| `robots.txt` UA tokens (`GPTBot`, `Google-Extended`, `ClaudeBot`, `CCBot`, `Bytespider`, …) | `Disallow` specific AI crawlers | Yes; Google ties `Google-Extended` to Gemini/Vertex training, not Search ranking |
| `<meta name="robots" content="noai, noimageai">` | Page-level opt-out | Yes; not standardized; ignored by many actors |
| `ai.txt` | Spawning AI structured permissions file | Yes; concept documented by Spawning |
| HTTP headers | Preference signaling at delivery | Being standardized by IETF |
| **IETF aipref WG** (chartered 2025) | Standards-track vocabulary + well-known URIs + HTTP fields + reconciliation | Standardizes *expression*, not enforcement; charter excludes authentication, registries, auditing |

**Critical limitation (stated by the Nightshade authors):** "Opt-out lists … can be easily ignored with zero consequences. They are unverifiable and unenforceable, and those who violate opt-out lists … cannot be identified with high confidence." This is why the app's honesty module refuses to overclaim.

## Technical defenses

### Access control (effective vs. compliant crawlers only)
Paywalls, login walls, CDN bot management (e.g. Cloudflare's July 2025 default-on AI-crawler blocking and pay-per-crawl), and TollBit/ProRata intermediaries are the only defenses that **physically** prevent non-compliant bulk fetching. The research ranks this the strongest lever everywhere because the "lawful access + transformation → fair use; unlawful acquisition → infringement" line in recent US rulings makes *controlling access* more valuable than labeling after publication.

### Adversarial / "poisoning" tools (UChicago SAND Lab)
- **Glaze** — imperceptible perturbations that shift how a model perceives an artist's *style* (style-mimicry defense). Free desktop app.
- **Nightshade** — converts images into "poison" samples so models trained on them learn corrupted associations. Deterrence by raising the cost of unconsented training.

Both acknowledge arms-race dynamics and demonstrated removal attacks; best treated as **friction, not protection**. Neither is implemented in this app.

### Provenance (evidence, not prevention)
<!-- openwiki: broken internal link [../quickstart.md#backlog] heading anchor "backlog" does not exist in "../quickstart.md". Fix the href or restore the target, then delete this comment. -->
**C2PA / Content Credentials** cryptographically binds origin/edit history to media — "like a nutrition label." It helps creators prove human origin and helps platforms detect AI content; it does **not** restrict training. Stripping C2PA metadata raises separate **DMCA §1202** claims. C2PA signing is on the [roadmap](../quickstart.md#backlog) (T8) but not yet built.

## Litigation snapshot *(docket references; outcomes as of mid-2025)*

| Case | Court | Signal |
|---|---|---|
| *Bartz v. Anthropic* | N.D. Cal. | June 2025 SJ: training on purchased/borrowed books = fair use; **pirated** copies proceed as infringement |
| *Kadrey v. Meta* | N.D. Cal. | June 2025 SJ: fair use for training; market-dilution theory inadequately supported; piracy claims alive |
| *N.Y. Times v. Microsoft & OpenAI* | S.D.N.Y. | Pending; marquee case incl. DMCA §1202 claims over stripped metadata |
| *Getty Images v. Stability AI* | UK High Ct / D. Del. | UK action largely resolved on narrow grounds (Nov 2025) |

Emerging pattern: **lawful access + transformation → likely fair use; unlawful acquisition (piracy) → infringement regardless.**

## The practical playbook

Ranked by effectiveness (the research's §6), and how the app addresses each:

1. **Keep valuable content behind access control** (paywall/login/app) — the strongest lever everywhere; the app cannot do this for you (the honesty module says so).
2. **Publish machine-readable reservations** — robots.txt blocks for all known AI crawlers + `noai`/`noimageai` meta tags + ai.txt. **This is what the app automates.** In the EU it also perfects your Art. 4(3) opt-out.
3. **Use contractual terms** (ToS/API licenses withholding training rights) — outside the app's scope.
<!-- openwiki: broken internal link [../quickstart.md#backlog] heading anchor "backlog" does not exist in "../quickstart.md". Fix the href or restore the target, then delete this comment. -->
4. **Register with DO NOT TRAIN (Spawning)** + consider Glaze/Nightshade for visual artists — the Spawning submission is on the [roadmap](../quickstart.md#backlog) (T7), not yet built.
<!-- openwiki: broken internal link [../quickstart.md#backlog] heading anchor "backlog" does not exist in "../quickstart.md". Fix the href or restore the target, then delete this comment. -->
5. **Attach provenance (C2PA)** — on the [roadmap](../quickstart.md#backlog) (T8), not yet built.
6. **Monitor enforcement** — EU AI Act Art. 53(1)(c)/(d) gives regulators a handle; US — watch NYT v. OpenAI.

## Open problems

- **Verification asymmetry** — no way to audit what went into a closed model's training set; EU Annex XI documentation is available to authorities on request only.
- **Signal adoption** — aipref standardizes expression but not enforcement; crawlers can spoof user-agents (the charter excludes authentication).
- **Adversarial-tool fragility** — Glaze/Nightshade countermeasures evolve faster than protections.
- **Jurisdictional patchwork** — Japan permissiveness vs. EU opt-outs creates forum-shopping.
- **Definitional gaps** — "training," "TDM," and "lawfully accessible" map differently across statutes.

## Sources

Primary (fetched and quoted directly): Directive (EU) 2019/790 Arts. 3–4 (EUR-Lex CELEX:32019L0790); Regulation (EU) 2024/1689 Art. 53(1) (EUR-Lex OJ:L_202401689); U.S. Copyright Office *Copyright and AI, Part 3* (copyright.gov); Glaze & Nightshade (glaze.cs.uchicago.edu / nightshade.cs.uchicago.edu); IETF aipref charter (datatracker.ietf.org); C2PA (c2pa.org). Secondary: Spawning AI / Have I Been Trained; Cloudflare AI-crawler blocking; court dockets in the litigation table. The full source list is in `research/protecting-human-content-from-ai-training.md`.

## Scope boundary

This page distills the research; it is not legal advice. The app is a technical control that publishes opt-outs and measures their coverage — it cannot physically stop non-compliant scrapers, audit training data, or replace counsel. See the [honesty module](../ui/page.md#honesty-module) for the canonical statement of limits.
