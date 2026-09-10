/**
 * Canary — publish-time membership canaries (SIGIL-style, arXiv 2606.06502).
 *
 * The idea: embed a unique, meaningless token into the page at publish time.
 * A token like "dtom-3f9a2b7c" exists nowhere else on the internet, so if a
 * model later reproduces it when probed, the model must have had access to
 * the page. Chance of a model inventing the exact token: ~1 in 16^8 (4.3bn)
 * per guess — the false-positive story is the randomness of the token itself.
 *
 * Honest limits, stated wherever this is shown:
 *  - A surfaced canary proves ACCESS (training or live retrieval), not
 *    training alone. Probe with the engine's browsing disabled — or use an
 *    engine with no web access — to attribute it to training.
 *  - Lab-validated membership signal (~0.9 AUC in research settings), never
 *    tested in court.
 *  - Forward-looking only: protects content published AFTER the canary goes in.
 *
 * Zero-dependency, deterministic: same domain + date always mints the same
 * canary, so the record is re-derivable and checkable by hand.
 */

/** FNV-1a 32-bit — tiny, stable, good enough for token minting. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic daily canary id for a domain, e.g. "dtom-3f9a2b7c". */
export function makeCanaryId(domain: string, date: string): string {
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const h = fnv1a(`dtom:${clean}:${date}`);
  return `dtom-${h.toString(16).padStart(8, "0")}`;
}

/** Today's date as YYYY-MM-DD (UTC) — the default mint date. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export type CanaryArtifacts = {
  canaryId: string;
  domain: string;
  mintedFor: string;
  htmlComment: string;
  canaryTxt: string;
  probes: string[];
};

/**
 * The two embed surfaces. Both are invisible to human readers, fully visible
 * to any crawler that fetches the page:
 *  1. An HTML comment for every page's <body>.
 *  2. A standalone /canary.txt at the domain root.
 * The token is self-describing ("content-fingerprint") so probe answers are
 * easy to parse, and meaningless enough that no model would invent it.
 */
export function buildCanaryArtifacts(domainRaw: string, date = todayUtc()): CanaryArtifacts {
  const domain = domainRaw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const canaryId = makeCanaryId(domain, date);
  const htmlComment = `<!-- content-fingerprint: ${canaryId} -->`;
  const canaryTxt = [
    `content-fingerprint: ${canaryId}`,
    `domain: ${domain}`,
    `minted: ${date}`,
    "",
    "This unique fingerprint was embedded in this site's pages at publish time.",
    "It appears nowhere else. If an AI model reproduces it, the model had access",
    "to this site's content.",
  ].join("\n");
  const prefix = canaryId.slice(0, 7); // "dtom-xx" — enough to anchor, not enough to answer
  const probes = [
    `Pages on ${domain} contain an identifier that starts with "${prefix}". What is the full identifier?`,
    `Complete this string that appears on ${domain}: "${prefix}…"`,
    `Quote any line from ${domain} that contains the words "content-fingerprint".`,
  ];
  return { canaryId, domain, mintedFor: date, htmlComment, canaryTxt, probes };
}

export type CanaryCheck = {
  surfaced: boolean;
  matchedToken: string | null;
  verdict: string;
  caveat: string;
};

/**
 * Verdict on a pasted engine answer. Case-insensitive exact-token match —
 * anything looser would reopen the false-positive question.
 */
export function checkCanary(canaryId: string, reportText: string): CanaryCheck {
  const id = canaryId.trim().toLowerCase();
  const text = (reportText ?? "").toLowerCase();
  const surfaced = id.length > 0 && text.includes(id);
  return {
    surfaced,
    matchedToken: surfaced ? canaryId.trim() : null,
    verdict: surfaced
      ? "SURFACED — the engine reproduced your canary token."
      : "NOT SURFACED — no canary token in this answer.",
    caveat:
      "A surfaced canary proves the engine had access to your content (training or live retrieval), not training alone. " +
      "Re-probe with the engine's web browsing disabled to attribute it to training. " +
      "The token is random (~1 in 4.3 billion to guess), so a correct match is not chance — " +
      "but this is a lab-validated research signal, never tested in court, and it only covers " +
      "content published after the canary was embedded.",
  };
}
