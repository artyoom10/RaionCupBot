# Raion Cup Bot

Telegram Mini App для одного районного футбольного турнира: бот `/start`, Mini App, Next.js API, Supabase PostgreSQL/Storage, роли, календарь, таблица, шахматка, статистика и административные мутации.

## Архитектура

- `src/app` — Next.js App Router, UI и API route handlers.
- `src/server` — репозитории Supabase и бизнес-сервисы.
- `src/lib/telegram/init-data.ts` — серверная HMAC-проверка Telegram Mini App `initData`.
- `supabase/migrations/0001_initial_schema.sql` — полная схема БД, views, RLS, Storage bucket и RPC.
- `public/bot-avatar.svg` — аватар бота внутри Mini App.
- `public/fallback-team-logo.svg` — fallback-логотип команды.

Клиент передаёт `X-Telegram-Init-Data`, сервер проверяет подпись, создаёт/обновляет `app_users`, читает роли по внутреннему `app_users.id` и только после этого работает с Supabase через service role.

## Требования

- Node.js 22+.
- npm 10+.
- Supabase Free project.
- Telegram BotFather bot.
- Vercel Free project для production.

## Локальная настройка

```bash
npm install
copy .env.example .env.local
npm run dev
```

Заполните `.env.local`:

```dotenv
TELEGRAM_BOT_TOKEN=123456:...
TELEGRAM_WEBHOOK_SECRET=long-random-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
TOURNAMENT_TIMEZONE=Europe/Moscow
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS=86400
ALLOW_DEV_TELEGRAM_MOCK=true
NEXT_PUBLIC_ALLOW_DEV_TELEGRAM_MOCK=true
```

`ALLOW_DEV_TELEGRAM_MOCK=true` используйте только локально. В production оставьте `false`.

## Supabase

1. Создайте новый project в Supabase.
2. В SQL Editor выполните [supabase/migrations/0001_initial_schema.sql](./supabase/migrations/0001_initial_schema.sql).
3. Затем выполните [supabase/seed.sql](./supabase/seed.sql).
4. В Project Settings скопируйте `Project URL` и `service_role` key в `.env.local` или Vercel env.
5. Bucket `team-logos` создаётся миграцией. Public read разрешён, запись делает сервер.

После первого входа пользователя через Mini App найдите его внутренний UUID:

```sql
select id, telegram_id, first_name, last_name
from public.app_users
order by created_at desc;
```

Назначьте главного администратора:

```sql
insert into public.user_roles (user_id, role, team_id)
values ('UUID_ПОЛЬЗОВАТЕЛЯ', 'super_admin', null);
```

Добавьте реальные команды:

```sql
insert into public.teams (name, short_name, city, primary_color, display_order)
values ('Название команды', 'Коротко', 'Район', '#0f8f62', 1);
```

## Telegram BotFather

1. Создайте бота через `/newbot`.
2. Через `/newapp` создайте Mini App и укажите production URL Vercel.
3. Для локальной проверки используйте HTTPS-туннель, например ngrok, и временно поставьте `NEXT_PUBLIC_APP_URL` на tunnel URL.
4. Webhook:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://YOUR-APP.vercel.app/api/telegram/webhook\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET\"}"
```

Команда `/start` отправит кнопку `Открыть Raion Cup`.

## Vercel

1. Создайте Vercel project из GitHub-репозитория.
2. Добавьте env vars из `.env.example`.
3. `NEXT_PUBLIC_APP_URL` должен быть production URL Vercel.
4. Deploy.
5. После deploy настройте BotFather Mini App URL и Telegram webhook на Vercel URL.

## GitHub

Локальный репозиторий уже можно связать с вашим remote:

```bash
git remote add origin https://github.com/artyoom10/RaionCupBot.git
git add .
git commit -m "Initial Raion Cup Bot MVP"
git branch -M main
git push -u origin main
```

В этой папке `origin` уже добавлен. Если GitHub попросит авторизацию, выполните `gh auth login` или используйте HTTPS token.

## Проверки

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

E2E:

```bash
npm run e2e
```

## Реализованные API

- `POST /api/bootstrap`
- `GET /api/teams`
- `GET /api/matches`
- `GET /api/standings`
- `GET /api/chessboard`
- `GET /api/statistics`
- `PATCH /api/me/favorite-team`
- `POST /api/admin/teams`
- `POST /api/admin/matches`
- `POST /api/admin/players`
- `DELETE /api/admin/players?playerId=...`
- `POST /api/admin/players/transfer`
- `POST /api/admin/results/publish`
- `POST /api/admin/results/replace`
- `GET /api/admin/audit-log`
- `POST /api/telegram/webhook`

## Бэкап и восстановление

Для бесплатного Supabase используйте Dashboard:

1. SQL Editor: экспортируйте структуру через миграцию из репозитория.
2. Table Editor или `pg_dump`: выгрузите данные таблиц.
3. Для восстановления сначала выполните миграцию, затем импортируйте данные.

## Отклонения от ТЗ

- UI административной публикации результата сделан как серверный API, а не как полный экран ввода протокола. RPC и route handlers готовы для подключения формы.
- Playwright добавлен с базовым сценарием открытия вне Telegram; полноценные Telegram E2E требуют тестового бота или scripted mock окружения.
- `database.generated.ts` содержит минимальные ручные типы RPC. Для production желательно сгенерировать полный файл командой Supabase CLI после применения миграции.
