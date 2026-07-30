-- Run this file in Supabase SQL Editor if moderators still see:
-- "Only super_admin can replace result" / "Only super admin can replace result".
--
-- It is safe to run more than once. It does not remove the old enum value
-- team_admin, but old team_admin assignments stop granting player deletion rights.

alter table public.matches
  add column if not exists result_updated_by uuid references public.app_users(id) on delete set null,
  add column if not exists result_updated_at timestamptz;

create or replace view public.v_public_matches as
select
  m.id,
  m.round,
  m.kickoff_at,
  m.venue,
  m.status,
  m.result_type,
  m.home_team_id,
  m.away_team_id,
  ht.name as home_team_name,
  at.name as away_team_name,
  ht.short_name as home_team_short_name,
  at.short_name as away_team_short_name,
  ht.logo_url as home_logo_url,
  at.logo_url as away_logo_url,
  s.home_score,
  s.away_score,
  coalesce(nullif(trim(concat_ws(' ', pub.first_name, pub.last_name)), ''), pub.username) as published_by_name,
  m.result_published_at as published_at,
  coalesce(nullif(trim(concat_ws(' ', upd.first_name, upd.last_name)), ''), upd.username) as updated_by_name,
  m.result_updated_at as updated_at
from public.matches m
join public.teams ht on ht.id = m.home_team_id
join public.teams at on at.id = m.away_team_id
join public.v_match_scores s on s.match_id = m.id
left join public.app_users pub on pub.id = m.result_published_by
left join public.app_users upd on upd.id = m.result_updated_by;

create or replace function public.publish_match_result(
  p_actor_user_id uuid,
  p_match_id uuid,
  p_result_type text,
  p_goal_events jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_result_type public.match_result_type := p_result_type::public.match_result_type;
  v_event jsonb;
  v_index integer := 0;
  v_response jsonb;
  v_existing jsonb;
begin
  select response into v_existing from public.operation_idempotency where actor_user_id = p_actor_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing is null then
      raise exception 'Duplicate request is still processing';
    end if;
    return v_existing;
  end if;

  insert into public.operation_idempotency(actor_user_id, idempotency_key) values (p_actor_user_id, p_idempotency_key);

  if not (public.user_has_role(p_actor_user_id, 'moderator') or public.user_has_role(p_actor_user_id, 'super_admin')) then
    raise exception 'Only moderator or super_admin can publish result';
  end if;
  perform public.assert_public_author(p_actor_user_id);

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if v_match.status = 'published' then
    raise exception 'Match result is already published';
  end if;

  perform public.validate_goal_events(v_match, p_goal_events, v_result_type);

  for v_event in select * from jsonb_array_elements(p_goal_events)
  loop
    insert into public.match_goal_events(match_id, team_id, scorer_player_id, assist_player_id, event_type, sort_order)
    values (
      p_match_id,
      (v_event->>'teamId')::uuid,
      (v_event->>'scorerPlayerId')::uuid,
      nullif(v_event->>'assistPlayerId', '')::uuid,
      (v_event->>'eventType')::public.goal_event_type,
      v_index
    );
    v_index := v_index + 1;
  end loop;

  update public.matches
  set status = 'published',
      result_type = v_result_type,
      result_published_by = p_actor_user_id,
      result_published_at = now(),
      result_updated_by = p_actor_user_id,
      result_updated_at = now(),
      updated_by = p_actor_user_id
  where id = p_match_id;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, new_data, metadata)
  values (p_actor_user_id, 'publish_result', 'match', p_match_id, p_goal_events, jsonb_build_object('result_type', v_result_type));

  v_response := jsonb_build_object('matchId', p_match_id, 'status', 'published');
  update public.operation_idempotency set response = v_response where actor_user_id = p_actor_user_id and idempotency_key = p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.replace_match_result(
  p_actor_user_id uuid,
  p_match_id uuid,
  p_result_type text,
  p_goal_events jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_result_type public.match_result_type := p_result_type::public.match_result_type;
  v_old jsonb;
  v_event jsonb;
  v_index integer := 0;
  v_response jsonb;
  v_existing jsonb;
begin
  select response into v_existing from public.operation_idempotency where actor_user_id = p_actor_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing is null then
      raise exception 'Duplicate request is still processing';
    end if;
    return v_existing;
  end if;

  insert into public.operation_idempotency(actor_user_id, idempotency_key) values (p_actor_user_id, p_idempotency_key);

  if not (public.user_has_role(p_actor_user_id, 'moderator') or public.user_has_role(p_actor_user_id, 'super_admin')) then
    raise exception 'Only moderator or super_admin can replace result';
  end if;
  perform public.assert_public_author(p_actor_user_id);

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if v_match.status <> 'published' then
    raise exception 'Only published result can be replaced';
  end if;

  select jsonb_agg(to_jsonb(e) order by e.sort_order) into v_old from public.match_goal_events e where e.match_id = p_match_id;
  perform public.validate_goal_events(v_match, p_goal_events, v_result_type);

  delete from public.match_goal_events where match_id = p_match_id;
  for v_event in select * from jsonb_array_elements(p_goal_events)
  loop
    insert into public.match_goal_events(match_id, team_id, scorer_player_id, assist_player_id, event_type, sort_order)
    values (
      p_match_id,
      (v_event->>'teamId')::uuid,
      (v_event->>'scorerPlayerId')::uuid,
      nullif(v_event->>'assistPlayerId', '')::uuid,
      (v_event->>'eventType')::public.goal_event_type,
      v_index
    );
    v_index := v_index + 1;
  end loop;

  update public.matches
  set result_type = v_result_type,
      result_updated_by = p_actor_user_id,
      result_updated_at = now(),
      updated_by = p_actor_user_id
  where id = p_match_id;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, old_data, new_data, metadata)
  values (p_actor_user_id, 'replace_result', 'match', p_match_id, coalesce(v_old, '[]'::jsonb), p_goal_events, jsonb_build_object('result_type', v_result_type));

  v_response := jsonb_build_object('matchId', p_match_id, 'status', 'replaced');
  update public.operation_idempotency set response = v_response where actor_user_id = p_actor_user_id and idempotency_key = p_idempotency_key;
  return v_response;
end;
$$;

create or replace function public.deactivate_or_delete_player(p_actor_user_id uuid, p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_has_protocol boolean;
  v_action text;
begin
  select team_id into v_team_id from public.players where id = p_player_id for update;
  if not found then
    raise exception 'Player not found';
  end if;

  if not public.user_has_role(p_actor_user_id, 'super_admin') then
    raise exception 'Only super_admin can remove player';
  end if;

  select exists (
    select 1 from public.match_goal_events where scorer_player_id = p_player_id or assist_player_id = p_player_id
  ) into v_has_protocol;

  if v_has_protocol then
    update public.players set is_active = false, updated_by = p_actor_user_id where id = p_player_id;
    v_action := 'deactivate_player';
  else
    delete from public.players where id = p_player_id;
    v_action := 'delete_player';
  end if;

  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, old_data)
  values (p_actor_user_id, v_action, 'player', p_player_id, jsonb_build_object('team_id', v_team_id));

  return jsonb_build_object('playerId', p_player_id, 'action', v_action);
end;
$$;
