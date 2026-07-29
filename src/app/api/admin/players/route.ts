import type { NextRequest } from "next/server";
import { can } from "@/lib/permissions/rules";
import { playerMutationSchema, uuidSchema } from "@/lib/validation/schemas";
import { callDeactivateOrDeletePlayer, upsertPlayer } from "@/server/repositories/app-repository";
import { ForbiddenError } from "@/server/services/api-errors";
import { createRequestContext, handleRouteError, ok } from "@/server/services/request-context";
import { normalizePlayerName } from "@/server/services/match-events";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    const payload = playerMutationSchema.parse(await request.json());
    if (!can(context.roles, "manage_any_players") && !can(context.roles, "manage_own_team_players", payload.teamId)) {
      throw new ForbiddenError();
    }
    const player = await upsertPlayer(context.supabase, {
      id: payload.id,
      team_id: payload.teamId,
      full_name: normalizePlayerName(payload.fullName),
      updated_by: context.user.id,
      created_by: context.user.id
    });
    return ok({ player });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    const playerId = uuidSchema.parse(new URL(request.url).searchParams.get("playerId"));
    const result = await callDeactivateOrDeletePlayer(context.supabase, context.user.id, playerId);
    return ok({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}
