import { Starbase } from "../../packages/sdk/src";
const client = new Starbase({
  baseUrl: import.meta.env.VITE_STARBASE_URL ?? "http://127.0.0.1:5173",
  clientId: import.meta.env.VITE_STARBASE_CLIENT_ID ?? "starlab-web",
  redirectUri: location.origin + "/callback",
  storage: sessionStorage,
});
const root = document.querySelector<HTMLDivElement>("#app")!;
if (location.pathname === "/callback")
  client
    .handleCallback()
    .then((p) => {
      root.textContent = JSON.stringify(p, null, 2);
    })
    .catch((e) => {
      root.textContent = e.message;
    });
else {
  const button = document.createElement("button");
  button.textContent = "STARBASE ile giriş yap";
  button.onclick = () =>
    client.login(
      (import.meta.env.VITE_STARBASE_SCOPES ?? "profile,organization").split(
        ",",
      ),
    );
  root.append(button);
}
