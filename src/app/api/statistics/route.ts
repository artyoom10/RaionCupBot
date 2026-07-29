import type { NextRequest } from "next/server";
import { getPlayerStatistics } from "@/server/repositories/app-repository";
import { createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    const statistics = await getPlayerStatistics(context.supabase);
    return ok({ statistics }, { headers: { "Cache-Control": "private, max-age=20" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
