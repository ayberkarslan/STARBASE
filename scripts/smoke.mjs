import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const origin = process.env.STARBASE_TEST_URL ?? "http://127.0.0.1:5173";
const username = "smoke_" + randomBytes(5).toString("hex");
const email = username + "@example.com";
const password = randomBytes(24).toString("base64url");
async function call(path, body, cookie) {
  const r = await fetch(origin + "/api/v1" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { r, b: await r.json() };
}
let uid;
try {
  const registration = await call("/auth/register", {
    username,
    email,
    password,
    firstName: "Smoke",
    lastName: "Test",
  });
  assert.equal(registration.r.status, 201, JSON.stringify(registration.b));
  const rejected = await call("/auth/login", { username, password });
  assert.equal(rejected.r.status, 403);
  const signIn = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const identity = await signIn.json();
  uid = identity.localId;
  const verify = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-starbase/accounts:update",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ localId: uid, emailVerified: true }),
    },
  );
  assert.equal(verify.status, 200);
  const login = await call("/auth/login", { username, password });
  assert.equal(login.r.status, 200, JSON.stringify(login.b));
  const cookie = login.r.headers.get("set-cookie").split(";")[0];
  const me = await call("/me", undefined, cookie);
  assert.equal(me.b.username, username);
  assert.equal(me.b.email, email);
  await call("/auth/logout", {}, cookie);
  assert.equal((await call("/me", undefined, cookie)).r.status, 401);
  console.log(
    "passed: registration, verification gate, Firebase login, profile, logout",
  );
} finally {
  if (uid) {
    await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-key",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer owner",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ localId: uid }),
      },
    );
    const { spawnSync } = await import("node:child_process");
    spawnSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "starbase",
        "--local",
        "--command",
        `DELETE FROM sessions WHERE user_id='${uid}'; DELETE FROM families WHERE user_id='${uid}'; DELETE FROM users WHERE id='${uid}';`,
      ],
      { cwd: new URL("../apps/api", import.meta.url), stdio: "ignore" },
    );
  }
}
