import crypto from "node:crypto";
import type { TelegramUserPayload, VerifiedTelegramInitData } from "@/types/domain";

export class TelegramInitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramInitDataError";
  }
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): VerifiedTelegramInitData {
  if (!initData || initData.length > 8192) {
    throw new TelegramInitDataError("Telegram initData is missing or too large");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new TelegramInitDataError("Telegram initData hash is missing");
  }

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const received = Buffer.from(hash, "hex");
  const calculated = Buffer.from(calculatedHash, "hex");
  if (received.length !== calculated.length || !crypto.timingSafeEqual(received, calculated)) {
    throw new TelegramInitDataError("Telegram initData signature is invalid");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) {
    throw new TelegramInitDataError("Telegram auth_date is invalid");
  }

  if (nowSeconds - authDate > maxAgeSeconds) {
    throw new TelegramInitDataError("Telegram initData is too old");
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new TelegramInitDataError("Telegram user payload is missing");
  }

  const user = JSON.parse(userRaw) as TelegramUserPayload;
  if (!Number.isFinite(user.id) || !user.first_name) {
    throw new TelegramInitDataError("Telegram user payload is invalid");
  }

  return { authDate, user };
}

export function makeDevTelegramUser(): VerifiedTelegramInitData {
  return {
    authDate: Math.floor(Date.now() / 1000),
    user: {
      id: 777000001,
      first_name: "Dev",
      last_name: "User",
      username: "raion_dev"
    }
  };
}
