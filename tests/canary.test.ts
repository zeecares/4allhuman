/**
 * Canary engine tests — deterministic minting, embed surfaces, probe shape,
 * and the pasted-answer verdict (including the false-positive story).
 * Runs with `npm test` (node:test + type stripping, zero dependencies).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCanaryArtifacts,
  checkCanary,
  fnv1a,
  makeCanaryId,
} from "../src/lib/canary.ts";

// ── minting ─────────────────────────────────────────────────────────────────

test("canary id is deterministic for the same domain and date", () => {
  assert.equal(makeCanaryId("example.com", "2026-09-10"), makeCanaryId("example.com", "2026-09-10"));
});

test("domain normalization: case, scheme and path do not change the id", () => {
  const a = makeCanaryId("Example.COM", "2026-09-10");
  const b = makeCanaryId("https://example.com/blog", "2026-09-10");
  assert.equal(a, b);
});

test("different dates mint different canaries", () => {
  assert.notEqual(makeCanaryId("example.com", "2026-09-10"), makeCanaryId("example.com", "2026-09-11"));
});

test("different domains mint different canaries", () => {
  assert.notEqual(makeCanaryId("example.com", "2026-09-10"), makeCanaryId("other.com", "2026-09-10"));
});

test("canary id shape is dtom- plus 8 hex chars", () => {
  assert.match(makeCanaryId("example.com", "2026-09-10"), /^dtom-[0-9a-f]{8}$/);
});

test("fnv1a is stable and unsigned", () => {
  assert.equal(fnv1a("dtom:example.com:2026-09-10"), fnv1a("dtom:example.com:2026-09-10"));
  assert.ok(fnv1a("anything") >= 0);
});

// ── artifacts ───────────────────────────────────────────────────────────────

test("artifacts carry the token in both embed surfaces", () => {
  const a = buildCanaryArtifacts("example.com", "2026-09-10");
  assert.ok(a.htmlComment.includes(a.canaryId));
  assert.ok(a.htmlComment.startsWith("<!--") && a.htmlComment.endsWith("-->"));
  assert.ok(a.canaryTxt.includes(a.canaryId));
  assert.ok(a.canaryTxt.includes("minted: 2026-09-10"));
});

test("probes anchor on a token prefix, never the full token", () => {
  const a = buildCanaryArtifacts("example.com", "2026-09-10");
  assert.equal(a.probes.length, 3);
  for (const p of a.probes) {
    assert.ok(p.includes("example.com"));
    assert.ok(!p.includes(a.canaryId), "probe must not leak the full token");
  }
  assert.ok(a.probes[0].includes(a.canaryId.slice(0, 7)));
});

// ── verdicts ────────────────────────────────────────────────────────────────

test("exact token in the report surfaces, case-insensitively", () => {
  const r = checkCanary("dtom-3f9a2b7c", 'The identifier is "DTOM-3F9A2B7C" as far as I can tell.');
  assert.equal(r.surfaced, true);
  assert.equal(r.matchedToken, "dtom-3f9a2b7c");
  assert.match(r.verdict, /^SURFACED/);
});

test("a wrong or partial token does not surface", () => {
  assert.equal(checkCanary("dtom-3f9a2b7c", "I could not find any identifier.").surfaced, false);
  assert.equal(checkCanary("dtom-3f9a2b7c", "It starts with dtom-3f…").surfaced, false);
  assert.equal(checkCanary("dtom-3f9a2b7c", "dtom-3f9a2b7d").surfaced, false);
});

test("verdict carries the honest caveat", () => {
  const r = checkCanary("dtom-3f9a2b7c", "dtom-3f9a2b7c");
  assert.match(r.caveat, /not training alone/);
  assert.match(r.caveat, /never tested in court/);
  const clean = checkCanary("dtom-3f9a2b7c", "no idea");
  assert.match(clean.verdict, /^NOT SURFACED/);
});
