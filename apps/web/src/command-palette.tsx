import { useEffect, useMemo, useRef, useState } from "react";
import { AppWindow, ArrowUpRight, Search, UserRound } from "lucide-react";
import { Dialog } from "@stardrop/ui";
import type { HomeApp, HomeShortcut } from "./workspace-home";
import { request } from "./management";
import "./command-palette.css";

type Member = { id: string; username: string; firstName: string; lastName: string; photoUrl?: string };
const fold = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

export function CommandPalette({ open, onClose, apps, pages, canSearchMembers, onPage, onApplication, onMember }: {
  open: boolean;
  onClose: () => void;
  apps: HomeApp[];
  pages: HomeShortcut[];
  canSearchMembers: boolean;
  onPage: (id: string) => void;
  onApplication: (id: string) => void;
  onMember: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
    else { setQuery(""); setMembers([]); setActive(0); }
  }, [open]);
  useEffect(() => {
    if (!open || !canSearchMembers || query.trim().length < 2) { setMembers([]); return; }
    let current = true;
    const timer = window.setTimeout(() => {
      request(`/directory/users?q=${encodeURIComponent(query.trim())}&page=1`)
        .then((result: { users: Member[] }) => { if (current) setMembers(result.users.slice(0, 5)); })
        .catch(() => { if (current) setMembers([]); });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [open, query, canSearchMembers]);

  const results = useMemo(() => {
    const needle = fold(query.trim());
    const matchingApps = apps.filter((app) => !needle || fold(app.name).includes(needle)).slice(0, 6);
    const matchingPages = pages.filter((page) => !needle || fold(page.name).includes(needle)).slice(0, 5);
    return [
      ...matchingApps.map((app) => ({ key: `app:${app.id}`, label: app.name, group: "UYGULAMA", logo: app.logoUrl, icon: AppWindow, run: () => onApplication(app.id) })),
      ...matchingPages.map((page) => ({ key: `page:${page.id}`, label: page.name, group: "SAYFA", logo: "", icon: page.icon, run: () => onPage(page.id) })),
      ...members.map((member) => ({ key: `member:${member.id}`, label: `${member.firstName} ${member.lastName}`, group: `ÜYE · @${member.username}`, logo: member.photoUrl, icon: UserRound, run: () => onMember(member.id) })),
    ];
  }, [apps, pages, members, query, onApplication, onPage, onMember]);
  useEffect(() => { setActive(0); }, [query, members]);
  const choose = (index: number) => { const result = results[index]; if (!result) return; result.run(); onClose(); };

  return <Dialog open={open} onClose={onClose} title="Hızlı erişim" description="Uygulama, sayfa veya takım üyesi ara." className="command-palette">
    <div className="command-palette-search"><Search size={17} /><input ref={input} aria-label="Uygulama, sayfa veya üye ara" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % Math.max(results.length, 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1)); }
      if (event.key === "Enter") { event.preventDefault(); choose(active); }
    }} placeholder="Aramaya başla…" /></div>
    <div className="command-palette-results" role="listbox" aria-label="Arama sonuçları">
      {results.length ? results.map((item, index) => <button type="button" role="option" aria-selected={active === index} className={active === index ? "is-active" : ""} key={item.key} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
        <span className="command-palette-icon">{item.logo ? <img src={item.logo} alt="" /> : <item.icon size={17} />}</span>
        <span className="command-palette-label"><strong>{item.label}</strong><small>{item.group}</small></span><ArrowUpRight size={14} />
      </button>) : <p>Sonuç bulunamadı.</p>}
    </div>
    <div className="command-palette-help">↑ ↓ seç · Enter aç · Esc kapat</div>
  </Dialog>;
}
