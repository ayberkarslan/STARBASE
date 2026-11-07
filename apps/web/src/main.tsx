import {
  WorkspaceMenu,
  WorkspaceStarfield,
  ApplicationOrbit,
} from "./workspace-shell";
import { BoardNotes } from "./board-notes";
import { DeveloperDocs } from "./developer-docs";
import { ApplicationDetail } from "./application-detail";
import { TeamDirectory, MyApplicationHistory } from "./directory";
import { CreateMember } from "./create-member";
import { OrbitalIdentity } from "./orbital-identity";
import { FormSelect } from "./form-select";
import { memberStatus, memberStatusLabel } from "./member-status";
import { invalidateDirectory, subscribeDirectoryChanges } from "./member-live";
import { Captcha } from "./captcha";
import { AdminActivity } from "./admin-activity";
import { PasswordField } from "./password-field";
import { compactPatch } from "./image-upload";
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
  Drawer,
  SelectMenu,
  StartupScreen,
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
  Clock3,
} from "lucide-react";
import "@stardrop/ui/styles.css";
import "./style.css";
import "./workspace-shell.css";
import "./board-notes.css";
let resolveStartupReady: (() => void) | undefined;
const startupReady = new Promise<void>((resolve) => {
  resolveStartupReady = resolve;
});
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
  if ((method ?? (body ? "POST" : "GET")) !== "GET" && /^\/admin\/(users|memberships|profile-values\/)/.test(path)) invalidateDirectory();
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
      location.pathname === "/account"
        ? "account"
        : location.pathname === "/docs"
        ? "docs"
        : new URLSearchParams(location.search).get("view") === "sessions"
          ? "account"
          : "board",
    ),
    [boardScope, setBoardScope] = useState<"home" | "private" | "shared">(
      () => (localStorage.getItem("starbase.board.default") as "home" | "private" | "shared") || "home",
    ),
    [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [rows, setRows] = useState<any[]>([]),
    [org, setOrg] = useState<any>({ departments: [], teams: [] }),
    [apps, setApps] = useState<any[]>([]),
    [applicationBrand, setApplicationBrand] = useState<{
      id: string;
      name: string;
      logoUrl: string;
    } | null>(null),
    [consent, setConsent] = useState<any>(null),
    [selected, setSelected] = useState<any>(null);
  const [memberVerificationUrl, setMemberVerificationUrl] = useState<
    string | null
  >(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<string | null>(null);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
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
      resolveStartupReady?.();
      resolveStartupReady = undefined;
    }
  }
  useEffect(() => {
    load();
    if (path === "/action") {
      setMode(params.get("mode") === "resetPassword" ? "reset" : "verify");
    }
  }, []);
  useEffect(() => {
    api("/apps").then(setApps).catch(() => {});
  }, []);
  useEffect(() => {
    if (path !== "/authorize") return;
    const clientId = params.get("client_id");
    const redirectUri = params.get("redirect_uri");
    if (!clientId || !redirectUri) return;
    const query = new URLSearchParams({ redirectUri });
    api(`/apps/${encodeURIComponent(clientId)}/branding?${query}`)
      .then(setApplicationBrand)
      .catch(() => setApplicationBrand(null));
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
  }, [user?.id]);
  useEffect(() => {
    if (!user?.id) return;
    return subscribeDirectoryChanges(() => setDirectoryRevision((value) => value + 1));
  }, [user?.id]);
  useEffect(() => {
    if (!user?.id || directoryRevision === 0) return;
    api("/me").then(setUser).catch(() => {});
    api("/permissions").then(setPermissions).catch(() => {});
    api("/organization").then(setOrg).catch(() => {});
    if (tab === "members") {
      api("/admin/users").then(setRows).catch(() => {});
      if (selected?.id) api("/admin/users/" + selected.id).then(setSelected).catch(() => {});
    }
  }, [directoryRevision]);
  useEffect(() => {
    setError("");
    setNotice("");
    setRows([]);
    setSelected(null);
    if (!user) return;
    const p =
      tab === "members"
        ? "/admin/users"
        : null;
    if (p)
      api(p)
        .then(setRows)
        .catch((e) => setError(messages[e.message] ?? e.message));
  }, [tab, user?.id]);
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
  async function updatePhoto(file?: File) {
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const image = file ? await compactPatch(file) : null;
      const response = await fetch("/api/v1/me/photo", {
        method: image ? "POST" : "DELETE",
        ...(image ? { headers: { "Content-Type": image.type }, body: image } : {}),
      });
      const result: any = await response.json();
      if (!response.ok) throw new Error(result.error?.code ?? "Fotoğraf kaydedilemedi.");
      setUser((current: any) => ({ ...current, photoUrl: result.photoUrl ?? "" }));
      invalidateDirectory();
    } catch (cause) {
      setPhotoError((cause as Error).message);
    } finally { setPhotoBusy(false); }
  }
  function field(form: FormData, k: string) {
    return String(form.get(k) ?? "");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await act(async () => {
      if (["register", "change", "reset"].includes(mode) && field(f, "password") !== field(f, "passwordConfirm"))
        throw new Error("Şifreler eşleşmiyor.");
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
    <button
      type="button"
      className="brand workspace-home"
      aria-label="STARBASE panoya dön"
      onClick={() => {
        setTab("board");
        setBoardScope((localStorage.getItem("starbase.board.default") as "home" | "private" | "shared") || "home");
      }}
    >
      <img src="/brand/yrt.png" alt="" />
      <span>STARBASE</span>
    </button>
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
              <OrbitalIdentity apps={apps} activeApp={applicationBrand} />
            </section>
            <section className="auth">
              {applicationBrand && (
                <div className="application-login-brand">
                  <div className="app-brand-badge">
                    {applicationBrand.logoUrl ? (
                      <img
                        src={applicationBrand.logoUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    ) : (
                      <AppWindow size={24} aria-hidden="true" />
                    )}
                  </div>
                  <span>
                    <span className="app-brand-status">

                      <small>GİRİŞ YAPILAN UYGULAMA</small>
                    </span>
                    <strong>{applicationBrand.name}</strong>
                    <span className="app-brand-caption">
                      Starbase merkezi oturumu ile bağlanılıyor
                    </span>
                  </span>
                </div>
              )}
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
                  <PasswordField
                    label="Mevcut / geçici şifre"
                    name="currentPassword"
                    required
                    autoComplete="current-password"
                  />
                )}
                {["login", "register", "reset", "change"].includes(mode) && (
                  <PasswordField
                    label={mode === "change" ? "Yeni şifre" : "Şifre"}
                    name="password"
                    required
                    minLength={12}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                )}
                {["register", "change", "reset"].includes(mode) && <PasswordField label="Şifre tekrarı" name="passwordConfirm" required minLength={12} autoComplete="new-password" />}
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
      <WorkspaceStarfield />
      <DesktopHeader
        brand={brand}
        start={
          <WorkspaceMenu>
            {[
              { id: "board", name: "Pano", icon: Users },
              { id: "directory", name: "Takım dizini", icon: Users },
              { id: "account", name: "Hesabım", icon: Orbit },
              { id: "teams", name: "Departmanlar", icon: Layers },
              { id: "applications", name: "Uygulamalar", icon: AppWindow },
              ...(user.owner || permissions.some((p) => p.endsWith(".manage"))
                ? [
                    { id: "members", name: "Üyeler", icon: Users },
                    { id: "activity", name: "Erişim geçmişi", icon: Clock3 },
                    { id: "roles", name: "Roller ve izinler", icon: Shield },
                    { id: "application_management", name: "Uygulama yönetimi", icon: AppWindow },
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
                      activity: "users.manage",
                      roles: "roles.manage",
                      application_management: "apps.manage",
                    } as Record<string, string>
                  )[n.id] ||
                  permissions.includes(
                    (
                      {
                        members: "users.manage",
                        roles: "roles.manage",
                        application_management: "apps.manage",
                        audit: "users.manage",
                      } as Record<string, string>
                    )[n.id],
                  ),
              )
              .map((n) => (
                <button
                  key={n.id}
                  className={tab === n.id ? "active" : ""}
                  onClick={() => { if (n.id === "applications") setSelectedApplication(null); setTab(n.id); }}
                >
                  <n.icon size={17} />
                  {n.name}
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
            <BoardNotes
              currentUserId={user.id}
              teams={org.teams}
              scope={boardScope}
              onScopeChange={setBoardScope}
            />
          )}
          {(tab === "directory" || tab === "teams") && (
            <TeamDirectory
              key={tab}
              revision={directoryRevision}
              currentUserId={user.id}
              teamsOnly={tab === "teams"}
              canManageOrganization={user.owner || permissions.includes("organization.manage")}
            />
          )}
          {tab === "account" && (
            <section className="profile-page">
              <div className="profile-hero">
                <span className="member-initials" aria-hidden="true">{user.photoUrl ? <img src={user.photoUrl} alt="" /> : <>{user.firstName?.[0]}{user.lastName?.[0]}</>}</span>
                <div><span className="eyebrow">STARBASE PROFİLİ</span><h1>{user.firstName} {user.lastName}</h1><p>@{user.username} · {user.owner ? "Takım sahibi" : "Yıldız Roket Takımı"}</p></div>
              </div>
              <div className="profile-photo-actions">
                <label className="profile-photo-upload">{photoBusy ? "Yükleniyor…" : user.photoUrl ? "Fotoğrafı değiştir" : "Profil fotoğrafı ekle"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={photoBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void updatePhoto(file); event.target.value = ""; }} /></label>
                {user.photoUrl && <Button variant="bare" disabled={photoBusy} onClick={() => void updatePhoto()}>Fotoğrafı kaldır</Button>}
                {photoError && <span className="member-form-feedback is-error" role="alert">{photoError}</span>}
              </div>
              <div className="profile-grid">
                <Panel title="Hesap bilgileri">
                  <dl>
                    <dt>Kullanıcı adı</dt>
                    <dd>@{user.username}</dd>
                    <dt>Ad soyad</dt>
                    <dd>
                      {user.firstName} {user.lastName}
                    </dd>
                    <dt>E-posta</dt>
                    <dd>{user.email}</dd>
                  </dl>
                </Panel>
                <Panel title="Departman ve ekipler">
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
              <MyApplicationHistory onSelectApplication={(id) => { setSelectedApplication(id); setTab("applications"); }} />
              <Sessions run={act} compact />
              <Button
                onClick={() => {
                  setUser(null);
                  setMode("change");
                }}
              >
                <KeyRound size={16} /> Şifre değiştir
              </Button>
            </section>
          )}
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
                      result.verificationSkipped
                        ? "Üye oluşturuldu ve e-postası yönetici tarafından onaylandı. İlk girişte geçici şifresini değiştirecek."
                        : result.verificationDelivered
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
                  <span>DURUM</span>
                </div>
                {rows.map((r) => (
                  <button key={r.id} onClick={() => setSelected(r)}>
                    <span>
                      {r.first_name} {r.last_name}
                      <small>@{r.username}</small>
                    </span>
                    <span>{r.email}</span>
                    <span>
                      <span className={`member-state member-state--${memberStatus(r)}`}>{memberStatusLabel[memberStatus(r)]}</span>
                      {r.owner && <small>Sahip</small>}{" "}
                      <ArrowUpRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
              <Drawer
                open={!!selected}
                onClose={() => setSelected(null)}
                title={selected ? selected.first_name + " " + selected.last_name : "Üye"}
                eyebrow={selected ? "@" + selected.username + " · ÜYE YÖNETİMİ" : "ÜYE YÖNETİMİ"}
                className="admin-member-drawer"
              >
              {selected && (
                <div className="admin-member-sheet">
                  <div className="admin-member-sheet__identity">
                    <span>{selected.avatar_url && !selected.disabled ? <img src={`/api/v1/directory/users/${encodeURIComponent(selected.id)}/photo?v=${selected.avatar_version}`} alt="" /> : <>{selected.first_name?.[0]}{selected.last_name?.[0]}</>}</span>
                    <div><strong>{selected.first_name} {selected.last_name}</strong><small>{selected.email}</small></div>
                  </div>
                  <details className="member-security">
                    <summary>Erişim geçmişi <span>STARBASE ve uygulamalar</span></summary>
                    <AdminActivity key={selected.id} userId={selected.id} />
                  </details>
                  <EditUser key={selected.id} user={selected} onUpdated={(updated) => {
                    setSelected(updated);
                    setRows((current) => current.map((item) => item.id === updated.id ? updated : item));
                  }} />
                  <AdminUser key={selected.id} user={selected} org={org} revision={directoryRevision} />
                  <Fields key={selected.id} userId={selected.id} run={act} revision={directoryRevision} />
                </div>
              )}
              </Drawer>
            </>
          )}
          {tab === "activity" && <AdminActivity />}
          {tab === "applications" && (
            selectedApplication ? <ApplicationDetail id={selectedApplication} onBack={() => setSelectedApplication(null)} /> : <>
              <span className="eyebrow">STARBASE SHOWROOM</span><h1>Uygulamalar</h1>
              <p>Yıldız Roket Takımının ortak hesabıyla çalışan platformlar.</p>
              <div className="application-showroom">{apps.map((app) => <Panel className="app-showcase-card" key={app.id} title={app.name}><button type="button" className="app-showcase-hit" onClick={() => setSelectedApplication(app.id)} aria-label={`${app.name} uygulama sayfasını aç`} /><div className="app-showcase-logo">{app.logoUrl ? <img src={app.logoUrl} alt="" /> : <AppWindow size={26} />}</div><div className="app-showcase-actions"><span>STARBASE ile giriş</span>{app.launchUrl ? <a className="sd-button sd-button--secondary sd-button--md" href={app.launchUrl}>{app.launchUrl.startsWith("https:") ? "Uygulamayı aç" : "Yüklüyse aç"} <ArrowUpRight size={15} /></a> : <small>Geliştiriliyor</small>}</div><ArrowUpRight className="app-showcase-corner" size={22} aria-hidden="true" /></Panel>)}</div>
            </>
          )}
          {tab === "application_management" && (user.owner || permissions.includes("apps.manage")) && (
            <section className="application-management">
              <span className="eyebrow">STARBASE YÖNETİMİ</span>
              <h1>Uygulama yönetimi</h1>
              <p>Uygulama adları, logoları ve erişim durumları.</p>
              <Button variant="bare" onClick={() => { setSelectedApplication(null); setTab("applications"); }}>Uygulama vitrinine dön <ArrowUpRight size={15} /></Button>
              <AppsList run={act} onChanged={() => api("/apps").then(setApps)} />
            </section>
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
          {tab === "docs" && <Docs />}
        </main>
      </div>
      <ApplicationOrbit apps={apps} onApplications={() => { setSelectedApplication(null); setTab("applications"); }} />
    </div>
  );
}
function AdminUser({ user, org, revision }: { user: any; org: any; revision: number }) {
  const [memberships, setMemberships] = useState<any[]>([]);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const perform = async (action: () => Promise<void>, success: string) => {
    setWorking(true);
    setFeedback(null);
    try { await action(); setFeedback({ text: success, error: false }); }
    catch (cause) {
      const code = (cause as Error).message;
      setFeedback({ text: code === "reauthentication_required" ? "Bu işlem için şifreni gir. Doğrulama 10 dakika geçerli." : "İşlem tamamlanamadı: " + code, error: true });
    } finally { setWorking(false); }
  };
  const refresh = () =>
    api("/admin/users/" + user.id).then((u) => setMemberships(u.memberships));
  useEffect(() => {
    refresh().catch(() => {});
  }, [user.id, revision]);
  return (
    <div className="admin-forms">
      <h3>Ekip üyelikleri</h3>
      {memberships.map((m) => (
        <div className="org-row" key={m.team_id}>
          <span>
            {m.department} / {m.team}
          </span>
          <Button
            disabled={working}
            onClick={() =>
              void perform(async () => {
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
              }, "Üyelik kaldırıldı.")
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
          void perform(async () => {
            await api("/admin/memberships", {
              userId: user.id,
              departmentId: String(f.get("team")).split(":")[0],
              teamId: String(f.get("team")).split(":")[1],
            });
            await refresh();
          }, "Üyelik eklendi.");
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
        <Button type="submit" disabled={working || !org.teams.length}>Üyelik ekle</Button>
      </form>
      <details className="member-security member-password">
        <summary>Şifre kurtarma <span>Gerekirse kullan</span></summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void perform(async () => {
            await api("/admin/users/" + user.id + "/password", {
              currentPassword: String(f.get("currentPassword") || ""),
              ...(f.get("temporaryPassword")
                ? { temporaryPassword: f.get("temporaryPassword") }
                : {}),
            });
          }, "Şifre kurtarma işlemi başlatıldı.");
        }}
      >
        <PasswordField
          name="currentPassword"
          label="Senin şifren"
          hint="İlk güvenlik işleminde gir; 10 dakika boyunca tekrar gerekmez."
        />
        <PasswordField
          name="temporaryPassword"
          label="Geçici şifre (boşsa e-posta gönderilir)"
          minLength={12}
        />
        <Button type="submit" disabled={working}>Şifreyi sıfırla</Button>
      </form>
      </details>
      {feedback && <p className={feedback.error ? "member-form-feedback is-error" : "member-form-feedback"} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
    </div>
  );
}
function AdminForm({ kind, run }: { kind: string; run: any }) {
  const specs: Record<string, { title: string; fields: string[] }> = {
    app: {
      title: "Uygulama kaydet",
         fields: ["id", "name", "redirectUri", "origin", "launchUrl"],
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
                redirects: String(b.redirectUri).split(",").map((s) => s.trim()).filter(Boolean),
                origins: String(b.origin).split(",").map((s) => s.trim()).filter(Boolean),
                scopes: ["profile", "email", "organization"],
                launchUrl: b.launchUrl,
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
          f === "currentPassword" ? <PasswordField
            key={f}
            name={f}
            label="Senin şifren"
            required
          /> : <TextField
            key={f}
            name={f}
            label={
              {
                id: "Kimlik",
                name: "Ad",
                redirectUri: "Dönüş adresi",
                origin: "Uygulama adresi",
                launchUrl: "Açma adresi (isteğe bağlı)",
                permissions: "İzin anahtarları (virgülle)",
                currentPassword: "Senin şifren",
                description: "Açıklama",
                userId: "Kullanıcı kimliği",
                roleId: "Rol kimliği",
              }[f]
            }
            type="text"
            hint={
              f === "logoUrl"
                ? "İsteğe bağlı HTTPS logo görseli; uygulama adresinde barınmalı."
                : undefined
            }
            required={f !== "logoUrl" && f !== "launchUrl"}
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
    <StartupScreen
      brand="STARBASE"
      logo="/brand/yrt.png"
      prepare={() => startupReady}
    >
      <App />
    </StartupScreen>
  </React.StrictMode>,
);
