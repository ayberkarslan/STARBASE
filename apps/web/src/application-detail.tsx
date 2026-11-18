import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, AppWindow, FileText, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Button, Dialog, Panel } from "@stardrop/ui";
import { CalendarOverview, TestCover, TestPreviewLink, type CalendarTest } from "./application-calendar";
import "./application-detail.css";

type Resource = CalendarTest & { title: string; createdAt: number; updatedAt?: number };
type Visit = { signedInAt: number; endedAt: number | null; endReason: string | null };
type Overview = {
  application: { id: string; name: string; logoUrl: string; launchUrl: string };
  summary: { totalVisits: number; lastSignInAt: number | null };
  visits: Visit[];
  resourceCount: number;
  access?: { connected: boolean; blocked: boolean; scopes: string[] };
};
type Session = { family: string; signedInAt: number; userAgent: string | null; expires: number; live: boolean; lastSeenAt: number | null; signalUnavailable?: boolean };
type ResourcePage = { resources: Resource[]; page: number; total: number; hasMore: boolean };

const dateTime = (value: number | null | undefined) => value
  ? new Date(value * 1000).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })
  : "Kayıt yok";
const statusLabel = (status: string) => ({ test_pending: "Test bekliyor", report_pending: "Test raporu bekleniyor", completed: "Tamamlandı", cancelled: "İptal edildi" })[status as "test_pending"] ?? status;
const deviceLabel = (agent: string | null) => {
  if (!agent) return "Bilinmeyen cihaz";
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Tarayıcı";
  const system = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Mac OS/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "Cihaz";
  return `${browser} · ${system}`;
};

function DocumentCover({ id, resourceId, title }: { id: string; resourceId: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={`application-detail-cover${failed ? "" : " application-detail-cover--preview"}`}>
    {!failed && <img loading="lazy" src={`/api/v1/apps/${encodeURIComponent(id)}/resources/${encodeURIComponent(resourceId)}/preview`} alt="" onError={() => setFailed(true)} />}
    {failed && <FileText size={35} aria-hidden="true" />}
    <span className="application-detail-cover-label" aria-hidden="true">{title}</span>
  </span>;
}

export function ApplicationDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourcePage, setResourcePage] = useState(1);
  const [resourceTotal, setResourceTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [resourceError, setResourceError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "session" | "access"; family?: string } | null>(null);
  const supportsLive = id === "test-formu-web" || id === "yrt-latex-web";
  const isCalendar = id === "test-formu-web";
  const isLatex = id === "yrt-latex-web";

  const loadOverview = useCallback(async () => {
    const response = await fetch(`/api/v1/apps/${encodeURIComponent(id)}/overview`);
    if (!response.ok) throw new Error("Uygulama bilgileri yüklenemedi.");
    setOverview(await response.json() as Overview);
  }, [id]);
  const loadSessions = useCallback(async () => {
    if (!supportsLive) return;
    const response = await fetch(`/api/v1/apps/${encodeURIComponent(id)}/sessions`);
    if (!response.ok) throw new Error("Oturum bilgileri yüklenemedi.");
    setSessions((await response.json() as { sessions: Session[] }).sessions);
  }, [id, supportsLive]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([loadOverview(), loadSessions()]); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Bilgiler yüklenemedi."); }
    finally { setRefreshing(false); }
  }, [loadOverview, loadSessions]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), page: String(resourcePage) });
        const response = await fetch(`/api/v1/apps/${encodeURIComponent(id)}/resources?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Kayıtlar yüklenemedi.");
        const data = await response.json() as ResourcePage;
        if (active) {
          setResources((current) => resourcePage === 1 ? data.resources : [...current, ...data.resources]);
          setResourceTotal(data.total);
          setHasMore(data.hasMore);
          setResourceError("");
        }
      } catch (cause) { if (active) setResourceError(cause instanceof Error ? cause.message : "Kayıtlar yüklenemedi."); }
    }, query ? 250 : 0);
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [id, query, resourcePage, revision]);
  useEffect(() => {
    const update = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(update, 20_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [refresh]);
  useEffect(() => {
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const connect = () => {
      if (stopped || document.hidden) return;
      const url = new URL("/api/v1/me/applications/live", location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
      socket.onmessage = (event) => {
        try { if (JSON.parse(event.data).type === "app.resources.changed") { setResourcePage(1); setRevision((value) => value + 1); void refresh(); } } catch { /* Ignore unknown frames. */ }
      };
      socket.onclose = () => { socket = null; if (!stopped) timer = setTimeout(connect, 10_000); };
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); socket?.close(); };
  }, [refresh]);

  async function mutate(path: string, method: "POST" | "DELETE") {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/apps/${encodeURIComponent(id)}${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
      if (!response.ok) throw new Error("İşlem tamamlanamadı. Tekrar dene.");
      setConfirm(null);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }

  const application = overview?.application;
  const connected = overview?.access?.connected;
  const blocked = overview?.access?.blocked;
  const title = confirm?.kind === "access" ? "Erişimi kapat" : "Oturumu kapat";

  return <div className="application-detail">
    <div className="application-detail-nav">
      <Button variant="bare" onClick={onBack}><ArrowLeft size={16} /> Uygulamalara dön</Button>
      <span>{application?.name ?? "Uygulama"}</span>
    </div>
    {error && <p role="alert" className="application-detail-error">{error}</p>}
    {!overview && !error && <p>Uygulama yükleniyor…</p>}
    {overview && <>
      <section className="application-detail-hero">
        <div className="application-detail-logo" aria-hidden="true">{application?.logoUrl ? <img src={application.logoUrl} alt="" /> : <AppWindow size={160} />}</div>
        <span className="eyebrow">STARBASE / UYGULAMALAR</span>
        <h1>{application?.name}</h1>
        <p>{isLatex ? "Belgelerin ve ortak projelerin." : isCalendar ? "Oluşturduğun testlerin ve takvim çalışmaların." : "Yıldız Roket Takımı hesabınla bağlı çalışma alanı."}</p>
        <div className="application-detail-hero-actions">
          {application?.launchUrl && !blocked && <a className="sd-button sd-button--primary sd-button--sm" href={application.launchUrl}>{application.launchUrl.startsWith("https:") ? "Uygulamayı aç" : "Yüklüyse aç"} <ArrowUpRight size={14} /></a>}
          <button type="button" className="application-detail-refresh" onClick={() => { setResourcePage(1); setRevision((value) => value + 1); void refresh(); }} disabled={refreshing} aria-label="Bilgileri yenile"><RefreshCw size={15} className={refreshing ? "is-spinning" : ""} /></button>
        </div>
      </section>
      <div className="application-detail-metrics" aria-label="Uygulama özeti">
        <span><small>SON GİRİŞ</small><strong>{dateTime(overview.summary.lastSignInAt)}</strong></span>
        <span><small>TOPLAM GİRİŞ</small><strong>{overview.summary.totalVisits ?? 0}</strong></span>
        <span><small>{isCalendar ? "TESTLERİM" : isLatex ? "BELGELERİM" : "KAYITLAR"}</small><strong>{overview.resourceCount}</strong></span>
      </div>

      <section className="application-detail-resources" aria-labelledby="application-resources-title">
        <div className="application-detail-section-head"><div><span className="eyebrow">ÇALIŞMALARIN</span><h2 id="application-resources-title">{isLatex ? "Belgelerim" : isCalendar ? "Testlerim" : "Kayıtlarım"}</h2></div>{resourceTotal > 0 && <small>{resourceTotal} kayıt</small>}</div>
        {(isLatex || isCalendar) && <label className="application-detail-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setResourcePage(1); }} placeholder={isLatex ? "Belgelerimde ara" : "Testlerimde ara"} aria-label={isLatex ? "Belgelerimde ara" : "Testlerimde ara"} /></label>}
        {resourceError && <p role="alert">{resourceError}</p>}
        {resources.length ? <div className="application-detail-resource-list">{resources.map((item, index) => {
          const content = <>{isLatex ? <DocumentCover id={id} resourceId={item.resourceId} title={item.title} /> : isCalendar ? <TestCover test={item} /> : <span className="application-detail-cover application-detail-cover--test"><FileText size={38} aria-hidden="true" /><span className="application-detail-cover-label">YRT / TEST</span></span>}<span className="application-detail-resource-copy"><strong>{item.title}</strong><small>{isCalendar ? `Test tarihi: ${item.date || "Belirtilmedi"} · ${statusLabel(item.status)}` : `${statusLabel(item.status || "Belge")} · ${dateTime(item.updatedAt ?? item.createdAt)}`}</small></span>{index === 0 && resourcePage === 1 && !query && <span className="application-detail-latest">SON ÇALIŞMA</span>}{item.url && <ArrowUpRight size={16} aria-hidden="true" />}</>;
          return item.url ? isCalendar ? <TestPreviewLink test={item} href={item.url} key={item.resourceId} className="application-detail-resource">{content}</TestPreviewLink> : <a href={item.url} key={item.resourceId} className="application-detail-resource">{content}</a> : <div key={item.resourceId} className="application-detail-resource">{content}</div>;
        })}</div> : <p className="application-detail-muted">{query ? "Aramana uygun kayıt bulunamadı." : isCalendar ? "Henüz hesabına bağlı test yok." : isLatex ? "Henüz bağlı belge yok." : "Bu uygulama için kayıt yok."}</p>}
        {hasMore && <Button variant="bare" onClick={() => setResourcePage((page) => page + 1)}>Daha fazla göster</Button>}
      </section>
      {isCalendar && <CalendarOverview revision={revision} />}

      {supportsLive && <section className="application-detail-access" aria-labelledby="application-access-title">
        <div><span className="eyebrow">HESAP BAĞLANTISI</span><h2 id="application-access-title">Erişim ve oturumlar</h2></div>
        <div className="application-detail-access-row">
          <span className="application-detail-access-state"><ShieldCheck size={17} />{blocked ? "Erişim kapalı" : connected ? "Uygulama bağlı" : "Henüz bağlanmadı"}</span>
          {blocked ? <Button variant="secondary" size="sm" onClick={() => void mutate("/access", "POST")} disabled={busy}>Erişimi yeniden aç</Button>
            : connected ? <Button variant="bare" size="sm" onClick={() => setConfirm({ kind: "access" })}>Erişimi kapat</Button>
            : <span className="application-detail-muted">Bağlanmak için uygulamayı aç.</span>}
        </div>
        {sessions.length ? <div className="application-detail-sessions" role="list" aria-label="Uygulama oturumları">{sessions.map((session) => <div className="application-detail-session" role="listitem" key={session.family}>
          <span className={`application-detail-presence${session.live ? " is-live" : ""}`} aria-hidden="true" />
          <div><strong>{deviceLabel(session.userAgent)}</strong><small>Giriş: {dateTime(session.signedInAt)} · {session.signalUnavailable ? "Durum alınamadı" : session.live ? `Canlı · Son sinyal ${dateTime(session.lastSeenAt)}` : "Canlı bağlantı yok"}</small></div>
          <Button variant="bare" size="sm" onClick={() => setConfirm({ kind: "session", family: session.family })}>Oturumu kapat</Button>
        </div>)}</div> : <p className="application-detail-muted">Açık uygulama oturumu bulunmuyor.</p>}
      </section>}

      <Panel title="Son girişlerim" className="application-detail-visits">
        {overview.visits.length ? overview.visits.slice(0, 6).map((visit, index) => <div className="application-detail-visit" key={`${visit.signedInAt}-${index}`}><strong>{dateTime(visit.signedInAt)}</strong><span>{visit.endReason === "logout" ? `Çıkış: ${dateTime(visit.endedAt)}` : visit.endReason === "revoked" ? "Oturum iptal edildi" : visit.endReason === "expired" ? "Oturum süresi doldu" : "Çıkış kaydı yok"}</span></div>) : <p>Henüz giriş kaydı yok.</p>}
      </Panel>
    </>}
    <Dialog open={!!confirm} onClose={() => { if (!busy) setConfirm(null); }} title={title} description={confirm?.kind === "access" ? "Bu uygulamanın erişimi kapanacak ve tüm mevcut oturumları iptal edilecek. Erişimi sonra yeniden açabilirsin." : "Yalnız seçtiğin tarayıcı veya cihaz oturumu kapanacak. Aynı oturumu paylaşan sekmeler de çıkacak."} actions={<><Button variant="bare" onClick={() => setConfirm(null)} disabled={busy}>Vazgeç</Button><Button variant="primary" onClick={() => void mutate(confirm?.kind === "access" ? "/access" : `/sessions/${encodeURIComponent(confirm?.family ?? "")}`, "DELETE")} disabled={busy}>{busy ? "İşleniyor…" : title}</Button></>} />
  </div>;
}
