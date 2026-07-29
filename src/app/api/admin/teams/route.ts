import type { NextRequest } from "next/server";
import { teamMutationSchema } from "@/lib/validation/schemas";
import { insertTeam } from "@/server/repositories/app-repository";
import { assertPermission, createRequestContext, handleRouteError, ok } from "@/server/services/request-context";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await createRequestContext(request);
    assertPermission(context.roles, "manage_teams");
    const payload = teamMutationSchema.parse(await request.json());
    const team = await insertTeam(context.supabase, {
      name: payload.name,
      short_name: payload.shortName,
      city: payload.city ?? null,
      logo_url: payload.logoUrl ?? null,
      primary_color: payload.primaryColor ?? null,
      display_order: payload.displayOrder ?? 0,
      is_active: payload.isActive ?? true
    });
    return ok({ team }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
