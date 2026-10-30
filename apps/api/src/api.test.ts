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
  env = {
    PUBLIC_ORIGIN: "https://base.test",
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
