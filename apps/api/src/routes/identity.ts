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
import { uploadedImage, saveImage, removeImage, imageResponse, userPhotoUrl } from "../image-assets";
import { notifyDirectory, notifyProfilePhoto } from "../directory-live";
export function register(app: App) {
  app.get("/api/v1/me/live", async (c) => {
    const session = c.get("session");
    if (session.kind !== "access" || !JSON.parse(session.scopes).includes("profile")) fail(403, "permission_denied");
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") fail(400, "websocket_required");
    const origin = c.req.header("origin");
    const application = await c.env.DB.prepare("SELECT origins FROM apps WHERE id=? AND disabled=0")
      .bind(session.app_id).first<{ origins: string }>();
    if (!origin || !application || !(JSON.parse(application.origins) as string[]).includes(origin)) fail(403, "origin_rejected");
    const hub = c.env.BOARD_HUB.get(c.env.BOARD_HUB.idFromName(`profile-photo:${c.get("user").id}`));
    return hub.fetch(new Request(`https://board.internal/connect?expires=${session.expires}`, {
      headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "starbase-profile" },
    }));
  });
  app.get("/api/v1/me/photo", async (c) => {
    if (c.get("session").kind === "access" && !JSON.parse(c.get("session").scopes).includes("profile")) fail(403, "permission_denied");
    const image = await imageResponse(c.env.DB, "users", c.get("user").id);
    if (!image) return fail(404, "photo_not_found");
    return c.newResponse(image.body, image);
  });
  app.post("/api/v1/me/photo", async (c) => {
    if (c.get("session").kind !== "central") fail(403, "central_session_required");
    const { bytes, contentType } = await uploadedImage(c.req.raw);
    await saveImage(c.env.DB, "users", c.get("user").id, bytes, contentType);
    await notifyDirectory(c.env);
    await notifyProfilePhoto(c.env, c.get("user").id);
    const user = await c.env.DB.prepare("SELECT avatar_version FROM users WHERE id=?").bind(c.get("user").id).first<{ avatar_version: number }>();
    return c.json({ photoUrl: userPhotoUrl(c.get("user").id, user!.avatar_version) });
  });
  app.delete("/api/v1/me/photo", async (c) => {
    if (c.get("session").kind !== "central") fail(403, "central_session_required");
    await removeImage(c.env.DB, "users", c.get("user").id);
    await notifyDirectory(c.env);
    await notifyProfilePhoto(c.env, c.get("user").id);
    return c.json({ photoUrl: "" });
  });
  app.get("/api/v1/me", async (c) => {
    const u = c.get("user");
    const s = c.get("session");
    const scopes =
      s.kind === "central"
        ? ["profile", "email", "organization"]
        : JSON.parse(s.scopes);
    const result: any = {
      id: u.id,
      username: u.username,
      ...(s.app_id ? { applicationId: s.app_id } : {}),
    };
    if (scopes.includes("profile"))
      Object.assign(result, { firstName: u.first_name, lastName: u.last_name, photoUrl: u.avatar_url ? s.kind === "central" ? userPhotoUrl(u.id, u.avatar_version) : `/api/v1/me/photo?v=${u.avatar_version}` : "" });
    if (scopes.includes("email"))
      Object.assign(result, { email: u.email, emailVerified: !!u.verified });
    if (scopes.includes("organization"))
      result.memberships = (
        await c.env.DB.prepare(
          "SELECT d.id departmentId,d.name department,t.id teamId,t.name team FROM memberships m JOIN departments d ON d.id=m.department_id LEFT JOIN teams t ON t.id=m.team_id WHERE m.user_id=?",
        )
          .bind(u.id)
          .all()
      ).results;
    if (s.kind === "central") result.owner = !!u.owner;
    const customTitle = u.custom_title || (u.username === "ayberkarslan" ? "Geliştirici Hesabı" : (u.owner ? "Takım Sahibi" : ""));
    const badges = (
      await c.env.DB.prepare(
        "SELECT b.id, b.name, b.description, b.tier, b.color, b.icon, ub.assigned_at assignedAt FROM user_badges ub JOIN badges b ON b.id=ub.badge_id WHERE ub.user_id=? ORDER BY b.tier DESC, b.name",
      )
        .bind(u.id)
        .all()
    ).results;
    const roles = (
      await c.env.DB.prepare(
        "SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?",
      )
        .bind(u.id)
        .all()
    ).results;
    Object.assign(result, { customTitle, badges, roles });
    return c.json(result);
  });
  app.put("/api/v1/me/title", async (c) => {
    if (c.get("session").kind !== "central") fail(403, "central_session_required");
    const b = await body(c, z.object({ title: z.string().trim().max(80) }));
    const u = c.get("user");
    await c.env.DB.prepare("UPDATE users SET custom_title=? WHERE id=?")
      .bind(b.title || null, u.id)
      .run();
    await notifyDirectory(c.env);
    return c.json({ ok: true, customTitle: b.title });
  });
  app.get("/api/v1/sessions", async (c) => {
    if (c.get("session").kind !== "central")
      fail(403, "central_session_required");
    return c.json(
      (
        await c.env.DB.prepare(
          "SELECT family,app_id,kind,created_at,expires FROM sessions WHERE family IN (SELECT id FROM families WHERE revoked=0) AND user_id=? AND used=0 AND expires>? AND kind IN ('central','refresh')",
        )
          .bind(c.get("user").id, now())
          .all()
      ).results,
    );
  });
  app.delete("/api/v1/sessions/:family", async (c) => {
    if (c.get("session").kind !== "central")
      fail(403, "central_session_required");
    await c.env.DB.prepare(
      "UPDATE families SET revoked=1 WHERE id=? AND user_id=?",
    )
      .bind(c.req.param("family"), c.get("user").id)
      .run();
    return c.json({ ok: true });
  });
}
