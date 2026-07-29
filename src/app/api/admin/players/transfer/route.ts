import type { NextRequest } from "next/server";
import { z } from "zod";
import { uuidSchema } from "@/lib/validation/schemas";
import { callTransferPlayer } from "@/server/repositories/app-repository";
import { assertPermission, createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

const transferSchema = z.object({
  playerId: uuidSchema,
  toTeamId: uuidSchema
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    assertPermission(context.roles, "manage_any_players");
    const payload = transferSchema.parse(await request.json());
    const result = await callTransferPlayer(context.supabase, context.user.id, payload.playerId, payload.toTeamId);
    return ok({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}
