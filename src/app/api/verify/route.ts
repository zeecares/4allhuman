import { NextRequest, NextResponse } from "next/server";
import { evaluateCrawlers, extractMetaTags } from "@/lib/scanner";
import { AI_CRAWLERS } from "@/lib/crawlers";
import {
  aiPrefLayer,
  aiTxtLayer,
  detectAiPref,
  detectTdmRep,
  headersLayer,
  metaLayer,
  reachableLayer,
  robotsLayer,
  scoreFromLayers,
  tdmRepLayer,
} from "@/lib/layers";
import { parseTermsTxt, termsTxtLayer } from "@/lib/terms";

export const runtime = "nodejs";

/**
 * POST /api/verify
 * Body: {
 *   robotsTxt?: string,
 *   aiTxt?: string,
 *   metaHtml?: string,
 *   xRobotsTag?: string | string[]  // planned X-Robots-Tag header value(s)
 * }
 * Scores user-pasted artifact contents (no live fetch) with the SAME layer
 * builders the live scanner uses, so creators can confirm their fix before
 * deploying it. Pasted content is definitionally "deployed" for scoring.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      robotsTxt?: string;
      aiTxt?: string;
      termsTxt?: string;
      metaHtml?: string;
      xRobotsTag?: string | string[];
    };

    if (!body.robotsTxt && !body.aiTxt && !body.metaHtml && !body.xRobotsTag) {
      return NextResponse.json(
        { error: "Provide at least one of robotsTxt, aiTxt, metaHtml, xRobotsTag" },
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

    const headerValues = Array.isArray(body.xRobotsTag)
      ? body.xRobotsTag
      : body.xRobotsTag
        ? [body.xRobotsTag]
        : [];
    const metaTagsFound = body.metaHtml ? extractMetaTags(body.metaHtml) : [];
    const tdm = detectTdmRep({
      headerValues: headerValues.filter((v) => /^\s*1\s*$/.test(v)),
      html: body.metaHtml,
    });
    const aiPrefSignals = detectAiPref([...headerValues, body.metaHtml ?? null]);

    const layers = [
      robotsLayer({
        blockedCount: blocked.length,
        totalCrawlers: AI_CRAWLERS.length,
        robotsFound: !!body.robotsTxt,
      }),
      headersLayer(headerValues),
      metaLayer(metaTagsFound),
      tdmRepLayer(tdm),
      aiTxtLayer(!!body.aiTxt, body.aiTxt ?? null),
      termsTxtLayer(body.termsTxt ? parseTermsTxt(body.termsTxt) : null, !!body.termsTxt),
      aiPrefLayer(aiPrefSignals),
      reachableLayer(true), // pasted content is definitionally "deployed"
    ];
    const score = scoreFromLayers(layers);

    return NextResponse.json({
      score,
      layers,
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
