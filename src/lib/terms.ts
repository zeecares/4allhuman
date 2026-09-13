/**
 * terms.txt — emerging-standard watch (arXiv:2609.11152, Sept 10 2026).
 *
 * terms.txt is a robots.txt-style file at /.well-known/terms.txt where a site
 * declares, per path and per purpose, whether machine visitors are allowed,
 * charged, or denied:
 *
 *   Version: 1
 *   Path: /articles/
 *   Unsigned: allow
 *   Purpose: search    allow   use=reference
 *   Purpose: train-ai  charge  0.002 USD/request
 *   Purpose: agent     deny
 *
 * Purposes: search, agent, train-ai, archive, research. Decisions: allow,
 * charge (with a price like "0.002 USD/request"), deny. Optional qualifiers:
 * use=immediate|reference|full, delegation=<scope>.
 *
 * This module is informational only, like the llms.txt layer: the proposal is
 * days old, almost no site serves the file yet, and its ABSENCE IS NORMAL and
 * costs nothing. When present, we parse it and report the declared terms.
 * Grammar mirrors the reference implementation (github.com/rch0wdhury/terms-txt,
 * MIT), but this parser is tolerant: malformed lines are collected as errors
 * and skipped instead of throwing, so one bad line never sinks the report.
 *
 * Adjacent detections (same paper's enforcement exchange, cheap to observe):
 * - HTTP 402 responses (payment quoted at the boundary)
 * - 401/403 with Accept-Signature / Signature-Input (Web Bot Auth challenge)
 * - Content-Signal response headers (Cloudflare's use= preference signals)
 */
import type { LayerResult } from "./layers.ts";

export const TERMS_PURPOSES = ["search", "agent", "train-ai", "archive", "research"] as const;
export type TermsPurpose = (typeof TERMS_PURPOSES)[number];

export type TermsDecision = "allow" | "charge" | "deny";

export interface TermsPurposeRule {
  decision: TermsDecision;
  price?: { amount: number; currency: string; unit: string };
  use?: string;
  delegation?: string;
}

export interface TermsPathBlock {
  path: string;
  unsigned: "allow" | "challenge" | "deny";
  purposes: Partial<Record<TermsPurpose, TermsPurposeRule>>;
}

export interface ParsedTermsTxt {
  version: number | null;
  termsId: string | null;
  receiptKeys: string | null;
  payment: { methods: string[]; settlement: string | null };
  blocks: TermsPathBlock[];
  /** Non-fatal problems found while parsing (tolerant parser). */
  errors: string[];
}

// ── parser ─────────────────────────────────────────────────────────────────

/**
 * Parse terms.txt content. Returns null only when the file has no usable
 * Path block at all; everything else is reported in `errors`.
 */
export function parseTermsTxt(text: string): ParsedTermsTxt | null {
  const result: ParsedTermsTxt = {
    version: null,
    termsId: null,
    receiptKeys: null,
    payment: { methods: [], settlement: null },
    blocks: [],
    errors: [],
  };
  let current: TermsPathBlock | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const c = line.indexOf(":");
    if (c < 0) {
      result.errors.push(`bad line (no field): "${raw.trim()}"`);
      continue;
    }
    const field = line.slice(0, c).trim().toLowerCase();
    const value = line.slice(c + 1).trim();
    const tok = value.split(/\s+/);

    if (field === "path") {
      current = { path: tok[0] ?? "/", unsigned: "allow", purposes: {} };
      result.blocks.push(current);
      continue;
    }

    if (!current) {
      // Header fields, before the first Path block.
      if (field === "version") result.version = Number(value) || null;
      else if (field === "terms-id") result.termsId = value;
      else if (field === "receipt-keys") result.receiptKeys = value;
      else if (field === "payment") {
        result.payment.methods.push(tok[0]);
        if (tok[1]) result.payment.settlement = tok[1];
      } else result.errors.push(`unknown header field "${field}"`);
      continue;
    }

    if (field === "unsigned") {
      if (value === "allow" || value === "challenge" || value === "deny") current.unsigned = value;
      else result.errors.push(`bad Unsigned value "${value}"`);
      continue;
    }

    if (field === "purpose") {
      const [name, decision, ...rest] = tok;
      if (!TERMS_PURPOSES.includes(name as TermsPurpose)) {
        result.errors.push(`unknown purpose "${name}"`);
        continue;
      }
      if (decision !== "allow" && decision !== "charge" && decision !== "deny") {
        result.errors.push(`bad decision "${decision ?? ""}" for ${name}`);
        continue;
      }
      const rule: TermsPurposeRule = { decision };
      for (let i = 0; i < rest.length; i++) {
        const t = rest[i];
        if (/^\d/.test(t)) {
          const [currency, unit] = (rest[++i] ?? "").split("/");
          rule.price = { amount: Number(t), currency: currency || "USD", unit: unit || "request" };
        } else if (t.startsWith("use=")) rule.use = t.slice(4);
        else if (t.startsWith("delegation=")) rule.delegation = t.slice(11);
        else result.errors.push(`unknown token "${t}" on ${name} line`);
      }
      if (decision === "charge" && !rule.price) {
        result.errors.push(`charge without a price for ${name}`);
        continue;
      }
      current.purposes[name as TermsPurpose] = rule;
      continue;
    }

    result.errors.push(`unknown field "${field}" in Path block`);
  }

  return result.blocks.length > 0 ? result : null;
}

// ── adjacent enforcement signals ───────────────────────────────────────────

/**
 * Detect the paper's enforcement-exchange signals on an ordinary response.
 * Cheap, observable, and honest: we report what the site sent, nothing more.
 */
export function detectTermsSignals(
  status: number | null,
  headers: Record<string, string | string[] | undefined>,
): string[] {
  const get = (name: string): string | undefined => {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const signals: string[] = [];
  if (status === 402) {
    signals.push("Responded 402 Payment Required — the site quotes a price for machine access at the HTTP boundary.");
  }
  if ((status === 401 || status === 403) && (get("accept-signature") || get("signature-input"))) {
    signals.push("Challenges unsigned agents with Accept-Signature — Web Bot Auth (RFC 9421 signatures) is enforced here.");
  }
  const contentSignal = get("content-signal");
  if (contentSignal) {
    signals.push(`Sends a Content-Signal header ("${contentSignal}") — machine-use preferences at the HTTP layer.`);
  }
  return signals;
}

// ── reporting ──────────────────────────────────────────────────────────────

function priceText(rule: TermsPurposeRule): string {
  if (!rule.price) return "";
  return ` ${rule.price.amount} ${rule.price.currency}/${rule.price.unit}`;
}

/** One line per purpose that appears anywhere in the file. */
export function summarizePurposes(parsed: ParsedTermsTxt): string[] {
  const lines: string[] = [];
  for (const purpose of TERMS_PURPOSES) {
    const entries = parsed.blocks
      .map((b) => ({ path: b.path, rule: b.purposes[purpose] }))
      .filter((e): e is { path: string; rule: TermsPurposeRule } => !!e.rule);
    if (!entries.length) continue;
    const decisions = new Set(entries.map((e) => e.rule.decision));
    if (decisions.size === 1 && entries.length === parsed.blocks.length) {
      const r = entries[0].rule;
      lines.push(`${purpose}: ${r.decision}${priceText(r)} on every declared path`);
    } else {
      const parts = entries.map((e) => `${e.rule.decision}${priceText(e.rule)} on ${e.path}`);
      lines.push(`${purpose}: ${parts.join("; ")}`);
    }
  }
  return lines;
}

/**
 * Informational layer (0 points, like llms.txt): terms.txt is a days-old
 * proposal — absence is normal, presence is reported, never scored.
 */
export function termsTxtLayer(
  parsed: ParsedTermsTxt | null,
  found: boolean,
  signals: string[] = [],
): LayerResult {
  const details: string[] = [];
  let summary: string;

  if (parsed) {
    const purposeLines = summarizePurposes(parsed);
    summary = `/.well-known/terms.txt is published${parsed.version ? ` (version ${parsed.version})` : ""} — the site declares machine-access terms per purpose. ${purposeLines.length ? "" : "No Purpose lines parsed."}`.trim();
    details.push(...purposeLines);
    if (parsed.payment.settlement) details.push(`payment: ${parsed.payment.methods.join(", ")} via ${parsed.payment.settlement}`);
    if (parsed.receiptKeys) details.push(`signed receipts: ${parsed.receiptKeys}`);
    for (const e of parsed.errors.slice(0, 3)) details.push(`parse note: ${e}`);
  } else if (found) {
    summary = "/.well-known/terms.txt exists but could not be parsed — no usable Path blocks.";
  } else {
    summary =
      "No /.well-known/terms.txt. That is normal: terms.txt (arXiv:2609.11152) is a consent-and-compensation proposal published September 10, 2026 — days old, and almost no site serves it yet. When adopted, it lets a site state per-purpose machine-access terms (search/agent/train-ai: allow, charge, or deny). Absence costs nothing.";
  }
  details.push(...signals);

  return {
    id: "termstxt",
    name: "terms.txt (emerging standard)",
    status: "info",
    summary,
    details,
    points: 0,
    maxPoints: 0,
  };
}

/** What the scanner carries: the file (if any) plus enforcement signals. */
export interface TermsTxtResult {
  found: boolean;
  parsed: ParsedTermsTxt | null;
  signals: string[];
}

// ── live check ─────────────────────────────────────────────────────────────

/**
 * Fetch and evaluate /.well-known/terms.txt for an origin. Self-contained:
 * makes exactly one request. Adjacent enforcement signals (402, Web Bot Auth
 * challenges, Content-Signal headers) are reported from that same response.
 */
export async function checkTermsTxt(origin: string, timeoutMs = 8000): Promise<TermsTxtResult> {
  try {
    const res = await fetch(`${origin}/.well-known/terms.txt`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "DontTrainOnMe-Scanner/0.1 (hackathon project)" },
      redirect: "follow",
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const signals = detectTermsSignals(res.status, headers);
    if (!res.ok) return { found: false, parsed: null, signals };
    const parsed = parseTermsTxt(await res.text());
    return { found: true, parsed, signals };
  } catch {
    return { found: false, parsed: null, signals: [] };
  }
}
