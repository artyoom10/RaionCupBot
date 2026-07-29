# Supabase

1. Создайте новый Supabase project.
2. Откройте SQL Editor.
3. Выполните `supabase/migrations/0001_initial_schema.sql`.
4. Выполните `supabase/seed.sql`.
5. Скопируйте `Project URL` в `SUPABASE_URL`.
6. Скопируйте `service_role` key в `SUPABASE_SERVICE_ROLE_KEY`.

Bucket `team-logos` создаётся миграцией. Он публичный только для чтения, запись выполняется сервером через service role.
