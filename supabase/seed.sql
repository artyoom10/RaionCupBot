insert into public.app_settings (id, tournament_name, app_short_name, timezone)
values (true, 'Raion Cup', 'Raion Cup', 'Europe/Moscow')
on conflict (id) do update
set tournament_name = excluded.tournament_name,
    app_short_name = excluded.app_short_name,
    timezone = excluded.timezone;

-- Пример добавления команды после создания проекта:
-- insert into public.teams (name, short_name, city, primary_color, display_order)
-- values ('ФК Район', 'Район', 'Москва', '#0f8f62', 1);

-- После первого входа пользователя через Mini App найдите внутренний UUID:
-- select id, telegram_id, first_name, last_name
-- from public.app_users
-- order by created_at desc;

-- Назначение главного администратора выполняется через app_users.id:
-- insert into public.user_roles (user_id, role, team_id)
-- values ('UUID_ПОЛЬЗОВАТЕЛЯ', 'super_admin', null);

-- Назначение модератора:
-- insert into public.user_roles (user_id, role, team_id)
-- values ('UUID_ПОЛЬЗОВАТЕЛЯ', 'moderator', null);

-- Назначение администратора команды:
-- insert into public.user_roles (user_id, role, team_id)
-- values ('UUID_ПОЛЬЗОВАТЕЛЯ', 'team_admin', 'UUID_КОМАНДЫ');
