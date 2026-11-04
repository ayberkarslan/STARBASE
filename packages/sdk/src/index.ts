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
  constructor(
    private options: {
      baseUrl: string;
      clientId: string;
      redirectUri: string;
      postLoginRedirect?: string;
      storage?: Storage;
      pendingStorage?: Storage;
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
      if (authenticated && this.requiresLogin(error)) this.redirectToLogin();
      throw error;
    }
    return result;
  }
  async login(scopes: ProfileScope[] = ["profile"]) {
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
    location.assign(url.href);
  }
  handleCallback(url = location.href): Promise<Profile> {
    if (!this.callbackPromise)
      this.callbackPromise = this.finishCallback(url).catch((error) => {
        this.callbackPromise = null;
        throw error;
      });
    return this.callbackPromise;
  }
  private async finishCallback(url: string) {
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
    history.replaceState(null, "", returnPath);
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
        this.refreshing = this.request<TokenSet>("/auth/refresh", {
          refreshToken: this.tokens.refreshToken,
          clientId: this.options.clientId,
        })
          .then((t) => {
            this.tokens = {
              ...t,
              expiresIn: Date.now() / 1000 + t.expiresIn - 30,
            };
            this.save();
          })
        .catch((error) => {
          if (this.requiresLogin(error)) this.redirectToLogin();
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
