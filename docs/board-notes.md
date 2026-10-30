# Ortak not panosu

Pano varsayılan olarak **Not panosu** görünümüyle açılır. Üyeler ve Ekipler sekmeleri aynı yerde durur.

## Kullanım ve fikirler

- **Not:** Kontrol listesi, test hazırlığı, ekip içi kısa bilgi.
- **Duyuru:** Toplantı saati, test günü, ortak çalışma duyurusu.
- **İlgili ekip:** Bir etikettir; erişim kısıtlaması değildir. Tüm takım notları okuyabilir, ekip filtresiyle ilgililerini bulabilir.
- **Son tarih:** İsteğe bağlı takvim tarihi. Geçmiş tarih işaretlenir; otomatik görev atama veya bildirim gönderilmez.
- **Sabit not:** Yönetimin önemli test/organizasyon duyurularını üstte tutması.
- **Arşiv:** İşlevini tamamlayan duyuruyu kaybetmeden aktif panodan kaldırma; geri getirilebilir.
- **Silme:** Onay ekranından sonra kalıcıdır.

Herkes kendi notunu düzenleyebilir, arşivleyebilir ve silebilir. Takım sahibi veya `board.manage` iznine sahip kişiler tüm notları yönetebilir ve sabitleyebilir. İçerik düz metindir; HTML/komut çalıştırılmaz. Beğeni, takipçi, yorum veya sohbet akışı yoktur.

Başlık en fazla 120, metin en fazla 2000 karakterdir. Bir sayfada 24 not gösterilir; sabit olanlar önce gelir. Son güncelleme zamanı ve yazar görünür. Aynı not iki yerde değiştirilirse `409 note_conflict` döner; önceki sürüm yeni yazının üzerine geçirilmez. Taslak otomatik silinmez; kullanıcı güncel notu açıp değişikliklerini uzlaştırır.

## Canlı güncelleme

Notlar **D1** içinde kalıcıdır. Cloudflare **SQLite-backed Durable Object + WebSocket Hibernation** yalnız değişiklik bildirimi taşır. Gelen çerçeve şöyledir:

```json
{"type":"board.changed"}
```

Not metni, kullanıcı adı veya yetki bilgisi WebSocket çerçevesinde bulunmaz. Alıcı, bildirimi alınca yetkisi her istekte tekrar kontrol edilen `/api/v1/board/notes` kaynağını okur. Dolayısıyla bir hesabın üyeliği veya oturumu iptal edilse de yeni içerik yetki kontrolü olmadan iletilmez. Süresi dolan abonelikler kapatılır; istemciden gelen mesajlar yayınlanmaz.

Bağlantı koparsa istemci artan gecikmeyle yeniden bağlanır, yeniden bağlanınca güncel içeriği alır. Gizli sekmeler bağlantıyı kapatır; görünür olunca tekrar kurar. Kaçırılmış bir bildirimi telafi etmek için görünür ve bağlı panoda 5 dakikada bir; bağlantı yokken 30 saniyede bir kontrol yapılır. Ağ kesintisi mesajı bir başarı gibi gösterilmez.

Not yazımı kalıcılaştıktan sonra bildirim geçici olarak başarısız olursa API yine yazımın başarılı olduğunu döndürür (`liveDelivered:false`). Bu durumda diğer istemciler yeniden bağlanma, kontrol aralığı veya Yenile ile içeriği alır. Notu tekrar göndermek gerekmez.

## Erişim ve API

Bütün uçlar merkezi STARBASE oturumu ve takım üyeliği gerektirir. Uygulama Bearer tokenları erişemez. Şifre/üyelik/hesap kontrolleri mevcut auth middleware'inden geçer. Cookie kullanan değişiklikler aynı origin şartına tabidir. WebSocket yükseltmesinde ayrıca tam Origin kontrolü yapılır.

| Uç | Açıklama |
| --- | --- |
| `GET /api/v1/board/notes?page=1&archived=0&kind=announcement&teamId=software` | Filtreli sayfa; `notes`, `canModerate`, `total`, `hasMore` |
| `POST /api/v1/board/notes` | `title`, `content`; isteğe bağlı `kind`, `teamId`, `dueAt` |
| `PATCH /api/v1/board/notes/:id` | Değişen alanlar + zorunlu `version`; `pinned` yalnız moderatör |
| `DELETE /api/v1/board/notes/:id` | `{version}`; yazar veya moderatör |
| `GET /api/v1/board/live` | Aynı origin'den WebSocket upgrade; cookie ile abonelik |

`kind`: `note` / `announcement`. `teamId`: ekip kimliği veya `null`. `dueAt`: UTC Unix saniyesi veya `null`. `archived` liste filtresi `0` / `1`; PATCH alanı boolean'dır. Sunucu yazar, sürüm ve tarihleri kendi belirler. Bir kullanıcı dakikada en fazla 30 not değişikliği yapabilir. Genel auth/CSRF kuralları ayrıca uygulanır.

Yazma, düzenleme ve silme işlemleri aktör ve not kimliğiyle denetim kaydına geçer; not metni denetim kaydına kopyalanmaz.

## Ücretsiz katman ve kurulum

Yerelde `npm run db:migrate` ile **0005_board_notes.sql** uygulanır. Worker binding'i `BOARD_HUB`, sınıfı `BoardHub`, Durable Object migration etiketi `v1-board-hub` olarak hazırdır. Yeni sınıf `new_sqlite_classes` ile tanımlanır; eski KV-backed DO kullanılmaz. Vite proxy'sinde WebSocket iletimi açık olmalıdır (`ws:true`); bu depoda ayarlıdır.

Cloudflare SQLite-backed Durable Objects'ı Workers Free planında sunar. Boştaki bağlantılar hibernation kullanır; sürekli aktif JavaScript döngüsü veya chat mesaj trafiği yoktur. Free planın istek/süre/depolama kotaları vardır; aşımda işlemler kısıtlanabilir. Ücretli plana otomatik yükseltme yapılmaz.

Resmi kaynaklar: [ücretlendirme ve ücretsiz sınırlar](https://developers.cloudflare.com/durable-objects/platform/pricing/), [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

Bu değişiklik yerelde çalıştırılmıştır; henüz bir Cloudflare hesabına yayımlanmadı. Üretimde normal D1 migration ve Worker dağıtımı, binding ve DO migration ile birlikte yapılmalıdır. Notlar otomatik silinmez; arşivleme/silme takım tarafından yönetilir. D1 yedeği notları da içerir; canlı bağlantı katmanında kalıcı not verisi tutulmaz.

## İleride değerli olabilecek ekler

- Önemli test duyurularında **okudum teyidi**: Operasyonel iletişim için, beğeni sayısı gibi kullanılmadan.
- **Toplantı/test tarihi bağlantısı**: YRT TAKVİM bağlandığında nottan ilgili etkinliğe gitme.
- **Kontrol listesi şablonları**: Test öncesi standart adımları hızlıca not olarak açma.

Bu üçü henüz uygulanmadı; mevcut sürümde canlı not, duyuru, ekip etiketi, son tarih, sabitleme ve arşiv vardır.
