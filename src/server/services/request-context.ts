import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env";
import { can, visiblePermissions } from "@/lib/permissions/rules";
import { createServiceClient } from "@/lib/supabase/server";
import { makeDevTelegramUser, verifyTelegramInitData } from "@/lib/telegram/init-data";
import { getTeams, getUserRoles, upsertAppUser } from "@/server/repositories/app-repository";
import { AppError, ForbiddenError } from "@/server/services/api-errors";
import type { Permission, RoleAssignment, Team } from "@/types/domain";

export type RequestContext = {
  supabase: ReturnType<typeof createServiceClient>;
  user: Awaited<ReturnType<typeof upsertAppUser>>;
  roles: RoleAssignment[];
  teams: Team[];
};

export async function createRequestContext(request: NextRequest): Promise<RequestContext> {
  const env = getServerEnv();
  const initData = request.headers.get("x-telegram-init-data") ?? "";
  const verified =
    !initData && process.env.NODE_ENV !== "production" && env.ALLOW_DEV_TELEGRAM_MOCK
      ? makeDevTelegramUser()
      : verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS);

  const supabase = createServiceClient();
  const user = await upsertAppUser(supabase, verified.user);
  const [roles, teams] = await Promise.all([getUserRoles(supabase, user.id), getTeams(supabase)]);
  return { supabase, user, roles, teams };
}

export function assertPermission(roles: RoleAssignment[], permission: Permission, teamId?: string) {
  if (!can(roles, permission, teamId)) {
    throw new ForbiddenError();
  }
}

export function contextPayload(context: RequestContext) {
  const favoriteTeam = context.teams.find((team) => team.id === context.user.favoriteTeamId) ?? null;
  return {
    user: context.user,
    roles: context.roles,
    permissions: visiblePermissions(context.roles, context.user.favoriteTeamId ?? undefined),
    favoriteTeam,
    teams: context.teams
  };
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function handleRouteError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown server error" }, { status: 500 });
}
