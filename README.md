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

Full research notes: [`research/protecting-human-content-from-ai-training.md`](./research/protecting-human-content-from-ai-training.md)

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

## Roadmap (see TASKS.md)

- [x] Scanner, generators, scoring, UI
- [ ] One-click deploy: open a PR to the site's repo / upload via FTP
- [ ] C2PA "Proof of Human" content signing
- [ ] Spawning DO NOT TRAIN registry submission
