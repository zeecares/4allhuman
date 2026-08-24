import { NextRequest, NextResponse } from "next/server";
import { AI_CRAWLERS } from "@/lib/crawlers";
import { scanSite, type ScanResult } from "@/lib/scanner";
import { generateAllArtifacts, scoreFromScan } from "@/lib/generator";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing `url` in body" }, { status: 400 });
    }

    const scan: ScanResult = await scanSite(url);
    const artifacts = generateAllArtifacts(scan);
    const score = scoreFromScan(scan, AI_CRAWLERS.length);

    return NextResponse.json({ scan, artifacts, score });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
