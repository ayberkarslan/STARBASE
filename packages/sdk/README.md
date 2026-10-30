# @starbase/sdk

STARBASE hesabını Vite, React ve sunucu uygulamalarına bağlar. Bu arşiv JavaScript ve TypeScript tiplerini birlikte içerir; STARBASE deposuna veya ayrı contracts paketine ihtiyaç duymaz. React adaptörü isteğe bağlıdır.

```sh
npm install ./starbase-sdk.tgz
```

```ts
import {Starbase,StarbaseError,type Profile} from '@starbase/sdk';
export const starbase=new Starbase({
 baseUrl:'https://YOUR-STARBASE.workers.dev',
 clientId:'starlab-web',
 redirectUri:location.origin+'/callback',
 storage:sessionStorage
});
// Giriş düğmesi:
await starbase.login(['profile','organization']);
// /callback sayfasında:
const profile=await starbase.handleCallback();
// Uygulama yeniden açıldığında:
const restored=await starbase.getProfile();
// Gerçek çıkış düğmesi:
await starbase.logout();
```

Yönetim panelinde clientId, tam redirectUri, frontend origin ve izinli kapsamları önceden kaydet. Web ile native uygulamalar için ayrı clientId kullan. Client secret veya Firebase private key frontend'e eklenmez.

`getAccessToken()` kaynak API'lerine Bearer token verir ve gerektiğinde oturumu yeniler. `hasPermission(key)` arayüz içindir; korunan API `requireStarbasePermission(baseUrl,token,key)` ile sunucuda kontrol eder. İzin anahtarı uygulama kimliğiyle başlamalıdır: `starlab-web.projects.read`.

`getApplicationHistory(page)` yalnız bu uygulamadaki kendi giriş/çıkış geçmişini döndürür. Takımın diğer uygulama geçmişleri uygulamalara otomatik açılmaz. Giriş ve çıkış API'de kaydedilir; ek takip kodu, heartbeat veya ücretli analiz servisi yoktur. Tarayıcı kapatılması çıkış bildirimi sayılmaz; kayıtlar online durum veya çalışma süresi değildir.

React: `@starbase/sdk/react` içinden `StarbaseProvider` ve `useStarbase` kullan. İstemciyi modül düzeyinde bir kere oluştur. `handleCallback()` aynı istemcide eşzamanlı çağrıldığında kodu bir kere değiştirir; React StrictMode ile kullanılabilir. Callback sayfası giriş zorunlu route guard'ının dışında olmalıdır.

Hatalar `StarbaseError` üzerinde `code` ve `status` taşır; ağ hataları platform hatası olarak gelebilir. Token, şifre ve callback kodunu loglama. `logout()` ağ hatasında da yerel depoyu temizler ve hatayı çağırana iletir; bu durumda gerçek sunucu çıkış tarihi oluşmamış olabilir.

`logoutAll()` merkezi hesap ekranındaki Oturumlar sayfasını açar; kullanıcı oradan tüm oturumlarını sonlandırır. Uygulama tokenları merkezi hesap yönetim yetkisi vermez.

Tam kurulum, HTTP sözleşmesi, Tauri köprüsü ve hata çözümü STARBASE geliştirici ekranında `/docs` ve `/api/openapi.json` adreslerindedir.
