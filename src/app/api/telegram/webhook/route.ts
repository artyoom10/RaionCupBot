import { NextResponse, type NextRequest } from "next/server";
import { getPublicAppUrl, getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    text?: string;
  };
};

async function sendTelegramMessage(chatId: number, text: string) {
  const env = getServerEnv();
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Открыть Raion Cup",
              web_app: { url: getPublicAppUrl() }
            }
          ]
        ]
      }
    })
  });

  if (!response.ok) {
    throw new Error("Telegram sendMessage failed");
  }
}

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const chatId = update.message?.chat.id;
  if (chatId && update.message?.text?.startsWith("/start")) {
    await sendTelegramMessage(chatId, "Откройте Mini App, чтобы посмотреть календарь, таблицу и статистику турнира.");
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "telegram-webhook" });
}
