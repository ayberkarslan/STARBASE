import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  Button,
  IconButton,
  Panel,
  Dialog,
  TextField,
  TextArea,
  SelectMenu,
  EmptyState,
} from "@stardrop/ui";
import {
  LockKeyhole,
  Users,
  SlidersHorizontal,
  GripHorizontal,
  Plus,
  StickyNote,
  Megaphone,
  Pin,
  Archive,
  ArchiveRestore,
  Pencil,
  Trash2,
  Calendar,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { request } from "./management";
interface Note {
  id: string;
  scope: "private" | "shared";
  x: number;
  y: number;
  layoutVersion: number;
  authorId: string | null;
  authorFirstName: string | null;
  authorLastName: string | null;
  authorUsername: string | null;
  title: string;
  content: string;
  kind: "note" | "announcement";
  teamId: string | null;
  team: string | null;
  dueAt: number | null;
  pinned: number;
  archived: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}
interface Feed {
  notes: Note[];
  canModerate: boolean;
  page: number;
  total: number;
  hasMore: boolean;
}
const messages: Record<string, string> = {
  note_conflict:
    "Bu not başka bir yerde değiştirildi. Taslağını koruyup pencereyi kapat ve güncel notu yeniden aç.",
  permission_denied: "Bu notu değiştirme yetkin yok.",
  note_not_found: "Not artık bulunmuyor. Panoyu yenile.",
  invalid_input: "Başlık ve not metnini kontrol et.",
  invalid_team: "Bu ekip artık kullanılamıyor.",
  try_later: "Çok hızlı işlem yapıyorsun. Biraz bekleyip tekrar dene.",
  team_membership_required: "Panoyu kullanmak için takım üyesi olmalısın.",
  session_expired: "Oturumun sona erdi. Yeniden giriş yap.",
};
const time = (n: number) =>
  new Date(n * 1000).toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
export function BoardNotes(props: {
  currentUserId: string;
  teams: { id: string; name: string; departmentId: string }[];
  scope: "home" | "private" | "shared";
  onScopeChange: (scope: "home" | "private" | "shared") => void;
}) {
  const { scope, onScopeChange } = props;
  const [defaultScope, setDefaultScope] = useState<"home" | "private" | "shared">(
    () => (localStorage.getItem("starbase.board.default") as "home" | "private" | "shared") || "home",
  );
  const [burst, setBurst] = useState(false);
  function makeDefault(next: "home" | "private" | "shared") {
    localStorage.setItem("starbase.board.default", next);
    setDefaultScope(next);
  }
  return (
    <div className="board-desktop">
      <nav className="board-switcher" aria-label="Pano seçimi">
        {([
          ["private", "Kendi panom", LockKeyhole],
          ["home", "Yıldız Roket Takımı", Users],
          ["shared", "Ortak pano", Users],
        ] as const).map(([value, label, Icon]) => (
          <div className="board-switcher__item" key={value}>
            <button className={scope === value ? "active" : ""} onClick={() => onScopeChange(value)}>
              {value === "home" ? <img src="/brand/yrt.png" alt="" /> : <Icon size={14} />}<span>{label}</span>
            </button>
            <button
              className={defaultScope === value ? "board-default locked" : "board-default"}
              aria-label={`${label} varsayılan sayfa yap`}
              title={defaultScope === value ? "Varsayılan görünüm" : "Varsayılan yap"}
              onClick={() => makeDefault(value)}
            ><LockKeyhole size={12} /></button>
          </div>
        ))}
      </nav>
      {scope === "home" ? (
        <div className={burst ? "blank-board star-burst" : "blank-board"} aria-label="Yıldız Roket Takımı">
          <div className="burst-stars" aria-hidden="true">{Array.from({ length: 180 }, (_, index) => <i key={index} style={{ "--x": `${(index * 37) % 100}%`, "--y": `${(index * 61) % 100}%`, "--d": `${(index % 29) * 52}ms`, "--s": `${1 + (index % 4)}px` } as CSSProperties} />)}</div>
          <img src="/brand/yrt.png" alt="Yıldız Roket Takımı" onPointerEnter={() => { setBurst(true); window.setTimeout(() => setBurst(false), 1800); }} />
        </div>
      ) : (
        <BoardCanvas key={scope} {...props} scope={scope} />
      )}
    </div>
  );
}
function BoardCanvas({
  currentUserId,
  teams,
  scope,
}: {
  currentUserId: string;
  teams: { id: string; name: string; departmentId: string }[];
} & { scope: "private" | "shared" }) {
  const [filters, setFilters] = useState(false);
  const [feed, setFeed] = useState<Feed>({
      notes: [],
      canModerate: false,
      page: 1,
      total: 0,
      hasMore: false,
    }),
    [page, setPage] = useState(1),
    [kind, setKind] = useState(""),
    [team, setTeam] = useState(""),
    [archived, setArchived] = useState("0"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [live, setLive] = useState(false),
    [editor, setEditor] = useState<Note | "new" | null>(null),
    [editorError, setEditorError] = useState(""),
    [saving, setSaving] = useState(false),
    [deleteNote, setDeleteNote] = useState<Note | null>(null);
  const sequence = useRef(0),
    socket = useRef<WebSocket | null>(null),
    denied = useRef(false),
    reload = useRef<() => Promise<void>>(async () => {}),
    alive = useRef(true);
  async function load() {
    const id = ++sequence.current;
    setBusy(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        archived,
        scope,
        limit: "200",
      });
      if (kind) params.set("kind", kind);
      if (team) params.set("teamId", team);
      const data = await request("/board/notes?" + params);
      if (alive.current && id === sequence.current) {
        denied.current = false;
        setFeed(data);
        setError("");
      }
    } catch (e) {
      if (!alive.current || id !== sequence.current) return;
      const code = (e as Error).message;
      setError(
        messages[code] ??
          "Notlar yüklenemedi. Bağlantını kontrol edip tekrar dene.",
      );
      if (
        [
          "authentication_required",
          "session_expired",
          "team_membership_required",
          "password_change_required",
          "account_unavailable",
        ].includes(code)
      ) {
        denied.current = true;
        setFeed({
          notes: [],
          canModerate: false,
          page: 1,
          total: 0,
          hasMore: false,
        });
        socket.current?.close();
      }
    } finally {
      if (alive.current && id === sequence.current) setBusy(false);
    }
  }
  reload.current = load;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    load();
  }, [page, kind, team, archived]);
  useEffect(() => {
    let disposed = false,
      attempts = 0;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let repair: ReturnType<typeof setInterval>;
    function connect() {
      if (disposed || document.hidden || denied.current) return;
      if (
        socket.current &&
        (socket.current.readyState === WebSocket.OPEN ||
          socket.current.readyState === WebSocket.CONNECTING)
      )
        return;
      const url = new URL("/api/v1/board/live", location.origin);
      url.searchParams.set("scope", scope);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => {
        if (disposed || socket.current !== ws) {
          ws.close();
          return;
        }
        attempts = 0;
        setLive(true);
        reload.current();
      };
      ws.onmessage = (e) => {
        try {
          if (JSON.parse(e.data).type === "board.changed") reload.current();
        } catch {}
      };
      ws.onclose = () => {
        if (disposed || socket.current !== ws) return;
        socket.current = null;
        setLive(false);
        if (!document.hidden && !denied.current)
          reconnect = setTimeout(
            connect,
            Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)) +
              Math.random() * 500,
          );
      };
      ws.onerror = () => ws.close();
    }
    function visibility() {
      clearTimeout(reconnect);
      const previous = socket.current;
      socket.current = null;
      previous?.close();
      setLive(false);
      if (!document.hidden) {
        denied.current = false;
        reload.current();
        connect();
      }
    }
    document.addEventListener("visibilitychange", visibility);
    connect();
    // Repair a missed invalidation occasionally; disconnected sessions refresh faster.
    let lastRepair = Date.now();
    repair = setInterval(() => {
      if (document.hidden || denied.current) return;
      if (!socket.current || socket.current.readyState === WebSocket.CLOSED)
        connect();
      const interval =
        socket.current?.readyState === WebSocket.OPEN ? 300000 : 30000;
      if (Date.now() - lastRepair >= interval) {
        lastRepair = Date.now();
        reload.current();
      }
    }, 15000);
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      clearInterval(repair);
      document.removeEventListener("visibilitychange", visibility);
      socket.current?.close();
    };
  }, []);
  async function change(note: Note, patch: Record<string, unknown>) {
    setError("");
    try {
      await request(
        "/board/notes/" + note.id,
        { ...patch, version: note.version },
        "PATCH",
      );
      await load();
    } catch (e) {
      const message =
        messages[(e as Error).message] ?? "İşlem tamamlanamadı. Panoyu yenile.";
      await reload.current();
      setError(message);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setEditorError("");
    const date = String(f.get("dueAt") ?? "");
    const payload = {
      ...(editor === "new"
        ? {
            scope,
            x: 40 + (feed.notes.length % 3) * 340,
            y: 40 + Math.floor(feed.notes.length / 3) * 390,
          }
        : {}),
      title: f.get("title"),
      content: f.get("content"),
      kind: f.get("kind"),
      teamId: f.get("teamId") || null,
      dueAt: date
        ? Math.floor(new Date(date + "T23:59:59").getTime() / 1000)
        : null,
    };
    try {
      if (editor === "new") await request("/board/notes", payload);
      else if (editor)
        await request(
          "/board/notes/" + editor.id,
          { ...payload, version: editor.version },
          "PATCH",
        );
      if (editor === "new") {
        setArchived("0");
        setKind("");
        setTeam("");
      }
      setEditor(null);
      setPage(1);
      await load();
    } catch (e) {
      setEditorError(
        messages[(e as Error).message] ??
          "Not kaydedilemedi. Tekrar denemeden önce panoyu kontrol et.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!deleteNote) return;
    setSaving(true);
    try {
      await request(
        "/board/notes/" + deleteNote.id,
        { version: deleteNote.version },
        "DELETE",
      );
      setDeleteNote(null);
      await load();
    } catch (e) {
      setEditorError(messages[(e as Error).message] ?? "Not silinemedi.");
    } finally {
      setSaving(false);
    }
  }
  const editing = editor && editor !== "new" ? editor : null;
  const dateValue = editing?.dueAt
    ? new Date(editing.dueAt * 1000).toLocaleDateString("en-CA")
    : "";
  return (
    <section
      className="board-notes"
      aria-label={scope === "private" ? "Özel not panosu" : "Ortak not panosu"}
    >
      <div className="notes-heading">
        <div>
          <h2>
            {scope === "private"
              ? "Sana ait bir alan."
              : "Birlikte, aynı panoda."}
          </h2>
          <span className="notes-connection" role="status">
            <i className={live ? "connected" : ""} />
            {live ? "Canlı güncelleniyor" : "Bağlantı yeniden kuruluyor"}
          </span>
        </div>
        <div className="notes-tools">
          <IconButton
            label="Pano filtreleri"
            variant="bare"
            aria-expanded={filters}
            onClick={() => setFilters((v) => !v)}
          >
            <SlidersHorizontal size={16} />
          </IconButton>
          <Button
            variant="primary"
            onClick={() => {
              setEditorError("");
              setEditor("new");
            }}
          >
            <Plus size={16} /> Not ekle
          </Button>
        </div>
      </div>
      {filters && (
        <div className="notes-filters">
          <SelectMenu
            label="Not türü"
            value={kind}
            onChange={(v) => {
              setKind(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "Notlar ve duyurular" },
              { value: "note", label: "Notlar" },
              { value: "announcement", label: "Duyurular" },
            ]}
          />
          <SelectMenu
            label="Notların ekibi"
            value={team}
            onChange={(v) => {
              setTeam(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "Tüm ekipler" },
              ...teams.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <SelectMenu
            label="Not durumu"
            value={archived}
            onChange={(v) => {
              setArchived(v);
              setPage(1);
            }}
            options={[
              { value: "0", label: "Aktif notlar" },
              { value: "1", label: "Arşiv" },
            ]}
          />
          <IconButton
            label="Notları yenile"
            variant="bare"
            disabled={busy}
            onClick={() => load()}
          >
            <RefreshCw size={16} />
          </IconButton>
        </div>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <div
        className="board-viewport"
        aria-label="Serbest not alanı"
        tabIndex={0}
      >
        <div
          className="board-surface"
          style={{
            width: Math.max(1400, ...feed.notes.map((n) => n.x + 370)),
            height: Math.max(1000, ...feed.notes.map((n) => n.y + 500)),
          }}
        >
          {feed.notes.length ? (
            <div className="sticky-grid" aria-busy={busy}>
              {feed.notes.map((n) => {
                const own = n.authorId === currentUserId,
                  canEdit = own || feed.canModerate;
                const overdue = n.dueAt !== null && n.dueAt < Date.now() / 1000;
                return (
                  <MovableNote
                    key={n.id}
                    note={n}
                    canMove={canEdit}
                    onMove={async (x, y, layoutVersion) => {
                      try {
                        await request(
                          "/board/notes/" + n.id + "/position",
                          { x, y, layoutVersion },
                          "PATCH",
                        );
                        await reload.current();
                      } catch (e) {
                        setError(
                          (e as Error).message === "note_position_conflict"
                            ? "Not başka bir yerde taşındı. Güncel konumu yüklendi."
                            : "Konum kaydedilemedi. Tekrar dene.",
                        );
                        await reload.current();
                        throw e;
                      }
                    }}
                  >
                    <Panel
                      className={"sticky-note" + (n.pinned ? " is-pinned" : "")}
                      data-note-id={n.id}
                    >
                      <div className="sticky-kicker">
                        <span>
                          {n.kind === "announcement" ? (
                            <Megaphone size={14} />
                          ) : (
                            <StickyNote size={14} />
                          )}{" "}
                          {n.kind === "announcement" ? "Duyuru" : "Not"}
                        </span>
                        {n.pinned > 0 && (
                          <span>
                            <Pin size={13} /> Sabit
                          </span>
                        )}
                      </div>
                      <h3>{n.title}</h3>
                      <p className="sticky-content">{n.content}</p>
                      {n.team && <span className="sticky-team">{n.team}</span>}
                      {n.dueAt !== null && (
                        <span
                          className={
                            "sticky-deadline" + (overdue ? " overdue" : "")
                          }
                        >
                          <Calendar size={13} />
                          {new Date(n.dueAt * 1000).toLocaleDateString("tr-TR")}
                          {overdue ? " · Tarihi geçti" : ""}
                        </span>
                      )}
                      <div className="sticky-author">
                        <span>
                          {n.authorFirstName
                            ? [n.authorFirstName, n.authorLastName].join(" ")
                            : "Eski üye"}
                        </span>
                        <time
                          dateTime={new Date(n.updatedAt * 1000).toISOString()}
                          title={n.version > 1 ? "Düzenlendi" : "Oluşturuldu"}
                        >
                          {time(n.updatedAt)}
                          {n.version > 1 ? " · Düzenlendi" : ""}
                        </time>
                      </div>
                      {canEdit && (
                        <div className="sticky-actions">
                          {feed.canModerate && (
                            <IconButton
                              label={
                                n.pinned ? "Sabitlemeyi kaldır" : "Notu sabitle"
                              }
                              size="sm"
                              variant="bare"
                              onClick={() => change(n, { pinned: !n.pinned })}
                            >
                              <Pin size={15} />
                            </IconButton>
                          )}
                          <IconButton
                            label="Notu düzenle"
                            size="sm"
                            variant="bare"
                            onClick={() => {
                              setEditorError("");
                              setEditor(n);
                            }}
                          >
                            <Pencil size={15} />
                          </IconButton>
                          <IconButton
                            label={
                              n.archived ? "Notu geri getir" : "Notu arşivle"
                            }
                            size="sm"
                            variant="bare"
                            onClick={() => change(n, { archived: !n.archived })}
                          >
                            {n.archived ? (
                              <ArchiveRestore size={15} />
                            ) : (
                              <Archive size={15} />
                            )}
                          </IconButton>
                          <IconButton
                            label="Notu sil"
                            size="sm"
                            variant="bare"
                            onClick={() => {
                              setEditorError("");
                              setDeleteNote(n);
                            }}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      )}
                    </Panel>
                  </MovableNote>
                );
              })}
            </div>
          ) : (
            !busy &&
            !error && (
              <EmptyState
                title={
                  archived === "1" ? "Arşivde not yok" : "İlk notu sen bırak"
                }
                description={
                  scope === "private"
                    ? "Yalnızca senin gördüğün notlar. Ekle, başlığından tut ve istediğin yere bırak."
                    : "Ekip notları ve duyurular için ortak alanımız. Kendi notlarını başlığından tutup taşı."
                }
              />
            )
          )}
        </div>
      </div>
      {(feed.hasMore || page > 1) && (
        <div className="directory-pagination">
          <Button
            disabled={busy || page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={15} /> Önceki
          </Button>
          <span>Sayfa {page}</span>
          <Button
            disabled={busy || !feed.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Sonraki <ChevronRight size={15} />
          </Button>
        </div>
      )}
      <Dialog
        open={editor !== null}
        title={editor === "new" ? "Panoya not ekle" : "Notu düzenle"}
        description={
          scope === "private"
            ? "Bu not yalnızca senin panonda görünecek."
            : "Takım üyelerinin tamamı bu notu görebilir."
        }
        onClose={() => {
          if (!saving) setEditor(null);
        }}
      >
        {editor !== null && (
          <NoteForm
            key={editing?.id ?? "new"}
            note={editing}
            teams={teams}
            onSubmit={save}
            dateValue={dateValue}
            error={editorError}
            saving={saving}
          />
        )}
      </Dialog>
      <Dialog
        open={!!deleteNote}
        title="Notu sil"
        description="Bu not kalıcı olarak silinecek. Saklamak istersen arşivleyebilirsin."
        onClose={() => {
          if (!saving) setDeleteNote(null);
        }}
      >
        {editorError && (
          <p className="message error" role="alert">
            {editorError}
          </p>
        )}
        <Button variant="danger" loading={saving} onClick={remove}>
          Kalıcı olarak sil
        </Button>
      </Dialog>
    </section>
  );
}
function NoteForm({
  note,
  teams,
  onSubmit,
  dateValue,
  error,
  saving,
}: {
  note: Note | null;
  teams: { id: string; name: string }[];
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  dateValue: string;
  error: string;
  saving: boolean;
}) {
  const [kind, setKind] = useState(note?.kind ?? "note"),
    [team, setTeam] = useState(note?.teamId ?? "");
  return (
    <form onSubmit={onSubmit}>
      <TextField
        name="title"
        label="Başlık"
        defaultValue={note?.title ?? ""}
        maxLength={120}
        required
      />
      <TextArea
        name="content"
        label="Not"
        defaultValue={note?.content ?? ""}
        maxLength={2000}
        required
      />
      <input type="hidden" name="kind" value={kind} />
      <SelectMenu
        label="Not veya duyuru"
        value={kind}
        onChange={(v) => setKind(v as "note" | "announcement")}
        options={[
          { value: "note", label: "Not" },
          { value: "announcement", label: "Duyuru" },
        ]}
      />
      <input type="hidden" name="teamId" value={team} />
      <SelectMenu
        label="İlgili ekip"
        value={team}
        onChange={setTeam}
        options={[
          { value: "", label: "Tüm takım" },
          ...teams.map((t) => ({ value: t.id, label: t.name })),
        ]}
      />
      <TextField
        name="dueAt"
        label="Son tarih (isteğe bağlı)"
        type="date"
        defaultValue={dateValue}
      />
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={saving}>
        {note ? "Değişiklikleri kaydet" : "Panoya ekle"}
      </Button>
    </form>
  );
}

function MovableNote({
  note,
  canMove,
  onMove,
  children,
}: {
  note: Note;
  canMove: boolean;
  onMove: (x: number, y: number, layoutVersion: number) => Promise<void>;
  children: ReactNode;
}) {
  const [position, setPosition] = useState({ x: note.x, y: note.y });
  const [moving, setMoving] = useState(false);
  const [pending, setPending] = useState(false);
  const drag = useRef<{
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    pointerId: number;
    layoutVersion: number;
  } | null>(null);
  const positionRef = useRef(position);
  const move = (p: { x: number; y: number }) => {
    positionRef.current = p;
    setPosition(p);
  };
  useEffect(() => {
    if (!drag.current) move({ x: note.x, y: note.y });
  }, [note.x, note.y, note.layoutVersion]);
  const commit = async (layoutVersion = note.layoutVersion) => {
    const p = positionRef.current;
    setPending(true);
    try {
      await onMove(p.x, p.y, layoutVersion);
    } catch {
      move({ x: note.x, y: note.y });
    } finally {
      setPending(false);
    }
  };
  return (
    <div
      className={"movable-note" + (moving ? " is-moving" : "")}
      style={{
        transform: `translate(${position.x}px,${position.y}px)`,
        zIndex: moving ? 100 : undefined,
      }}
    >
      <button
        className="note-grip"
        aria-label={note.title + " notunu taşı"}
        title="Sürükle veya yön tuşlarıyla taşı (Shift: büyük adım)"
        disabled={!canMove || pending}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            ...position,
            pointerId: e.pointerId,
            layoutVersion: note.layoutVersion,
          };
          setMoving(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.pointerId !== e.pointerId) return;
          move({
            x: Math.round(
              Math.max(0, Math.min(20000, d.x + e.clientX - d.clientX)),
            ),
            y: Math.round(
              Math.max(0, Math.min(20000, d.y + e.clientY - d.clientY)),
            ),
          });
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const d = drag.current;
          drag.current = null;
          setMoving(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (d.x !== positionRef.current.x || d.y !== positionRef.current.y)
            void commit(d.layoutVersion);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setMoving(false);
          move({ x: note.x, y: note.y });
        }}
        onLostPointerCapture={() => {
          if (drag.current) {
            drag.current = null;
            setMoving(false);
            move({ x: note.x, y: note.y });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            drag.current = null;
            setMoving(false);
            move({ x: note.x, y: note.y });
            return;
          }
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          };
          const d = directions[e.key];
          if (!d || e.repeat) return;
          e.preventDefault();
          const step = e.shiftKey ? 40 : 10;
          move({
            x: Math.max(0, Math.min(20000, position.x + d[0] * step)),
            y: Math.max(0, Math.min(20000, position.y + d[1] * step)),
          });
          void commit();
        }}
      >
        <GripHorizontal size={18} />
      </button>
      {children}
    </div>
  );
}
