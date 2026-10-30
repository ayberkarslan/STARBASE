import { join } from "node:path";
import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:net";
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
test("real Firebase account and administration", async ({
  page,
  request,
  browser,
}) => {
  test.skip(
    process.env.STARBASE_LIVE_TEST !== "1",
    "Requires local Firebase Auth Emulator and D1",
  );
  const origin = process.env.STARBASE_TEST_URL ?? "http://127.0.0.1:5173";
  const username = "browser_" + randomBytes(4).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const email = username + "@example.com";
  let uid = "";
  const addedMembers: string[] = [];
  let notesContext: import("@playwright/test").BrowserContext | undefined;
  const memberPassword = randomBytes(24).toString("base64url");
  const servers: ChildProcess[] = [];
  test.setTimeout(90000);
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
      page.getByRole("heading", { name: "Sana ait bir alan.", exact: true }),
    ).toBeVisible();
    sql(`UPDATE users SET owner=1 WHERE id='${uid}';`);
    await page.reload();
    await page.getByRole("button", { name: "Menü", exact: true }).hover();
    await page
      .locator(".workspace-menu")
      .getByRole("button", { name: "Üyeler", exact: true })
      .click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.getByText(email, { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Şifreyi sıfırla" }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/starbase-members.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Üye ekle", exact: true }).click();
    const memberDialog = page.getByRole("dialog", {
      name: "Üye ekle",
      exact: true,
    });
    await memberDialog.getByLabel("İsim", { exact: true }).fill("Added");
    await memberDialog.getByLabel("Soyisim", { exact: true }).fill("Member");
    await memberDialog.getByLabel("Kullanıcı adı").fill(username + "_member");
    await memberDialog
      .getByLabel("E-posta", { exact: true })
      .fill(username + "_member@example.com");
    await memberDialog.getByRole("combobox", { name: "teamId" }).click();
    await memberDialog
      .getByRole("option", { name: "Aviyonik / Yazılım" })
      .click();
    await memberDialog
      .getByLabel("Geçici şifre", { exact: true })
      .fill(memberPassword);
    await memberDialog
      .getByLabel("Yönetici şifren", { exact: true })
      .fill(password);
    const newMemberResponse = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/v1/admin/users" &&
        r.request().method() === "POST",
    );
    await memberDialog.getByRole("button", { name: "Üyeyi oluştur" }).click();
    const newMember = await newMemberResponse;
    expect(newMember.status()).toBe(201);
    const createdMember = await newMember.json();
    addedMembers.push(createdMember.user.id);
    await expect(memberDialog).not.toBeVisible();
    await expect(
      page.getByText(username + "_member@example.com", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator(".admin-forms .org-row")
        .getByText("Aviyonik / Yazılım", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Menü", exact: true }).hover();
    await page
      .locator(".workspace-menu")
      .getByRole("button", { name: "Pano", exact: true })
      .click();
    notesContext = await browser.newContext();
    const memberPage = await notesContext.newPage();
    await memberPage.goto(createdMember.developmentVerificationUrl);
    await memberPage
      .getByRole("button", { name: "E-postayı doğrula", exact: true })
      .click();
    await memberPage.getByLabel("Kullanıcı adı").fill(username + "_member");
    await memberPage.getByLabel("Şifre", { exact: true }).fill(memberPassword);
    await memberPage
      .getByRole("button", { name: "Giriş yap", exact: true })
      .click();
    await memberPage.getByLabel("Mevcut / geçici şifre").fill(memberPassword);
    const personalPassword = randomBytes(24).toString("base64url");
    await memberPage.getByLabel("Yeni şifre").fill(personalPassword);
    await memberPage
      .getByRole("button", { name: "Şifreyi değiştir", exact: true })
      .click();
    await memberPage.getByLabel("Kullanıcı adı").fill(username + "_member");
    await memberPage
      .getByLabel("Şifre", { exact: true })
      .fill(personalPassword);
    await memberPage
      .getByRole("button", { name: "Giriş yap", exact: true })
      .click();
    await expect(page.locator(".notes-connection")).toContainText(
      "Canlı güncelleniyor",
    );
    await expect(memberPage.locator(".notes-connection")).toContainText(
      "Canlı güncelleniyor",
    );
    // Each account starts in a private board, including users without team roles.
    await expect(
      page.getByRole("button", { name: "Kendi panom", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Menü", exact: true }).hover();
    await expect(page.locator(".workspace-menu")).toBeVisible();
    await page.mouse.move(700, 200);
    await expect(page.locator(".workspace-menu")).toHaveCount(0);
    await page.getByRole("button", { name: "Not ekle", exact: true }).click();
    const personal = page.getByRole("dialog", { name: "Panoya not ekle" });
    await personal
      .getByLabel("Başlık", { exact: true })
      .fill(username + " özel not");
    await personal
      .getByLabel("Not", { exact: true })
      .fill("Yalnızca bana ait.");
    await personal
      .getByRole("button", { name: "Panoya ekle", exact: true })
      .click();
    const personalNote = page
      .locator(".sticky-note")
      .filter({ hasText: username + " özel not" });
    await expect(personalNote).toBeVisible();
    const memberPrivate: any = await (
      await memberPage.request.get(origin + "/api/v1/board/notes?scope=private")
    ).json();
    expect(
      memberPrivate.notes.some((n: any) => n.title === username + " özel not"),
    ).toBe(false);
    const handle = personalNote.locator("..").getByRole("button", {
      name: username + " özel not notunu taşı",
      exact: true,
    });
    const start = await handle.boundingBox();
    const moved = page.waitForResponse(
      (r) => r.url().endsWith("/position") && r.request().method() === "PATCH",
    );
    await page.mouse.move(start!.x + 25, start!.y + 12);
    await page.mouse.down();
    await page.mouse.move(start!.x + 205, start!.y + 102, { steps: 12 });
    await page.mouse.up();
    expect((await moved).status()).toBe(200);
    await page.reload();
    await expect(personalNote).toBeVisible();
    const saved: any = await (
      await page.request.get(origin + "/api/v1/board/notes?scope=private")
    ).json();
    const savedNote = saved.notes.find(
      (n: any) => n.title === username + " özel not",
    );
    expect(savedNote.x).toBeGreaterThanOrEqual(200);
    expect(savedNote.y).toBeGreaterThanOrEqual(120);
    await expect(personalNote.locator("..")).toHaveCSS(
      "transform",
      `matrix(1, 0, 0, 1, ${savedNote.x}, ${savedNote.y})`,
    );
    const keyboardMove = page.waitForResponse(
      (r) => r.url().endsWith("/position") && r.request().method() === "PATCH",
    );
    await handle.focus();
    await handle.press("Shift+ArrowRight");
    expect((await keyboardMove).status()).toBe(200);
    await expect(personalNote.locator("..")).toHaveCSS(
      "transform",
      `matrix(1, 0, 0, 1, ${savedNote.x + 40}, ${savedNote.y})`,
    );
    const touchContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      storageState: await page.context().storageState(),
    });
    try {
      const touchPage = await touchContext.newPage();
      await touchPage.goto(origin);
      await touchPage.getByRole("button", { name: "Menü", exact: true }).tap();
      await expect(touchPage.locator(".workspace-menu")).toBeVisible();
      await touchPage
        .locator(".workspace-menu")
        .getByRole("button", { name: "Pano", exact: true })
        .tap();
      await expect(touchPage.locator(".workspace-menu")).toHaveCount(0);
    } finally {
      await touchContext.close();
    }
    await page.screenshot({
      path: "/tmp/starbase-private-canvas.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Ortak pano", exact: true }).click();
    await memberPage
      .getByRole("button", { name: "Ortak pano", exact: true })
      .click();
    await expect(page.locator(".notes-connection")).toContainText(
      "Canlı güncelleniyor",
    );
    await expect(memberPage.locator(".notes-connection")).toContainText(
      "Canlı güncelleniyor",
    );
    await page.getByRole("button", { name: "Not ekle", exact: true }).click();
    const noteDialog = page.getByRole("dialog", { name: "Panoya not ekle" });
    await noteDialog
      .getByLabel("Başlık", { exact: true })
      .fill(username + " test duyurusu");
    await noteDialog
      .getByLabel("Not", { exact: true })
      .fill("Statik test hazırlığı tamamlanıyor.");
    await noteDialog.getByRole("combobox", { name: "Not veya duyuru" }).click();
    await noteDialog
      .getByRole("option", { name: "Duyuru", exact: true })
      .click();
    await noteDialog
      .getByRole("button", { name: "Panoya ekle", exact: true })
      .click();
    const remoteNote = memberPage
      .locator(".sticky-note")
      .filter({ hasText: username + " test duyurusu" });
    await expect(remoteNote).toBeVisible();
    await page.getByRole("button", { name: "Not ekle", exact: true }).click();
    const freshNote = page.getByRole("dialog", { name: "Panoya not ekle" });
    await expect(freshNote.getByLabel("Başlık", { exact: true })).toHaveValue(
      "",
    );
    await expect(freshNote.getByLabel("Not", { exact: true })).toHaveValue("");
    await freshNote.getByRole("button", { name: "Kapat", exact: true }).click();

    await expect(
      remoteNote.getByRole("button", { name: "Notu düzenle" }),
    ).toHaveCount(0);
    await memberPage
      .getByRole("button", { name: "Not ekle", exact: true })
      .click();
    const memberNoteDialog = memberPage.getByRole("dialog", {
      name: "Panoya not ekle",
    });
    await memberNoteDialog
      .getByLabel("Başlık", { exact: true })
      .fill(username + " üye notu");
    await memberNoteDialog
      .getByLabel("Not", { exact: true })
      .fill("Kontrol listesi hazır.");
    await memberNoteDialog
      .getByRole("button", { name: "Panoya ekle", exact: true })
      .click();
    const shared = page
      .locator(".sticky-note")
      .filter({ hasText: username + " üye notu" });
    await expect(shared).toBeVisible();
    await shared
      .getByRole("button", { name: "Notu sabitle", exact: true })
      .click();
    const memberOwnNote = memberPage
      .locator(".sticky-note")
      .filter({ hasText: username + " üye notu" });
    await expect(memberOwnNote).toContainText("Sabit");
    await memberOwnNote
      .getByRole("button", { name: "Notu düzenle", exact: true })
      .click();
    const edit = memberPage.getByRole("dialog", { name: "Notu düzenle" });
    await edit
      .getByLabel("Not", { exact: true })
      .fill("Kontrol listesi güncellendi.");
    await edit
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    await expect(shared).toContainText("Kontrol listesi güncellendi.");
    await page.screenshot({
      path: "/tmp/starbase-sticky-notes.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Menü", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/tmp/starbase-sticky-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page
      .locator(".sticky-note")
      .filter({ hasText: username + " test duyurusu" })
      .getByRole("button", { name: "Notu arşivle", exact: true })
      .click();
    await expect(remoteNote).not.toBeVisible();
    await notesContext.close();
    notesContext = undefined;
    await page.getByRole("button", { name: "Menü", exact: true }).hover();
    await page
      .locator(".workspace-menu")
      .getByRole("button", { name: "Takım dizini", exact: true })
      .click();
    await page.getByRole("searchbox", { name: "Üye ara" }).fill("Added Member");
    await page
      .locator(".member-card")
      .filter({ hasText: "@" + username + "_member" })
      .click();
    const publicProfile = page.getByRole("dialog", {
      name: "Added Member",
      exact: true,
    });
    await expect(
      publicProfile.getByText("Yazılım", { exact: true }),
    ).toBeVisible();
    await expect(
      publicProfile.getByText(username + "_member@example.com", {
        exact: true,
      }),
    ).toHaveCount(0);
    await publicProfile
      .getByRole("button", { name: "Kapat", exact: true })
      .click();
    await page.getByRole("button", { name: "Menü", exact: true }).hover();
    await page
      .locator(".workspace-menu")
      .getByRole("button", { name: "Ekipler", exact: true })
      .click();
    await page
      .locator(".directory-team-list")
      .getByRole("button")
      .filter({ hasText: "Yazılım" })
      .click();
    await expect(
      page
        .locator(".member-card")
        .filter({ hasText: "@" + username + "_member" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "/tmp/starbase-board.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Menü", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/tmp/starbase-board-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Menü", exact: true }).hover();
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
    await page.getByRole("button", { name: "Menü", exact: true }).hover();
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
      const profile = JSON.parse(
        await page.locator("[data-profile]").innerText(),
      );
      expect(profile.username).toBe(username);
      expect(profile.applicationId).toBe(clientId);
      expect(profile.email).toBeUndefined();
      await page
        .getByRole("button", { name: "Çıkış yap", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "STARBASE ile giriş yap" }),
      ).toBeVisible();
      // Existing approval and central session complete the second visit automatically.
      await page.goto(appOrigin);
      await page
        .getByRole("button", { name: "STARBASE ile giriş yap" })
        .click();
      await expect(page.locator("#app")).toContainText("applicationId");
      await page.goto(origin);
    }
    const activity = await (
      await page.request.get(origin + "/api/v1/directory/users/" + uid)
    ).json();
    expect(activity.applications).toHaveLength(2);
    expect(
      activity.applications.every((a: any) => a.lastSignOutAt !== null),
    ).toBe(true);
    expect(activity.total).toBe(4);
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
      page.getByRole("heading", { name: "Sana ait bir alan.", exact: true }),
    ).toBeVisible();
    await page.goto(origin + "/docs");
    await expect(
      page.getByRole("heading", { name: "Takımına bağlan.", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Çıkış", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Tekrar hoş geldin." }),
    ).toBeVisible();
  } finally {
    for (const server of servers) server.kill();
    await notesContext?.close();
    for (const id of addedMembers) {
      await request.post(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key",
        { headers: { Authorization: "Bearer owner" }, data: { localId: id } },
      );
      sql(
        `DELETE FROM board_notes WHERE author_id='${id}'; DELETE FROM codes WHERE user_id='${id}'; DELETE FROM consents WHERE user_id='${id}'; DELETE FROM sessions WHERE user_id='${id}'; DELETE FROM families WHERE user_id='${id}'; DELETE FROM memberships WHERE user_id='${id}'; DELETE FROM user_roles WHERE user_id='${id}'; DELETE FROM users WHERE id='${id}';`,
      );
    }
    if (uid) {
      await request.post(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key",
        { headers: { Authorization: "Bearer owner" }, data: { localId: uid } },
      );
      sql(
        `DELETE FROM board_notes WHERE author_id='${uid}'; DELETE FROM application_visits WHERE user_id='${uid}'; DELETE FROM application_usage WHERE user_id='${uid}'; DELETE FROM codes WHERE user_id='${uid}'; DELETE FROM consents WHERE user_id='${uid}'; DELETE FROM sessions WHERE user_id='${uid}'; DELETE FROM families WHERE user_id='${uid}'; DELETE FROM users WHERE id='${uid}'; DELETE FROM apps WHERE id LIKE '${username.replaceAll("_", "-")}-%';`,
      );
    }
  }
});
