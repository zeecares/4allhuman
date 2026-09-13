/**
 * CLI tests - argument parsing, report rendering, JSON output, and the
 * exit-code contract (0 ok / 1 below --fail-below / 2 usage or unreachable).
 * runCli takes an injected scan function, so no network is touched.
 * Runs with `npm test` (node:test + type stripping, zero dependencies).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CliUsageError,
  EXIT_BELOW_THRESHOLD,
  EXIT_ERROR,
  EXIT_OK,
  formatReport,
  parseArgs,
  runCli,
  statusLabel,
} from "../src/cli.ts";
import type { LayerResult } from "../src/lib/layers.ts";
import type { ScanResult } from "../src/lib/scanner.ts";

// ── helpers ─────────────────────────────────────────────────────────────────

function layer(
  id: LayerResult["id"],
  name: string,
  status: LayerResult["status"],
  points: number,
  maxPoints: number,
  summary = "summary line",
  details: string[] = [],
): LayerResult {
  return { id, name, status, summary, details, points, maxPoints };
}

function fakeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    url: "https://example.com",
    reachable: true,
    robotsFound: true,
    blockedCrawlers: ["GPTBot", "ClaudeBot"],
    openCrawlers: ["CCBot"],
    verdicts: [],
    metaTagsFound: ["noai"],
    aiTxtFound: false,
    xRobotsTagHeaders: [],
    tdm: { reserved: false, policy: null, sources: [] },
    llmsTxtFound: false,
    aiPrefSignals: [],
    cloudflare: {
      isCloudflare: false,
      riskLevel: "SKIPPED",
      googleExtendedStatus: null,
      scoreDelta: 0,
      headline: "Not behind Cloudflare",
      detail: "This site is not proxied through Cloudflare.",
      remediation: null,
    },
    layers: [
      layer("robots", "robots.txt (RFC 9309)", "partial", 9, 40, "2/3 known AI crawlers blocked - 1 can still crawl for training.", [
        "Evaluated with full RFC 9309 matching.",
      ]),
      layer("headers", "X-Robots-Tag header", "absent", 0, 15, "No X-Robots-Tag response header on the homepage."),
      layer("meta", "noai meta tags", "partial", 8, 15, "noai present, noimageai missing."),
      layer("reachable", "Verifiability", "info", 5, 5, "The site answered our scan."),
    ],
    scannedAt: "2026-09-09T17:00:00.000Z",
    ...overrides,
  };
}

type Captured = { out: string[]; err: string[] };
function capture(): { captured: Captured; stdout: (s: string) => void; stderr: (s: string) => void } {
  const captured: Captured = { out: [], err: [] };
  return {
    captured,
    stdout: (s) => captured.out.push(s),
    stderr: (s) => captured.err.push(s),
  };
}

// ── parseArgs ───────────────────────────────────────────────────────────────

test("parseArgs: bare domain", () => {
  const args = parseArgs(["audit", "example.com"]);
  assert.equal(args.command, "audit");
  assert.equal(args.target, "example.com");
  assert.equal(args.json, false);
  assert.equal(args.failBelow, null);
  assert.equal(args.timeoutMs, 8000);
});

test("parseArgs: full URL with flags, both space and = forms", () => {
  const a = parseArgs(["audit", "https://example.com/path", "--json", "--fail-below", "50", "--timeout", "5000"]);
  assert.equal(a.target, "https://example.com/path");
  assert.equal(a.json, true);
  assert.equal(a.failBelow, 50);
  assert.equal(a.timeoutMs, 5000);

  const b = parseArgs(["audit", "example.com", "--fail-below=75", "--timeout=3000"]);
  assert.equal(b.failBelow, 75);
  assert.equal(b.timeoutMs, 3000);
});

test("parseArgs: missing command, missing target, unknown command", () => {
  assert.throws(() => parseArgs([]), CliUsageError);
  assert.throws(() => parseArgs(["audit"]), /Missing target/);
  assert.throws(() => parseArgs(["scan", "example.com"]), /Unknown command/);
});

test("parseArgs: unknown options and bad values are usage errors", () => {
  assert.throws(() => parseArgs(["audit", "example.com", "--nope"]), /Unknown option/);
  assert.throws(() => parseArgs(["audit", "example.com", "--fail-below", "abc"]), /--fail-below/);
  assert.throws(() => parseArgs(["audit", "example.com", "--fail-below", "101"]), /--fail-below/);
  assert.throws(() => parseArgs(["audit", "example.com", "--fail-below", "-1"]), /--fail-below/);
  assert.throws(() => parseArgs(["audit", "example.com", "--timeout", "0"]), /--timeout/);
  assert.throws(() => parseArgs(["audit", "example.com", "--fail-below"]), /needs a value/);
  assert.throws(() => parseArgs(["audit", "example.com", "extra"]), /Unexpected extra argument/);
});

test("parseArgs: --help short-circuits validation", () => {
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["audit", "--help"]).help, true);
});

// ── statusLabel / formatReport ─────────────────────────────────────────────

test("statusLabel maps every layer status", () => {
  assert.equal(statusLabel("protected"), "PROTECTED");
  assert.equal(statusLabel("partial"), "PARTIAL");
  assert.equal(statusLabel("absent"), "MISSING");
  assert.equal(statusLabel("info"), "NOTE");
});

test("formatReport: labels, per-layer points, evidence, total score", () => {
  const report = formatReport(fakeScanResult());
  assert.match(report, /4allhuman audit - https:\/\/example\.com/);
  assert.match(report, /\[PARTIAL\]\s+robots\.txt \(RFC 9309\) - 9\/40/);
  assert.match(report, /\[MISSING\]\s+X-Robots-Tag header - 0\/15/);
  assert.match(report, /\[NOTE\]\s+Verifiability - 5\/5/);
  assert.match(report, /2\/3 known AI crawlers blocked/);
  assert.match(report, /Evaluated with full RFC 9309 matching\./);
  assert.match(report, /Score: 22\/100/);
  assert.match(report, /Next step:/);
});

test("formatReport: a perfect score drops the next-step nudge", () => {
  const perfect = fakeScanResult({
    layers: [layer("robots", "robots.txt (RFC 9309)", "protected", 40, 40)],
  });
  const report = formatReport(perfect);
  assert.match(report, /Score: 40\/100/);
  // 40/100 < 100 so the nudge stays; use a full 100 to check it disappears.
  assert.match(report, /Next step:/);
  const full = fakeScanResult({
    layers: [
      layer("robots", "robots.txt (RFC 9309)", "protected", 40, 40),
      layer("headers", "X-Robots-Tag header", "protected", 15, 15),
      layer("meta", "noai meta tags", "protected", 15, 15),
      layer("tdmrep", "TDMRep", "protected", 10, 10),
      layer("aitxt", "ai.txt", "protected", 10, 10),
      layer("aipref", "aipref", "protected", 5, 5),
      layer("reachable", "Verifiability", "info", 5, 5),
    ],
  });
  assert.doesNotMatch(formatReport(full), /Next step:/);
  assert.match(formatReport(full), /Score: 100\/100/);
});

// ── runCli exit codes ───────────────────────────────────────────────────────

test("runCli: healthy audit prints the report and exits 0", async () => {
  const { captured, stdout, stderr } = capture();
  const code = await runCli(["audit", "example.com"], { scan: async () => fakeScanResult(), stdout, stderr });
  assert.equal(code, EXIT_OK);
  assert.equal(captured.err.length, 0);
  assert.match(captured.out[0], /Score: 22\/100/);
});

test("runCli: scan receives the parsed timeout", async () => {
  let seen: unknown;
  const code = await runCli(["audit", "example.com", "--timeout", "1234"], {
    scan: async (_url, opts) => {
      seen = opts;
      return fakeScanResult();
    },
    stdout: () => {},
    stderr: () => {},
  });
  assert.equal(code, EXIT_OK);
  assert.deepEqual(seen, { timeoutMs: 1234 });
});

test("runCli --json: machine-readable report with score fields", async () => {
  const { captured, stdout, stderr } = capture();
  const code = await runCli(["audit", "example.com", "--json"], {
    scan: async () => fakeScanResult(),
    stdout,
    stderr,
  });
  assert.equal(code, EXIT_OK);
  const parsed = JSON.parse(captured.out[0]);
  assert.equal(parsed.url, "https://example.com");
  assert.equal(parsed.score, 22);
  assert.equal(parsed.maxScore, 100);
  assert.equal(parsed.reachable, true);
  assert.ok(Array.isArray(parsed.layers));
  assert.deepEqual(parsed.blockedCrawlers, ["GPTBot", "ClaudeBot"]);
});

test("runCli --fail-below: exit 1 below the threshold, 0 at or above it", async () => {
  const below = capture();
  const codeBelow = await runCli(["audit", "example.com", "--fail-below", "50"], {
    scan: async () => fakeScanResult(),
    stdout: below.stdout,
    stderr: below.stderr,
  });
  assert.equal(codeBelow, EXIT_BELOW_THRESHOLD);
  assert.match(below.captured.err.join("\n"), /below --fail-below 50/);

  const met = capture();
  const codeMet = await runCli(["audit", "example.com", "--fail-below", "22"], {
    scan: async () => fakeScanResult(),
    stdout: met.stdout,
    stderr: met.stderr,
  });
  assert.equal(codeMet, EXIT_OK);
  assert.equal(met.captured.err.length, 0);
});

test("runCli: unreachable site exits 2 with a clear warning", async () => {
  const { captured, stdout, stderr } = capture();
  const code = await runCli(["audit", "nope.invalid"], {
    scan: async () => fakeScanResult({ reachable: false }),
    stdout,
    stderr,
  });
  assert.equal(code, EXIT_ERROR);
  assert.match(captured.err.join("\n"), /could not reach/);
});

test("runCli: a scan that throws exits 2 with the error message", async () => {
  const { captured, stdout, stderr } = capture();
  const code = await runCli(["audit", "!!!"], {
    scan: async () => {
      throw new Error("Invalid URL: !!!");
    },
    stdout,
    stderr,
  });
  assert.equal(code, EXIT_ERROR);
  assert.match(captured.err.join("\n"), /Invalid URL/);
});

test("runCli: usage errors exit 2 and print usage to stderr", async () => {
  const { captured, stdout, stderr } = capture();
  const code = await runCli(["audit"], { stdout, stderr });
  assert.equal(code, EXIT_ERROR);
  assert.match(captured.err.join("\n"), /Missing target/);
  assert.match(captured.err.join("\n"), /Usage:/);
  assert.equal(captured.out.length, 0);
});

test("runCli: --help prints usage to stdout and exits 0", async () => {
  const { captured, stdout, stderr } = capture();
  const code = await runCli(["--help"], { stdout, stderr });
  assert.equal(code, EXIT_OK);
  assert.match(captured.out[0], /4allhuman audit <domain-or-url>/);
});

test("runCli: --version prints the injected version", async () => {
  const { captured, stdout, stderr } = capture();
  const code = await runCli(["--version"], { stdout, stderr, version: "0.1.0" });
  assert.equal(code, EXIT_OK);
  assert.equal(captured.out[0], "0.1.0");
});
