/**
 * RFC 9309 (Robots Exclusion Protocol) matching, implemented from the spec.
 *
 * What the spec actually requires, and what this module implements:
 *  - §2.2.1 group semantics: consecutive user-agent lines form one group until
 *    the first non-user-agent record; a crawler obeys the group with the MOST
 *    SPECIFIC matching user-agent (longest case-insensitive token match),
 *    falling back to the "*" group, and to "everything is allowed" when no
 *    group matches at all. Multiple groups carrying the same token are merged.
 *  - §2.2.2 path matching: allow/disallow values are compared against the URI
 *    path as octets, case-sensitively. "*" matches any sequence of characters
 *    (including none), a trailing "$" anchors the match to the end of the path.
 *    Percent-encoded octets are decoded before comparison, except %2F (slash)
 *    and %25 (percent), which stay encoded on both sides.
 *  - Decision rule: the longest matching rule wins; if an allow and a disallow
 *    match with equal length, allow wins. No matching rule means allowed.
 *
 * Zero dependencies; used by the scanner and the /api/verify route, and
 * exercised directly by tests/robots9309.test.ts.
 */

export type RuleKind = "allow" | "disallow";

export type RobotsRule = {
  kind: RuleKind;
  /** Raw value as written in the file (before percent-decoding). */
  raw: string;
  /** Decoded match pattern ("*" and trailing "$" keep their meaning). */
  pattern: string;
  /** Octet length of the pattern, used for longest-match comparison. */
  octets: number;
  /** 1-based line number in the source file, for explainable verdicts. */
  line: number;
};

export type RobotsGroup = {
  /** User-agent tokens as written (original case). */
  agents: string[];
  rules: RobotsRule[];
};

export type ParsedRobots = {
  groups: RobotsGroup[];
  sitemaps: string[];
};

export type Verdict = {
  allowed: boolean;
  /** The user-agent token(s) of the group that governs this crawler. */
  matchedAgents: string[];
  /** The rule that decided the verdict, if any. */
  rule: RobotsRule | null;
  /** Plain-language explanation suitable for display in the UI. */
  reason: string;
};

/**
 * Decode percent-encoded octets per RFC 9309 §2.2.2: every %XX sequence is
 * decoded EXCEPT %2F and %25, which remain encoded so an encoded slash never
 * becomes a path separator. Applied symmetrically to rule values and paths.
 */
export function decodeOctets(value: string): string {
  // Decode runs of %XX as UTF-8 octet sequences (so "%C3%A9" -> "é"),
  // leaving %2F and %25 encoded. Non-UTF-8 bytes fall back to their
  // single-octet character.
  return value.replace(/(%[0-9a-fA-F]{2})+/g, (run) => {
    let out = "";
    let bytes: number[] = [];
    const flush = () => {
      if (bytes.length === 0) return;
      try {
        out += new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
      } catch {
        for (const b of bytes) out += String.fromCharCode(b);
      }
      bytes = [];
    };
    for (const m of run.matchAll(/%([0-9a-fA-F]{2})/g)) {
      const hex = m[1].toUpperCase();
      if (hex === "2F" || hex === "25") {
        flush();
        out += m[0];
      } else {
        bytes.push(parseInt(hex, 16));
      }
    }
    flush();
    return out;
  });
}

/** Parse a robots.txt body into groups, sitemaps, and access rules. */
export function parseRobots(robotsTxt: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  // Once any non-user-agent record appears, the next user-agent line starts
  // a new group (RFC 9309 §2.2.1).
  let inAgentBlock = true;

  const lines = robotsTxt.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    // Comments start at the first '#'; leading/trailing whitespace is ignored.
    const line = lines[i].replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!value) continue;
      if (!current || !inAgentBlock) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      inAgentBlock = true;
      current.agents.push(value);
      continue;
    }

    inAgentBlock = false;

    if (field === "sitemap") {
      // Sitemaps are global records, never part of a group.
      if (value) sitemaps.push(value);
      continue;
    }

    if ((field === "allow" || field === "disallow") && current) {
      // An empty value is not a rule: "Disallow:" alone means allow
      // everything, "Allow:" alone means nothing.
      if (!value) continue;
      const pattern = decodeOctets(value);
      current.rules.push({
        kind: field,
        raw: value,
        pattern,
        octets: new TextEncoder().encode(pattern).length,
        line: lineNo,
      });
    }
    // Other fields (crawl-delay, etc.) are valid records: they end the
    // user-agent block but carry no access semantics here.
  }

  return { groups, sitemaps };
}

/** True when a group's user-agent token matches a crawler product token. */
function agentMatches(groupToken: string, crawlerToken: string): boolean {
  if (groupToken === "*") return true;
  const g = groupToken.toLowerCase();
  const c = crawlerToken.toLowerCase();
  // Product tokens may carry a version ("GPTBot/1.2") or suffix; a group token
  // matches when it prefixes the crawler's token.
  return c.startsWith(g);
}

/**
 * The rules governing a crawler: the group(s) with the longest matching
 * user-agent token; the "*" group when nothing specific matches; null when no
 * group applies at all (everything is allowed). Groups sharing the winning
 * token are merged, per RFC 9309 §2.2.1.
 */
export function governingGroup(
  parsed: ParsedRobots,
  crawlerToken: string,
): RobotsGroup | null {
  let best: RobotsGroup[] = [];
  let bestLen = 0;
  let wildcard: RobotsGroup[] = [];

  for (const group of parsed.groups) {
    let groupLen = 0;
    let isWildcard = false;
    for (const agent of group.agents) {
      if (agent.trim() === "*") {
        isWildcard = true;
        continue;
      }
      if (agentMatches(agent.trim(), crawlerToken)) {
        groupLen = Math.max(groupLen, agent.trim().length);
      }
    }
    if (groupLen > 0) {
      if (groupLen > bestLen) {
        best = [group];
        bestLen = groupLen;
      } else if (groupLen === bestLen) {
        best.push(group);
      }
    } else if (isWildcard) {
      wildcard.push(group);
    }
  }

  const winners = bestLen > 0 ? best : wildcard;
  if (winners.length === 0) return null;
  return {
    agents: winners.flatMap((g) => g.agents),
    rules: winners.flatMap((g) => g.rules),
  };
}

/**
 * Match a decoded pattern against a decoded path. "*" matches any sequence
 * of characters (including none and "/"); a trailing "$" anchors the match
 * to the end of the path. A "$" anywhere else is a literal character.
 */
export function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex =
    "^" +
    body
      .split("*")
      .map((chunk) => chunk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[\\s\\S]*") +
    (anchored ? "$" : "");
  return new RegExp(regex).test(path);
}

/** The winning rule for a path within a group: longest match, allow on ties. */
export function winningRule(
  rules: RobotsRule[],
  rawPath: string,
): RobotsRule | null {
  const path = decodeOctets(rawPath);
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (!best) {
      best = rule;
      continue;
    }
    if (rule.octets > best.octets) {
      best = rule;
    } else if (rule.octets === best.octets && rule.kind === "allow") {
      best = rule;
    }
  }
  return best;
}

/** Is `crawlerToken` allowed to fetch `path` under this robots.txt? */
export function isAllowed(
  parsed: ParsedRobots,
  crawlerToken: string,
  path: string,
): boolean {
  const group = governingGroup(parsed, crawlerToken);
  if (!group) return true;
  const rule = winningRule(group.rules, path);
  if (!rule) return true;
  return rule.kind === "allow";
}

/**
 * The verdict plus a plain-language reason — this is what the UI shows, so
 * site owners can see exactly which line of their robots.txt decided it.
 */
export function explain(
  parsed: ParsedRobots,
  crawlerToken: string,
  path: string,
): Verdict {
  const group = governingGroup(parsed, crawlerToken);
  if (!group) {
    return {
      allowed: true,
      matchedAgents: [],
      rule: null,
      reason: `No group in robots.txt matches "${crawlerToken}" — nothing restricts it.`,
    };
  }
  const rule = winningRule(group.rules, path);
  if (!rule) {
    return {
      allowed: true,
      matchedAgents: group.agents,
      rule: null,
      reason: `A group for "${group.agents.join('", "')}" exists, but none of its rules match ${path} — so it's allowed.`,
    };
  }
  const label = rule.kind === "allow" ? "Allow" : "Disallow";
  const verdict =
    rule.kind === "allow"
      ? `Explicitly allowed by "${label}: ${rule.raw}" (line ${rule.line}), the longest matching rule in the group for "${group.agents.join('", "')}".`
      : `Blocked by "${label}: ${rule.raw}" (line ${rule.line}), the longest matching rule in the group for "${group.agents.join('", "')}".`;
  return { allowed: rule.kind === "allow", matchedAgents: group.agents, rule, reason: verdict };
}
