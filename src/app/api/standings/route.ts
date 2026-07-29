import type { NextRequest } from "next/server";
import { getManualRanks, getPublicMatches, getStandingsBase } from "@/server/repositories/app-repository";
import { sortStandings } from "@/server/services/standings";
import { createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    const [base, matches, manualRanks] = await Promise.all([
      getStandingsBase(context.supabase),
      getPublicMatches(context.supabase),
      getManualRanks(context.supabase)
    ]);
    return ok({ standings: sortStandings(base, matches, manualRanks) }, { headers: { "Cache-Control": "private, max-age=20" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
