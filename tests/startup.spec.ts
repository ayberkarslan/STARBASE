import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`STARBASE startup ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route("**/api/v1/me", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "authentication_required" } }),
      });
    });
    await page.goto(process.env.STARBASE_TEST_URL ?? "http://127.0.0.1:5173");

    const startup = page.getByRole("status", {
      name: "STARBASE hazırlanıyor",
    });
    await expect(startup).toBeVisible();
    await expect(page.locator(".startup-brand > span")).toHaveText("STARBASE");
    await expect(page.locator(".startup-brand img")).toHaveJSProperty(
      "naturalWidth",
      749,
    );
    await expect(page.locator(".startup-ready")).toBeAttached({
      timeout: 10000,
    });
    await expect(startup).toHaveCount(0, { timeout: 5000 });
    await expect(
      page.getByRole("heading", { name: "Tekrar hoş geldin." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
