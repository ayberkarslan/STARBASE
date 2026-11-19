# STARBASE
## Merkezi Hesap ve Uygulama Platformu

**Proje Tanıtımı ve Kullanım Kılavuzu**  
**Rapor Kodu:** YRT-GEN-01  
**Rapor Tarihi:** 19.11.2026  
**Hazırlayan:** Muhammet Ayberk ARSLAN  
**Durum:** Yönetim kurulu değerlendirmesi için taslak

Bu belgede YRT STARBASE Merkezi Hesap ve Uygulama Platformu; ortaya çıkış nedeni, teknik mimarisi, takım üyelerine sağladığı işlevler ve ileride geliştirilecek uygulamalara nasıl bağlanacağıyla birlikte raporlanmıştır.

<!-- PAGE -->

## 1. Projenin Çıkış Noktası

Yıldız Roket Takımının yazılımları arttıkça (örneğin Test Takvimi, YRT LaTeX Platformu, STARDROP ve ileride geliştirilecek Sponsorluk Platformu) her uygulamada ayrı hesap, şifre ve yetki yönetmek hem üyeler hem geliştiriciler için tekrar eden iş oluşturur. STARBASE bu işleri tek merkezde toplar. Yıldız Roket Takımı üyeleri tek hesapla takıma ait platformlara erişir; yönetim kurulu uygulama erişimini, takım üyeliğini ve görev bazlı izinleri merkezden düzenler. Geliştirilen yeni yazılımlar aynı temele bağlanarak daha hızlı kullanıma açılabilir.

Takıma doğrudan; tutarlı giriş ve üyelik deneyimi, düzenli takım dizini, yetkilerin kontrollü dağıtılması, uygulamalar arasında kolay geçiş ve yeni projeler için hazır entegrasyon noktası gibi katkıları vardır.

## 1.1. Neden Bir Uygulama Değil, Ortak Bir Platform?

STARBASE yalnızca yeni bir giriş ekranı değildir. Uygulamaların üzerinde birleştiği hesap, takım yapısı ve izin sözleşmesidir. Bir üyeye yeni görev verildiğinde veya üyelik sona erdiğinde bu değişikliklerin her uygulamada ayrı ayrı işlenmesi yerine ortak merkezden yönetilmesi hedeflenir. Böylece uygulamalar kendi asıl işine, örneğin test planlamaya veya teknik belge hazırlamaya odaklanabilir.

Bu ayrım, sonraki yıllarda takım yazılımlarını devralacak üyeler için de önemlidir. Yeni geliştirici, kullanıcıların kim olduğunu ve hangi veriye erişebileceğini sıfırdan tasarlamaz; belgelenmiş STARBASE API'sine bağlanır. Platform büyüdükçe tekrar eden kod miktarı azalır, uygulamalar arasında davranış tutarlılığı artar.

<!-- PAGE -->

## 2. Teknik Mimari ve Neden Bu Tercihler?

- **React + Vite, ortak tasarım dili:** Hızlı geliştirilen arayüz, B4 ve ortak bileşen kütüphanesiyle tutarlı görünüm sağlar. Aynı yaklaşım web ve Tauri tabanlı uygulamalarda kullanılabilir. Takım içinde standartlaştırılan arayüz anlayışı burada da sürdürülür.
- **Firebase Authentication:** Şifre ve e-posta doğrulama işlemleri uzmanlaşmış bir kimlik hizmetinde kalır. Kendi parola altyapımızı sürekli güncelleme ve koruma yükünü azaltır. STARBASE'in kendi veritabanında şifre tutulmaz.
- **Cloudflare Workers + D1:** API ve ilişkili takım verileri yönetilen altyapıda çalışır. Sürekli açık sunucu yönetimine göre operasyonu sadeleştirir. D1 kullanıcı, ekip, rol, uygulama ve oturum ilişkilerini düzenli biçimde tutar.
- **Durable Objects + WebRTC:** Canlı dosya paylaşımında üyelerin bağlantıları koordine edilir. Dosyanın içeriği STARBASE sunucusunda biriktirilmeden cihazlar arasında aktarılır.
- **STARBASE SDK ve API:** Bir uygulama giriş ekranını yeniden yazmak yerine kayıtlı uygulama kimliğini, dönüş adresini ve gerekli erişim kapsamını tanımlar. Entegrasyon belgeleri geliştirici ekranındadır. Bu belgeler sayesinde sonraki takım platformlarının bağlanması daha hızlı ve öngörülebilir hale gelir.

Bu parçalar bilerek ayrılmıştır: Firebase kimliği doğrular; STARBASE API kimin hangi uygulamaya ve veriye erişeceğine karar verir; D1 takımın kurumsal ilişkilerini saklar; istemci uygulama ise kendi işlevini yürütür. Böylece tek bir uygulamanın iç yapısı diğerlerinin hesap modelini belirlemez.

STARBASE genel kullanıma açık bir OAuth/OIDC sağlayıcısı değil, takım uygulamaları için tasarlanmış kendi merkezi erişim protokolümüzdür.

<!-- PAGE -->

## 3. API Mimarisi ve Üyelerin Veri Güvenliği

Uygulama sayısı arttıkça karmaşıklığı azaltan bu yapıda geliştiricilere ham STARBASE veritabanı verilmez. API, hassas takım verileri ile uygulama izinleri arasındaki katmanı oluşturur. Örneğin ileride bir takım üyesi yeni bir platform geliştirdiğinde, bu platformun STARBASE'e hangi kimlikle bağlanacağı ve hangi verilere erişebileceği yetkili hesap tarafından kayıt altına alınır. Geliştiriciye gereken teknik talimatlar verilir; uygulama yalnız tanımlanan sınırlar içinde veri isteyebilir.

**Bağlantı akışı:** Üye uygulamada “STARBASE ile giriş” seçer → STARBASE hesabını doğrular → istenen erişim kapsamını görüp onaylar → uygulamaya kısa ömürlü, tek kullanımlık dönüş kodu gönderilir → uygulama kodu güvenli biçimde değiştirerek oturum açar. Uygulamanın kaynak API'si korumalı isteklerde verilen erişim bilgisini yeniden doğrular. `state` ve PKCE kontrolleri dönüş kodunun başka bir akışta kullanılmasını engellemeye yardımcı olur.

Bu düzen yeni bir uygulama için büyük avantajdır: kimlik, izin ve oturum yaşam döngüsü hazırdır; geliştirici kendi ürün mantığına yoğunlaşır. İzinlerin merkezi olması, ileride sponsorluk veya yönetim belgeleri gibi yalnız belirli rollerin görebileceği bilgilerin aynı modelle korunmasına da temel oluşturur. Uygulamanın kendi verilerine ilişkin güvenlik sorumluluğu ise o uygulamanın geliştiricisinde kalır.

[[GÖRSEL 1: Uygulama–STARBASE giriş ve veri erişim akış şeması — görsel eklenecek]]

<!-- PAGE -->

## 4. Giriş Ekranları ve Uygulama Sayfaları

STARBASE'e entegre edilmiş uygulamalardan STARDROP ve YRT LaTeX, ortak hesapla giriş örnekleridir. Uygulama üyeden kendi şifresini tekrar toplamak yerine STARBASE girişine yönlendirir. İlk bağlantıda uygulamanın hangi profil alanlarına ihtiyaç duyduğu gösterilir. Üye onay verirse daha sonraki girişlerde aynı hesabı kullanabilir; erişimini daha sonra STARBASE'den kapatabilir.

**Uygulama sayfaları**, ana sayfadaki uygulama kutucuğuna tıklandığında açılır. Showroom tarzında uygulamanın temel bilgisini, kullanıcının son girişlerini, erişim durumunu ve varsa o uygulamadaki çalışmalarını özetler. Üye açık oturumlarını gözden geçirip sonlandırabilir. “Uygulamayı aç” düğmesi ilgili uygulamaya geçişi başlatır.

Bu ekran uygulamalar için aynı zamanda kısayol niteliğindedir. Örneğin LaTeX platformunda son belgelerin önizlemeleri sergilenebilir; belgeye tıklanınca üye ilgili çalışmaya yönlendirilir. Takvimde kullanıcıyla ilişkili testler gösterilebilir. Dosyanın asıl içeriği ve düzenleme işlemi ilgili uygulamada kalır; STARBASE kimliği, izinleri ve gösterilecek özet kaynakları bağlar. Böylece her uygulama kendi alanına uygun kartlar, istatistikler ve kısayollar ekleyebilir.

Bu ekranın sınırları geliştiricinin hayal gücü kadar geniş olsa da hangi bilginin gösterilebileceği API izni ve kullanıcının erişim hakkıyla belirlenir. Amaç uygulamayı STARBASE içine kopyalamak değil, üyeye işine kaldığı yerden başlama noktası sunmaktır.

[[GÖRSEL 2: STARDROP/LaTeX giriş ekranı ve bir uygulama ayrıntı sayfası — ekran görüntüsü eklenecek]]

<!-- PAGE -->

## 5. Ana Sayfa, Hesabım ve Takım Yapısı

**Ana sayfa:** STARBASE'e doğrudan giriş yapıldığında kullanıcıyı uygulamalar ve çalışma alanları karşılar. Bir uygulamadan giriş yapılıyorsa üye onay sonrasında çoğunlukla doğrudan o uygulamaya döner. Ana sayfadaki arama kutusu uygulama veya takım üyesi bulur; `Ctrl + K` kısayolu da aynı aramayı açar. “Kaldığın yer” alanı son kullanılan uygulamaya dönüşü kolaylaştırır. Bir uygulamayı seçmek önce o uygulamanın STARBASE sayfasını açar.

**Hesabım ve profil:** Üyeler kişisel bilgilerini, profil fotoğrafını, kullandıkları uygulamaları ve oturumlarını yönetebilir. Profiller diğer üyeler için ayrı sayfalar halinde açılır; üyenin takım içindeki departman ve ekip bağlantıları anlaşılır biçimde gösterilir. Uygulamalardaki çalışmalar kişiye ait kimlikle ilişkilendirilebilir.

**Takım ve Departmanlar:** Takım ekranından diğer üyeler aranabilir ve profillerine geçilebilir. Departmanlar ekranı Aviyonik, Yapısal, İtki ve Organizasyon yapısını, altlarındaki ekiplerle birlikte gösterir. Böylece hangi çalışmanın hangi ekipte yürütüldüğünü bulmak kolaylaşır. Takım dizini herkese açık bir sosyal ağ değil, üyelerin çalışma yapısını gördüğü kurumsal bir alandır.

**Bildirimler:** Oda davetleri gibi kullanıcıya yöneltilen işlemler ayrı bir bildirim alanına gelir. Okunmuş davet yeni uyarı gibi kalmaz.

[[GÖRSEL 3: Ana sayfa, üye profili veya departman ekranı — ekran görüntüsü eklenecek]]

<!-- PAGE -->

## 6. Canlı Dosya Paylaşımı ve Yönetim

**Hızlı paylaşım:** Dosya Paylaşımı ekranı varsayılan olarak ortak bir geçici alana açılır. Katılan takım üyeleri birbirini anında görür. Bir dosya alana bırakılıp diğer üyeye gönderilebilir; alıcı kabul ettiğinde aktarım cihazlar arasında yapılır. Gönderen alandan çıktığında dosya listeden kalkar. Alıcının cihazına indirdiği kopya ise cihazında kalır. Hızlı alan, tarayıcı belleğini korumak için 50 MB dosya sınırına sahiptir.

**Odalar:** Uzun süreli çalışma veya daha büyük dosyalar için üyeler isimli paylaşım odası açabilir. Oda açık bırakılabilir ya da altı haneli kodla korunabilir; üye daveti, katılımcı yönetimi ve oda kapatma araçları burada bulunur. Dosyalar STARBASE üzerinde kalıcı depolama olarak saklanmaz.

**Yönetim araçları:** Yetkili kişiler hesap durumlarını, üyelikleri, departmanları, ekipleri, rolleri ve uygulama kayıtlarını merkezi arayüzden yönetir. Bir uygulamanın adını veya logosunu burada değiştirmek, aynı kaydı kullanan farklı ekranların tutarlı kalmasını sağlar. Rol ve izinler, örneğin yalnız yönetim kurulunun göreceği sponsorluk bilgileri için genişletilebilir.

**Erişim kayıtları:** Giriş, açıkça yapılan çıkış ve oturum sonlandırma olayları kaydedilir. Kayıtlar sekme kapanışını kesin çıkış veya kullanıcının çalışma süresi gibi yorumlamaz; sistem yalnız doğrulayabildiği olayları gösterir.

[[GÖRSEL 4: Dosya paylaşım alanı veya yönetim araçları — ekran görüntüsü eklenecek]]

<!-- PAGE -->

## 7. Yeni Uygulamaları Bağlama ve Gelecek

Yeni bir takım uygulaması için STARBASE yönetiminde uygulama kimliği, izin verilen adresler, tam dönüş adresi ve gerekli veri kapsamları kaydedilir. Geliştirici STARBASE SDK'sını ekler; “STARBASE ile giriş” düğmesi ve dönüş işlemini belgelenmiş akışla tamamlar. Uygulamanın kendi API'si korumalı isteklerde STARBASE oturumunu doğrular. Vite/React ve Tauri örnekleri bu adımları göstermek için hazırdır; ayrıntılı kılavuz Geliştiriciler ekranında bulunur.

**Modülerliğin uzun vadeli karşılığı:** Bugün test, belge ve masaüstü uygulamaları aynı hesaba bağlanabilir. Yarın sponsorluk, envanter veya görev planlama yazılımı geldiğinde yeniden parola ve üye yönetimi kurmaya gerek kalmaz. Uygulama kendi verisini üretir; STARBASE ortak kimliği, yetkiyi ve seçilen profil alanlarını tutarlı biçimde sağlar. Takım yazılımları birbiriyle konuşabilirken her uygulamanın sınırı da açık kalır.

**Kabul için önerilen deneme:** Bir üyeyi davet etmek, giriş yaptırmak, uygulamaya erişim vermek ve erişimi kaldırmak; ardından aynı hesabın başka bir takım uygulamasına geçişini görmek. Bu dört adım hem kullanım kolaylığını hem merkezi yönetimin gerçek yararını görünür kılar.

**Mevcut sınırlar:** STARBASE genel amaçlı OAuth/OIDC hizmeti değildir. Çok faktörlü doğrulama henüz yoktur; çevrimiçi çalışma süresi tahmin edilmez. WebRTC aktarımı bazı kısıtlı ağlarda doğrudan bağlantı kuramayabilir. Bu sınırlar raporda açıkça tutulur; sonraki sürümlerde ihtiyaç ve takımın bakım kapasitesine göre değerlendirilebilir.

**Sonuç:** STARBASE, bugünün uygulamalarını tek hesap altında birleştirirken sonraki nesillerin yazacağı platformlara da güvenli, belgelenmiş ve tekrar kullanılabilir bir başlangıç noktası bırakır.
