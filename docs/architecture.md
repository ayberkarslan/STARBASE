# Mimari

Kimlik doğrulama Firebase adaptöründe; kullanıcı adları, profiller, organizasyon, uygulamalar, izinler ve oturumlar D1'de tutulur. API modülleri `auth`, `identity`, `organization`, `applications`, `management` olarak ayrılır. Arayüz ve SDK kendi paketlerindedir. Başka bir kimlik sağlayıcıya geçişte adaptör ve kalıcı kullanıcı eşleştirmesi değiştirilir; uygulama sözleşmesi korunabilir.

## Oturum sınırları

Uygulama şifre toplamaz. Merkezi hesap ekranına yönlendirir; girişten sonra kullanıcı istenen alanları onaylar. 60 saniyelik tek kullanımlık kod, uygulama kimliği, tam dönüş adresi ve SHA-256 PKCE challenge'a bağlıdır. Tokenlar URL'ye yazılmaz. D1'e yalnız kod/token özetleri yazılır.

Erişim tokenı 10 dakika, merkezi oturum ve yenileme ailesi en fazla 7 gün geçerlidir. Her yenilemede refresh token değişir; eski tokenın tekrar kullanımı tüm aileyi kapatır. SDK eşzamanlı yenilemeleri tek istekte birleştirir. Merkezi cookie HttpOnly, üretimde Secure, SameSite=Lax'tir. Cookie ile değişiklik yapan isteklerde Origin kontrolü zorunludur. API'ye yazma gövdeleri 16 KiB ile sınırlıdır.

Her korunan istek D1 oturumunu ve hesap durumunu kontrol eder; uygulama oturumlarında uygulama ve güncel paylaşım izni de kontrol edilir. Hassas yetkiler token içine kopyalanmaz; kaynak sunucu `/permissions` çağrısıyla kontrol eder. Bir uygulamaya yalnız kendi kimliğiyle başlayan izin anahtarları verilir. Yönetim API'si merkezi oturum gerektirir.

Şifre yönetimi sunucudan Firebase'e iletilir; uygulama veritabanında şifre/hash tutulmaz. Geçici şifre atama önce oturumları kapatıp hesabı zorunlu şifre değiştirme durumuna geçirir. Kullanıcı kendi şifresini belirleyene kadar profil ve uygulama API'si erişime kapanır. Kurtarma adresi değişirse doğrulama durumu kaldırılır. Admin işlemleri mevcut yönetici şifresiyle yeniden doğrulanır. Şifreler denetim kayıtlarında bulunmaz.

## Profil ve organizasyon

Sabit kullanıcı kimliği, isim, soyisim, e-posta ve kullanıcı adı ayrı alanlardır. Departmanlar ekipleri içerir; kullanıcıların birden çok ekip üyeliği olabilir. Takım davetleri doğrulanmış hesap e-postasına bağlıdır. Organizasyon dizini yalnız üyeler ve takım sahibine açıktır. Roller ekip üyeliğinden bağımsızdır.

Ek profil alanları `profile_fields` kayıtlarında tipli tanımlanır; değerleri ayrı tabloda tutulur. Bu sürümde özel alanlar yönetim verisidir; uygulamalara kendiliğinden paylaşılmaz. Yeni paylaşılabilir alan eklerken API scope kataloğu, profil projeksiyonu, onay ekranı ve sözleşme birlikte genişletilmelidir.

## Operasyon sınırları

İlk takım sahibi yalnız yerel kurulum komutuyla atanır. Sahip hesabı panelden kapatılamaz. Uygulama tokenları kaynak API'lerince introspection ile doğrulanmalıdır; offline JWT doğrulaması yoktur. Rate limit IP başına dakikada 15 auth işlemi düzeyindedir. Üretimde kayıt/kurtarma Turnstile olmadan kapalıdır.

Firebase ve D1 arasında dağıtık transaction yoktur. Kayıt önce kullanıcı adı rezervasyonu yapar; Firebase reddinde rezervasyon geri alınır. Ağ zaman aşımı veya Firebase başarılı/D1 başarısız senaryosunda iki sistemi yönetici kontrol ederek uzlaştırmalıdır. E-posta gönderim hatası hesabı silmez; yeniden doğrulama e-postası istenebilir. Kullanıcı güncellemesinde upstream hata olursa oturumlar kapalı kalır; değişiklik yeniden denenebilir.

Bu sürüm MFA içermez. Firebase konsolundan yapılan dış değişikliklerin STARBASE oturumlarına etkisi kurulum notlarında açıklanır. Denetim kayıtlarında kişisel veri bulunduğundan erişim yönetimle sınırlıdır.

## Takım dizini ve uygulama erişim kayıtları

Pano/dizin merkezi oturum ve takım üyeliği gerektirir; yönetici izni gerekmez. Normal kayıt olup takıma girmemiş hesaplar dizini okuyamaz. Arama ve ekip filtreleri sayfalanır; profil yanıtında e-posta, özel alanlar ve yetkiler bulunmaz. Uygulama tokenlarına dizin açılmaz.

Kod değişimi bir `application_visits` satırı oluşturur; refresh yeni ziyaret üretmez. Ziyaret trigger'ları `application_usage` özetini günceller. Auth logout ziyaretin gerçek çıkışını atomik olarak işaretleyip aileyi iptal eder. Oturum ailesinin diğer iptal yolları veritabanı trigger'ıyla `revoked` kaydı üretir. Süre dolumları `expired` olarak okunur ve günlük cron ile kalıcılaştırılır. Hiçbiri gerçek son çıkışı uydurmaz. Böylece şifre değişimi, bağlantı kaldırma, replay ve yönetim işlemlerinde ayrı takip kodu unutulmaz.

Ayrıntılar 90 gün sonra temizlenir; son giriş/çıkış özetleri korunur. Önceki oturumlar geriye dönük tahmin edilmez. Pencere kapanma olayı veya heartbeat kullanılmaz; online durumu ve çalışma süresi ölçülmez. Ücretsiz katmandaki ilave yazımlar yalnız auth olaylarında ve günlük temizlikte gerçekleşir; profil gezintisi okuma yapar.
