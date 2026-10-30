import { join } from "node:path";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:net";
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
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
  const servers: ChildProcess[] = [];
  test.setTimeout(60000);
  const sql = (query: string) => {
    const directory =
      "apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";
    for (const filename of readdirSync(directory).filter(
      (f) => f.endsWith(".sqlite") && f !== "metadata.sqlite",
    )) {
      const db = new DatabaseSync(join(directory, filename));
      try {
        if (
          db.prepare("SELECT 1 FROM sqlite_master WHERE name='users'").get()
        ) {
          db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
          db.exec(query);
          return;
        }
      } finally {
        db.close();
      }
    }
    throw new Error("local STARBASE database not found; run db:migrate first");
  };
  try {
    await page.goto(origin);
    await page
      .getByRole("button", { name: "Hesap oluştur", exact: true })
      .click();
    await page.getByLabel("İsim", { exact: true }).fill("Browser");
    await page.getByLabel("Soyisim", { exact: true }).fill("Test");
    await page.getByLabel("Kullanıcı adı").fill(username);
    await page.getByLabel("E-posta", { exact: true }).fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    const registrationResponse = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/v1/auth/register" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Hesap oluştur", exact: true })
      .click();
    const r = await registrationResponse;
    expect(r.status()).toBe(201);
    const identity = await (
      await request.post(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
        { data: { email, password, returnSecureToken: true } },
      )
    ).json();
    uid = identity.localId;
    expect(uid).toMatch(/^[A-Za-z0-9_-]+$/);
    await page
      .getByRole("button", { name: "Yerel doğrulama ekranını aç" })
      .click();
    await page
      .getByRole("button", { name: "E-postayı doğrula", exact: true })
      .click();
    await expect(
      page.getByText("E-posta adresin doğrulandı.", { exact: true }),
    ).toBeVisible();
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
    for (const [i, suffix] of ["one", "two"].entries()) {
      const clientId = username.replaceAll("_", "-") + "-" + suffix;
      const port = await new Promise<number>((resolve, reject) => {
        const probe = createServer();
        probe.on("error", reject);
        probe.listen(0, "127.0.0.1", () => {
          const port = (probe.address() as { port: number }).port;
          probe.close(() => resolve(port));
        });
      });
      const appOrigin = `http://127.0.0.1:${port}`;
      const registered = await page.request.post(
        origin + "/api/v1/admin/apps",
        {
          headers: { Origin: origin },
          data: {
            id: clientId,
            name: "Fixture " + suffix,
            redirects: [appOrigin + "/callback"],
            origins: [appOrigin],
            scopes: ["profile"],
          },
        },
      );
      expect(registered.status()).toBe(201);
      servers.push(
        spawn(
          process.execPath,
          [
            "node_modules/vite/bin/vite.js",
            "examples/vite",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
            "--strictPort",
          ],
          {
            env: {
              ...process.env,
              VITE_STARBASE_URL: origin,
              VITE_STARBASE_CLIENT_ID: clientId,
              VITE_STARBASE_SCOPES: "profile",
            },
            stdio: "ignore",
          },
        ),
      );
      await expect
        .poll(
          async () => {
            try {
              return (await fetch(appOrigin)).status;
            } catch {
              return 0;
            }
          },
          { timeout: 15000 },
        )
        .toBe(200);
      await page.goto(appOrigin);
      await page
        .getByRole("button", { name: "STARBASE ile giriş yap" })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Fixture " + suffix + " ile bağlantı kur",
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: "İzin ver ve devam et" }).click();
      await expect(page.locator("#app")).toContainText("applicationId");
      const profile = JSON.parse(await page.locator("#app").innerText());
      expect(profile.username).toBe(username);
      expect(profile.applicationId).toBe(clientId);
      expect(profile.email).toBeUndefined();
      // Existing approval and central session complete the second visit automatically.
      await page.goto(appOrigin);
      await page
        .getByRole("button", { name: "STARBASE ile giriş yap" })
        .click();
      await expect(page.locator("#app")).toContainText("applicationId");
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
    for (const server of servers) server.kill();
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
