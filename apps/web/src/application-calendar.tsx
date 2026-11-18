import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@stardrop/ui";
import "./application-calendar.css";

export type CalendarTest = {
  resourceId: string; title?: string; date: string; status: string; url?: string;
  teamProject?: string | null; testTypeName?: string | null; description?: string | null;
  reportCode?: string | null; reportRevision?: number | null; testNumber?: number | null;
  preReportReady?: number | boolean | null; testReportReady?: number | boolean | null;
  attachmentCount?: number | null; imageCount?: number | null; videoCount?: number | null; dataCount?: number | null;
};

const statusNames: Record<string, string> = { test_pending: "Test bekliyor", report_pending: "Test raporu bekleniyor", completed: "Tamamlandı", cancelled: "İptal edildi" };
const dateLabel = (date: string) => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "Tarih belirtilmedi";
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());

export function TestCover({ test }: { test: CalendarTest }) {
  const [year, month, day] = (test.date || "").split("-");
  const monthName = month ? new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString("tr-TR", { month: "short", timeZone: "UTC" }) : "TEST";
  return <span className="application-detail-cover application-detail-cover--test application-test-cover" aria-hidden="true">
    <span className="application-test-cover-top"><span>YRT / TEST</span><span>{statusNames[test.status] ?? test.status}</span></span>
    <span className="application-test-cover-mark"><span>{day || "—"}</span><small>{monthName} {year || ""}</small></span>
    <span className="application-test-cover-bottom"><span>{test.teamProject || "Yıldız Roket Takımı"}</span><strong>{test.testTypeName || test.title || "Test kaydı"}</strong></span>
  </span>;
}

function Preview({ test }: { test: CalendarTest }) {
  const reportState = (ready: number | boolean | null | undefined) => ready == null ? "Kontrol edilemedi" : ready ? "Hazır" : "Henüz eklenmedi";
  return <div className="application-test-preview" role="tooltip">
    <span className={`application-test-preview-status status-${test.status}`}>{statusNames[test.status] ?? test.status}</span>
    <h3>{test.testTypeName || test.title || "Test"}</h3>
    <dl>
      <div><dt>Ekip / proje</dt><dd>{test.teamProject || "Belirtilmedi"}</dd></div>
      <div><dt>Tarih</dt><dd>{dateLabel(test.date)}</dd></div>
      {test.reportCode && <div><dt>Rapor kodu</dt><dd>{test.reportCode}{test.reportRevision != null ? ` · Rev. ${test.reportRevision}` : ""}</dd></div>}
      {test.testNumber != null && <div><dt>Test numarası</dt><dd>{test.testNumber}</dd></div>}
    </dl>
    <div className="application-test-preview-files"><div><span>Ön rapor</span><strong>{reportState(test.preReportReady)}</strong></div><div><span>Test raporu</span><strong>{reportState(test.testReportReady)}</strong></div><small>{test.attachmentCount ?? 0} ek dosya · {test.imageCount ?? 0} görsel · {test.videoCount ?? 0} video · {test.dataCount ?? 0} veri dosyası</small></div>
    {test.description && <p>{test.description}</p>}
    <small>Ayrıntılar ve düzenleme için Takvim'de aç</small>
  </div>;
}

export function TestPreviewLink({ test, href, className, children }: { test: CalendarTest; href: string; className: string; children: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLAnchorElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const clear = () => clearTimeout(timer.current);
  const show = () => { clear(); timer.current = setTimeout(() => setOpen(true), 220); };
  const hide = () => { clear(); timer.current = setTimeout(() => setOpen(false), 140); };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close); document.addEventListener("keydown", escape);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => () => clear(), []);
  useLayoutEffect(() => {
    if (!open || !anchor.current || !popup.current) return;
    const rect = anchor.current.getBoundingClientRect(), card = popup.current.getBoundingClientRect();
    const below = rect.bottom + 9;
    setPosition({ left: Math.max(12, Math.min(rect.left, innerWidth - card.width - 12)), top: Math.max(12, below + card.height < innerHeight - 12 ? below : rect.top - card.height - 9) });
  }, [open]);
  return <><a ref={anchor} href={href} className={className} aria-describedby={open ? id : undefined} onMouseEnter={() => { if (matchMedia("(hover: hover)").matches) show(); }} onMouseLeave={hide} onFocus={show} onBlur={() => { clear(); setOpen(false); }} onClick={() => { clear(); setOpen(false); }}>{children}</a>
    {open && createPortal(<div ref={popup} id={id} style={position} className="application-test-preview-popup" onMouseEnter={clear} onMouseLeave={hide}><Preview test={test} /></div>, document.body)}
  </>;
}

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}
function calendarDays(month: string) {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const last = new Date(Date.UTC(year, number, 0));
  const count = Math.ceil(((first.getUTCDay() + 6) % 7 + last.getUTCDate()) / 7) * 7;
  return Array.from({ length: count }, (_, index) => { const day = new Date(start); day.setUTCDate(start.getUTCDate() + index); return day.toISOString().slice(0, 10); });
}

export function CalendarOverview({ revision }: { revision: number }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [tests, setTests] = useState<CalendarTest[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const days = calendarDays(month);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const params = new URLSearchParams({ from: days[0], to: days.at(-1)! });
        const response = await fetch(`/api/v1/apps/test-formu-web/calendar?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Takvim yüklenemedi.");
        const data = await response.json() as { tests: CalendarTest[]; truncated: boolean };
        if (active) { setTests(data.tests); setError(data.truncated ? "Bu ayın tüm testleri gösterilemiyor; Takvim uygulamasında aç." : ""); setLoading(false); }
      } catch (cause) { if (active && !controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Takvim yüklenemedi."); setLoading(false); } }
    };
    setLoading(true); void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { active = false; controller.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [month, revision, days[0], days.at(-1)]);
  const changeMonth = (offset: number) => { const next = offset === 0 ? today().slice(0, 7) : shiftMonth(month, offset); setMonth(next); setSelectedDay(offset === 0 ? today() : `${next}-01`); };
  const byDate = new Map<string, CalendarTest[]>();
  for (const test of tests) byDate.set(test.date, [...(byDate.get(test.date) ?? []), test]);
  const selected = byDate.get(selectedDay) ?? [];
  const title = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });
  return <section className="application-calendar" aria-labelledby="application-calendar-title">
    <div className="application-calendar-head"><div><span className="eyebrow">TAKIM TAKVİMİ</span><h2 id="application-calendar-title">Tüm testler</h2></div><div className="application-calendar-nav"><Button variant="bare" size="sm" onClick={() => changeMonth(0)}>Bugün</Button><Button variant="bare" size="sm" onClick={() => changeMonth(-1)} aria-label="Önceki ay"><ArrowLeft size={15} /></Button><strong>{title}</strong><Button variant="bare" size="sm" onClick={() => changeMonth(1)} aria-label="Sonraki ay"><ArrowRight size={15} /></Button></div></div>
    {error && <p role="alert" className="application-detail-error">{error}</p>}
    <div className="application-calendar-grid" role="grid" aria-label={`${title} test takvimi`}>
      {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map(day => <span className="application-calendar-weekday" key={day}>{day}</span>)}
      {days.map(day => { const items = byDate.get(day) ?? []; return <div key={day} role="gridcell" className={`application-calendar-day${day.slice(0, 7) !== month ? " is-outside" : ""}${day === selectedDay ? " is-selected" : ""}${day === today() ? " is-today" : ""}`}>
        <button type="button" aria-label={`${dateLabel(day)}: ${items.length} test`} aria-pressed={day === selectedDay} onClick={() => setSelectedDay(day)}>{Number(day.slice(-2))}<span>{items.length ? `${items.length} test` : ""}</span></button>
        <div className="application-calendar-events">{items.slice(0, 2).map(test => test.url ? <TestPreviewLink key={test.resourceId} test={test} href={test.url} className={`application-calendar-event status-${test.status}`}>{test.testTypeName || test.title || "Test"}</TestPreviewLink> : null)}{items.length > 2 && <button type="button" className="application-calendar-more" onClick={() => setSelectedDay(day)}>+{items.length - 2} test</button>}</div>
      </div>; })}
    </div>
    <div className="application-calendar-selection"><span>{dateLabel(selectedDay)} · {loading ? "Yükleniyor…" : `${selected.length} test`}</span>{selected.length > 0 && <div>{selected.map(test => test.url ? <TestPreviewLink key={test.resourceId} test={test} href={test.url} className="application-calendar-selected-test"><strong>{test.testTypeName || test.title || "Test"}</strong><small>{test.teamProject || "Ekip belirtilmedi"} · {statusNames[test.status] ?? test.status}</small><ArrowRight size={14} /></TestPreviewLink> : null)}</div>}</div>
  </section>;
}
