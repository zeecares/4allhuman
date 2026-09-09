#!/usr/bin/env node
/**
 * Regenerates src/lib/crawlers.generated.ts from the community
 * ai.robots.txt dataset (https://github.com/ai-robots-txt/ai.robots.txt).
 *
 * Zero runtime deps - plain Node fetch. Run with:
 *   npm run update:crawlers
 *
 * Curation rules:
 *  - The original hand-researched 19 entries (CURATED below) keep their
 *    curated operator/purpose text and dualUse flags.
 *  - Every other bot from the community dataset is appended, with dualUse
 *    derived from the dataset's function/description text: bots whose role
 *    is search/retrieval or user-initiated fetching (things a site's users
 *    may want to keep) are flagged dualUse; bulk training/data scrapers
 *    are not.
 */

const DATASET_URL =
  "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json";

/** Original curated entries - order and flags preserved from the hand-built list. */
const CURATED = [
  { userAgent: "GPTBot", operator: "OpenAI", purpose: "LLM training data collection" },
  { userAgent: "OAI-SearchBot", operator: "OpenAI", purpose: "ChatGPT Search index", dualUse: true },
  { userAgent: "ChatGPT-User", operator: "OpenAI", purpose: "Real-time user-initiated fetching", dualUse: true },
  { userAgent: "Google-Extended", operator: "Google", purpose: "Gemini / Vertex AI training", dualUse: true },
  { userAgent: "ClaudeBot", operator: "Anthropic", purpose: "LLM training data collection" },
  { userAgent: "Claude-Web", operator: "Anthropic", purpose: "Legacy web fetch" },
  { userAgent: "anthropic-ai", operator: "Anthropic", purpose: "AI assistant fetching" },
  { userAgent: "CCBot", operator: "Common Crawl", purpose: "Open dataset used by many model trainers" },
  { userAgent: "Bytespider", operator: "ByteDance", purpose: "TikTok / Doubao LLM training" },
  { userAgent: "PerplexityBot", operator: "Perplexity", purpose: "Answer engine index + training", dualUse: true },
  { userAgent: "Amazonbot", operator: "Amazon", purpose: "Alexa / Nova training", dualUse: true },
  { userAgent: "Applebot-Extended", operator: "Apple", purpose: "Apple Intelligence training (opt-in for Siri search kept via Applebot)", dualUse: true },
  { userAgent: "Meta-ExternalAgent", operator: "Meta", purpose: "LLaMA training data collection" },
  { userAgent: "YouBot", operator: "You.com", purpose: "Answer engine index + training", dualUse: true },
  { userAgent: "Diffbot", operator: "Diffbot", purpose: "Knowledge-graph / dataset extraction" },
  { userAgent: "Cotoyogi", operator: "NII (Japan)", purpose: "Research LLM corpus" },
  { userAgent: "Timpibot", operator: "Timpi", purpose: "Web-scale dataset" },
  { userAgent: "iaskspider", operator: "iAsk.AI", purpose: "LLM training data collection" },
  { userAgent: "ImagesiftBot", operator: "Hive", purpose: "Image dataset collection" },
];

/** Dataset "function"/"description" text that marks a bot as dual-use:
 *  search / retrieval / user-initiated, not bulk training. */
const DUAL_USE_PATTERN =
  /search|answer engine|retriev|siri|spotlight|alexa|user[- ]initiated|assistant|\bagent\b|chat support/i;

/** Dataset controlled categories that are never dual-use regardless of text. */
const NEVER_DUAL_USE = new Set([
  "AI Data Scrapers",
  "AI Data Providers",
  "Undocumented AI Agents",
  "AI LLM Scraper.",
]);

function stripMarkdown(text) {
  if (!text) return text;
  // [label](url) -> label ; drop bare URLs
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyDualUse(fn, description) {
  if (NEVER_DUAL_USE.has(fn)) return false;
  return DUAL_USE_PATTERN.test(`${fn ?? ""} ${description ?? ""}`);
}

async function main() {
  const res = await fetch(DATASET_URL);
  if (!res.ok) throw new Error(`Dataset fetch failed: ${res.status}`);
  const dataset = await res.json();

  const curatedNames = new Set(CURATED.map((c) => c.userAgent.toLowerCase()));
  const community = [];
  for (const [name, info] of Object.entries(dataset)) {
    if (curatedNames.has(name.toLowerCase())) continue;
    const fn = (info.function ?? "").trim();
    const description = stripMarkdown(info.description ?? "");
    const operator =
      stripMarkdown(info.operator ?? "") || "Unknown";
    community.push({
      userAgent: name,
      operator,
      purpose: fn && !/^unclear/i.test(fn) ? fn : description || "AI crawler (community dataset)",
      ...(classifyDualUse(fn, description) ? { dualUse: true } : {}),
    });
  }
  community.sort((a, b) => a.userAgent.localeCompare(b.userAgent));

  const all = [...CURATED, ...community];
  const dualUseCount = all.filter((c) => c.dualUse).length;

  const lines = [];
  lines.push("/**");
  lines.push(" * GENERATED FILE - do not edit by hand.");
  lines.push(" * Regenerate with: npm run update:crawlers");
  lines.push(" *");
  lines.push(` * Source: ai.robots.txt community dataset (${DATASET_URL}),`);
  lines.push(` * fetched ${new Date().toISOString().slice(0, 10)}.`);
  lines.push(` * ${all.length} crawlers total: ${CURATED.length} curated + ${community.length} community;`);
  lines.push(` * ${dualUseCount} flagged dualUse (also power search/retrieval or`);
  lines.push(" * user-initiated fetching a site may want to keep).");
  lines.push(" */");
  lines.push("");
  lines.push("export type AICrawler = {");
  lines.push("  userAgent: string;");
  lines.push("  operator: string;");
  lines.push("  purpose: string;");
  lines.push("  /** true if this crawler also powers a search/discovery product users may want to keep */");
  lines.push("  dualUse?: boolean;");
  lines.push("};");
  lines.push("");
  lines.push("export const AI_CRAWLERS: AICrawler[] = [");
  for (const c of all) {
    const dual = c.dualUse ? ", dualUse: true" : "";
    lines.push(
      `  { userAgent: ${JSON.stringify(c.userAgent)}, operator: ${JSON.stringify(c.operator)}, purpose: ${JSON.stringify(c.purpose)}${dual} },`
    );
  }
  lines.push("];");
  lines.push("");

  const out = new URL("./src/lib/crawlers.generated.ts", import.meta.url);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(out, lines.join("\n"), "utf8");
  console.log(`Wrote ${all.length} crawlers (${dualUseCount} dualUse) to src/lib/crawlers.generated.ts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
