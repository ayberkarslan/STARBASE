export { BoardHub } from "./board-hub";
import { register as board } from "./routes/board";
import { register as directory } from "./routes/directory";
import { register as members } from "./routes/members";
import spec from "./openapi.json";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { firebase, adminUpdate, type AdminEnv } from "./firebase";
import {
  now,
  token,
  hash,
  challenge,
  usernamePattern,
  allowedScopes,
} from "./security";
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
  type Session,
} from "./common";
import { register as auth } from "./routes/auth";
import { register as identity } from "./routes/identity";
import { register as organization } from "./routes/organization";
import { register as management } from "./routes/management";
import { register as applications } from "./routes/applications";
const app: App = new Hono();
app.onError((e, c) =>
  c.json(
    {
      error: {
        code: e instanceof HTTPException ? e.message : "service_unavailable",
      },
    },
    e instanceof HTTPException ? e.status : 503,
  ),
);
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  const maxBodySize = /^\/api\/v1\/admin\/(apps|teams)\/[a-z0-9-]{3,40}\/logo$/.test(
    c.req.path,
  )
    ? 1048576
    : 16384;
  if (Number(c.req.header("content-length") ?? 0) > maxBodySize)
    return fail(400, "input_too_large");
  const origin = c.req.header("origin");
  if (origin && origin !== c.env.PUBLIC_ORIGIN) {
    const apps = await c.env.DB.prepare(
      "SELECT origins FROM apps WHERE disabled=0",
    ).all<{ origins: string }>();
    if (
      !apps.results.some((a) =>
        (JSON.parse(a.origins) as string[]).includes(origin),
      )
    )
      return fail(403, "origin_rejected");
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Headers", "content-type,authorization");
    c.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
  }
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    getCookie(c, "starbase") &&
    origin !== c.env.PUBLIC_ORIGIN
  )
    return fail(403, "csrf_rejected");
  await next();
});
app.use("/api/v1/*", async (c, next) => {
  if (
    [
      "/api/v1/config",
      "/api/v1/auth/resend",
      "/api/v1/health",
      "/api/v1/auth/register",
      "/api/v1/auth/login",
      "/api/v1/auth/recover",
      "/api/v1/auth/exchange",
      "/api/v1/auth/refresh",
      "/api/v1/auth/reset",
      "/api/v1/auth/verify",
    ].includes(c.req.path) ||
    /^\/api\/v1\/apps\/[a-z0-9-]{3,40}\/(branding|logo)$/.test(c.req.path)
  )
    return next();
  const bearer = c.req.header("authorization")?.replace(/^Bearer /, "");
  const raw = bearer ?? getCookie(c, "starbase");
  if (!raw) fail(401, "authentication_required");
  const session = await c.env.DB.prepare(
    "SELECT s.* FROM sessions s JOIN families f ON f.id=s.family WHERE s.hash=? AND s.expires>? AND s.used=0 AND f.revoked=0",
  )
    .bind(await hash(raw!), now())
    .first<Session>();
  if (!session) fail(401, "session_expired");
  if (
    (bearer && session!.kind !== "access") ||
    (!bearer && session!.kind !== "central")
  )
    fail(401, "invalid_session");
  if (session!.app_id) {
    const enabled = await c.env.DB.prepare(
      "SELECT co.scopes FROM apps a JOIN consents co ON co.app_id=a.id WHERE a.id=? AND co.user_id=? AND a.disabled=0",
    )
      .bind(session!.app_id, session!.user_id)
      .first<{ scopes: string }>();
    if (
      !enabled ||
      !allowedScopes(JSON.parse(session!.scopes), JSON.parse(enabled.scopes))
    )
      fail(403, "access_denied");
  }
  const user = await c.env.DB.prepare(
    "SELECT * FROM users WHERE id=? AND disabled=0",
  )
    .bind(session!.user_id)
    .first<any>();
  if (!user) fail(401, "account_unavailable");
  c.set("session", session!);
  c.set("user", user);
  if (
    user.must_change_password &&
    !["/api/v1/auth/password", "/api/v1/auth/logout"].includes(c.req.path)
  )
    fail(403, "password_change_required");
  await next();
});
app.get("/api/openapi.json", (c) => c.json(spec));
auth(app);
identity(app);
organization(app);
management(app);
members(app);
directory(app);
board(app);
applications(app);
app.notFound((c) =>
  c.req.path.startsWith("/api/")
    ? c.json({ error: { code: "not_found" } }, 404)
    : c.env.ASSETS.fetch(c.req.raw),
);
export { app };
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: import("./common").Env) {
    const timestamp = now();
    await env.DB.prepare(
      "UPDATE application_visits SET ended_at=expires_at,end_reason='expired' WHERE ended_at IS NULL AND expires_at<=?",
    )
      .bind(timestamp)
      .run();
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM application_visits WHERE ended_at IS NOT NULL AND ended_at<?",
      ).bind(timestamp - 90 * 86400),
      env.DB.prepare("DELETE FROM sessions WHERE expires<?").bind(timestamp),
      env.DB.prepare("DELETE FROM families WHERE expires<?").bind(timestamp),
      env.DB.prepare("DELETE FROM codes WHERE expires<?").bind(timestamp),
      env.DB.prepare("DELETE FROM limits WHERE expires<?").bind(timestamp),
      env.DB.prepare("DELETE FROM invites WHERE expires<?").bind(timestamp),
      env.DB.prepare("DELETE FROM audit WHERE created_at<?").bind(
        timestamp - 90 * 86400,
      ),
    ]);
  },
};
