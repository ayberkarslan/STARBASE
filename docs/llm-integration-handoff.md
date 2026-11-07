# STARBASE: yeni uygulama entegrasyonu için teknik devir notu

Bu belge, bu dizinde (`~/Projects/YRTHUB`) çalışan ve STARBASE'i ilk kez gören bir geliştirici/LLM içindir. Kodun mevcut halini esas alır. Yeni uygulamanın kendi mimarisini incelemeden Takvim'in Firebase köprüsünü kopyalama.

## 1. Sistem nedir, nerede çalışır?

STARBASE, Yıldız Roket Takımı'nın merkezi hesabı, uygulama izin sistemi ve uygulama vitrini. Login/signup arayüzü ve parola yönetimi STARBASE'tedir. Bağlı uygulama kendi parola formunu veya ayrı bir STARBASE kullanıcısı üretmez. Proje genel OAuth/OIDC sağlayıcısı değil; kendi authorization-code + PKCE protokolüne ve `@starbase/sdk` istemcisine sahiptir.

- Repo: bu dizin. Monorepo: `apps/api` Cloudflare Worker/Hono API, `apps/web` Vite/React arayüz, `packages/sdk` TypeScript/React SDK, `packages/ui` vendored `@stardrop/ui`, `examples/vite` örnek istemci, `examples/tauri/native` native Rust örneği.
- Canlı STARBASE: `https://starbase.ayberkarslann0.workers.dev`. `starbase.ayberkarslan.com` ayrıca Worker'a bağlı özel alan adıdır. Şu an Worker `PUBLIC_ORIGIN` ve Takvim entegrasyonu **workers.dev** adresini kullanıyor. Yeni uygulamada bir baz URL seç, kayıtlı origin/callback/redirect değerlerini onunla tutarlı tut; alan adını yalnız DNS'ten değiştirip her şeyin otomatik taşınacağını varsayma.
- Sağlık: `GET /api/v1/health`; makine okunur sözleşme: `GET /api/openapi.json`; yerleşik geliştirici açıklaması `/docs`.
- Firebase Auth (`starbase-3ce1f`) yalnız hesap/parola/e-posta doğrulaması için. STARBASE kullanıcı kimlikleri, uygulama kayıtları, izinler ve oturumlar Cloudflare D1 `starbase` veritabanında. Arayüz ve API aynı Worker'da. Firebase Admin özel anahtarı Worker secret'ıdır; frontend'e veya Git'e koyma.
- Uygulama logo/ismi/açma adresi STARBASE `apps` kaydından gelir. Değişiklikler merkezi vitrin ve yörüngede aynı kaynaktan görünür.

Önce `docs/integration.md`, `docs/architecture.md`, `packages/sdk/README.md` ve SDK kaynaklarını oku. Bu not, Takvim'de fiilen yapılan işi ve yeni projeye taşınacak parçaları özetler.

## 2. Merkezî yetkilendirme akışı

1. STARBASE yönetiminde (`apps.manage`) uygulamaya değişmeyecek bir `clientId` ver: `[a-z0-9-]{3,40}`. Web ve masaüstü için ayrı kayıt kullan. `redirects` tam callback URL'leri, `origins` protokol+host+port, `scopes` yalnız gereken `profile`, `email`, `organization` değerleri. `launchUrl` vitrindeki “Uygulamayı aç” bağlantısıdır; tek başına oturum açmaz. Lokal ve canlı callback/originleri ayrı ayrı kaydet. HTTPS üretimde zorunlu; localhost/127.0.0.1 geliştirmede kabul edilir. `localhost` ile `127.0.0.1` farklı originlerdir.
2. İstemci `Starbase.createAuthorizationUrl(scopes)` veya `login(scopes)` ile STARBASE `/authorize` ekranına gider. SDK rastgele PKCE verifier ve state üretip geçici olarak `sessionStorage` içinde saklar. Merkezi kullanıcı zaten giriş yapmışsa tekrar parola istemez; kapsam onayı gerekiyorsa gösterir. `autoAuthorize` yalnız güvenilir uygulama için yönetimde açılabilir; Takvim'de açıktır.
3. STARBASE tek kullanımlık, 60 saniyelik kodu **tam kayıtlı** `/callback` adresine `code` ve `state` olarak döndürür. Callback auth guard dışında kalmalı. `StarbaseAuthProvider` bunu otomatik tanır; `handleCallback()` state/PKCE kontrol edip `POST /api/v1/auth/exchange` çağırır ve query'yi temizler. React dışı uygulamada callback'i açıkça işle.
4. Exchange uygulamaya kısa ömürlü opaque access token ve rotasyonlu refresh token verir. Erişim tokenı yaklaşık 10 dakika; refresh ailesi en çok 7 gün. SDK `getAccessToken()` ile gerekli yenilemeyi yapar ve aynı anda yapılan yenilemeleri birleştirir. Refresh token tekrar kullanımı aileyi iptal eder. Tokenı URL'ye, log'a, hata mesajına yazma.
5. `GET /api/v1/me` Bearer tokenla uygulamanın izin verilen profilini döndürür. `applicationId` alanının **beklenen clientId** olduğunu sunucu tarafında da doğrula. `organization` kapsamı gerekiyorsa takım üyeliğini `GET /api/v1/organization` ile sunucuda ayrıca denetle. Başka üyelerin takım dizini uygulama tokenlarına açık değildir.
6. Gerçek uygulama çıkışında `starbase.logout()` çağır. Refresh, sayfa yenileme ve pencere kapanışı yeni giriş/çıkış olayı oluşturmaz. Kaydedilmiş ziyaretin gerçek çıkışı `logout`, iptal `revoked`, süre dolması `expired` olarak ayrılır. Yönetici 90 günlük giriş, çıkış, IP ve istemci bilgisini Erişim geçmişi ekranında görür; çevrimiçi durumu uydurulmaz.

## 3. En kısa Vite/React bağlantısı

SDK npm registry'de değil. Bu repoda `npm run pack:sdk` çalıştır; `artifacts/starbase-sdk-0.2.0.tgz` veya `/docs` indirme bağlantısındaki paketi hedef projeye kur (`npm install /path/to/starbase-sdk-0.2.0.tgz`). Takvim paketi `vendor/starbase-sdk-0.2.0.tgz` içinde sürümlüyor. Sadece SDK bağlantısı için hedef uygulamada Firebase Auth SDK'sı gerekmez.

```ts
// src/lib/starbase.ts — tek instance
import { Starbase } from "@starbase/sdk";

export const starbase = new Starbase({
  baseUrl: import.meta.env.VITE_STARBASE_URL ?? "https://starbase.ayberkarslann0.workers.dev",
  clientId: "hedef-uygulama-web",
  redirectUri: `${location.origin}/callback`,
  storage: sessionStorage,
});
```

```tsx
import { StarbaseAuthProvider, useStarbaseAuth } from "@starbase/sdk/react";

<StarbaseAuthProvider client={starbase} scopes={["profile"]}>
  <App />
</StarbaseAuthProvider>;

// App içinde:
const { snapshot, login, logout, client } = useStarbaseAuth();
if (snapshot.status === "checking") return <Loading />;
if (snapshot.status === "anonymous") return <button onClick={() => void login()}>STARBASE ile giriş</button>;
const profile = snapshot.profile; // id, username, istenen kapsama göre isim vb.
const accessToken = await client.getAccessToken();
// Kendi kaynak API'ne Authorization: Bearer <accessToken> gönder.
```

Örnekteki `await` normal bir async fonksiyonun içindedir. Callback'i ayrı React route olarak tanımlamak şart değil; provider açılış URL'sinde `code`/`error` görürse işler. Router veya auth guard callback sırasında yönlendirme yapmamalı. `StarbaseSession` React dışı lifecycle için var. Hatalarda `StarbaseError.code/status` kullan; 401/oturum iptalinde korunan veriyi kapat. SDK varsayılan olarak süresi biten oturumda STARBASE girişine yönlendirir (`sessionExpiryMode: "stay"` ile yerinde kalabilir).

`sessionStorage` sekme bazlı; kalıcı oturum istenirse `localStorage` seçilebilir ama hesap değiştirme ve farklı sekme senkronizasyonu ayrıca ele alınmalı. Sunucu tarafı kaynak API her istekte tokenı STARBASE'e doğrulatmalı; frontend'deki `hasPermission()` güvenlik denetimi değildir. İzinli kaynak için `requireStarbasePermission(baseUrl, token, "hedef-uygulama-web.some.permission")` kullanılabilir; izin anahtarı uygulama kimliğiyle başlamalıdır. Yetki yoksa fail closed davran.

## 4. YRT Test Takvimi'nde fiilen yapılanlar

Kaynak depo: `~/Projects/TestFormu/Test-Formu`; ayrıntılı yerel belge: `docs/starbase-integration.md`. Canlı Takvim `https://yrt-test-takvimi.web.app`, STARBASE kaydı `test-formu-web`, callback `${location.origin}/callback`, kapsamlar `profile` + `organization`. STARBASE uygulama açma adresi `https://yrt-test-takvimi.web.app/?starbase=1`.

**Tarayıcı katmanı:**

- `src/lib/starbase.ts`: tek SDK istemcisi; `clientId`, callback, baz URL ve `localStorage` kurulumu. `?starbase=1` ile STARBASE vitrinden gelindiyse eski `starbase.test-formu-web` refresh tokenını temizler; böylece eski Takvim hesabı merkezdeki yeni hesap yerine geri gelmez.
- `src/main.tsx`: uygulamayı `StarbaseAuthProvider` ile sarar.
- `src/App.tsx`: `useStarbaseAuth()` snapshot'ını okur. Merkezden açılma işaretinde yeni authorization URL üretir. Hesap değişimi için storage olayını izler; eski Firebase oturumunu kapatıp güncel hesapla yeniden bağlanma ister. Eski sekme veya refresh token ile farklı kullanıcının verilerini göstermemeye çalışır.
- Aynı dosya STARBASE profilinden ad/kullanıcı adı alır, profil bağlantısını STARBASE `/account` ekranına verir ve çıkışta önce Takvim oturumunu, sonra SDK oturumunu sonlandırır. Profil fotoğrafı `photoUrl` üzerinden Bearer tokenla alınır; `me/live` WebSocket invalidasyonu, görünürlük ve fallback kontrolü ile yenilenir. Bu canlı fotoğraf senkronizasyonu yeni uygulama için opsiyonel.

**Takvim'in mevcut Firebase/Firestore altyapısı nedeniyle eklenen köprü (her uygulamaya kopyalanmaz):**

- `src/lib/api.ts`: `connectStarbaseSession` STARBASE access tokenını Firebase Callable Function'a gönderir. Mevcut Firebase oturumunun `starbaseUserId` kimliği farklıysa önce kapatır; aynıysa yeniler. `renewStarbaseSession`, `resumeSession`, `closeSession` yardımcıları burada.
- `functions/src/index.ts`: `verifiedStarbaseIdentity()` tokenı STARBASE `/api/v1/me` ve `/api/v1/organization` uçlarında sunucudan doğrular; `applicationId === "test-formu-web"` ve takım üyeliği zorunlu. `openStarbaseSession` bu doğrulamadan sonra 1 saatlik `sessions/{uid}` Firestore belgesi (`starbaseUserId` dahil) ve Firebase custom token üretir. `renewStarbaseSession` aynı kimlikle geçerliliği yeniler. Tarayıcı 10 dakikada bir yenileme yapar; başarısızsa Takvim oturumunu kapatır.
- `firestore.rules` ve Callable Function `requireSession` kontrolleri `starbaseUserId` içermeyen eski ortak parola oturumlarını reddeder. Eski `openSession` ucu yeni oturum açmaz. Önemli ders: yalnız login ekranını değiştirmek Firestore verisini korumaz; bütün veri yolları yeni kimliği doğrulamalı.
- Yeni testlerde `createdByStarbaseUserId` saklanır. `syncTestToStarbase` Firestore tetikleyicisi kimlik/başlık/tarih/durum özetini STARBASE `POST /api/v1/internal/test-formu-resources` ucuna yollar; silmede özeti kaldırır. `syncMyTestsToStarbase` mevcut kullanıcının son 100 testini tekrar eşitler. `TEST_FORMU_SYNC_SECRET` Worker secret'ı ile Firebase `STARBASE_SYNC_SECRET` aynı gizli değerdir; kodda bulunmaz. Tam test verisi Firebase'de kalır. STARBASE `/api/v1/apps/test-formu-web/overview` kişiye özel sayı/özetleri gösterir. Bu uç **Takvim'e özel** yazılmıştır; yeni uygulama istatistikleri için ayrı model ve güvenli senkronizasyon tasarla. Eski testleri isimden tahmin ederek hesaba atama.

## 5. Yeni projeyi entegre ederken uygulanacak sıra

1. Hedef repo, frontend/router, backend, veri deposu ve mevcut auth korumalarını incele. STARBASE'in standart SDK akışı mı, Takvim'deki gibi ikinci veri deposu köprüsü mü gerekli karar ver. Mevcut veriyi silme veya kullanıcıları isimle eşleme.
2. Bu dizinde STARBASE uygulama kaydını oluştur: yeni `clientId`, tüm gerçek lokal/canlı callback URL'leri, originler, en az gerekli kapsamlar; güvenli `launchUrl` ve isteğe bağlı logo. Kayıt `POST /api/v1/admin/apps` veya yönetim arayüzüyle yapılır; `apps.manage` gerekir. Bir origin/callback eksikse CORS veya `invalid_authorization` alınır. Uygulama adı yönetimden değiştirilebilir; `clientId` sabit kalır.
3. SDK'yı bağla, tek istemci oluştur, provider veya framework bağımsız session'ı kullan. Login/signup STARBASE'e gider. Merkezi oturum ile uygulama refresh tokenını karıştırma. Uygulama açma adresini kaydetmek otomatik SSO değildir; uygulamanın merkezden açılışı güvenli işlemesi gerekir. Takvim'deki `?starbase=1` yaklaşımı mevcut kalıcı oturumlu uygulamalar için örnektir.
4. Hedefin **her korunan API/veri erişiminde** STARBASE Bearer tokenını ve `applicationId` değerini sunucuda doğrula; gereken takım üyeliği/uygulama iznini orada denetle. Eski auth yollarını atlatma, eski oturumları değerlendirme. STARBASE kullanıcısının sabit `id` alanını sahiplik anahtarı olarak sakla.
5. Profil, logout, hesap değişimi, oturum süresi bitimi ve ağ hatası davranışlarını tamamla. Pencere kapanışından çıkış saati üretme. Korunan veri ve önbelleği kullanıcı değişince temizle. Görsel gerekiyorsa sürümlü `photoUrl`'yi tokenla oku; giriş tokenını CSS/image URL query'sine ekleme.
6. Yerel ve canlı aynı origin/callback kaydını kullanarak akışı test et: ilk login/signup, önceden açık STARBASE oturumu, kapsam onayı, refresh, ikinci kullanıcıya geçiş, logout, takım dışı kullanıcı, kapalı uygulama, token iptali, ağ hatası. `npm run typecheck`, ilgili testler ve build. Takvim'e özel Firebase emulator testleri yeni projeye ancak Firebase kullanıyorsa uygulanır.
7. Hedef repo ve bu repo değişikliklerini küçük, net, tamamen **küçük harfli İngilizce** commit mesajlarıyla ayrı ayrı commit et. Kullanıcı açıkça istemedikçe push/deploy yapma; ilgisiz yerel dosyaları koru. Üretim secret'larını yalnız ilgili servis secret yöneticisine koy.

## 6. Sınırlar ve dikkat noktaları

- STARBASE opaque token kullanır; JWT gibi yerelde doğrulama yapma. Kaynak sunucudan STARBASE API'sine doğrulama çağrısı gerekir. `/api/v1/me` profili kapsamlarla daralır; uygulama tokenı merkezi yönetim/takım dizini endpointlerine erişemez.
- İzinler uygulama bazlı ve sunucuda güncel olarak kontrol edilir. `owner`, `apps.manage`, `users.manage` gibi merkezi yönetici izinleri bağlı uygulamaya kendiliğinden geçmez.
- Uygulama ziyaret kaydı başarılı kod değişiminde oluşur; refresh'te yeni ziyaret sayılmaz. IP Cloudflare bağlantı IP'sidir, cihaz etiketi User-Agent'ten tahmindir; VPN, proxy veya değiştirilmiş User-Agent gerçek cihazı gizleyebilir. Önceki oturumlara IP eklenemez.
- STARBASE Worker ve D1 ücretsiz planda çalışır, servis hatasında korunan kaynağı açık bırakma. Firebase Auth yalnız STARBASE hesabının şifre/e-posta sağlayıcısıdır; Takvim'in Firebase Functions/Firestore kurulumu kendi ürününün ayrı altyapısıdır.
- Tasarım değişikliği gerekiyorsa önce `packages/ui` kaynak/katalog ve B4 referansını incele; mevcut siyah, beyaz, Michroma, ince çizgi dilini kullan. Orijinal B4 dizinini değiştirme.
