export type * from "./contracts";
export { StarbaseSession } from "./session";
export type { AuthSnapshot } from "./session";
import type {
  Profile,
  ProfileScope,
  TokenSet,
  ApplicationHistory,
} from "./contracts";
export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export class StarbaseError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "StarbaseError";
  }
}
export class Starbase {
  private tokens: TokenSet | null = null;
  private refreshing: Promise<void> | null = null;
  private callbackPromise: Promise<Profile> | null = null;
  private redirectingToLogin = false;
  private sessionExpiredListeners = new Set<() => void>();
  constructor(
    private options: {
      baseUrl: string;
      clientId: string;
      redirectUri: string;
      postLoginRedirect?: string;
      storage?: Storage;
      pendingStorage?: Storage;
      sessionExpiryMode?: "redirect" | "stay";
    },
  ) {}
  private async request<T>(
    path: string,
    body?: unknown,
    authenticated = false,
  ): Promise<T> {
    const r = await fetch(`${this.options.baseUrl}/api/v1${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(authenticated
          ? { Authorization: `Bearer ${await this.getAccessToken()}` }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result: any = await r.json();
    if (!r.ok) {
      const error = new StarbaseError(
        result.error?.code ?? "starbase_error",
        r.status,
      );
      if (authenticated && this.requiresLogin(error)) this.handleExpired();
      throw error;
    }
    return result;
  }
  async login(scopes: ProfileScope[] = ["profile"]) {
    location.assign(await this.createAuthorizationUrl(scopes));
  }
  async createAuthorizationUrl(scopes: ProfileScope[] = ["profile"]) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = Array.from(bytes, (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    const state = crypto.randomUUID();
    const challenge = btoa(
      String.fromCharCode(
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ),
      ),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    this.pendingStorage().setItem(
      "starbase.pending",
      JSON.stringify({ verifier, state }),
    );
    const url = new URL("/authorize", this.options.baseUrl);
    Object.entries({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      scope: scopes.join(" "),
      code_challenge: challenge,
      state,
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.href;
  }
  handleCallback(url = location.href, replaceHistory = true): Promise<Profile> {
    if (!this.callbackPromise)
      this.callbackPromise = this.finishCallback(url, replaceHistory).finally(() => {
        this.callbackPromise = null;
      });
    return this.callbackPromise;
  }
  private async finishCallback(url: string, replaceHistory: boolean) {
    const u = new URL(url);
    const saved = this.pendingStorage().getItem("starbase.pending");
    if (!saved) throw new Error("missing_login");
    const p = JSON.parse(saved);
    if (u.searchParams.get("state") !== p.state)
      throw new Error("state_mismatch");
    this.pendingStorage().removeItem("starbase.pending");
    this.tokens = await this.request<TokenSet>("/auth/exchange", {
      code: u.searchParams.get("code"),
      verifier: p.verifier,
      clientId: this.options.clientId,
      redirectUri: this.options.redirectUri,
    });
    this.tokens.expiresIn = Date.now() / 1000 + this.tokens.expiresIn - 30;
    this.save();
    const returnPath =
      this.options.postLoginRedirect ??
      new URL(".", this.options.redirectUri).pathname;
    if (replaceHistory) history.replaceState(null, "", returnPath);
    return this.getProfile();
  }
  private save() {
    if (this.tokens)
      this.options.storage?.setItem(
        `starbase.${this.options.clientId}`,
        this.tokens.refreshToken,
      );
  }
  private requiresLogin(error: unknown) {
    return error instanceof StarbaseError &&
      ["session_expired", "refresh_reused", "session_revoked"].includes(error.code);
  }
  private clearSession() {
    this.tokens = null;
    this.options.storage?.removeItem(`starbase.${this.options.clientId}`);
  }
  private invalidateRemoteSession() {
    this.clearSession();
    for (const listener of this.sessionExpiredListeners) listener();
  }
  /** Live presence is a short-lived signal; it never signs out a session on disconnect. */
  watchSession() {
    if (typeof WebSocket === "undefined") return () => {};
    let stopped = false;
    let socket: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const storageKey = `starbase.${this.options.clientId}`;
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue === null) {
        stopped = true;
        socket?.close();
        this.invalidateRemoteSession();
      }
    };
    const connect = async () => {
      if (stopped) return;
      try {
        const accessToken = await this.getAccessToken();
        if (stopped) return;
        const url = new URL("/api/v1/me/session/live", this.options.baseUrl);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        const current = new WebSocket(url, ["starbase-session", accessToken]);
        socket = current;
        current.onopen = () => {
          current.send("ping");
          ping = setInterval(() => { if (current.readyState === WebSocket.OPEN) current.send("ping"); }, 20_000);
        };
        current.onmessage = (event) => {
          try {
            if (JSON.parse(event.data).type === "session.revoked") {
              stopped = true;
              this.invalidateRemoteSession();
              current.close();
            }
          } catch { /* Ignore unknown invalidations. */ }
        };
        current.onclose = () => {
          if (socket === current) socket = null;
          clearInterval(ping);
          if (!stopped) reconnect = setTimeout(() => { void connect(); }, 5_000);
        };
        current.onerror = () => current.close();
      } catch {
        if (!stopped) reconnect = setTimeout(() => { void connect(); }, 5_000);
      }
    };
    const verify = setInterval(() => { if (!stopped) void this.getProfile().catch(() => {}); }, 60_000);
    window.addEventListener("storage", onStorage);
    void connect();
    return () => {
      stopped = true;
      clearInterval(ping);
      clearInterval(verify);
      clearTimeout(reconnect);
      window.removeEventListener("storage", onStorage);
      socket?.close();
    };
  }
  subscribeSessionExpired(listener: () => void) {
    this.sessionExpiredListeners.add(listener);
    return () => { this.sessionExpiredListeners.delete(listener); };
  }
  private handleExpired() {
    this.clearSession();
    for (const listener of this.sessionExpiredListeners) listener();
    if (this.options.sessionExpiryMode !== "stay") this.redirectToLogin();
  }
  private redirectToLogin() {
    if (this.redirectingToLogin) return;
    this.redirectingToLogin = true;
    this.clearSession();
    void this.login().catch(() => {
      this.redirectingToLogin = false;
    });
  }
  private pendingStorage(): Storage {
    if (this.options.pendingStorage) return this.options.pendingStorage;
    if (typeof sessionStorage === "undefined")
      throw new StarbaseError("browser_storage_required", 0);
    return sessionStorage;
  }
  async getAccessToken() {
    if (!this.tokens) {
      const refreshToken = this.options.storage?.getItem(
        `starbase.${this.options.clientId}`,
      );
      if (!refreshToken) throw new Error("authentication_required");
      this.tokens = { accessToken: "", refreshToken, expiresIn: 0 };
    }
    if (this.tokens.expiresIn <= Date.now() / 1000) {
      if (!this.refreshing)
        this.refreshing = (async () => {
          const refresh = async () => {
            const stored = this.options.storage?.getItem(`starbase.${this.options.clientId}`);
            if (this.options.storage && !stored) {
              this.invalidateRemoteSession();
              throw new StarbaseError("session_revoked", 401);
            }
            if (stored && stored !== this.tokens?.refreshToken)
              this.tokens = { accessToken: "", refreshToken: stored, expiresIn: 0 };
            const t = await this.request<TokenSet>("/auth/refresh", {
              refreshToken: this.tokens!.refreshToken,
              clientId: this.options.clientId,
            });
            this.tokens = {
              ...t,
              expiresIn: Date.now() / 1000 + t.expiresIn - 30,
            };
            this.save();
          };
          if (typeof navigator !== "undefined" && navigator.locks)
            await navigator.locks.request(`starbase.refresh.${this.options.clientId}`, refresh);
          else await refresh();
        })()
        .catch((error) => {
          if (this.requiresLogin(error)) this.handleExpired();
          throw error;
        })
        .finally(() => {
            this.refreshing = null;
          });
      await this.refreshing;
    }
    return this.tokens!.accessToken;
  }
  getProfile() {
    return this.request<Profile>("/me", undefined, true);
  }
  getApplicationHistory(page = 1) {
    return this.request<ApplicationHistory>(
      `/me/applications?page=${page}`,
      undefined,
      true,
    );
  }
  async hasPermission(permission: string) {
    return (
      await this.request<string[]>("/permissions", undefined, true)
    ).includes(permission);
  }
  async logout() {
    try {
      await this.request("/auth/logout", {}, true);
    } finally {
      this.clearSession();
    }
  }
  async logoutAll() {
    location.assign(new URL("/?view=sessions", this.options.baseUrl).href);
  }
}

/** Resource servers call this on each protected request; never trust client UI checks. */
export async function requireStarbasePermission(
  baseUrl: string,
  accessToken: string,
  permission: string,
) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const response = await fetch(`${baseUrl}/api/v1/permissions`, { headers });
  if (!response.ok) throw new Error("invalid_session");
  const permissions = (await response.json()) as string[];
  if (!permissions.includes(permission)) throw new Error("permission_denied");
  const profile = await fetch(`${baseUrl}/api/v1/me`, { headers });
  if (!profile.ok) throw new Error("invalid_session");
  const user = (await profile.json()) as Profile;
  if (user.applicationId !== permission.split(".")[0])
    throw new Error("application_mismatch");
  return user;
}
