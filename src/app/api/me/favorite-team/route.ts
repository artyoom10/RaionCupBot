import type { NextRequest } from "next/server";
import { favoriteTeamSchema } from "@/lib/validation/schemas";
import { updateFavoriteTeam } from "@/server/repositories/app-repository";
import { createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    const payload = favoriteTeamSchema.parse(await request.json());
    const user = await updateFavoriteTeam(context.supabase, context.user.id, payload.teamId);
    return ok({ user });
  } catch (error) {
    return handleRouteError(error);
  }
}
