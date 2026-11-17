import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { IconButton } from "@stardrop/ui";
import {
  Menu,
} from "lucide-react";

const workspaceStars = Array.from({ length: 14 }, () => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: [7, 8, 9, 11, 14][Math.floor(Math.random() * 5)],
  delay: -Math.random() * 28,
  duration: 22 + Math.random() * 18,
  dim: 0.035 + Math.random() * 0.035,
  bright: 0.14 + Math.random() * 0.08,
}));

export function WorkspaceStarfield() {
  return (
    <div className="workspace-starfield" aria-hidden="true">
      {workspaceStars.map((star, index) => (
        <span
          key={index}
          style={
            {
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              "--star-delay": `${star.delay}s`,
              "--star-duration": `${star.duration}s`,
              "--star-dim": star.dim,
              "--star-bright": star.bright,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

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
          root.current?.querySelector("button")?.focus();
          setOpen(false);
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
