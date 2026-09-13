/**
 * Blog post content store.
 *
 * Posts are defined as TypeScript objects rather than .mdx files so the blog
 * works without adding @next/mdx or next-mdx--remote as dependencies. Each
 * post's body is an array of "blocks" that the [slug] page renders as JSX.
 * This keeps the zero-extra-dependency philosophy of the repo intact while
 * still giving us structured, type-safe content.
 */

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; language: string; code: string }
  | { type: "quote"; text: string };

export interface BlogPost {
  slug: string;
  title: string;
  date: string; // ISO 8601
  author: string;
  description: string;
  tags: string[];
  blocks: BlogBlock[];
}

export const posts: BlogPost[] = [
  {
    slug: "cloudflare-sept-15-googlebot-warning",
    title:
      "Cloudflare's September 15 Change Will Block Google If You Turned On AI Protection",
    date: "2026-09-14",
    author: "Zee Wang",
    description:
      "Cloudflare's new crawler defaults take effect Monday. If you turned on AI bot blocking to protect your content, you may accidentally block Googlebot — and lose your search rankings. Here's what's happening and how to fix it before Monday.",
    tags: ["cloudflare", "seo", "ai-crawlers", "robots-txt"],
    blocks: [
      {
        type: "p",
        text: "On Monday September 15, Cloudflare is changing how its AI crawler blocking works. If you turned on the \u201CBlock AI bots\u201D preset to protect your content from training scrapers, you're about to block Googlebot too \u2014 unless you act before Monday.",
      },
      { type: "h2", text: "What's changing" },
      {
        type: "p",
        text: "Cloudflare now categorises crawlers by ALL their behaviours, not just their primary purpose. Multi-purpose crawlers like Googlebot, Applebot, and BingBot are now subject to the most restrictive rule that applies to any of their behaviours.",
      },
      {
        type: "quote",
        text: "Googlebot, Applebot and BingBot will be blocked by customers who have selected to block Training.",
      },
      {
        type: "p",
        text: "That's from Cloudflare's own announcement. Google drives approximately 88% of referral traffic per Cloudflare's own data.",
      },
      { type: "h2", text: "Who's affected" },
      {
        type: "p",
        text: "Anyone who turned on Cloudflare's \u201CBlock AI bots\u201D preset. This applies to new customers, new sites on existing accounts, AND all existing free-plan customers who haven't changed their settings by September 15.",
      },
      { type: "h2", text: "The fix (step by step)" },
      {
        type: "ol",
        items: [
          "Go to your Cloudflare dashboard \u2192 Security \u2192 Bots \u2192 review your AI blocking preset. If you have a site-wide training block, consider scoping it to ad pages only, or opt out of the new defaults entirely.",
          "Add Google-Extended to your robots.txt. This is the correct targeted opt-out for Google's AI training that does NOT affect search indexing. See the snippet below.",
          "Keep your other AI training opt-out signals \u2014 robots.txt for other crawlers, ai.txt, meta tags. Those are still correct and important.",
        ],
      },
      { type: "h3", text: "Google-Extended robots.txt snippet" },
      {
        type: "p",
        text: "This tells Google not to use your content for Gemini training while keeping Googlebot crawling for Search:",
      },
      {
        type: "code",
        language: "text",
        code: "User-agent: Google-Extended\nDisallow: /",
      },
      { type: "h2", text: "The bigger picture" },
      {
        type: "p",
        text: "This is a good example of why AI training opt-out needs to be done carefully. Blunt tools \u2014 \u201Cblock everything\u201D \u2014 can have unintended consequences. The right approach is targeted, layered protection: block training crawlers specifically, use Google-Extended for Google's AI use, and keep search crawlers allowed. That's exactly what 4allhuman helps you set up correctly.",
      },
      { type: "h2", text: "Check your site now" },
      {
        type: "p",
        text: "Scan your site at 4allhuman.vercel.app to check your full AI training opt-out posture and make sure your configuration is correct before Monday.",
      },
    ],
  },
];

/** Look up a single post by slug. */
export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

/** Return all slugs for static generation. */
export function getAllSlugs(): string[] {
  return posts.map((p) => p.slug);
}
