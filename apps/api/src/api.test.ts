import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { app } from "./index";
import { hash, challenge, now } from "./security";
let db: DatabaseSync;
let env: any;
class Statement {
  values: any[] = [];
  constructor(private sql: string) {}
  bind(...v: any[]) {
    this.values = v;
    return this;
  }
  async first() {
    return db.prepare(this.sql).get(...this.values) ?? null;
  }
  async run() {
    return db.prepare(this.sql).run(...this.values);
  }
  async all() {
    return { results: db.prepare(this.sql).all(...this.values) };
  }
}
beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync("apps/api/migrations/0001_core.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0002_invites.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0003_families.sql", "utf8"));
  db.exec(
    readFileSync("apps/api/migrations/0004_directory_activity.sql", "utf8"),
  );
  db.exec(readFileSync("apps/api/migrations/0005_board_notes.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0006_board_canvas.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0007_app_branding.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0008_app_logo_storage.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0009_team_branding.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0010_department_branding.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0011_image_assets.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0012_app_launch.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0013_app_resources.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0014_app_auto_authorize.sql", "utf8"));
  db.exec(readFileSync("apps/api/migrations/0015_recent_admin_auth.sql", "utf8"));
  env = {
    PUBLIC_ORIGIN: "https://base.test",
    BOARD_HUB: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async () => new Response(null, { status: 204 }) }),
    },
    DB: {
      prepare: (s: string) => new Statement(s),
      batch: async (s: Statement[]) => {
        db.exec("BEGIN");
        try {
          const r = [];
          for (const q of s) r.push(await q.run());
          db.exec("COMMIT");
          return r;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    ASSETS: { fetch: () => new Response("asset") },
    FIREBASE_API_KEY: "test",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  };
  db.prepare(
    "INSERT INTO users(id,username,email,first_name,last_name,verified,owner,created_at) VALUES(?,?,?,?,?,?,?,?)",
  ).run("u1", "alice", "a@test.com", "Alice", "Test", 1, 1, now());
  db.prepare(
    "INSERT INTO users(id,username,email,first_name,last_name,verified,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run("u2", "bob", "b@test.com", "Bob", "Test", 1, now());
  db.prepare("INSERT INTO families(id,user_id,expires) VALUES(?,?,?)").run(
    "f",
    "u1",
    now() + 1000,
  );
  db.prepare(
    "INSERT INTO sessions(hash,user_id,kind,expires,family,created_at) VALUES(?,?,?,?,?,?)",
  ).run(await hash("central"), "u1", "central", now() + 1000, "f", now());
  db.prepare(
    "INSERT INTO apps(id,name,redirects,origins,scopes) VALUES(?,?,?,?,?)",
  ).run(
    "starlab",
    "STARLAB",
    '["https://lab.test/callback"]',
    '["https://lab.test"]',
    '["profile","email"]',
  );
});
afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});
function call(
  path: string,
  body?: unknown,
  authorization = "central",
  method?: string,
) {
  return app.request(
    "https://base.test/api/v1" + path,
    {
      method: method ?? (body ? "POST" : "GET"),
      headers: {
        Origin: "https://base.test",
        ...(authorization === "central"
          ? { Cookie: "starbase=central" }
          : authorization
            ? { Authorization: "Bearer " + authorization }
            : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    env,
  );
}

it("accepts a same-origin central session on a second hostname", async () => {
  const response = await app.request("https://legacy.test/api/v1/auth/logout", {
    method: "POST",
    headers: { Origin: "https://legacy.test", Cookie: "starbase=central" },
  }, env);
  expect(response.status).toBe(200);
});
function uploadLogo(
  appId: string,
  bytes: Uint8Array,
  contentType: string,
  authorization = "central",
) {
  return app.request(
    `https://base.test/api/v1/admin/apps/${appId}/logo`,
    {
      method: "POST",
      headers: {
        Origin: "https://base.test",
        "Content-Type": contentType,
        ...(authorization === "central"
          ? { Cookie: "starbase=central" }
          : authorization
            ? { Authorization: `Bearer ${authorization}` }
            : {}),
      },
      body: new Blob([new Uint8Array(bytes).buffer], { type: contentType }),
    },
    env,
  );
}
function uploadDepartmentLogo(id: string, bytes: Uint8Array) {
  return app.request(
    `https://base.test/api/v1/admin/departments/${id}/logo`,
    {
      method: "POST",
      headers: { Origin: "https://base.test", "Content-Type": "image/png", Cookie: "starbase=central" },
      body: new Blob([new Uint8Array(bytes).buffer], { type: "image/png" }),
    },
    env,
  );
}
async function loginCode(scopes = ["profile"]) {
  const verifier = "a".repeat(64);
  const r = await call("/authorize", {
    clientId: "starlab",
    redirectUri: "https://lab.test/callback",
    scopes,
    challenge: await challenge(verifier),
    state: "b".repeat(32),
  });
  const b: any = await r.json();
  return {
    code: new URL(b.redirect).searchParams.get("code"),
    verifier,
    clientId: "starlab",
    redirectUri: "https://lab.test/callback",
  };
}
describe("identity boundaries", () => {
  it("updates member names without revoking sessions", async () => {
    const response = await call("/admin/users/u2/profile", { firstName: "Yeni", lastName: "Ad" }, "central", "PATCH");
    expect(response.status).toBe(200);
    expect(db.prepare("SELECT first_name,last_name FROM users WHERE id='u2'").get()).toMatchObject({ first_name: "Yeni", last_name: "Ad" });
    expect(db.prepare("SELECT revoked FROM families WHERE id='f'").get()).toMatchObject({ revoked: 0 });
  });
  it("validates all profile fields before saving a batch", async () => {
    db.prepare("INSERT INTO profile_fields(key,label,type,options) VALUES('position','Görev','text','[]')").run();
    const bad = await call("/admin/profile-values/u2/batch", { values: [{ key: "position", value: "Pilot" }, { key: "unknown", value: "x" }] }, "central", "PUT");
    expect(bad.status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) count FROM profile_values").get()).toMatchObject({ count: 0 });
    const saved = await call("/admin/profile-values/u2/batch", { values: [{ key: "position", value: "Pilot" }] }, "central", "PUT");
    expect(saved.status).toBe(200);
  });
  it("auto authorizes only an explicitly trusted application", async () => {
    db.prepare("INSERT INTO apps(id,name,redirects,origins,scopes,auto_authorize) VALUES(?,?,?,?,?,1)").run(
      "test-formu-web", "YRT Test Takvimi", '["https://calendar.test/callback"]', '["https://calendar.test"]', '["profile","organization"]',
    );
    const query = (clientId: string, redirectUri: string) => `/authorize?${new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, scope: "profile", code_challenge: "a".repeat(43), state: "b".repeat(32),
    })}`;
    const trusted = await call(query("test-formu-web", "https://calendar.test/callback"));
    const regular = await call(query("starlab", "https://lab.test/callback"));
    expect(trusted.status).toBe(200);
    expect((await trusted.json() as { approved: boolean }).approved).toBe(true);
    expect((await regular.json() as { approved: boolean }).approved).toBe(false);
  });
  it("rejects unauthenticated profile access", async () =>
    expect((await call("/me", undefined, "")).status).toBe(401));
  it("projects only approved profile fields", async () => {
    const r = await call("/auth/exchange", await loginCode(), "");
    const t: any = await r.json();
    expect(r.status).toBe(200);
    const profile: any = await (
      await call("/me", undefined, t.accessToken)
    ).json();
    expect(profile.firstName).toBe("Alice");
    expect(profile.email).toBeUndefined();
    expect(profile.owner).toBeUndefined();
  });
  it("authorization codes are single use", async () => {
    const b = await loginCode();
    expect((await call("/auth/exchange", b, "")).status).toBe(200);
    expect((await call("/auth/exchange", b, "")).status).toBe(400);
  });
  it("rejects wrong PKCE without consuming valid code", async () => {
    const b = await loginCode();
    expect(
      (await call("/auth/exchange", { ...b, verifier: "x".repeat(64) }, ""))
        .status,
    ).toBe(400);
    expect((await call("/auth/exchange", b, "")).status).toBe(200);
  });
  it("rejects unregistered callback addresses", async () =>
    expect(
      (
        await call("/authorize", {
          clientId: "starlab",
          redirectUri: "https://evil.test",
          scopes: ["profile"],
          challenge: "a".repeat(43),
          state: "b".repeat(32),
        })
      ).status,
    ).toBe(400));
  it("rejects scopes not registered for app", async () => {
    expect(
      (
        await call("/authorize", {
          clientId: "starlab",
          redirectUri: "https://lab.test/callback",
          scopes: ["organization"],
          challenge: "a".repeat(43),
          state: "b".repeat(32),
        })
      ).status,
    ).toBe(400);
  });
  it("rejects app tokens for administration", async () => {
    const t: any = await (
      await call("/auth/exchange", await loginCode(), "")
    ).json();
    expect((await call("/admin/users", undefined, t.accessToken)).status).toBe(
      403,
    );
  });
  it("refresh replay revokes entire token family", async () => {
    const t: any = await (
      await call("/auth/exchange", await loginCode(), "")
    ).json();
    const b = { clientId: "starlab", refreshToken: t.refreshToken };
    const next: any = await (await call("/auth/refresh", b, "")).json();
    expect(next.accessToken).toBeTruthy();
    expect((await call("/auth/refresh", b, "")).status).toBe(401);
    expect((await call("/me", undefined, next.accessToken)).status).toBe(401);
  });
  it("connection removal revokes app session immediately", async () => {
    const t: any = await (
      await call("/auth/exchange", await loginCode(), "")
    ).json();
    await call("/connections/starlab", undefined, "central", "DELETE");
    expect((await call("/me", undefined, t.accessToken)).status).toBe(401);
  });
  it("blocks disabled accounts", async () => {
    db.exec("UPDATE users SET disabled=1 WHERE id='u1'");
    expect((await call("/me")).status).toBe(401);
  });
  it("blocks regular access until temporary password changed", async () => {
    db.exec("UPDATE users SET must_change_password=1 WHERE id='u1'");
    expect((await call("/me")).status).toBe(403);
  });
  it("protects cookie mutations from cross-site requests", async () =>
    expect(
      (
        await app.request(
          "https://base.test/api/v1/auth/logout",
          {
            method: "POST",
            headers: { Cookie: "starbase=central", Origin: "https://lab.test" },
          },
          env,
        )
      ).status,
    ).toBe(403));
  it("rejects oversized input", async () =>
    expect(
      (await call("/auth/login", { username: "a".repeat(17000) })).status,
    ).toBe(400));
  it("supports 50 concurrent reads without a user limit", async () => {
    const responses = await Promise.all(
      Array.from({ length: 50 }, () => call("/me")),
    );
    expect(responses.every((r) => r.status === 200)).toBe(true);
  });
  it("returns generic recovery response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 400 })),
    );
    const r = await call("/auth/recover", { email: "unknown@test.com" }, "");
    expect(r.status).toBe(200);
  });
});

describe("application branding", () => {
  it("lists enabled application branding before login", async () => {
    db.prepare("UPDATE apps SET logo_url='uploaded' WHERE id='starlab'").run();
    const response = await call("/apps", undefined, "");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "starlab", name: "STARLAB", logoUrl: "/api/v1/apps/starlab/logo", launchUrl: "" }]);
  });
  it("returns branding only for a registered callback URI", async () => {
    db.prepare("UPDATE apps SET logo_url=? WHERE id=?").run("uploaded", "starlab");

    const response = await call(
      "/apps/starlab/branding?redirectUri=" +
        encodeURIComponent("https://lab.test/callback"),
      undefined,
      "",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "starlab",
      name: "STARLAB",
      logoUrl: "/api/v1/apps/starlab/logo",
    });

    const unregistered = await call(
      "/apps/starlab/branding?redirectUri=" +
        encodeURIComponent("https://other.test/callback"),
      undefined,
      "",
    );
    expect(unregistered.status).toBe(404);
  });

  it("uploads a supported raster logo and serves it from the Starbase origin", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const uploaded = await uploadLogo("starlab", png, "image/png");
    expect(uploaded.status).toBe(200);
    expect(await uploaded.json()).toEqual({
      logoUrl: "/api/v1/apps/starlab/logo",
    });

    const logo = await call("/apps/starlab/logo", undefined, "");
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await logo.arrayBuffer())).toEqual(png);
    expect(logo.headers.get("x-content-type-options")).toBe("nosniff");
    expect(logo.headers.get("cache-control")).toBe("no-store");
    expect(db.prepare("SELECT content_type,length(content) size FROM image_assets WHERE key=?")
      .get("apps/starlab/logo")).toEqual({ content_type: "image/png", size: png.length });
  });

  it("rejects unsupported, mismatched and oversized logo files", async () => {
    const svg = new TextEncoder().encode("<svg></svg>");
    expect((await uploadLogo("starlab", svg, "image/svg+xml")).status).toBe(
      400,
    );
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect((await uploadLogo("starlab", png, "image/jpeg")).status).toBe(400);
    expect(
      (await uploadLogo("starlab", new Uint8Array(1048577), "image/png"))
        .status,
    ).toBe(400);
  });

  it("requires app management permission and allows removing the logo", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(
      (await uploadLogo("starlab", png, "image/png", "")).status,
    ).toBe(401);
    await uploadLogo("starlab", png, "image/png");
    const removed = await call("/admin/apps/starlab/logo", undefined, "central", "DELETE");
    expect(removed.status).toBe(200);
    expect((await call("/apps/starlab/logo", undefined, "")).status).toBe(404);
    expect(db.prepare("SELECT COUNT(*) count FROM image_assets").get()).toEqual({ count: 0 });
  });

  it("creates apps without an uploaded logo and updates branding without revoking sessions", async () => {
    const response = await call("/admin/apps", {
      id: "orbit-notes",
      name: "Orbit Notes",
      redirects: ["https://orbit.test/callback"],
      origins: ["https://orbit.test"],
      scopes: ["profile"],
    });
    expect(response.status).toBe(201);
    expect(
      db.prepare("SELECT logo_url FROM apps WHERE id=?").get("orbit-notes")!
        .logo_url,
    ).toBe("");
    db.prepare(
      "INSERT INTO families(id,user_id,app_id,expires) VALUES(?,?,?,?)",
    ).run("app-family", "u1", "starlab", now() + 1000);

    const updated = await call(
      "/admin/apps/starlab",
      { name: "Starlab Portal" },
      "central",
      "PUT",
    );
    expect(updated.status).toBe(200);
    expect(
      db.prepare("SELECT name,logo_url FROM apps WHERE id=?").get("starlab"),
    ).toEqual({
      name: "Starlab Portal",
      logo_url: "",
    });
    expect(
      db.prepare("SELECT revoked FROM families WHERE id=?").get("app-family")!
        .revoked,
    ).toBe(0);
  });

  it("keeps branding unavailable when an application is disabled", async () => {
    await db.prepare("UPDATE apps SET disabled=1 WHERE id=?").run("starlab");
    const response = await call(
      "/apps/starlab/branding?redirectUri=" +
        encodeURIComponent("https://lab.test/callback"),
      undefined,
      "",
    );
    expect(response.status).toBe(404);
  });
});

describe("department branding", () => {
  it("uploads and serves a department patch to team members", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    expect((await uploadDepartmentLogo("avionics", png)).status).toBe(200);
    const directory: any = await (await call("/directory/teams")).json();
    expect(directory.departments.find((d: any) => d.id === "avionics").logoUrl).toBe(
      "/api/v1/directory/departments/avionics/logo",
    );
    const logo = await call("/directory/departments/avionics/logo");
    expect(logo.status).toBe(200);
    expect(new Uint8Array(await logo.arrayBuffer())).toEqual(png);
  });
});

describe("admin member creation", () => {
  const input = {
    username: "new.member",
    email: "new@test.com",
    firstName: "New",
    lastName: "Member",
    temporaryPassword: "temporary-password-123",
    currentPassword: "admin-password",
    teamId: "software",
  };
  function identityMock(rejectSignup = false) {
    const f = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.includes("signInWithPassword"))
        return Response.json({ localId: "u1", idToken: "admin-token" });
      if (path.includes("signUp"))
        return rejectSignup
          ? Response.json({}, { status: 400 })
          : Response.json({ localId: "u3", idToken: "new-token" });
      return Response.json({});
    });
    vi.stubGlobal("fetch", f);
    return f;
  }
  afterEach(() => vi.unstubAllGlobals());
  it("creates a normal member with forced password change and optional team", async () => {
    identityMock();
    const r = await call("/admin/users", { ...input, owner: true });
    expect(r.status).toBe(201);
    const result: any = await r.json();
    expect(result.user.owner).toBe(0);
    expect(result).not.toHaveProperty("temporaryPassword");
    expect(
      db
        .prepare("SELECT must_change_password,verified FROM users WHERE id=?")
        .get("u3"),
    ).toMatchObject({ must_change_password: 1, verified: 0 });
    expect(
      db.prepare("SELECT role_id FROM user_roles WHERE user_id=?").all("u3"),
    ).toEqual([{ role_id: "member" }]);
    expect(
      db.prepare("SELECT team_id FROM memberships WHERE user_id=?").get("u3"),
    ).toMatchObject({ team_id: "software" });
    expect(
      JSON.stringify(db.prepare("SELECT * FROM audit").all()),
    ).not.toContain(input.temporaryPassword);
  });
  it("rejects administrators without user management permission", async () => {
    db.exec("UPDATE users SET owner=0 WHERE id='u1'");
    const fetcher = identityMock();
    expect((await call("/admin/users", input)).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires the administrators current password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 400 })),
    );
    expect((await call("/admin/users", input)).status).toBe(401);
    expect(db.prepare("SELECT COUNT(*) count FROM users").get()).toMatchObject({
      count: 2,
    });
  });
  it("rejects duplicates before creating a Firebase identity", async () => {
    const f = identityMock();
    expect(
      (await call("/admin/users", { ...input, username: "alice" })).status,
    ).toBe(409);
    expect(f.mock.calls.every(([url]) => !String(url).includes("signUp"))).toBe(
      true,
    );
  });
  it("rejects archived teams before account creation", async () => {
    db.exec("UPDATE teams SET archived=1 WHERE id='software'");
    const f = identityMock();
    expect((await call("/admin/users", input)).status).toBe(400);
    expect(f.mock.calls.every(([url]) => !String(url).includes("signUp"))).toBe(
      true,
    );
  });
  it("rolls back reservations when Firebase rejects signup", async () => {
    identityMock(true);
    expect((await call("/admin/users", input)).status).toBe(400);
    expect(
      db.prepare("SELECT id FROM users WHERE username=?").get(input.username),
    ).toBeUndefined();
  });
  it("compensates Firebase creation if local provisioning fails", async () => {
    const f = identityMock();
    env.DB.batch = async () => {
      throw new Error("database unavailable");
    };
    expect((await call("/admin/users", input)).status).toBe(503);
    expect(
      f.mock.calls.some(([url]) => String(url).includes("accounts:delete")),
    ).toBe(true);
    expect(
      db.prepare("SELECT id FROM users WHERE username=?").get(input.username),
    ).toBeUndefined();
  });
});

describe("team directory and application history", () => {
  function addMember() {
    db.prepare("INSERT INTO user_roles VALUES(?,?)").run("u2", "member");
    db.prepare("INSERT INTO memberships VALUES(?,?,?)").run(
      "u2",
      "avionics",
      "software",
    );
  }
  it("shows only team members without private profile fields", async () => {
    addMember();
    const r = await call("/directory/users");
    expect(r.status).toBe(200);
    const b: any = await r.json();
    expect(b.total).toBe(2);
    expect(b.users.find((u: any) => u.id === "u2").memberships[0].team).toBe(
      "Yazılım",
    );
    expect(JSON.stringify(b)).not.toContain("email");
    expect(JSON.stringify(b)).not.toContain("owner");
    expect(JSON.stringify(b)).not.toContain("permission");
  });
  it("keeps unapproved accounts and disabled users out of the directory", async () => {
    expect(((await (await call("/directory/users")).json()) as any).total).toBe(
      1,
    );
    addMember();
    db.exec("UPDATE users SET disabled=1 WHERE id='u2'");
    expect((await call("/directory/users/u2")).status).toBe(404);
  });
  it("blocks directory access for outsiders even if signed in", async () => {
    db.exec("UPDATE users SET owner=0 WHERE id='u1'");
    expect((await call("/directory/users")).status).toBe(403);
  });
  it("supports Turkish names and literal search wildcards", async () => {
    addMember();
    db.exec(
      "UPDATE users SET first_name='IŞIK',last_name='ÇELİK' WHERE id='u2'",
    );
    const found: any = await (
      await call("/directory/users?q=isik%20celik")
    ).json();
    expect(found.users.map((u: any) => u.id)).toEqual(["u2"]);
    expect(
      ((await (await call("/directory/users?q=%25")).json()) as any).total,
    ).toBe(0);
  });
  it("filters members by their department and team and rejects invalid pagination", async () => {
    addMember();
    const found: any = await (
      await call("/directory/users?departmentId=avionics&teamId=software")
    ).json();
    expect(found.users.map((u: any) => u.id)).toEqual(["u2"]);
    expect(
      ((await (await call("/directory/users?teamId=hardware")).json()) as any)
        .total,
    ).toBe(0);
    expect((await call("/directory/users?page=-1")).status).toBe(400);
  });
  it("paginates the directory with stable ordering", async () => {
    for (let i = 0; i < 26; i++) {
      const id = "extra" + i;
      db.prepare(
        "INSERT INTO users(id,username,email,first_name,last_name,created_at) VALUES(?,?,?,?,?,?)",
      ).run(id, id, id + "@test.com", "Person", "Test", now());
      db.prepare("INSERT INTO user_roles VALUES(?,?)").run(id, "member");
    }
    const a: any = await (await call("/directory/users")).json(),
      b: any = await (await call("/directory/users?page=2")).json();
    expect(a.users).toHaveLength(24);
    expect(a.hasMore).toBe(true);
    expect(b.users).toHaveLength(3);
    expect(
      a.users.some((u: any) => b.users.some((v: any) => v.id === u.id)),
    ).toBe(false);
  });
  it("exposes public profiles and team member counts to teammates", async () => {
    addMember();
    const profile: any = await (await call("/directory/users/u2")).json();
    expect(profile.username).toBe("bob");
    expect(profile.applications).toEqual([]);
    expect(profile).not.toHaveProperty("email");
    const org: any = await (await call("/directory/teams")).json();
    expect(org.teams.find((t: any) => t.id === "software").memberCount).toBe(1);
  });
  it("records one visit per login and none for token refresh", async () => {
    const t: any = await (
      await call("/auth/exchange", await loginCode(), "")
    ).json();
    await call(
      "/auth/refresh",
      { clientId: "starlab", refreshToken: t.refreshToken },
      "",
    );
    const h: any = await (await call("/me/applications")).json();
    expect(h.total).toBe(1);
    expect(h.applications[0].applicationId).toBe("starlab");
    expect(h.applications[0].lastSignOutAt).toBeNull();
    expect(h.visits[0].endReason).toBeNull();
  });
  it("records explicit logout without inventing timestamps", async () => {
    const t: any = await (
      await call("/auth/exchange", await loginCode(), "")
    ).json();
    await call("/auth/logout", {}, t.accessToken);
    const h: any = await (await call("/me/applications")).json();
    expect(h.visits[0].endReason).toBe("logout");
    expect(h.applications[0].lastSignOutAt).toBeGreaterThan(0);
    expect(h.applications[0].lastEndReason).toBe("logout");
  });
  it("labels revocations separately from actual sign-outs", async () => {
    const t: any = await (
      await call("/auth/exchange", await loginCode(), "")
    ).json();
    await call("/connections/starlab", undefined, "central", "DELETE");
    expect((await call("/me", undefined, t.accessToken)).status).toBe(401);
    const h: any = await (await call("/me/applications")).json();
    expect(h.visits[0].endReason).toBe("revoked");
    expect(h.applications[0].lastSignOutAt).toBeNull();
  });
  it("labels expired sessions without reporting an explicit logout", async () => {
    await call("/auth/exchange", await loginCode(), "");
    db.prepare("UPDATE application_visits SET expires_at=?").run(now() - 1);
    const h: any = await (await call("/me/applications")).json();
    expect(h.visits[0].endReason).toBe("expired");
    expect(h.applications[0].lastSignOutAt).toBeNull();
  });
  it("limits application clients to their own usage and blocks the directory", async () => {
    const t: any = await (
      await call("/auth/exchange", await loginCode(), "")
    ).json();
    db.prepare(
      "INSERT INTO apps(id,name,redirects,origins,scopes) VALUES(?,?,?,?,?)",
    ).run("other", "Other", "[]", "[]", "[]");
    db.prepare(
      "INSERT INTO application_usage(user_id,app_id,last_sign_in_at) VALUES(?,?,?)",
    ).run("u1", "other", now());
    const h: any = await (
      await call("/me/applications", undefined, t.accessToken)
    ).json();
    expect(h.applications.map((a: any) => a.applicationId)).toEqual([
      "starlab",
    ]);
    expect(
      (await call("/directory/users", undefined, t.accessToken)).status,
    ).toBe(403);
  });
  it("retains per-app summaries after detailed history is pruned", async () => {
    await call("/auth/exchange", await loginCode(), "");
    await call("/auth/logout-all", {});
    db.exec("DELETE FROM application_visits");
    expect(
      db.prepare("SELECT COUNT(*) count FROM application_usage").get(),
    ).toMatchObject({ count: 1 });
  });
});

describe("shared board notes", () => {
  async function memberRequest(
    path: string,
    payload?: unknown,
    method?: string,
  ) {
    db.prepare("INSERT OR IGNORE INTO user_roles VALUES(?,?)").run(
      "u2",
      "member",
    );
    db.prepare(
      "INSERT OR IGNORE INTO families(id,user_id,expires) VALUES(?,?,?)",
    ).run("bob-family", "u2", now() + 1000);
    db.prepare(
      "INSERT OR IGNORE INTO sessions(hash,user_id,kind,expires,family,created_at) VALUES(?,?,?,?,?,?)",
    ).run(
      await hash("bob-central"),
      "u2",
      "central",
      now() + 1000,
      "bob-family",
      now(),
    );
    return app.request(
      "https://base.test/api/v1" + path,
      {
        method: method ?? (payload ? "POST" : "GET"),
        headers: {
          Origin: "https://base.test",
          Cookie: "starbase=bob-central",
          "Content-Type": "application/json",
        },
        body: payload ? JSON.stringify(payload) : undefined,
      },
      env,
    );
  }
  const input = {
    scope: "shared",
    title: "Test hazırlığı",
    content: "Aviyonik kontrol listesi hazır.",
    kind: "announcement",
    teamId: "software",
    dueAt: 1900000000,
  };
  it("isolates private notes from other members and owners", async () => {
    const privateNote: any = await (
      await memberRequest("/board/notes", {
        title: "Personal",
        content: "Secret",
        x: 120,
        y: 80,
      })
    ).json();
    const own: any = await (
      await memberRequest("/board/notes?scope=private")
    ).json();
    expect(own.notes).toHaveLength(1);
    expect(own.notes[0]).toMatchObject({ scope: "private", x: 120, y: 80 });
    expect(
      ((await (await call("/board/notes?scope=private")).json()) as any).notes,
    ).toHaveLength(0);
    expect(
      ((await (await call("/board/notes?scope=shared")).json()) as any).notes,
    ).toHaveLength(0);
    expect(
      (
        await call(
          "/board/notes/" + privateNote.id,
          { title: "Intrusion", version: 1 },
          "central",
          "PATCH",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          "/board/notes/" + privateNote.id,
          { version: 1 },
          "central",
          "DELETE",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          "/board/notes/" + privateNote.id + "/position",
          { x: 1, y: 1, layoutVersion: 1 },
          "central",
          "PATCH",
        )
      ).status,
    ).toBe(404);
    const changed = await memberRequest(
      "/board/notes/" + privateNote.id,
      { title: "Still private", scope: "shared", version: 1 },
      "PATCH",
    );
    expect(changed.status).toBe(200);
    expect(
      (
        db
          .prepare("SELECT scope FROM board_notes WHERE id=?")
          .get(privateNote.id) as any
      ).scope,
    ).toBe("private");
  });
  it("keeps position versions independent and rejects stale moves", async () => {
    const n: any = await (
      await memberRequest("/board/notes?scope=shared", input)
    ).json();
    const path = "/board/notes/" + n.id + "/position";
    expect(
      (await memberRequest(path, { x: 456, y: 321, layoutVersion: 1 }, "PATCH"))
        .status,
    ).toBe(200);
    expect(
      (await memberRequest(path, { x: 1, y: 1, layoutVersion: 1 }, "PATCH"))
        .status,
    ).toBe(409);
    expect(
      (await memberRequest(path, { x: -1, y: 1, layoutVersion: 2 }, "PATCH"))
        .status,
    ).toBe(400);
    expect(
      (
        await memberRequest(
          "/board/notes/" + n.id,
          { title: "Edited", version: 1 },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    const feed: any = await (
      await memberRequest("/board/notes?scope=shared")
    ).json();
    expect(feed.notes[0]).toMatchObject({
      x: 456,
      y: 321,
      layoutVersion: 2,
      version: 2,
      title: "Edited",
    });
    db.exec(
      "UPDATE users SET owner=0 WHERE id='u1'; INSERT INTO user_roles VALUES('u1','member')",
    );
    expect(
      (await call(path, { x: 1, y: 1, layoutVersion: 2 }, "central", "PATCH"))
        .status,
    ).toBe(403);
  });
  it("uses separate live hubs for personal and shared changes", async () => {
    const names: string[] = [];
    env.BOARD_HUB.idFromName = (name: string) => {
      names.push(name);
      return name;
    };
    await memberRequest("/board/notes", {
      title: "Private",
      content: "Private",
    });
    await memberRequest("/board/notes?scope=shared", input);
    expect(names).toEqual(["private:u2", "team-board"]);
  });
  it("allows team members to post with server-owned authorship", async () => {
    const r = await memberRequest("/board/notes?scope=shared", {
      ...input,
      authorId: "u1",
      pinned: true,
    });
    expect(r.status).toBe(201);
    const feed: any = await (
      await memberRequest("/board/notes?scope=shared")
    ).json();
    expect(feed.notes[0]).toMatchObject({
      authorId: "u2",
      pinned: 0,
      kind: "announcement",
      teamId: "software",
      version: 1,
    });
    expect(feed.canModerate).toBe(false);
  });
  it("blocks outsiders and application tokens from the board", async () => {
    db.exec("UPDATE users SET owner=0 WHERE id='u1'");
    expect((await call("/board/notes?scope=shared")).status).toBe(403);
    db.exec("UPDATE users SET owner=1 WHERE id='u1'");
    const t: any = await (
      await call("/auth/exchange", await loginCode(), "")
    ).json();
    expect(
      (await call("/board/notes?scope=shared", undefined, t.accessToken))
        .status,
    ).toBe(403);
  });
  it("rejects empty and oversized content or archived teams", async () => {
    expect(
      (
        await memberRequest("/board/notes?scope=shared", {
          ...input,
          content: "",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await memberRequest("/board/notes?scope=shared", {
          ...input,
          content: "a".repeat(2001),
        })
      ).status,
    ).toBe(400);
    db.exec("UPDATE teams SET archived=1 WHERE id='software'");
    expect(
      (await memberRequest("/board/notes?scope=shared", input)).status,
    ).toBe(400);
  });
  it("only permits owners or board moderators to edit others notes", async () => {
    const note: any = await (
      await memberRequest("/board/notes?scope=shared", input)
    ).json();
    db.exec("UPDATE users SET owner=0 WHERE id='u1'");
    db.prepare("INSERT INTO user_roles VALUES(?,?)").run("u1", "member");
    expect(
      (
        await call(
          "/board/notes/" + note.id,
          { title: "Hijack", version: 1 },
          "central",
          "PATCH",
        )
      ).status,
    ).toBe(403);
    db.exec(
      "INSERT INTO roles VALUES('mod','Moderator'); INSERT INTO role_permissions VALUES('mod','board.manage'); INSERT INTO user_roles VALUES('u1','mod');",
    );
    expect(
      (
        await call(
          "/board/notes/" + note.id,
          { title: "Moderated", version: 1 },
          "central",
          "PATCH",
        )
      ).status,
    ).toBe(200);
  });
  it("keeps pinning administrative and preserves other fields in partial updates", async () => {
    const note: any = await (
      await memberRequest("/board/notes?scope=shared", input)
    ).json();
    expect(
      (
        await memberRequest(
          "/board/notes/" + note.id,
          { pinned: true, version: 1 },
          "PATCH",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/board/notes/" + note.id,
          { pinned: true, version: 1 },
          "central",
          "PATCH",
        )
      ).status,
    ).toBe(200);
    const feed: any = await (await call("/board/notes?scope=shared")).json();
    expect(feed.notes[0]).toMatchObject({
      kind: "announcement",
      teamId: "software",
      dueAt: input.dueAt,
      pinned: 1,
      version: 2,
    });
  });
  it("rejects stale edits without overwriting another user change", async () => {
    const note: any = await (
      await memberRequest("/board/notes?scope=shared", input)
    ).json();
    expect(
      (
        await memberRequest(
          "/board/notes/" + note.id,
          { title: "New title", version: 1 },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await memberRequest(
          "/board/notes/" + note.id,
          { title: "Old edit", version: 1 },
          "PATCH",
        )
      ).status,
    ).toBe(409);
    expect(
      db.prepare("SELECT title FROM board_notes WHERE id=?").get(note.id),
    ).toMatchObject({ title: "New title" });
  });
  it("archives, restores and deletes the authors own note", async () => {
    const note: any = await (
      await memberRequest("/board/notes?scope=shared", input)
    ).json();
    await memberRequest(
      "/board/notes/" + note.id,
      { archived: true, version: 1 },
      "PATCH",
    );
    expect(
      ((await (await memberRequest("/board/notes?scope=shared")).json()) as any)
        .total,
    ).toBe(0);
    expect(
      (
        (await (
          await memberRequest("/board/notes?archived=1&scope=shared")
        ).json()) as any
      ).total,
    ).toBe(1);
    await memberRequest(
      "/board/notes/" + note.id,
      { archived: false, version: 2 },
      "PATCH",
    );
    expect(
      (await memberRequest("/board/notes/" + note.id, { version: 2 }, "DELETE"))
        .status,
    ).toBe(409);
    expect(
      (await memberRequest("/board/notes/" + note.id, { version: 3 }, "DELETE"))
        .status,
    ).toBe(200);
  });
  it("filters by kind and team and orders pinned notes first", async () => {
    await memberRequest("/board/notes?scope=shared", input);
    const note: any = await (
      await memberRequest("/board/notes?scope=shared", {
        scope: "shared",
        title: "General",
        content: "All members",
      })
    ).json();
    await call(
      "/board/notes/" + note.id,
      { pinned: true, version: 1 },
      "central",
      "PATCH",
    );
    const feed: any = await (await call("/board/notes?scope=shared")).json();
    expect(feed.notes[0].id).toBe(note.id);
    expect(
      (
        (await (
          await call(
            "/board/notes?kind=announcement&teamId=software&scope=shared",
          )
        ).json()) as any
      ).total,
    ).toBe(1);
  });
  it("keeps a successful write if realtime notification is temporarily unavailable", async () => {
    env.BOARD_HUB.get = () => ({
      fetch: async () => {
        throw new Error("offline");
      },
    });
    const r = await memberRequest("/board/notes?scope=shared", input);
    expect(r.status).toBe(201);
    expect(((await r.json()) as any).liveDelivered).toBe(false);
    expect(
      db.prepare("SELECT COUNT(*) count FROM board_notes").get(),
    ).toMatchObject({ count: 1 });
  });
  it("requires the same-origin websocket handshake", async () => {
    expect((await call("/board/live?scope=shared")).status).toBe(400);
    expect(
      (
        await app.request(
          "https://base.test/api/v1/board/live",
          {
            headers: {
              Cookie: "starbase=central",
              Origin: "https://lab.test",
              Upgrade: "websocket",
            },
          },
          env,
        )
      ).status,
    ).toBe(403);
  });
});
