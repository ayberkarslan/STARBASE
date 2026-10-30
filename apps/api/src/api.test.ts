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
