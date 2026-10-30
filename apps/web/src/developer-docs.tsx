import { useState, type ReactNode } from "react";
import { Button, Panel, TabBar, Disclosure } from "@stardrop/ui";
import { Copy, Check, Download, ArrowLeft } from "lucide-react";
function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="docs-code">
      <Button variant="bare" size="sm" onClick={copy} aria-label="Kodu kopyala">
        {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
        {copied ? "Kopyalandı" : "Kopyala"}
      </Button>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}
export function DeveloperDocs() {
  const [tab, setTab] = useState("start");
  const origin = location.origin;
  const config = `import { Starbase } from '@starbase/sdk';\n\n// src/lib/starbase.ts — uygulamada tek bir istemci\nexport const starbase = new Starbase({\n  baseUrl: '${origin}',\n  clientId: 'starlab-web',\n  redirectUri: location.origin + '/callback',\n  storage: sessionStorage\n});`;
  return (
    <article className="docs developer-docs">
      <span className="eyebrow">STARBASE / GELİŞTİRİCİ MERKEZİ</span>
      <h1>Takımına bağlan.</h1>
      <p>
        Bir istemci, ortak hesap ve sunucuda doğrulanan izinler. Giriş/çıkış
        kaydı otomatik tutulur.
      </p>
      <TabBar
        label="Dokümantasyon bölümleri"
        value={tab}
        onChange={setTab}
        items={[
          { value: "start", label: "Başlangıç" },
          { value: "web", label: "Vite / React" },
          { value: "history", label: "Giriş ve çıkış" },
          { value: "api", label: "API" },
          { value: "native", label: "Tauri" },
        ]}
      />
      {tab === "start" && (
        <>
          <h2>01 / Uygulamayı kaydet</h2>
          <p>
            Takım yöneticisi Uygulamalar ekranında bir kimlik, tam dönüş adresi
            ve uygulamanın originini tanımlar. Web ve masaüstü için ayrı kimlik
            kullanılır.
          </p>
          <Panel title="Örnek web uygulaması">
            <dl>
              <dt>Kimlik</dt>
              <dd>starlab-web</dd>
              <dt>Dönüş adresi</dt>
              <dd>http://127.0.0.1:5180/callback</dd>
              <dt>Origin</dt>
              <dd>http://127.0.0.1:5180</dd>
              <dt>Kapsamlar</dt>
              <dd>profile, organization</dd>
            </dl>
          </Panel>
          <h2>02 / SDK’yı kur</h2>
          <a className="sd-button" href="/downloads/starbase-sdk.tgz" download>
            <Download size={16} /> SDK paketini indir
          </a>
          <Code>{"npm install ./starbase-sdk.tgz"}</Code>
          <p>
            Arşiv derlenmiş JavaScript ve tip tanımlarını içerir. Ayrı Firebase
            SDK’sı veya contracts paketi gerekmez. React adaptörü isteğe
            bağlıdır.
          </p>
          <h2>03 / İstemciyi oluştur</h2>
          <Code>{config}</Code>
          <p>
            Client secret gerekmez. Firebase servis hesabı ve özel anahtarlar
            yalnız STARBASE sunucusunda kalır.
          </p>
        </>
      )}
      {tab === "web" && (
        <>
          <h2>Giriş ve dönüş</h2>
          <Code>{`import { starbase } from './lib/starbase';\n\n// Giriş düğmesinin onClick işlemi\nawait starbase.login(['profile', 'organization']);\n\n// /callback sayfası — guard dışında tutulur\nconst profile = await starbase.handleCallback();\n// Router ile ana sayfaya geç. Callback kodunu loglama.\n\n// Uygulama yeniden açıldığında\nconst user = await starbase.getProfile();\n\n// Çıkış düğmesi\nawait starbase.logout();`}</Code>
          <h2>React bağlantısı</h2>
          <Code>{`import { StarbaseProvider, useStarbase } from '@starbase/sdk/react';\nimport { starbase } from './lib/starbase';\n\n// Uygulama kökünde\n<StarbaseProvider client={starbase}>\n  <App />\n</StarbaseProvider>\n\n// Bir bileşende\nconst client = useStarbase();\n<button onClick={() => client.login(['profile'])}>Giriş yap</button>`}</Code>
          <p>
            İstemciyi her render’da yeniden oluşturma. Callback aynı istemcide
            iki kez çağrılırsa SDK tek kod değişimi yapar; React StrictMode ile
            çalışır.
          </p>
          <h2>Korunan API çağrısı</h2>
          <Code>{`const token = await starbase.getAccessToken();\nconst response = await fetch('/api/projects', {\n  headers: { Authorization: 'Bearer ' + token }\n});\n\n// Kendi API sunucunda\nimport { requireStarbasePermission } from '@starbase/sdk';\nconst user = await requireStarbasePermission(\n  process.env.STARBASE_URL,\n  bearerToken,\n  'starlab-web.projects.read'\n);`}</Code>
          <p>
            İzin anahtarı uygulama kimliğiyle başlamalıdır. hasPermission()
            yalnız arayüz içindir; veriyi koruyan kontrol kaynak sunucusunda
            yapılır.
          </p>
          <h2>Hata yakalama</h2>
          <Code>{`import { StarbaseError } from '@starbase/sdk';\ntry {\n  const user = await starbase.getProfile();\n} catch (error) {\n  if (error instanceof StarbaseError && error.status === 401) {\n    // Giriş düğmesini göster.\n  } else {\n    // Bağlantı/izin hatasını göster; korunan veriyi açma.\n  }\n}`}</Code>
        </>
      )}
      {tab === "history" && (
        <>
          <h2>Ek takip kodu gerekmez</h2>
          <p>
            Başarılı handleCallback() sunucuda bir uygulama giriş kaydı
            oluşturur. logout() gerçek çıkış kaydı üretir. Token yenilemek yeni
            giriş sayılmaz.
          </p>
          <Code>{`// Yalnız bu uygulamadaki kendi geçmişin\nconst history = await starbase.getApplicationHistory(1);\n\n// history.applications: son giriş / gerçek son çıkış\n// history.visits: son 20 oturum\n// history.hasMore: sonraki sayfa var mı?`}</Code>
          <Panel title="Kayıtların anlamı">
            <dl>
              <dt>logout</dt>
              <dd>Uygulama çıkışı API’ye bildirdi.</dd>
              <dt>revoked</dt>
              <dd>Oturum kullanıcı/yönetim tarafından iptal edildi.</dd>
              <dt>expired</dt>
              <dd>Oturumun geçerliliği doldu.</dd>
              <dt>Boş çıkış</dt>
              <dd>Gerçek çıkış bildirimi yok.</dd>
            </dl>
          </Panel>
          <p>
            Tarayıcı kapanması, çökme veya internet kesilmesi güvenilir çıkış
            bildirimi değildir. beforeunload ile tarih üretme. Bu kayıtlar
            çevrimiçi durumunu veya çalışma süresini göstermez.
          </p>
          <p>
            Takım üyeleri merkezdeki profillerden uygulama özetlerini ve son
            oturumları görür. Uygulama tokenı diğer platformların geçmişini veya
            takım dizinini okuyamaz. Ayrıntılar 90 gün, son giriş/çıkış özetleri
            hesap/uygulama silinene kadar saklanır.
          </p>
        </>
      )}
      {tab === "api" && (
        <>
          <h2>Sözleşme ve kapsamlar</h2>
          <a
            className="sd-button"
            href="/api/openapi.json"
            target="_blank"
            rel="noreferrer"
          >
            OpenAPI JSON’u aç
          </a>
          <p>
            Tüm uçlar /api/v1 altında. Uygulama çağrıları Authorization: Bearer
            kullanır. Merkezi panel aynı origin üzerinde HttpOnly cookie
            kullanır.
          </p>
          <Panel title="Profil kapsamları">
            <dl>
              <dt>profile</dt>
              <dd>
                İsim, soyisim; sabit kimlik ve kullanıcı adı her zaman döner.
              </dd>
              <dt>email</dt>
              <dd>E-posta ve doğrulama durumu.</dd>
              <dt>organization</dt>
              <dd>Departman ve ekip üyelikleri.</dd>
            </dl>
          </Panel>
          <div className="docs-endpoints">
            {[
              ["GET /me", "İzin verilen kendi profilin."],
              ["GET /permissions", "Yalnız bu uygulamanın izinleri."],
              [
                "GET /me/applications?page=1",
                "Kendi uygulama geçmişin; uygulama tokenıyla yalnız o uygulama.",
              ],
              [
                "GET /directory/users?q=&departmentId=&teamId=&page=1",
                "Merkezi takım dizini; sayfa başına 24 kişi.",
              ],
              [
                "GET /directory/teams",
                "Departmanlar, ekipler ve üye sayıları.",
              ],
              ["GET /directory/users/:id", "Takım profili ve uygulama özeti."],
              [
                "GET /directory/users/:id/activity?page=1",
                "Son 90 gündeki 20 oturumluk sayfalar.",
              ],
            ].map(([path, description]) => (
              <div key={path}>
                <code>{path}</code>
                <p>{description}</p>
              </div>
            ))}
          </div>
          <p>
            Dizin uçları yalnız merkezi oturum ve takım üyeliğiyle erişilebilir.
            E-posta, yönetim rolleri ve özel profil alanları dizine dahil
            değildir. Tarihler UTC Unix saniyesidir; gösterimde yerel saate
            dönüştür.
          </p>
          <h2>Sık karşılaşılan hatalar</h2>
          <Disclosure title="Giriş ekranından geri dönemiyorum">
            <p>
              Dönüş adresinin protokol, host, port ve path değerleri kayıtla tam
              eşleşmeli. localhost ile 127.0.0.1 farklı origin’dir. Callback
              route’unu router guard’ının dışında bırak.
            </p>
          </Disclosure>
          <Disclosure title="origin_rejected veya CORS hatası">
            <p>
              Uygulama originini yönetim panelinde kaydet; path ekleme. İstek
              URL’si STARBASE adresi olmalı. Üretimde HTTPS kullan.
            </p>
          </Disclosure>
          <Disclosure title="401 / session_expired / refresh_reused">
            <p>
              Yeniden giriş iste. Refresh tokenı uygulamalar veya tarayıcı
              sekmeleri arasında kopyalama. SDK aynı istemcide eşzamanlı
              yenilemeleri birleştirir.
            </p>
          </Disclosure>
          <Disclosure title="403 / permission_denied">
            <p>
              Takım yöneticisi uygulama iznini role, rolü kullanıcıya atamalı.
              Yetki kontrolünü frontend’de geçerek sorunu çözmeye çalışma.
            </p>
          </Disclosure>
          <Disclosure title="429 veya 503">
            <p>
              429 için kısa süre bekleyip kullanıcıya yeniden deneme sun. 503
              bağlantı, sağlayıcı veya ücretsiz kota sorunu olabilir; korunan
              veriye erişimi açık bırakma.
            </p>
          </Disclosure>
        </>
      )}
      {tab === "native" && (
        <>
          <h2>Tauri’de sistem tarayıcısı</h2>
          <p>
            WebView içinde şifre toplama. Native örnek sistem tarayıcısını açar;
            PKCE/state denetimiyle loopback callback’i alır ve refresh tokenını
            işletim sisteminin anahtarlığında saklar.
          </p>
          <Panel title="Masaüstü uygulama kaydı">
            <dl>
              <dt>Kimlik</dt>
              <dd>starlab-desktop</dd>
              <dt>Dönüş adresi</dt>
              <dd>http://127.0.0.1:43817/callback</dd>
              <dt>Kapsamlar</dt>
              <dd>profile, organization</dd>
            </dl>
          </Panel>
          <Code>{`// Tauri Rust tarafında: examples/tauri/native\nlet client = starbase_native::Starbase::new(\n  "${origin}", "starlab-desktop"\n)?;\n\n// Sistem tarayıcısını açan opener callback'iyle\nlet profile = client.login(open_browser).await?;\nlet restored = client.get_profile().await?;\nclient.logout().await?;`}</Code>
          <p>
            examples/tauri/src-tauri/commands.rs dosyasındaki komutları mevcut
            builder’a ekle; opener plugin ve invoke_handler kaydını yap.
            Frontend yalnız invoke ile profil alır; refresh tokenını
            JavaScript’e taşıma.
          </p>
          <p>
            logout() önce sunucuya bildirir, sonra anahtarlığı temizler.
            clear_local_session() yalnız yerel temizlemedir ve çıkış tarihi
            üretmez. Gerçek işletim sistemi ve paketlenmiş uygulamada tarayıcı
            dönüşünü ayrıca dene.
          </p>
        </>
      )}
      <div className="docs-footer">
        <Button variant="bare" onClick={() => location.assign("/")}>
          <ArrowLeft size={16} /> Hesap merkezine dön
        </Button>
      </div>
    </article>
  );
}
