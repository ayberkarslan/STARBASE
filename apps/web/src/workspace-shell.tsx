import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@stardrop/ui";
import {
  Menu,
  Satellite,
  Rocket,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";

export function WorkspaceMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 140);
  };
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      clearTimeout(timer.current);
    };
  }, []);
  return (
    <div
      className="workspace-menu-anchor"
      ref={root}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") show();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") hide();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          root.current?.querySelector("button")?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <IconButton
        label="Menü"
        variant="bare"
        aria-expanded={open}
        aria-controls="workspace-menu"
        onClick={() => setOpen((v) => !v)}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show();
        }}
      >
        <Menu size={22} />
      </IconButton>
      {open && (
        <aside
          id="workspace-menu"
          className="workspace-menu"
          aria-label="Çalışma alanı menüsü"
          onClick={(e) => {
            if ((e.target as Element).closest("button")) setOpen(false);
          }}
        >
          {children}
        </aside>
      )}
    </div>
  );
}

export function ApplicationOrbit({
  onApplications,
}: {
  onApplications: () => void;
}) {
  const apps = [
    { name: "STARDROP", icon: Satellite, t: 0.19 },
    { name: "STARLAB", icon: Rocket, t: 0.5 },
    { name: "YRT TAKVİM", icon: CalendarDays, t: 0.81 },
  ];
  return (
    <div className="application-orbit" aria-label="Yıldız platformları">
      <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 200 Q500 -100 1000 200" />
        <path className="orbit-echo" d="M0 200 Q500 -78 1000 200" />
      </svg>
      <span className="orbit-caption">YILDIZDAN YILDIZLARA</span>
      {apps.map((a) => (
        <button
          key={a.name}
          className="orbit-application"
          style={{
            left: `${a.t * 100}%`,
            top: `${(200 - 600 * a.t * (1 - a.t)) / 2}%`,
          }}
          onClick={onApplications}
          title={`${a.name} · Bağlı uygulamaları görüntüle`}
        >
          <span className="orbit-node">
            <a.icon size={19} />
          </span>
          <span>{a.name}</span>
          <ArrowUpRight className="orbit-arrow" size={12} />
        </button>
      ))}
    </div>
  );
}
