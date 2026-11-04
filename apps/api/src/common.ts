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
export type Env = AdminEnv & {
  DB: D1Database;
  BOARD_HUB: DurableObjectNamespace;
  PUBLIC_ORIGIN: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  ASSETS: Fetcher;
};
export type Session = {
  hash: string;
  user_id: string;
  app_id: string | null;
  scopes: string;
  family: string;
  kind: string;
  expires: number;
};
export const fail = (
  status: 400 | 401 | 403 | 404 | 409 | 429 | 503,
  code: string,
): never => {
  throw new HTTPException(status, { message: code });
};
export async function body<T extends z.ZodType>(
  c: any,
  schema: T,
): Promise<z.output<T>> {
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > 16384)
    fail(400, "input_too_large");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(400, "invalid_input");
  }
  const value = schema.safeParse(parsed);
  if (!value.success) return fail(400, "invalid_input");
  return value.data;
}
export async function audit(c: any, action: string, target: string) {
  await c.env.DB.prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), c.get("user")?.id ?? null, target, action, now())
    .run();
}
export async function issue(
  c: any,
  uid: string,
  kind: string,
  appId: string | null = null,
  scopes: string[] = [],
  family = crypto.randomUUID(),
) {
  const value = token();
  const ttl = kind === "access" ? 600 : 604800;
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO families(id,user_id,app_id,expires) VALUES(?,?,?,?)",
  )
    .bind(family, uid, appId, now() + 604800)
    .run();
  const inserted = await c.env.DB.prepare(
    "INSERT INTO sessions(hash,user_id,app_id,kind,expires,family,scopes,created_at) SELECT ?,?,?,?,MIN(?,expires),?,?,? FROM families WHERE id=? AND revoked=0 AND expires>? RETURNING hash",
  )
    .bind(
      await hash(value),
      uid,
      appId,
      kind,
      now() + ttl,
      family,
      JSON.stringify(scopes),
      now(),
      family,
      now(),
    )
    .first();
  if (!inserted) fail(401, "session_revoked");
  return value;
}
export async function permit(c: any, permission: string) {
  if (c.get("session").kind !== "central")
    fail(403, "central_session_required");
  if (c.get("user").owner) return;
  const found = await c.env.DB.prepare(
    "SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=? AND rp.permission_id=?",
  )
    .bind(c.get("user").id, permission)
    .first();
  if (!found) fail(403, "permission_denied");
}
export async function captcha(c: any) {
  if (
    new URL(c.env.PUBLIC_ORIGIN).protocol !== "https:" ||
    c.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    return;
  const proof = c.req.header("x-turnstile-token");
  if (!c.env.TURNSTILE_SECRET || !proof) fail(403, "captcha_required");
  const r = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: c.env.TURNSTILE_SECRET,
        response: proof,
        remoteip: c.req.header("cf-connecting-ip") ?? "",
      }),
    },
  );
  const result: any = await r.json();
  if (
    !result.success ||
    result.hostname !== new URL(c.env.PUBLIC_ORIGIN).hostname
  )
    fail(403, "captcha_rejected");
}
export async function rate(c: any) {
  const key = `${c.req.header("cf-connecting-ip") ?? "local"}:${Math.floor(now() / 60)}`;
  const row = await c.env.DB.prepare(
    "INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(key, now() + 120)
    .first();
  if (row!.count > 15) fail(429, "try_later");
}
export const credentials = z.object({
  username: z
    .string()
    .transform((s) => s.toLowerCase())
    .refine((s) => usernamePattern.test(s)),
  password: z.string().min(12).max(128),
});
export async function reauthenticate(c: any, password: string) {
  await rate(c);
  try {
    await firebase(c.env, "signInWithPassword", {
      email: c.get("user").email,
      password,
      returnSecureToken: true,
    });
  } catch {
    return fail(401, "reauthentication_required");
  }
}
export type App = Hono<{
  Bindings: Env;
  Variables: { session: Session; user: any };
}>;

export async function requireTeamMember(
  c: import("hono").Context<{
    Bindings: Env;
    Variables: { session: Session; user: any };
  }>,
) {
  if (c.get("session").kind !== "central")
    fail(403, "central_session_required");
  if (
    !c.get("user").owner &&
    !(await c.env.DB.prepare("SELECT 1 FROM user_roles WHERE user_id=?")
      .bind(c.get("user").id)
      .first())
  )
    fail(403, "team_membership_required");
}
