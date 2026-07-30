begin;

create extension if not exists "pgcrypto";

create type public.user_role as enum ('super_admin', 'moderator', 'team_admin');
create type public.match_status as enum ('scheduled', 'published');
create type public.match_result_type as enum ('normal', 'technical_home', 'technical_away', 'technical_both');
create type public.goal_event_type as enum ('goal', 'penalty', 'own_goal');

create table public.app_settings (
  id boolean primary key default true,
  tournament_name text not null default 'Raion Cup',
  app_short_name text not null default 'Raion Cup',
  timezone text not null default 'Europe/Moscow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  first_name text not null,
  last_name text,
  username text,
  favorite_team_id uuid,
  onboarding_completed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  city text,
  logo_url text,
  primary_color text,
  display_order integer not null default 0,
  manual_rank integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_name_unique unique (name),
  constraint teams_short_name_unique unique (short_name),
  constraint teams_color_format check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.app_users
  add constraint app_users_favorite_team_fk foreign key (favorite_team_id) references public.teams(id) on delete set null;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  role public.user_role not null,
  team_id uuid references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  constraint user_roles_team_required check ((role = 'team_admin' and team_id is not null) or (role <> 'team_admin' and team_id is null))
);

create unique index user_roles_super_admin_singleton on public.user_roles (role) where role = 'super_admin';
create unique index user_roles_unique_role on public.user_roles (user_id, role, coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index user_roles_user_idx on public.user_roles (user_id);
create index user_roles_team_idx on public.user_roles (team_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  constraint players_full_name_nonempty check (length(trim(full_name)) >= 2)
);

create index players_team_idx on public.players (team_id, is_active);

create table public.player_team_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  from_team_id uuid references public.teams(id) on delete set null,
  to_team_id uuid not null references public.teams(id) on delete restrict,
  moved_at timestamptz not null default now(),
  moved_by uuid references public.app_users(id) on delete set null
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  round integer not null,
  kickoff_at timestamptz,
  venue text,
  home_team_id uuid not null references public.teams(id) on delete restrict,
  away_team_id uuid not null references public.teams(id) on delete restrict,
  status public.match_status not null default 'scheduled',
  result_type public.match_result_type not null default 'normal',
  result_published_by uuid references public.app_users(id) on delete set null,
  result_published_at timestamptz,
  result_updated_by uuid references public.app_users(id) on delete set null,
  result_updated_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_round_positive check (round > 0),
  constraint matches_distinct_teams check (home_team_id <> away_team_id)
);

create index matches_round_idx on public.matches (round, kickoff_at);
create index matches_home_team_idx on public.matches (home_team_id);
create index matches_away_team_idx on public.matches (away_team_id);
create unique index matches_pair_once on public.matches (least(home_team_id, away_team_id), greatest(home_team_id, away_team_id));

create table public.match_goal_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  scorer_player_id uuid not null references public.players(id) on delete restrict,
  assist_player_id uuid references public.players(id) on delete restrict,
  event_type public.goal_event_type not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint match_goal_events_penalty_assist check (event_type <> 'penalty' or assist_player_id is null),
  constraint match_goal_events_own_goal_assist check (event_type <> 'own_goal' or assist_player_id is null),
  constraint match_goal_events_no_self_assist check (assist_player_id is null or assist_player_id <> scorer_player_id)
);

create index match_goal_events_match_idx on public.match_goal_events (match_id, sort_order);
create index match_goal_events_scorer_idx on public.match_goal_events (scorer_player_id);
create index match_goal_events_assist_idx on public.match_goal_events (assist_player_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

create table public.operation_idempotency (
  actor_user_id uuid not null references public.app_users(id) on delete cascade,
  idempotency_key text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, idempotency_key)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();
create trigger app_users_updated_at before update on public.app_users for each row execute function public.set_updated_at();
create trigger teams_updated_at before update on public.teams for each row execute function public.set_updated_at();
create trigger players_updated_at before update on public.players for each row execute function public.set_updated_at();
create trigger matches_updated_at before update on public.matches for each row execute function public.set_updated_at();

create or replace view public.v_match_scores as
select
  m.id as match_id,
  m.result_type,
  case
    when m.status <> 'published' then null
    when m.result_type = 'technical_home' then 3
    when m.result_type = 'technical_away' then 0
    when m.result_type = 'technical_both' then 0
    else coalesce(sum(case
      when e.event_type in ('goal', 'penalty') and e.team_id = m.home_team_id then 1
      when e.event_type = 'own_goal' and e.team_id = m.away_team_id then 1
      else 0
    end), 0)::integer
  end as home_score,
  case
    when m.status <> 'published' then null
    when m.result_type = 'technical_home' then 0
    when m.result_type = 'technical_away' then 3
    when m.result_type = 'technical_both' then 0
    else coalesce(sum(case
      when e.event_type in ('goal', 'penalty') and e.team_id = m.away_team_id then 1
      when e.event_type = 'own_goal' and e.team_id = m.home_team_id then 1
      else 0
    end), 0)::integer
  end as away_score
from public.matches m
left join public.match_goal_events e on e.match_id = m.id
group by m.id;

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
  nullif(trim(concat_ws(' ', pub.first_name, pub.last_name)), '') as published_by_name,
  m.result_published_at as published_at,
  nullif(trim(concat_ws(' ', upd.first_name, upd.last_name)), '') as updated_by_name,
  m.result_updated_at as updated_at
from public.matches m
join public.teams ht on ht.id = m.home_team_id
join public.teams at on at.id = m.away_team_id
join public.v_match_scores s on s.match_id = m.id
left join public.app_users pub on pub.id = m.result_published_by
left join public.app_users upd on upd.id = m.result_updated_by;

create or replace view public.v_standings_base as
with match_rows as (
  select
    m.id,
    m.result_type,
    m.home_team_id as team_id,
    m.away_team_id as opponent_id,
    s.home_score as goals_for,
    s.away_score as goals_against,
    case
      when m.result_type = 'technical_both' then 0
      when s.home_score > s.away_score then 3
      when s.home_score = s.away_score then 1
      else 0
    end as points,
    case when m.result_type <> 'technical_both' and s.home_score > s.away_score then 1 else 0 end as win,
    case when m.result_type <> 'technical_both' and s.home_score = s.away_score then 1 else 0 end as draw,
    case when m.result_type = 'technical_both' or s.home_score < s.away_score then 1 else 0 end as loss
  from public.matches m
  join public.v_match_scores s on s.match_id = m.id
  where m.status = 'published'
  union all
  select
    m.id,
    m.result_type,
    m.away_team_id as team_id,
    m.home_team_id as opponent_id,
    s.away_score as goals_for,
    s.home_score as goals_against,
    case
      when m.result_type = 'technical_both' then 0
      when s.away_score > s.home_score then 3
      when s.away_score = s.home_score then 1
      else 0
    end as points,
    case when m.result_type <> 'technical_both' and s.away_score > s.home_score then 1 else 0 end as win,
    case when m.result_type <> 'technical_both' and s.away_score = s.home_score then 1 else 0 end as draw,
    case when m.result_type = 'technical_both' or s.away_score < s.home_score then 1 else 0 end as loss
  from public.matches m
  join public.v_match_scores s on s.match_id = m.id
  where m.status = 'published'
)
select
  t.id as team_id,
  t.name as team_name,
  t.short_name,
  t.logo_url,
  coalesce(count(r.id), 0)::integer as played,
  coalesce(sum(r.win), 0)::integer as wins,
  coalesce(sum(r.draw), 0)::integer as draws,
  coalesce(sum(r.loss), 0)::integer as losses,
  coalesce(sum(r.goals_for), 0)::integer as goals_for,
  coalesce(sum(r.goals_against), 0)::integer as goals_against,
  (coalesce(sum(r.goals_for), 0) - coalesce(sum(r.goals_against), 0))::integer as goal_difference,
  coalesce(sum(r.points), 0)::integer as points
from public.teams t
left join match_rows r on r.team_id = t.id
where t.is_active = true
group by t.id;

create or replace view public.v_player_statistics as
select
  p.id as player_id,
  p.full_name as player_name,
  p.team_id,
  t.name as team_name,
  coalesce(sum(case when e.event_type in ('goal', 'penalty') then 1 else 0 end), 0)::integer as goals,
  coalesce(sum(case when e.event_type = 'penalty' then 1 else 0 end), 0)::integer as penalties,
  coalesce(sum(case when e.event_type = 'goal' then 1 else 0 end), 0)::integer as non_penalty_goals,
  coalesce(assists.assists, 0)::integer as assists,
  (coalesce(sum(case when e.event_type in ('goal', 'penalty') then 1 else 0 end), 0) + coalesce(assists.assists, 0))::integer as goal_plus_assist,
  coalesce(sum(case when e.event_type = 'own_goal' then 1 else 0 end), 0)::integer as own_goals
from public.players p
join public.teams t on t.id = p.team_id
left join public.match_goal_events e on e.scorer_player_id = p.id
left join (
  select assist_player_id as player_id, count(*) as assists
  from public.match_goal_events
  where assist_player_id is not null
  group by assist_player_id
) assists on assists.player_id = p.id
group by p.id, t.id, assists.assists;

create or replace function public.user_has_role(p_user_id uuid, p_role public.user_role, p_team_id uuid default null)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = p_user_id
      and r.role = p_role
      and (p_team_id is null or r.team_id = p_team_id)
  );
$$;

create or replace function public.assert_public_author(p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_first text;
  v_last text;
begin
  select first_name, last_name into v_first, v_last from public.app_users where id = p_user_id;
  if nullif(trim(coalesce(v_first, '')), '') is null then
    raise exception 'Privileged user must have first_name filled in app_users';
  end if;
end;
$$;

create or replace function public.validate_goal_events(p_match public.matches, p_goal_events jsonb, p_result_type public.match_result_type)
returns void
language plpgsql
as $$
declare
  item jsonb;
  v_team_id uuid;
  v_scorer uuid;
  v_assist uuid;
  v_event public.goal_event_type;
  v_player_team uuid;
  v_assist_team uuid;
begin
  if jsonb_typeof(p_goal_events) <> 'array' then
    raise exception 'goal_events must be an array';
  end if;

  if p_result_type <> 'normal' and jsonb_array_length(p_goal_events) > 0 then
    raise exception 'technical results cannot contain goal events';
  end if;

  for item in select * from jsonb_array_elements(p_goal_events)
  loop
    v_team_id := (item->>'teamId')::uuid;
    v_scorer := (item->>'scorerPlayerId')::uuid;
    v_assist := nullif(item->>'assistPlayerId', '')::uuid;
    v_event := (item->>'eventType')::public.goal_event_type;

    if v_team_id not in (p_match.home_team_id, p_match.away_team_id) then
      raise exception 'goal event team is not part of match';
    end if;

    select team_id into v_player_team from public.players where id = v_scorer;
    if v_player_team is null or v_player_team <> v_team_id then
      raise exception 'scorer does not belong to event team';
    end if;

    if v_event in ('penalty', 'own_goal') and v_assist is not null then
      raise exception 'penalty and own goal cannot have assist';
    end if;

    if v_assist is not null then
      select team_id into v_assist_team from public.players where id = v_assist;
      if v_assist_team is null or v_assist_team <> v_team_id then
        raise exception 'assist player does not belong to event team';
      end if;
      if v_assist = v_scorer then
        raise exception 'scorer cannot assist himself';
      end if;
    end if;
  end loop;
end;
$$;

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

  if not public.user_has_role(p_actor_user_id, 'super_admin') then
    raise exception 'Only super_admin can replace result';
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

create or replace function public.transfer_player(p_actor_user_id uuid, p_player_id uuid, p_to_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_team_id uuid;
begin
  if not public.user_has_role(p_actor_user_id, 'super_admin') then
    raise exception 'Only super_admin can transfer players';
  end if;

  select team_id into v_from_team_id from public.players where id = p_player_id for update;
  if not found then
    raise exception 'Player not found';
  end if;

  update public.players set team_id = p_to_team_id, updated_by = p_actor_user_id where id = p_player_id;
  insert into public.player_team_history(player_id, from_team_id, to_team_id, moved_by)
  values (p_player_id, v_from_team_id, p_to_team_id, p_actor_user_id);
  insert into public.audit_log(actor_user_id, action, entity_type, entity_id, old_data, new_data)
  values (p_actor_user_id, 'transfer_player', 'player', p_player_id, jsonb_build_object('team_id', v_from_team_id), jsonb_build_object('team_id', p_to_team_id));

  return jsonb_build_object('playerId', p_player_id, 'fromTeamId', v_from_team_id, 'toTeamId', p_to_team_id);
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

  if not (public.user_has_role(p_actor_user_id, 'super_admin') or public.user_has_role(p_actor_user_id, 'team_admin', v_team_id)) then
    raise exception 'Only team admin or super_admin can remove player';
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

alter table public.app_settings enable row level security;
alter table public.app_users enable row level security;
alter table public.teams enable row level security;
alter table public.user_roles enable row level security;
alter table public.players enable row level security;
alter table public.player_team_history enable row level security;
alter table public.matches enable row level security;
alter table public.match_goal_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.operation_idempotency enable row level security;

create policy "anon can read public settings" on public.app_settings for select to anon using (true);
create policy "anon can read active teams" on public.teams for select to anon using (is_active = true);
create policy "anon can read published and scheduled matches" on public.matches for select to anon using (true);
create policy "anon can read goal events" on public.match_goal_events for select to anon using (true);
create policy "anon can read active players" on public.players for select to anon using (is_active = true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "public can read team logos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'team-logos');

comment on table public.app_users is 'Telegram users. Other tables reference internal uuid app_users.id, never Telegram ID.';
comment on table public.user_roles is 'Manual role assignments. team_id is only used for team_admin.';
comment on function public.publish_match_result is 'Atomic publication of a match result with all goal events and audit logging.';
comment on function public.replace_match_result is 'Atomic super_admin replacement of an already published result.';

commit;
