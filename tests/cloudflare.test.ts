/**
 * Cloudflare infrastructure audit tests - header detection, Google-Extended
 * classification, risk levels, and the score-delta contract.
 *
 * The contract that matters: the only scored outcome is robots.txt blocking
 * Googlebot itself (-15). A Cloudflare site without Google-Extended is an
 * UNPENALIZED warning, because the "Block AI bots" dashboard setting that
 * decides whether the Sept 15 change bites is not observable from outside.
 *
 * Runs with `npm test` (node:test + type stripping, zero dependencies).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkCloudflareConfiguration,
  classifyGoogleExtended,
  detectCloudflare,
} from "../src/lib/cloudflare.ts";
import { scoreFromScan } from "../src/lib/generator.ts";
import type { LayerResult } from "../src/lib/layers.ts";
import type { ScanResult } from "../src/lib/scanner.ts";

// ── helpers ─────────────────────────────────────────────────────────────────

const CF_HEADERS = { "cf-ray": "8f00abc123-DUB", server: "cloudflare" };
const PLAIN_HEADERS = { server: "nginx" };

const GE_DISALLOW = "User-agent: Google-Extended\nDisallow: /\n";
const GE_ALLOW = "User-agent: Google-Extended\nAllow: /\n";
const GOOGLEBOT_DISALLOW = "User-agent: Googlebot\nDisallow: /\n";
const NO_GE = "User-agent: *\nDisallow: /private/\n";

function layer(points: number, maxPoints: number): LayerResult {
  return { id: "reachable", name: "Verifiability", status: "info", summary: "s", details: [], points, maxPoints };
}

function fakeScan(cloudflare: ScanResult["cloudflare"], points = 50): ScanResult {
  return {
    url: "https://example.com",
    reachable: true,
    robotsFound: true,
    blockedCrawlers: [],
    openCrawlers: [],
    verdicts: [],
    metaTagsFound: [],
    aiTxtFound: false,
    xRobotsTagHeaders: [],
    tdm: { reserved: false, policy: null, sources: [] },
    llmsTxtFound: false,
    aiPrefSignals: [],
    cloudflare,
    layers: [layer(points, 100)],
    scannedAt: "2026-09-13T00:00:00.000Z",
  };
}

// ── detectCloudflare ────────────────────────────────────────────────────────

test("detectCloudflare: cf-ray header is the primary signal", () => {
  assert.equal(detectCloudflare({ "cf-ray": "8f00abc-DUB" }), true);
});

test("detectCloudflare: header values may be arrays", () => {
  assert.equal(detectCloudflare({ "cf-ray": ["8f00abc-DUB"] }), true);
});

test("detectCloudflare: cf-cache-status alone is enough", () => {
  assert.equal(detectCloudflare({ "cf-cache-status": "HIT" }), true);
});

test("detectCloudflare: server: cloudflare, case-insensitive", () => {
  assert.equal(detectCloudflare({ server: "Cloudflare" }), true);
});

test("detectCloudflare: plain headers and empty object are not Cloudflare", () => {
  assert.equal(detectCloudflare(PLAIN_HEADERS), false);
  assert.equal(detectCloudflare({}), false);
});

// ── classifyGoogleExtended ──────────────────────────────────────────────────

test("classify: null robots.txt is MISSING", () => {
  assert.equal(classifyGoogleExtended(null), "MISSING");
});

test("classify: Google-Extended Disallow: / is CORRECT", () => {
  assert.equal(classifyGoogleExtended(GE_DISALLOW), "CORRECT");
});

test("classify: Google-Extended Allow: / is ALLOW", () => {
  assert.equal(classifyGoogleExtended(GE_ALLOW), "ALLOW");
});

test("classify: Google-Extended group with no root rule is MISSING", () => {
  assert.equal(
    classifyGoogleExtended("User-agent: Google-Extended\nDisallow: /ai-training-data/\n"),
    "MISSING",
  );
});

test("classify: Googlebot Disallow: / is DANGEROUS", () => {
  assert.equal(classifyGoogleExtended(GOOGLEBOT_DISALLOW), "DANGEROUS");
});

test("classify: no Google-Extended and Googlebot allowed is MISSING", () => {
  assert.equal(classifyGoogleExtended(NO_GE), "MISSING");
});

test("classify: Google-Extended wins over a blocked Googlebot", () => {
  assert.equal(classifyGoogleExtended(GE_DISALLOW + "\n" + GOOGLEBOT_DISALLOW), "CORRECT");
});

test("classify: wildcard-only robots.txt leaves Google-Extended MISSING when / is allowed", () => {
  assert.equal(classifyGoogleExtended("User-agent: *\nDisallow: /private/\n"), "MISSING");
});

// ── checkCloudflareConfiguration ────────────────────────────────────────────

test("check: non-Cloudflare site is SKIPPED with no score delta", () => {
  const r = checkCloudflareConfiguration(PLAIN_HEADERS, null);
  assert.equal(r.isCloudflare, false);
  assert.equal(r.riskLevel, "SKIPPED");
  assert.equal(r.scoreDelta, 0);
  assert.equal(r.remediation, null);
});

test("check: Cloudflare + Google-Extended correct is GOOD with no score delta", () => {
  const r = checkCloudflareConfiguration(CF_HEADERS, GE_DISALLOW);
  assert.equal(r.riskLevel, "GOOD");
  assert.equal(r.googleExtendedStatus, "CORRECT");
  assert.equal(r.scoreDelta, 0);
});

test("check: Cloudflare + missing Google-Extended is an UNPENALIZED warning", () => {
  const r = checkCloudflareConfiguration(CF_HEADERS, NO_GE);
  assert.equal(r.riskLevel, "WARNING");
  assert.equal(r.scoreDelta, 0, "dashboard setting is unobservable - never deduct for it");
  assert.ok(r.remediation && r.remediation.length >= 2, "warning ships remediation steps");
  assert.match(r.headline, /Tuesday, September 15/);
});

test("check: Cloudflare + no robots.txt at all is also the unpenalized warning", () => {
  const r = checkCloudflareConfiguration(CF_HEADERS, null);
  assert.equal(r.riskLevel, "WARNING");
  assert.equal(r.scoreDelta, 0);
});

test("check: Cloudflare + Google-Extended Allow is NEUTRAL", () => {
  const r = checkCloudflareConfiguration(CF_HEADERS, GE_ALLOW);
  assert.equal(r.riskLevel, "NEUTRAL");
  assert.equal(r.scoreDelta, 0);
});

test("check: Googlebot blocked is the ONLY scored case (-15)", () => {
  const r = checkCloudflareConfiguration(CF_HEADERS, GOOGLEBOT_DISALLOW);
  assert.equal(r.riskLevel, "HIGH_RISK");
  assert.equal(r.googleExtendedStatus, "DANGEROUS");
  assert.equal(r.scoreDelta, -15);
  assert.ok(r.remediation && r.remediation.length >= 2);
});

// ── score integration ───────────────────────────────────────────────────────

test("score: HIGH_RISK deducts 15 and adds an explicit adjustment line", () => {
  const cf = checkCloudflareConfiguration(CF_HEADERS, GOOGLEBOT_DISALLOW);
  const result = scoreFromScan(fakeScan(cf, 50));
  assert.equal(result.score, 35);
  const adj = result.breakdown.find((b) => b.label.startsWith("Adjustment:"));
  assert.ok(adj, "adjustment line present");
  assert.equal(adj.got, -15);
});

test("score: WARNING leaves the layer score and breakdown untouched", () => {
  const cf = checkCloudflareConfiguration(CF_HEADERS, NO_GE);
  const result = scoreFromScan(fakeScan(cf, 50));
  assert.equal(result.score, 50);
  assert.equal(result.breakdown.some((b) => b.label.startsWith("Adjustment:")), false);
});

test("score: deduction clamps at 0", () => {
  const cf = checkCloudflareConfiguration(CF_HEADERS, GOOGLEBOT_DISALLOW);
  const result = scoreFromScan(fakeScan(cf, 10));
  assert.equal(result.score, 0);
});
