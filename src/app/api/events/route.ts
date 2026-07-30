import type { NextRequest } from "next/server";
import { getPublicGoalEvents } from "@/server/repositories/app-repository";
import { createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    const events = await getPublicGoalEvents(context.supabase);
    return ok({ events }, { headers: { "Cache-Control": "private, max-age=20" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
