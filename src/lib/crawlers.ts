/**
 * Known AI training crawlers and the companies behind them.
 * Sources: each provider's official crawler documentation (OpenAI GPTBot docs,
 * Google's crawler overview re Google-Extended, Anthropic ClaudeBot docs,
 * Common Crawl CCBot, ByteDance Bytespider, PerplexityBot, Amazonbot, etc.)
 */

export type AICrawler = {
  userAgent: string;
  operator: string;
  purpose: string;
  /** true if this crawler also powers a search/discovery product users may want to keep */
  dualUse?: boolean;
};

export const AI_CRAWLERS: AICrawler[] = [
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

/**
 * Legal basis strings embedded into generated artifacts.
 */
export const LEGAL = {
  euReservation:
    "# EU DSM Directive (EU) 2019/790 Article 4(3) rights reservation\n" +
    "# The rightholder expressly reserves the rights referred to in Article 4(1)\n" +
    "# and Article 7(1) of Directive 96/9/EC, Article 2 and 3 of Directive 2001/29/EC,\n" +
    "# and Article 4(1)(a) and (b) of Directive 2009/24/EC with respect to the\n" +
    "# text and data mining exception in Article 4 of Directive (EU) 2019/790.\n" +
    "# This reservation applies to all content on this domain unless a licence\n" +
    "# is granted in writing by the rightholder.",
  notice:
    "This site reserves all rights regarding the use of its content for machine learning,\n" +
    "model training, or dataset construction. Text and data mining (including for AI\n" +
    "training) is not permitted without prior written consent. Automated access that\n" +
    "disregards these directives may constitute copyright infringement and/or breach\n" +
    "of these terms.",
};
