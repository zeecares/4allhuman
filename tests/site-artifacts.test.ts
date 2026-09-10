/**
 * Site self-protection artifacts - the audit's own generated output deployed
 * on 4allhuman.vercel.app itself (dogfooding). Guards against drift: if these
 * artifacts rot, the site's own audit score drops.
 * Runs with `npm test` (node:test + type stripping, zero dependencies).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_CRAWLERS } from "../src/lib/crawlers.ts";
import { evaluateCrawlers } from "../src/lib/scanner.ts";
import { makeCanaryId } from "../src/lib/canary.ts";

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("public/robots.txt blocks every known AI crawler", () => {
  const verdicts = evaluateCrawlers(read("public/robots.txt"));
  assert.equal(verdicts.length, AI_CRAWLERS.length);
  assert.deepEqual(
    verdicts.filter((v) => v.allowed),
    [],
  );
});

test("robots.txt carries the RSL license pointer", () => {
  assert.match(read("public/robots.txt"), /^License: https:\/\/4allhuman\.vercel\.app\/license\.xml$/m);
});

test("public/license.xml is the RSL 1.0 no-training license", () => {
  assert.match(read("public/license.xml"), /<prohibits type="usage">ai-train ai-input<\/prohibits>/);
});

test("public/ai.txt denies training and dataset use and reserves Art. 4(3) rights", () => {
  const ai = read("public/ai.txt");
  assert.match(ai, /Permission: deny-training/);
  assert.match(ai, /Permission: deny-dataset/);
  assert.match(ai, /Article 4\(3\)/);
});

test("public/tdm-policy.txt publishes the reserved-rights notice", () => {
  assert.match(read("public/tdm-policy.txt"), /reserves all rights/);
});

const SITE_CANARY = makeCanaryId("4allhuman.vercel.app", "2026-09-10");

test("site canary is embedded in both /canary.txt and the root layout", () => {
  assert.match(read("public/canary.txt"), new RegExp(`content-fingerprint: ${SITE_CANARY}`));
  assert.match(read("src/app/layout.tsx"), new RegExp(SITE_CANARY));
});

test("next.config.mjs serves the HTTP-layer opt-outs", () => {
  const conf = read("next.config.mjs");
  assert.match(conf, /X-Robots-Tag/);
  assert.match(conf, /noai, noimageai/);
  assert.match(conf, /tdm-reservation/);
});

test("root layout publishes the meta-layer opt-outs", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /noai, noimageai/);
  assert.match(layout, /tdm-reservation/);
  assert.match(layout, /ai-train=n/);
});
