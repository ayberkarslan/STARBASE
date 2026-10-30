# Ücretsiz üretim kurulumu

Firebase Auth Spark ve Cloudflare Workers/D1 Free kullanılır. Cloud Functions, Firestore, ücretli e-posta sağlayıcısı ve SMS kullanılmaz. Cloud Functions dağıtımı Blaze gerektirdiğinden API Cloudflare'dedir: https://firebase.google.com/docs/functions/get-started

1. Firebase projesinde email/password sağlayıcısını aç, e-posta enumeration protection ve şifre politikasını etkinleştir. Firebase proje kimliği ve Web API key'i al.
2. Sunucu kullanıcı yönetimi için yalnız gerekli Firebase Authentication yetkilerine sahip servis hesabı oluştur. Private key'i depoya veya Vite environment'ına koyma.
3. `npx wrangler d1 create starbase` çalıştır. Dönen database_id değerini `apps/api/wrangler.toml` içine yaz. PUBLIC_ORIGIN'i gerçek `https://...workers.dev` adresiyle ayarla. FIREBASE_PROJECT_ID ve FIREBASE_API_KEY'i güncelle.
4. Worker secret'larını `apps/api` dizininde `npx wrangler secret put FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `TURNSTILE_SECRET` ile yükle. Turnstile site key'ini `TURNSTILE_SITE_KEY` var'ına ekle. Emulator host'u üretime eklenmez.
5. Firebase Authorized Domains ve e-posta action URL ayarlarını yapılandır. Action URL `https://YOUR-STARBASE.workers.dev/action` olmalı. `/action` ekranı Firebase `mode` ve `oobCode` parametrelerini işler. Emülatörde gerçek mail gönderilmez.
6. `npm run build`; `apps/api` içinde `npx wrangler d1 migrations apply starbase --remote`, ardından `npx wrangler deploy` çalıştır.
7. İlk hesabı oluştur, doğrula, giriş yap. Repo kökünde `node scripts/owner.mjs kullaniciadi --remote` çalıştır. Sahip hesabınla giriş yapıp diğer kullanıcıları davet et.

## Kotalar ve bakım

Workers Free günlük 100.000 istek, D1 günlük 100.000 satır yazımı ve 5 milyon satır okuması sınırlarına sahiptir. Firebase Spark doğrulama/kurtarma e-postaları da kotaya tabidir. Güncel resmi sınırlar: https://developers.cloudflare.com/workers/platform/pricing/ ve https://firebase.google.com/docs/auth/limits

Ücretli plana otomatik geçilmez. Kota biterse servis erişimi kısıtlanabilir. Çalışan kullanıcı sınırı kodlanmamıştır; 20 eşzamanlı kullanıcı temel hedeftir. Testte 50 eşzamanlı profil isteği doğrulanır; bu ücretsiz plan için sınırsız kapasite/SLA garantisi değildir.

Oturum, kod ve rate limit tablolarının eski satırlarını günlük temizle; cron handler bu amaçla eklenmiştir. Yeni pano/geçmiş için 0004 migration da uygulanmalıdır. Cron uygulama ziyaretlerini süre dolduğunda kapatır ve 90 günden eski ayrıntıları siler; son giriş/çıkış özetlerini korur. SDK indirme dosyası root `npm run build` ile otomatik üretilir. Denetim kayıtları 90 gün tutulur. D1 export ile düzenli yedek al; Firebase hesapları ayrı bir kimlik deposudur. Restore işlemini boş bir deneme ortamında doğrula. Worker canlılık: `/api/v1/health`.

Şifre, hesap kapatma ve e-posta yönetimini STARBASE panelinden yürüt. Firebase konsolundan değişiklik yapılırsa STARBASE oturumlarını da iptal et; kısa ömürlü uygulama erişim tokenları ve merkezi oturumlar kendi oturum deposuna bağlıdır. Mevcut sürüm dış Firebase değişiklikleri için event listener sağlamaz.

Canlı dağıtım bu depoda otomatik yapılmaz; gerçek Firebase/Cloudflare hesap ayarları ve secret'lar kurulumda sağlanır. Canlı mail teslimi, sağlayıcı kotası ve Cloudflare CPU bütçesi hedef hesapta smoke test ile doğrulanmalıdır.

## Canlı ortak notlar

0005 D1 migration ve `BOARD_HUB` Durable Object binding/sınıf migration'ı yapılandırmada hazırdır. Workers Free ile uyumlu SQLite-backed sınıf kullanılır. Yayında WebSocket yükseltmesi ve tam `PUBLIC_ORIGIN` kontrolü ayrıca doğrulanmalıdır. Ayrıntılar [ortak pano belgesinde](board-notes.md).
