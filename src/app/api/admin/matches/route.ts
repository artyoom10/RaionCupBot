import type { NextRequest } from "next/server";
import { matchMutationSchema } from "@/lib/validation/schemas";
import { upsertMatch } from "@/server/repositories/app-repository";
import { assertPermission, createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    assertPermission(context.roles, "manage_schedule");
    const payload = matchMutationSchema.parse(await request.json());
    const match = await upsertMatch(context.supabase, {
      id: payload.id,
      round: payload.round,
      kickoff_at: payload.kickoffAt ?? null,
      venue: payload.venue ?? null,
      home_team_id: payload.homeTeamId,
      away_team_id: payload.awayTeamId,
      updated_by: context.user.id,
      ...(payload.id ? {} : { created_by: context.user.id })
    });
    return ok({ match });
  } catch (error) {
    return handleRouteError(error);
  }
}
