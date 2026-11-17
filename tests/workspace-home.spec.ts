import { expect, test } from "@playwright/test";

const origin = process.env.STARBASE_TEST_URL ?? "http://127.0.0.1:5173";
const apps = [{ id: "starlab", name: "STARLAB", logoUrl: "/brand/yrt.png", launchUrl: "" }];

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`workspace home and search ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route("**/api/v1/me", (route) => route.fulfill({ json: {
      id: "test-user", username: "stargazer", firstName: "Ada", lastName: "Yıldız",
      memberships: [{ departmentId: "avionics", department: "Aviyonik" }], owner: false, roles: [{ id: "member", name: "Üye" }],
    } }));
    await page.route("**/api/v1/permissions", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/v1/organization", (route) => route.fulfill({ json: { departments: [], teams: [] } }));
    await page.route("**/api/v1/apps", (route) => route.fulfill({ json: apps }));
    await page.route("**/api/v1/me/applications**", (route) => route.fulfill({ json: { applications: [] } }));
    await page.route("**/api/v1/directory/users?**", (route) => route.fulfill({ json: {
      users: [{ id: "user-2", username: "kerim", firstName: "Kerim", lastName: "Erduran" }],
      page: 1, total: 1, hasMore: false,
    } }));
    await page.goto(origin);
    await expect(page.getByRole("heading", { name: "Merhaba, Ada." })).toBeVisible();
    await expect(page.getByRole("button", { name: "STARLAB ayrıntılarını aç" })).toBeVisible();
    await expect(page.locator(".application-orbit")).toHaveCount(0);
    await page.getByRole("button", { name: "Uygulama veya üye ara" }).click();
    const search = page.getByRole("textbox", { name: "Uygulama, sayfa veya üye ara" });
    await expect(search).toBeFocused();
    await search.fill("kerim");
    await expect(page.getByRole("option", { name: /Kerim Erduran/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(search).not.toBeVisible();
  });
}

test("login orbit has quiet stars and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/me", (route) => route.fulfill({ status: 401, json: { error: { code: "authentication_required" } } }));
  await page.route("**/api/v1/apps", (route) => route.fulfill({ json: apps }));
  await page.goto(origin);
  await expect(page.locator(".orbital-node")).toHaveCount(1);
  await expect(page.getByText("TEK HESAP · TÜM UYGULAMALAR")).toHaveCount(0);
  await expect(page.locator(".auth-starfield > span")).toHaveCount(96);
  await expect(page.locator(".auth-starfield > span").first()).toHaveCSS("animation-name", "none");
});
