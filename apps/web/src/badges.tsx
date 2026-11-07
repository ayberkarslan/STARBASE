import { useState } from "react";
import {
  Shield,
  Crown,
  Star,
  Code,
  Award,
  Zap,
  Terminal,
  Rocket,
  Sparkles,
  Cpu,
  Layers,
  X,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button, Panel, TextField } from "@stardrop/ui";
import { FormSelect } from "./form-select";
import { request } from "./management";
import "./badges.css";

export type Badge = {
  id: string;
  name: string;
  description: string;
  tier: number;
  color: string;
  icon: string;
  createdAt?: number;
  assignedAt?: number;
};

export function getBadgeIcon(iconName: string, size = 11) {
  switch (iconName?.toLowerCase()) {
    case "crown":
      return <Crown size={size} />;
    case "star":
      return <Star size={size} />;
    case "code":
    case "terminal":
      return <Code size={size} />;
    case "award":
      return <Award size={size} />;
    case "zap":
      return <Zap size={size} />;
    case "rocket":
      return <Rocket size={size} />;
    case "sparkles":
      return <Sparkles size={size} />;
    case "cpu":
      return <Cpu size={size} />;
    case "layers":
      return <Layers size={size} />;
    case "shield":
    default:
      return <Shield size={size} />;
  }
}

export function BadgePill({
  badge,
  onRemove,
  size = "md",
}: {
  badge: Badge;
  onRemove?: () => void;
  size?: "sm" | "md";
}) {
  const isDev = badge.id === "developer" || badge.tier === 6;
  const tierClass = isDev
    ? "badge-pill--developer"
    : `badge-pill--tier-${Math.max(1, Math.min(6, badge.tier || 1))}`;

  return (
    <span
      className={`badge-pill ${tierClass} ${size === "sm" ? "badge-pill--sm" : ""}`}
      style={!isDev && badge.color && badge.color !== "#ffffff" ? { borderColor: `${badge.color}60`, color: badge.color } : undefined}
      title={badge.description || badge.name}
    >
      {getBadgeIcon(badge.icon, size === "sm" ? 10 : 11)}
      <span>{badge.name}</span>
      {onRemove && (
        <button
          type="button"
          className="badge-remove-btn"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Rozeti kaldır"
          aria-label={`${badge.name} rozetini kaldır`}
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

export function BadgeList({
  badges = [],
  onRemove,
  size = "md",
}: {
  badges?: Badge[];
  onRemove?: (badgeId: string) => void;
  size?: "sm" | "md";
}) {
  if (!badges || !badges.length) return null;
  return (
    <div className="badge-list">
      {badges.map((badge) => (
        <BadgePill
          key={badge.id}
          badge={badge}
          size={size}
          onRemove={onRemove ? () => onRemove(badge.id) : undefined}
        />
      ))}
    </div>
  );
}

export function BadgeAssigner({
  availableBadges = [],
  assignedBadgeIds = [],
  onAssign,
  disabled = false,
}: {
  availableBadges: Badge[];
  assignedBadgeIds: string[];
  onAssign: (badgeId: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [selectedBadgeId, setSelectedBadgeId] = useState("");
  const [busy, setBusy] = useState(false);

  const unassigned = availableBadges.filter(
    (b) => !assignedBadgeIds.includes(b.id),
  );

  if (!unassigned.length) return null;

  return (
    <form
      className="badge-assign-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!selectedBadgeId) return;
        setBusy(true);
        try {
          await onAssign(selectedBadgeId);
          setSelectedBadgeId("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <FormSelect
          value={selectedBadgeId}
          onChange={(e) => setSelectedBadgeId(e.target.value)}
          disabled={disabled || busy}
        >
          <option value="">Rozet seç…</option>
          {unassigned.map((b) => (
            <option key={b.id} value={b.id}>
              {b.tier === 6 ? "★ " : `[R${b.tier}] `} {b.name}
            </option>
          ))}
        </FormSelect>
        <Button
          type="submit"
          disabled={disabled || busy || !selectedBadgeId}
        >
          <Plus size={13} /> Rozet Ata
        </Button>
      </div>
    </form>
  );
}

export function BadgesManager({
  badges,
  onRefresh,
}: {
  badges: Badge[];
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Badge | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const saveBadge = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      name: String(form.get("name") || "").trim(),
      description: String(form.get("description") || "").trim(),
      tier: Number(form.get("tier") || 1),
      color: String(form.get("color") || "#ffffff").trim(),
      icon: String(form.get("icon") || "shield").trim(),
    };
    if (!data.name) return;
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await request(`/admin/badges/${encodeURIComponent(editing.id)}`, data, "PUT");
      } else {
        await request("/admin/badges", data, "POST");
      }
      setEditing(null);
      setCreating(false);
      await onRefresh();
    } catch (err: any) {
      setError(err?.message || "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const deleteBadge = async (id: string) => {
    if (!confirm("Bu rozeti silmek istediğinden emin misin?")) return;
    setBusy(true);
    try {
      await request(`/admin/badges/${encodeURIComponent(id)}`, undefined, "DELETE");
      await onRefresh();
    } catch (err: any) {
      setError(err?.message || "Rozet silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Rozet ve Rütbe Yönetimi"
      description="Takım üyelerine atanabilir 1-6 kademe rozetler. Rank 6 yeşil çerçeveli özel Geliştirici rozetidir."
      className="badges-admin-card"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span>Toplam {badges.length} rozet tanımlı</span>
        {!creating && !editing && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={14} /> Yeni Rozet Ekle
          </Button>
        )}
      </div>

      {error && <p className="member-form-feedback is-error" role="alert">{error}</p>}

      {(creating || editing) && (
        <form onSubmit={saveBadge} style={{ border: "1px solid #ffffff40", padding: "16px", borderRadius: "6px", marginBottom: "16px", display: "grid", gap: "10px" }}>
          <h4>{editing ? `Rozeti Düzenle: ${editing.name}` : "Yeni Rozet Oluştur"}</h4>
          <TextField name="name" label="Rozet Adı" defaultValue={editing?.name || ""} required />
          <TextField name="description" label="Açıklama" defaultValue={editing?.description || ""} />
          <label>
            Kategori / Rütbe (Rank 1-6)
            <FormSelect name="tier" defaultValue={String(editing?.tier || 1)}>
              <option value="1">Rank 1: Ekip Üyesi (Beyaz sade)</option>
              <option value="2">Rank 2: Kıdemli Üye (Gümüş parlak)</option>
              <option value="3">Rank 3: Ekip Lideri (Kehribar sarı)</option>
              <option value="4">Rank 4: Departman Lideri (Gök mavisi)</option>
              <option value="5">Rank 5: Yönetim Kurulu (Mor yıldız)</option>
              <option value="6">Rank 6: Geliştirici Hesabı (#0bde0e Neon Yeşil)</option>
            </FormSelect>
          </label>
          <label>
            İkon
            <FormSelect name="icon" defaultValue={editing?.icon || "shield"}>
              <option value="shield">Kalkan (Shield)</option>
              <option value="crown">Taç (Crown)</option>
              <option value="star">Yıldız (Star)</option>
              <option value="code">Kod / Terminal (Code)</option>
              <option value="award">Madalya (Award)</option>
              <option value="rocket">Roket (Rocket)</option>
              <option value="zap">Şimşek (Zap)</option>
              <option value="sparkles">Işıltı (Sparkles)</option>
              <option value="cpu">İşlemci (Cpu)</option>
            </FormSelect>
          </label>
          <TextField name="color" label="Renk Kodu (HEX)" defaultValue={editing?.color || "#ffffff"} />
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <Button type="submit" disabled={busy}>Kaydet</Button>
            <Button variant="bare" type="button" onClick={() => { setEditing(null); setCreating(false); }}>Vazgeç</Button>
          </div>
        </form>
      )}

      <div className="badges-grid">
        {badges.map((b) => (
          <div className="badge-card" key={b.id}>
            <div className="badge-card__top">
              <BadgePill badge={b} />
              <small style={{ color: "#ffffff70", fontFamily: "monospace" }}>Rank {b.tier}</small>
            </div>
            <p>{b.description || "Açıklama yok"}</p>
            <div className="badge-card__actions">
              <Button variant="bare" onClick={() => setEditing(b)}>
                <Pencil size={13} /> Düzenle
              </Button>
              <Button variant="bare" onClick={() => deleteBadge(b.id)}>
                <Trash2 size={13} /> Sil
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
