import { z } from "zod";
import { body, fail, reauthenticate, permit, type App } from "../common";
import { firebase, adminUpdate } from "../firebase";
import { localVerificationUrl } from "../local-actions";
import { now, usernamePattern } from "../security";
import { notifyDirectory } from "../directory-live";
export function register(app: App) {
  app.post("/api/v1/admin/users", async (c) => {
    await permit(c, "users.manage");
    const b = await body(
      c,
      z.object({
        username: z.string().trim().toLowerCase().regex(usernamePattern),
        email: z
          .string()
          .trim()
          .email()
          .transform((s) => s.toLowerCase()),
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().min(1).max(80),
        temporaryPassword: z.string().min(12).max(128),
        currentPassword: z.string().min(1).max(128),
        teamId: z.string().min(1).nullable().default(null),
        skipEmailVerification: z.boolean().default(false),
      }),
    );
    await reauthenticate(c, b.currentPassword);
    const team = b.teamId
      ? await c.env.DB.prepare(
          "SELECT t.id,t.department_id FROM teams t JOIN departments d ON d.id=t.department_id WHERE t.id=? AND t.archived=0 AND d.archived=0",
        )
          .bind(b.teamId)
          .first<{ id: string; department_id: string }>()
      : null;
    if (b.teamId && !team) fail(400, "invalid_team");
    const pendingId = crypto.randomUUID();
    try {
      await c.env.DB.prepare(
        "INSERT INTO users(id,username,email,first_name,last_name,must_change_password,created_at) VALUES(?,?,?,?,?,1,?)",
      )
        .bind(pendingId, b.username, b.email, b.firstName, b.lastName, now())
        .run();
    } catch {
      return fail(409, "member_already_exists");
    }
    let identity: { localId: string; idToken: string };
    try {
      identity = await firebase(c.env, "signUp", {
        email: b.email,
        password: b.temporaryPassword,
        returnSecureToken: true,
      });
    } catch {
      await c.env.DB.prepare("DELETE FROM users WHERE id=?")
        .bind(pendingId)
        .run();
      return fail(400, "member_creation_failed");
    }
    try {
      if (b.skipEmailVerification)
        await adminUpdate(c.env, identity.localId, { emailVerified: true });
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE users SET id=?,verified=? WHERE id=?").bind(
          identity.localId,
          Number(b.skipEmailVerification),
          pendingId,
        ),
        c.env.DB.prepare(
          "INSERT INTO user_roles(user_id,role_id) VALUES(?,?)",
        ).bind(identity.localId, "member"),
        ...(team
          ? [
              c.env.DB.prepare("INSERT INTO memberships VALUES(?,?,?)").bind(
                identity.localId,
                team.department_id,
                team.id,
              ),
            ]
          : []),
        c.env.DB.prepare("INSERT INTO audit VALUES(?,?,?,?,?)").bind(
          crypto.randomUUID(),
          c.get("user").id,
          identity.localId,
          "user.create",
          now(),
        ),
      ]);
    } catch {
      // Only delete the newly created identity, using its own freshly issued token.
      // Keep the reservation if upstream cleanup fails so an operator can reconcile it.
      try {
        await firebase(c.env, "delete", { idToken: identity.idToken });
        await c.env.DB.prepare("DELETE FROM users WHERE id=?")
          .bind(pendingId)
          .run();
      } catch {}
      return fail(503, "member_creation_incomplete");
    }
    let verificationDelivered = false;
    if (!b.skipEmailVerification) {
      try {
        await firebase(c.env, "sendOobCode", {
          requestType: "VERIFY_EMAIL",
          idToken: identity.idToken,
        });
        verificationDelivered = true;
      } catch {
        verificationDelivered = false;
      }
    }
    await notifyDirectory(c.env);
    return c.json(
      {
        user: {
          id: identity.localId,
          username: b.username,
          email: b.email,
          first_name: b.firstName,
          last_name: b.lastName,
          verified: Number(b.skipEmailVerification),
          disabled: 0,
          owner: 0,
        },
        verificationDelivered,
        verificationSkipped: b.skipEmailVerification,
        developmentVerificationUrl: b.skipEmailVerification ? null : await localVerificationUrl(c.env, b.email),
      },
      201,
    );
  });
}
