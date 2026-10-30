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
export function register(app: App) {
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
      Object.assign(result, { firstName: u.first_name, lastName: u.last_name });
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
    return c.json(result);
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
