/**
 * terms.txt module tests - tolerant parsing of the /.well-known/terms.txt
 * format (arXiv:2609.11152), per-purpose summaries, adjacent enforcement
 * signals, and the informational-layer contract (never scored, absence is
 * normal). Runs with `npm test` (node:test + type stripping, zero deps).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectTermsSignals,
  parseTermsTxt,
  summarizePurposes,
  termsTxtLayer,
} from "../src/lib/terms.ts";

// The example file from the paper's reference implementation README.
const EXAMPLE = `# /.well-known/terms.txt
Version: 1
Terms-Id: 2026-09-01
Receipt-Keys: https://origin.example/.well-known/http-message-signatures-directory
Payment: voucher https://settle.example/.well-known/settlement

Path: /articles/
Unsigned: allow
Purpose: search    allow   use=reference
Purpose: agent     allow   use=reference  delegation=read:articles
Purpose: train-ai  charge  0.002 USD/request
Purpose: research  allow   use=full

Path: /premium/
Unsigned: challenge
Purpose: search    allow   use=reference
Purpose: agent     charge  0.01 USD/request  use=reference  delegation=read:premium
Purpose: train-ai  deny
`;

// ── parser ──────────────────────────────────────────────────────────────────

test("parse: the reference example parses cleanly", () => {
  const t = parseTermsTxt(EXAMPLE);
  assert.ok(t);
  assert.equal(t.version, 1);
  assert.equal(t.termsId, "2026-09-01");
  assert.equal(t.receiptKeys, "https://origin.example/.well-known/http-message-signatures-directory");
  assert.deepEqual(t.payment, { methods: ["voucher"], settlement: "https://settle.example/.well-known/settlement" });
  assert.equal(t.blocks.length, 2);
  assert.deepEqual(t.errors, []);

  const articles = t.blocks[0];
  assert.equal(articles.path, "/articles/");
  assert.equal(articles.unsigned, "allow");
  assert.equal(articles.purposes["train-ai"]?.decision, "charge");
  assert.deepEqual(articles.purposes["train-ai"]?.price, { amount: 0.002, currency: "USD", unit: "request" });
  assert.equal(articles.purposes.agent?.delegation, "read:articles");
  assert.equal(articles.purposes.search?.use, "reference");

  const premium = t.blocks[1];
  assert.equal(premium.unsigned, "challenge");
  assert.equal(premium.purposes["train-ai"]?.decision, "deny");
  assert.deepEqual(premium.purposes.agent?.price, { amount: 0.01, currency: "USD", unit: "request" });
});

test("parse: comments and blank lines are ignored, fields are case-insensitive", () => {
  const t = parseTermsTxt("# comment\n\nVERSION: 1\n\nPATH: /\nPurpose: search allow\n");
  assert.ok(t);
  assert.equal(t.version, 1);
  assert.equal(t.blocks[0].purposes.search?.decision, "allow");
});

test("parse: no Path blocks returns null", () => {
  assert.equal(parseTermsTxt("Version: 1\n"), null);
  assert.equal(parseTermsTxt(""), null);
});

test("parse: malformed lines are collected, not thrown", () => {
  const t = parseTermsTxt("Path: /\nPurpose: train-ai charge\nPurpose: bogus allow\nGarbage line\nPurpose: search allow\n");
  assert.ok(t);
  assert.equal(t.blocks[0].purposes.search?.decision, "allow");
  assert.equal(t.blocks[0].purposes["train-ai"], undefined, "charge without price is rejected");
  assert.equal(t.errors.length, 3);
});

test("parse: unknown fields and bad Unsigned values land in errors", () => {
  const t = parseTermsTxt("Path: /\nUnsigned: maybe\nFrobnicate: yes\nPurpose: agent deny\n");
  assert.ok(t);
  assert.equal(t.blocks[0].unsigned, "allow", "bad Unsigned falls back to default");
  assert.equal(t.blocks[0].purposes.agent?.decision, "deny");
  assert.equal(t.errors.length, 2);
});

// ── summaries ───────────────────────────────────────────────────────────────

test("summarize: uniform decisions collapse to one line per purpose", () => {
  const t = parseTermsTxt("Path: /\nPurpose: train-ai deny\nPurpose: search allow\n");
  assert.ok(t);
  const lines = summarizePurposes(t);
  assert.ok(lines.includes("train-ai: deny on every declared path"));
  assert.ok(lines.includes("search: allow on every declared path"));
});

test("summarize: mixed decisions are reported per path with prices", () => {
  const t = parseTermsTxt(EXAMPLE);
  assert.ok(t);
  const lines = summarizePurposes(t);
  const trainAi = lines.find((l) => l.startsWith("train-ai:"));
  assert.ok(trainAi);
  assert.match(trainAi, /charge 0.002 USD\/request on \/articles\//);
  assert.match(trainAi, /deny on \/premium\//);
});

// ── adjacent signals ────────────────────────────────────────────────────────

test("signals: 402 is reported", () => {
  const s = detectTermsSignals(402, {});
  assert.equal(s.length, 1);
  assert.match(s[0], /402/);
});

test("signals: 403 with Accept-Signature is a Web Bot Auth challenge", () => {
  const s = detectTermsSignals(403, { "accept-signature": 'sig1=("sig1");keyid="abc"' });
  assert.equal(s.length, 1);
  assert.match(s[0], /Web Bot Auth/);
});

test("signals: 403 without signature headers is not flagged", () => {
  assert.deepEqual(detectTermsSignals(403, {}), []);
});

test("signals: Content-Signal header is quoted", () => {
  const s = detectTermsSignals(200, { "content-signal": "search=yes, ai-train=no" });
  assert.equal(s.length, 1);
  assert.match(s[0], /ai-train=no/);
});

// ── layer contract ──────────────────────────────────────────────────────────

test("layer: absence is informational, honest, and scores nothing", () => {
  const layer = termsTxtLayer(null, false);
  assert.equal(layer.status, "info");
  assert.equal(layer.points, 0);
  assert.equal(layer.maxPoints, 0);
  assert.match(layer.summary, /normal/i);
  assert.match(layer.summary, /Absence costs nothing/);
});

test("layer: a parsed file reports purposes and signals", () => {
  const t = parseTermsTxt(EXAMPLE);
  const layer = termsTxtLayer(t, true, ["Responded 402 Payment Required"]);
  assert.equal(layer.status, "info");
  assert.equal(layer.points, 0);
  assert.match(layer.summary, /terms\.txt is published/);
  assert.ok(layer.details.some((d) => d.startsWith("train-ai:")));
  assert.ok(layer.details.includes("Responded 402 Payment Required"));
});

test("layer: unparseable file says so without scoring", () => {
  const layer = termsTxtLayer(null, true);
  assert.equal(layer.status, "info");
  assert.equal(layer.points, 0);
  assert.match(layer.summary, /could not be parsed/);
});
