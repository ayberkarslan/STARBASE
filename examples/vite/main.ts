import {
  Starbase,
  type Profile,
  type ProfileScope,
} from "../../packages/sdk/src";
const client = new Starbase({
  baseUrl: import.meta.env.VITE_STARBASE_URL ?? "http://127.0.0.1:5173",
  clientId: import.meta.env.VITE_STARBASE_CLIENT_ID ?? "starlab-web",
  redirectUri: location.origin + "/callback",
  storage: sessionStorage,
});
const root = document.querySelector<HTMLDivElement>("#app")!;
function showProfile(profile: Profile) {
  root.replaceChildren();
  const details = document.createElement("pre");
  details.dataset.profile = "";
  details.textContent = JSON.stringify(profile, null, 2);
  const logout = document.createElement("button");
  logout.textContent = "Çıkış yap";
  logout.onclick = async () => {
    try {
      await client.logout();
      location.assign("/");
    } catch {
      root.textContent =
        "Çıkış sunucuya bildirilemedi. Yerel oturum temizlendi.";
    }
  };
  root.append(details, logout);
}
async function start() {
  if (location.pathname === "/callback") {
    showProfile(await client.handleCallback());
    return;
  }
  try {
    showProfile(await client.getProfile());
  } catch {
    root.replaceChildren();
    const button = document.createElement("button");
    button.textContent = "STARBASE ile giriş yap";
    button.onclick = () =>
      client.login(
        (import.meta.env.VITE_STARBASE_SCOPES ?? "profile,organization").split(
          ",",
        ) as ProfileScope[],
      );
    root.append(button);
  }
}
start().catch(() => {
  root.textContent = "Giriş tamamlanamadı. Ana sayfaya dönüp tekrar dene.";
});
