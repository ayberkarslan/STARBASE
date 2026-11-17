import { expect, test } from "@playwright/test";

const origin = process.env.STARBASE_TEST_URL ?? "http://127.0.0.1:5173";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`board views and centered brand ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route("**/api/v1/me", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "test-user",
          username: "stargazer",
          firstName: "Ada",
          lastName: "Yıldız",
          email: "ada@example.test",
          memberships: [],
          owner: false,
        }),
      }),
    );
    await page.route("**/api/v1/permissions", (route) =>
      route.fulfill({ contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/organization", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ departments: [], teams: [] }),
      }),
    );
    await page.route("**/api/v1/apps", (route) =>
      route.fulfill({ contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/v1/board/notes**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          notes: [
            {
              id: "test-note",
              scope: "private",
              x: 24,
              y: 24,
              layoutVersion: 1,
              authorId: "test-user",
              authorFirstName: "Ada",
              authorLastName: "Yıldız",
              authorUsername: "stargazer",
              title: "Yörünge hesabı",
              content: "İlk deneme notu",
              kind: "note",
              teamId: null,
              team: null,
              dueAt: null,
              pinned: 0,
              archived: 0,
              version: 1,
              createdAt: 1_798_000_000,
              updatedAt: 1_798_000_000,
            },
          ],
          canModerate: false,
          page: 1,
          total: 1,
          hasMore: false,
        }),
      }),
    );

    await page.goto(origin);
    await expect(
      page.getByRole("button", { name: "STARBASE panoya dön" }),
    ).toBeVisible();
    const brandBox = await page
      .getByRole("button", { name: "STARBASE panoya dön" })
      .boundingBox();
    expect(brandBox).not.toBeNull();
    expect(
      Math.abs(brandBox!.x + brandBox!.width / 2 - viewport.width / 2),
    ).toBeLessThan(2);
    expect(await page.locator(".workspace-starfield > span").count()).toBe(14);
    const starLevels = await page
      .locator(".workspace-starfield > span")
      .first()
      .evaluate((star) => {
        const style = getComputedStyle(star);
        return {
          dim: Number(style.getPropertyValue("--star-dim")),
          bright: Number(style.getPropertyValue("--star-bright")),
          duration: parseFloat(style.animationDuration),
        };
      });
    expect(starLevels.dim).toBeLessThanOrEqual(0.07);
    expect(starLevels.bright).toBeLessThanOrEqual(0.22);
    expect(starLevels.duration).toBeGreaterThanOrEqual(22);
    await expect(page.locator(".workspace-home img")).toHaveJSProperty(
      "naturalWidth",
      749,
    );

    await page.getByRole("button", { name: "Boş ekran" }).click();
    await expect(page.getByLabel("Boş pano görünümü")).toBeVisible();
    await expect(page.locator(".sticky-note")).toHaveCount(0);
    await expect(page.locator(".blank-board img")).toBeVisible();
    const blankLogo = await page.locator(".blank-board img").boundingBox();
    expect(blankLogo).not.toBeNull();
    expect(
      Math.abs(blankLogo!.x + blankLogo!.width / 2 - viewport.width / 2),
    ).toBeLessThan(2);
    expect(
      Math.abs(blankLogo!.y + blankLogo!.height / 2 - viewport.height / 2),
    ).toBeLessThan(2);

    await page.getByRole("button", { name: "STARBASE panoya dön" }).click();
    await expect(
      page.getByRole("button", { name: "Kendi panom" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("heading", { name: "Yörünge hesabı" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Ortak pano" }).click();
    await expect(
      page.getByRole("button", { name: "Ortak pano" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
