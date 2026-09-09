/**
 * CLI core for `4allhuman audit <domain>` - the same multi-layer audit the
 * web app runs (src/lib/scanner.ts + src/lib/layers.ts), rendered as a
 * plain-language terminal report. Runtime-agnostic: no Next.js imports, no
 * process.stdout writes outside runCli's injected writers, so it is fully
 * testable and bin/4allhuman.ts stays a thin wrapper. Zero dependencies.
 */
import {
  SCORE_MAX,
  scoreFromLayers,
  type LayerStatus,
} from "./lib/layers.ts";
import { scanSite, type ScanResult } from "./lib/scanner.ts";

/** Audit ran and the score meets --fail-below (if one was given). */
export const EXIT_OK = 0;
/** Audit ran and the score is below --fail-below. */
export const EXIT_BELOW_THRESHOLD = 1;
/** Usage error, or the site could not be reached. */
export const EXIT_ERROR = 2;

const DEFAULT_TIMEOUT_MS = 8000;

export class CliUsageError extends Error {}

export type CliArgs = {
  command: "audit";
  target: string;
  json: boolean;
  failBelow: number | null;
  timeoutMs: number;
  help: boolean;
};

export const USAGE = `4allhuman - audit any site's AI-training opt-out posture

Usage:
  4allhuman audit <domain-or-url> [options]

Options:
  --json                Print the machine-readable report (for CI).
  --fail-below <0-100>  Exit 1 when the score is below this threshold.
  --timeout <ms>        Per-request timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}).
  -h, --help            Show this help.
  -v, --version         Show the version.

Exit codes:
  0  Audit ran; score meets --fail-below (if given).
  1  Audit ran; score below --fail-below.
  2  Usage error, or the site could not be reached.
`;

function readFlagValue(flag: string, inline: string | undefined, argv: string[], i: number): { value: string; consumed: number } {
  if (inline !== undefined) return { value: inline, consumed: 0 };
  const next = argv[i + 1];
  if (next === undefined || next.startsWith("--")) {
    throw new CliUsageError(`${flag} needs a value.`);
  }
  return { value: next, consumed: 1 };
}

function parseScore(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > SCORE_MAX) {
    throw new CliUsageError(`${flag} must be an integer between 0 and ${SCORE_MAX} (got "${raw}").`);
  }
  return n;
}

function parseTimeout(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new CliUsageError(`--timeout must be a positive integer number of milliseconds (got "${raw}").`);
  }
  return n;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: "audit",
    target: "",
    json: false,
    failBelow: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
  };

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "-h" || tok === "--help") {
      args.help = true;
    } else if (tok === "--json") {
      args.json = true;
    } else if (tok.startsWith("--fail-below")) {
      const inline = tok.includes("=") ? tok.slice(tok.indexOf("=") + 1) : undefined;
      if (tok !== "--fail-below" && inline === undefined) throw new CliUsageError(`Unknown option: ${tok}`);
      const { value, consumed } = readFlagValue("--fail-below", inline, argv, i);
      args.failBelow = parseScore(value, "--fail-below");
      i += consumed;
    } else if (tok.startsWith("--timeout")) {
      const inline = tok.includes("=") ? tok.slice(tok.indexOf("=") + 1) : undefined;
      if (tok !== "--timeout" && inline === undefined) throw new CliUsageError(`Unknown option: ${tok}`);
      const { value, consumed } = readFlagValue("--timeout", inline, argv, i);
      args.timeoutMs = parseTimeout(value);
      i += consumed;
    } else if (tok === "-v" || tok === "--version") {
      // Handled by runCli before parseArgs output is used; keep it out of positionals.
    } else if (tok.startsWith("-")) {
      throw new CliUsageError(`Unknown option: ${tok}`);
    } else {
      positional.push(tok);
    }
  }

  const [command, target, ...extra] = positional;
  if (args.help) return args;
  if (command !== "audit") {
    throw new CliUsageError(
      command === undefined ? "Missing command. Expected: audit" : `Unknown command: ${command}. Expected: audit`,
    );
  }
  if (target === undefined) {
    throw new CliUsageError("Missing target. Expected: 4allhuman audit <domain-or-url>");
  }
  if (extra.length > 0) {
    throw new CliUsageError(`Unexpected extra argument: ${extra[0]}`);
  }
  args.target = target;
  return args;
}

/** Terminal label for a layer status, matching the web UI's status rows. */
export function statusLabel(status: LayerStatus): string {
  switch (status) {
    case "protected":
      return "PROTECTED";
    case "partial":
      return "PARTIAL";
    case "absent":
      return "MISSING";
    case "info":
      return "NOTE";
  }
}

/** Human-readable audit report: one block per layer, evidence indented. */
export function formatReport(scan: ScanResult): string {
  const { score } = scoreFromLayers(scan.layers);
  const lines: string[] = [];
  lines.push(`4allhuman audit - ${scan.url}`);
  lines.push(`Scanned ${scan.scannedAt}`);
  lines.push("");
  for (const layer of scan.layers) {
    const label = `[${statusLabel(layer.status)}]`.padEnd(11);
    lines.push(`${label} ${layer.name} - ${layer.points}/${layer.maxPoints}`);
    lines.push(`  ${layer.summary}`);
    for (const detail of layer.details) lines.push(`  ${detail}`);
  }
  lines.push("");
  lines.push(`Score: ${score}/${SCORE_MAX}`);
  if (score < SCORE_MAX) {
    lines.push(
      "Next step: deploy the generated artifacts (robots.txt, ai.txt, meta tags) to close the missing layers above.",
    );
  }
  return lines.join("\n");
}

export type CliDeps = {
  /** Override the live scan (tests inject a fake). */
  scan?: typeof scanSite;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /** Printed by --version; bin/4allhuman.ts passes the package version. */
  version?: string;
};

export async function runCli(argv: string[], deps: CliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? ((line: string) => console.log(line));
  const stderr = deps.stderr ?? ((line: string) => console.error(line));
  const scan = deps.scan ?? scanSite;

  if (argv.includes("-v") || argv.includes("--version")) {
    stdout(deps.version ?? "0.0.0");
    return EXIT_OK;
  }

  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (err instanceof CliUsageError) {
      stderr(`Error: ${err.message}`);
      stderr(USAGE);
      return EXIT_ERROR;
    }
    throw err;
  }
  if (args.help) {
    stdout(USAGE);
    return EXIT_OK;
  }

  let result: ScanResult;
  try {
    result = await scan(args.target, { timeoutMs: args.timeoutMs });
  } catch (err) {
    stderr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT_ERROR;
  }

  const { score } = scoreFromLayers(result.layers);

  if (args.json) {
    stdout(
      JSON.stringify(
        {
          ...result,
          score,
          maxScore: SCORE_MAX,
        },
        null,
        2,
      ),
    );
  } else {
    stdout(formatReport(result));
  }

  if (!result.reachable) {
    stderr(`Warning: could not reach ${result.url} - check the domain is correct and the site is up.`);
    stderr("The score above is worst-case; the generated fixes remain valid.");
    return EXIT_ERROR;
  }
  if (args.failBelow !== null && score < args.failBelow) {
    stderr(`Score ${score}/${SCORE_MAX} is below --fail-below ${args.failBelow}.`);
    return EXIT_BELOW_THRESHOLD;
  }
  return EXIT_OK;
}
