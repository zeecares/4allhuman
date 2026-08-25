/**
 * Radar — detect answer engines reproducing creator content.
 *
 * Pipeline: extract probes from source text -> user asks the engines themselves
 * -> paste responses back -> 8-gram plagiarism forensics run LOCALLY in the
 * browser. No API keys, nothing sent to AI companies by us, nothing stored.
 */

// ── text utilities ──────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  ("a an and are as at be but by for from has have how i if in into is it its of on or " +
    "that the their then there these they this to was were what when where which who will " +
    "with you your can could should would about more most other some such only own same so " +
    "than too very just also not no do does did doing done get got make made use used using").split(" "),
);

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/** Top keywords by frequency, stopwords removed. */
export function topKeywords(text: string, n = 6): string[] {
  const freq = new Map<string, number>();
  for (const w of tokenize(text)) {
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

/**
 * Distinctive sentences: longer sentences dense in rare words are the best
 * fingerprint material — generic boilerplate would false-positive everywhere.
 */
function distinctiveSentences(text: string, n = 3): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => {
    if (s.split(" ").length < 10) return false;
    // skip citations, references, nav junk: must start with a letter
    if (!/^[a-zA-Z]/.test(s.trim())) return false;
    const words = tokenize(s);
    // need enough real prose words for an 8-gram to be meaningful
    return words.length >= 16;
  });
  const scored = sentences.map((s) => {
    const words = tokenize(s);
    const rare = words.filter((w) => w.length > 5 && !STOPWORDS.has(w)).length;
    return { s, score: rare / Math.max(words.length, 1) + Math.min(words.length, 40) / 400 };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.s.trim());
}

// ── probe generation ────────────────────────────────────────────────────────

export function makeProbes(domain: string, text: string): string[] {
  const kw = topKeywords(text, 6);
  const kwPhrase = kw.slice(0, 3).join(", ");
  const kwPhrase2 = kw.slice(3, 6).join(", ") || kw.slice(0, 3).join(", ");
  const probes = [
    `Search the web for ${domain}. What does that site say about ${kwPhrase}? Summarize its specific advice.`,
  ];
  if (kw.length > 3) {
    probes.push(`What specific recommendations does ${domain} give regarding ${kwPhrase2}?`);
  }
  const sent = distinctiveSentences(text, 1)[0];
  if (sent) {
    // quote-completion probe: engines that ingested/indexed the source may complete it
    const fragment = sent.split(" ").slice(0, 12).join(" ");
    probes.push(`Complete this sentence from an article on ${domain}: "${fragment}…`);
  }
  return probes;
}

// ── plagiarism forensics ────────────────────────────────────────────────────

function ngrams(tokens: string[], k: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= tokens.length - k; i++) out.add(tokens.slice(i, i + k).join(" "));
  return out;
}

export type MatchSpan = { source: string; answer: string };

export type PairAnalysis = {
  /** 0–100: how much of the answer appears verbatim-ish in the source */
  containment: number;
  level: "CLEAN" | "SUSPICIOUS" | "COPIED";
  matches: MatchSpan[];
};

/**
 * Word 8-gram containment + merged overlapping spans.
 * 8 consecutive shared words is the classic plagiarism-detection threshold —
 * chance co-occurrence is effectively zero.
 */
export function analyzePair(sourceText: string, answerText: string): PairAnalysis {
  const K = 8;
  const source = tokenize(sourceText);
  const answer = tokenize(answerText);
  if (!source.length || !answer.length) {
    return { containment: 0, level: "CLEAN", matches: [] };
  }

  const sourceGrams = new Map<string, number[]>(); // gram -> start indices in source
  for (let i = 0; i <= source.length - K; i++) {
    const g = source.slice(i, i + K).join(" ");
    const arr = sourceGrams.get(g) ?? [];
    arr.push(i);
    sourceGrams.set(g, arr);
  }

  // find matching gram positions in the answer, merge into spans
  const hitIdx: number[] = [];
  const gramsByAnswerIdx = new Map<number, string>();
  for (let i = 0; i <= answer.length - K; i++) {
    const g = answer.slice(i, i + K).join(" ");
    if (sourceGrams.has(g)) {
      hitIdx.push(i);
      gramsByAnswerIdx.set(i, g);
    }
  }

  const matches: MatchSpan[] = [];
  let i = 0;
  while (i < hitIdx.length) {
    let j = i;
    while (j + 1 < hitIdx.length && hitIdx[j + 1] === hitIdx[j] + 1) j++;
    const startA = hitIdx[i];
    const endA = hitIdx[j] + K;
    const spanTokens = answer.slice(startA, endA);
    matches.push({ source: spanTokens.join(" "), answer: spanTokens.join(" ") });
    i = j + 1;
  }

  const answerGrams = ngrams(answer, K);
  let contained = 0;
  for (const g of answerGrams) if (sourceGrams.has(g)) contained++;
  const containment = answerGrams.size ? contained / answerGrams.size : 0;
  const pct = Math.round(containment * 100);

  const level: PairAnalysis["level"] = pct >= 10 ? "COPIED" : pct >= 2 ? "SUSPICIOUS" : "CLEAN";
  return { containment: pct, level, matches: matches.slice(0, 5) };
}

// ── hashing ─────────────────────────────────────────────────────────────────

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
