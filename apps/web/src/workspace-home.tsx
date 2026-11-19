import { useEffect, useRef, useState } from "react";
import { AppWindow, ArrowUpRight, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { request } from "./management";
import "./workspace-home.css";

export type HomeApp = { id: string; name: string; logoUrl?: string; launchUrl?: string };
export type HomeShortcut = { id: string; name: string; icon: LucideIcon };

export function WorkspaceHome({ name, apps, shortcuts, canShare, onPage, onApplication, onSearch }: {
  name: string;
  apps: HomeApp[];
  shortcuts: HomeShortcut[];
  canShare: boolean;
  onPage: (id: string) => void;
  onApplication: (id: string) => void;
  onSearch: () => void;
}) {
  const [recentId, setRecentId] = useState<string | null>(null);
  const [easterVisible, setEasterVisible] = useState(false);
  const typed = useRef("");
  const easterTimer = useRef<number | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable='true'],[role='textbox']"))) return;
      typed.current = /^[A-Z]$/.test(event.key) ? (typed.current + event.key).slice(-6) : "";
      if (typed.current !== "AYBERK") return;
      typed.current = "";
      setEasterVisible(true);
      if (easterTimer.current != null) window.clearTimeout(easterTimer.current);
      easterTimer.current = window.setTimeout(() => setEasterVisible(false), 5200);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); if (easterTimer.current != null) window.clearTimeout(easterTimer.current); };
  }, []);
  useEffect(() => {
    let active = true;
    request("/me/applications?page=1")
      .then((history: { applications: { applicationId: string; lastSignInAt: number; applicationDisabled: number }[] }) => {
        if (!active) return;
        const latest = [...history.applications]
          .filter((item) => !item.applicationDisabled)
          .sort((a, b) => b.lastSignInAt - a.lastSignInAt)[0];
        setRecentId(latest?.applicationId ?? null);
      })
      .catch(() => { if (active) setRecentId(null); });
    return () => { active = false; };
  }, []);
  const recent = apps.find((app) => app.id === recentId);

  return <section className="workspace-home-page">
    {easterVisible && <div className="workspace-home-easter" aria-hidden="true"><div className="workspace-home-easter-stars" /><div className="workspace-home-easter-ring workspace-home-easter-ring-one" /><div className="workspace-home-easter-ring workspace-home-easter-ring-two" /><img src="/brand/ayberk-signature.png" alt="" /></div>}
    <div className="workspace-home-intro">
      <div><h1>Merhaba, {name}.</h1>
        <p>Çalışma alanın hazır.</p>
      </div>
      <button type="button" className="workspace-home-search" onClick={onSearch} aria-label="Uygulama veya üye ara">
        <Search size={17} /><span>Uygulama veya üye ara</span><kbd>CTRL + K</kbd>
      </button>
    </div>

    {recent && <section className="workspace-home-recent" aria-label="Son kullanılan uygulama">
      <div><span className="eyebrow">KALDIĞIN YER</span><p>Son giriş yaptığın uygulamaya dön.</p></div>
      <button type="button" onClick={() => onApplication(recent.id)}>
        {recent.logoUrl ? <img src={recent.logoUrl} alt="" /> : <AppWindow size={22} />}
        <strong>{recent.name}</strong><ArrowUpRight size={18} />
      </button>
    </section>}

    <section className="workspace-home-section" aria-labelledby="home-apps-title">
      <div className="workspace-home-section-head"><button type="button" onClick={() => onPage("applications")}>Tüm uygulamalar <ArrowUpRight size={14} /></button></div>
      <h2 id="home-apps-title">Uygulamalar</h2>
      {apps.length || canShare ? <div className="workspace-home-apps">{canShare && <button type="button" className="workspace-home-app" onClick={() => onPage("sharing")} aria-label="Dosya Paylaşım ekranını aç">
        <img className="workspace-home-app-watermark" src="/brand/file-sharing.svg" alt="" />
        <span className="workspace-home-app-icon"><img src="/brand/file-sharing.svg" alt="" /></span>
        <strong>Dosya Paylaşım</strong><span className="workspace-home-app-action">Paylaşım alanını aç <ArrowUpRight size={16} /></span>
      </button>}{apps.map((app) => <button type="button" className="workspace-home-app" key={app.id} onClick={() => onApplication(app.id)} aria-label={`${app.name} ayrıntılarını aç`}>
        {app.logoUrl && <img className="workspace-home-app-watermark" src={app.logoUrl} alt="" />}
        <span className="workspace-home-app-icon">{app.logoUrl ? <img src={app.logoUrl} alt="" /> : <AppWindow size={22} />}</span>
        <strong>{app.name}</strong><span className="workspace-home-app-action">Uygulama ayrıntıları <ArrowUpRight size={16} /></span>
      </button>)}</div> : <p className="workspace-home-empty">Henüz kayıtlı uygulama yok.</p>}
    </section>

    <section className="workspace-home-section" aria-labelledby="home-shortcuts-title">
      <h2 id="home-shortcuts-title">Çalışma alanları</h2>
      <div className="workspace-home-shortcuts">{shortcuts.map(({ id, name: label, icon: Icon }) => <button type="button" key={id} onClick={() => onPage(id)}><Icon size={17} /><span>{label}</span><ArrowUpRight size={14} /></button>)}</div>
    </section>
  </section>;
}
