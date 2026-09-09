import { NextRequest, NextResponse } from "next/server";
import { evaluateCrawlers } from "@/lib/scanner";
import { AI_CRAWLERS } from "@/lib/crawlers";
import { computeScore } from "@/lib/generator";

export const runtime = "nodejs";

/**
 * POST /api/verify
 * Body: { robotsTxt?: string, aiTxt?: string, metaHtml?: string }
 * Scores user-pasted artifact contents (no live fetch) so creators can
 * confirm their fix before deploying it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      robotsTxt?: string;
      aiTxt?: string;
      metaHtml?: string;
    };

    if (!body.robotsTxt && !body.aiTxt && !body.metaHtml) {
      return NextResponse.json(
        { error: "Provide at least one of robotsTxt, aiTxt, metaHtml" },
        { status: 400 },
      );
    }

    let blocked: string[] = [];
    if (body.robotsTxt) {
      // Same RFC 9309 evaluation the live scanner uses.
      blocked = evaluateCrawlers(body.robotsTxt)
        .filter((v) => !v.allowed)
        .map((v) => v.userAgent);
    }

    const aiTxtFound =
      !!body.aiTxt &&
      /deny[- ](training|dataset)|permission:\s*deny/i.test(body.aiTxt);

    const hasNoaiMeta =
      !!body.metaHtml &&
      /<meta\s+[^>]*name\s*=\s*["']robots["'][^>]*>/i.test(body.metaHtml) &&
      /\bnoai\b|\bnoimageai\b/i.test(body.metaHtml);

    const score = computeScore({
      blockedCount: blocked.length,
      totalCrawlers: AI_CRAWLERS.length,
      hasNoaiMeta,
      aiTxtFound,
      reachable: true, // pasted content is definitionally "deployed" for scoring
    });

    return NextResponse.json({
      score,
      blockedCrawlers: blocked,
      openCrawlers: AI_CRAWLERS.filter((c) => !blocked.includes(c.userAgent)).map(
        (c) => c.userAgent,
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
