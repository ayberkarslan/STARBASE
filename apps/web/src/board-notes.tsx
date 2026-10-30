import { useEffect, useRef, useState, type FormEvent } from "react";
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
import "./board-notes.css";
interface Note {
  id: string;
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
export function BoardNotes({
  currentUserId,
  teams,
}: {
  currentUserId: string;
  teams: { id: string; name: string; departmentId: string }[];
}) {
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
      const params = new URLSearchParams({ page: String(page), archived });
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
    <section className="board-notes" aria-label="Ortak not panosu">
      <div className="notes-heading">
        <div>
          <h2>Ortak not panosu</h2>
          <span className="notes-connection" role="status">
            <i className={live ? "connected" : ""} />
            {live ? "Canlı güncelleniyor" : "Bağlantı yeniden kuruluyor"}
          </span>
        </div>
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
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {feed.notes.length ? (
        <div className="sticky-grid" aria-busy={busy}>
          {feed.notes.map((n) => {
            const own = n.authorId === currentUserId,
              canEdit = own || feed.canModerate;
            const overdue = n.dueAt !== null && n.dueAt < Date.now() / 1000;
            return (
              <Panel
                key={n.id}
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
                    className={"sticky-deadline" + (overdue ? " overdue" : "")}
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
                        label={n.pinned ? "Sabitlemeyi kaldır" : "Notu sabitle"}
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
                      label={n.archived ? "Notu geri getir" : "Notu arşivle"}
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
            );
          })}
        </div>
      ) : (
        !busy &&
        !error && (
          <EmptyState
            title={archived === "1" ? "Arşivde not yok" : "İlk notu sen bırak"}
            description="Test hazırlıkları, toplantı duyuruları ve ekip notları burada ortaklaşa paylaşılır."
          />
        )
      )}
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
        onClose={() => {
          if (!saving) setEditor(null);
        }}
      >
        <NoteForm
          key={editing?.id ?? "new"}
          note={editing}
          teams={teams}
          onSubmit={save}
          dateValue={dateValue}
          error={editorError}
          saving={saving}
        />
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
