# STARBASE

Yıldız Roket Takımı için merkezi hesap, takım panosu, üye/ekip dizini, profil paylaşımı ve yetkilendirme servisi. Firebase Auth + Cloudflare Workers/D1; React/Vite arayüzü ve projeye sabitlenmiş stardrop-ui 0.3.0.

## Yerelde çalıştırma

Node 22.12+ (Node 24 LTS önerilir), npm ve Rust yalnız native örnek için gereklidir.

```sh
npm ci
cp apps/api/.dev.vars.example apps/api/.dev.vars
npm run db:migrate
npm run build
```

Üç terminalde:

```sh
npm run emulators
npm run dev:api
npm run dev
```

Arayüz: http://127.0.0.1:5173; API: http://127.0.0.1:8787; Firebase Emulator UI: http://127.0.0.1:4000. Vite başka port seçerse `.dev.vars` içindeki PUBLIC_ORIGIN değerini o adresle eşleştir. `localhost` ile `127.0.0.1` adreslerini karıştırma.

Kayıt ol; yalnız yerel emülatörde gösterilen **Yerel doğrulama ekranını aç** düğmesiyle e-postanı doğrula ve giriş yap. Mevcut doğrulanmamış hesapta giriş denemesinden sonra **Doğrulama e-postasını yeniden gönder** ile aynı yerel bağlantıyı alabilirsin. Gerçek ortamda doğrulama bağlantısı yalnız e-postayla iletilir. Sonra ilk takım sahibini ata:

```sh
node scripts/owner.mjs kullaniciadi
```

Hesap merkezini yenile. Otomatik yönetici, varsayılan şifre veya üretim arka kapısı yoktur. `npm run emulators` hesapları `.firebase-data/` klasöründen geri yükler ve Ctrl+C ile düzgün kapatıldığında tekrar kaydeder. Dışa aktarma tamamlanana kadar terminali kapatma. Kullanıcı kimliği aynı kaldığı için D1’deki admin yetkisi ve notlarla bağlantısı da korunur. D1 verisi `.wrangler` içinde kalır; iki klasörü de silme.

Emülatör çalışırken ayrı bir terminalden `npm run emulators:save` ile anında kayıt alabilirsin. Elektrik kesintisi veya zorla sonlandırma, son kayıttan sonraki değişiklikleri kaybettirebilir. `.firebase-data/` hassas hesap verileri içerir ve Git’e dahil edilmez. Daha önce kaybolmuş Firebase hesapları bu ayarla geri gelmez. Eski komutla açık olan emülatörde önce `npm run emulators:save` çalıştır; ardından Ctrl+C ile kapatıp yeni `npm run emulators` komutuyla başlat.

## Doğrulama

```sh
npm run typecheck
npm test
npm run build
npm run openapi
npm run test:ui
cargo check --locked --manifest-path examples/tauri/native/Cargo.toml
```

Tarayıcı testleri için `npx playwright install chromium` çalıştır. Test adresi `STARBASE_TEST_URL` ile değiştirilebilir. Gerçek yerel Firebase/D1 entegrasyon senaryosu için üç servis açıkken `STARBASE_LIVE_TEST=1 npm run test:ui` çalıştır; bu test iki Vite örneğini boş portlarda başlatır ve kendi test hesaplarını temizler. Testi üretim verisine karşı çalıştırma.

## Belgeler

- [Mimari ve güvenlik](docs/architecture.md)
- [API ve entegrasyon](docs/integration.md)
- [Özel ve ortak serbest pano](docs/board-notes.md)
- [Ücretsiz üretim kurulumu](docs/deployment.md)
- [Teslim ve doğrulama durumu](docs/status.md)

Geliştirici ekranı `/docs`, OpenAPI `/api/openapi.json`. STARBASE protokolü kendi SDK'sıyla kullanılır; genel OAuth/OIDC sağlayıcısı değildir. Uygulama giriş/çıkış tarihleri auth akışında otomatik tutulur; online durum ve kullanım süresi ölçülmez. Özel pano yalnız sahibine, ortak pano takım üyelerine açıktır. SDK arşivi geliştirici ekranından indirilebilir; `npm run pack:sdk` ile ayrıca üretilir.
