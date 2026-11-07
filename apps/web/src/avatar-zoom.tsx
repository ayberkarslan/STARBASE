import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { BadgeList, type Badge } from "./badges";
import "./avatar-zoom.css";

export type AvatarZoomItem = {
  name: string;
  username?: string;
  photoUrl?: string;
  initials?: string;
  badges?: Badge[];
  subtitle?: string;
};

type AvatarZoomContextType = {
  registerHover: (item: AvatarZoomItem, delayMs?: number) => void;
  cancelHover: () => void;
  closeZoom: () => void;
};

const AvatarZoomContext = createContext<AvatarZoomContextType>({
  registerHover: () => {},
  cancelHover: () => {},
  closeZoom: () => {},
});

export function useAvatarZoom() {
  return useContext(AvatarZoomContext);
}

export function AvatarZoomProvider({ children }: { children: ReactNode }) {
  const [zoomed, setZoomed] = useState<AvatarZoomItem | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHover = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const registerHover = (item: AvatarZoomItem, delayMs = 1000) => {
    cancelHover();
    timerRef.current = setTimeout(() => {
      setZoomed(item);
      timerRef.current = null;
    }, delayMs);
  };

  const closeZoom = () => {
    cancelHover();
    setZoomed(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeZoom();
    };
    if (zoomed) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoomed]);

  return (
    <AvatarZoomContext.Provider value={{ registerHover, cancelHover, closeZoom }}>
      {children}
      {zoomed && (
        <div
          className="avatar-zoom-backdrop"
          onClick={closeZoom}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="avatar-zoom-card"
            onClick={(e) => e.stopPropagation()}
            onPointerLeave={closeZoom}
          >
            <button
              type="button"
              className="avatar-zoom-close"
              onClick={closeZoom}
              title="Kapat"
              aria-label="Kapat"
            >
              <X size={14} />
            </button>
            <div className="avatar-zoom-image-container">
              {zoomed.photoUrl ? (
                <img src={zoomed.photoUrl} alt={zoomed.name} />
              ) : (
                <span className="avatar-zoom-initials">
                  {zoomed.initials || zoomed.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="avatar-zoom-meta">
              <h3>{zoomed.name}</h3>
              {zoomed.username && <span>@{zoomed.username}</span>}
              {zoomed.subtitle && <small>{zoomed.subtitle}</small>}
              {zoomed.badges?.length ? (
                <div className="avatar-zoom-badges">
                  <BadgeList badges={zoomed.badges} size="sm" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </AvatarZoomContext.Provider>
  );
}
