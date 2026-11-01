import { expect, test } from "@playwright/test";

const origin = process.env.STARBASE_TEST_URL ?? "http://127.0.0.1:5173";
const registeredRedirect = "http://127.0.0.1:5180/callback";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`shared login displays registered app branding ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route("**/api/v1/me", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "authentication_required" } }),
      }),
    );
    await page.route("**/api/v1/apps/starbase-todo-web/branding?**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "starbase-todo-web",
          name: "Yörünge TODO",
          logoUrl: `${origin}/brand/yrt.png`,
        }),
      }),
    );

    const authorize = new URL("/authorize", origin);
    authorize.searchParams.set("client_id", "starbase-todo-web");
    authorize.searchParams.set("redirect_uri", registeredRedirect);
    authorize.searchParams.set("scope", "profile");
    authorize.searchParams.set("code_challenge", "a".repeat(43));
    authorize.searchParams.set("state", "b".repeat(32));
    await page.goto(authorize.href);

    const brand = page.locator(".application-login-brand");
    await expect(brand).toBeVisible();
    await expect(brand).toContainText("Yörünge TODO");
    await expect(brand.locator("img")).toHaveJSProperty("naturalWidth", 749);
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

test("shared login stays generic when app branding is unavailable", async ({
  page,
}) => {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "authentication_required" } }),
    }),
  );
  await page.route("**/api/v1/apps/unknown/branding?**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "application_not_found" } }),
    }),
  );

  const authorize = new URL("/authorize", origin);
  authorize.searchParams.set("client_id", "unknown");
  authorize.searchParams.set("redirect_uri", registeredRedirect);
  await page.goto(authorize.href);

  await expect(page.getByRole("heading", { name: "Tekrar hoş geldin." })).toBeVisible();
  await expect(page.locator(".application-login-brand")).toHaveCount(0);
});
