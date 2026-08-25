import { NextRequest, NextResponse } from "next/server";
import { htmlToText, makeProbes, sha256Hex } from "@/lib/radar";

export const runtime = "nodejs";

/**
 * POST /api/radar
 * Body: { url?: string, text?: string }
 * Generates probe questions for the creator to ask AI engines themselves.
 * No LLM calls, no keys. Analysis happens locally in the user's browser.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string; text?: string };
    let sourceText = (body.text ?? "").trim();
    let domain = "pasted-content";

    if (!sourceText && body.url) {
      const res = await fetch(body.url, {
        headers: { "User-Agent": "DontTrainOnMe-Radar/0.1" },
        signal: AbortSignal.timeout(15_000),
        redirect: "follow",
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Could not fetch ${body.url} (${res.status})` },
          { status: 400 },
        );
      }
      sourceText = htmlToText(await res.text());
      try {
        domain = new URL(body.url).hostname;
      } catch {
        return NextResponse.json({ error: `Invalid URL: ${body.url}` }, { status: 400 });
      }
    }

    const wordCount = sourceText.split(/\s+/).filter(Boolean).length;
    if (wordCount < 80) {
      return NextResponse.json(
        { error: "Need at least ~80 words of content to build meaningful probes." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      domain,
      probes: makeProbes(domain, sourceText),
      sourceHash: await sha256Hex(sourceText),
      sourceText,
      wordCount,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Probe generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
