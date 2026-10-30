import { test, expect } from "@playwright/test";
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
])
  test(`login ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(process.env.STARBASE_TEST_URL ?? "http://127.0.0.1:5173");
    await expect(
      page.getByRole("heading", { name: "Tekrar hoş geldin." }),
    ).toBeVisible();
    await expect(page.getByLabel("Kullanıcı adı")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/starbase-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Hesap oluştur" }).click();
    await expect(page.getByLabel("Soyisim", { exact: true })).toBeVisible();
    await page.getByLabel("İsim", { exact: true }).fill("Ada");
    await page.getByLabel("Soyisim", { exact: true }).fill("Yıldız");
    await page.getByLabel("Kullanıcı adı").fill("ada");
    await page.getByLabel("E-posta", { exact: true }).fill("ada@example.com");
    await page
      .getByLabel("Şifre", { exact: true })
      .fill("starbase-test-password");
  });

test("developer docs expose the standalone SDK and API contract", async ({
  page,
  request,
}) => {
  const origin = process.env.STARBASE_TEST_URL ?? "http://127.0.0.1:5173";
  await page.goto(origin + "/docs");
  await expect(
    page.getByRole("heading", { name: "Takımına bağlan." }),
  ).toBeVisible();
  const download = await request.get(origin + "/downloads/starbase-sdk.tgz");
  expect(download.status()).toBe(200);
  const bytes = await download.body();
  expect([...bytes.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
  await page.getByRole("button", { name: "Vite / React", exact: true }).click();
  await expect(
    page
      .locator(".developer-docs")
      .getByText("React bağlantısı", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "API", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "OpenAPI JSON’u aç" }),
  ).toBeVisible();
  const schema = await (await request.get(origin + "/api/openapi.json")).json();
  expect(schema.paths["/api/v1/directory/users"].get.security).toEqual([
    { central: [] },
  ]);
  expect(
    schema.paths["/api/v1/auth/logout"].post.security.length,
  ).toBeGreaterThan(0);
});
