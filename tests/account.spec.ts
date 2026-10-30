import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
test("real Firebase account and administration", async ({ page, request }) => {
  test.skip(
    process.env.STARBASE_LIVE_TEST !== "1",
    "Requires local Firebase Auth Emulator and D1",
  );
  const origin = process.env.STARBASE_TEST_URL ?? "http://127.0.0.1:5173";
  const username = "browser_" + randomBytes(4).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const email = username + "@example.com";
  let uid = "";
  const sql = (query: string) =>
    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", "starbase", "--local", "--command", query],
      { cwd: "apps/api", stdio: "ignore" },
    );
  try {
    const r = await request.post(origin + "/api/v1/auth/register", {
      data: {
        username,
        password,
        email,
        firstName: "Browser",
        lastName: "Test",
      },
      headers: { Origin: origin },
    });
    expect(r.status()).toBe(201);
    const identity = await (
      await request.post(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
        { data: { email, password, returnSecureToken: true } },
      )
    ).json();
    uid = identity.localId;
    expect(uid).toMatch(/^[A-Za-z0-9_-]+$/);
    await request.post(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-starbase/accounts:update",
      {
        headers: { Authorization: "Bearer owner" },
        data: { localId: uid, emailVerified: true },
      },
    );
    await page.goto(origin);
    await page.getByLabel("Kullanıcı adı").fill(username);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Merhaba, Browser." }),
    ).toBeVisible();
    sql(`UPDATE users SET owner=1 WHERE id='${uid}';`);
    await page.reload();
    await page.getByRole("button", { name: "Üyeler", exact: true }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.getByText(email, { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Şifreyi sıfırla" }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/starbase-members.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Departmanlar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Aviyonik", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/starbase-departments.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Roller ve izinler", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Rol oluştur", exact: true }),
    ).toBeVisible();
    for (const suffix of ["one", "two"]) {
      const clientId = username.replaceAll("_", "-") + "-" + suffix;
      const registered = await page.request.post(
        origin + "/api/v1/admin/apps",
        {
          headers: { Origin: origin },
          data: {
            id: clientId,
            name: "Fixture " + suffix,
            redirects: [origin + "/callback"],
            origins: [origin],
            scopes: ["profile"],
          },
        },
      );
      expect(registered.status()).toBe(201);
      await page.evaluate(
        async ({ origin, clientId }) => {
          const sdk = await import("/@starbase-sdk");
          const client = new sdk.Starbase({
            baseUrl: origin,
            clientId,
            redirectUri: origin + "/callback",
            storage: sessionStorage,
          });
          await client.login(["profile"]);
        },
        { origin, clientId },
      );
      await expect(
        page.getByRole("heading", {
          name: "Fixture " + suffix + " ile bağlantı kur",
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: "İzin ver ve devam et" }).click();
      await page.waitForURL("**/callback?**");
      const profile = await page.evaluate(
        async ({ origin, clientId }) => {
          const sdk = await import("/@starbase-sdk");
          return new sdk.Starbase({
            baseUrl: origin,
            clientId,
            redirectUri: origin + "/callback",
            storage: sessionStorage,
          }).handleCallback();
        },
        { origin, clientId },
      );
      expect(profile.username).toBe(username);
      expect(profile.applicationId).toBe(clientId);
      expect(profile.email).toBeUndefined();
      await page.goto(origin);
    }
    const temporary = randomBytes(24).toString("base64url");
    const reset = await page.request.post(
      origin + "/api/v1/admin/users/" + uid + "/password",
      {
        headers: { Origin: origin },
        data: { currentPassword: password, temporaryPassword: temporary },
      },
    );
    expect(reset.status()).toBe(200);
    expect((await page.request.get(origin + "/api/v1/me")).status()).toBe(401);
    await page.reload();
    await page.getByLabel("Kullanıcı adı").fill(username);
    await page.getByLabel("Şifre", { exact: true }).fill(temporary);
    await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Yeni şifreni belirle." }),
    ).toBeVisible();
    expect((await page.request.get(origin + "/api/v1/me")).status()).toBe(403);
    await page.getByLabel("Mevcut / geçici şifre").fill(temporary);
    await page.getByLabel("Yeni şifre").fill(password);
    await page
      .getByRole("button", { name: "Şifreyi değiştir", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Tekrar hoş geldin." }),
    ).toBeVisible();
    await page.getByLabel("Kullanıcı adı").fill(username);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Merhaba, Browser." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Çıkış", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Tekrar hoş geldin." }),
    ).toBeVisible();
  } finally {
    if (uid) {
      await request.post(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key",
        { headers: { Authorization: "Bearer owner" }, data: { localId: uid } },
      );
      sql(
        `DELETE FROM codes WHERE user_id='${uid}'; DELETE FROM consents WHERE user_id='${uid}'; DELETE FROM sessions WHERE user_id='${uid}'; DELETE FROM families WHERE user_id='${uid}'; DELETE FROM users WHERE id='${uid}'; DELETE FROM apps WHERE id LIKE '${username.replaceAll("_", "-")}-%';`,
      );
    }
  }
});
