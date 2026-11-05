import type { Profile, ProfileScope } from "./contracts";
import type { Starbase } from "./index";

export type AuthSnapshot =
  | { status: "checking" }
  | { status: "anonymous"; error?: Error }
  | { status: "authenticated"; profile: Profile };

export class StarbaseSession {
  private snapshot: AuthSnapshot = { status: "checking" };
  private listeners = new Set<() => void>();
  private startPromise: Promise<void> | null = null;

  constructor(
    private readonly client: Starbase,
    private readonly scopes: ProfileScope[] = ["profile"],
  ) {}

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(url = location.href) {
    if (!this.startPromise) this.startPromise = this.restore(url);
    return this.startPromise;
  }

  async login(scopes = this.scopes) {
    this.publish({ status: "checking" });
    try {
      await this.client.login(scopes);
    } catch (error) {
      this.publish({ status: "anonymous", error: this.asError(error) });
      throw error;
    }
  }

  async loginInBrowser(open: (url: string) => Promise<string>, scopes = this.scopes) {
    this.publish({ status: "checking" });
    try {
      const callback = await open(await this.client.createAuthorizationUrl(scopes));
      const profile = await this.client.handleCallback(callback, false);
      this.publish({ status: "authenticated", profile });
      return profile;
    } catch (error) {
      this.publish({ status: "anonymous", error: this.asError(error) });
      throw error;
    }
  }

  async refresh() {
    try {
      const profile = await this.client.getProfile();
      this.publish({ status: "authenticated", profile });
      return profile;
    } catch (error) {
      this.publish({ status: "anonymous", error: this.asError(error) });
      throw error;
    }
  }

  async logout() {
    try {
      await this.client.logout();
      this.publish({ status: "anonymous" });
    } catch (error) {
      this.publish({ status: "anonymous", error: this.asError(error) });
      throw error;
    }
  }

  private async restore(url: string) {
    try {
      const parsed = new URL(url);
      const profile =
        parsed.searchParams.has("code") || parsed.searchParams.has("error")
          ? await this.client.handleCallback(url)
          : await this.client.getProfile();
      this.publish({ status: "authenticated", profile });
    } catch (error) {
      this.publish({ status: "anonymous", error: this.asError(error) });
    }
  }

  private publish(snapshot: AuthSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private asError(error: unknown) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
