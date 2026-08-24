import { NextRequest, NextResponse } from "next/server";
import {
  analyzePair,
  configuredEngines,
  htmlToText,
  interrogate,
  makeProbes,
  sha256,
  type EngineId,
  type EngineResult,
} from "@/lib/radar";

export const runtime = "nodejs";
export const maxDuration = 60;

type RadarRequest = { url?: string; text?: string };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RadarRequest;
    let sourceText = (body.text ?? "").trim();
    let domain = "pasted-content";

    if (!sourceText && body.url) {
      const res = await fetch(body.url, {
        headers: { "User-Agent": "DontTrainOnMe-Radar/0.1" },
        signal: AbortSignal.timeout(15_000),
        redirect: "follow",
      });
      if (!res.ok) {
        return NextResponse.json({ error: `Could not fetch ${body.url} (${res.status})` }, { status: 400 });
      }
      sourceText = htmlToText(await res.text());
      try {
        domain = new URL(body.url).hostname;
      } catch {
        return NextResponse.json({ error: `Invalid URL: ${body.url}` }, { status: 400 });
      }
    }

    if (sourceText.split(" ").length < 80) {
      return NextResponse.json(
        { error: "Need at least ~80 words of content to build meaningful probes." },
        { status: 400 },
      );
    }

    const probes = makeProbes(domain, sourceText);
    const engines = configuredEngines();

    const results = await Promise.all(
      (engines.length ? engines : []).map(async (engine): Promise<EngineResult> => {
        try {
          const answers = await interrogate(engine, probes);
          const joined = answers.map((a) => a.answer).join("\n");
          const analysis = analyzePair(sourceText, joined);
          return { engine, status: "answered", answers, ...analysis };
        } catch (err) {
          return {
            engine,
            status: "error",
            answers: [],
            error: err instanceof Error ? err.message : String(err),
          } as EngineResult;
        }
      }),
    );

    return NextResponse.json({
      domain,
      probes,
      sourceHash: sha256(sourceText),
      sourceExcerpt: sourceText.slice(0, 400),
      scannedAt: new Date().toISOString(),
      results,
      unconfigured: (
        [
          !process.env.OPENAI_API_KEY && "openai",
          !process.env.ANTHROPIC_API_KEY && "anthropic",
          !process.env.PERPLEXITY_API_KEY && "perplexity",
        ].filter(Boolean) as EngineId[]
      ).map((e) => ({ engine: e, status: "no-key", answers: [] }) satisfies EngineResult),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Radar run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
