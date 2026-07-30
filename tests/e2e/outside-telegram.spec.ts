import { expect, test } from "@playwright/test";

test("outside Telegram screen is visible in a normal browser", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Откройте приложение через Telegram" })).toBeVisible({ timeout: 9000 });
});
