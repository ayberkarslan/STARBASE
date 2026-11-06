# @starbase/sdk

STARBASE hesabını Vite, React ve sunucu uygulamalarına bağlar. Bu arşiv JavaScript ve TypeScript tiplerini birlikte içerir; STARBASE deposuna veya ayrı contracts paketine ihtiyaç duymaz. React adaptörü isteğe bağlıdır.

```sh
npm install ./starbase-sdk.tgz
```

```ts
import { Starbase, StarbaseError, type Profile } from "@starbase/sdk";
export const starbase = new Starbase({
  baseUrl: "https://YOUR-STARBASE.workers.dev",
  clientId: "starlab-web",
  redirectUri: location.origin + "/callback",
  storage: sessionStorage,
});
// Giriş düğmesi:
await starbase.login(["profile", "organization"]);
// /callback sayfasında:
const profile = await starbase.handleCallback();
// Uygulama yeniden açıldığında:
const restored = await starbase.getProfile();
// Gerçek çıkış düğmesi:
await starbase.logout();
```

Yönetim panelinde clientId, tam redirectUri, frontend origin ve izinli kapsamları önceden kaydet. Web ile native uygulamalar için ayrı clientId kullan. Client secret veya Firebase private key frontend'e eklenmez.

`getAccessToken()` kaynak API'lerine Bearer token verir ve gerektiğinde oturumu yeniler. `hasPermission(key)` arayüz içindir; korunan API `requireStarbasePermission(baseUrl,token,key)` ile sunucuda kontrol eder. İzin anahtarı uygulama kimliğiyle başlamalıdır: `starlab-web.projects.read`.

`getApplicationHistory(page)` yalnız bu uygulamadaki kendi giriş/çıkış geçmişini döndürür. Takımın diğer uygulama geçmişleri uygulamalara otomatik açılmaz. Giriş ve çıkış API'de kaydedilir; ek takip kodu, heartbeat veya ücretli analiz servisi yoktur. Tarayıcı kapatılması çıkış bildirimi sayılmaz; kayıtlar online durum veya çalışma süresi değildir.

React: `@starbase/sdk/react` içindeki `StarbaseAuthProvider` oturumu geri yükler, `/callback` adresindeki PKCE dönüşünü işler ve `checking` / `anonymous` / `authenticated` durumlarını paylaşır. `useStarbaseAuth()` ile `snapshot`, `login`, `logout` ve `refresh` al. İstemciyi modül düzeyinde bir kere oluştur:

```tsx
import { Starbase } from "@starbase/sdk";
import { StarbaseAuthProvider, useStarbaseAuth } from "@starbase/sdk/react";

const starbase = new Starbase({
  baseUrl: import.meta.env.VITE_STARBASE_URL,
  clientId: "my-web-app",
  redirectUri: location.origin + "/callback",
  storage: sessionStorage,
});

createRoot(document.getElementById("root")!).render(
  <StarbaseAuthProvider client={starbase} scopes={["profile"]}>
    <App />
  </StarbaseAuthProvider>,
);

function LoginButton() {
  const { snapshot, login } = useStarbaseAuth();
  if (snapshot.status === "checking") return <p>Oturum kontrol ediliyor</p>;
  if (snapshot.status === "anonymous")
    return <button onClick={() => void login()}>Giriş / kayıt</button>;
  return <p>Merhaba, {snapshot.profile.firstName}</p>;
}
```

Giriş/kayıt düğmesi kullanıcıyı merkezi STARBASE hesabına yönlendirir; uygulama şifre toplamaz. Provider `/callback` dönüşünü otomatik işler. Provider kullanmayan framework’ler aynı lifecycle için `StarbaseSession` sınıfını kullanabilir. Eski `StarbaseProvider` ve `useStarbase` API’si düşük seviyeli istemci erişimi için geriye dönük mevcuttur. Callback sayfası giriş zorunlu route guard'ının dışında olmalıdır.

`profile` izni olan uygulamalar `/me` yanıtında sürümlü `photoUrl` alır. Fotoğrafı `Authorization: Bearer <accessToken>` başlığıyla STARBASE adresinden iste; korumalı adresi doğrudan `<img src>` içine koyma. Açık uygulamalarda fotoğraf değişikliğini anında almak için `wss://STARBASE/api/v1/me/live` adresine `new WebSocket(url, ["starbase-profile", await client.getAccessToken()])` ile bağlan. `profile.photo.changed` bildirimi yalnız değişiklik işaretidir: `refresh()` ile profili ve yeni `photoUrl` adresini yeniden al. Görünür hale gelince de yenile; token veya fotoğraf içeriği WebSocket mesajında taşınmaz.

Tauri masaüstünde giriş için sistem tarayıcısını ve yalnızca loopback adresini dinleyen yerel bir geri dönüş köprüsünü kullan. Köprü tek kullanımlık kodu taşıyan tam callback URL'sini döndürür; SDK durum ve PKCE doğrulamasını yapar. Sabit portu ve tam callback adresini STARBASE uygulama kaydına ekle. Şifre veya kodu loglama.

```tsx
const starbase = new Starbase({
  baseUrl: "https://YOUR-STARBASE.workers.dev",
  clientId: "my-desktop-app",
  redirectUri: "http://127.0.0.1:1421/callback",
  storage: localStorage,
  sessionExpiryMode: "stay",
});

<StarbaseAuthProvider
  client={starbase}
  openAuthorizationUrl={(url) => invoke<string>("starbase_browser_login", { url })}
>
  <App />
</StarbaseAuthProvider>
```

`sessionExpiryMode: "stay"` WebView'in giriş sayfasına yönlenmesini önler ve provider oturumu anonim duruma geçirir. Masaüstü köprüsü yalnız kayıtlı STARBASE adresini açmalı, localhost üzerinde bekleyen bağlantıyı doğrulamalı ve süre aşımı uygulamalıdır. `createAuthorizationUrl()` ve `handleCallback(url, false)` aynı akışı React olmadan kurar. STARBASE'ten masaüstünü açmak istersen uygulama kaydında `launchUrl` tanımla ve Tauri deep-link protokolünü ayrı yapılandır.

Hatalar `StarbaseError` üzerinde `code` ve `status` taşır; ağ hataları platform hatası olarak gelebilir. Token, şifre ve callback kodunu loglama. `logout()` ağ hatasında da yerel depoyu temizler ve hatayı çağırana iletir; bu durumda gerçek sunucu çıkış tarihi oluşmamış olabilir.

`logoutAll()` merkezi hesap ekranındaki Oturumlar sayfasını açar; kullanıcı oradan tüm oturumlarını sonlandırır. Uygulama tokenları merkezi hesap yönetim yetkisi vermez.

Tam kurulum, HTTP sözleşmesi, Tauri köprüsü ve hata çözümü STARBASE geliştirici ekranında `/docs` ve `/api/openapi.json` adreslerindedir.
