import { expect, test } from "@playwright/test";

const appOrigin = process.env.STARBASE_TODO_URL ?? "http://127.0.0.1:5180";
const starbaseOrigin = process.env.STARBASE_URL ?? "http://127.0.0.1:5174";

function mockStarbase(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    sessionStorage.setItem("starbase.starbase-todo-web", "test-refresh-token");
    if (!sessionStorage.getItem("todo-test-initialized")) {
      localStorage.clear();
      sessionStorage.setItem("todo-test-initialized", "true");
    }
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`todo task flow ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockStarbase(page);
    await page.route(`${starbaseOrigin}/api/v1/auth/refresh`, (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "test-access-token",
          refreshToken: "test-refresh-token",
          expiresIn: 600,
        }),
      }),
    );
    await page.route(`${starbaseOrigin}/api/v1/me`, (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "todo-user",
          username: "stargazer",
          firstName: "Ada",
          lastName: "Yıldız",
          applicationId: "starbase-todo-web",
        }),
      }),
    );
    await page.route(`${starbaseOrigin}/api/v1/auth/logout`, (route) =>
      route.fulfill({ contentType: "application/json", body: '{"ok":true}' }),
    );

    await page.goto(appOrigin);
    await expect(
      page.getByRole("heading", { name: "Bir sonraki adım." }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Yeni görev" })
      .fill("Roket denetim listesini hazırla");
    await page.getByRole("button", { name: "Görev ekle" }).click();
    await expect(
      page.getByText("Roket denetim listesini hazırla"),
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: "Roket denetim listesini hazırla görevini tamamla",
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Tamamlananlar 1" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Bir sonraki adım." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Gelen kutusu 0" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tamamlananlar 1" }).click();
    await expect(
      page.getByText("Roket denetim listesini hazırla"),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Roket denetim listesini hazırla görevini sil",
      })
      .click();
    await expect(page.getByText("Henüz tamamlanan görev yok.")).toBeVisible();
    await page.getByRole("button", { name: "Starbase’ten çıkış yap" }).click();
    await expect(
      page.getByRole("button", { name: "Starbase ile devam et" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("login continues through central Starbase authorize", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(`${starbaseOrigin}/authorize**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<title>Authorize test</title>",
    }),
  );
  await page.goto(appOrigin);
  await expect(
    page.getByRole("button", { name: "Starbase ile devam et" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Starbase ile devam et" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${starbaseOrigin.replaceAll(".", "\\.")}/authorize\\?`),
  );
  const url = new URL(page.url());
  expect(url.searchParams.get("client_id")).toBe("starbase-todo-web");
  expect(url.searchParams.get("redirect_uri")).toBe(`${appOrigin}/callback`);
  expect(url.searchParams.get("scope")).toBe("profile");
  expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(url.searchParams.get("state")).toBeTruthy();
});
