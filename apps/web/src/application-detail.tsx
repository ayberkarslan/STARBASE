import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, AppWindow, FileText, FolderOpen, RefreshCw } from "lucide-react";
import { Button, Panel } from "@stardrop/ui";
import "./application-detail.css";

type Overview = {
  application: { id: string; name: string; logoUrl: string; launchUrl: string };
  summary: { totalVisits: number; lastSignInAt: number | null };
  visits: { signedInAt: number; endedAt: number | null; endReason: string | null }[];
  resources: { resourceId: string; title: string; date: string; status: string; url?: string; createdAt: number; updatedAt?: number }[];
  resourceCount: number;
};

const dateTime = (value: number | null) => value
  ? new Date(value * 1000).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })
  : "Kayıt yok";

export function ApplicationDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const overviewRef = useRef<Overview | null>(null);
  overviewRef.current = overview;
  const reloadRef = useRef<() => void>(() => {});

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent && !overviewRef.current) {
      setOverview(null);
    }
    if (!silent) setRefreshing(true);
    try {
      const response = await fetch(`/api/v1/apps/${encodeURIComponent(id)}/overview`);
      if (!response.ok) throw new Error("Uygulama bilgileri yüklenemedi.");
      const data = (await response.json()) as Overview;
      setOverview(data);
      setError("");
    } catch (cause: any) {
      if (!silent || !overviewRef.current) {
        setError(String(cause?.message ?? cause));
      }
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  reloadRef.current = () => {
    void loadOverview(true);
  };

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let ws: WebSocket | null = null;
    let attempts = 0;

    void loadOverview(false);

    function connect() {
      if (disposed || document.hidden) return;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      try {
        const url = new URL("/api/v1/board/live", location.origin);
        url.searchParams.set("scope", "private");
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(url);
        ws.onopen = () => {
          if (disposed) {
            ws?.close();
            return;
          }
          attempts = 0;
        };
        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data?.type === "board.changed") {
              reloadRef.current();
            }
          } catch {}
        };
        ws.onclose = () => {
          ws = null;
          if (!disposed && !document.hidden) {
            reconnectTimer = setTimeout(
              connect,
              Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)) + Math.random() * 500,
            );
          }
        };
        ws.onerror = () => ws?.close();
      } catch {}
    }

    function onVisibility() {
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.close();
        ws = null;
      }
      if (!document.hidden) {
        reloadRef.current();
        connect();
      }
    }

    function onFocus() {
      if (!document.hidden) {
        reloadRef.current();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    const pollInterval = setInterval(() => {
      if (!document.hidden) reloadRef.current();
    }, 15000);

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  }, [id, loadOverview]);

  const latestResource = overview?.resources[0];

  return <div className="application-detail">
    <div className="application-detail-nav">
      <Button variant="bare" onClick={onBack}><ArrowLeft size={16} /> Uygulamalara dön</Button>
      <button
        type="button"
        className={`application-detail-refresh ${refreshing ? "is-spinning" : ""}`}
        onClick={() => void loadOverview(false)}
        disabled={refreshing}
        title="Verileri ve son dosyaları yenile"
        aria-label="Verileri ve son dosyaları yenile"
      >
        <RefreshCw size={13} aria-hidden="true" />
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!overview && !error && <p>Uygulama yükleniyor…</p>}
    {overview && <>
      <section className="application-detail-hero">
        <div className="application-detail-logo" aria-hidden="true">
          {overview.application.logoUrl ? <img src={overview.application.logoUrl} alt="" /> : <AppWindow size={140} />}
        </div>
        <div className="application-detail-hero__main">
          <div className="application-detail-hero__copy">
            <div className="application-detail-hero__top">
              <span className="eyebrow">STARBASE UYGULAMASI</span>
              <div className="application-detail-telemetry" aria-label="Uygulama özeti">
                <span>
                  <em>GİRİŞ</em>
                  <strong>{overview.summary.totalVisits ?? 0}</strong>
                </span>
                <i aria-hidden="true" />
                <span>
                  <em>SON GİRİŞ</em>
                  <strong>{dateTime(overview.summary.lastSignInAt)}</strong>
                </span>
                <i aria-hidden="true" />
                <span>
                  <em>KAYITLAR</em>
                  <strong>{overview.resourceCount}</strong>
                </span>
                <i aria-hidden="true" />
                <button
                  type="button"
                  className={`application-detail-refresh ${refreshing ? "is-spinning" : ""}`}
                  onClick={() => void loadOverview(false)}
                  disabled={refreshing}
                  title="Verileri ve son dosyaları yenile"
                  aria-label="Verileri ve son dosyaları yenile"
                >
                  <RefreshCw size={11} aria-hidden="true" />
                </button>
              </div>
            </div>
            <h1>{overview.application.name}</h1>
            <p>Yıldız Roket Takımı hesabınla bağlı uygulama.</p>
            <div className="application-detail-hero__actions">
              {overview.application.launchUrl && (
                <a className="sd-button sd-button--primary sd-button--sm" href={overview.application.launchUrl}>
                  {overview.application.launchUrl.startsWith("https:") ? "Uygulamayı aç" : "Yüklüyse aç"} <ArrowUpRight size={14} />
                </a>
              )}
              {latestResource?.url && (
                <a className="sd-button sd-button--sm" href={latestResource.url}>
                  Son dosyadan devam et ({latestResource.title}) <ArrowUpRight size={14} />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <Panel
        title="Dahil olduğum kayıtlar ve dosyalar"
        description="Uygulama içindeki çalışmaların ve belgelerin. En son uğraştığın dosya ilk sırada işaretlidir."
        className="application-detail-files"
      >
        {overview.resources.length ? (
          <div className="application-file-grid" role="list">
            {overview.resources.map((item, index) => {
              const isLatest = index === 0;
              const editedTime = dateTime(item.updatedAt ?? item.createdAt);
              const content = (
                <>
                  <div className="application-file-card__preview" aria-hidden="true">
                    {isLatest && <span className="application-file-card__badge">EN SON UĞRAŞILAN · KALDIĞIN YER</span>}
                    <div className="application-file-sheet">
                      <div className="application-file-sheet__head">
                        <span className="application-file-sheet__org">YILDIZ ROKET TAKIMI</span>
                        <span className="application-file-sheet__kind">{item.status || "Belge"}</span>
                      </div>
                      <strong className="application-file-sheet__title">{item.title}</strong>
                      <div className="application-file-sheet__lines">
                        <i /><i /><i /><i />
                      </div>
                      <div className="application-file-sheet__foot">
                        <span>{item.date}</span>
                        <span>TEX / PDF</span>
                      </div>
                    </div>
                  </div>
                  <div className="application-file-card__meta">
                    <div className="application-file-card__title-row">
                      {isLatest ? <FolderOpen size={14} className="application-file-card__icon" /> : <FileText size={14} className="application-file-card__icon" />}
                      <strong title={item.title}>{item.title}</strong>
                      {item.url && <ArrowUpRight size={14} className="application-file-card__arrow" aria-hidden="true" />}
                    </div>
                    <div className="application-file-card__sub">
                      <span>{item.status || "Kayıt"}</span>
                      <span>Son düzenleme: {editedTime}</span>
                    </div>
                  </div>
                </>
              );
              return item.url ? (
                <a
                  key={item.resourceId}
                  role="listitem"
                  className={`application-file-card ${isLatest ? "application-file-card--latest" : ""}`}
                  href={item.url}
                >
                  {content}
                </a>
              ) : (
                <div
                  key={item.resourceId}
                  role="listitem"
                  className={`application-file-card ${isLatest ? "application-file-card--latest" : ""}`}
                >
                  {content}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="application-file-empty">STARBASE hesabınla oluşturduğun veya katkı verdiğin içerikler burada klasör/dosya görünümünde listelenecek.</p>
        )}
      </Panel>

      <Panel title="Son girişlerim" className="application-detail-list">
        {overview.visits.length ? (
          <div className="application-visits-compact">
            {overview.visits.slice(0, 6).map((visit, index) => (
              <div className="application-detail-row" key={`${visit.signedInAt}-${index}`}>
                <strong>{dateTime(visit.signedInAt)}</strong>
                <span>{visit.endReason === "logout" ? `Çıkış: ${dateTime(visit.endedAt)}` : visit.endReason === "revoked" ? "Oturum sonlandırıldı" : visit.endReason === "expired" ? "Oturum süresi doldu" : "Çıkış kaydı yok"}</span>
              </div>
            ))}
          </div>
        ) : <p>Henüz giriş kaydı yok.</p>}
      </Panel>
    </>}
  </div>;
}
