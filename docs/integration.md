# STARBASE uygulama entegrasyonu

Bu belge Vite, React, Tauri ve kaynak API geliştiricileri içindir. Giriş/çıkış geçmişi auth akışında otomatik oluşur; ayrı olay gönderme, heartbeat veya analiz servisi kurulmaz. STARBASE kendi SDK protokolünü kullanır; genel OAuth/OIDC sağlayıcısı değildir.

## 1. Yönetimden uygulama kaydı

Her web ve masaüstü uygulaması için ayrı `clientId` oluştur. Kaydın değerleri:

| Alan         | Örnek                            | Kural                                                |
| ------------ | -------------------------------- | ---------------------------------------------------- |
| Kimlik       | `starlab-web`                    | Küçük harf, rakam ve tire; izin anahtarlarının öneki |
| Dönüş adresi | `http://127.0.0.1:5180/callback` | Tam eşleşme; wildcard yok                            |
| Origin       | `http://127.0.0.1:5180`          | Protokol + host + port; path yok                     |
| Kapsamlar    | `profile`, `organization`        | Yalnız gereken alanları seç                          |

`apps.manage` izni olan geliştirici uygulamayı yönetim ekranından kaydedebilir. Görünen uygulama adı ve isteğe bağlı logo adresi merkezi STARBASE tarafından saklanır. Logo HTTPS olmalı ve kayıtlı uygulama origin’lerinden birinde barınmalıdır; üçüncü taraf logo host’u kabul edilmez. Logo boşsa merkezi Starbase markası kullanılır. Login öncesi marka endpoint’i yalnız kayıtlı tam callback adresi için uygulama adını/logo URL’sini döndürür; son kullanıcı metin, stil veya sayfa yapısını uygulama üzerinden değiştiremez.

Üretim dönüş adresleri HTTPS olmalıdır; localhost/127.0.0.1 native ve geliştirme için kullanılabilir. localhost ile 127.0.0.1 aynı origin değildir. Frontend'e client secret veya Firebase özel anahtarı konmaz.

## 2. Tek dosyayla SDK kurulumu

STARBASE `/docs` ekranından **SDK paketini indir** bağlantısını kullan:

```sh
npm install ./starbase-sdk.tgz
```

Arşiv derlenmiş JavaScript ve TypeScript tiplerini içerir. Ayrı contracts paketi, Firebase SDK'sı veya STARBASE deposunun kopyası gerekmez. React adaptörü isteğe bağlıdır. Henüz npm registry yayını yapılmadı; rastgele aynı adlı bir paketi kurma.

Depodan paket üretmek için `npm run pack:sdk` çalıştır. Versiyonlu arşiv `artifacts/` dizinine; indirilebilir kopya `apps/web/public/downloads/starbase-sdk.tgz` yoluna yazılır. `npm run build` SDK paketini de üretir. `node scripts/check-sdk.mjs` arşivin bağımsız JavaScript ve tip kullanımını doğrular.

## 3. Vite bağlantısı

```ts
// src/lib/starbase.ts — modül düzeyinde tek istemci
import { Starbase } from "@starbase/sdk";

export const starbase = new Starbase({
  baseUrl: import.meta.env.VITE_STARBASE_URL,
  clientId: "starlab-web",
  redirectUri: location.origin + "/callback",
  storage: sessionStorage,
});
```

```dotenv
VITE_STARBASE_URL=http://127.0.0.1:5173
```

STARBASE farklı portta çalışıyorsa bu adresi değiştir. Worker adresi yerine merkezi arayüz adresini kullan; yerelde arayüz API'yi proxy eder. Üretimde arayüz ve API aynı Worker originindedir.

```ts
// Giriş düğmesinin onClick işlemi
await starbase.login(["profile", "organization"]);

// /callback sayfasında; bu sayfa auth guard dışında kalmalı
const profile = await starbase.handleCallback();
// Ardından kendi router'ınla ana sayfaya geç.

// Sonraki uygulama açılışında mevcut oturumu geri yükle
const currentUser = await starbase.getProfile();

// Gerçek çıkış düğmesi
await starbase.logout();
```

Kullanıcı merkezi STARBASE oturumuna sahipse tekrar şifre istenmez. İlk bağlantıda alan onayı gösterilir; kapsam artarsa yeniden onay gerekir. Callback kodu tek kullanımlık ve PKCE/state'e bağlıdır. Callback URL'sini, şifre veya tokenları loglama.

### React ile paylaşılan auth lifecycle

Yeni React uygulamalarında `StarbaseAuthProvider`, oturum restore, callback exchange ve auth state yönetimini üstlenir. Uygulama yalnızca bir istemci yapılandırır; login/signup yine merkezi STARBASE ekranında gerçekleşir. Bu sayede hesap ekranı tek yerde değişir ve tüm bağlı uygulamalara yansır.

```tsx
import { Starbase } from "@starbase/sdk";
import { StarbaseAuthProvider, useStarbaseAuth } from "@starbase/sdk/react";

const starbase = new Starbase({
  baseUrl: import.meta.env.VITE_STARBASE_URL,
  clientId: "my-web-app",
  redirectUri: location.origin + "/callback",
  storage: sessionStorage,
});

// Uygulama kökü
<StarbaseAuthProvider client={starbase} scopes={["profile"]}>
  <App />
</StarbaseAuthProvider>;

// Bileşen içinde
const { snapshot, login, logout } = useStarbaseAuth();
if (snapshot.status === "checking") return <Loading />;
if (snapshot.status === "anonymous")
  return <button onClick={() => login()}>Giriş / kayıt</button>;
return (
  <button onClick={() => logout()}>Çıkış · {snapshot.profile.username}</button>
);
```

Auth snapshot durumları `checking`, `anonymous` ve `authenticated` değerleridir. Provider callback URL’sini otomatik tanır, tek kullanımlık kodu değiştirir ve URL query’sini temizler. İstemciyi modül düzeyinde bir kere oluştur. React StrictMode tekrarları tek callback exchange ve tek session restore işleminde birleştirilir. `StarbaseSession` framework bağımsız eşdeğer state/lifecycle API’sidir; `StarbaseProvider/useStarbase` düşük seviyeli ve geriye uyumlu istemci erişimi olarak korunur.

Başarılı login/signup ve consent akışının tamamı merkezi STARBASE hesabında kalır. Yeni uygulamalar Firebase Auth veya parola endpoint’i oluşturmaz; yalnızca panelde kayıtlı `clientId`, origin, tam callback URL’si ve gerekli scope ile bu SDK’yı bağlar.

### Profil kapsamları

| Kapsam         | Alanlar                                               |
| -------------- | ----------------------------------------------------- |
| Her zaman      | `id`, `username`, uygulama oturumunda `applicationId` |
| `profile`      | `firstName`, `lastName`                               |
| `email`        | `email`, `emailVerified`                              |
| `organization` | `memberships`: departman ve ekip kimliği/adı          |

Özel yönetim alanları, tüm roller ve diğer uygulamaların izinleri profile eklenmez. Kullanıcı bağlantıyı kaldırırsa ilgili uygulama oturumları iptal olur.

## 4. Kaynak API'de yetki kontrolü

```ts
// Frontend
const token = await starbase.getAccessToken();
const response = await fetch("/api/projects", {
  headers: { Authorization: "Bearer " + token },
});
```

```ts
// Kendi API sunucun
import { requireStarbasePermission } from "@starbase/sdk";

const user = await requireStarbasePermission(
  process.env.STARBASE_URL!,
  bearerToken,
  "starlab-web.projects.read",
);
// Yalnız başarılıysa korunan kaynağı döndür.
```

İzin anahtarı kaydedilen uygulama kimliğiyle başlamalıdır. Yönetici izni tanımlar, role ekler ve rolü kişiye atar. Yardımcı hem izni hem dönen `applicationId` değerini kontrol eder. `hasPermission()` yalnız arayüz davranışı içindir; kaynak API'de bu doğrulama zorunludur. STARBASE erişilemiyorsa korunan veriyi döndürme. Offline JWT doğrulaması yoktur; tokenlar opaque oturum anahtarlarıdır.

## 5. Oturum ve uygulama geçmişi

```ts
const history = await starbase.getApplicationHistory(1);
// applications: uygulama bazında son giriş / gerçek son çıkış
// visits: 20 oturumluk sayfa
// page, pageSize, total, hasMore
```

Uygulama tokenı yalnız **o uygulamadaki kendi** geçmişini görür. Başka kullanıcılar veya diğer uygulamaların geçmişleri uygulamalara açılmaz. Merkezi panelde, takım üyeleri takım profillerinin uygulama geçmişini görebilir. İlk bağlantı izin ekranı bunu belirtir.

| İşlem                                                                 | Oluşan kayıt                                     |
| --------------------------------------------------------------------- | ------------------------------------------------ |
| Başarılı kod değişimi / `handleCallback()`                            | Bir uygulama girişi                              |
| Token refresh / `getProfile()` / uygulama yeniden açılışı             | Yeni giriş oluşmaz                               |
| `logout()`                                                            | Gerçek çıkış tarihi ve `logout`                  |
| Merkezi “tüm oturumları kapat”                                        | İlgili açık uygulama oturumlarında `logout`      |
| Bağlantı kaldırma, şifre değişimi, yönetimden kapatma, refresh replay | `revoked`; gerçek son çıkış tarihi değişmez      |
| Oturum geçerliliğinin dolması                                         | `expired`; gerçek son çıkış tarihi değişmez      |
| Sekme/pencere kapanması, çökme, ağ kesintisi                          | Çıkış uydurulmaz; bildirim yoksa çıkış boş kalır |

Tarihler UTC Unix **saniyesidir**. Gösterim için `new Date(timestamp * 1000)` kullan. Bu veri online durumu veya çalışma süresi değildir. `beforeunload` ile çıkış zamanını garanti etmeye çalışma. Logout ağ hatasında SDK yerel bilgiyi temizler ve hatayı çağırana iletir; sunucuda çıkış oluşmayabilir. Merkezi Oturumlar ekranından kalan oturum kapatılabilir.

Geçmiş bu özelliğin devreye alınmasından itibaren oluşur; eski giriş tarihleri tahmin edilmez. Ayrıntılı oturumlar 90 gün tutulur. Uygulama başına son giriş/çıkış özeti, kullanıcı/uygulama silinene kadar korunur. Günlük cron süre dolumlarını ve eski ayrıntıları temizler. Son çıkış önceki oturuma ait olabilir; sonraki giriş yapılmış olması bu tarihi silmez.

## 6. Takım panosu ve dizin API'si

Bu uçlar **yalnız merkezi oturum ve takım üyeliği** gerektirir; uygulama Bearer tokenları erişemez. Kaydolan fakat takıma davet edilmemiş hesaplar dizini göremez. Hesap devre dışıysa listeden ve profilden çıkarılır. Üyelerin e-postaları, yönetim yetkileri ve özel profil alanları paylaşılmaz.

| Uç                                                            | Sonuç                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/v1/directory/users?q=&departmentId=&teamId=&page=1` | `{users,page,pageSize:24,total,hasMore}`                          |
| `GET /api/v1/directory/teams`                                 | Departman/ekip listeleri ve benzersiz üye sayıları                |
| `GET /api/v1/directory/users/:id`                             | Takım profili, üyelikler, uygulama özetleri ve ilk oturum sayfası |
| `GET /api/v1/directory/users/:id/activity?page=1`             | Uygulama özetleri ve 20 oturumluk sayfa                           |
| `GET /api/v1/me/applications?page=1`                          | Kendi geçmişin; uygulama tokenında yalnız ilgili uygulama         |

Arama isim, soyisim ve kullanıcı adında yapılır; Türkçe karakterler ve harf büyüklüğü normalize edilir. `%` ve `_` gibi kullanıcı girdileri SQL wildcard'ı olarak işletilmez. Filtreler birlikte uygulanır. Arşivlenmiş ekipler gezinti filtresine dahil edilmez.

## 7. Tauri / native

`examples/tauri/native` derlenebilir Rust istemcisidir. Sistem tarayıcısını açar, PKCE/state doğrular ve refresh tokenını işletim sistemi keyring'inde tutar. Kaydedilecek dönüş adresi: `http://127.0.0.1:43817/callback`. Masaüstü için `starlab-desktop` gibi ayrı kimlik kullan.

```rust
let client = starbase_native::Starbase::new(
    "https://YOUR-STARBASE.workers.dev", "starlab-desktop"
)?;
let profile = client.login(open_browser).await?;
let restored = client.get_profile().await?;
client.logout().await?;
```

`examples/tauri/src-tauri/commands.rs` komutlarını mevcut builder'ın `invoke_handler` listesine ekle ve opener plugin kaydını yap. Frontend `invoke('starbase_login')`, `invoke('starbase_profile')`, `invoke('starbase_logout')` çağırır. Refresh token veya servis anahtarı JavaScript'e taşınmaz. Native istemci eşzamanlı işlemleri sıraya alır. `logout()` bildirimi başarılı olduktan sonra anahtarlığı temizler; çevrimdışıysa hata döner ve yeniden denenebilir. `clear_local_session()` yalnız yerel temizlemedir, sunucu çıkış tarihi üretmez.

Gerçek işletim sisteminde tarayıcı dönüşü ve keyring ayrıca denenmelidir; bu depoda native istemcinin derlemesi doğrulanır.

## 8. Hatalar ve sorun çözümü

SDK API hataları `StarbaseError` üzerinde `code` ve `status` taşır. Ağ/bağlantı hataları platform hatası olabilir.

```ts
import { StarbaseError } from "@starbase/sdk";
try {
  await starbase.getProfile();
} catch (error) {
  if (error instanceof StarbaseError && error.status === 401) {
    // Kullanıcıya yeniden giriş düğmesi göster.
  } else {
    // İzin veya bağlantı hatasını göster; korunan veriyi açma.
  }
}
```

| Kod/durum                                         | Çözüm                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `origin_rejected`                                 | Kaydedilen origin ile gerçek protokol/host/port eşleşmesini kontrol et              |
| `invalid_authorization`                           | clientId, tam redirectUri ve izinli kapsamları kontrol et                           |
| `state_mismatch`, `missing_login`, `invalid_code` | Girişi aynı sekmede baştan başlat; callback'i kopyalama veya kodu tekrar değiştirme |
| `session_expired`, `refresh_reused`, 401          | Yeniden giriş; refresh tokenları istemciler arasında kopyalanmaz                    |
| `permission_denied`, `application_mismatch`, 403  | İzin öneki, kullanıcı rolü ve uygulama kimliğini kontrol et                         |
| `team_membership_required`                        | Takım davetini kabul et veya yönetimden üyelik iste                                 |
| 429                                               | Deneme sıklığını azalt; kullanıcıya bekleyip yeniden deneme sun                     |
| 503                                               | Sağlayıcı/veritabanı/ağ veya ücretsiz kota; erişimi açık bırakma                    |

## 9. Çalışan örnek ve doğrulama

`npm run example:web` varsayılan olarak 5180 portunda açılır. `VITE_STARBASE_URL`, `VITE_STARBASE_CLIENT_ID`, `VITE_STARBASE_SCOPES` ortam değişkenlerini uygulama kaydıyla eşleştir. Örnek hem oturum geri yükleme hem gerçek logout gösterir.

```sh
npm run emulators
npm run dev:api
npm run dev
# Ayrı terminalde, gerçek yerel servisler açıkken:
STARBASE_LIVE_TEST=1 npm run test:ui
```

Gerçek entegrasyon testi iki ayrı origin'de Vite örneklerini boş portlarda açar; giriş, çıkış, tekrar giriş, onay, profil kapsamı ve profil geçmişini doğrular. Test kullanıcılarını temizler; üretim verisine karşı çalıştırılmaz.

## Yönetimden üye oluşturma

Üyeler ekranındaki **Üye ekle**, `POST /api/v1/admin/users` çağırır. Merkezi oturum, `users.manage` izni ve yöneticinin mevcut şifresi gerekir. Alanlar: `firstName`, `lastName`, `username`, `email`, `temporaryPassword`, `currentPassword`; isteğe bağlı `teamId`. Kişi normal üye olur, ilk girişte şifresini değiştirir. E-posta gönderimi başarısızsa oluşturulan hesap korunur; `verificationDelivered` durumu belirtir. Yerel emülatör test bağlantısı panelde gösterilir.

Tam HTTP istek şemaları `/api/openapi.json` adresindedir. Yeni route eklenince `npm run openapi` ile güncellenir. Cookie ile yazma işlemleri aynı origin'den yapılır; uygulama çağrıları Bearer kullanır. Üretimde kayıt/kurtarma için `x-turnstile-token` gerekir.
