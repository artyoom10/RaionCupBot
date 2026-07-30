import type { NextRequest } from "next/server";
import { getPlayers } from "@/server/repositories/app-repository";
import { createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    const teamId = new URL(request.url).searchParams.get("teamId");
    const players = await getPlayers(context.supabase, teamId ? [teamId] : undefined);
    return ok({ players: players.filter((player) => player.isActive) }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
