import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramInitData } from "@/lib/telegram/init-data";

function signInitData(params: Record<string, string>, botToken: string) {
  const search = new URLSearchParams(params);
  const dataCheckString = Array.from(search.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  search.set("hash", hash);
  return search.toString();
}

describe("verifyTelegramInitData", () => {
  it("accepts valid signed initData", () => {
    const initData = signInitData(
      {
        auth_date: "1000",
        user: JSON.stringify({ id: 123, first_name: "Artyom", last_name: "Ivanov" })
      },
      "bot-token"
    );

    expect(verifyTelegramInitData(initData, "bot-token", 60, 1010).user.id).toBe(123);
  });

  it("rejects tampered initData", () => {
    const initData = signInitData(
      {
        auth_date: "1000",
        user: JSON.stringify({ id: 123, first_name: "Artyom" })
      },
      "bot-token"
    ).replace("Artyom", "Hacker");

    expect(() => verifyTelegramInitData(initData, "bot-token", 60, 1010)).toThrow("signature");
  });

  it("rejects old initData", () => {
    const initData = signInitData(
      {
        auth_date: "1000",
        user: JSON.stringify({ id: 123, first_name: "Artyom" })
      },
      "bot-token"
    );

    expect(() => verifyTelegramInitData(initData, "bot-token", 60, 1200)).toThrow("too old");
  });
});
