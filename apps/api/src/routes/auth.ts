import { startVisit, logoutVisit, startCentralVisit, logoutCentralVisit } from "../activity";
import { localVerificationUrl } from "../local-actions";
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
  app.get("/api/v1/health", (c) =>
    c.json({ service: "STARBASE", version: "0.1.0" }),
  );
  app.post("/api/v1/auth/register", async (c) => {
    await rate(c);
    await captcha(c);
    const b = await body(
      c,
      credentials.extend({
        email: z.string().email(),
        firstName: z.string().min(1).max(80),
        lastName: z.string().min(1).max(80),
      }),
    );
    const uid = crypto.randomUUID();
    try {
      await c.env.DB.prepare(
        "INSERT INTO users(id,username,email,first_name,last_name,created_at) VALUES(?,?,?,?,?,?)",
      )
        .bind(
          uid,
          b.username,
          b.email.toLowerCase(),
          b.firstName,
          b.lastName,
          now(),
        )
        .run();
    } catch {
      return fail(409, "registration_unavailable");
    }
    try {
      const result = await firebase(c.env, "signUp", {
        email: b.email,
        password: b.password,
        returnSecureToken: true,
      });
      await c.env.DB.prepare("UPDATE users SET id=? WHERE id=?")
        .bind(result.localId, uid)
        .run();
      let verificationDelivered = true;
      try {
        await firebase(c.env, "sendOobCode", {
          requestType: "VERIFY_EMAIL",
          idToken: result.idToken,
        });
      } catch {
        verificationDelivered = false;
      }
      return c.json(
        {
          verificationRequired: true,
          verificationDelivered,
          developmentVerificationUrl: await localVerificationUrl(
            c.env,
            b.email,
          ),
        },
        201,
      );
    } catch {
      await c.env.DB.prepare("DELETE FROM users WHERE id=?").bind(uid).run();
      return fail(400, "registration_incomplete");
    }
  });
  app.post("/api/v1/auth/login", async (c) => {
    await rate(c);
    const b = await body(c, credentials);
    const u = await c.env.DB.prepare(
      "SELECT * FROM users WHERE username=? AND disabled=0",
    )
      .bind(b.username)
      .first<any>();
    let result: any;
    try {
      result = await firebase(c.env, "signInWithPassword", {
        email: u?.email ?? "invalid@invalid.invalid",
        password: b.password,
        returnSecureToken: true,
      });
    } catch {
      return fail(401, "invalid_credentials");
    }
    if (!u || result.localId !== u.id) fail(401, "invalid_credentials");
    const lookup = await firebase(c.env, "lookup", { idToken: result.idToken });
    if (!lookup.users?.[0]?.emailVerified && !u.must_change_password)
      fail(403, "email_verification_required");
    await c.env.DB.prepare("UPDATE users SET verified=? WHERE id=?")
      .bind(lookup.users?.[0]?.emailVerified ? 1 : 0, u.id)
      .run();
    const family = crypto.randomUUID();
    const value = await issue(c, u.id, "central", null, [], family);
    await startCentralVisit(c.env, family, c.req.raw.headers);
    setCookie(c, "starbase", value, {
      httpOnly: true,
      secure: new URL(c.env.PUBLIC_ORIGIN).protocol === "https:",
      sameSite: "Lax",
      path: "/",
      maxAge: 604800,
    });
    return c.json({
      authenticated: true,
      passwordChangeRequired: !!u.must_change_password,
    });
  });
  app.post("/api/v1/auth/recover", async (c) => {
    await rate(c);
    await captcha(c);
    const b = await body(c, z.object({ email: z.string().email() }));
    try {
      await firebase(c.env, "sendOobCode", {
        requestType: "PASSWORD_RESET",
        email: b.email,
      });
    } catch {}
    return c.json({ message: "Hesap mevcutsa kurtarma e-postası gönderildi." });
  });
  app.post("/api/v1/auth/logout", async (c) => {
    await c.env.DB.batch([
      logoutVisit(c.env, c.get("user").id, c.get("session").family),
      logoutCentralVisit(c.env, c.get("user").id, c.get("session").family),
      c.env.DB.prepare("UPDATE families SET revoked=1 WHERE id=?").bind(
        c.get("session").family,
      ),
    ]);
    deleteCookie(c, "starbase", { path: "/" });
    return c.json({ ok: true });
  });
  app.post("/api/v1/auth/logout-all", async (c) => {
    if (c.get("session").kind !== "central")
      fail(403, "central_session_required");
    await c.env.DB.batch([
      logoutVisit(c.env, c.get("user").id),
      logoutCentralVisit(c.env, c.get("user").id),
      c.env.DB.prepare("UPDATE families SET revoked=1 WHERE user_id=?").bind(
        c.get("user").id,
      ),
    ]);
    deleteCookie(c, "starbase", { path: "/" });
    return c.json({ ok: true });
  });
  app.post("/api/v1/auth/exchange", async (c) => {
    await rate(c);
    const b = await body(
      c,
      z.object({
        code: z.string(),
        verifier: z.string().min(43).max(128),
        clientId: z.string(),
        redirectUri: z.string().url(),
      }),
    );
    const code = await c.env.DB.prepare(
      "DELETE FROM codes WHERE hash=? AND expires>? AND app_id=? AND redirect=? AND challenge=? RETURNING *",
    )
      .bind(
        await hash(b.code),
        now(),
        b.clientId,
        b.redirectUri,
        await challenge(b.verifier),
      )
      .first<any>();
    if (!code) fail(400, "invalid_code");
    const a = await c.env.DB.prepare(
      "SELECT id FROM apps WHERE id=? AND disabled=0",
    )
      .bind(b.clientId)
      .first();
    const u = await c.env.DB.prepare(
      "SELECT id FROM users WHERE id=? AND disabled=0 AND must_change_password=0 AND verified=1",
    )
      .bind(code.user_id)
      .first();
    if (!a || !u) fail(403, "access_denied");
    const family = crypto.randomUUID();
    const accessToken = await issue(
      c,
      code.user_id,
      "access",
      b.clientId,
      JSON.parse(code.scopes),
      family,
    );
    const refreshToken = await issue(
      c,
      code.user_id,
      "refresh",
      b.clientId,
      JSON.parse(code.scopes),
      family,
    );
    await startVisit(c.env, family, c.req.raw.headers);
    return c.json({ accessToken, refreshToken, expiresIn: 600 });
  });
  app.post("/api/v1/auth/refresh", async (c) => {
    const b = await body(
      c,
      z.object({ refreshToken: z.string(), clientId: z.string() }),
    );
    const h = await hash(b.refreshToken);
    const old = await c.env.DB.prepare(
      "SELECT s.* FROM sessions s JOIN families f ON f.id=s.family WHERE s.hash=? AND s.kind='refresh' AND s.app_id=? AND f.revoked=0",
    )
      .bind(h, b.clientId)
      .first<any>();
    if (!old || old.expires <= now()) fail(401, "session_expired");
    if (old.used) {
      await c.env.DB.prepare("UPDATE families SET revoked=1 WHERE id=?")
        .bind(old.family)
        .run();
      fail(401, "refresh_reused");
    }
    const user = await c.env.DB.prepare(
      "SELECT id FROM users WHERE id=? AND disabled=0 AND must_change_password=0 AND verified=1",
    )
      .bind(old.user_id)
      .first();
    const consent = await c.env.DB.prepare(
      "SELECT scopes FROM consents WHERE user_id=? AND app_id=?",
    )
      .bind(old.user_id, b.clientId)
      .first<{ scopes: string }>();
    const a = await c.env.DB.prepare(
      "SELECT id FROM apps WHERE id=? AND disabled=0",
    )
      .bind(b.clientId)
      .first();
    if (
      !user ||
      !consent ||
      !a ||
      !allowedScopes(JSON.parse(old.scopes), JSON.parse(consent.scopes))
    )
      fail(403, "access_denied");
    const claimed = await c.env.DB.prepare(
      "UPDATE sessions SET used=1 WHERE hash=? AND used=0 RETURNING hash",
    )
      .bind(h)
      .first();
    if (!claimed) {
      await c.env.DB.prepare("UPDATE families SET revoked=1 WHERE id=?")
        .bind(old.family)
        .run();
      fail(401, "refresh_reused");
    }
    const accessToken = await issue(
      c,
      old.user_id,
      "access",
      b.clientId,
      JSON.parse(old.scopes),
      old.family,
    );
    const refreshToken = await issue(
      c,
      old.user_id,
      "refresh",
      b.clientId,
      JSON.parse(old.scopes),
      old.family,
    );
    await c.env.DB.prepare(
      "UPDATE sessions SET expires=MIN(expires,?) WHERE family=? AND used=0",
    )
      .bind(old.expires, old.family)
      .run();
    return c.json({
      accessToken,
      refreshToken,
      expiresIn: Math.min(600, old.expires - now()),
    });
  });
  app.post("/api/v1/auth/password", async (c) => {
    if (c.get("session").kind !== "central")
      fail(403, "central_session_required");
    const b = await body(
      c,
      z.object({
        currentPassword: z.string(),
        password: z.string().min(12).max(128),
      }),
    );
    try {
      await firebase(c.env, "signInWithPassword", {
        email: c.get("user").email,
        password: b.currentPassword,
        returnSecureToken: true,
      });
    } catch {
      return fail(401, "invalid_credentials");
    }
    await c.env.DB.prepare("UPDATE families SET revoked=1 WHERE user_id=?")
      .bind(c.get("user").id)
      .run();
    await adminUpdate(c.env, c.get("user").id, {
      password: b.password,
      validSince: String(now()),
    });
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE users SET must_change_password=0 WHERE id=?",
      ).bind(c.get("user").id),
      c.env.DB.prepare("UPDATE families SET revoked=1 WHERE user_id=?").bind(
        c.get("user").id,
      ),
    ]);
    deleteCookie(c, "starbase", { path: "/" });
    return c.json({ ok: true });
  });
  app.post("/api/v1/auth/reset", async (c) => {
    await rate(c);
    const b = await body(
      c,
      z.object({ code: z.string(), password: z.string().min(12).max(128) }),
    );
    const verified = await firebase(c.env, "resetPassword", {
      oobCode: b.code,
    });
    const u = await c.env.DB.prepare("SELECT id FROM users WHERE email=?")
      .bind(verified.email)
      .first<{ id: string }>();
    if (u)
      await c.env.DB.prepare("UPDATE families SET revoked=1 WHERE user_id=?")
        .bind(u.id)
        .run();
    await firebase(c.env, "resetPassword", {
      oobCode: b.code,
      newPassword: b.password,
    });
    if (u)
      await c.env.DB.prepare(
        "UPDATE users SET must_change_password=0 WHERE id=?",
      )
        .bind(u.id)
        .run();
    return c.json({ ok: true });
  });
  app.post("/api/v1/auth/verify", async (c) => {
    await rate(c);
    const b = await body(c, z.object({ code: z.string() }));
    await firebase(c.env, "update", { oobCode: b.code });
    return c.json({ ok: true });
  });
  app.get("/api/v1/config", (c) =>
    c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY ?? null }),
  );
  app.post("/api/v1/auth/resend", async (c) => {
    let developmentVerificationUrl: string | undefined;
    await rate(c);
    const b = await body(c, credentials);
    const u = await c.env.DB.prepare("SELECT email FROM users WHERE username=?")
      .bind(b.username)
      .first<{ email: string }>();
    try {
      const result = await firebase(c.env, "signInWithPassword", {
        email: u?.email ?? "invalid@invalid.invalid",
        password: b.password,
        returnSecureToken: true,
      });
      await firebase(c.env, "sendOobCode", {
        requestType: "VERIFY_EMAIL",
        idToken: result.idToken,
      });
      if (u)
        developmentVerificationUrl = await localVerificationUrl(c.env, u.email);
    } catch {}
    return c.json({ ok: true, developmentVerificationUrl });
  });
}
