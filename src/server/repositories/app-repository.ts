import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppUser,
  GoalEventType,
  Player,
  PlayerStatistic,
  PublicMatch,
  RoleAssignment,
  StandingBaseRow,
  Team,
  TelegramUserPayload,
  UUID
} from "@/types/domain";
import type { Json } from "@/types/json";

type DbRecord = Record<string, unknown>;

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function mapUser(row: DbRecord): AppUser {
  return {
    id: asString(row.id),
    telegramId: asNumber(row.telegram_id),
    firstName: asString(row.first_name),
    lastName: asNullableString(row.last_name),
    username: asNullableString(row.username),
    favoriteTeamId: asNullableString(row.favorite_team_id),
    onboardingCompletedAt: asNullableString(row.onboarding_completed_at)
  };
}

export async function upsertAppUser(supabase: SupabaseClient, tgUser: TelegramUserPayload): Promise<AppUser> {
  const { data, error } = await supabase
    .from("app_users")
    .upsert(
      {
        telegram_id: tgUser.id,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name ?? null,
        username: tgUser.username ?? null,
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "telegram_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapUser(data as DbRecord);
}

export async function getUserRoles(supabase: SupabaseClient, userId: UUID): Promise<RoleAssignment[]> {
  const { data, error } = await supabase.from("user_roles").select("role, team_id").eq("user_id", userId);
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbRecord[]).map((row) => ({
    role: asString(row.role) as RoleAssignment["role"],
    teamId: asNullableString(row.team_id)
  }));
}

export async function getTeams(supabase: SupabaseClient): Promise<Team[]> {
  const { data, error } = await supabase.from("teams").select("*").order("display_order", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbRecord[]).map((row) => ({
    id: asString(row.id),
    name: asString(row.name),
    shortName: asString(row.short_name),
    city: asNullableString(row.city),
    logoUrl: asNullableString(row.logo_url),
    primaryColor: asNullableString(row.primary_color),
    displayOrder: asNumber(row.display_order),
    isActive: Boolean(row.is_active)
  }));
}

export async function getPublicMatches(supabase: SupabaseClient): Promise<PublicMatch[]> {
  const { data, error } = await supabase
    .from("v_public_matches")
    .select("*")
    .order("round", { ascending: true })
    .order("kickoff_at", { ascending: true, nullsFirst: false });
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbRecord[]).map((row) => ({
    id: asString(row.id),
    round: asNumber(row.round),
    kickoffAt: asNullableString(row.kickoff_at),
    venue: asNullableString(row.venue),
    status: asString(row.status) as PublicMatch["status"],
    resultType: asString(row.result_type) as PublicMatch["resultType"],
    homeTeamId: asString(row.home_team_id),
    awayTeamId: asString(row.away_team_id),
    homeTeamName: asString(row.home_team_name),
    awayTeamName: asString(row.away_team_name),
    homeTeamShortName: asString(row.home_team_short_name),
    awayTeamShortName: asString(row.away_team_short_name),
    homeLogoUrl: asNullableString(row.home_logo_url),
    awayLogoUrl: asNullableString(row.away_logo_url),
    homeScore: row.home_score === null ? null : asNumber(row.home_score),
    awayScore: row.away_score === null ? null : asNumber(row.away_score),
    publishedByName: asNullableString(row.published_by_name),
    publishedAt: asNullableString(row.published_at),
    updatedByName: asNullableString(row.updated_by_name),
    updatedAt: asNullableString(row.updated_at)
  }));
}

export async function getStandingsBase(supabase: SupabaseClient): Promise<StandingBaseRow[]> {
  const { data, error } = await supabase.from("v_standings_base").select("*");
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbRecord[]).map((row) => ({
    teamId: asString(row.team_id),
    teamName: asString(row.team_name),
    shortName: asString(row.short_name),
    logoUrl: asNullableString(row.logo_url),
    played: asNumber(row.played),
    wins: asNumber(row.wins),
    draws: asNumber(row.draws),
    losses: asNumber(row.losses),
    goalsFor: asNumber(row.goals_for),
    goalsAgainst: asNumber(row.goals_against),
    goalDifference: asNumber(row.goal_difference),
    points: asNumber(row.points)
  }));
}

export async function getManualRanks(supabase: SupabaseClient): Promise<Record<UUID, number | null>> {
  const { data, error } = await supabase.from("teams").select("id, manual_rank");
  if (error) {
    throw new Error(error.message);
  }

  return Object.fromEntries(
    ((data ?? []) as DbRecord[]).map((row) => [asString(row.id), row.manual_rank === null ? null : asNumber(row.manual_rank)])
  );
}

export async function getPlayerStatistics(supabase: SupabaseClient): Promise<PlayerStatistic[]> {
  const { data, error } = await supabase
    .from("v_player_statistics")
    .select("*")
    .order("goal_plus_assist", { ascending: false })
    .order("goals", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbRecord[]).map((row) => ({
    playerId: asString(row.player_id),
    playerName: asString(row.player_name),
    teamId: asString(row.team_id),
    teamName: asString(row.team_name),
    goals: asNumber(row.goals),
    penalties: asNumber(row.penalties),
    nonPenaltyGoals: asNumber(row.non_penalty_goals),
    assists: asNumber(row.assists),
    goalPlusAssist: asNumber(row.goal_plus_assist),
    ownGoals: asNumber(row.own_goals)
  }));
}

export async function getPlayers(supabase: SupabaseClient, teamIds?: UUID[]): Promise<Player[]> {
  let query = supabase
    .from("players")
    .select("id, team_id, full_name, is_active")
    .order("full_name", { ascending: true });

  if (teamIds && teamIds.length > 0) {
    query = query.in("team_id", teamIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbRecord[]).map((row) => ({
    id: asString(row.id),
    teamId: asString(row.team_id),
    fullName: asString(row.full_name),
    isActive: Boolean(row.is_active)
  }));
}

export async function getPublicGoalEvents(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("match_goal_events")
    .select("id, match_id, team_id, scorer_player_id, assist_player_id, event_type, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const events = ((data ?? []) as DbRecord[]).map((row) => ({
    id: asString(row.id),
    matchId: asString(row.match_id),
    teamId: asString(row.team_id),
    scorerPlayerId: asString(row.scorer_player_id),
    assistPlayerId: asNullableString(row.assist_player_id),
    eventType: asString(row.event_type) as GoalEventType,
    sortOrder: asNumber(row.sort_order)
  }));

  const playerIds = Array.from(
    new Set(events.flatMap((event) => [event.scorerPlayerId, event.assistPlayerId]).filter((value): value is string => Boolean(value)))
  );

  const playersById = new Map<string, Pick<Player, "id" | "teamId" | "fullName">>();
  if (playerIds.length > 0) {
    const { data: playersData, error: playersError } = await supabase
      .from("players")
      .select("id, team_id, full_name")
      .in("id", playerIds);

    if (playersError) {
      throw new Error(playersError.message);
    }

    for (const row of (playersData ?? []) as DbRecord[]) {
      playersById.set(asString(row.id), {
        id: asString(row.id),
        teamId: asString(row.team_id),
        fullName: asString(row.full_name)
      });
    }
  }

  return events.map((event) => ({
    ...event,
    scorerName: playersById.get(event.scorerPlayerId)?.fullName ?? "Игрок",
    assistName: event.assistPlayerId ? playersById.get(event.assistPlayerId)?.fullName ?? null : null
  }));
}

export async function updateFavoriteTeam(supabase: SupabaseClient, userId: UUID, teamId: UUID | null) {
  const { data, error } = await supabase
    .from("app_users")
    .update({
      favorite_team_id: teamId,
      onboarding_completed_at: new Date().toISOString()
    })
    .eq("id", userId)
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }

  return mapUser(data as DbRecord);
}

export async function getSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("app_settings").select("*").limit(1).single();
  if (error) {
    throw new Error(error.message);
  }

  const row = data as DbRecord;
  return {
    tournamentName: asString(row.tournament_name),
    appShortName: asString(row.app_short_name),
    timezone: asString(row.timezone)
  };
}

export async function getAuditLog(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, created_at, actor_user_id")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function insertTeam(supabase: SupabaseClient, payload: DbRecord) {
  const { data, error } = await supabase.from("teams").insert(payload).select("*").single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function upsertMatch(supabase: SupabaseClient, payload: DbRecord) {
  const query = payload.id
    ? supabase.from("matches").update(payload).eq("id", payload.id).select("*").single()
    : supabase.from("matches").insert(payload).select("*").single();
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function upsertPlayer(supabase: SupabaseClient, payload: DbRecord) {
  const query = payload.id
    ? supabase.from("players").update(payload).eq("id", payload.id).select("*").single()
    : supabase.from("players").insert(payload).select("*").single();
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function callResultRpc(
  supabase: SupabaseClient,
  rpcName: "publish_match_result" | "replace_match_result",
  actorUserId: UUID,
  payload: {
    matchId: UUID;
    resultType: string;
    goalEvents: Json;
    idempotencyKey: string;
  }
) {
  const { data, error } = await supabase.rpc(rpcName, {
    p_actor_user_id: actorUserId,
    p_match_id: payload.matchId,
    p_result_type: payload.resultType,
    p_goal_events: payload.goalEvents,
    p_idempotency_key: payload.idempotencyKey
  });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function callDeactivateOrDeletePlayer(supabase: SupabaseClient, actorUserId: UUID, playerId: UUID) {
  const { data, error } = await supabase.rpc("deactivate_or_delete_player", {
    p_actor_user_id: actorUserId,
    p_player_id: playerId
  });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function callTransferPlayer(supabase: SupabaseClient, actorUserId: UUID, playerId: UUID, toTeamId: UUID) {
  const { data, error } = await supabase.rpc("transfer_player", {
    p_actor_user_id: actorUserId,
    p_player_id: playerId,
    p_to_team_id: toTeamId
  });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}
