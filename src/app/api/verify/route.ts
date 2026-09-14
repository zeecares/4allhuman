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
import { checkCloudflareConfiguration } from "@/lib/cloudflare";

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

interface VerifyBody {
  robotsTxt?: string;
  aiTxt?: string;
  termsTxt?: string;
  metaHtml?: string;
  xRobotsTag?: string | string[];
  responseHeaders?: Record<string, string | string[] | undefined>;
}

/** Crawlers the pasted robots.txt blocks, via the same RFC 9309 evaluation the live scanner uses. */
function blockedCrawlersFrom(robotsTxt?: string): string[] {
  if (!robotsTxt) return [];
  return evaluateCrawlers(robotsTxt)
    .filter((v) => !v.allowed)
    .map((v) => v.userAgent);
}

/** X-Robots-Tag may be one header value or several; normalize to a list. */
function normalizeHeaderValues(xRobotsTag?: string | string[]): string[] {
  if (Array.isArray(xRobotsTag)) return xRobotsTag;
  return xRobotsTag ? [xRobotsTag] : [];
}

/** Build the layer results for the pasted artifacts. */
function buildLayers(body: VerifyBody, blocked: string[], headerValues: string[]) {
  const metaTagsFound = body.metaHtml ? extractMetaTags(body.metaHtml) : [];
  const tdm = detectTdmRep({
    headerValues: headerValues.filter((v) => /^\s*1\s*$/.test(v)),
    html: body.metaHtml,
  });
  const aiPrefSignals = detectAiPref([...headerValues, body.metaHtml ?? null]);
  return [
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
}

/**
 * Cloudflare infrastructure audit: when the caller provides response headers
 * (e.g. from their live site), check them against the pasted robots.txt so
 * creators can verify their Google-Extended setup.
 */
function cloudflareCheck(body: VerifyBody) {
  return body.responseHeaders
    ? checkCloudflareConfiguration(body.responseHeaders, body.robotsTxt ?? null)
    : null;
}

/** Assemble the verify response: score, layer detail, crawler lists, optional Cloudflare audit. */
function buildVerifyResponse(
  layers: ReturnType<typeof buildLayers>,
  blocked: string[],
  cloudflare: ReturnType<typeof cloudflareCheck>,
) {
  const score = scoreFromLayers(layers);
  const cfDelta = cloudflare?.scoreDelta ?? 0;
  const adjustedScore = Math.max(0, Math.min(100, score.score + cfDelta));
  return {
    score: {
      score: adjustedScore,
      breakdown: [
        ...score.breakdown,
        ...(cfDelta !== 0
          ? [{ label: "Adjustment: Googlebot blocked (Cloudflare check)", got: cfDelta, max: 0 }]
          : []),
      ],
    },
    layers,
    blockedCrawlers: blocked,
    openCrawlers: AI_CRAWLERS.filter((c) => !blocked.includes(c.userAgent)).map(
      (c) => c.userAgent,
    ),
    ...(cloudflare ? { cloudflare } : {}),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VerifyBody;

    if (!body.robotsTxt && !body.aiTxt && !body.metaHtml && !body.xRobotsTag) {
      return NextResponse.json(
        { error: "Provide at least one of robotsTxt, aiTxt, metaHtml, xRobotsTag" },
        { status: 400 },
      );
    }

    const blocked = blockedCrawlersFrom(body.robotsTxt);
    const layers = buildLayers(body, blocked, normalizeHeaderValues(body.xRobotsTag));
    const cloudflare = cloudflareCheck(body);

    return NextResponse.json(buildVerifyResponse(layers, blocked, cloudflare));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
