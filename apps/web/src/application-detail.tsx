import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, AppWindow } from "lucide-react";
import { Button, Panel } from "@stardrop/ui";
import "./application-detail.css";

type Overview = {
  application: { id: string; name: string; logoUrl: string; launchUrl: string };
  summary: { totalVisits: number; lastSignInAt: number | null };
  visits: { signedInAt: number; endedAt: number | null; endReason: string | null }[];
  resources: { resourceId: string; title: string; date: string; status: string; createdAt: number }[];
  resourceCount: number;
};

const dateTime = (value: number | null) => value
  ? new Date(value * 1000).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })
  : "Kayıt yok";

export function ApplicationDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setOverview(null);
    setError("");
    fetch(`/api/v1/apps/${encodeURIComponent(id)}/overview`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Uygulama bilgileri yüklenemedi.");
        return response.json() as Promise<Overview>;
      })
      .then((value) => { if (active) setOverview(value); })
      .catch((cause) => { if (active) setError(String(cause.message ?? cause)); });
    return () => { active = false; };
  }, [id]);
  return <div className="application-detail">
    <Button variant="bare" onClick={onBack}><ArrowLeft size={16} /> Uygulamalara dön</Button>
    {error && <p role="alert">{error}</p>}
    {!overview && !error && <p>Uygulama yükleniyor…</p>}
    {overview && <>
      <section className="application-detail-hero">
        <div className="application-detail-logo" aria-hidden="true">
          {overview.application.logoUrl ? <img src={overview.application.logoUrl} alt="" /> : <AppWindow size={160} />}
        </div>
        <span className="eyebrow">STARBASE UYGULAMASI</span>
        <h1>{overview.application.name}</h1>
        <p>Yıldız Roket Takımı hesabınla bağlı uygulama.</p>
        {overview.application.launchUrl && <a className="sd-button sd-button--primary sd-button--md" href={overview.application.launchUrl}>{overview.application.launchUrl.startsWith("https:") ? "Uygulamayı aç" : "Yüklüyse aç"} <ArrowUpRight size={16} /></a>}
      </section>
      <div className="application-detail-metrics">
        <Panel title="Giriş sayın"><strong>{overview.summary.totalVisits ?? 0}</strong></Panel>
        <Panel title="Son girişin"><strong>{dateTime(overview.summary.lastSignInAt)}</strong></Panel>
        {id === "test-formu-web" && <Panel title="Eklediğin testler"><strong>{overview.resourceCount}</strong></Panel>}
      </div>
      {id === "test-formu-web" && <Panel title="Eklediğim testler" className="application-detail-list">
        {overview.resources.length ? overview.resources.map((item) => <div className="application-detail-row" key={item.resourceId}>
          <strong>{item.title}</strong><span>{item.date} · {item.status}</span>
        </div>) : <p>STARBASE hesabınla eklediğin testler burada görünecek.</p>}
      </Panel>}
      <Panel title="Son girişlerim" className="application-detail-list">
        {overview.visits.length ? overview.visits.map((visit, index) => <div className="application-detail-row" key={`${visit.signedInAt}-${index}`}>
          <strong>{dateTime(visit.signedInAt)}</strong>
          <span>{visit.endReason === "logout" ? `Çıkış: ${dateTime(visit.endedAt)}` : visit.endReason === "revoked" ? "Oturum sonlandırıldı" : visit.endReason === "expired" ? "Oturum süresi doldu" : "Çıkış kaydı yok"}</span>
        </div>) : <p>Henüz giriş kaydı yok.</p>}
      </Panel>
    </>}
  </div>;
}
