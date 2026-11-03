import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { firebase, adminUpdate, type AdminEnv } from "../firebase";
import {
  now,
  token,
  hash,
  challenge,
  usernamePattern,
  allowedScopes,
} from "../security";
import {
  fail,
  body,
  audit,
  issue,
  permit,
  rate,
  captcha,
  reauthenticate,
  credentials,
  type App,
} from "../common";

function sniffImage(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.every((byte, index) => bytes[index] === byte))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

export function register(app: App) {
  app.get("/api/v1/admin/users/:id", async (c) => {
    await permit(c, "users.manage");
    const id = c.req.param("id");
    const user = await c.env.DB.prepare(
      "SELECT id,username,email,first_name,last_name,verified,disabled,owner FROM users WHERE id=?",
    )
      .bind(id)
      .first();
    if (!user) fail(404, "not_found");
    const memberships = (
      await c.env.DB.prepare(
        "SELECT m.department_id,m.team_id,d.name department,t.name team FROM memberships m JOIN departments d ON d.id=m.department_id JOIN teams t ON t.id=m.team_id WHERE m.user_id=?",
      )
        .bind(id)
        .all()
    ).results;
    return c.json({ ...user, memberships });
  });

  app.get("/api/v1/admin/users", async (c) => {
    await permit(c, "users.manage");
    return c.json(
      (
        await c.env.DB.prepare(
          "SELECT id,username,email,first_name,last_name,verified,disabled,owner FROM users ORDER BY created_at DESC LIMIT 100",
        ).all()
      ).results,
    );
  });
  app.post("/api/v1/admin/departments", async (c) => {
    await permit(c, "organization.manage");
    const b = await body(c, z.object({ name: z.string().min(1).max(80) }));
    const id = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO departments(id,name) VALUES(?,?)")
      .bind(id, b.name)
      .run();
    await audit(c, "department.create", id);
    return c.json({ id }, 201);
  });
  app.post("/api/v1/admin/teams", async (c) => {
    await permit(c, "organization.manage");
    const b = await body(
      c,
      z.object({ departmentId: z.string(), name: z.string().min(1).max(80) }),
    );
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO teams(id,department_id,name) VALUES(?,?,?)",
    )
      .bind(id, b.departmentId, b.name)
      .run();
    await audit(c, "team.create", id);
    return c.json({ id }, 201);
  });
  app.post("/api/v1/admin/memberships", async (c) => {
    await permit(c, "users.manage");
    const b = await body(
      c,
      z.object({
        userId: z.string(),
        departmentId: z.string(),
        teamId: z.string(),
      }),
    );
    if (
      !(await c.env.DB.prepare(
        "SELECT id FROM teams WHERE id=? AND department_id=? AND archived=0",
      )
        .bind(b.teamId, b.departmentId)
        .first())
    )
      fail(400, "invalid_team");
    await c.env.DB.prepare("INSERT OR IGNORE INTO memberships VALUES(?,?,?)")
      .bind(b.userId, b.departmentId, b.teamId)
      .run();
    await c.env.DB.prepare("INSERT OR IGNORE INTO user_roles VALUES(?,?)")
      .bind(b.userId, "member")
      .run();
    await audit(c, "membership.assign", b.userId);
    return c.json({ ok: true });
  });
  app.get("/api/v1/admin/audit", async (c) => {
    await permit(c, "users.manage");
    return c.json(
      (
        await c.env.DB.prepare(
          "SELECT * FROM audit ORDER BY created_at DESC LIMIT 100",
        ).all()
      ).results,
    );
  });
  app.post("/api/v1/admin/apps", async (c) => {
    await permit(c, "apps.manage");
    const b = await body(
      c,
      z.object({
        id: z.string().regex(/^[a-z0-9-]{3,40}$/),
        name: z.string().trim().min(1).max(80),
        redirects: z.array(z.string().url()).min(1),
        origins: z.array(z.string().url()),
        scopes: z.array(z.enum(["profile", "email", "organization"])),
      }),
    );
    for (const r of b.redirects) {
      const u = new URL(r);
      if (
        u.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(u.hostname)
      )
        fail(400, "https_required");
    }
    await c.env.DB.prepare(
      "INSERT INTO apps(id,name,redirects,origins,scopes) VALUES(?,?,?,?,?)",
    )
      .bind(
        b.id,
        b.name,
        JSON.stringify(b.redirects),
        JSON.stringify(b.origins),
        JSON.stringify(b.scopes),
      )
      .run();
    await audit(c, "app.create", b.id);
    return c.json({ id: b.id }, 201);
  });
  app.post("/api/v1/admin/apps/:id/logo", async (c) => {
    await permit(c, "apps.manage");
    const id = c.req.param("id");
    const application = await c.env.DB.prepare(
      "SELECT id FROM apps WHERE id=?",
    )
      .bind(id)
      .first<{ id: string }>();
    if (!application)
      throw new HTTPException(404, { message: "app_not_found" });
    const declaredType = c.req.header("content-type")?.split(";")[0] ?? "";
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (!bytes.length || bytes.length > 1048576)
      throw new HTTPException(400, { message: "invalid_logo_size" });
    const detectedType = sniffImage(bytes);
    if (
      !detectedType ||
      !["image/png", "image/jpeg", "image/webp"].includes(declaredType) ||
      detectedType !== declaredType
    )
      throw new HTTPException(400, { message: "invalid_logo_file" });
    await c.env.APP_LOGOS.put(`apps/${id}/logo`, bytes, {
      httpMetadata: {
        contentType: detectedType,
        cacheControl: "public, max-age=3600",
      },
    });
    await c.env.DB.prepare("UPDATE apps SET logo_url=? WHERE id=?")
      .bind("uploaded", id)
      .run();
    await audit(c, "app.logo.upload", id);
    return c.json({ logoUrl: `/api/v1/apps/${id}/logo` });
  });
  app.delete("/api/v1/admin/apps/:id/logo", async (c) => {
    await permit(c, "apps.manage");
    const id = c.req.param("id");
    const application = await c.env.DB.prepare("SELECT id FROM apps WHERE id=?")
      .bind(id)
      .first();
    if (!application)
      throw new HTTPException(404, { message: "app_not_found" });
    await c.env.APP_LOGOS.delete(`apps/${id}/logo`);
    await c.env.DB.prepare("UPDATE apps SET logo_url='' WHERE id=?")
      .bind(id)
      .run();
    await audit(c, "app.logo.remove", id);
    return c.json({ ok: true });
  });
  app.post("/api/v1/admin/teams/:id/logo", async (c) => {
    await permit(c, "organization.manage");
    const id = c.req.param("id");
    if (!(await c.env.DB.prepare("SELECT id FROM teams WHERE id=? AND archived=0").bind(id).first()))
      throw new HTTPException(404, { message: "team_not_found" });
    const declaredType = c.req.header("content-type")?.split(";")[0] ?? "";
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (!bytes.length || bytes.length > 1048576)
      throw new HTTPException(400, { message: "invalid_logo_size" });
    const detectedType = sniffImage(bytes);
    if (!detectedType || detectedType !== declaredType)
      throw new HTTPException(400, { message: "invalid_logo_file" });
    await c.env.APP_LOGOS.put(`teams/${id}/logo`, bytes, {
      httpMetadata: { contentType: detectedType, cacheControl: "private, max-age=3600" },
    });
    await c.env.DB.prepare("UPDATE teams SET logo_url=? WHERE id=?").bind("uploaded", id).run();
    await audit(c, "team.logo.upload", id);
    return c.json({ logoUrl: `/api/v1/directory/teams/${id}/logo` });
  });
  app.delete("/api/v1/admin/teams/:id/logo", async (c) => {
    await permit(c, "organization.manage");
    const id = c.req.param("id");
    if (!(await c.env.DB.prepare("SELECT id FROM teams WHERE id=?").bind(id).first()))
      throw new HTTPException(404, { message: "team_not_found" });
    await c.env.APP_LOGOS.delete(`teams/${id}/logo`);
    await c.env.DB.prepare("UPDATE teams SET logo_url='' WHERE id=?").bind(id).run();
    await audit(c, "team.logo.remove", id);
    return c.json({ ok: true });
  });
  app.post("/api/v1/admin/users/:id/password", async (c) => {
    await permit(c, "users.manage");
    const b = await body(
      c,
      z.object({
        currentPassword: z.string(),
        temporaryPassword: z.string().min(12).max(128).optional(),
      }),
    );
    await reauthenticate(c, b.currentPassword);
    const uid = c.req.param("id");
    const target = await c.env.DB.prepare(
      "SELECT email,owner FROM users WHERE id=?",
    )
      .bind(uid)
      .first<any>();
    if (!target) fail(404, "not_found");
    if (target.owner && !c.get("user").owner) fail(403, "permission_denied");
    if (b.temporaryPassword) {
      // Lock first: partial upstream failure must not leave active application sessions.
      await c.env.DB.batch([
        c.env.DB.prepare(
          "UPDATE users SET must_change_password=1 WHERE id=?",
        ).bind(uid),
        c.env.DB.prepare("UPDATE families SET revoked=1 WHERE user_id=?").bind(
          uid,
        ),
      ]);
      await adminUpdate(c.env, uid, {
        password: b.temporaryPassword,
        validSince: String(now()),
      });
      await audit(c, "password.temporary", uid);
    } else {
      await firebase(c.env, "sendOobCode", {
        requestType: "PASSWORD_RESET",
        email: target.email,
      });
      await audit(c, "password.recovery", uid);
    }
    return c.json({ ok: true });
  });
  app.put("/api/v1/admin/users/:id", async (c) => {
    await permit(c, "users.manage");
    const b = await body(
      c,
      z.object({
        firstName: z.string().min(1).max(80),
        lastName: z.string().min(1).max(80),
        email: z.string().email(),
        disabled: z.boolean(),
        currentPassword: z.string(),
      }),
    );
    await reauthenticate(c, b.currentPassword);
    const uid = c.req.param("id");
    const old = await c.env.DB.prepare("SELECT * FROM users WHERE id=?")
      .bind(uid)
      .first<any>();
    if (!old) fail(404, "not_found");
    if (old.owner && (b.disabled || !c.get("user").owner))
      fail(403, "owner_protected");
    await c.env.DB.prepare("UPDATE families SET revoked=1 WHERE user_id=?")
      .bind(uid)
      .run();
    await adminUpdate(c.env, uid, {
      email: b.email,
      disableUser: b.disabled,
      ...(old.email !== b.email ? { emailVerified: false } : {}),
      validSince: String(now()),
    });
    await c.env.DB.prepare(
      "UPDATE users SET first_name=?,last_name=?,email=?,disabled=?,verified=? WHERE id=?",
    )
      .bind(
        b.firstName,
        b.lastName,
        b.email.toLowerCase(),
        Number(b.disabled),
        old.email === b.email ? old.verified : 0,
        uid,
      )
      .run();
    await audit(c, "user.update", uid);
    return c.json({ ok: true });
  });
  app.get("/api/v1/admin/roles", async (c) => {
    await permit(c, "roles.manage");
    return c.json({
      roles: (await c.env.DB.prepare("SELECT * FROM roles").all()).results,
      permissions: (await c.env.DB.prepare("SELECT * FROM permissions").all())
        .results,
      assignments: (await c.env.DB.prepare("SELECT * FROM user_roles").all())
        .results,
      grants: (await c.env.DB.prepare("SELECT * FROM role_permissions").all())
        .results,
    });
  });
  app.post("/api/v1/admin/roles", async (c) => {
    await permit(c, "roles.manage");
    const b = await body(
      c,
      z.object({
        name: z.string().min(1).max(80),
        permissions: z.array(z.string()),
        currentPassword: z.string(),
      }),
    );
    await reauthenticate(c, b.currentPassword);
    const id = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO roles VALUES(?,?)").bind(id, b.name),
      ...b.permissions.map((p: string) =>
        c.env.DB.prepare("INSERT INTO role_permissions VALUES(?,?)").bind(
          id,
          p,
        ),
      ),
    ]);
    await audit(c, "role.create", id);
    return c.json({ id }, 201);
  });
  app.post("/api/v1/admin/permissions", async (c) => {
    await permit(c, "roles.manage");
    const b = await body(
      c,
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9_.-]{2,100}$/),
        description: z.string().min(1),
        currentPassword: z.string(),
      }),
    );
    await reauthenticate(c, b.currentPassword);
    await c.env.DB.prepare("INSERT INTO permissions VALUES(?,?)")
      .bind(b.id, b.description)
      .run();
    await audit(c, "permission.create", b.id);
    return c.json({ ok: true }, 201);
  });
  app.post("/api/v1/admin/role-assignments", async (c) => {
    await permit(c, "roles.manage");
    const b = await body(
      c,
      z.object({
        userId: z.string(),
        roleId: z.string(),
        currentPassword: z.string(),
      }),
    );
    await reauthenticate(c, b.currentPassword);
    await c.env.DB.prepare("INSERT OR IGNORE INTO user_roles VALUES(?,?)")
      .bind(b.userId, b.roleId)
      .run();
    await audit(c, "role.assign", b.userId);
    return c.json({ ok: true });
  });
  app.delete("/api/v1/admin/role-assignments", async (c) => {
    await permit(c, "roles.manage");
    const b = await body(
      c,
      z.object({
        userId: z.string(),
        roleId: z.string(),
        currentPassword: z.string(),
      }),
    );
    await reauthenticate(c, b.currentPassword);
    await c.env.DB.prepare(
      "DELETE FROM user_roles WHERE user_id=? AND role_id=?",
    )
      .bind(b.userId, b.roleId)
      .run();
    await audit(c, "role.remove", b.userId);
    return c.json({ ok: true });
  });
  app.post("/api/v1/admin/profile-fields", async (c) => {
    await permit(c, "users.manage");
    const b = await body(
      c,
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{2,50}$/),
        label: z.string().min(1),
        type: z.enum(["text", "number", "date", "boolean", "select"]),
        options: z.array(z.string()).default([]),
      }),
    );
    await c.env.DB.prepare(
      "INSERT INTO profile_fields(key,label,type,options) VALUES(?,?,?,?)",
    )
      .bind(b.key, b.label, b.type, JSON.stringify(b.options))
      .run();
    return c.json({ ok: true }, 201);
  });
  app.get("/api/v1/admin/profile-fields", async (c) => {
    await permit(c, "users.manage");
    return c.json(
      (await c.env.DB.prepare("SELECT * FROM profile_fields").all()).results,
    );
  });
  app.post("/api/v1/admin/invites", async (c) => {
    await permit(c, "users.manage");
    const b = await body(c, z.object({ email: z.string().email() }));
    const code = token();
    await c.env.DB.prepare("INSERT INTO invites VALUES(?,?,?,?)")
      .bind(
        await hash(code),
        b.email.toLowerCase(),
        now() + 604800,
        c.get("user").id,
      )
      .run();
    await audit(c, "invite.create", b.email);
    return c.json({ url: `${c.env.PUBLIC_ORIGIN}/invite?code=${code}` }, 201);
  });
  app.put("/api/v1/admin/profile-values/:id", async (c) => {
    await permit(c, "users.manage");
    const b = await body(c, z.object({ key: z.string(), value: z.unknown() }));
    const f = await c.env.DB.prepare("SELECT * FROM profile_fields WHERE key=?")
      .bind(b.key)
      .first<any>();
    if (!f) fail(400, "unknown_field");
    const valid =
      f.type === "text"
        ? typeof b.value === "string" && b.value.length <= 2000
        : f.type === "number"
          ? typeof b.value === "number" && Number.isFinite(b.value)
          : f.type === "boolean"
            ? typeof b.value === "boolean"
            : f.type === "date"
              ? typeof b.value === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(b.value)
              : f.type === "select"
                ? JSON.parse(f.options).includes(b.value)
                : false;
    if (!valid) fail(400, "invalid_field_value");
    await c.env.DB.prepare(
      "INSERT INTO profile_values VALUES(?,?,?) ON CONFLICT(user_id,field_key) DO UPDATE SET value=excluded.value",
    )
      .bind(c.req.param("id"), b.key, JSON.stringify(b.value))
      .run();
    await audit(c, "profile.update", c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/api/v1/admin/profile-values/:id", async (c) => {
    await permit(c, "users.manage");
    return c.json(
      (
        await c.env.DB.prepare("SELECT * FROM profile_values WHERE user_id=?")
          .bind(c.req.param("id"))
          .all()
      ).results,
    );
  });
  app.put("/api/v1/admin/departments/:id", async (c) => {
    await permit(c, "organization.manage");
    const b = await body(
      c,
      z.object({ name: z.string().min(1).max(80), archived: z.boolean() }),
    );
    await c.env.DB.prepare(
      "UPDATE departments SET name=?,archived=? WHERE id=?",
    )
      .bind(b.name, Number(b.archived), c.req.param("id"))
      .run();
    await audit(c, "department.update", c.req.param("id"));
    return c.json({ ok: true });
  });
  app.put("/api/v1/admin/teams/:id", async (c) => {
    await permit(c, "organization.manage");
    const b = await body(
      c,
      z.object({ name: z.string().min(1).max(80), archived: z.boolean() }),
    );
    await c.env.DB.prepare("UPDATE teams SET name=?,archived=? WHERE id=?")
      .bind(b.name, Number(b.archived), c.req.param("id"))
      .run();
    await audit(c, "team.update", c.req.param("id"));
    return c.json({ ok: true });
  });
  app.delete("/api/v1/admin/memberships", async (c) => {
    await permit(c, "users.manage");
    const b = await body(
      c,
      z.object({
        userId: z.string(),
        departmentId: z.string(),
        teamId: z.string(),
      }),
    );
    await c.env.DB.prepare(
      "DELETE FROM memberships WHERE user_id=? AND department_id=? AND team_id=?",
    )
      .bind(b.userId, b.departmentId, b.teamId)
      .run();
    await audit(c, "membership.remove", b.userId);
    return c.json({ ok: true });
  });
  app.put("/api/v1/admin/roles/:id", async (c) => {
    await permit(c, "roles.manage");
    const b = await body(
      c,
      z.object({
        name: z.string().min(1).max(80),
        permissions: z.array(z.string()),
        currentPassword: z.string(),
      }),
    );
    await reauthenticate(c, b.currentPassword);
    const id = c.req.param("id");
    if (id === "member") fail(403, "system_role");
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE roles SET name=? WHERE id=?").bind(b.name, id),
      c.env.DB.prepare("DELETE FROM role_permissions WHERE role_id=?").bind(id),
      ...b.permissions.map((p: string) =>
        c.env.DB.prepare("INSERT INTO role_permissions VALUES(?,?)").bind(
          id,
          p,
        ),
      ),
    ]);
    await audit(c, "role.update", id);
    return c.json({ ok: true });
  });
  app.delete("/api/v1/admin/roles/:id", async (c) => {
    await permit(c, "roles.manage");
    const b = await body(c, z.object({ currentPassword: z.string() }));
    await reauthenticate(c, b.currentPassword);
    const id = c.req.param("id");
    if (id === "member") fail(403, "system_role");
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM user_roles WHERE role_id=?").bind(id),
      c.env.DB.prepare("DELETE FROM role_permissions WHERE role_id=?").bind(id),
      c.env.DB.prepare("DELETE FROM roles WHERE id=?").bind(id),
    ]);
    await audit(c, "role.delete", id);
    return c.json({ ok: true });
  });
  app.get("/api/v1/admin/apps", async (c) => {
    await permit(c, "apps.manage");
    return c.json((await c.env.DB.prepare("SELECT * FROM apps").all()).results);
  });
  app.put("/api/v1/admin/apps/:id", async (c) => {
    await permit(c, "apps.manage");
    const b = await body(
      c,
      z
        .object({
          disabled: z.boolean().optional(),
          name: z.string().trim().min(1).max(80).optional(),
        })
        .refine((value) => Object.keys(value).length > 0),
    );
    const application = await c.env.DB.prepare(
      "SELECT id,origins FROM apps WHERE id=?",
    )
      .bind(c.req.param("id"))
      .first<{ id: string; origins: string }>();
    if (!application)
      throw new HTTPException(404, { message: "app_not_found" });
    await c.env.DB.prepare(
      "UPDATE apps SET disabled=COALESCE(?,disabled),name=COALESCE(?,name) WHERE id=?",
    )
      .bind(
        b.disabled === undefined ? null : Number(b.disabled),
        b.name ?? null,
        c.req.param("id"),
      )
      .run();
    if (b.disabled === true) {
      await c.env.DB.prepare("UPDATE families SET revoked=1 WHERE app_id=?")
        .bind(c.req.param("id"))
        .run();
    }
    await audit(
      c,
      b.disabled === undefined ? "app.branding" : "app.status",
      c.req.param("id"),
    );
    return c.json({ ok: true });
  });
}
