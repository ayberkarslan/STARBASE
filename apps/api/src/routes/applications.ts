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
import { imageResponse } from "../image-assets";
const logoUrl = (id: string, stored: string) =>
  stored ? `/api/v1/apps/${encodeURIComponent(id)}/logo` : "";
export function register(app: App) {
  app.get("/api/v1/apps", async (c) => {
    const apps = await c.env.DB.prepare(
      "SELECT id,name,logo_url logoUrl FROM apps WHERE disabled=0",
    ).all<{ id: string; name: string; logoUrl: string }>();
    return c.json(apps.results.map((item) => ({ ...item, logoUrl: logoUrl(item.id, item.logoUrl) })));
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
      approved: !!prior && allowedScopes(scopes, JSON.parse(prior.scopes)),
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
