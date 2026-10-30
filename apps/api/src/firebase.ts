export interface FirebaseEnv {
  FIREBASE_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_AUTH_EMULATOR_HOST?: string;
}
export async function firebase(
  env: FirebaseEnv,
  method: string,
  data: unknown,
) {
  const base = env.FIREBASE_AUTH_EMULATOR_HOST
    ? `http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
    : "https://identitytoolkit.googleapis.com/v1";
  const r = await fetch(
    `${base}/accounts:${method}?key=${env.FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  const result = (await r.json()) as any;
  if (!r.ok) throw new Error("identity_rejected");
  return result;
}

import { SignJWT, importPKCS8 } from "jose";
export interface AdminEnv extends FirebaseEnv {
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
}
let cached: { key: string; token: string; expires: number } | undefined;
export async function adminUpdate(
  env: AdminEnv,
  uid: string,
  changes: Record<string, unknown>,
) {
  if (env.FIREBASE_AUTH_EMULATOR_HOST) {
    const r = await fetch(
      `http://${env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:update`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer owner",
        },
        body: JSON.stringify({ localId: uid, ...changes }),
      },
    );
    if (!r.ok) throw new Error("identity_update_failed");
    return;
  }
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY)
    throw new Error("identity_admin_not_configured");
  if (
    !cached ||
    cached.key !== env.FIREBASE_CLIENT_EMAIL ||
    cached.expires < Date.now()
  ) {
    const key = await importPKCS8(
      env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      "RS256",
    );
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/identitytoolkit",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(env.FIREBASE_CLIENT_EMAIL)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    const t = (await r.json()) as any;
    if (!r.ok) throw new Error("identity_admin_unavailable");
    cached = {
      key: env.FIREBASE_CLIENT_EMAIL,
      token: t.access_token,
      expires: Date.now() + 3300000,
    };
  }
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cached.token}`,
      },
      body: JSON.stringify({ localId: uid, ...changes }),
    },
  );
  if (!r.ok) throw new Error("identity_update_failed");
}
