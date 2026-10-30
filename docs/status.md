# Teslim durumu

## Hazır

- Firebase Auth adaptörü, Cloudflare Worker API, D1 migration'ları ve günlük temizlik.
- Kullanıcı adı/şifre girişi, kayıt, doğrulama, kurtarma, yeniden doğrulama e-postası, şifre değişimi.
- Merkezi oturum, PKCE ile tek kullanımlık uygulama kodu, dönen refresh tokenları ve iptal edilebilir oturum aileleri.
- Kapsamla sınırlı profil paylaşımı ve kaynak sunucu için uygulama/izin kontrol yardımcısı.
- Departman/ekip oluşturma ve arşivleme API'si, çoklu ekip üyeliği, davetler, dinamik roller ve izinler.
- Yönetim panelinden doğrudan üye hesabı ve isteğe bağlı ekip ataması oluşturma.
- Kullanıcı yönetimi, mevcut şifreyi göstermeden geçici şifre belirleme, zorunlu şifre değişimi, e-posta güncelleme ve hesap kapatma.
- Özel profil alanı tanımı ve tipli değerler; özel alanlar bu sürümde yönetimle sınırlı.
- stardrop-ui tabanlı giriş/kayıt, hesap, yönetim ve geliştirici ekranları; OpenAPI çıktısı.
- Ortak canlı not panosu: not/duyuru, ekip etiketi, son tarih, moderatör sabitlemesi, arşiv, düzenleme/silme ve sürüm çakışması kontrolü.
- İlk açılan Pano: Türkçe üye araması, departman/ekip filtreleri, ekipten üyeye gezinti ve özel alanları içermeyen takım profilleri.
- Auth akışında otomatik uygulama giriş/çıkış geçmişi; süre dolumu ve iptal, gerçek çıkıştan ayrı tutulur.
- İndirilebilir, bağımsız SDK arşivi ve kopyalanabilir örneklerle beş bölümlü geliştirici ekranı.
- TypeScript/React SDK (ayrı contracts paketi gerektirmeyen derlenmiş arşiv), Vite örneği ve derlenebilir Rust native istemcisi; mevcut Tauri uygulamasına komut köprüsü örneği.

## Doğrulananlar

54 API/SDK ve canlı pano testi: kod tekrar kullanımı, PKCE, kapsam filtresi, yenileme tekrar kullanımı, oturum iptali, admin sınırı, hesap durumu, CSRF ve 50 paralel profil okuması dahil. Test deposu SQLite üzerinde D1 arayüzünü uygular; bu sonuç üretim yük/SLA testi değildir.

Playwright masaüstü/mobil ekran kontrolleri ve gerçek yerel Firebase Auth Emulator + Wrangler/D1 üzerinde kayıt/doğrulama/giriş/yönetim/şifre sıfırlama akışı. İki farklı origin’de çalışan gerçek Vite uygulamasında merkezi oturum, ilk bağlantı izni, sonraki bağlantıda otomatik devam, CORS ve kapsamla sınırlı profil paylaşımı doğrulandı. Emülatör API smoke testi. TypeScript kontrolü, Vite üretim derlemesi ve Rust `cargo check --locked`.

Üretim bağımlılık taraması temizdir. Firebase CLI geliştirme bağımlılıklarında upstream OpenTelemetry/uuid kaynaklı orta seviye npm audit kayıtları vardır; üretim Worker paketine dahil değildir. CLI'yi rastgele major override ile değiştirmedik.

Native örnekte sunucuya bildiren logout metodu derlendi. SDK arşivi depodan bağımsız JavaScript ve TypeScript tüketiciyle doğrulanır. Ayrıntılı uygulama kayıtları 90 gün; uygulama başına son giriş/çıkış özetleri hesap veya uygulama silinene kadar saklanır.

## Gerçek hesap bilgileriyle tamamlanacaklar

Firebase proje/servis hesabı ve Cloudflare D1/Worker secret'ları; canlı yayın, gerçek e-posta teslimi, Turnstile hostname, ücretsiz kota/CPU bütçesi ve yedekten dönme denemesi. Ücretsiz servislerin süreklilik garantisi yoktur. Canlı notlar için SQLite-backed Durable Object binding/migration hazırdır; yerel iki ayrı hesapla gerçek WebSocket yayını doğrulandı.

Tauri native istemcisi derlendi; gerçek GUI üzerinde sistem tarayıcısı + işletim sistemi keyring dönüşü henüz denenmedi. Komut köprüsü mevcut Tauri projesinin builder/plugin ayarlarıyla birleştirilecek; bağımsız tam Tauri masaüstü paketi bu depoda yoktur. B4 dosyaları değiştirilmedi.

Online durum/çalışma süresi takibi, Google/GitHub sağlayıcıları, MFA, tam OAuth/OIDC uyumluluğu ve SDK'nın npm yayını bu sürüme dahil değildir. Özel profil alanlarının uygulama kapsamlarına açılması kontrollü bir sonraki sözleşme genişletmesidir.
