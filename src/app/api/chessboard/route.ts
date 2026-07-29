import type { NextRequest } from "next/server";
import { getPublicMatches } from "@/server/repositories/app-repository";
import { buildChessboard } from "@/server/services/standings";
import { createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    const matches = await getPublicMatches(context.supabase);
    const activeTeams = context.teams.filter((team) => team.isActive);
    return ok({ chessboard: buildChessboard(matches, activeTeams) }, { headers: { "Cache-Control": "private, max-age=20" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
