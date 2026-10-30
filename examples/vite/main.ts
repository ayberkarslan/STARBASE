import { Starbase } from "../../packages/sdk/src";
const client = new Starbase({
  baseUrl: "http://127.0.0.1:8787",
  clientId: "starlab-web",
  redirectUri: location.origin + "/callback",
  storage: sessionStorage,
});
const root = document.querySelector<HTMLDivElement>("#app")!;
if (location.pathname === "/callback")
  client
    .handleCallback()
    .then((p) => {
      root.textContent = `Merhaba ${p.firstName}`;
    })
    .catch((e) => {
      root.textContent = e.message;
    });
else {
  const button = document.createElement("button");
  button.textContent = "STARBASE ile giriş yap";
  button.onclick = () => client.login(["profile", "organization"]);
  root.append(button);
}
