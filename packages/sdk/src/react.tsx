import { createContext, useContext, type ReactNode } from "react";
import { Starbase } from "./index";
const Context = createContext<Starbase | null>(null);
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
