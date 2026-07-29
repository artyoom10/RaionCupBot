import { z } from "zod";

const serverEnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TOURNAMENT_TIMEZONE: z.string().default("Europe/Moscow"),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86_400),
  ALLOW_DEV_TELEGRAM_MOCK: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});

export function getServerEnv() {
  return serverEnvSchema.parse(process.env);
}

export function getPublicAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
