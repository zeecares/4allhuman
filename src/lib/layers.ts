/**
 * Multi-layer audit: every AI opt-out standard a site can publish, scored
 * in one report. Each layer returns a plain-language verdict plus the raw
 * evidence behind it, and feeds points into the overall protection score.
 *
 * Layers and weights (total 100):
 *   robots.txt crawler coverage ..... 40  (RFC 9309, enforced by well-behaved bots)
 *   X-Robots-Tag HTTP header ........ 15  (noai / noimageai / none, global or per-bot)
 *   noai/noimageai meta tags ........ 15  (page-level, honored by Google-Extended style bots)
 *   TDMRep (W3C tdm-reservation) .... 10  (machine-readable EU DSM Art. 4(3) reservation)
 *   ai.txt .......................... 10  (Spawning proposal — honor-based, not enforced)
 *   aipref (IETF draft vocab) .......  5  (draft-ietf-aipref-vocab signals where detectable)
 *   Site reachable for verification .  5
 *   llms.txt ........................  0  (allow-side counterpart: guides LLM use,
 *                                           it is NOT an opt-out — reported as info only)
 * Pure parsing helpers, zero deps.
 */

export type LayerStatus = "protected" | "partial" | "absent" | "info";

export type LayerResult = {
  id:
    | "robots"
    | "headers"
    | "meta"
    | "tdmrep"
    | "aitxt"
    | "llmstxt"
    | "aipref"
    | "reachable";
  name: string;
  status: LayerStatus;
  /** One-line plain-language verdict. */
  summary: string;
  /** Evidence lines — raw directives, matched rules, or what was missing. */
  details: string[];
  points: number;
  maxPoints: number;
};

export const LAYER_WEIGHTS = {
  robots: 40,
  headers: 15,
  meta: 15,
  tdmrep: 10,
  aitxt: 10,
  aipref: 5,
  llmstxt: 0,
  reachable: 5,
} as const;

export const SCORE_MAX = (Object.values(LAYER_WEIGHTS) as number[]).reduce((a, b) => a + b, 0); // 100

// ── X-Robots-Tag ────────────────────────────────────────────────────────────

export type XRobotsRule = {
  /** null = applies to every bot; otherwise the specific user-agent token. */
  userAgent: string | null;
  directive: string;
};

/**
 * Parse one or more X-Robots-Tag header values.
 * Format (Google): comma-separated directives, optionally scoped per bot as
 * "UserAgent: directive". Multiple headers merge.
 *   X-Robots-Tag: noai, noimageai
 *   X-Robots-Tag: GPTBot: noai
 *   X-Robots-Tag: otherbot: nofollow, noarchive
 */
export function parseXRobotsTag(headerValues: string[]): XRobotsRule[] {
  const rules: XRobotsRule[] = [];
  for (const value of headerValues) {
    for (const part of value.split(",")) {
      const token = part.trim();
      if (!token) continue;
      // A "Name: directive" prefix scopes the rule to that user-agent.
      // Bare directives contain no colon, so the first colon split is safe.
      const m = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.+)$/.exec(token);
      if (m) {
        rules.push({ userAgent: m[1], directive: m[2].trim().toLowerCase() });
      } else {
        rules.push({ userAgent: null, directive: token.toLowerCase() });
      }
    }
  }
  return rules;
}

const AI_DIRECTIVES = new Set(["noai", "noimageai"]);
/** none / noindex stop indexing — a shield, but not an explicit AI-training opt-out. */
const INDEX_BLOCKING = new Set(["none", "noindex"]);

export function headersLayer(headerValues: string[]): LayerResult {
  const name = "X-Robots-Tag header";
  const maxPoints = LAYER_WEIGHTS.headers;
  if (!headerValues.length) {
    return {
      id: "headers",
      name,
      status: "absent",
      summary: "No X-Robots-Tag header — pages can be served without any HTTP-level AI opt-out.",
      details: ["The homepage response carried no X-Robots-Tag header."],
      points: 0,
      maxPoints,
    };
  }
  const rules = parseXRobotsTag(headerValues);
  const globalAi = rules.filter((r) => r.userAgent === null && AI_DIRECTIVES.has(r.directive));
  const perBotAi = rules.filter((r) => r.userAgent !== null && AI_DIRECTIVES.has(r.directive));
  const indexBlocks = rules.filter((r) => INDEX_BLOCKING.has(r.directive));
  const details = headerValues.map((v) => `X-Robots-Tag: ${v}`);
  if (globalAi.length) {
    return {
      id: "headers",
      name,
      status: "protected",
      summary: "Site-wide AI opt-out in the HTTP header — applies to every page, including non-HTML files meta tags can't cover.",
      details,
      points: maxPoints,
      maxPoints,
    };
  }
  if (perBotAi.length || indexBlocks.length) {
    const bots = [...new Set(perBotAi.map((r) => r.userAgent))].join(", ");
    return {
      id: "headers",
      name,
      status: "partial",
      summary: perBotAi.length
        ? `AI opt-out only for specific bots (${bots}) — every unlisted AI crawler is unaffected.`
        : "Header blocks indexing (none/noindex) but never says noai — AI training use is not expressly refused.",
      details,
      points: Math.round(maxPoints / 2),
      maxPoints,
    };
  }
  return {
    id: "headers",
    name,
    status: "absent",
    summary: "X-Robots-Tag present but carries no AI directive — no noai, noimageai, or none.",
    details,
    points: 0,
    maxPoints,
  };
}

// ── meta tags ───────────────────────────────────────────────────────────────

export function extractMetaTags(html: string): string[] {
  const found: string[] = [];
  const metaRe = /<meta\s+[^>]*>/gi;
  for (const tag of html.match(metaRe) ?? []) {
    if (/name\s*=\s*["']robots["']/i.test(tag)) {
      for (const directive of ["noai", "noimageai", "notranslate"]) {
        if (new RegExp(`\\b${directive}\\b`, "i").test(tag)) found.push(directive);
      }
    }
  }
  return [...new Set(found)];
}

export function metaLayer(metaTagsFound: string[]): LayerResult {
  const name = "noai meta tags";
  const maxPoints = LAYER_WEIGHTS.meta;
  const hasAi = metaTagsFound.includes("noai") || metaTagsFound.includes("noimageai");
  return hasAi
    ? {
        id: "meta",
        name,
        status: "protected",
        summary: "Pages carry the noai/noimageai meta tag — an in-page AI-training opt-out honored by compliant bots.",
        details: [`Found directives: ${metaTagsFound.join(", ")}`],
        points: maxPoints,
        maxPoints,
      }
    : {
        id: "meta",
        name,
        status: "absent",
        summary: "No noai/noimageai meta tag on the homepage — no page-level AI opt-out.",
        details: metaTagsFound.length
          ? [`Only found: ${metaTagsFound.join(", ")} (not AI directives).`]
          : ['No <meta name="robots" content="noai"> or noimageai directive detected.'],
        points: 0,
        maxPoints,
      };
}

// ── TDMRep (W3C TDM Reservation Protocol) ──────────────────────────────────

export type TdmSignals = {
  /** tdm-reservation: 1 (HTTP header or <meta name="tdm-reservation" content="1">). */
  reserved: boolean;
  /** tdm-policy URL, when published. */
  policy: string | null;
  /** Where the signals came from, e.g. ["http-header", "html-meta"]. */
  sources: string[];
};

export function detectTdmRep(input: {
  headerValues?: string[];
  policyHeaderValues?: string[];
  html?: string | null;
}): TdmSignals {
  const sources: string[] = [];
  let reserved = false;
  let policy: string | null = null;
  const headerReserved = (input.headerValues ?? []).some((v) => v.trim() === "1");
  const headerPolicy = (input.policyHeaderValues ?? [])[0]?.trim() || null;
  if (headerReserved || headerPolicy) {
    sources.push("http-header");
    reserved = reserved || headerReserved;
    policy = policy ?? headerPolicy;
  }
  const html = input.html;
  if (html) {
    const metaReserved =
      /<meta\s+[^>]*name\s*=\s*["']tdm-reservation["'][^>]*content\s*=\s*["']1["']/i.test(html) ||
      /<meta\s+[^>]*content\s*=\s*["']1["'][^>]*name\s*=\s*["']tdm-reservation["']/i.test(html);
    const policyMatch =
      /<meta\s+[^>]*name\s*=\s*["']tdm-policy["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html) ??
      /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']tdm-policy["']/i.exec(html);
    if (metaReserved || policyMatch) {
      sources.push("html-meta");
      reserved = reserved || metaReserved;
      policy = policy ?? policyMatch?.[1] ?? null;
    }
  }
  return { reserved, policy, sources };
}

export function tdmRepLayer(tdm: TdmSignals): LayerResult {
  const name = "TDMRep rights reservation";
  const maxPoints = LAYER_WEIGHTS.tdmrep;
  if (tdm.reserved) {
    return {
      id: "tdmrep",
      name,
      status: "protected",
      summary:
        "W3C TDMRep reservation is published — the machine-readable form of the EU DSM Art. 4(3) opt-out.",
      details: [
        `tdm-reservation: 1 via ${tdm.sources.join(" + ")}`,
        ...(tdm.policy ? [`tdm-policy: ${tdm.policy}`] : []),
      ],
      points: maxPoints,
      maxPoints,
    };
  }
  if (tdm.policy) {
    return {
      id: "tdmrep",
      name,
      status: "partial",
      summary: "A tdm-policy is linked but tdm-reservation is not set to 1 — miners are not told TDM is reserved.",
      details: [`tdm-policy: ${tdm.policy} via ${tdm.sources.join(" + ")}`],
      points: Math.round(maxPoints / 2),
      maxPoints,
    };
  }
  return {
    id: "tdmrep",
    name,
    status: "absent",
    summary: "No TDMRep signal — the EU Art. 4(3) rights reservation is not machine-readable on this site.",
    details: ["No tdm-reservation header or <meta name=\"tdm-reservation\"> detected."],
    points: 0,
    maxPoints,
  };
}

// ── ai.txt ──────────────────────────────────────────────────────────────────

export function aiTxtLayer(found: boolean, content?: string | null): LayerResult {
  const name = "ai.txt policy file";
  const maxPoints = LAYER_WEIGHTS.aitxt;
  if (!found) {
    return {
      id: "aitxt",
      name,
      status: "absent",
      summary: "No /ai.txt — no Spawning-style machine-readable AI permissions file.",
      details: ["/ai.txt did not resolve or was empty."],
      points: 0,
      maxPoints,
    };
  }
  const denies = !content || /deny[- ](training|dataset)|permission:\s*deny/i.test(content);
  return {
    id: "aitxt",
    name,
    status: denies ? "protected" : "info",
    summary: denies
      ? "/ai.txt is published and denies training/dataset use. Honor-based — it only binds bots that choose to read it."
      : "/ai.txt exists but does not clearly deny training — check its permissions lines.",
    details: denies
      ? ["Detected deny-training/deny-dataset permissions."]
      : ["No deny-training / deny-dataset / Permission: deny lines matched."],
    points: denies ? maxPoints : Math.round(maxPoints / 2),
    maxPoints,
  };
}

// ── llms.txt (allow-side counterpart, informational only) ──────────────────

export function llmsTxtLayer(found: boolean): LayerResult {
  return {
    id: "llmstxt",
    name: "llms.txt",
    status: "info",
    summary: found
      ? "/llms.txt is published. Note: it is the ALLOW-side counterpart — it guides LLMs at answer time, it does not opt out of training."
      : "No /llms.txt. That file is the allow-side counterpart (guiding LLM use), not an opt-out — its absence costs nothing.",
    details: found
      ? ["/llms.txt resolved. It carries no opt-out weight in this score."]
      : ["/llms.txt did not resolve."],
    points: 0,
    maxPoints: LAYER_WEIGHTS.llmstxt,
  };
}

// ── aipref (IETF draft vocabulary) ─────────────────────────────────────────

/**
 * Detect IETF aipref-style usage preferences (draft-ietf-aipref-vocab) in
 * header values or HTML — e.g. "ai-train=n" / "ai-input=n" tokens. The
 * vocabulary is still an IETF draft, so detection is reported as emerging
 * signal and earns partial credit.
 */
export function detectAiPref(texts: (string | null | undefined)[]): string[] {
  const hits = new Set<string>();
  const re = /\b(ai-train|ai-input|ai-use|search)\s*=\s*(y|yes|n|no|allowed|disallowed)\b/gi;
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(re)) hits.add(`${m[1].toLowerCase()}=${m[2].toLowerCase()}`);
  }
  return [...hits];
}

export function aiPrefLayer(signals: string[]): LayerResult {
  const name = "aipref (IETF draft)";
  const maxPoints = LAYER_WEIGHTS.aipref;
  if (!signals.length) {
    return {
      id: "aipref",
      name,
      status: "absent",
      summary: "No aipref signals — the IETF's AI preferences vocabulary (still a draft) is not in use here.",
      details: ["No ai-train=/ai-input= preference tokens in headers or HTML."],
      points: 0,
      maxPoints,
    };
  }
  const denies = signals.filter((s) => /=(n|no|disallowed)$/.test(s));
  return {
    id: "aipref",
    name,
    status: denies.length ? "partial" : "info",
    summary: denies.length
      ? `aipref opt-out detected (${denies.join(", ")}) — early adoption of the IETF draft vocabulary.`
      : `aipref tokens detected (${signals.join(", ")}) but none refuse AI training.`,
    details: [`Detected: ${signals.join(", ")}`, "Standard: draft-ietf-aipref-vocab (IETF draft, not final)."],
    points: denies.length ? maxPoints : 0,
    maxPoints,
  };
}

// ── robots.txt + reachability ───────────────────────────────────────────────

export function robotsLayer(input: {
  blockedCount: number;
  totalCrawlers: number;
  robotsFound: boolean;
}): LayerResult {
  const name = "robots.txt (RFC 9309)";
  const maxPoints = LAYER_WEIGHTS.robots;
  const { blockedCount, totalCrawlers, robotsFound } = input;
  if (!robotsFound) {
    return {
      id: "robots",
      name,
      status: "absent",
      summary: "No robots.txt — every AI crawler is unrestricted by default.",
      details: ["/robots.txt did not resolve."],
      points: 0,
      maxPoints,
    };
  }
  const coverage = totalCrawlers > 0 ? blockedCount / totalCrawlers : 0;
  const points = Math.round(coverage * maxPoints);
  const status: LayerStatus = coverage === 1 ? "protected" : coverage > 0 ? "partial" : "absent";
  return {
    id: "robots",
    name,
    status,
    summary:
      coverage === 1
        ? `All ${totalCrawlers} known AI crawlers are disallowed at the site root.`
        : coverage > 0
          ? `${blockedCount}/${totalCrawlers} known AI crawlers blocked — ${totalCrawlers - blockedCount} can still crawl for training.`
          : `robots.txt exists but blocks none of the ${totalCrawlers} known AI crawlers.`,
    details: [
      `Evaluated with full RFC 9309 matching (most-specific group, longest-match, allow-wins ties, wildcards).`,
    ],
    points,
    maxPoints,
  };
}

export function reachableLayer(reachable: boolean): LayerResult {
  return {
    id: "reachable",
    name: "Verifiability",
    status: reachable ? "info" : "absent",
    summary: reachable
      ? "The site answered our scan — every verdict above was read live."
      : "The site did not answer — the score is worst-case; generated fixes remain valid.",
    details: [],
    points: reachable ? LAYER_WEIGHTS.reachable : 0,
    maxPoints: LAYER_WEIGHTS.reachable,
  };
}

// ── score ───────────────────────────────────────────────────────────────────

export function scoreFromLayers(layers: LayerResult[]): {
  score: number;
  breakdown: { label: string; got: number; max: number }[];
} {
  return {
    score: layers.reduce((s, l) => s + l.points, 0),
    breakdown: layers.map((l) => ({ label: l.name, got: l.points, max: l.maxPoints })),
  };
}
