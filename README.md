# STARBASE

Yıldız Roket Takımı için merkezi hesap, profil paylaşımı ve yetkilendirme servisi. Firebase Auth + Cloudflare Workers/D1; React/Vite arayüzü ve projeye sabitlenmiş stardrop-ui 0.3.0.

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

Kayıt ol; emülatör konsolundaki doğrulama bağlantısıyla e-postayı doğrula ve giriş yap. Sonra ilk takım sahibini ata:

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

Tarayıcı testleri için `npx playwright install chromium` çalıştır. Test adresi `STARBASE_TEST_URL` ile değiştirilebilir.

## Belgeler

- [Mimari ve güvenlik](docs/architecture.md)
- [API ve entegrasyon](docs/integration.md)
- [Ücretsiz üretim kurulumu](docs/deployment.md)
- [Teslim ve doğrulama durumu](docs/status.md)

Geliştirici ekranı `/docs`, OpenAPI `/api/openapi.json`. STARBASE protokolü kendi SDK'sıyla kullanılır; genel OAuth/OIDC sağlayıcısı değildir. Online durum ve kullanım süresi takibi içermez.
