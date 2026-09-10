import type { Metadata } from "next";
import "./globals.css";

// The site's own publish-time canary (module 13), minted for
// 4allhuman.vercel.app on 2026-09-10 - re-derivable via /api/canary.
// Must match public/canary.txt (tests/site-artifacts.test.ts enforces it).
const SITE_CANARY_ID = "dtom-c30c29e5";

export const metadata: Metadata = {
  title: "Don't Train On Me",
  description: "Protect any creator's content from AI training in 60 seconds.",
  // Dogfooding the audit's own suggestions: page-level AI opt-outs the
  // scanner scores - noai/noimageai, W3C TDMRep reservation + policy URL,
  // and IETF aipref (draft) refusal tokens.
  other: {
    robots: "noai, noimageai",
    "tdm-reservation": "1",
    "tdm-policy": "https://4allhuman.vercel.app/tdm-policy.txt",
    aipref: "ai-train=n ai-input=n",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Publish-time canary: invisible to readers, visible to crawlers. */}
        <span dangerouslySetInnerHTML={{ __html: `<!-- content-fingerprint: ${SITE_CANARY_ID} -->` }} />
        {children}
      </body>
    </html>
  );
}
