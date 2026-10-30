import type { FirebaseEnv } from "./firebase";
const loopback = (host: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(host);
/** Emulator-only delivery UI. Never expose action links from a hosted environment. */
export async function localVerificationUrl(
  env: FirebaseEnv & { PUBLIC_ORIGIN: string },
  email: string,
): Promise<string | undefined> {
  if (!env.FIREBASE_AUTH_EMULATOR_HOST) return;
  const origin = new URL(env.PUBLIC_ORIGIN);
  const emulator = new URL(`http://${env.FIREBASE_AUTH_EMULATOR_HOST}`);
  if (
    origin.protocol !== "http:" ||
    !loopback(origin.hostname) ||
    !loopback(emulator.hostname)
  )
    return;
  try {
    const response = await fetch(
      `${emulator.origin}/emulator/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/oobCodes`,
    );
    if (!response.ok) return;
    const data = (await response.json()) as {
      oobCodes?: { email: string; requestType: string; oobCode: string }[];
    };
    const record = data.oobCodes
      ?.filter(
        (r) =>
          r.email.toLowerCase() === email.toLowerCase() &&
          r.requestType === "VERIFY_EMAIL",
      )
      .at(-1);
    if (!record) return;
    const url = new URL("/action", origin);
    url.searchParams.set("mode", "verifyEmail");
    url.searchParams.set("oobCode", record.oobCode);
    return url.href;
  } catch {
    return;
  }
}
