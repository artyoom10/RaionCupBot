"use client";

import type { TelegramUserPayload } from "@/types/domain";

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: TelegramUserPayload };
  colorScheme?: "light" | "dark";
  ready: () => void;
  expand: () => void;
  close: () => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.Telegram?.WebApp ?? null;
}
