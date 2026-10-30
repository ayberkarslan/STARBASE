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

Hesap merkezini yenile. Otomatik yönetici, varsayılan şifre veya üretim arka kapısı yoktur. Emulator kullanıcıları kalıcı değildir; yeniden başlatınca Firebase hesaplarını yeniden oluşturman veya emulator import/export kullanman gerekir. D1 verisi `.wrangler` içinde kalır.

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
- [Ücretsiz üretim kurulumu](docs/deployment.md)
- [Teslim ve doğrulama durumu](docs/status.md)

Geliştirici ekranı `/docs`, OpenAPI `/api/openapi.json`. STARBASE protokolü kendi SDK'sıyla kullanılır; genel OAuth/OIDC sağlayıcısı değildir. Uygulama giriş/çıkış tarihleri auth akışında otomatik tutulur; online durum ve kullanım süresi ölçülmez. Pano yalnız takım üyelerine açıktır. SDK arşivi geliştirici ekranından indirilebilir; `npm run pack:sdk` ile ayrıca üretilir.
