# Teslim durumu

## Hazır

- Firebase Auth adaptörü, Cloudflare Worker API, D1 migration'ları ve günlük temizlik.
- Kullanıcı adı/şifre girişi, kayıt, doğrulama, kurtarma, yeniden doğrulama e-postası, şifre değişimi.
- Merkezi oturum, PKCE ile tek kullanımlık uygulama kodu, dönen refresh tokenları ve iptal edilebilir oturum aileleri.
- Kapsamla sınırlı profil paylaşımı ve kaynak sunucu için uygulama/izin kontrol yardımcısı.
- Departman/ekip oluşturma ve arşivleme API'si, çoklu ekip üyeliği, davetler, dinamik roller ve izinler.
- Kullanıcı yönetimi, mevcut şifreyi göstermeden geçici şifre belirleme, zorunlu şifre değişimi, e-posta güncelleme ve hesap kapatma.
- Özel profil alanı tanımı ve tipli değerler; özel alanlar bu sürümde yönetimle sınırlı.
- stardrop-ui tabanlı giriş/kayıt, hesap, yönetim ve geliştirici ekranları; OpenAPI çıktısı.
- TypeScript/React SDK, Vite örneği ve derlenebilir Rust native istemcisi; mevcut Tauri uygulamasına komut köprüsü örneği.

## Doğrulananlar

19 API/SDK testi: kod tekrar kullanımı, PKCE, kapsam filtresi, yenileme tekrar kullanımı, oturum iptali, admin sınırı, hesap durumu, CSRF ve 50 paralel profil okuması dahil. Test deposu SQLite üzerinde D1 arayüzünü uygular; bu sonuç üretim yük/SLA testi değildir.

Playwright masaüstü/mobil ekran kontrolleri ve gerçek yerel Firebase Auth Emulator + Wrangler/D1 üzerinde kayıt/doğrulama/giriş/yönetim/şifre sıfırlama akışı. Emülatör API smoke testi. TypeScript kontrolü, Vite üretim derlemesi ve Rust `cargo check --locked`.

Üretim bağımlılık taraması temizdir. Firebase CLI geliştirme bağımlılıklarında upstream OpenTelemetry/uuid kaynaklı orta seviye npm audit kayıtları vardır; üretim Worker paketine dahil değildir. CLI'yi rastgele major override ile değiştirmedik.

## Gerçek hesap bilgileriyle tamamlanacaklar

Firebase proje/servis hesabı ve Cloudflare D1/Worker secret'ları; canlı yayın, gerçek e-posta teslimi, Turnstile hostname, ücretsiz kota/CPU bütçesi ve yedekten dönme denemesi. Ücretsiz servislerin süreklilik garantisi yoktur.

Tauri native istemcisi derlendi; gerçek GUI üzerinde sistem tarayıcısı + işletim sistemi keyring dönüşü henüz denenmedi. Komut köprüsü mevcut Tauri projesinin builder/plugin ayarlarıyla birleştirilecek; bağımsız tam Tauri masaüstü paketi bu depoda yoktur. B4 dosyaları değiştirilmedi.

Online/aktivite takibi, Google/GitHub sağlayıcıları, MFA, tam OAuth/OIDC uyumluluğu ve SDK'nın npm yayını bu sürüme dahil değildir. Özel profil alanlarının uygulama kapsamlarına açılması kontrollü bir sonraki sözleşme genişletmesidir.
