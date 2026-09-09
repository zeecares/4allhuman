#!/usr/bin/env node
/**
 * 4allhuman CLI entry point. Zero dependencies; runs under Node >= 22.18
 * (flagless TypeScript type stripping). All logic lives in src/cli.ts so it
 * stays testable - this wrapper only wires argv/stdout/exit code.
 */
import { existsSync, readFileSync } from "node:fs";
import { runCli } from "../src/cli.ts";

// Source layout: bin/../package.json. Compiled (dist/) layout: dist/bin/../../package.json.
const pkgUrl = ["../package.json", "../../package.json"]
  .map((p) => new URL(p, import.meta.url))
  .find((u) => existsSync(u));
const pkg = (pkgUrl ? JSON.parse(readFileSync(pkgUrl, "utf8")) : {}) as {
  version?: string;
};

process.exitCode = await runCli(process.argv.slice(2), { version: pkg.version ?? "0.0.0" });
