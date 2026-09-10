import { NextRequest, NextResponse } from "next/server";
import { buildCanaryArtifacts, checkCanary, todayUtc } from "@/lib/canary";

export const runtime = "nodejs";

/**
 * POST /api/canary
 * Mint mode:  { domain: string, date?: "YYYY-MM-DD" }
 *   -> deterministic publish-time canary artifacts for that domain+date
 * Check mode: { check: true, canaryId: string, report: string }
 *   -> verdict on whether a pasted engine answer surfaced the canary
 * Stateless and zero-dependency: nothing is stored; the same domain+date
 * always re-mints the same token, so the user can re-derive their record.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      domain?: string;
      date?: string;
      check?: boolean;
      canaryId?: string;
      report?: string;
    };

    if (body.check) {
      if (!body.canaryId || typeof body.report !== "string") {
        return NextResponse.json(
          { error: "Check mode needs `canaryId` and `report`." },
          { status: 400 },
        );
      }
      return NextResponse.json(checkCanary(body.canaryId, body.report));
    }

    if (!body.domain || typeof body.domain !== "string") {
      return NextResponse.json({ error: "Missing `domain` in body" }, { status: 400 });
    }
    const date =
      body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayUtc();
    return NextResponse.json(buildCanaryArtifacts(body.domain, date));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Canary minting failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
