import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Starbase } from "./index";
import type { ProfileScope } from "./contracts";
import { StarbaseSession, type AuthSnapshot } from "./session";
const Context = createContext<Starbase | null>(null);
const AuthContext = createContext<{
  client: Starbase;
  snapshot: AuthSnapshot;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => ReturnType<StarbaseSession["refresh"]>;
} | null>(null);
export function StarbaseProvider({
  client,
  children,
}: {
  client: Starbase;
  children: ReactNode;
}) {
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useStarbase() {
  const client = useContext(Context);
  if (!client) throw new Error("StarbaseProvider required");
  return client;
}

export function StarbaseAuthProvider({
  client,
  scopes = ["profile"],
  children,
}: {
  client: Starbase;
  scopes?: ProfileScope[];
  children: ReactNode;
}) {
  const [session] = useState(() => new StarbaseSession(client, scopes));
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => {
    void session.start();
  }, [session]);
  return (
    <Context.Provider value={client}>
      <AuthContext.Provider
        value={{
          client,
          snapshot,
          login: () => session.login(),
          logout: () => session.logout(),
          refresh: () => session.refresh(),
        }}
      >
        {children}
      </AuthContext.Provider>
    </Context.Provider>
  );
}

export function useStarbaseAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("StarbaseAuthProvider required");
  return auth;
}
