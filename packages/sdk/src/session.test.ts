import { afterEach, describe, expect, it, vi } from "vitest";
import { Starbase } from "./index";
import { StarbaseSession } from "./session";
import type { Profile } from "./contracts";

afterEach(() => vi.restoreAllMocks());

const profile: Profile = {
  id: "user-1",
  username: "stargazer",
  applicationId: "starbase-todo-web",
};

function client() {
  return new Starbase({
    baseUrl: "https://starbase.test",
    clientId: "starbase-todo-web",
    redirectUri: "https://todo.test/callback",
  });
}

describe("StarbaseSession", () => {
  it("restores an existing profile and publishes state changes", async () => {
    const starbase = client();
    vi.spyOn(starbase, "getProfile").mockResolvedValue(profile);
    const session = new StarbaseSession(starbase);
    const listener = vi.fn();
    session.subscribe(listener);

    await session.start("https://todo.test/");

    expect(session.getSnapshot()).toEqual({ status: "authenticated", profile });
    expect(listener).toHaveBeenCalledOnce();
    expect(starbase.getProfile).toHaveBeenCalledOnce();
  });

  it("uses callback exchange on the callback URL and coalesces startup", async () => {
    const starbase = client();
    vi.spyOn(starbase, "handleCallback").mockResolvedValue(profile);
    const session = new StarbaseSession(starbase);
    const callback = "https://todo.test/callback?code=one-time&state=state";

    await Promise.all([session.start(callback), session.start(callback)]);

    expect(starbase.handleCallback).toHaveBeenCalledOnce();
    expect(session.getSnapshot()).toEqual({ status: "authenticated", profile });
  });

  it("keeps login credentials at Starbase and exposes login failures", async () => {
    const starbase = client();
    const failure = new Error("navigation_failed");
    vi.spyOn(starbase, "login").mockRejectedValue(failure);
    const session = new StarbaseSession(starbase, ["profile"]);

    await expect(session.login()).rejects.toBe(failure);

    expect(starbase.login).toHaveBeenCalledWith(["profile"]);
    expect(session.getSnapshot()).toEqual({
      status: "anonymous",
      error: failure,
    });
  });

  it("completes desktop login without navigating the webview", async () => {
    const starbase = client();
    vi.spyOn(starbase, "createAuthorizationUrl").mockResolvedValue("https://starbase.test/authorize");
    vi.spyOn(starbase, "handleCallback").mockResolvedValue(profile);
    const session = new StarbaseSession(starbase);
    const open = vi.fn().mockResolvedValue("http://127.0.0.1:1421/callback?code=once&state=valid");

    await session.loginInBrowser(open);

    expect(open).toHaveBeenCalledWith("https://starbase.test/authorize");
    expect(starbase.handleCallback).toHaveBeenCalledWith("http://127.0.0.1:1421/callback?code=once&state=valid", false);
    expect(session.getSnapshot()).toEqual({ status: "authenticated", profile });
  });

  it("publishes signed-out state even when remote logout fails", async () => {
    const starbase = client();
    vi.spyOn(starbase, "getProfile").mockResolvedValue(profile);
    vi.spyOn(starbase, "logout").mockRejectedValue(new Error("offline"));
    const session = new StarbaseSession(starbase);
    await session.start("https://todo.test/");

    await expect(session.logout()).rejects.toThrow("offline");

    expect(session.getSnapshot()).toMatchObject({ status: "anonymous" });
  });
});
