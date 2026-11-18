import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bell, Check, LockKeyhole } from "lucide-react";
import "./notifications.css";

export type StarbaseNotification = {
  id: string;
  kind: "share.invite";
  resourceId: string;
  createdAt: number;
  readAt: number | null;
  roomName: string;
  actorName: string;
};

export function Notifications({ items, unreadCount, onOpen, onReadAll }: {
  items: StarbaseNotification[];
  unreadCount: number;
  onOpen: (item: StarbaseNotification) => void;
  onReadAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return <div ref={root} className="starbase-notifications">
    <button type="button" className="starbase-notifications-trigger" aria-label={unreadCount ? `Bildirimler, ${unreadCount} okunmamış` : "Bildirimler"} aria-expanded={open} onClick={() => setOpen((value) => !value)}><Bell size={17} />{unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>
    {open && <div className="starbase-notifications-popover" role="dialog" aria-label="Bildirimler"><div className="starbase-notifications-head"><div><span className="eyebrow">STARBASE</span><h2>Bildirimler</h2></div>{unreadCount > 0 && <button type="button" onClick={onReadAll}><Check size={13} /> Tümünü okundu yap</button>}</div>
      <div className="starbase-notifications-list">{items.length ? items.map((item) => <button type="button" key={item.id} className={`starbase-notification ${item.readAt ? "" : "is-unread"}`} onClick={() => { setOpen(false); onOpen(item); }}><span className="starbase-notification-icon"><LockKeyhole size={15} /></span><span><strong>{item.actorName || "Bir takım üyesi"} seni {item.roomName} odasına davet etti.</strong><small>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt * 1000))}</small></span><ArrowUpRight size={15} /></button>) : <p>Henüz bildirimin yok.</p>}</div>
    </div>}
  </div>;
}
