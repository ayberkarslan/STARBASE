# STARBASE Dosya Paylaşımı

Bu özellik yalnız merkezî STARBASE oturumu ve aktif takım rolü veya departman üyeliği olan hesaplar içindir. Dosya baytları STARBASE API'sine, D1'e veya Durable Object'e gönderilmez. API yalnız oda bilgisi, davetler, canlı katılımcılar ve WebRTC bağlantı sinyalleri taşır.

## Oda API'si

| İşlem | Amaç |
| --- | --- |
| `GET /api/v1/share/rooms` | Takım odalarını ve katılımcı sayılarını listele. |
| `POST /api/v1/share/rooms` | `{name, protected, profileTargetId?}` ile oda aç. Şifreli odanın üretilen şifresi yalnız bu yanıtta döner. |
| `POST /api/v1/share/rooms/:id/join` | Açık oda için `{}`, şifreli oda için `{password}` gönder. Sahip ve davetliler şifre girmez. |
| `GET /api/v1/share/rooms/:id/live` | Katıldıktan sonra aynı kökenli WebSocket bağlantısı aç. |
| `PATCH /api/v1/share/rooms/:id` | Sahip oda adını, şifresini ve yeni giriş kilidini değiştirir. |
| `POST /api/v1/share/rooms/:id/invites` | Sahip `{userId}` ile takım üyesini davet eder. |
| `POST /api/v1/share/rooms/:id/kick` | Sahip `{userId}` ile üyeyi çıkarır ve bu oda için yeniden girişini engeller. |
| `DELETE /api/v1/share/rooms/:id/bans/:userId` | Sahip çıkarma engelini kaldırır. |
| `DELETE /api/v1/share/rooms/:id` | Sahip odayı kapatır. |

Oda listesi, davetler, şifre özeti ve kısa süreli katılım izni D1'de tutulur. Oda kapanınca veya son katılımcı ayrılıp yeniden bağlanma süresi dolunca ilgili satırlar silinir. Şifreler ham hâliyle saklanmaz. Profil üzerinden açılan oda listede görünür, şifrelidir ve profil sahibi otomatik davetlidir. Oda sahibi dışında yalnız davetli üyeler kilitliyken katılabilir.

## Canlı bağlantı ve aktarım

`/live` bağlantısı ilk olarak `{type:"welcome",connectionId}` ve sonra `{type:"members",members}` ile cevap verir. İstemci `{type:"signal",to,signal}` gönderir; sunucu yalnız aynı odadaki hedefe `{type:"signal",from,signal}` iletir. `signal.type` yalnız `offer`, `answer` veya `candidate` olabilir. WebSocket'e dosya baytı gönderilirse bağlantı kapatılır. Oda listesi değiştiğinde mevcut `/api/v1/directory/live` kanalı `share.rooms.changed` geçersizleştirme olayı gönderir; istemci listeyi API'den yeniden okur.

Tarayıcılar `@starbase/file-transfer` içindeki `TransferLink` ile WebRTC veri kanalı kurar. Dosya teklifi alıcı tarafından kabul edilir; ardından 16 KiB parçalar onay ve geri basınçla akar. Uygulama boyut sınırı koymaz. Desteklenen tarayıcıda alıcı doğrudan diske yazar; diğerlerinde dosya indirilene kadar tarayıcı belleğinde tutulur. Yalnız ücretsiz STUN kullanılır; kısıtlı ağlarda eşler arası bağlantı kurulamayabilir. TURN ve sunucudan dosya aktarma yedeği bulunmaz.

Oda ekranındaki serbest alana dosya bırakılabilir. Dosya ve kişi düğümleri işaretçiyle taşınır; dosya bir kişinin üstüne bırakılınca gönderim teklifi açılır. Bağlantı henüz hazır değilse teklif sıraya alınır. Dosya sonra başlangıç yerine döner ve bağlantı, alıcı onayı, aktarım yüzdesi ile sonuç alanda görünür. Dosyaya dokunmak önizleme ve tek kişiye veya herkese gönderme seçeneklerini açar. `Toplu alan` kare biçimindedir; köşesinden boyutlandırılabilir. İçine taşınan bağlı kişilere dosya bırakılınca ayrı ayrı teklif gönderilir. Düğümlerin konumu yalnız açık tarayıcı oturumunun görsel düzenidir; oda üyeliği veya dosya aktarımına yetki vermez.

`stax-file` reposunun `starbase-transfer` dalındaki `transfer/` kaynağı `git subtree` ile `packages/file-transfer` içine alınır. Eski sitenin otomatik yayınını tetiklememek için kaynak paket `main` dalına gönderilmez. Yeni sürüm almak için önce kaynak dalda commit yapılır, ardından `git subtree split --prefix=transfer` ve STARBASE'de `git subtree pull --prefix=packages/file-transfer` çalıştırılır. STARBASE arayüzü vendored `@stardrop/ui` ile ayrı tutulur.
