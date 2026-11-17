import { expect, test } from "@playwright/test";

const base = process.env.STARBASE_TEST_URL ?? "http://127.0.0.1:5173";

test("application page keeps resources readable and revokes only a chosen session", async ({ page }) => {
  let revoked = "";
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: {
    id: "u1", username: "ada", firstName: "Ada", lastName: "Yıldız", owner: true, roles: [], memberships: [],
  } }));
  await page.route("**/api/v1/apps", (route) => route.fulfill({ json: [{ id: "yrt-latex-web", name: "YRT LaTeX", logoUrl: "/brand/yrt.png", launchUrl: "https://latex.example.test/" }] }));
  await page.route("**/api/v1/permissions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/organization", (route) => route.fulfill({ json: { departments: [], teams: [] } }));
  await page.route("**/api/v1/me/applications?**", (route) => route.fulfill({ json: { applications: [] } }));
  await page.route("**/api/v1/apps/yrt-latex-web/overview", (route) => route.fulfill({ json: {
    application: { id: "yrt-latex-web", name: "YRT LaTeX", logoUrl: "/brand/yrt.png", launchUrl: "https://latex.example.test/" },
    summary: { totalVisits: 2, lastSignInAt: 1790000000 }, visits: [{ signedInAt: 1790000000, endedAt: null, endReason: null }],
    resourceCount: 1, access: { connected: true, blocked: false, scopes: ["profile"] },
  } }));
  await page.route("**/api/v1/apps/yrt-latex-web/resources?**", (route) => route.fulfill({ json: {
    resources: [{ resourceId: "p1", title: "İtki raporu", date: "2026-11-17", status: "Teknik rapor", url: "https://latex.example.test/?project=p1", createdAt: 1790000000, updatedAt: 1790000100 }],
    total: 1, page: 1, hasMore: false,
  } }));
  await page.route("**/api/v1/apps/yrt-latex-web/sessions**", (route) => {
    if (route.request().method() === "DELETE") {
      revoked = route.request().url().split("/").at(-1) ?? "";
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { sessions: [
      { family: "chosen", signedInAt: 1790000000, userAgent: "Mozilla/5.0 Firefox/100.0 Linux", expires: 1800000000, live: true, lastSeenAt: 1790000100 },
      { family: "other", signedInAt: 1790000000, userAgent: "Mozilla/5.0 Chrome/100.0 Windows", expires: 1800000000, live: false, lastSeenAt: null },
    ] } });
  });
  await page.goto(base);
  await page.getByRole("button", { name: "YRT LaTeX ayrıntılarını aç" }).click();
  await expect(page.getByRole("heading", { name: "YRT LaTeX" })).toBeVisible();
  await expect(page.getByRole("link", { name: /İtki raporu/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Son girişlerim" })).toBeVisible();
  await page.getByRole("button", { name: "Oturumu kapat" }).first().click();
  await expect(page.getByText("Yalnız seçtiğin tarayıcı veya cihaz oturumu kapanacak.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Oturumu kapat" }).last().click();
  await expect.poll(() => revoked).toBe("chosen");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Belgelerim" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
