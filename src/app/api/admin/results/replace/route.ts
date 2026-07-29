import type { NextRequest } from "next/server";
import { resultMutationSchema } from "@/lib/validation/schemas";
import { callResultRpc } from "@/server/repositories/app-repository";
import { assertPermission, createRequestContext, handleRouteError, ok } from "@/server/services/request-context";
import type { Json } from "@/types/json";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    assertPermission(context.roles, "replace_result");
    const payload = resultMutationSchema.parse(await request.json());
    const result = await callResultRpc(context.supabase, "replace_match_result", context.user.id, {
      matchId: payload.matchId,
      resultType: payload.resultType,
      goalEvents: payload.goalEvents as Json,
      idempotencyKey: payload.idempotencyKey
    });
    return ok({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}
