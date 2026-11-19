import { useEffect, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";

export function CalendarBackupButton({ testId, onError }: { testId: string; onError: (message: string) => void }) {
  const key = `starbase-test-backup:${testId}`;
  const [jobId, setJobId] = useState(() => sessionStorage.getItem(key) ?? "");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`/api/v1/apps/test-formu-web/calendar/backups/${encodeURIComponent(jobId)}`);
        if (!response.ok) throw new Error("Yedek durumu alınamadı.");
        const result = await response.json() as { status: string; url?: string; message?: string };
        if (!active) return;
        if (result.status === "ready" && result.url) {
          setUrl(result.url); setJobId(""); setBusy(false); sessionStorage.removeItem(key);
          const link = document.createElement("a"); link.href = result.url; link.rel = "noopener noreferrer"; document.body.appendChild(link); link.click(); link.remove();
        } else if (result.status === "failed") {
          setJobId(""); setBusy(false); sessionStorage.removeItem(key); onError(result.message ?? "Yedek hazırlanamadı.");
        }
      } catch (error) {
        if (!active) return;
        setJobId(""); setBusy(false); sessionStorage.removeItem(key); onError(error instanceof Error ? error.message : "Yedek hazırlanamadı.");
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 3000);
    return () => { active = false; clearInterval(timer); };
  }, [jobId, key, onError]);
  const start = async () => {
    if (url) { const link = document.createElement("a"); link.href = url; link.rel = "noopener noreferrer"; document.body.appendChild(link); link.click(); link.remove(); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/apps/test-formu-web/calendar/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testId }) });
      if (!response.ok) throw new Error("Yedek başlatılamadı.");
      const result = await response.json() as { jobId: string };
      sessionStorage.setItem(key, result.jobId); setJobId(result.jobId);
    } catch (error) { setBusy(false); onError(error instanceof Error ? error.message : "Yedek başlatılamadı."); }
  };
  return <button type="button" className="application-detail-backup" aria-label="Testi ZIP indir" title={jobId || busy ? "Yedek hazırlanıyor" : "Tüm içeriği ZIP indir"} disabled={busy || !!jobId} onClick={() => void start()}>{busy || jobId ? <LoaderCircle size={14} className="is-spinning" /> : <Download size={14} />}<span>{busy || jobId ? "Hazırlanıyor" : "ZIP indir"}</span></button>;
}
