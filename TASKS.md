# Hackathon Build Tasks — agent-ready

Work top-down. Each task is independently verifiable. Core MVP (T1–T4) is done;
everything below is demo-enhancing.

## ✅ T1 — Crawler blocklist + legal text (`src/lib/crawlers.ts`)
19 AI training crawlers with operators/purposes; EU Art. 4(3) reservation strings.

## ✅ T2 — Live scanner (`src/lib/scanner.ts`)
Fetches robots.txt + homepage, RFC 9309-compliant group parser, meta tag extraction.

## ✅ T3 — Artifact generators + score (`src/lib/generator.ts`)
robots.txt snippet, ai.txt, meta tags, legal notice; weighted 0–100 protection score.

## ✅ T4 — UI + API (`src/app/`)
Next.js App Router; POST /api/protect orchestrates scan→generate→score.

---

## ✅ T5 — Demo hardening (30 min)
- [x] Example buttons (en.wikipedia.org = unprotected, www.theverge.com = partial)
- [x] Loading skeleton while scanning
- [x] Unreachable sites show warning + worst-case score, artifacts still generated

## ✅ T6 — "Before / After" demo flow (1 h)
- [x] **"Re-score my deployment"** card: paste robots.txt / ai.txt / meta tags →
      POST /api/verify parses them with the same RFC 9309 parser → before→after
      score animation (15 → 100 in demo). Prefilled with generated artifacts.

## ⬜ T7 — Spawning DO NOT TRAIN submission (1–2 h, if API is open)
- [ ] Check spawning.ai API availability at runtime; if closed, show a
      "download registry file" fallback so it still demos offline

## ⬜ T8 — C2PA "Proof of Human" signing (stretch, 2–3 h)
- [ ] Add an image upload tab; sign uploads with c2pa-node (`@contentauth/c2pa-node`)
- [ ] Show the manifest (producer, timestamp, "human-created" claim)
- [ ] Fallback if time-crunched: just detect *presence* of C2PA manifests in
      uploaded images and report it

## ⬜ T9 — Pitch assets (45 min, parallelizable)
- [ ] One-slide story: problem (creators have zero leverage) → legal gap map
      (EU opt-out exists but nobody publishes it correctly) → our fix (60-second
      agent) → live demo → EU AI Act compliance hook
- [ ] Record 60s backup video of the demo in case wifi fails at the venue

## ✅ T10 — Radar module (built)
- [x] `src/lib/radar.ts`: probe generation, 8-gram plagiarism forensics, engine adapters
- [x] `POST /api/radar` (maxDuration 60s, parallel engines, graceful no-key degradation)
- [x] UI module 09: URL/paste input, per-engine verdict LEDs, matched-span quotes,
      downloadable JSON evidence pack with source SHA-256
- [ ] Set OPENAI/PERPLEXITY/ANTHROPIC keys in Vercel env vars to enable live probing

## Demo script (90 seconds)
1. Scan `en.wikipedia.org` → score 15/100, wall of red "CAN TRAIN" chips
2. "One paste fixes this" → copy robots.txt section
3. Re-scan a fixed domain → score green, chips flip to BLOCKED
4. "This isn't symbolic: EU AI Act Art. 53(1)(c) forces GPAI providers to honor it"
5. Close on the research doc — we know exactly what this does and doesn't protect
