# Özel ve ortak serbest pano

Ana ekran kendi panonla açılır. Üst ortadaki **Kendi panom / Ortak pano** düğmeleri iki alanı değiştirir. Menü sol üstteki ikonun üzerine gelince açılır, üzerinden ayrılınca kapanır; dokunarak ve klavyeyle de kullanılabilir. Üye arama ve profiller **Takım dizini**, ekipten üyeye gezinti **Ekipler** menüsündedir.

Alt yörünge ekranın iki alt köşesini birleştirir. STARDROP, STARLAB ve YRT TAKVİM düğmeleri bağlı uygulamalar ekranını açar; henüz bağlanmamış uygulamalara sahte bir giriş bağlantısı verilmez.

## Notların kullanımı

Not ekle, üstündeki tutamaktan sürükle ve bırak. Konum D1'e kaydedilir; sayfayı yenilemek konumu değiştirmez. Klavyede tutamağa odaklanıp yön tuşlarıyla 10, Shift ile 40 piksel taşıyabilirsin. Escape devam eden sürüklemeyi iptal eder. Dokunmatik ekranda da tutamaktan taşıma desteklenir; alanın geri kalanı normal kaydırılır. Büyük panoya yatay/dikey kaydırarak ulaşılır.

- **Özel pano:** Yalnız notun sahibi okuyabilir, düzenleyebilir, taşıyabilir ve silebilir. Yönetici veya `board.manage` izni bu erişimi açmaz. Takım rolü olmayan merkezi hesaplar da kendi özel panosunu kullanabilir.
- **Ortak pano:** Takım üyeleri tüm ortak notları görebilir. Yazar kendi notunu, sahibi/moderatör tüm ortak notları düzenleyip taşıyabilir. `board.manage` ortak notları sabitlemeye de izin verir.
- **Not / duyuru:** Test hazırlıkları, kısa kontrol listeleri ve toplantı bilgileri için. Ekip etiketi erişim sınırı değildir. Son tarih isteğe bağlıdır.
- **Sabitleme:** Önem işaretidir; konumu kilitlemez. Özel panoda kendi notunu sabitleyebilirsin.
- **Arşiv:** Aktif alandan kaldırır; filtrelerden geri getirilebilir. Silme onay sonrası kalıcıdır.

Başlık 120, metin 2000 karaktere kadar düz metindir. HTML çalıştırılmaz. Not türü/ekip/arşiv filtreleri sağ üstteki filtre ikonuyla açılır. Canvas sayfası en fazla 200 not yükler; daha fazlasında sayfa geçişi sunulur. Konumlar sayfalar arasında korunur. Beğeni, takipçi veya sohbet yoktur.

## API ve gizlilik

Tüm uçlar merkezi STARBASE oturumu gerektirir; uygulama Bearer tokenları erişemez. Ortak pano ayrıca takım üyeliği gerektirir. Özel sahiplik kontrolü sunucudadır; istemcide gizlemekle sınırlı değildir. Başkasına ait özel not kimliğine erişim `404 note_not_found` döndürür. Notun kapsamı oluşturulduktan sonra PATCH ile değiştirilemez; yanlışlıkla özel içeriği yayımlamak mümkün değildir.

| Uç | Kullanım |
| --- | --- |
| `GET /api/v1/board/notes?scope=private` | Kendi özel notların; varsayılan kapsam `private` |
| `GET /api/v1/board/notes?scope=shared&limit=200` | Ortak pano; takım üyeliği kontrol edilir |
| `POST /api/v1/board/notes` | `title`, `content`, isteğe bağlı `scope`, `x`, `y`, `kind`, `teamId`, `dueAt` |
| `PATCH /api/v1/board/notes/:id` | İçerik alanları, `pinned`, `archived` + zorunlu `version` |
| `PATCH /api/v1/board/notes/:id/position` | `{ "x": 240, "y": 160, "layoutVersion": 1 }` |
| `DELETE /api/v1/board/notes/:id` | `{ "version": 1 }` |
| `GET /api/v1/board/live?scope=private` | Kişisel WebSocket aboneliği; `scope=shared` ortak kanal |

GET filtreleri: `page` (1+), `limit` (1–200, varsayılan 24), `archived` (`0`/`1`), `kind` (`note`/`announcement`), `teamId`. Yanıt: `notes`, `page`, `pageSize`, `total`, `hasMore`, `canModerate`. Her not `scope`, `x`, `y`, `layoutVersion`, `version`, yazar ve tarih alanlarını içerir. Koordinatlar tam sayı 0–20000 aralığındadır. `dueAt` Unix saniyesi veya `null`, `teamId` ekip kimliği veya `null` değeridir. Oluşturma yanıtındaki kimlikten sonra güncel alanlar GET ile alınır.

```js
// Yalnız STARBASE'nin kendi origin'inde, merkezi cookie oturumuyla:
await fetch('/api/v1/board/notes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scope: 'private', title: 'Test hazırlığı', content: 'Sensörleri kontrol et', x: 80, y: 60 })
});
```

İçerik sürümü `version`, konum sürümü `layoutVersion` bağımsızdır. Taşıma metin düzenlemesini geçersiz kılmaz. Eski içerik sürümü `409 note_conflict`, eski konum sürümü `409 note_position_conflict` döndürür. İstemci güncel konumu yeniden alır; metin düzenleme çakışmasında taslağı korur. Bir kullanıcı dakikada en fazla 30 yazma/taşıma işlemi yapabilir. Sürükleme sırasında ağ isteği gönderilmez, bırakınca bir kez kaydedilir.

## Canlı güncelleme ve kalıcılık

Notlar ve konumlar D1'de kalıcıdır. SQLite-backed Durable Object + WebSocket Hibernation yalnız `{"type":"board.changed"}` bildirimi taşır; metin veya kimlik bilgisi yayınlanmaz. Ortak pano `team-board`, her kişisel pano sunucunun oturumdan belirlediği ayrı `private:<userId>` hub'ını kullanır. İstemci başka kullanıcının hub'ını seçemez. HTTP okumalarının her birinde yetki tekrar kontrol edilir.

Bağlantı koparsa artan gecikmeyle yeniden bağlanılır. Gizli sekmeler bağlantıyı kapatır. Görünür panoda kaçırılmış bildirimler bağlıyken 5 dakikada, bağlantı yokken 30 saniyede bir kontrol edilir. Süresi dolan abonelikler kapanır. İstemciden gelen mesajlar yayınlanmaz. Cookie değişiklikleri ve WebSocket aboneliği aynı origin kontrolünden geçer.

Bildirim geçici olarak başarısız olsa da D1'e kaydedilen yazım başarılıdır (`liveDelivered:false`); not tekrar gönderilmemelidir. Oluşturma/düzenleme/silme denetim kaydına aktör ve not kimliğiyle geçer; özel not içeriği denetim kaydına kopyalanmaz. Taşıma için sürekli olay günlüğü üretilmez.

## Kurulum

`npm run db:migrate` ile **0005_board_notes.sql** ve **0006_board_canvas.sql** uygulanır. Önceden var olan notlar **ortak** kalır; migration onlara ayrı başlangıç konumları verir. Yeni notların varsayılan kapsamı **özel**dir. Eski ortak pano istemcileri listeleme, oluşturma ve canlı abonelikte açıkça `scope=shared` göndermelidir.

Worker binding'i `BOARD_HUB`, sınıfı `BoardHub`, migration etiketi `v1-board-hub`; yeni SQLite DO sınıfı tanımı hazırdır. Vite proxy'si `ws:true` kullanır. Yerel Firebase Auth Emulator ve Wrangler/D1 ile çalışır; bir Cloudflare hesabına dağıtım yapılmamıştır. D1 yedeği notları içerir; canlı katmanda kalıcı not metni tutulmaz. Üretimde migration ve Worker dağıtımı birlikte uygulanmalıdır.

Ücretsiz katman ve kota ayrıntıları: [Cloudflare Durable Objects fiyatlandırması](https://developers.cloudflare.com/durable-objects/platform/pricing/) ve [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/). Kota/süreklilik sınırsız değildir; bu değişiklik ücretli hesap veya plan açmaz.
