import { afterEach, describe, it, expect, vi } from "vitest";
import { Starbase, requireStarbasePermission } from "./index";
afterEach(() => vi.unstubAllGlobals());
describe("SDK contracts", () => {
  it("coalesces concurrent refreshes", async () => {
    const storage = {
      getItem: () => "refresh",
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const fetcher = vi.fn(async () =>
      Response.json({
        accessToken: "access",
        refreshToken: "next",
        expiresIn: 600,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const client = new Starbase({
      baseUrl: "https://base.test",
      clientId: "starlab",
      redirectUri: "https://lab.test/callback",
      storage,
    });
    expect(
      await Promise.all(
        Array.from({ length: 20 }, () => client.getAccessToken()),
      ),
    ).toEqual(Array(20).fill("access"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith("starbase.starlab", "next");
  });
  it("rejects callback state mismatches before exchange", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () =>
        JSON.stringify({ state: "expected", verifier: "a".repeat(64) }),
    });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const client = new Starbase({
      baseUrl: "https://base.test",
      clientId: "starlab",
      redirectUri: "https://lab.test/callback",
    });
    await expect(
      client.handleCallback("https://lab.test/callback?code=code&state=wrong"),
    ).rejects.toThrow("state_mismatch");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("resource servers reject a token from another application", async () => {
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          i++ === 0
            ? ["sponsorluk.hassas_veri.okuma"]
            : { id: "u1", username: "alice", applicationId: "starlab" },
        ),
      ),
    );
    await expect(
      requireStarbasePermission(
        "https://base.test",
        "access",
        "sponsorluk.hassas_veri.okuma",
      ),
    ).rejects.toThrow("application_mismatch");
  });
  it("resource servers fail closed when identity API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
    await expect(
      requireStarbasePermission("https://base.test", "access", "starlab.read"),
    ).rejects.toThrow("invalid_session");
  });
});
