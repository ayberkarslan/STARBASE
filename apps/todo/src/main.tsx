import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Starbase } from "@starbase/sdk";
import { StarbaseAuthProvider } from "@starbase/sdk/react";
import "@stardrop/ui/styles.css";
import "./index.css";
import App from "./App";

const starbase = new Starbase({
  baseUrl: import.meta.env.VITE_STARBASE_URL ?? "http://127.0.0.1:5174",
  clientId: import.meta.env.VITE_STARBASE_CLIENT_ID ?? "starbase-todo-web",
  redirectUri: `${location.origin}/callback`,
  storage: sessionStorage,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StarbaseAuthProvider client={starbase} scopes={["profile"]}>
      <App />
    </StarbaseAuthProvider>
  </StrictMode>,
);
