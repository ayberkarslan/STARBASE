# Uygulama entegrasyonu

Yönetimden her web/desktop uygulaması için ayrı kimlik oluştur. Dönüş adresi tam eşleşir; wildcard yoktur. Origin, URL'nin protokol + host + port bölümüdür. `profile`, `email`, `organization` kapsamlarından gerekenleri kaydet. Uygulamaya özel iş verilerini uygulamanın kendi deposunda sakla.

```ts
import {Starbase} from '@starbase/sdk';
const client = new Starbase({
  baseUrl: 'https://YOUR-STARBASE.workers.dev',
  clientId: 'starlab-web',
  redirectUri: location.origin + '/callback',
  storage: sessionStorage
});
await client.login(['profile', 'organization']);
// /callback sayfasında:
const user = await client.handleCallback();
// Sonraki açılışlarda:
const profile = await client.getProfile();
await client.logout();
```

SDK şu an workspace TypeScript paketidir; npm'e yayımlanmamıştır. Başka depoda `packages/sdk` ve `packages/contracts` paketlerini birlikte al veya monorepo workspace bağlantısını kullan. React adaptörü `@starbase/sdk/react` içindeki `StarbaseProvider`, `useStarbase` yüzeyidir. SDK `hasPermission` yalnız düğme/görünüm durumunu belirler.

## Sunucu tarafı yetki

```ts
import { requireStarbasePermission } from '@starbase/sdk';
const user = await requireStarbasePermission(
  process.env.STARBASE_URL!,
  request.headers.get('authorization')!.replace(/^Bearer /, ''),
  'sponsorluk.hassas_veri.okuma'
);
// Ancak bu kontrol başarılıysa hassas kaynağı döndür.
```

Kaynak sunucu ayrıca tokenın beklediği uygulamaya ait olduğunu kontrol etmelidir: `/me` cevabındaki `applicationId` ile kendi uygulama kimliğini eşleştir. API'nin reddini erişim reddi olarak ele al; API erişilemiyorsa korunan veriyi döndürme.

## HTTP yüzeyi

Tam istek şemaları `/api/openapi.json` adresindedir; `npm run openapi` kaynak route tanımlarından günceller. Yanıt hataları `{error:{code}}` biçimindedir. 401 oturum, 403 kapsam/yetki, 429 deneme sınırı, 503 sağlayıcı/veritabanı veya kota hatasıdır.

- `/auth/register`, `/auth/login`, `/auth/recover`, `/auth/resend`, `/auth/verify`, `/auth/reset`, `/auth/password`
- `/authorize`, `/auth/exchange`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`
- `/me`, `/permissions`, `/organization`, `/connections`, `/sessions`
- `/admin/users`, `/admin/departments`, `/admin/teams`, `/admin/memberships`
- `/admin/apps`, `/admin/roles`, `/admin/permissions`, `/admin/role-assignments`
- `/admin/invites`, `/invites/accept`, `/admin/profile-fields`, `/admin/profile-values/:id`, `/admin/audit`

Tüm yollar `/api/v1` ile başlar. Cookie kullanan yazma istekleri aynı origin üzerinden yapılır. Uygulama istekleri Bearer token kullanır. Üretimde register/recover için `x-turnstile-token` gerekir.

## Çalışan Vite örneği

`VITE_STARBASE_URL` ortam değişkenini yerel STARBASE arayüz adresinle eşleştir (varsayılan `http://127.0.0.1:5173`). `VITE_STARBASE_CLIENT_ID` varsayılanı `starlab-web`; `VITE_STARBASE_SCOPES` virgülle ayrılmış kapsamları belirler. `starlab-web` uygulamasında `http://127.0.0.1:5180/callback` ve origin `http://127.0.0.1:5180` kaydet. `npm run example:web` ile aç. İkinci uygulamayı farklı kimlik ve portla kaydederek tarayıcı merkezi oturumunun yeniden şifre istemediğini doğrula.

## Tauri

`examples/tauri/native` derlenebilir Rust istemcisidir. Sistem tarayıcısını verilen callback ile açar, 127.0.0.1:43817 loopback callback'i dinler, PKCE/state kontrol eder, refresh tokenını işletim sistemi keyring'inde tutar. Kaydetmen gereken callback: `http://127.0.0.1:43817/callback`.

`examples/tauri/src-tauri/commands.rs` mevcut Tauri projesine eklenebilecek komut köprüsüdür. Opener plugin ve `invoke_handler` kaydı projenin mevcut builder'ına eklenir. WebView'e refresh token veya şifre verilmez. Komutları eşzamanlı çağırma; native istemci yenilemelerini tek bir uygulama durumunda sırala. Gerçek işletim sistemi keyring ve tarayıcı dönüşü GUI üzerinde ayrıca denenmelidir.
