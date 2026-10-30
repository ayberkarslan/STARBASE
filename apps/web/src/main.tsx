import { Captcha } from "./captcha";
import {
  Invitations,
  EditUser,
  Fields,
  Sessions,
  RolesList,
} from "./management";
import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  TextField,
  Panel,
  DesktopHeader,
  TabBar,
  EmptyState,
  SelectMenu,
} from "@stardrop/ui";
import {
  ArrowUpRight,
  ArrowLeft,
  Orbit,
  Users,
  Shield,
  Layers,
  AppWindow,
  BookOpen,
  LogOut,
  Plus,
  Check,
  KeyRound,
} from "lucide-react";
import "@stardrop/ui/styles.css";
import "./style.css";
async function api(path: string, body?: unknown, method?: string) {
  const r = await fetch("/api/v1" + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: body
      ? {
          "Content-Type": "application/json",
          "x-turnstile-token":
            document.querySelector<HTMLInputElement>(
              '[name="cf-turnstile-response"]',
            )?.value ?? "",
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await r.json();
  if (!r.ok) throw new Error(data.error?.code ?? "İşlem tamamlanamadı");
  return data;
}
const messages: Record<string, string> = {
  invalid_credentials: "Kullanıcı adı veya şifre hatalı.",
  email_verification_required: "Devam etmek için e-posta adresini doğrula.",
  registration_unavailable: "Bu bilgilerle kayıt oluşturulamadı.",
  password_change_required: "Devam etmeden önce şifreni değiştir.",
  authentication_required: "Önce giriş yap.",
  permission_denied: "Bu işlem için yetkin bulunmuyor.",
  service_unavailable: "Servise şu anda ulaşılamıyor.",
  try_later: "Çok fazla deneme. Biraz sonra tekrar dene.",
};
function App() {
  const [user, setUser] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("account"),
    [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [rows, setRows] = useState<any[]>([]),
    [org, setOrg] = useState<any>({ departments: [], teams: [] }),
    [apps, setApps] = useState<any[]>([]),
    [consent, setConsent] = useState<any>(null),
    [selected, setSelected] = useState<any>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  async function load() {
    try {
      setUser(await api("/me"));
    } catch (e) {
      if ((e as Error).message === "password_change_required")
        setMode("change");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    if (path === "/action") {
      setMode(params.get("mode") === "resetPassword" ? "reset" : "verify");
    }
  }, []);
  useEffect(() => {
    if (user) {
      api("/permissions")
        .then(setPermissions)
        .catch(() => {});
      api("/organization")
        .then(setOrg)
        .catch(() => {});
      api("/apps")
        .then(setApps)
        .catch(() => {});
      if (path === "/authorize")
        api("/authorize?" + params)
          .then(setConsent)
          .catch((e) => setError(e.message));
    }
  }, [user]);
  useEffect(() => {
    setRows([]);
    setSelected(null);
    if (!user) return;
    const p =
      tab === "members"
        ? "/admin/users"
        : tab === "connections"
          ? "/connections"
          : tab === "audit"
            ? "/admin/audit"
            : null;
    if (p)
      api(p)
        .then(setRows)
        .catch((e) => setError(messages[e.message] ?? e.message));
  }, [tab, user]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(messages[(e as Error).message] ?? (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function field(form: FormData, k: string) {
    return String(form.get(k) ?? "");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await act(async () => {
      if (mode === "login") {
        const r = await api("/auth/login", {
          username: field(f, "username"),
          password: field(f, "password"),
        });
        if (r.passwordChangeRequired) setMode("change");
        else await load();
      }
      if (mode === "register") {
        await api("/auth/register", {
          username: field(f, "username"),
          password: field(f, "password"),
          email: field(f, "email"),
          firstName: field(f, "firstName"),
          lastName: field(f, "lastName"),
        });
        setNotice("Doğrulama e-postanı kontrol et.");
        setMode("login");
      }
      if (mode === "recover") {
        await api("/auth/recover", { email: field(f, "email") });
        setNotice("Hesap mevcutsa kurtarma e-postası gönderildi.");
      }
      if (mode === "change") {
        await api("/auth/password", {
          currentPassword: field(f, "currentPassword"),
          password: field(f, "password"),
        });
        setUser(null);
        setMode("login");
        setNotice("Şifren değiştirildi. Yeniden giriş yap.");
      }
      if (mode === "reset") {
        await api("/auth/reset", {
          code: params.get("oobCode"),
          password: field(f, "password"),
        });
        setMode("login");
        setNotice("Şifren yenilendi.");
      }
      if (mode === "verify") {
        await api("/auth/verify", { code: params.get("oobCode") });
        setMode("login");
        setNotice("E-posta adresin doğrulandı.");
      }
    });
  }
  const brand = (
    <span className="brand">
      <Orbit size={22} />
      <span>STARBASE</span>
    </span>
  );
  const status = (
    <>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="message" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
    </>
  );
  if (loading)
    return (
      <div className="loading">
        {brand}
        <span>Hazırlanıyor</span>
      </div>
    );
  if (!user)
    return (
      <div className="login-page">
        <DesktopHeader
          brand={brand}
          start={<span className="eyebrow">YILDIZ ROKET TAKIMI</span>}
          end={
            <Button
              variant="bare"
              onClick={() => {
                history.pushState(null, "", "/docs");
                location.reload();
              }}
            >
              Geliştiriciler <ArrowUpRight size={14} />
            </Button>
          }
        />
        {path === "/docs" ? (
          <Docs />
        ) : (
          <main className="login-main">
            <section className="intro">
              <span className="eyebrow">BİRLİKTE, DAHA İLERİYE.</span>
              <h1>
                Tek hesap.
                <br />
                Tüm yörüngeler.
              </h1>
              <p>
                Tasarla. Geliştir. Birlikte yüksel.
                <br />
                Yıldız’ın tüm platformları için ortak başlangıç noktan.
              </p>
              <div className="orbital">
                <div />
                <div />
                <div />
                <span>✦</span>
                <i />
              </div>
              <div className="platform-label">
                <span>STARLAB</span>
                <span>YILDIZ ROKET TAKIMI</span>
              </div>
            </section>
            <section className="auth">
              <div className="auth-heading">
                <span className="eyebrow">STARBASE HESABI</span>
                <h2>
                  {
                    {
                      login: "Tekrar hoş geldin.",
                      register: "Yörüngeye katıl.",
                      recover: "Erişimini geri al.",
                      change: "Yeni şifreni belirle.",
                      reset: "Şifreni yenile.",
                      verify: "E-postanı doğrula.",
                    }[mode]
                  }
                </h2>
                <p>
                  {mode === "login"
                    ? "Devam etmek için hesabına giriş yap."
                    : mode === "register"
                      ? "Bir hesapla tüm platformlara bağlan."
                      : "Hesabının güvenliğini birlikte koruyalım."}
                </p>
              </div>
              <form onSubmit={submit}>
                {mode === "register" && (
                  <div className="field-pair">
                    <TextField
                      label="İsim"
                      name="firstName"
                      required
                      autoComplete="given-name"
                    />
                    <TextField
                      label="Soyisim"
                      name="lastName"
                      required
                      autoComplete="family-name"
                    />
                  </div>
                )}
                {["login", "register"].includes(mode) && (
                  <TextField
                    label="Kullanıcı adı"
                    name="username"
                    required
                    autoComplete="username"
                    pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}"
                  />
                )}
                {["register", "recover"].includes(mode) && (
                  <TextField
                    label="E-posta"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                  />
                )}
                {mode === "change" && (
                  <TextField
                    label="Mevcut / geçici şifre"
                    name="currentPassword"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                )}
                {["login", "register", "reset", "change"].includes(mode) && (
                  <TextField
                    label={mode === "change" ? "Yeni şifre" : "Şifre"}
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                )}
                {mode === "login" && (
                  <Button
                    variant="bare"
                    className="forgot"
                    onClick={() => setMode("recover")}
                  >
                    Şifremi unuttum
                  </Button>
                )}
                {status}
                <Button
                  type="submit"
                  variant="primary"
                  loading={busy}
                  className="submit"
                >
                  {
                    {
                      login: "Giriş yap",
                      register: "Hesap oluştur",
                      recover: "Kurtarma e-postası gönder",
                      change: "Şifreyi değiştir",
                      reset: "Şifreyi yenile",
                      verify: "E-postayı doğrula",
                    }[mode]
                  }
                  <ArrowUpRight size={17} />
                </Button>
              </form>
              {mode === "login" && (
                <Button
                  variant="bare"
                  onClick={() =>
                    act(async () => {
                      const form = document.querySelector("form")!;
                      const f = new FormData(form);
                      await api("/auth/resend", {
                        username: f.get("username"),
                        password: f.get("password"),
                      });
                      setNotice(
                        "Bilgiler doğruysa doğrulama e-postası gönderildi.",
                      );
                    })
                  }
                >
                  Doğrulama e-postasını yeniden gönder
                </Button>
              )}
              <div className="auth-bottom">
                {mode === "login" ? (
                  <>
                    Henüz hesabın yok mu?{" "}
                    <Button variant="bare" onClick={() => setMode("register")}>
                      Hesap oluştur <ArrowUpRight size={14} />
                    </Button>
                  </>
                ) : (
                  <Button variant="bare" onClick={() => setMode("login")}>
                    <ArrowLeft size={14} /> Girişe dön
                  </Button>
                )}
              </div>
              <div className="secure-note">
                <Shield size={15} /> Merkezi hesap. Kontrollü erişim.
              </div>
            </section>
          </main>
        )}
        <footer>
          <span>YILDIZ ROKET TAKIMI</span>
          <span>ORTAK BİR HEDEF. TEK BİR BAŞLANGIÇ.</span>
          <span>STARBASE / 01</span>
        </footer>
      </div>
    );
  if (consent)
    return (
      <div className="consent">
        <Panel title={`${consent.name} ile bağlantı kur`}>
          <p>Bu uygulama aşağıdaki profil bilgilerine erişmek istiyor.</p>
          <ul>
            {consent.scopes.map((s: string) => (
              <li key={s}>
                {
                  {
                    profile: "İsim, soyisim ve kullanıcı adı",
                    email: "E-posta ve doğrulama durumu",
                    organization: "Departman ve ekip üyelikleri",
                  }[s]
                }
              </li>
            ))}
          </ul>
          {status}
          <Button
            variant="primary"
            loading={busy}
            onClick={() =>
              act(async () => {
                const r = await api("/authorize", {
                  clientId: consent.id,
                  redirectUri: consent.redirect,
                  scopes: consent.scopes,
                  challenge: consent.challenge,
                  state: consent.state,
                });
                location.assign(r.redirect);
              })
            }
          >
            İzin ver ve devam et <ArrowUpRight size={16} />
          </Button>
          <Button onClick={() => location.assign("/")}>Vazgeç</Button>
        </Panel>
      </div>
    );
  return (
    <div className="workspace">
      <DesktopHeader
        brand={brand}
        start={<span className="eyebrow">HESAP MERKEZİ</span>}
        end={
          <Button
            variant="bare"
            onClick={() =>
              act(async () => {
                await api("/auth/logout", {});
                setUser(null);
              })
            }
          >
            <LogOut size={15} /> Çıkış
          </Button>
        }
      />
      <div className="workspace-body">
        <aside>
          <span className="eyebrow">ÇALIŞMA ALANI</span>
          {[
            { id: "account", name: "Hesabım", icon: Orbit },
            { id: "connections", name: "Bağlı uygulamalar", icon: AppWindow },
            { id: "organization", name: "Departmanlar", icon: Layers },
            { id: "sessions", name: "Oturumlar", icon: KeyRound },
            ...(user.owner || permissions.some((p) => p.endsWith(".manage"))
              ? [
                  { id: "members", name: "Üyeler", icon: Users },
                  { id: "roles", name: "Roller ve izinler", icon: Shield },
                  { id: "applications", name: "Uygulamalar", icon: AppWindow },
                  { id: "audit", name: "İşlem geçmişi", icon: KeyRound },
                ]
              : []),
            { id: "docs", name: "Geliştiriciler", icon: BookOpen },
          ].map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => setTab(n.id)}
            >
              <n.icon size={17} />
              {n.name}
              <ArrowUpRight size={13} />
            </button>
          ))}
          <div className="sidebar-foot">
            YILDIZ ROKET TAKIMI
            <br />
            STARBASE
          </div>
        </aside>
        <main className="content">
          {status}
          {tab === "account" && (
            <>
              <span className="eyebrow">SENİN YÖRÜNGEN</span>
              <h1>Merhaba, {user.firstName}.</h1>
              <p>Hesabın, ekibin ve tüm platformların tek bir yerde.</p>
              <div className="cards">
                <Panel title="Profil">
                  <dl>
                    <dt>Kullanıcı adı</dt>
                    <dd>@{user.username}</dd>
                    <dt>Ad soyad</dt>
                    <dd>
                      {user.firstName} {user.lastName}
                    </dd>
                    <dt>E-posta</dt>
                    <dd>{user.email}</dd>
                    <dt>Hesap</dt>
                    <dd>{user.owner ? "Takım sahibi" : "Üye"}</dd>
                  </dl>
                </Panel>
                <Panel title="Departman ve ekiplerin">
                  {user.memberships?.length ? (
                    user.memberships.map((m: any, i: number) => (
                      <p key={i}>
                        {m.department} / {m.team}
                      </p>
                    ))
                  ) : (
                    <p>Henüz bir ekip atanmamış.</p>
                  )}
                </Panel>
              </div>
              <h2>Platformların</h2>
              <div className="cards">
                {apps.length ? (
                  apps.map((a) => (
                    <Panel key={a.id} title={a.name}>
                      <span>Kayıtlı STARBASE uygulaması</span>
                    </Panel>
                  ))
                ) : (
                  <EmptyState
                    title="Yeni yörüngeler yakında"
                    description="Yönetimin eklediği uygulamalar burada görünecek."
                  />
                )}
              </div>
              <Button
                onClick={() => {
                  setUser(null);
                  setMode("change");
                }}
              >
                <KeyRound size={16} /> Şifre değiştir
              </Button>
            </>
          )}
          {tab === "organization" && (
            <>
              <h1>Departmanlar</h1>
              <p>Birbirine bağlı ekipler. Ortak hedefler.</p>
              <div className="cards">
                {org.departments.map((d: any) => (
                  <Panel key={d.id} title={d.name}>
                    {org.teams
                      .filter((t: any) => t.department_id === d.id)
                      .map((t: any) => (
                        <div className="org-row" key={t.id}>
                          {t.name}
                          <ArrowUpRight size={14} />
                        </div>
                      ))}
                  </Panel>
                ))}
              </div>
              {user.owner && (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act(async () => {
                      await api("/admin/departments", {
                        name: field(f, "name"),
                      });
                      setOrg(await api("/organization"));
                    });
                  }}
                >
                  <TextField name="name" label="Yeni departman" required />
                  <Button type="submit">
                    <Plus size={16} /> Ekle
                  </Button>
                </form>
              )}
              {user.owner && (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act(async () => {
                      await api("/admin/teams", {
                        departmentId: field(f, "departmentId"),
                        name: field(f, "name"),
                      });
                      setOrg(await api("/organization"));
                    });
                  }}
                >
                  <label>
                    Departman
                    <select name="departmentId">
                      {org.departments.map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <TextField name="name" label="Yeni ekip" required />
                  <Button type="submit">
                    <Plus size={16} /> Ekle
                  </Button>
                </form>
              )}
            </>
          )}
          {tab === "sessions" && <Sessions run={act} />}
          {path === "/invite" && (
            <Panel title="Takım daveti">
              <Button
                onClick={() =>
                  act(async () => {
                    await api("/invites/accept", { code: params.get("code") });
                    setNotice("Takıma katıldın.");
                    history.replaceState(null, "", "/");
                  })
                }
              >
                Daveti kabul et
              </Button>
            </Panel>
          )}
          {tab === "members" && (
            <>
              <h1>Üyeler</h1>
              <Invitations run={act} />
              <p>Kişiler, ekipler ve erişimler.</p>
              <div className="table">
                <div className="table-head">
                  <span>ÜYE</span>
                  <span>E-POSTA</span>
                  <span>HESAP</span>
                </div>
                {rows.map((r) => (
                  <button key={r.id} onClick={() => setSelected(r)}>
                    <span>
                      {r.first_name} {r.last_name}
                      <small>@{r.username}</small>
                    </span>
                    <span>{r.email}</span>
                    <span>
                      {r.owner ? "Sahip" : r.disabled ? "Kapalı" : "Üye"}{" "}
                      <ArrowUpRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
              {selected && (
                <Panel title={selected.first_name + " " + selected.last_name}>
                  <AdminUser user={selected} org={org} run={act} />
                  <EditUser user={selected} run={act} />
                  <Fields userId={selected.id} run={act} />
                </Panel>
              )}
            </>
          )}
          {tab === "connections" && (
            <>
              <h1>Bağlı uygulamalar</h1>
              {rows.length ? (
                rows.map((r) => (
                  <Panel key={r.id} title={r.name}>
                    <p>{JSON.parse(r.scopes).join(" · ")}</p>
                    <Button
                      onClick={() =>
                        act(async () => {
                          await api(
                            "/connections/" + r.id,
                            undefined,
                            "DELETE",
                          );
                          setRows(await api("/connections"));
                        })
                      }
                    >
                      Bağlantıyı kaldır
                    </Button>
                  </Panel>
                ))
              ) : (
                <EmptyState
                  title="Henüz bağlantı yok"
                  description="STARBASE ile giriş yaptığın uygulamalar burada görünür."
                />
              )}
            </>
          )}
          {tab === "applications" && (
            <>
              <h1>Uygulamalar</h1>
              <AdminForm kind="app" run={act} />
            </>
          )}
          {tab === "roles" && (
            <>
              <h1>Roller ve izinler</h1>
              <RolesList run={act} />
              <Fields run={act} />
              <AdminForm kind="role" run={act} />
              <AdminForm kind="permission" run={act} />
              <AdminForm kind="assignment" run={act} />
            </>
          )}
          {tab === "audit" && (
            <>
              <h1>İşlem geçmişi</h1>
              {rows.map((r) => (
                <div className="org-row" key={r.id}>
                  <span>
                    {r.action}
                    <small>{r.target}</small>
                  </span>
                  <time>
                    {new Date(r.created_at * 1000).toLocaleString("tr")}
                  </time>
                </div>
              ))}
            </>
          )}
          {tab === "docs" && <Docs />}
        </main>
      </div>
    </div>
  );
}
function AdminUser({ user, org, run }: { user: any; org: any; run: any }) {
  return (
    <div className="admin-forms">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(async () => {
            await api("/admin/memberships", {
              userId: user.id,
              departmentId: String(f.get("team")).split(":")[0],
              teamId: String(f.get("team")).split(":")[1],
            });
          });
        }}
      >
        <label>
          Ekip ata
          <select name="team">
            {org.teams.map((t: any) => (
              <option key={t.id} value={t.department_id + ":" + t.id}>
                {
                  org.departments.find((d: any) => d.id === t.department_id)
                    ?.name
                }{" "}
                / {t.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">Üyelik ekle</Button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(async () => {
            await api("/admin/users/" + user.id + "/password", {
              currentPassword: f.get("currentPassword"),
              ...(f.get("temporaryPassword")
                ? { temporaryPassword: f.get("temporaryPassword") }
                : {}),
            });
          });
        }}
      >
        <TextField
          type="password"
          name="currentPassword"
          label="Senin şifren"
          required
        />
        <TextField
          type="password"
          name="temporaryPassword"
          label="Geçici şifre (boşsa e-posta gönderilir)"
          minLength={12}
        />
        <Button type="submit">Şifreyi sıfırla</Button>
      </form>
    </div>
  );
}
function AdminForm({ kind, run }: { kind: string; run: any }) {
  const specs: Record<string, { title: string; fields: string[] }> = {
    app: {
      title: "Uygulama kaydet",
      fields: ["id", "name", "redirectUri", "origin"],
    },
    role: {
      title: "Rol oluştur",
      fields: ["name", "permissions", "currentPassword"],
    },
    permission: {
      title: "İzin oluştur",
      fields: ["id", "description", "currentPassword"],
    },
    assignment: {
      title: "Rol ata",
      fields: ["userId", "roleId", "currentPassword"],
    },
  };
  const spec = specs[kind];
  return (
    <Panel title={spec.title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const b = Object.fromEntries(new FormData(e.currentTarget));
          run(async () => {
            if (kind === "app")
              await api("/admin/apps", {
                id: b.id,
                name: b.name,
                redirects: [b.redirectUri],
                origins: [b.origin],
                scopes: ["profile", "email", "organization"],
              });
            if (kind === "role")
              await api("/admin/roles", {
                ...b,
                permissions: String(b.permissions)
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
            if (kind === "permission") await api("/admin/permissions", b);
            if (kind === "assignment") await api("/admin/role-assignments", b);
          });
        }}
      >
        {spec.fields.map((f) => (
          <TextField
            key={f}
            name={f}
            label={
              {
                id: "Kimlik",
                name: "Ad",
                redirectUri: "Dönüş adresi",
                origin: "Uygulama adresi",
                permissions: "İzin anahtarları (virgülle)",
                currentPassword: "Senin şifren",
                description: "Açıklama",
                userId: "Kullanıcı kimliği",
                roleId: "Rol kimliği",
              }[f]
            }
            type={f === "currentPassword" ? "password" : "text"}
            required
          />
        ))}
        <Button type="submit">
          Kaydet <Plus size={16} />
        </Button>
      </form>
    </Panel>
  );
}
function Docs() {
  return (
    <article className="docs">
      <span className="eyebrow">GELİŞTİRİCİ MERKEZİ / v0.1</span>
      <h1>
        Bir kez bağlan.
        <br />
        Tüm ekibe ulaş.
      </h1>
      <p>
        STARBASE, uygulamanla kullanıcı arasında ortak bir kimlik katmanı
        sağlar.
      </p>
      <h2>01 / Uygulamanı kaydet</h2>
      <p>
        Yönetim panelinde uygulama kimliğini, tam dönüş adresini ve originini
        tanımla.
      </p>
      <h2>02 / SDK’yı bağla</h2>
      <pre>{`import { Starbase } from '@starbase/sdk';\n\nconst starbase = new Starbase({\n  baseUrl: 'https://starbase.example',\n  clientId: 'starlab',\n  redirectUri: location.origin + '/callback',\n  storage: sessionStorage\n});\n\nawait starbase.login(['profile', 'organization']);`}</pre>
      <h2>03 / Profili al</h2>
      <pre>{`// /callback sayfasında\nconst profile = await starbase.handleCallback();\n\n// Sonraki açılışlarda\nconst currentUser = await starbase.getProfile();`}</pre>
      <h2>04 / Yetkiyi sunucuda doğrula</h2>
      <p>
        Arayüzde bir düğmeyi gizlemek veriyi korumaz. Kaynak API, STARBASE
        tokenını ve gerekli uygulama iznini her istekte kontrol etmelidir.
      </p>
      <p>Ayrıntılı kurulum ve güvenlik sözleşmesi: depodaki docs/ dizini.</p>
      <Button onClick={() => location.assign("/")} variant="bare">
        <ArrowLeft size={16} /> Hesap merkezine dön
      </Button>
    </article>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
