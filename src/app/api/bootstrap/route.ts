import type { NextRequest } from "next/server";
import { getSettings } from "@/server/repositories/app-repository";
import { contextPayload, createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    const settings = await getSettings(context.supabase);
    return ok({ ...contextPayload(context), settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
