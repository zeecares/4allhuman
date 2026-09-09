/**
 * RFC 9309 matcher tests — group semantics, longest-match, ties, wildcards,
 * percent-encoding, and the "no group matched" fallbacks. Runs with
 * `npm test` (node:test + type stripping, zero dependencies).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeOctets,
  explain,
  governingGroup,
  isAllowed,
  parseRobots,
  patternMatches,
  winningRule,
} from "../src/lib/robots9309.ts";

// ── parsing & group semantics ───────────────────────────────────────────────

test("consecutive user-agent lines form one group; a rule ends the agent block", () => {
  const parsed = parseRobots(
    ["User-agent: GPTBot", "User-agent: ClaudeBot", "Disallow: /"].join("\n"),
  );
  assert.equal(parsed.groups.length, 1);
  assert.deepEqual(parsed.groups[0].agents, ["GPTBot", "ClaudeBot"]);
  assert.equal(parsed.groups[0].rules.length, 1);
});

test("a user-agent line after a rule starts a new group", () => {
  const parsed = parseRobots(
    ["User-agent: GPTBot", "Disallow: /", "User-agent: ClaudeBot", "Disallow: /private"].join("\n"),
  );
  assert.equal(parsed.groups.length, 2);
  assert.equal(isAllowed(parsed, "GPTBot", "/"), false);
  assert.equal(isAllowed(parsed, "ClaudeBot", "/"), true);
  assert.equal(isAllowed(parsed, "ClaudeBot", "/private/x"), false);
});

test("comments, blank lines, and CRLF are handled; sitemaps are global", () => {
  const parsed = parseRobots(
    "# header comment\r\n\r\nUser-agent: GPTBot # trailing comment\r\nDisallow: / # block\r\nSitemap: https://x.test/sitemap.xml\r\n",
  );
  assert.equal(parsed.groups.length, 1);
  assert.equal(isAllowed(parsed, "GPTBot", "/anything"), false);
  assert.deepEqual(parsed.sitemaps, ["https://x.test/sitemap.xml"]);
});

test("unknown fields end the agent block but add no rules", () => {
  const parsed = parseRobots(
    ["User-agent: GPTBot", "Crawl-delay: 10", "User-agent: ClaudeBot", "Disallow: /"].join("\n"),
  );
  assert.equal(parsed.groups.length, 2);
  assert.equal(isAllowed(parsed, "GPTBot", "/"), true);
  assert.equal(isAllowed(parsed, "ClaudeBot", "/"), false);
});

// ── user-agent group selection ──────────────────────────────────────────────

test("the most specific (longest) matching user-agent group wins over *", () => {
  const parsed = parseRobots(
    ["User-agent: *", "Disallow: /", "User-agent: GPTBot", "Disallow:"].join("\n"),
  );
  const group = governingGroup(parsed, "GPTBot");
  assert.deepEqual(group?.agents, ["GPTBot"]);
  // GPTBot's own group has an empty Disallow (= allow all), so *'s full
  // block does NOT apply to it.
  assert.equal(isAllowed(parsed, "GPTBot", "/"), true);
  assert.equal(isAllowed(parsed, "OtherBot", "/"), false);
});

test("longer token beats shorter token for the same crawler", () => {
  const parsed = parseRobots(
    [
      "User-agent: GPT",
      "Disallow: /",
      "User-agent: GPTBot",
      "Disallow: /limited",
    ].join("\n"),
  );
  const group = governingGroup(parsed, "GPTBot");
  assert.deepEqual(group?.agents, ["GPTBot"]);
  assert.equal(isAllowed(parsed, "GPTBot", "/"), true);
  assert.equal(isAllowed(parsed, "GPTBot", "/limited/x"), false);
});

test("user-agent matching is case-insensitive and tolerates version suffixes", () => {
  const parsed = parseRobots(["User-agent: gptbot", "Disallow: /"].join("\n"));
  assert.equal(isAllowed(parsed, "GPTBot", "/"), false);
  assert.equal(isAllowed(parsed, "GPTBot/1.2", "/"), false);
});

test("multiple groups with the same user-agent token are merged", () => {
  const parsed = parseRobots(
    [
      "User-agent: GPTBot",
      "Disallow: /a",
      "User-agent: GPTBot",
      "Disallow: /b",
    ].join("\n"),
  );
  const group = governingGroup(parsed, "GPTBot");
  assert.equal(group?.rules.length, 2);
  assert.equal(isAllowed(parsed, "GPTBot", "/a"), false);
  assert.equal(isAllowed(parsed, "GPTBot", "/b"), false);
  assert.equal(isAllowed(parsed, "GPTBot", "/c"), true);
});

test("no matching group and no * group means everything is allowed", () => {
  const parsed = parseRobots(["User-agent: ClaudeBot", "Disallow: /"].join("\n"));
  assert.equal(governingGroup(parsed, "GPTBot"), null);
  assert.equal(isAllowed(parsed, "GPTBot", "/"), true);
});

// ── longest-match & tie-breaking ────────────────────────────────────────────

test("longest matching rule wins over shorter rules", () => {
  const parsed = parseRobots(
    ["User-agent: GPTBot", "Disallow: /admin", "Allow: /admin/public"].join("\n"),
  );
  assert.equal(isAllowed(parsed, "GPTBot", "/admin/secret"), false);
  assert.equal(isAllowed(parsed, "GPTBot", "/admin/public/report"), true);
});

test("on equal-length matches, allow beats disallow", () => {
  const parsed = parseRobots(
    ["User-agent: GPTBot", "Disallow: /docs", "Allow: /docs"].join("\n"),
  );
  assert.equal(isAllowed(parsed, "GPTBot", "/docs/page"), true);
  // and the reverse order gives the same result
  const flipped = parseRobots(
    ["User-agent: GPTBot", "Allow: /docs", "Disallow: /docs"].join("\n"),
  );
  assert.equal(isAllowed(flipped, "GPTBot", "/docs/page"), true);
});

test("an empty Disallow value is not a rule and blocks nothing", () => {
  const parsed = parseRobots(["User-agent: GPTBot", "Disallow:"].join("\n"));
  assert.equal(isAllowed(parsed, "GPTBot", "/"), true);
  assert.equal(winningRule(parsed.groups[0].rules, "/"), null);
});

// ── wildcards ───────────────────────────────────────────────────────────────

test("* matches any sequence, including slashes and the empty string", () => {
  assert.equal(patternMatches("/*.php", "/index.php"), true);
  assert.equal(patternMatches("/*.php", "/deeply/nested/file.php"), true);
  assert.equal(patternMatches("/x*", "/x"), true);
  assert.equal(patternMatches("/x*", "/xyz"), true);
  assert.equal(patternMatches("/*", "/anything/at/all"), true);
});

test("$ anchors the match to the end of the path", () => {
  assert.equal(patternMatches("/*.php$", "/index.php"), true);
  assert.equal(patternMatches("/*.php$", "/index.php.bak"), false);
  assert.equal(patternMatches("/fish$", "/fish"), true);
  assert.equal(patternMatches("/fish$", "/fish/heads"), false);
});

test("$ in the middle of a pattern is a literal character", () => {
  assert.equal(patternMatches("/a$b", "/a$b"), true);
  assert.equal(patternMatches("/a$b", "/axb"), false);
});

test("full-site wildcard Disallow blocks everything", () => {
  const parsed = parseRobots(["User-agent: GPTBot", "Disallow: /*"].join("\n"));
  assert.equal(isAllowed(parsed, "GPTBot", "/"), false);
  assert.equal(isAllowed(parsed, "GPTBot", "/any/path"), false);
});

// ── percent-encoding & case ─────────────────────────────────────────────────

test("percent-encoded octets are decoded before matching", () => {
  assert.equal(decodeOctets("/caf%C3%A9"), "/café");
  const parsed = parseRobots(["User-agent: GPTBot", "Disallow: /caf%C3%A9"].join("\n"));
  assert.equal(isAllowed(parsed, "GPTBot", "/caf%C3%A9/menu"), false);
  assert.equal(isAllowed(parsed, "GPTBot", "/café/menu"), false);
});

test("%2F and %25 are never decoded into real separators", () => {
  assert.equal(decodeOctets("/a%2Fb"), "/a%2Fb");
  assert.equal(decodeOctets("/100%25"), "/100%25");
  const parsed = parseRobots(["User-agent: GPTBot", "Disallow: /a%2Fb"].join("\n"));
  // the encoded slash must not become a path separator
  assert.equal(isAllowed(parsed, "GPTBot", "/a/b"), true);
  assert.equal(isAllowed(parsed, "GPTBot", "/a%2Fb"), false);
});

test("path comparison is case-sensitive", () => {
  const parsed = parseRobots(["User-agent: GPTBot", "Disallow: /Admin"].join("\n"));
  assert.equal(isAllowed(parsed, "GPTBot", "/Admin/panel"), false);
  assert.equal(isAllowed(parsed, "GPTBot", "/admin/panel"), true);
});

// ── explainable verdicts ────────────────────────────────────────────────────

test("explain names the deciding rule and line for a block", () => {
  const parsed = parseRobots(
    ["# hello", "User-agent: GPTBot", "Disallow: /"].join("\n"),
  );
  const v = explain(parsed, "GPTBot", "/");
  assert.equal(v.allowed, false);
  assert.equal(v.rule?.line, 3);
  assert.match(v.reason, /Disallow: \//);
  assert.match(v.reason, /line 3/);
});

test("explain reports unrestricted crawlers plainly", () => {
  const parsed = parseRobots(["User-agent: ClaudeBot", "Disallow: /"].join("\n"));
  const v = explain(parsed, "GPTBot", "/");
  assert.equal(v.allowed, true);
  assert.match(v.reason, /nothing restricts/i);
});

test("explain reports a group whose rules do not match the path", () => {
  const parsed = parseRobots(["User-agent: GPTBot", "Disallow: /tmp"].join("\n"));
  const v = explain(parsed, "GPTBot", "/");
  assert.equal(v.allowed, true);
  assert.match(v.reason, /none of its rules match/);
});

// ── the scanner's exact question: is "/" blocked? ───────────────────────────

test("real-world mixed file: wildcard block with named-crawler carve-outs", () => {
  const parsed = parseRobots(
    [
      "User-agent: *",
      "Disallow: /admin",
      "Allow: /",
      "",
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "User-agent: CCBot",
      "Disallow: /",
      "",
      "Sitemap: https://example.com/sitemap.xml",
    ].join("\n"),
  );
  assert.equal(isAllowed(parsed, "GPTBot", "/"), false);
  assert.equal(isAllowed(parsed, "CCBot", "/"), false);
  assert.equal(isAllowed(parsed, "Googlebot", "/"), true);
  assert.equal(isAllowed(parsed, "Googlebot", "/admin"), false);
});
