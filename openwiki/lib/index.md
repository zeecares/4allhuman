# Files

- [Crawler Blocklist & Legal Text](crawlers.md) - The AI_CRAWLERS blocklist of 19 AI training crawlers and the LEGAL EU DSM Art. 4(3) reservation strings that every generated artifact embeds, in src/lib/crawlers.ts.
- [Generator — Artifacts & Protection Score](generator.md) - generateAllArtifacts produces the robots.txt block, ai.txt, meta tags, and legal notice from a scan; computeScore applies a fixed 50/20/15/15 weighted model that both the protect and verify flows share, in src/lib/generator.ts.
- [Scanner — Live Site Inspection](scanner.md) - scanSite fetches a site's robots.txt, homepage, and ai.txt in parallel and parses the robots file with RFC 9309 group semantics and extracts noai/noimageai meta tags, in src/lib/scanner.ts.
