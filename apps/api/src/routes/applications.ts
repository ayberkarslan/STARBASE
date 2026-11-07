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
  requireTeamMember,
  type App,
} from "../common";
import { imageResponse } from "../image-assets";
const logoUrl = (id: string, stored: string) =>
  stored ? `/api/v1/apps/${encodeURIComponent(id)}/logo` : "";
function validResourceUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      !!url.hostname &&
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}
function checkSyncSecret(c: any) {
  const candidates = [c.env.APP_SYNC_SECRET, c.env.TEST_FORMU_SYNC_SECRET].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const supplied = c.req.header("x-app-sync-key") ?? "";
  return candidates.some((expected) => {
    if (supplied.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i++)
      difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
    return difference === 0;
  });
}
async function syncAppResource(
  c: any,
  item: {
    appId: string;
    resourceId: string;
    starbaseUserIds: string[];
    deleted: boolean;
    title?: string;
    date?: string;
    status?: string;
    url?: string;
    createdAt?: number;
  },
) {
  const application = await c.env.DB.prepare(
    "SELECT id FROM apps WHERE id=? AND disabled=0",
  )
    .bind(item.appId)
    .first();
  if (!application) return fail(404, "application_not_found");
  const userIds = [...new Set(item.starbaseUserIds)];
  const existingUsers = await c.env.DB.prepare(
    "SELECT user_id FROM app_resources WHERE app_id=? AND resource_id=?",
  )
    .bind(item.appId, item.resourceId)
    .all<{ user_id: string }>();
  const affectedUserIds = new Set<string>(
    (existingUsers?.results ?? []).map((r) => r.user_id),
  );
  if (item.deleted || userIds.length === 0) {
    await c.env.DB.prepare(
      "DELETE FROM app_resources WHERE app_id=? AND resource_id=?",
    )
      .bind(item.appId, item.resourceId)
      .run();
  } else {
    if (!item.title || !item.date || !item.status || !item.createdAt)
      return fail(400, "invalid_input");
    for (const uid of userIds) affectedUserIds.add(uid);
    const timestamp = now();
    const placeholders = userIds.map(() => "?").join(",");
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM app_resources WHERE app_id=? AND resource_id=? AND user_id NOT IN (${placeholders})`,
      ).bind(item.appId, item.resourceId, ...userIds),
      ...userIds.map((userId) =>
        c.env.DB.prepare(
          "INSERT INTO app_resources(app_id,user_id,resource_id,title,date,status,url,created_at,updated_at) SELECT ?,u.id,?,?,?,?,?,?,? FROM users u WHERE u.id=? AND u.disabled=0 ON CONFLICT(app_id,user_id,resource_id) DO UPDATE SET title=excluded.title,date=excluded.date,status=excluded.status,url=excluded.url,updated_at=excluded.updated_at",
        ).bind(
          item.appId,
          item.resourceId,
          item.title,
          item.date,
          item.status,
          item.url ?? "",
          item.createdAt,
          timestamp,
          userId,
        ),
      ),
    ]);
  }
  if (c.env.BOARD_HUB && affectedUserIds.size > 0) {
    const notifyTasks = Array.from(affectedUserIds).map(async (userId) => {
      try {
        const hub = c.env.BOARD_HUB.get(
          c.env.BOARD_HUB.idFromName("private:" + userId),
        );
        await hub.fetch("https://board.internal/notify", { method: "POST" });
      } catch {
        // non-blocking
      }
    });
    let scheduled = false;
    try {
      if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
        c.executionCtx.waitUntil(Promise.allSettled(notifyTasks));
        scheduled = true;
      }
    } catch {
      scheduled = false;
    }
    if (!scheduled) {
      await Promise.allSettled(notifyTasks);
    }
  }
}
export function register(app: App) {
  app.post("/api/v1/internal/app-resources", async (c) => {
    if (!checkSyncSecret(c)) return fail(403, "permission_denied");
    const item = await body(
      c,
      z.object({
        appId: z.string().regex(/^[a-z0-9-]{3,40}$/),
        resourceId: z.string().min(1).max(150),
        starbaseUserId: z
          .string()
          .regex(/^[a-zA-Z0-9-]{1,100}$/)
          .optional(),
        starbaseUserIds: z
          .array(z.string().regex(/^[a-zA-Z0-9-]{1,100}$/))
          .max(100)
          .optional(),
        deleted: z.boolean().default(false),
        title: z.string().trim().min(1).max(180).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        status: z.string().max(40).optional(),
        url: z
          .string()
          .trim()
          .max(400)
          .refine(validResourceUrl)
          .optional(),
        createdAt: z.number().int().positive().optional(),
      }),
    );
    const starbaseUserIds = item.starbaseUserIds ?? (item.starbaseUserId ? [item.starbaseUserId] : []);
    if (!item.deleted && starbaseUserIds.length === 0)
      return fail(400, "invalid_input");
    await syncAppResource(c, { ...item, starbaseUserIds });
    return c.json({ ok: true });
  });
  app.post("/api/v1/internal/test-formu-resources", async (c) => {
    if (!checkSyncSecret(c)) return fail(403, "permission_denied");
    const item = await body(
      c,
      z.object({
        resourceId: z.string().min(1).max(150),
        starbaseUserId: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
        deleted: z.boolean().default(false),
        title: z.string().trim().min(1).max(180).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        status: z.string().max(40).optional(),
        url: z
          .string()
          .trim()
          .max(400)
          .refine(validResourceUrl)
          .optional(),
        createdAt: z.number().int().positive().optional(),
      }),
    );
    if (item.deleted) {
      await c.env.DB.prepare(
        "DELETE FROM app_resources WHERE app_id='test-formu-web' AND resource_id=? AND user_id=?",
      )
        .bind(item.resourceId, item.starbaseUserId)
        .run();
    } else {
      await syncAppResource(c, {
        ...item,
        appId: "test-formu-web",
        starbaseUserIds: [item.starbaseUserId],
      });
    }
    return c.json({ ok: true });
  });
  app.get("/api/v1/apps", async (c) => {
    const apps = await c.env.DB.prepare(
      "SELECT id,name,logo_url logoUrl,launch_url launchUrl FROM apps WHERE disabled=0",
    ).all<{ id: string; name: string; logoUrl: string; launchUrl: string }>();
    return c.json(apps.results.map((item) => ({ ...item, logoUrl: logoUrl(item.id, item.logoUrl) })));
  });
  app.get("/api/v1/apps/:id/overview", async (c) => {
    if (c.get("session").kind !== "central") fail(403, "central_session_required");
    await requireTeamMember(c);
    const id = c.req.param("id");
    const application = await c.env.DB.prepare(
      "SELECT id,name,logo_url logoUrl,launch_url launchUrl FROM apps WHERE id=? AND disabled=0",
    ).bind(id).first<{ id: string; name: string; logoUrl: string; launchUrl: string }>();
    if (!application) return fail(404, "application_not_found");
    const userId = c.get("user").id;
    const [summary, visits, resources, resourceCount] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) totalVisits,MAX(signed_in_at) lastSignInAt FROM application_visits WHERE app_id=? AND user_id=?").bind(id, userId).first(),
      c.env.DB.prepare("SELECT signed_in_at signedInAt,ended_at endedAt,end_reason endReason FROM application_visits WHERE app_id=? AND user_id=? ORDER BY signed_in_at DESC LIMIT 8").bind(id, userId).all(),
      c.env.DB.prepare("SELECT r.app_id applicationId,a.name applicationName,r.resource_id resourceId,r.title,r.date,r.status,r.url,r.created_at createdAt,r.updated_at updatedAt FROM app_resources r JOIN apps a ON a.id=r.app_id WHERE r.app_id=? AND r.user_id=? ORDER BY r.updated_at DESC,r.created_at DESC LIMIT 30").bind(id, userId).all(),
      c.env.DB.prepare("SELECT COUNT(*) count FROM app_resources WHERE app_id=? AND user_id=?").bind(id, userId).first<{ count: number }>(),
    ]);
    return c.json({ application: { ...application, logoUrl: logoUrl(id, application.logoUrl) }, summary, visits: visits.results, resources: resources.results, resourceCount: resourceCount?.count ?? 0 });
  });
  app.get("/api/v1/apps/:id/branding", async (c) => {
    const redirect = c.req.query("redirectUri") ?? "";
    const application = await c.env.DB.prepare(
      "SELECT id,name,logo_url logoUrl,redirects FROM apps WHERE id=? AND disabled=0",
    )
      .bind(c.req.param("id"))
      .first<{
        id: string;
        name: string;
        logoUrl: string;
        redirects: string;
      }>();
    if (!application)
      throw new HTTPException(404, { message: "application_not_found" });
    if (!JSON.parse(application.redirects).includes(redirect))
      throw new HTTPException(404, { message: "application_not_found" });
    const { id, name } = application;
    return c.json({ id, name, logoUrl: logoUrl(id, application.logoUrl) });
  });
  app.get("/api/v1/apps/:id/logo", async (c) => {
    const application = await c.env.DB.prepare(
      "SELECT id,logo_url FROM apps WHERE id=? AND disabled=0",
    )
      .bind(c.req.param("id"))
      .first<{ id: string; logo_url: string }>();
    if (!application?.logo_url)
      throw new HTTPException(404, { message: "application_logo_not_found" });
    const image = await imageResponse(c.env.DB, "apps", application.id);
    if (!image)
      throw new HTTPException(404, { message: "application_logo_not_found" });
    return image;
  });
  app.get("/api/v1/authorize", async (c) => {
    const id = c.req.query("client_id");
    const a = await c.env.DB.prepare(
      "SELECT * FROM apps WHERE id=? AND disabled=0",
    )
      .bind(id ?? "")
      .first<any>();
    if (!a) fail(400, "unknown_app");
    const redirect = c.req.query("redirect_uri") ?? "";
    const scopes = (c.req.query("scope") ?? "profile")
      .split(" ")
      .filter(Boolean);
    const pkce = c.req.query("code_challenge") ?? "";
    if (
      !JSON.parse(a.redirects).includes(redirect) ||
      !allowedScopes(scopes, JSON.parse(a.scopes)) ||
      !/^[A-Za-z0-9_-]{43}$/.test(pkce)
    )
      fail(400, "invalid_authorization");
    const prior = await c.env.DB.prepare(
      "SELECT scopes FROM consents WHERE user_id=? AND app_id=?",
    )
      .bind(c.get("user").id, a.id)
      .first<{ scopes: string }>();
    return c.json({
      approved: a.auto_authorize === 1 || (!!prior && allowedScopes(scopes, JSON.parse(prior.scopes))),
      id: a.id,
      name: a.name,
      scopes,
      redirect,
      challenge: pkce,
      state: c.req.query("state"),
    });
  });
  app.post("/api/v1/authorize", async (c) => {
    if (c.get("session").kind !== "central")
      fail(403, "central_session_required");
    const b = await body(
      c,
      z.object({
        clientId: z.string(),
        redirectUri: z.string().url(),
        scopes: z.array(z.enum(["profile", "email", "organization"])),
        challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        state: z.string().min(16).max(256),
      }),
    );
    const a = await c.env.DB.prepare(
      "SELECT * FROM apps WHERE id=? AND disabled=0",
    )
      .bind(b.clientId)
      .first<any>();
    if (
      !a ||
      !JSON.parse(a.redirects).includes(b.redirectUri) ||
      !allowedScopes(b.scopes, JSON.parse(a.scopes))
    )
      fail(400, "invalid_authorization");
    const value = token();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO consents VALUES(?,?,?) ON CONFLICT(user_id,app_id) DO UPDATE SET scopes=excluded.scopes",
      ).bind(c.get("user").id, a.id, JSON.stringify(b.scopes)),
      c.env.DB.prepare("INSERT INTO codes VALUES(?,?,?,?,?,?,?)").bind(
        await hash(value),
        c.get("user").id,
        a.id,
        b.redirectUri,
        b.challenge,
        JSON.stringify(b.scopes),
        now() + 60,
      ),
    ]);
    const url = new URL(b.redirectUri);
    url.searchParams.set("code", value);
    url.searchParams.set("state", b.state);
    return c.json({ redirect: url.href });
  });
  app.get("/api/v1/connections", async (c) => {
    if (c.get("session").kind !== "central")
      fail(403, "central_session_required");
    const apps = await c.env.DB.prepare(
      "SELECT a.id,a.name,a.logo_url logoUrl,c.scopes FROM consents c JOIN apps a ON a.id=c.app_id WHERE c.user_id=?",
    )
      .bind(c.get("user").id)
      .all<{ id: string; name: string; logoUrl: string; scopes: string }>();
    return c.json(apps.results.map((item) => ({ ...item, logoUrl: logoUrl(item.id, item.logoUrl) })));
  });
  app.delete("/api/v1/connections/:id", async (c) => {
    if (c.get("session").kind !== "central")
      fail(403, "central_session_required");
    await c.env.DB.batch([
      c.env.DB.prepare(
        "DELETE FROM consents WHERE user_id=? AND app_id=?",
      ).bind(c.get("user").id, c.req.param("id")),
      c.env.DB.prepare(
        "UPDATE families SET revoked=1 WHERE user_id=? AND app_id=?",
      ).bind(c.get("user").id, c.req.param("id")),
    ]);
    return c.json({ ok: true });
  });
  app.get("/api/v1/permissions", async (c) => {
    const s = c.get("session");
    if (c.get("user").owner) {
      const all = await c.env.DB.prepare("SELECT id FROM permissions").all<{
        id: string;
      }>();
      return c.json(
        all.results
          .map((p) => p.id)
          .filter((p) => s.kind === "central" || p.startsWith(s.app_id + ".")),
      );
    }
    return c.json(
      (
        await c.env.DB.prepare(
          "SELECT DISTINCT rp.permission_id FROM user_roles ur JOIN role_permissions rp ON ur.role_id=rp.role_id WHERE ur.user_id=?",
        )
          .bind(c.get("user").id)
          .all<{ permission_id: string }>()
      ).results
        .map((r) => r.permission_id)
        .filter((p) => s.kind === "central" || p.startsWith(s.app_id + ".")),
    );
  });
}
