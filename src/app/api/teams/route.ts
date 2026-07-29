import type { NextRequest } from "next/server";
import { contextPayload, createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    return ok({ teams: contextPayload(context).teams });
  } catch (error) {
    return handleRouteError(error);
  }
}
