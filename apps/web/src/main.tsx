import {
  WorkspaceMenu,
  WorkspaceStarfield,
} from "./workspace-shell";
import { WorkspaceHome } from "./workspace-home";
import { FileSharing } from "./file-sharing";
import { Notifications, type StarbaseNotification } from "./notifications";
import { CommandPalette } from "./command-palette";
import { DeveloperDocs } from "./developer-docs";
import { ApplicationDetail } from "./application-detail";
import { TeamDirectory, MemberProfilePage, MyApplicationHistory } from "./directory";
import { CreateMember } from "./create-member";
import { OrbitalIdentity } from "./orbital-identity";
import { AuthStarfield } from "./auth-starfield";
import { FormSelect } from "./form-select";
import { memberStatus, memberStatusLabel } from "./member-status";
import { invalidateDirectory, subscribeDirectoryChanges, subscribeShareChanges } from "./member-live";
import { Captcha } from "./captcha";
import { AdminActivity } from "./admin-activity";
import { PasswordField } from "./password-field";
import { PhotoCrop } from "./photo-crop";
import {
  Invitations,
  EditUser,
  Fields,
  Sessions,
  RolesList,
  AppsList,
  EditOrganization,
} from "./management";
import { BadgeList, BadgesManager, type Badge } from "./badges";
import { AvatarZoomProvider, useAvatarZoom } from "./avatar-zoom";
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
  Camera,
  Trash2,
  House,
  Share2,
} from "lucide-react";
import "@stardrop/ui/styles.css";
import "./style.css";
import "./workspace-shell.css";
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
  registration_disabled: "Platformumuz atölyeye özeldir; yeni üye kaydı yalnızca yöneticiler tarafından yapılabilir.",
  password_change_required: "Devam etmeden önce şifreni değiştir.",
  authentication_required: "Önce giriş yap.",
  permission_denied: "Bu işlem için yetkin bulunmuyor.",
  service_unavailable: "Servise şu anda ulaşılamıyor.",
  try_later: "Çok fazla deneme. Biraz sonra tekrar dene.",
};
function App() {
  const { registerHover, cancelHover } = useAvatarZoom();
  const [user, setUser] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState(
      /^\/profiles\/[a-zA-Z0-9_-]+$/.test(location.pathname)
        ? "profile"
        : location.pathname === "/account"
        ? "account"
        : location.pathname === "/docs"
        ? "docs"
        : new URLSearchParams(location.search).get("view") === "sessions"
          ? "account"
          : "home",
    ),
    [paletteOpen, setPaletteOpen] = useState(false),
    [profileId, setProfileId] = useState(() => /^\/profiles\/[a-zA-Z0-9_-]+$/.test(location.pathname) ? location.pathname.split("/")[2] : ""),
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
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);
  const [shareOpenRoomId, setShareOpenRoomId] = useState<string | null>(null);
  const [shareOpenNonce, setShareOpenNonce] = useState(0);
  const [notifications, setNotifications] = useState<StarbaseNotification[]>([]);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const loadBadges = async () => {
    try {
      setAllBadges(await api("/badges"));
    } catch {}
  };
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
    if (user) loadBadges();
  }, [user?.id]);
  useEffect(() => {
    api("/apps")
      .then(setApps)
      .catch(() => {});
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
  async function updatePhoto(image?: Blob) {
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const response = await fetch("/api/v1/me/photo", {
        method: image ? "POST" : "DELETE",
        ...(image ? { headers: { "Content-Type": image.type }, body: image } : {}),
      });
      const result: any = await response.json();
      if (!response.ok) throw new Error(result.error?.code ?? "Fotoğraf kaydedilemedi.");
      setUser((current: any) => ({ ...current, photoUrl: result.photoUrl ?? "" }));
      invalidateDirectory();
      return true;
    } catch (cause) {
      setPhotoError((cause as Error).message);
      return false;
    } finally { setPhotoBusy(false); }
  }
  function field(form: FormData, k: string) {
    return String(form.get(k) ?? "");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await act(async () => {
      if (["change", "reset"].includes(mode) && field(f, "password") !== field(f, "passwordConfirm"))
        throw new Error("Şifreler eşleşmiyor.");
      if (mode === "login") {
        const r = await api("/auth/login", {
          username: field(f, "username"),
          password: field(f, "password"),
        });
        if (r.passwordChangeRequired) setMode("change");
        else await load();
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
      aria-label="STARBASE ana sayfaya dön"
      onClick={() => setTab("home")}
    >
      <img src="/brand/yrt.png" alt="" />
      <span>STARBASE</span>
    </button>
  );
  const canBrowseDirectory = Boolean(user?.owner || user?.roles?.length || user?.memberships?.length);
  useEffect(() => {
    if (!user?.id || !canBrowseDirectory) { setNotifications([]); setNotificationUnread(0); return; }
    let active = true;
    const refresh = () => { api("/notifications").then((data: { notifications: StarbaseNotification[]; unreadCount: number }) => { if (active) { setNotifications(data.notifications); setNotificationUnread(data.unreadCount); } }).catch(() => {}); };
    refresh();
    const unsubscribe = subscribeShareChanges(refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; unsubscribe(); window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [user?.id, canBrowseDirectory]);
  const openNotification = (item: StarbaseNotification) => {
    setNotifications((before) => before.map((entry) => entry.id === item.id ? { ...entry, readAt: entry.readAt ?? Math.floor(Date.now() / 1000) } : entry));
    if (!item.readAt) setNotificationUnread((count) => Math.max(0, count - 1));
    void api(`/notifications/${item.id}/read`, {}).catch(() => {});
    setShareTarget(null);
    setShareOpenRoomId(item.resourceId);
    setShareOpenNonce((nonce) => nonce + 1);
    setTab("sharing");
  };
  const readAllNotifications = () => {
    setNotifications((before) => before.map((item) => ({ ...item, readAt: item.readAt ?? Math.floor(Date.now() / 1000) })));
    setNotificationUnread(0);
    void api("/notifications/read-all", {}).catch(() => {});
  };
  const canManage = (permission: string) => Boolean(user?.owner || permissions.includes(permission));
  const canViewDocs = Boolean(user?.owner || user?.roles?.some((role: { id: string }) => role.id === "admin"));
  useEffect(() => {
    if (user && tab === "docs" && !canViewDocs) setTab("home");
  }, [user, tab, canViewDocs]);
  const navigation = [
    { id: "home", name: "Ana sayfa", icon: House },
    { id: "applications", name: "Uygulamalar", icon: AppWindow },
    ...(canBrowseDirectory ? [
      { id: "directory", name: "Takım", icon: Users },
      { id: "teams", name: "Departmanlar", icon: Layers },
      { id: "sharing", name: "Dosya Paylaşımı", icon: Share2 },
    ] : []),
    { id: "account", name: "Hesabım", icon: Orbit },
    ...(canManage("users.manage") ? [
      { id: "members", name: "Üyeler", icon: Users },
      { id: "activity", name: "Erişim geçmişi", icon: Clock3 },
    ] : []),
    ...(canManage("roles.manage") ? [{ id: "roles", name: "Roller ve izinler", icon: Shield }] : []),
    ...(canManage("apps.manage") ? [{ id: "application_management", name: "Uygulama yönetimi", icon: AppWindow }] : []),
    ...(canViewDocs ? [{ id: "docs", name: "Geliştiriciler", icon: BookOpen }] : []),
  ];
  const shortcuts = navigation.filter((item) => !["home", "applications", "teams"].includes(item.id));
  const openPage = (id: string) => {
    if (id === "applications") setSelectedApplication(null);
    setShareTarget(null);
    setShareOpenRoomId(null);
    if (tab === "profile") history.pushState({}, "", "/");
    setTab(id);
  };
  const openApplication = (id: string) => { setSelectedApplication(id); setTab("applications"); };
  const openMember = (id: string) => {
    setProfileId(id);
    history.pushState({}, "", `/profiles/${encodeURIComponent(id)}`);
    setTab("profile");
  };
  useEffect(() => {
    const restore = () => {
      const match = location.pathname.match(/^\/profiles\/([a-zA-Z0-9_-]+)$/);
      if (match) { setProfileId(match[1]); setTab("profile"); }
      else if (tab === "profile") setTab("home");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [tab]);
  useEffect(() => {
    if (!user?.id) return;
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [user?.id]);
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
        <AuthStarfield />
        <DesktopHeader
          brand={brand}
          start={
            <img
              className="team-logo"
              src="/brand/yrt.png"
              alt="Yıldız Roket Takımı"
            />
          }
        />
        <main className="login-main">
            <section className="intro">
              <span className="eyebrow">YILDIZDAN YILDIZLARA</span>
              <h1>
                Aynı yıldızın
                <br />
                etrafında.
              </h1>
              <OrbitalIdentity apps={apps} activeApp={applicationBrand} />
            </section>
            <section className="auth">
              <div className="auth-heading">
                <span className="eyebrow">STARBASE HESABINA</span>
                <h2>
                  {
                    {
                      login: "Tekrar hoş geldin.",
                      recover: "Erişimini geri al.",
                      change: "Yeni şifreni belirle.",
                      reset: "Şifreni yenile.",
                      verify: "E-postanı doğrula.",
                    }[mode] || "Tekrar hoş geldin."
                  }
                </h2>
                {mode !== "login" && (
                  <p>Hesabının güvenliğini birlikte koruyalım.</p>
                )}
              </div>
              <form onSubmit={submit}>
                {mode === "login" && (
                  <TextField
                    label="Kullanıcı adı"
                    name="username"
                    required
                    autoComplete="username"
                    pattern={"[a-zA-Z0-9][a-zA-Z0-9._\\-]{2,31}"}
                  />
                )}
                {mode === "recover" && (
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
                {["login", "reset", "change"].includes(mode) && (
                  <PasswordField
                    label={mode === "change" ? "Yeni şifre" : "Şifre"}
                    name="password"
                    required
                    minLength={8}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                )}
                {["change", "reset"].includes(mode) && (
                  <PasswordField
                    label="Şifre tekrarı"
                    name="passwordConfirm"
                    required
                    minLength={8}
                    autoComplete="new-password"
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
                {mode === "recover" && (
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
                      recover: "Kurtarma e-postası gönder",
                      change: "Şifreyi değiştir",
                      reset: "Şifreyi yenile",
                      verify: "E-postayı doğrula",
                    }[mode] || "Giriş yap"
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
                {mode !== "login" && (
                  <Button variant="bare" onClick={() => setMode("login")}>
                    <ArrowLeft size={14} /> Girişe dön
                  </Button>
                )}
              </div>
            </section>
        </main>
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
            {navigation.map((n) => (
                <button
                  key={n.id}
                  className={tab === n.id ? "active" : ""}
                  onClick={() => openPage(n.id)}
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
          <div className="workspace-header-actions">
            {canBrowseDirectory && <Notifications items={notifications} unreadCount={notificationUnread} onOpen={openNotification} onReadAll={readAllNotifications} />}
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
          </div>
        }
      />
      <div className="workspace-body">
        <main className="content">
          {status}
          {tab === "home" && <WorkspaceHome name={user.firstName || user.username} apps={apps} shortcuts={shortcuts} shareInviteCount={notificationUnread} onPage={openPage} onApplication={openApplication} onSearch={() => setPaletteOpen(true)} />}
          {tab === "sharing" && canBrowseDirectory && <FileSharing currentUserId={user.id} profileTarget={shareTarget} initialRoomId={shareOpenRoomId} initialRoomNonce={shareOpenNonce} onBack={() => { setShareTarget(null); setShareOpenRoomId(null); setTab("home"); }} />}
          {(tab === "directory" || tab === "teams") && (
            <TeamDirectory
              key={tab}
              revision={directoryRevision}
              currentUserId={user.id}
              teamsOnly={tab === "teams"}
              onOpenProfile={openMember}
              canManageOrganization={user.owner || permissions.includes("organization.manage")}
            />
          )}
          {tab === "profile" && profileId && <MemberProfilePage id={profileId} revision={directoryRevision} onBack={() => { history.pushState({}, "", "/"); setTab("directory"); }} onEdit={profileId === user.id ? () => { history.pushState({}, "", "/account"); setTab("account"); } : undefined} onStartShare={profileId === user.id ? undefined : (name) => { history.pushState({}, "", "/"); setShareOpenRoomId(null); setShareTarget({ id: profileId, name }); setTab("sharing"); }} />}
          {tab === "account" && (
            <section className="profile-page">
              <div className="profile-hero">
                <div
                  className="profile-avatar-wrap"
                  onPointerEnter={() => {
                    registerHover({
                      name: `${user.firstName} ${user.lastName}`,
                      username: user.username,
                      photoUrl: user.photoUrl,
                      badges: user.badges,
                      subtitle:
                        user.customTitle ||
                        (user.username === "ayberkarslan"
                          ? "Geliştirici Hesabı"
                          : user.owner
                          ? "Takım sahibi"
                          : "Yıldız Roket Takımı"),
                    });
                  }}
                  onPointerLeave={cancelHover}
                >
                  <label
                    className="profile-avatar-interactive"
                    title={user.photoUrl ? "Fotoğrafı değiştirmek için tıkla" : "Profil fotoğrafı ekle"}
                  >
                    <span className="member-initials" aria-hidden="true">
                      {user.photoUrl ? <img src={user.photoUrl} alt="" /> : <>{user.firstName?.[0]}{user.lastName?.[0]}</>}
                    </span>
                    <span className="profile-avatar-overlay">
                      <Camera size={18} />
                      <small>{photoBusy ? "…" : "Değiştir"}</small>
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={photoBusy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) setCropFile(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {user.photoUrl && (
                    <button
                      type="button"
                      className="profile-avatar-delete"
                      disabled={photoBusy}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void updatePhoto();
                      }}
                      title="Profil fotoğrafını kaldır"
                      aria-label="Profil fotoğrafını kaldır"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div>
                  <span className="eyebrow">STARBASE PROFİLİ</span>
                  <h1>{user.firstName} {user.lastName}</h1>
                  <p>@{user.username} · {user.customTitle || (user.username === "ayberkarslan" ? "Geliştirici Hesabı" : (user.owner ? "Takım sahibi" : "Yıldız Roket Takımı"))}</p>
                  <Button variant="bare" onClick={() => openMember(user.id)}>Profilimi görüntüle <ArrowUpRight size={14} /></Button>
                  {user.badges?.length ? (
                    <div style={{ marginTop: "10px" }}>
                      <BadgeList badges={user.badges} size="md" />
                    </div>
                  ) : null}
                  {photoError && (
                    <span className="member-form-feedback is-error" style={{ display: "inline-block", marginTop: "6px" }} role="alert">
                      {photoError}
                    </span>
                  )}
                </div>
              </div>
              {cropFile && <PhotoCrop file={cropFile} onClose={() => setCropFile(null)} onSave={async (image) => {
                if (!(await updatePhoto(image))) throw new Error("Fotoğraf kaydedilemedi.");
              }} />}
              <div className="profile-grid">
                <Panel title="Hesap bilgileri">
                  <dl>
                    <dt>Kullanıcı adı</dt>
                    <dd>@{user.username}</dd>
                    <dt>Ad soyad</dt>
                    <dd>
                      {user.firstName} {user.lastName}
                    </dd>
                    <dt>Unvan / Rol</dt>
                    <dd>
                      {user.customTitle || (user.username === "ayberkarslan" ? "Geliştirici Hesabı" : (user.owner ? "Takım Sahibi" : "Takım Üyesi"))}
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
                <Panel title="Özel Unvan ve Rozet Ayarları" description="Hesabında ve dizinde görünen unvanını ve geliştirici rozeti rengini istediğin an güncelleyebilirsin.">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      act(async () => {
                        const title = String(form.get("title") || "").trim();
                        const devColor = String(form.get("devColor") || "").trim();
                        await api("/me/title", { title }, "PUT");
                        if (devColor && (user.owner || user.username === "ayberkarslan")) {
                          await api("/me/developer-color", { color: devColor }, "PUT");
                          await loadBadges();
                        }
                        setUser({
                          ...user,
                          customTitle: title,
                          badges: (user.badges || []).map((b: any) =>
                            b.id === "developer" || b.tier === 6 ? { ...b, color: devColor } : b
                          ),
                        });
                        setNotice("Hesap ayarları ve rozet rengi kaydedildi.");
                      });
                    }}
                    style={{ display: "grid", gap: "12px" }}
                  >
                    <TextField
                      name="title"
                      label="Görünen unvan (Örn. Geliştirici Hesabı)"
                      defaultValue={user.customTitle || (user.username === "ayberkarslan" ? "Geliştirici Hesabı" : "")}
                      maxLength={80}
                    />
                    {(user.owner || user.username === "ayberkarslan") && (
                      <div style={{ display: "grid", gap: "6px" }}>
                        <label style={{ fontSize: "11px", color: "#ffffffa6" }}>
                          Geliştirici Hesabı Rozeti Rengi
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <input
                            type="color"
                            name="devColorPicker"
                            defaultValue={
                              user.badges?.find((b: any) => b.id === "developer" || b.tier === 6)?.color ||
                              allBadges.find((b) => b.id === "developer" || b.tier === 6)?.color ||
                              "#0bde0e"
                            }
                            onChange={(e) => {
                              const input = e.currentTarget.form?.elements.namedItem("devColor") as HTMLInputElement;
                              if (input) input.value = e.target.value;
                            }}
                            style={{
                              width: "36px",
                              height: "36px",
                              padding: "2px",
                              background: "#000000",
                              border: "1px solid #ffffff40",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          />
                          <div style={{ width: "140px" }}>
                            <TextField
                              name="devColor"
                              defaultValue={
                                user.badges?.find((b: any) => b.id === "developer" || b.tier === 6)?.color ||
                                allBadges.find((b) => b.id === "developer" || b.tier === 6)?.color ||
                                "#0bde0e"
                              }
                              placeholder="#0bde0e"
                            />
                          </div>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            {[
                              { label: "Matrix Yeşil", color: "#0bde0e" },
                              { label: "Siber Camgöbeği", color: "#00f0ff" },
                              { label: "Açık Mavi", color: "#38bdf8" },
                              { label: "Mor", color: "#a855f7" },
                              { label: "Altın", color: "#eab308" },
                              { label: "Gül Kırmızı", color: "#f43f5e" },
                              { label: "Saf Beyaz", color: "#ffffff" },
                            ].map((s) => (
                              <button
                                key={s.color}
                                type="button"
                                title={s.label}
                                onClick={(e) => {
                                  const form = (e.currentTarget as HTMLElement).closest("form");
                                  const textInput = form?.elements.namedItem("devColor") as HTMLInputElement;
                                  const colorInput = form?.elements.namedItem("devColorPicker") as HTMLInputElement;
                                  if (textInput) textInput.value = s.color;
                                  if (colorInput) colorInput.value = s.color;
                                }}
                                style={{
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "3px",
                                  background: s.color,
                                  border: "1px solid #00000088",
                                  cursor: "pointer",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <Button type="submit">Ayarları Kaydet</Button>
                  </form>
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
                      {r.badges?.length ? (
                        <div style={{ marginTop: "4px" }}>
                          <BadgeList badges={r.badges} size="sm" />
                        </div>
                      ) : r.custom_title ? (
                        <small style={{ color: "#ffffffa0" }}>{r.custom_title}</small>
                      ) : null}
                    </span>
                    <span>{r.email}</span>
                    <span>
                      <span className={`member-state member-state--${memberStatus(r)}`}>{memberStatusLabel[memberStatus(r)]}</span>
                      {r.owner && <small>Sahip</small>}
                      {r.roles?.some((ro: any) => ro.id === "admin") && <small style={{ color: "#7dd3fc" }}>Yönetici</small>}
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
              <h1>Roller, unvanlar ve rozetler</h1>
              <BadgesManager badges={allBadges} onRefresh={loadBadges} />
              <RolesList run={act} />
              <Fields run={act} />
              <AdminForm kind="role" run={act} />
              <AdminForm kind="permission" run={act} />
              <AdminForm kind="assignment" run={act} />
            </>
          )}
          {tab === "docs" && canViewDocs && <Docs />}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} apps={apps} pages={navigation} canSearchMembers={canBrowseDirectory} onPage={openPage} onApplication={openApplication} onMember={openMember} />
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
        <summary>Şifre <span>Belirle veya sıfırla</span></summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void perform(async () => {
            await api("/admin/users/" + user.id + "/password", {
              currentPassword: String(f.get("currentPassword") || ""),
              ...(f.get("newPassword")
                ? { newPassword: f.get("newPassword") }
                : f.get("temporaryPassword")
                  ? { temporaryPassword: f.get("temporaryPassword") }
                  : {}),
            });
          }, f.get("newPassword") ? "Şifre değiştirildi. Üyenin açık oturumları kapatıldı." : "Şifre kurtarma işlemi başlatıldı.");
        }}
      >
        <PasswordField
          name="currentPassword"
          label="Senin şifren"
          hint="İlk güvenlik işleminde gir; 10 dakika boyunca tekrar gerekmez."
        />
        <PasswordField
          name="newPassword"
          label="Yeni şifre (kalıcı, en az 8 karakter)"
          hint="Üye bu şifreyle hemen giriş yapar; değiştirmeye zorlanmaz."
          minLength={8}
          autoComplete="new-password"
        />
        <PasswordField
          name="temporaryPassword"
          label="Geçici şifre (ilk girişte değiştirilir; ikisi de boşsa e-posta gönderilir)"
          minLength={8}
        />
        <Button type="submit" disabled={working}>Şifreyi uygula</Button>
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
      <AvatarZoomProvider>
        <App />
      </AvatarZoomProvider>
    </StartupScreen>
  </React.StrictMode>,
);
