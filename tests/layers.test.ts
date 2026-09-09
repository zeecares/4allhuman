/**
 * Multi-layer audit tests — X-Robots-Tag parsing, TDMRep detection (header
 * and meta forms, attribute order), aipref tokens, layer verdicts and the
 * score arithmetic over them. Runs with `npm test` (node:test + type
 * stripping, zero dependencies).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCORE_MAX,
  aiPrefLayer,
  aiTxtLayer,
  detectAiPref,
  detectTdmRep,
  extractMetaTags,
  headersLayer,
  llmsTxtLayer,
  metaLayer,
  parseXRobotsTag,
  reachableLayer,
  robotsLayer,
  scoreFromLayers,
  tdmRepLayer,
} from "../src/lib/layers.ts";

// ── X-Robots-Tag parsing ────────────────────────────────────────────────────

test("bare directives apply globally and are lowercased", () => {
  const rules = parseXRobotsTag(["NoAI, NoImageAI"]);
  assert.deepEqual(rules, [
    { userAgent: null, directive: "noai" },
    { userAgent: null, directive: "noimageai" },
  ]);
});

test("per-bot scoping is extracted from the prefix", () => {
  const rules = parseXRobotsTag(["GPTBot: noai"]);
  assert.deepEqual(rules, [{ userAgent: "GPTBot", directive: "noai" }]);
});

test("multiple header values merge", () => {
  const rules = parseXRobotsTag(["noarchive", "ClaudeBot: noai, noimageai"]);
  assert.deepEqual(rules, [
    { userAgent: null, directive: "noarchive" },
    { userAgent: "ClaudeBot", directive: "noai" },
    { userAgent: null, directive: "noimageai" },
  ]);
});

// ── headers layer verdicts ──────────────────────────────────────────────────

test("global noai => protected, full points", () => {
  const layer = headersLayer(["noai, noimageai"]);
  assert.equal(layer.status, "protected");
  assert.equal(layer.points, layer.maxPoints);
});

test("per-bot noai only => partial credit", () => {
  const layer = headersLayer(["GPTBot: noai"]);
  assert.equal(layer.status, "partial");
  assert.equal(layer.points, Math.round(layer.maxPoints / 2));
});

test("none/noindex is partial — an indexing block, not an AI opt-out", () => {
  const layer = headersLayer(["none"]);
  assert.equal(layer.status, "partial");
});

test("unrelated directives => absent; no header => absent", () => {
  assert.equal(headersLayer(["nofollow"]).status, "absent");
  const none = headersLayer([]);
  assert.equal(none.status, "absent");
  assert.equal(none.points, 0);
});

// ── meta tags ───────────────────────────────────────────────────────────────

test("extractMetaTags finds noai/noimageai on the robots meta", () => {
  const html = '<html><head><meta name="robots" content="noai, noimageai"></head></html>';
  assert.deepEqual(extractMetaTags(html), ["noai", "noimageai"]);
  assert.equal(metaLayer(["noai"]).status, "protected");
  assert.equal(metaLayer([]).status, "absent");
});

// ── TDMRep ──────────────────────────────────────────────────────────────────

test("tdm-reservation: 1 header => protected", () => {
  const tdm = detectTdmRep({ headerValues: ["1"] });
  assert.equal(tdm.reserved, true);
  assert.deepEqual(tdm.sources, ["http-header"]);
  assert.equal(tdmRepLayer(tdm).status, "protected");
});

test("tdm-reservation meta with reversed attribute order still counts", () => {
  const html = '<meta content="1" name="tdm-reservation">';
  const tdm = detectTdmRep({ html });
  assert.equal(tdm.reserved, true);
  assert.deepEqual(tdm.sources, ["html-meta"]);
});

test("tdm-policy alone is partial; absent otherwise", () => {
  const policyOnly = detectTdmRep({
    html: '<meta name="tdm-policy" content="https://example.com/tdm-policy.json">',
  });
  assert.equal(policyOnly.reserved, false);
  assert.equal(policyOnly.policy, "https://example.com/tdm-policy.json");
  assert.equal(tdmRepLayer(policyOnly).status, "partial");
  assert.equal(tdmRepLayer(detectTdmRep({})).status, "absent");
});

// ── aipref ──────────────────────────────────────────────────────────────────

test("aipref tokens detected; a refusal earns the draft's credit", () => {
  const signals = detectAiPref(['X-Robots-Tag: ai-train=n', "<html>ai-input=yes</html>"]);
  assert.deepEqual(signals.sort(), ["ai-input=yes", "ai-train=n"]);
  assert.equal(aiPrefLayer(["ai-train=n"]).status, "partial");
  assert.equal(aiPrefLayer(["ai-train=n"]).points, 5);
  assert.equal(aiPrefLayer(["ai-train=y"]).status, "info");
  assert.equal(aiPrefLayer([]).status, "absent");
});

// ── ai.txt / llms.txt / robots / reachable ──────────────────────────────────

test("ai.txt must actually deny training to score", () => {
  assert.equal(aiTxtLayer(true, "User-Agent: *\nPermission: deny-training").status, "protected");
  assert.equal(aiTxtLayer(true, "hello world").status, "info");
  assert.equal(aiTxtLayer(false).status, "absent");
});

test("llms.txt is informational only — allow-side, zero points either way", () => {
  for (const found of [true, false]) {
    const layer = llmsTxtLayer(found);
    assert.equal(layer.status, "info");
    assert.equal(layer.points, 0);
    assert.equal(layer.maxPoints, 0);
  }
});

test("robots layer scales with crawler coverage", () => {
  const full = robotsLayer({ blockedCount: 174, totalCrawlers: 174, robotsFound: true });
  assert.equal(full.status, "protected");
  assert.equal(full.points, 40);
  const half = robotsLayer({ blockedCount: 87, totalCrawlers: 174, robotsFound: true });
  assert.equal(half.status, "partial");
  assert.equal(half.points, 20);
  assert.equal(robotsLayer({ blockedCount: 0, totalCrawlers: 174, robotsFound: false }).status, "absent");
});

// ── score arithmetic ────────────────────────────────────────────────────────

test("a fully protected site scores exactly 100; weights sum to SCORE_MAX", () => {
  assert.equal(SCORE_MAX, 100);
  const layers = [
    robotsLayer({ blockedCount: 174, totalCrawlers: 174, robotsFound: true }),
    headersLayer(["noai"]),
    metaLayer(["noai"]),
    tdmRepLayer({ reserved: true, policy: null, sources: ["http-header"] }),
    aiTxtLayer(true, "Permission: deny-training"),
    llmsTxtLayer(false),
    aiPrefLayer(["ai-train=n"]),
    reachableLayer(true),
  ];
  const { score, breakdown } = scoreFromLayers(layers);
  assert.equal(score, 100);
  assert.equal(breakdown.length, layers.length);
  assert.deepEqual(
    breakdown.map((b) => b.got),
    layers.map((l) => l.points),
  );
});

test("a bare domain scores only the reachability points", () => {
  const layers = [
    robotsLayer({ blockedCount: 0, totalCrawlers: 174, robotsFound: false }),
    headersLayer([]),
    metaLayer([]),
    tdmRepLayer({ reserved: false, policy: null, sources: [] }),
    aiTxtLayer(false),
    llmsTxtLayer(false),
    aiPrefLayer([]),
    reachableLayer(true),
  ];
  assert.equal(scoreFromLayers(layers).score, 5);
});
