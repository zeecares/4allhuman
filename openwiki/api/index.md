# Files

- [POST /api/protect — Scan Orchestrator](protect-route.md) - The protect route handler orchestrates scanSite, generateAllArtifacts, and scoreFromScan into the single protect endpoint that returns scan evidence, deployable artifacts, and a protection score, in src/app/api/protect/route.ts.
- [POST /api/verify — Re-score Deployed Artifacts](verify-route.md) - The verify route handler scores user-pasted robots.txt, ai.txt, and meta-tag content using the same RFC 9309 parser and computeScore as the protect flow, enabling a before/after comparison without a live fetch, in src/app/api/verify/route.ts.
