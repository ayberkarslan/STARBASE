import { afterEach, it, expect, vi } from "vitest";
import { localVerificationUrl } from "./local-actions";
afterEach(() => vi.unstubAllGlobals());
const env = {
  PUBLIC_ORIGIN: "http://127.0.0.1:5173",
  FIREBASE_PROJECT_ID: "demo-starbase",
  FIREBASE_API_KEY: "demo",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
};
it("returns the latest matching verification link only on loopback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        oobCodes: [
          { email: "a@test.com", requestType: "VERIFY_EMAIL", oobCode: "old" },
          {
            email: "a@test.com",
            requestType: "PASSWORD_RESET",
            oobCode: "reset",
          },
          {
            email: "a@test.com",
            requestType: "VERIFY_EMAIL",
            oobCode: "latest",
          },
          {
            email: "other@test.com",
            requestType: "VERIFY_EMAIL",
            oobCode: "other",
          },
        ],
      }),
    ),
  );
  const link = await localVerificationUrl(env, "a@test.com");
  expect(new URL(link!).searchParams.get("oobCode")).toBe("latest");
  expect(new URL(link!).pathname).toBe("/action");
});
it("never exposes action links for hosted origins or absent emulator", async () => {
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  expect(
    await localVerificationUrl(
      { ...env, PUBLIC_ORIGIN: "https://starbase.example" },
      "a@test.com",
    ),
  ).toBeUndefined();
  expect(
    await localVerificationUrl(
      { ...env, PUBLIC_ORIGIN: "http://starbase.example" },
      "a@test.com",
    ),
  ).toBeUndefined();
  expect(
    await localVerificationUrl(
      { ...env, FIREBASE_AUTH_EMULATOR_HOST: undefined },
      "a@test.com",
    ),
  ).toBeUndefined();
  expect(
    await localVerificationUrl(
      { ...env, FIREBASE_AUTH_EMULATOR_HOST: "remote.example" },
      "a@test.com",
    ),
  ).toBeUndefined();
  expect(spy).not.toHaveBeenCalled();
});
