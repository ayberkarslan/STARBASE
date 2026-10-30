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
  app.get("/api/v1/organization", async (c) => {
    if (
      !c.get("user").owner &&
      !(await c.env.DB.prepare("SELECT 1 FROM user_roles WHERE user_id=?")
        .bind(c.get("user").id)
        .first())
    )
      return fail(403, "team_membership_required");
    return c.json({
      departments: (
        await c.env.DB.prepare(
          "SELECT * FROM departments WHERE archived=0",
        ).all()
      ).results,
      teams: (
        await c.env.DB.prepare("SELECT * FROM teams WHERE archived=0").all()
      ).results,
    });
  });
  app.post("/api/v1/invites/accept", async (c) => {
    if (c.get("session").kind !== "central")
      fail(403, "central_session_required");
    const b = await body(c, z.object({ code: z.string() }));
    const invite = await c.env.DB.prepare(
      "DELETE FROM invites WHERE hash=? AND email=? AND expires>? RETURNING hash",
    )
      .bind(await hash(b.code), c.get("user").email, now())
      .first();
    if (!invite) fail(400, "invalid_invite");
    await c.env.DB.prepare("INSERT OR IGNORE INTO user_roles VALUES(?,?)")
      .bind(c.get("user").id, "member")
      .run();
    return c.json({ ok: true });
  });
}
