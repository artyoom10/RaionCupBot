import type { NextRequest } from "next/server";
import { getAuditLog } from "@/server/repositories/app-repository";
import { assertPermission, createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    assertPermission(context.roles, "view_audit_log");
    const entries = await getAuditLog(context.supabase);
    return ok({ entries });
  } catch (error) {
    return handleRouteError(error);
  }
}
