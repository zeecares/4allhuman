/**
 * Known AI crawlers and the companies behind them.
 *
 * The blocklist itself now lives in crawlers.generated.ts and is regenerated
 * from the community ai.robots.txt dataset (https://github.com/ai-robots-txt/ai.robots.txt)
 * with `npm run update:crawlers`. The original 19 hand-researched entries are
 * preserved as the curated core of that file, and the dualUse distinction
 * (training vs search/retrieval/user-initiated fetching) is extended across
 * the full community dataset.
 */

export { AI_CRAWLERS } from "./crawlers.generated";
export type { AICrawler } from "./crawlers.generated";

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
