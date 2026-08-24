# Protecting Human-Generated Content from AI Training — Deep Research

**Date:** 2026-08-22
**Question:** What legal, technical, and market mechanisms exist today that allow creators and publishers of human-generated content to prevent or control its use for AI model training?

**Method:** Claims below were checked against primary sources wherever possible (statute text from EUR-Lex, the U.S. Copyright Office report PDF, project pages of the tool authors, IETF charter text, standards bodies). Items marked *(secondary)* rest on widely reported but not independently re-verified facts.

---

## TL;DR — Key Findings

1. **There is no global "do not train" right.** Protection is jurisdiction-dependent. The EU is the only major jurisdiction with an explicit statutory *opt-out* (DSM Directive Art. 4(3)); the US relies on an uncertain fair-use defense plus contract and anti-circumvention theories; the UK currently requires a license but has debated an exception.
2. **Machine-readable opt-outs exist but are honor-system.** robots.txt tokens (`GPTBot`, `Google-Extended`, `ClaudeBot`…), `noai` meta tags, `ai.txt`, and the emerging IETF **aipref** standard all express preferences; none are technically enforceable against a scraper that ignores them.
3. **Technical defenses fall into two families:** *access controls* (blocking known AI crawlers, paywalls — effective against compliant crawlers only) and *adversarial modifications* (Glaze/Nightshade — degrade style mimicry and training, but are in an arms race and demonstrably bypassable).
4. **Provenance standards (C2PA Content Credentials)** help prove *your* content is human-made and detect AI-generated content, but they don't stop training — they enable evidence and detection.
5. **Enforcement hooks matter more than signals:** EU AI Act Art. 53(1)(c) obliges GPAI providers to identify and comply with Art. 4(3) reservations "including through state-of-the-art technologies" — the first time honoring opt-outs became a regulatory compliance duty.
6. **US litigation is unsettled but trending toward "training may be fair use, piracy is not"**: Bartz v. Anthropic and Kadrey v. Meta (June 2025 summary judgments) allowed training on lawfully obtained books as fair use while letting claims about pirated training copies proceed. NYT v. OpenAI/Microsoft remains the marquee pending case.

---

## 1. Legal Levers by Jurisdiction

### 1.1 European Union — the strongest statutory protection

**DSM Directive (EU) 2019/790, Article 4** creates a mandatory *text and data mining (TDM) exception* — i.e., AI trainers generally don't need permission — **but Article 4(3) lets rightholders opt out**:

> "The exception or limitation provided for in paragraph 1 shall apply on condition that the use of works and other subject matter referred to in that paragraph has not been **expressly reserved by their rightholders in an appropriate manner, such as machine-readable means in the case of content made publicly available online**."
> — Directive (EU) 2019/790, Art. 4(3), EUR-Lex CELEX:32019L0790

Key properties:
- Opt-out must be "appropriate" and, for online content, "machine-readable" — robots.txt-style signals are the accepted form.
- It applies to *commercial* TDM. Research organizations doing scientific research get an unconditional exception under **Article 3** (cannot be overridden).
- Applies to works "lawfully accessible" — doesn't bless circumvention of paywalls/access controls.

**EU AI Act (Regulation (EU) 2024/1689), Article 53(1)(c)** turns that opt-out into an enforceable compliance duty for general-purpose AI providers:

> "(c) put in place a policy to comply with Union law on copyright and related rights, and in particular to **identify and comply with, including through state-of-the-art technologies, a reservation of rights expressed pursuant to Article 4(3) of Directive (EU) 2019/790**;
> (d) draw up and make publicly available a sufficiently detailed summary about the content used for training of the general-purpose AI model…"

So in the EU: publishing a machine-readable reservation + GPAI providers' obligations under the AI Act = the closest thing today to a legally backed "don't train on me."

### 1.2 United States — uncertain fair use, several indirect tools

Per the U.S. Copyright Office's report *"Copyright and Artificial Intelligence, Part 3: Generative AI Training"* (pre-publication, May 2025):

- Training involves prima facie infringement (reproduction); everything hinges on **fair use** (17 U.S.C. §107).
- The Office's conclusion: uses "are likely to be transformative," but "making commercial use of vast troves of copyrighted works to produce expressive content that **competes with them in existing markets**, especially where this is accomplished through **illegal access**, goes beyond established fair use boundaries."
- The Office favors letting **voluntary licensing markets** develop and considers statutory/compulsory licensing premature.

Indirect protection mechanisms in US law:
- **DMCA §1202 (Copyright Management Information):** removing/altering CMI (watermarks, credits) in training pipelines can be a separate violation — pleaded in NYT v. OpenAI.
- **Contract / ToS breach, computer-misuse theories (CFAA):** scraping against terms can support claims, though strength varies.
- **No opt-out statute exists** — a US creator cannot simply file a "do not train" notice with legal effect.

### 1.3 Other jurisdictions (brief)

*(Secondary)*
- **UK:** No TDM exception for commercial training — a license is required. A broad exception was proposed (2022), dropped, then re-opened for consultation; the government's preferred "rights reservation" approach mirrors the EU model but was not enacted as of writing. Getty Images v. Stability AI (UK High Court, Nov 2025) resolved largely on trademark/limited-scope grounds without deciding core TDM issues.
- **Japan:** Copyright Act Art. 30-4 permits almost any "non-enjoyment" use incl. ML training ("the most permissive"), except where use is unreasonable relative to the purpose or harms the copyright holder's interests beyond necessity.
- **Singapore:** Computational data analysis exception (Copyright Act 2021) with a lawful-access condition.
- **South Korea, Israel, Switzerland:** various TDM exceptions; none offer creators a formal opt-out equivalent to the EU's.

---

## 2. Machine-Readable Signals (Opt-Out Infrastructure)

These express preferences; they bind only compliant crawlers and (in the EU) provide the machine-readable evidence of a rights reservation.

| Signal | Mechanism | Notes |
|---|---|---|
| robots.txt UA tokens | Disallow specific AI crawlers: `GPTBot` (OpenAI), `Google-Extended` (Gemini training), `ClaudeBot` (Anthropic), `Bytespider` (ByteDance), `CCBot` (Common Crawl), `PerplexityBot`, etc. | Honor-system; Google explicitly ties `Google-Extended` to Gemini/Vertex training, not Search ranking. |
| `<meta name="robots" content="noai, noimageai">` | Page-level opt-out tags (introduced via DeviantArt, adopted informally) | Not standardized; ignored by many actors. |
| `ai.txt` | Spawning AI's proposal: a structured, human+machine readable file at `/ai.txt` listing permissions/denials beyond robots.txt | Site under maintenance at time of research; concept documented by Spawning. |
| HTTP headers | Preference signaling at delivery time | Being standardized by IETF. |
| **IETF aipref WG** (chartered 2025, active) | Standards-track: vocabulary for AI-related content preferences + attachment via well-known URIs (extending Robots Exclusion Protocol RFC 9309) and HTTP header fields + a reconciliation method | Charter explicitly excludes technical enforcement, crawler authentication, registries, auditing — i.e., it standardizes *expression*, not teeth. |

**Critical limitation (stated by the Nightshade authors themselves):** "Opt-out lists … can be easily ignored with zero consequences. They are unverifiable and unenforceable, and those who violate opt-out lists and do-not-scrape directives cannot be identified with high confidence." (nightshade.cs.uchicago.edu)

---

## 3. Technical Defenses

### 3.1 Access control (effective vs. compliant crawlers)

- **Cloudflare (July 2025)** made blocking AI crawlers a default-on option for its customers and introduced a permission/pay-per-crawl model, citing the collapse of referral traffic from AI answers. *(Secondary — blog URL returned 404 at fetch time; announcement widely reported.)*
- TollBit, ProRata, and similar intermediaries sit between publishers and AI companies to meter, block, or monetize scraping.
- Paywalls, login walls, and CDN bot management remain the only defenses that *physically* prevent non-compliant bulk fetching.

### 3.2 Adversarial / "poisoning" tools (UChicago SAND Lab)

- **Glaze** (glaze.cs.uchicago.edu): applies imperceptible perturbations that shift how a model perceives an artist's *style*, defending against style mimicry ("cloaking"). Free desktop app (Glaze 2.2), WebGlaze service.
- **Nightshade** (nightshade.cs.uchicago.edu): converts images into "poison" samples — models trained on them without consent learn corrupted associations (e.g., "cow flying in space" → handbag floating in space). Designed as deterrence by raising the cost of unconsented training.
- Both acknowledge limitations: arms-race dynamics, demonstrated removal attacks, effectiveness depends on volume and trainer countermeasures. Best treated as friction, not protection.

### 3.3 Provenance & watermarking (evidence, not prevention)

- **C2PA / Content Credentials** (c2pa.org): open standard cryptographically binding origin/edit history to media — "like a nutrition label." Helps creators *prove* authorship/human origin and helps platforms detect AI content. Does not by itself restrict training; stripping metadata raises separate §1202-type claims in the US.

---

## 4. Registries and Licensing Markets

- **Spawning AI — "Have I Been Trained?"**: lets creators search major LAION datasets for their work and register it in the **DO NOT TRAIN** registry; distributed via partners to some model trainers. Voluntary, honor-system.
- **Voluntary licensing** is growing (per USCO report): news licensing deals (e.g., AP–OpenAI, News Corp deal, Axel Springer), stock imagery (Shutterstock's contributor fund; Getty's own licensed-trained models), collective-management experiments in the EU.
- USCO position: licensing should remain voluntary; extended collective licensing only as a fallback for market failure.

---

## 5. Litigation Snapshot *(docket references; outcomes as of mid-2025 reporting)*

| Case | Court | Status / signal |
|---|---|---|
| *Bartz v. Anthropic* (No. 3:24-cv-05417) | N.D. Cal. | June 2025 SJ: training LLMs on purchased/borrowed books held **fair use**; **pirated library copies** proceed as infringement. |
| *Kadrey v. Meta* (No. 3:23-cv-03417) | N.D. Cal. | June 2025 SJ: similar direction on fair use for training; authors' market-dilution theory found inadequately supported; piracy-related claims alive. |
| *N.Y. Times v. Microsoft & OpenAI* (No. 1:23-cv-11195) | S.D.N.Y. | Pending; headline case incl. DMCA §1202 claims over stripped metadata. |
| *Getty Images v. Stability AI* | UK High Ct / D. Del. | UK action largely resolved on narrow grounds (Nov 2025) without settling TDM/fair-use questions. |
| *Andersen v. Stability AI* | N.D. Cal. | Ongoing; induced-infringement theories partially narrowed, partially proceeding. |

Emerging pattern: **lawful access + transformation → likely fair use; unlawful acquisition (piracy) → infringement regardless.** This makes *controlling access* to your content more valuable than labeling it after publication.

---

## 6. Practical Playbook (what a creator/publisher can do today)

Ranked roughly by effectiveness:

1. **Keep valuable content behind access control** (paywall/login/app). Lawfully-accessible requirements and the piracy line in recent rulings make this the strongest lever everywhere.
2. **Publish machine-readable reservations**: robots.txt blocks for all known AI crawlers + `noai`/`noimageai` meta tags (+ `ai.txt`). In the EU this also perfects your Art. 4(3) opt-out.
3. **Use contractual terms** (ToS/API licenses explicitly withholding training rights).
4. **Register with DO NOT TRAIN (Spawning)** and, for visual artists, consider Glaze/Nightshade as friction+deterrence.
5. **Attach provenance (C2PA Content Credentials)** to establish human origin and preserve §1202/CMI claims.
6. **Monitor enforcement**: in the EU, AI Act Art. 53(1)(c)/(d) gives regulators a handle; in the US, watch NYT v. OpenAI for the fair-use/market-dilution framework.

## 7. Open Problems

- **Verification asymmetry:** no way to audit what went into a closed model's training set; EU Annex XI documentation is only available to authorities on request.
- **Signal adoption:** aipref standardizes expression but not enforcement; crawlers can lie about identity (user-agent spoofing), which the charter explicitly leaves out of scope.
- **Adversarial-tool fragility:** Glaze/Nightshade countermeasures evolve faster than protections.
- **Jurisdictional patchwork:** Japan-style permissiveness vs. EU-style opt-outs creates forum-shopping incentives for trainers.
- **Definitional gaps:** "training," "TDM," and "lawfully accessible" map differently across statutes.

---

## Sources

Primary (fetched and quoted directly):
- Directive (EU) 2019/790 Arts. 3–4 — EUR-Lex, CELEX:32019L0790
- Regulation (EU) 2024/1689 (AI Act), Art. 53(1) — EUR-Lex, OJ:L_202401689
- U.S. Copyright Office, *Copyright and AI, Part 3: Generative-AI Training* (pre-publication, May 2025) — copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-3-Generative-AI-Training-Report-Pre-Publication-Version.pdf
- Glaze — glaze.cs.uchicago.edu (SAND Lab, University of Chicago)
- Nightshade: *What Is Nightshade? Why Does It Work, and Limitations* — nightshade.cs.uchicago.edu/whatis.html
- IETF AI Preferences (aipref) WG charter, charter-ietf-aipref-01 (approved 2025-04-09) — datatracker.ietf.org/doc/charter-ietf-aipref/
- C2PA — c2pa.org

Secondary (widely reported, not re-verified verbatim):
- Spawning AI / Have I Been Trained (spawning.ai; docs page under maintenance during research)
- Cloudflare AI-crawler blocking & pay-per-crawl announcements (blog.cloudflare.com)
- Court dockets listed in §5 (courtlistener.com; API results inconclusive at fetch time)
- National implementations: UK IPO consultation, Japan Copyright Act Art. 30-4, Singapore Copyright Act 2021
