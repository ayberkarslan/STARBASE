import { WorkspaceMenu, ApplicationOrbit } from "./workspace-shell";
import { BoardNotes } from "./board-notes";
import { DeveloperDocs } from "./developer-docs";
import { TeamDirectory, MyApplicationHistory } from "./directory";
import { CreateMember } from "./create-member";
import { OrbitalIdentity } from "./orbital-identity";
import { FormSelect } from "./form-select";
import { Captcha } from "./captcha";
import {
  Invitations,
  EditUser,
  Fields,
  Sessions,
  RolesList,
  AppsList,
  EditOrganization,
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
import "./workspace-shell.css";
import "./board-notes.css";
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
    [tab, setTab] = useState(
      location.pathname === "/docs"
        ? "docs"
        : new URLSearchParams(location.search).get("view") === "sessions"
          ? "sessions"
          : "board",
    ),
    [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [rows, setRows] = useState<any[]>([]),
    [org, setOrg] = useState<any>({ departments: [], teams: [] }),
    [apps, setApps] = useState<any[]>([]),
    [consent, setConsent] = useState<any>(null),
    [selected, setSelected] = useState<any>(null);
  const [memberVerificationUrl, setMemberVerificationUrl] = useState<
    string | null
  >(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
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
    setError("");
    setNotice("");
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
      window.turnstile?.reset();
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
        const registered = await api("/auth/register", {
          username: field(f, "username"),
          password: field(f, "password"),
          email: field(f, "email"),
          firstName: field(f, "firstName"),
          lastName: field(f, "lastName"),
        });
        setVerificationUrl(registered.developmentVerificationUrl ?? null);
        setNotice(
          registered.developmentVerificationUrl
            ? "Yerel test ortamı gerçek e-posta göndermez. Aşağıdaki düğmeyle doğrulayabilirsin."
            : "Doğrulama e-postanı kontrol et.",
        );
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
  useEffect(() => {
    if (consent?.approved) {
      api("/authorize", {
        clientId: consent.id,
        redirectUri: consent.redirect,
        scopes: consent.scopes,
        challenge: consent.challenge,
        state: consent.state,
      })
        .then((r) => location.assign(r.redirect))
        .catch((e) => setError(e.message));
    }
  }, [consent]);
  const brand = (
    <span className="brand">
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
          start={
            <img
              className="team-logo"
              src="/brand/yrt.png"
              alt="Yıldız Roket Takımı"
            />
          }
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
              <span className="eyebrow">YILDIZDAN YILDIZLARA</span>
              <h1>
                Aynı yıldızın
                <br />
                etrafında.
              </h1>
              <p>
                Tek hesap ile tüm platformlara kolay erişim.
                <br />
                Yıldız Roket Takımının tüm yazılım platformları için ortak bir
                erişim alanı.
              </p>
              <OrbitalIdentity />
            </section>
            <section className="auth">
              <div className="auth-heading">
                <span className="eyebrow">STARBASE HESABINA</span>
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
                {mode !== "login" && (
                  <p>
                    {mode === "register"
                      ? "Bir hesapla tüm platformlara bağlan."
                      : "Hesabının güvenliğini birlikte koruyalım."}
                  </p>
                )}
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
                    pattern={"[a-zA-Z0-9][a-zA-Z0-9._\\-]{2,31}"}
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
                {["register", "recover"].includes(mode) && (
                  <Captcha key={mode} />
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
              {mode === "login" &&
                error === messages.email_verification_required && (
                  <Button
                    variant="bare"
                    onClick={() =>
                      act(async () => {
                        const form = document.querySelector("form")!;
                        const f = new FormData(form);
                        const resent = await api("/auth/resend", {
                          username: f.get("username"),
                          password: f.get("password"),
                        });
                        setVerificationUrl(
                          resent.developmentVerificationUrl ?? null,
                        );
                        setNotice(
                          resent.developmentVerificationUrl
                            ? "Yerel doğrulama bağlantın hazır."
                            : "Bilgiler doğruysa doğrulama e-postası gönderildi.",
                        );
                      })
                    }
                  >
                    Doğrulama e-postasını yeniden gönder
                  </Button>
                )}
              {verificationUrl && (
                <Button onClick={() => location.assign(verificationUrl)}>
                  Yerel doğrulama ekranını aç <ArrowUpRight size={14} />
                </Button>
              )}
              <div className="auth-bottom">
                {mode === "login" ? (
                  <>
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
            </section>
          </main>
        )}
        <footer>
          <span>YILDIZ ROKET TAKIMI</span>
        </footer>
      </div>
    );
  if (consent)
    return (
      <div className="consent">
        <Panel title={`${consent.name} ile bağlantı kur`}>
          <p>Bu uygulama aşağıdaki profil bilgilerine erişmek istiyor.</p>
          <p>Uygulama giriş ve çıkışların takım profilinde görünür.</p>
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
        start={
          <WorkspaceMenu>
            <span className="eyebrow">ÇALIŞMA ALANI</span>
            {[
              { id: "board", name: "Pano", icon: Users },
              { id: "directory", name: "Takım dizini", icon: Users },
              { id: "account", name: "Hesabım", icon: Orbit },
              { id: "teams", name: "Ekipler", icon: Layers },
              { id: "connections", name: "Bağlı uygulamalar", icon: AppWindow },
              { id: "organization", name: "Departmanlar", icon: Layers },
              { id: "sessions", name: "Oturumlar", icon: KeyRound },
              ...(user.owner || permissions.some((p) => p.endsWith(".manage"))
                ? [
                    { id: "members", name: "Üyeler", icon: Users },
                    { id: "roles", name: "Roller ve izinler", icon: Shield },
                    {
                      id: "applications",
                      name: "Uygulamalar",
                      icon: AppWindow,
                    },
                    { id: "audit", name: "İşlem geçmişi", icon: KeyRound },
                  ]
                : []),
              { id: "docs", name: "Geliştiriciler", icon: BookOpen },
            ]
              .filter(
                (n) =>
                  user.owner ||
                  !(
                    {
                      members: "users.manage",
                      roles: "roles.manage",
                      applications: "apps.manage",
                      audit: "users.manage",
                    } as Record<string, string>
                  )[n.id] ||
                  permissions.includes(
                    (
                      {
                        members: "users.manage",
                        roles: "roles.manage",
                        applications: "apps.manage",
                        audit: "users.manage",
                      } as Record<string, string>
                    )[n.id],
                  ),
              )
              .map((n) => (
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
          </WorkspaceMenu>
        }
        end={
          <Button
            variant="bare"
            onClick={() =>
              act(async () => {
                await api("/auth/logout", {});
                setUser(null);
                location.assign("/");
              })
            }
          >
            <LogOut size={15} /> Çıkış
          </Button>
        }
      />
      <div className="workspace-body">
        <main
          className={"content" + (tab === "board" ? " canvas-content" : "")}
        >
          {status}
          {tab === "board" && (
            <BoardNotes currentUserId={user.id} teams={org.teams} />
          )}
          {(tab === "directory" || tab === "teams") && (
            <TeamDirectory
              key={tab}
              currentUserId={user.id}
              teamsOnly={tab === "teams"}
            />
          )}
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
              <MyApplicationHistory />
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
                    {user.owner && (
                      <EditOrganization kind="departments" item={d} run={act} />
                    )}
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
              {(user.owner || permissions.includes("organization.manage")) && (
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
              {(user.owner || permissions.includes("organization.manage")) && (
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
                    <FormSelect name="departmentId">
                      {org.departments.map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </FormSelect>
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
              <div className="members-heading">
                <h1>Üyeler</h1>
                <CreateMember
                  org={org}
                  onCreated={async (result) => {
                    setRows((existing) => [result.user, ...existing]);
                    setSelected(result.user);
                    setMemberVerificationUrl(
                      result.developmentVerificationUrl ?? null,
                    );
                    setNotice(
                      result.verificationDelivered
                        ? "Üye oluşturuldu. Doğrulama e-postası gönderildi; ilk girişte şifre değişimi istenecek."
                        : "Üye oluşturuldu; doğrulama e-postası gönderilemedi. Üye giriş ekranından yeniden isteyebilir.",
                    );
                  }}
                />
              </div>
              {memberVerificationUrl && (
                <TextField
                  label="Üyenin yerel test doğrulama bağlantısı"
                  value={memberVerificationUrl}
                  readOnly
                />
              )}
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
              <AppsList run={act} />
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
      <ApplicationOrbit onApplications={() => setTab("connections")} />
    </div>
  );
}
function AdminUser({ user, org, run }: { user: any; org: any; run: any }) {
  const [memberships, setMemberships] = useState<any[]>([]);
  const refresh = () =>
    api("/admin/users/" + user.id).then((u) => setMemberships(u.memberships));
  useEffect(() => {
    refresh().catch(() => {});
  }, [user.id]);
  return (
    <div className="admin-forms">
      {memberships.map((m) => (
        <div className="org-row" key={m.team_id}>
          <span>
            {m.department} / {m.team}
          </span>
          <Button
            onClick={() =>
              run(async () => {
                await api(
                  "/admin/memberships",
                  {
                    userId: user.id,
                    departmentId: m.department_id,
                    teamId: m.team_id,
                  },
                  "DELETE",
                );
                await refresh();
              })
            }
          >
            Üyeliği kaldır
          </Button>
        </div>
      ))}
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
          <FormSelect name="team">
            {org.teams.map((t: any) => (
              <option key={t.id} value={t.department_id + ":" + t.id}>
                {
                  org.departments.find((d: any) => d.id === t.department_id)
                    ?.name
                }{" "}
                / {t.name}
              </option>
            ))}
          </FormSelect>
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
  return <DeveloperDocs />;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
