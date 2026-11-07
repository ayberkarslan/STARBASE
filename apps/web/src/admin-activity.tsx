import { useEffect, useState } from "react";
import { Button, EmptyState, SearchField, TabBar } from "@stardrop/ui";
import { ArrowLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { request } from "./management";
import "./admin-activity.css";

type Source = "all" | "starbase" | "application";
type EndReason = "logout" | "revoked" | "expired" | null;
type Visit = {
  id: string; userId: string; username: string; firstName: string; lastName: string;
  applicationId: string | null; applicationName: string; source: "starbase" | "application";
  signedInAt: number; lastSeenAt: number | null; endedAt: number | null; endReason: EndReason;
};
type Platform = {
  source: "starbase" | "application"; applicationId: string | null; applicationName: string;
  lastSignInAt: number | null; lastSignOutAt: number | null; lastEndAt: number | null; lastSeenAt: number | null;
};
type History = { events: Visit[]; platforms: Platform[]; page: number; total: number; hasMore: boolean };
const date = (value: number | null) => value
  ? new Date(value * 1000).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" })
  : "—";
const endLabel: Record<Exclude<EndReason, null>, string> = {
  logout: "Çıkış yapıldı", revoked: "Oturum sonlandırıldı", expired: "Süresi doldu",
};

export function AdminActivity({ userId }: { userId?: string }) {
  const [focused, setFocused] = useState<{ id: string; name: string } | null>(null);
  const activeUserId = userId ?? focused?.id;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setSearch(query); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), source });
    if (activeUserId) params.set("userId", activeUserId);
    if (search && !activeUserId) params.set("q", search);
    request(`/admin/activity?${params}`)
      .then((result: History) => { if (active) { setData(result); setError(""); } })
      .catch(() => { if (active) setError("Erişim geçmişi yüklenemedi."); });
    return () => { active = false; };
  }, [activeUserId, search, source, page, revision]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setRevision((value) => value + 1); };
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  return <section className={userId ? "admin-activity admin-activity--member" : "admin-activity"}>
    <div className="admin-activity__heading">
      <div>
        <span className="eyebrow">STARBASE / ERİŞİM KAYITLARI</span>
        <h1>{userId ? "Ziyaret geçmişi" : focused ? focused.name : "Erişim geçmişi"}</h1>
        <p>Girişler, açıkça yapılan çıkışlar ve oturum sonlanmaları. Çıkış kaydı olmayan oturumlar çevrimiçi sayılmaz.</p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} /> Yenile</Button>
    </div>
    {focused && !userId && <Button variant="bare" size="sm" onClick={() => { setFocused(null); setPage(1); }}><ArrowLeft size={15} /> Tüm ziyaretler</Button>}
    {!activeUserId && <SearchField label="Üye veya uygulama ara" value={query} onChange={(event) => setQuery(event.target.value)} />}
    <TabBar label="Erişim kaynağı" value={source} onChange={(value) => { setSource(value as Source); setPage(1); }} items={[
      { value: "all", label: "Tümü" }, { value: "starbase", label: "STARBASE" }, { value: "application", label: "Uygulamalar" },
    ]} />
    {activeUserId && data?.platforms.length ? <div className="admin-activity__platforms">
      {data.platforms.filter((platform) => platform.lastSignInAt).map((platform) => <div className="admin-activity__platform" key={platform.applicationId ?? "starbase"}>
        <strong>{platform.applicationName}</strong>
        <span>Son giriş <b>{date(platform.lastSignInAt)}</b></span>
        {platform.source === "starbase" && <span>Son ziyaret <b>{date(platform.lastSeenAt)}</b></span>}
        <span>Son çıkış <b>{date(platform.lastSignOutAt)}</b></span>
      </div>)}
    </div> : null}
    {error && <p role="alert" className="message error">{error} <Button size="sm" onClick={() => setRevision((value) => value + 1)}>Yeniden dene</Button></p>}
    {!error && data && <>
      <div className="admin-activity__count">{data.total} ziyaret kaydı · son 90 gün</div>
      {data.events.length ? <div className="admin-activity__list">
        {data.events.map((event) => <article className="admin-activity__event" key={`${event.source}:${event.id}`}>
          <div className="admin-activity__event-head">
            {!activeUserId && <button type="button" onClick={() => { setFocused({ id: event.userId, name: `${event.firstName} ${event.lastName}` }); setPage(1); }}>
              {event.firstName} {event.lastName} <small>@{event.username}</small><ArrowUpRight size={14} />
            </button>}
            <strong>{event.applicationName}</strong>
          </div>
          <div className="admin-activity__times">
            <span>Giriş <b>{date(event.signedInAt)}</b></span>
            {event.source === "starbase" && <span>Son ziyaret <b>{date(event.lastSeenAt)}</b></span>}
            <span>{event.endReason ? endLabel[event.endReason] : "Çıkış kaydı yok"} <b>{date(event.endedAt)}</b></span>
          </div>
        </article>)}
      </div> : <EmptyState title="Kayıt bulunamadı" description="Bu filtre için henüz giriş kaydı yok." />}
      {data.total > 30 && <div className="admin-activity__pages">
        <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Önceki</Button>
        <span>{page}. sayfa</span>
        <Button variant="ghost" size="sm" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Sonraki</Button>
      </div>}
    </>}
  </section>;
}
