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

// ── DE-COP memorization probe (arXiv 2402.09910) ───────────────────────────
// Multiple-choice items: one option is the creator's verbatim passage, the rest
// are rule-based paraphrases. A model that trained on the source picks verbatim
// above chance (25%). Deterministic transforms keep answer keys stable.

const SYNONYMS: [RegExp, string][] = [
  [/\bvery\b/gi, "particularly"],
  [/\bimportant\b/gi, "significant"],
  [/\bshows\b/gi, "demonstrates"],
  [/\bhelps\b/gi, "assists"],
  [/\buses\b/gi, "utilizes"],
  [/\bmake\b/gi, "create"],
  [/\bbig\b/gi, "substantial"],
  [/\bfast\b/gi, "rapid"],
  [/\bgood\b/gi, "effective"],
  [/\bmany\b/gi, "numerous"],
  [/\bbest\b/gi, "optimal"],
  [/\bstart\b/gi, "begin"],
  [/\bkeep\b/gi, "maintain"],
  [/\bchange\b/gi, "modify"],
];

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 7;
}

/** Rule-based paraphrase: synonym swaps + light restructuring.
 *  Guarantees the output differs from the input (progressively more aggressive). */
function paraphrase(sentence: string, variant: number): string {
  let out = sentence;
  // apply synonyms shifted by variant so each paraphrase differs
  SYNONYMS.forEach(([re, rep], idx) => {
    if ((idx + variant) % 2 === 0) out = out.replace(re, rep);
  });
  // aggressive pass: apply every remaining synonym until we differ from original
  const lowerIn = sentence.toLowerCase();
  if (out.toLowerCase() === lowerIn) {
    SYNONYMS.forEach(([re, rep]) => {
      if (out.toLowerCase() === lowerIn || re.test(out)) out = out.replace(re, rep);
    });
  }
  if (variant === 2 && out.includes(", ")) {
    // move leading clause after comma to the front
    const parts = out.split(", ");
    if (parts.length > 1) out = `${parts.slice(1).join(", ")}, ${parts[0]}`;
  }
  if (variant === 3) {
    out = `In practice, ${out.charAt(0).toLowerCase()}${out.slice(1)}`;
  }
  // last resort: tense/number swaps that always change something
  if (out.toLowerCase() === lowerIn) {
    out = out
      .replace(/\bis\b/g, "was")
      .replace(/\bare\b/g, "were")
      .replace(/\bcan\b/gi, "could")
      .replace(/(\w+)ing\b/g, "$1ed");
  }
  return out.trim();
}

function variantFor(salt: number): number {
  return (salt % 3) + 1;
}

export type McqItem = {
  id: number;
  passageLabel: string;
  options: { letter: string; text: string }[];
  correctLetter: string;
};

export function makeMcq(sourceText: string, count = 3): McqItem[] {
  const sentences = distinctiveSentences(sourceText, count * 2)
    .filter((s) => tokenize(s).length >= 16)
    .slice(0, count);
  const letters = ["A", "B", "C", "D"];
  return sentences.map((verbatim, id) => {
    let distractors = [paraphrase(verbatim, 1), paraphrase(verbatim, 2), paraphrase(verbatim, 3)];
    // deduplicate: a distractor equal to the verbatim (or another) invalidates the item
    const seen = new Set([verbatim.toLowerCase()]);
    distractors = distractors.map((d) => {
      let candidate = d;
      let salt = 0;
      while (seen.has(candidate.toLowerCase()) && salt < 5) {
        candidate = paraphrase(`${d} ${"additionally noted".slice(0, (salt % 3) * 6 + 6)}`, variantFor(salt));
        salt++;
      }
      if (seen.has(candidate.toLowerCase())) {
        candidate = `Reportedly, ${d.charAt(0).toLowerCase()}${d.slice(1)}`;
      }
      seen.add(candidate.toLowerCase());
      return candidate;
    });
    const shuffled = seededShuffle(
      [{ t: verbatim, correct: true }, ...distractors.map((t) => ({ t, correct: false }))],
      hashStr(verbatim),
    );
    let correctLetter = "A";
    const options = shuffled.map((o, i) => {
      if (o.correct) correctLetter = letters[i];
      return { letter: letters[i], text: o.t };
    });
    return { id, passageLabel: `Passage ${id + 1}`, options, correctLetter };
  });
}

export type McqScore = {
  correct: number;
  total: number;
  accuracyPct: number;
  chancePct: number;
  aboveChance: boolean;
  /** one-sided binomial p-value approximation via normal approximation */
  pValueApprox: number;
};

export function scoreMcq(items: McqItem[], answers: Record<number, string>): McqScore | null {
  const answered = items.filter((it) => answers[it.id]);
  if (!answered.length) return null;
  const total = answered.length;
  const correct = answered.filter((it) => answers[it.id] === it.correctLetter).length;
  const p = 0.25;
  const accuracyPct = Math.round((correct / total) * 100);
  // normal approximation of one-sided binomial test
  const mean = total * p;
  const sd = Math.sqrt(total * p * (1 - p));
  const z = sd > 0 ? (correct - mean) / sd : 0;
  // p = P(Z >= z); erf approx
  const erf = (x: number) =>
    Math.sign(x) * (1 - Math.exp((-2 / Math.PI) * x * x)) ** 0.5; // crude but fine for display
  const pValueApprox = Math.max(0, Math.min(1, 0.5 * (1 - erf(z / Math.SQRT2))));
  return {
    correct,
    total,
    accuracyPct,
    chancePct: 25,
    aboveChance: correct > mean && pValueApprox < 0.05,
    pValueApprox: Number(pValueApprox.toFixed(4)),
  };
}
