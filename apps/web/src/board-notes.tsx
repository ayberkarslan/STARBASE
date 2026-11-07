import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
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
  LockKeyholeOpen,
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
  ChevronDown,
  AppWindow,
  Type,
  MoveUpRight,
  PenTool,
  CheckSquare,
  Square,
  ArrowUpRight,
  Minus,
  BoxSelect,
  X,
  Settings,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
} from "lucide-react";
import { request } from "./management";

type BoardItemType =
  | "note"
  | "announcement"
  | "shortcut"
  | "text"
  | "drawing"
  | "checklist";

type DrawTool = "arrow" | "line" | "rect" | "pen";
type StrokeStyle = "solid" | "dashed";

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface DrawingPoint {
  x: number;
  y: number;
}

interface BoardApp {
  id: string;
  name: string;
  logoUrl: string;
  launchUrl: string;
}

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
  itemType?: BoardItemType;
  itemData?: Record<string, unknown>;
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

type NoteRestoreSnapshot = {
  scope: "private" | "shared";
  x: number;
  y: number;
  title: string;
  content: string;
  kind: "note" | "announcement";
  itemType: BoardItemType;
  itemData: Record<string, unknown>;
  teamId: string | null;
  dueAt: number | null;
};

type BoardHistoryAction =
  | {
      kind: "create";
      noteIds: string[];
      snapshots: NoteRestoreSnapshot[];
    }
  | {
      kind: "delete";
      noteIds: string[];
      snapshots: NoteRestoreSnapshot[];
    }
  | {
      kind: "move";
      moves: {
        id: string;
        fromX: number;
        fromY: number;
        toX: number;
        toY: number;
      }[];
    }
  | {
      kind: "patch";
      patches: {
        id: string;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
      }[];
    };

function snapshotFromNote(
  note: Note,
  scope: "private" | "shared",
): NoteRestoreSnapshot {
  return {
    scope,
    x: note.x,
    y: note.y,
    title: note.title,
    content: note.content,
    kind: note.kind === "announcement" ? "announcement" : "note",
    itemType: resolveItemType(note),
    itemData: { ...(note.itemData ?? {}) },
    teamId: note.teamId ?? null,
    dueAt: note.dueAt ?? null,
  };
}

function getNoteDimensions(note: Note): { width: number; height: number } {
  const type = resolveItemType(note);
  if (type === "drawing") {
    const w = note.itemData?.width;
    const h = note.itemData?.height;
    return {
      width: typeof w === "number" && w >= 32 ? w : 180,
      height: typeof h === "number" && h >= 32 ? h : 120,
    };
  }
  if (type === "text") {
    return { width: 250, height: 96 };
  }
  return { width: 300, height: 260 };
}

const messages: Record<string, string> = {
  note_conflict:
    "Bu öğe başka bir yerde değiştirildi. Pencereyi kapatıp güncel panoyu kontrol et.",
  permission_denied: "Bu öğeyi değiştirme yetkin yok.",
  note_not_found: "Öğe artık bulunmuyor. Panoyu yenile.",
  invalid_input: "Başlık ve içerik alanlarını kontrol et.",
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

function resolveItemType(note: Note): BoardItemType {
  if (
    note.itemType &&
    [
      "note",
      "announcement",
      "shortcut",
      "text",
      "drawing",
      "checklist",
    ].includes(note.itemType)
  ) {
    return note.itemType;
  }
  return note.kind === "announcement" ? "announcement" : "note";
}

function buildPersonalLaunchUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      parsed.searchParams.set("starbase_login", "1");
      return parsed.href;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export function BoardNotes(props: {
  currentUserId: string;
  teams: { id: string; name: string; departmentId: string }[];
  scope: "home" | "private" | "shared";
  onScopeChange: (scope: "home" | "private" | "shared") => void;
}) {
  const { scope, onScopeChange } = props;
  const [defaultScope, setDefaultScope] = useState<
    "home" | "private" | "shared"
  >(
    () =>
      (localStorage.getItem("starbase.board.default") as
        | "home"
        | "private"
        | "shared") || "home",
  );
  function makeDefault(next: "home" | "private" | "shared") {
    localStorage.setItem("starbase.board.default", next);
    setDefaultScope(next);
  }
  return (
    <div className="board-desktop">
      <nav className="board-switcher" aria-label="Pano seçimi">
        {(
          [
            ["private", "Kendi panom", LockKeyhole],
            ["home", "Yıldız Roket Takımı", Users],
            ["shared", "Ortak pano", Users],
          ] as const
        ).map(([value, label, Icon]) => (
          <div className="board-switcher__item" key={value}>
            <button
              className={scope === value ? "active" : ""}
              onClick={() => onScopeChange(value)}
            >
              {value === "home" ? (
                <img src="/brand/yrt.png" alt="" />
              ) : (
                <Icon size={14} />
              )}
              <span>{label}</span>
            </button>
            <button
              className={
                defaultScope === value
                  ? "board-default locked"
                  : "board-default"
              }
              aria-label={`${label} varsayılan sayfa yap`}
              title={
                defaultScope === value ? "Varsayılan görünüm" : "Varsayılan yap"
              }
              onClick={() => makeDefault(value)}
            >
              {defaultScope === value ? (
                <LockKeyhole size={12} />
              ) : (
                <LockKeyholeOpen size={12} />
              )}
            </button>
          </div>
        ))}
      </nav>
      {scope === "home" ? (
        <div
          className="blank-board star-burst"
          aria-label="Yıldız Roket Takımı"
        >
          <div className="burst-stars" aria-hidden="true">
            {Array.from({ length: 700 }, (_, index) => {
              const random = (seed: number) =>
                (Math.sin(seed * 12.9898) * 43758.5453) % 1;
              const value = (seed: number) => Math.abs(random(seed));
              return (
                <i
                  key={index}
                  style={
                    {
                      "--x": `${value(index + 1) * 100}%`,
                      "--y": `${value(index + 701) * 100}%`,
                      "--d": `-${value(index + 311) * 10}s`,
                      "--s": `${0.55 + value(index + 97) * 1.05}px`,
                      "--t": `${7 + value(index + 509) * 5}s`,
                    } as CSSProperties
                  }
                />
              );
            })}
          </div>
          <div className="launch-mark">
            <img src="/brand/yrt.png" alt="Yıldız Roket Takımı" />
            <svg
              className="launch-engine"
              viewBox="0 0 80 120"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="exhaust-core" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity=".96" />
                  <stop offset=".38" stopColor="#fff" stopOpacity=".7" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                className="engine-plume outer"
                d="M26 4h28c-1 25-13 47-14 82C39 51 27 29 26 4z"
              />
              <path
                className="engine-plume core"
                d="M34 4h12c-1 20-5 39-6 66-1-27-5-46-6-66z"
              />
              <path
                className="engine-wave"
                d="M30 25c6 4 14 4 20 0M27 46c8 5 18 5 26 0"
              />
            </svg>
          </div>
        </div>
      ) : (
        <BoardCanvas key={scope} {...props} scope={scope} />
      )}
    </div>
  );
}

type EditorModalState =
  | { mode: "create"; itemType: Exclude<BoardItemType, "drawing"> }
  | { mode: "edit"; note: Note }
  | null;

function BoardCanvas({
  currentUserId,
  teams,
  scope,
}: {
  currentUserId: string;
  teams: { id: string; name: string; departmentId: string }[];
} & { scope: "private" | "shared" }) {
  const [filters, setFilters] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const [apps, setApps] = useState<BoardApp[]>([]);
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
    [editor, setEditor] = useState<EditorModalState>(null),
    [editorError, setEditorError] = useState(""),
    [saving, setSaving] = useState(false),
    [deleteNote, setDeleteNote] = useState<Note | null>(null);

  // Canvas drawing, zoom, marquee multi-selection & undo/redo state
  const [drawMode, setDrawMode] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>("arrow");
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>("solid");
  const [activeDraft, setActiveDraft] = useState<{
    tool: DrawTool;
    strokeStyle: StrokeStyle;
    points: DrawingPoint[];
  } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    pointerId: number;
    additive: boolean;
    initialSelected: Set<string>;
  } | null>(null);
  const [multiDrag, setMultiDrag] = useState<{
    leaderId: string;
    dx: number;
    dy: number;
  } | null>(null);
  const [undoStack, setUndoStack] = useState<BoardHistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<BoardHistoryAction[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef<Note[]>(feed.notes);
  notesRef.current = feed.notes;

  function pushHistory(action: BoardHistoryAction) {
    setUndoStack((prev) => [...prev.slice(-39), action]);
    setRedoStack([]);
  }

  const sequence = useRef(0),
    socket = useRef<WebSocket | null>(null),
    denied = useRef(false),
    reload = useRef<() => Promise<void>>(async () => {}),
    alive = useRef(true);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/apps")
      .then((res) => (res.ok ? (res.json() as Promise<BoardApp[]>) : []))
      .then((list) => {
        if (active && Array.isArray(list)) setApps(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [addMenuOpen]);

  useEffect(() => {
    if (!drawMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveDraft(null);
        setDrawMode(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawMode]);

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
          "Pano öğeleri yüklenemedi. Bağlantını kontrol edip tekrar dene.",
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

  async function change(
    note: Note,
    patch: Record<string, unknown>,
    recordHistory = true,
  ) {
    setError("");
    const before: Record<string, unknown> = {};
    if ("pinned" in patch) before.pinned = Boolean(note.pinned);
    if ("archived" in patch) before.archived = Boolean(note.archived);
    if ("itemType" in patch) before.itemType = resolveItemType(note);
    if ("itemData" in patch) before.itemData = { ...(note.itemData ?? {}) };
    try {
      await request(
        "/board/notes/" + note.id,
        { ...patch, version: note.version },
        "PATCH",
      );
      if (recordHistory && Object.keys(before).length) {
        pushHistory({
          kind: "patch",
          patches: [{ id: note.id, before, after: patch }],
        });
      }
      await load();
    } catch (e) {
      const message =
        messages[(e as Error).message] ?? "İşlem tamamlanamadı. Panoyu yenile.";
      await reload.current();
      setError(message);
    }
  }

  function getNoteZIndex(note: Note): number {
    const raw = note.itemData?.zIndex;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return Math.max(1, Math.min(900, Math.round(raw)));
    }
    return resolveItemType(note) === "drawing" ? 5 : 10;
  }

  async function changeLayer(
    note: Note,
    direction: "front" | "forward" | "backward" | "back",
  ) {
    const allZ = feed.notes.map(getNoteZIndex);
    const maxZ = allZ.length ? Math.max(...allZ) : 10;
    const minZ = allZ.length ? Math.min(...allZ) : 2;
    const currentZ = getNoteZIndex(note);
    const nextZ =
      direction === "front"
        ? Math.min(900, maxZ + 1)
        : direction === "forward"
          ? Math.min(900, currentZ + 1)
          : direction === "backward"
            ? Math.max(1, currentZ - 1)
            : Math.max(1, minZ - 1);
    await change(note, {
      itemType: resolveItemType(note),
      itemData: { ...(note.itemData ?? {}), zIndex: nextZ },
    });
  }

  async function changeLayerSelected(direction: "front" | "back") {
    const targets = feed.notes.filter(
      (n) =>
        selectedIds.has(n.id) &&
        (n.authorId === currentUserId || feed.canModerate),
    );
    if (!targets.length) return;
    const allZ = feed.notes.map(getNoteZIndex);
    const maxZ = allZ.length ? Math.max(...allZ) : 10;
    const minZ = allZ.length ? Math.min(...allZ) : 2;
    const nextZ =
      direction === "front" ? Math.min(900, maxZ + 1) : Math.max(1, minZ - 1);
    const patches: {
      id: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    }[] = [];
    try {
      for (const n of targets) {
        const before = {
          itemType: resolveItemType(n),
          itemData: { ...(n.itemData ?? {}) },
        };
        const after = {
          itemType: resolveItemType(n),
          itemData: { ...(n.itemData ?? {}), zIndex: nextZ },
        };
        await request(
          "/board/notes/" + n.id,
          { ...after, version: n.version },
          "PATCH",
        );
        patches.push({ id: n.id, before, after });
      }
      if (patches.length) {
        pushHistory({ kind: "patch", patches });
      }
      await load();
    } catch {
      await reload.current();
    }
  }

  function nextCanvasPosition(itemType: BoardItemType = "note") {
    const vp = viewportRef.current;
    const halfW = itemType === "text" ? 120 : 150;
    const halfH = itemType === "text" ? 45 : 125;
    let x = vp
      ? Math.round((vp.scrollLeft + vp.clientWidth / 2) / zoom - halfW)
      : 160;
    let y = vp
      ? Math.round((vp.scrollTop + vp.clientHeight / 2) / zoom - halfH)
      : 120;
    x = Math.max(32, Math.min(19500, x));
    y = Math.max(32, Math.min(19500, y));
    for (let attempt = 0; attempt < 12; attempt++) {
      const collision = feed.notes.some(
        (n) => Math.abs(n.x - x) < 28 && Math.abs(n.y - y) < 28,
      );
      if (!collision) break;
      x = Math.min(19500, x + 28);
      y = Math.min(19500, y + 28);
    }
    return { x, y };
  }

  function applyZoom(next: number) {
    const clamped = Math.max(0.3, Math.min(1.8, Math.round(next * 100) / 100));
    setZoom(clamped);
  }

  function fitBoardOverview() {
    const vp = viewportRef.current;
    if (!vp || !feed.notes.length) {
      setZoom(1);
      vp?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
      return;
    }
    const maxX = Math.max(...feed.notes.map((n) => n.x + 340), 900);
    const maxY = Math.max(...feed.notes.map((n) => n.y + 320), 600);
    const scaleX = (vp.clientWidth - 64) / maxX;
    const scaleY = (vp.clientHeight - 64) / maxY;
    const fitted = Math.max(0.3, Math.min(1, Math.min(scaleX, scaleY)));
    setZoom(Math.round(fitted * 100) / 100);
    vp.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }

  async function submitEditorPayload(payload: {
    title: string;
    content: string;
    kind: "note" | "announcement";
    itemType: BoardItemType;
    itemData?: Record<string, unknown>;
    teamId: string | null;
    dueAt: number | null;
  }) {
    if (!editor) return;
    setSaving(true);
    setEditorError("");
    try {
      if (editor.mode === "create") {
        const pos = nextCanvasPosition(payload.itemType);
        const allZ = feed.notes.map(getNoteZIndex);
        const topZ = allZ.length ? Math.min(900, Math.max(...allZ) + 1) : 10;
        const itemData = { ...(payload.itemData ?? {}), zIndex: topZ };
        const snapshot: NoteRestoreSnapshot = {
          scope,
          x: pos.x,
          y: pos.y,
          ...payload,
          itemData,
        };
        const created = (await request("/board/notes", snapshot)) as {
          id?: string;
        };
        if (created?.id) {
          pushHistory({
            kind: "create",
            noteIds: [created.id],
            snapshots: [snapshot],
          });
        }
        setArchived("0");
        setKind("");
        setTeam("");
      } else {
        const before = {
          title: editor.note.title,
          content: editor.note.content,
          kind: editor.note.kind,
          itemType: resolveItemType(editor.note),
          itemData: { ...(editor.note.itemData ?? {}) },
          teamId: editor.note.teamId,
          dueAt: editor.note.dueAt,
        };
        const after = {
          ...payload,
          itemData: {
            ...(editor.note.itemData ?? {}),
            ...(payload.itemData ?? {}),
          },
        };
        await request(
          "/board/notes/" + editor.note.id,
          {
            ...after,
            version: editor.note.version,
          },
          "PATCH",
        );
        pushHistory({
          kind: "patch",
          patches: [{ id: editor.note.id, before, after }],
        });
      }
      setEditor(null);
      setPage(1);
      await load();
    } catch (e) {
      setEditorError(
        messages[(e as Error).message] ??
          "Öğe kaydedilemedi. Tekrar denemeden önce panoyu kontrol et.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function commitDrawing(draft: {
    tool: DrawTool;
    strokeStyle: StrokeStyle;
    points: DrawingPoint[];
  }) {
    if (draft.points.length < 2) return;
    const xs = draft.points.map((p) => p.x);
    const ys = draft.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.hypot(maxX - minX, maxY - minY);
    if (span < 12) return;

    const pad = 20;
    const boxX = Math.max(0, Math.round(minX - pad));
    const boxY = Math.max(0, Math.round(minY - pad));
    const width = Math.max(48, Math.round(maxX - minX + pad * 2));
    const height = Math.max(48, Math.round(maxY - minY + pad * 2));
    const relativePoints = draft.points.map((p) => ({
      x: Math.round(p.x - boxX),
      y: Math.round(p.y - boxY),
    }));

    const labelMap: Record<DrawTool, string> = {
      arrow: "Pano oku",
      line: "Pano çizgisi",
      rect: "Vurgu çerçevesi",
      pen: "Serbest çizim",
    };

    const allZ = feed.notes.map(getNoteZIndex);
    const topZ = allZ.length ? Math.min(900, Math.max(...allZ) + 1) : 12;

    const snapshot: NoteRestoreSnapshot = {
      scope,
      x: boxX,
      y: boxY,
      title: labelMap[draft.tool],
      content: labelMap[draft.tool],
      kind: "note",
      itemType: "drawing",
      itemData: {
        tool: draft.tool,
        strokeStyle: draft.strokeStyle,
        width,
        height,
        points: relativePoints,
        zIndex: topZ,
      },
      teamId: null,
      dueAt: null,
    };

    try {
      const created = (await request("/board/notes", snapshot)) as {
        id?: string;
      };
      if (created?.id) {
        pushHistory({
          kind: "create",
          noteIds: [created.id],
          snapshots: [snapshot],
        });
      }
      await load();
    } catch (e) {
      setError(
        messages[(e as Error).message] ?? "Çizim kaydedilemedi. Tekrar dene.",
      );
    }
  }

  async function remove() {
    if (!deleteNote) return;
    setSaving(true);
    try {
      const snap = snapshotFromNote(deleteNote, scope);
      await request(
        "/board/notes/" + deleteNote.id,
        { version: deleteNote.version },
        "DELETE",
      );
      pushHistory({
        kind: "delete",
        noteIds: [],
        snapshots: [snap],
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteNote.id);
        return next;
      });
      setDeleteNote(null);
      await load();
    } catch (e) {
      setEditorError(messages[(e as Error).message] ?? "Öğe silinemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelected() {
    const targets = feed.notes.filter(
      (n) =>
        selectedIds.has(n.id) &&
        (n.authorId === currentUserId || feed.canModerate),
    );
    if (!targets.length) return;
    setSaving(true);
    setError("");
    const snapshots: NoteRestoreSnapshot[] = [];
    try {
      for (const n of targets) {
        const snap = snapshotFromNote(n, scope);
        await request(
          "/board/notes/" + n.id,
          { version: n.version },
          "DELETE",
        );
        snapshots.push(snap);
      }
      if (snapshots.length) {
        pushHistory({
          kind: "delete",
          noteIds: [],
          snapshots,
        });
      }
      setSelectedIds(new Set());
      await load();
    } catch (e) {
      setError(
        messages[(e as Error).message] ??
          "Seçilen öğelerden bazıları silinemedi.",
      );
      await reload.current();
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (historyBusy || !undoStack.length) return;
    const action = undoStack[undoStack.length - 1];
    setHistoryBusy(true);
    setError("");
    try {
      if (action.kind === "create") {
        for (const id of action.noteIds) {
          const liveNote = notesRef.current.find((n) => n.id === id);
          await request(
            "/board/notes/" + id,
            { version: liveNote?.version ?? 1 },
            "DELETE",
          );
        }
        setUndoStack((prev) => prev.slice(0, -1));
        setRedoStack((prev) => [...prev, action]);
      } else if (action.kind === "delete") {
        const createdIds: string[] = [];
        for (const snap of action.snapshots) {
          const created = (await request("/board/notes", snap)) as {
            id?: string;
          };
          if (created?.id) createdIds.push(created.id);
        }
        setUndoStack((prev) => prev.slice(0, -1));
        setRedoStack((prev) => [...prev, { ...action, noteIds: createdIds }]);
      } else if (action.kind === "move") {
        for (const m of action.moves) {
          const liveNote = notesRef.current.find((n) => n.id === m.id);
          if (!liveNote) continue;
          await request(
            "/board/notes/" + m.id + "/position",
            {
              x: m.fromX,
              y: m.fromY,
              layoutVersion: liveNote.layoutVersion,
            },
            "PATCH",
          );
        }
        setUndoStack((prev) => prev.slice(0, -1));
        setRedoStack((prev) => [...prev, action]);
      } else if (action.kind === "patch") {
        for (const p of action.patches) {
          const liveNote = notesRef.current.find((n) => n.id === p.id);
          if (!liveNote) continue;
          await request(
            "/board/notes/" + p.id,
            { ...p.before, version: liveNote.version },
            "PATCH",
          );
        }
        setUndoStack((prev) => prev.slice(0, -1));
        setRedoStack((prev) => [...prev, action]);
      }
      await load();
    } catch {
      await reload.current();
    } finally {
      setHistoryBusy(false);
    }
  }

  async function redo() {
    if (historyBusy || !redoStack.length) return;
    const action = redoStack[redoStack.length - 1];
    setHistoryBusy(true);
    setError("");
    try {
      if (action.kind === "create") {
        const createdIds: string[] = [];
        for (const snap of action.snapshots) {
          const created = (await request("/board/notes", snap)) as {
            id?: string;
          };
          if (created?.id) createdIds.push(created.id);
        }
        setRedoStack((prev) => prev.slice(0, -1));
        setUndoStack((prev) => [...prev, { ...action, noteIds: createdIds }]);
      } else if (action.kind === "delete") {
        for (const id of action.noteIds) {
          const liveNote = notesRef.current.find((n) => n.id === id);
          await request(
            "/board/notes/" + id,
            { version: liveNote?.version ?? 1 },
            "DELETE",
          );
        }
        setRedoStack((prev) => prev.slice(0, -1));
        setUndoStack((prev) => [...prev, action]);
      } else if (action.kind === "move") {
        for (const m of action.moves) {
          const liveNote = notesRef.current.find((n) => n.id === m.id);
          if (!liveNote) continue;
          await request(
            "/board/notes/" + m.id + "/position",
            {
              x: m.toX,
              y: m.toY,
              layoutVersion: liveNote.layoutVersion,
            },
            "PATCH",
          );
        }
        setRedoStack((prev) => prev.slice(0, -1));
        setUndoStack((prev) => [...prev, action]);
      } else if (action.kind === "patch") {
        for (const p of action.patches) {
          const liveNote = notesRef.current.find((n) => n.id === p.id);
          if (!liveNote) continue;
          await request(
            "/board/notes/" + p.id,
            { ...p.after, version: liveNote.version },
            "PATCH",
          );
        }
        setRedoStack((prev) => prev.slice(0, -1));
        setUndoStack((prev) => [...prev, action]);
      }
      await load();
    } catch {
      await reload.current();
    } finally {
      setHistoryBusy(false);
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editor !== null || deleteNote !== null) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        void undo();
        return;
      }
      if (
        (mod && e.key.toLowerCase() === "y") ||
        (mod && e.key.toLowerCase() === "z" && e.shiftKey)
      ) {
        e.preventDefault();
        void redo();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        e.preventDefault();
        void removeSelected();
        return;
      }
      if (e.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function openCreate(itemType: Exclude<BoardItemType, "drawing">) {
    setAddMenuOpen(false);
    setDrawMode(false);
    setEditorError("");
    setEditor({ mode: "create", itemType });
  }

  function startDrawingMode(tool: DrawTool) {
    setAddMenuOpen(false);
    setDrawTool(tool);
    setDrawMode(true);
  }

  function surfaceCoordinates(e: ReactPointerEvent<HTMLDivElement>): DrawingPoint {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(20000, Math.round((e.clientX - rect.left) / zoom))),
      y: Math.max(0, Math.min(20000, Math.round((e.clientY - rect.top) / zoom))),
    };
  }

  const surfaceWidth = Math.max(2200, ...feed.notes.map((n) => n.x + 480));
  const surfaceHeight = Math.max(1400, ...feed.notes.map((n) => n.y + 540));

  const editingNote = editor?.mode === "edit" ? editor.note : null;
  const activeModalType: Exclude<BoardItemType, "drawing"> =
    editor?.mode === "create"
      ? editor.itemType
      : editingNote
        ? (resolveItemType(editingNote) as Exclude<BoardItemType, "drawing">)
        : "note";

  const modalTitle =
    editor?.mode === "edit"
      ? "Pano öğesini düzenle"
      : activeModalType === "shortcut"
        ? "Uygulama kısayolu ekle"
        : activeModalType === "text"
          ? "Panoya serbest yazı ekle"
          : activeModalType === "checklist"
            ? "Kontrol listesi ekle"
            : activeModalType === "announcement"
              ? "Ekip duyurusu ekle"
              : "Panoya yapışkan not ekle";

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
          <div className="board-zoom-bar" role="group" aria-label="Geri al, ileri al ve pano ölçeği">
            <button
              type="button"
              title="Son işlemi geri al (Ctrl+Z)"
              aria-label="Geri al"
              disabled={!undoStack.length || historyBusy}
              onClick={() => void undo()}
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              title="İleri al (Ctrl+Y)"
              aria-label="İleri al"
              disabled={!redoStack.length || historyBusy}
              onClick={() => void redo()}
            >
              <Redo2 size={14} />
            </button>
            <button
              type="button"
              title="Panoyu küçült (uzaklaştır)"
              aria-label="Panoyu küçült"
              disabled={zoom <= 0.35}
              onClick={() => applyZoom(zoom - 0.15)}
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              className="board-zoom-bar__value"
              title="Ölçeği %100 yap"
              onClick={() => applyZoom(1)}
            >
              %{Math.round(zoom * 100)}
            </button>
            <button
              type="button"
              title="Panoyu büyüt (yakınlaştır)"
              aria-label="Panoyu büyüt"
              disabled={zoom >= 1.75}
              onClick={() => applyZoom(zoom + 0.15)}
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              title="Tüm panoyu ekrana sığdır (genel görünüm)"
              aria-label="Genel görünüm"
              onClick={fitBoardOverview}
            >
              <Maximize2 size={13} />
            </button>
          </div>
          <Button
            variant={drawMode ? "primary" : "bare"}
            aria-pressed={drawMode}
            onClick={() => {
              setActiveDraft(null);
              setDrawMode((v) => !v);
            }}
          >
            <MoveUpRight size={15} /> {drawMode ? "Çizim açık" : "Çizim & Ok"}
          </Button>
          <IconButton
            label="Pano filtreleri"
            variant="bare"
            aria-expanded={filters}
            onClick={() => setFilters((v) => !v)}
          >
            <SlidersHorizontal size={16} />
          </IconButton>
          <div className="board-add-dropdown" ref={addMenuRef}>
            <Button
              variant="primary"
              aria-expanded={addMenuOpen}
              aria-haspopup="menu"
              onClick={() => setAddMenuOpen((v) => !v)}
            >
              <Plus size={16} /> Panoya ekle <ChevronDown size={14} />
            </Button>
            {addMenuOpen && (
              <div className="board-add-menu" role="menu" aria-label="Panoya öğe ekle">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openCreate("note")}
                >
                  <StickyNote size={15} />
                  <div>
                    <strong>Yapışkan not</strong>
                    <small>Başlıklı not, ekip etiketi ve son tarih</small>
                  </div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openCreate("announcement")}
                >
                  <Megaphone size={15} />
                  <div>
                    <strong>Ekip duyurusu</strong>
                    <small>Önemli bildirim ve takım duyuru kartı</small>
                  </div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openCreate("shortcut")}
                >
                  <AppWindow size={15} />
                  <div>
                    <strong>Uygulama kısayolu</strong>
                    <small>Tıklayan kendi STARBASE hesabıyla bağlanır</small>
                  </div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openCreate("text")}
                >
                  <Type size={15} />
                  <div>
                    <strong>Serbest pano yazısı</strong>
                    <small>Panoya doğrudan başlık veya yönlendirme yaz</small>
                  </div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openCreate("checklist")}
                >
                  <CheckSquare size={15} />
                  <div>
                    <strong>Kontrol listesi</strong>
                    <small>İşaretlenebilir görev maddeleri ve ilerleme</small>
                  </div>
                </button>
                <hr />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => startDrawingMode("arrow")}
                >
                  <MoveUpRight size={15} />
                  <div>
                    <strong>Ok çiz</strong>
                    <small>Yazıdan kısayola veya nota ok çek</small>
                  </div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => startDrawingMode("pen")}
                >
                  <PenTool size={15} />
                  <div>
                    <strong>Serbest çizim & çerçeve</strong>
                    <small>Pano üzerinde serbest el veya vurgu çizimi</small>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {drawMode && (
        <div className="board-draw-toolbar" role="toolbar" aria-label="Pano çizim araçları">
          <span className="board-draw-toolbar__hint">
            <MoveUpRight size={14} /> Panoda basılı tutup sürükleyerek çiz
          </span>
          <div className="board-draw-toolbar__group">
            {(
              [
                ["arrow", "Ok", MoveUpRight],
                ["line", "Çizgi", Minus],
                ["rect", "Çerçeve", BoxSelect],
                ["pen", "Kalem", PenTool],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-pressed={drawTool === id}
                onClick={() => setDrawTool(id)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <div className="board-draw-toolbar__group">
            <button
              type="button"
              aria-pressed={strokeStyle === "solid"}
              onClick={() => setStrokeStyle("solid")}
            >
              Düz çizgi
            </button>
            <button
              type="button"
              aria-pressed={strokeStyle === "dashed"}
              onClick={() => setStrokeStyle("dashed")}
            >
              Kesikli
            </button>
          </div>
          <div className="board-draw-toolbar__group">
            <button
              type="button"
              title="Son çizimi geri al (Ctrl+Z)"
              disabled={!undoStack.length || historyBusy}
              onClick={() => void undo()}
            >
              <Undo2 size={14} /> Geri al
            </button>
            <button
              type="button"
              title="İleri al (Ctrl+Y)"
              disabled={!redoStack.length || historyBusy}
              onClick={() => void redo()}
            >
              <Redo2 size={14} /> İleri al
            </button>
          </div>
          <button
            type="button"
            className="board-draw-toolbar__close"
            onClick={() => {
              setActiveDraft(null);
              setDrawMode(false);
            }}
          >
            <X size={14} /> Bitti
          </button>
        </div>
      )}

      {selectedIds.size > 0 && !drawMode && (
        <div
          className="board-selection-bar"
          role="toolbar"
          aria-label="Seçili pano öğeleri araçları"
        >
          <span className="board-selection-bar__count">
            <BoxSelect size={14} /> {selectedIds.size} öğe seçildi
          </span>
          <div className="board-selection-bar__actions">
            <button
              type="button"
              onClick={() => void changeLayerSelected("front")}
            >
              <ArrowUpToLine size={13} /> En öne al
            </button>
            <button
              type="button"
              onClick={() => void changeLayerSelected("back")}
            >
              <ArrowDownToLine size={13} /> En arkaya al
            </button>
            <button
              type="button"
              className="is-danger"
              disabled={saving}
              onClick={() => void removeSelected()}
            >
              <Trash2 size={13} /> Seçilenleri sil
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
            >
              <X size={13} /> Seçimi temizle
            </button>
          </div>
        </div>
      )}

      {filters && (
        <div className="notes-filters">
          <SelectMenu
            label="Öğe türü"
            value={kind}
            onChange={(v) => {
              setKind(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "Tüm pano öğeleri" },
              { value: "note", label: "Notlar" },
              { value: "announcement", label: "Duyurular" },
              { value: "shortcut", label: "Uygulama kısayolları" },
              { value: "text", label: "Serbest yazılar" },
              { value: "checklist", label: "Kontrol listeleri" },
              { value: "drawing", label: "Çizimler ve oklar" },
            ]}
          />
          <SelectMenu
            label="İlgili ekip"
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
            label="Durum"
            value={archived}
            onChange={(v) => {
              setArchived(v);
              setPage(1);
            }}
            options={[
              { value: "0", label: "Aktif öğeler" },
              { value: "1", label: "Arşiv" },
            ]}
          />
          <IconButton
            label="Panoyu yenile"
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
        ref={viewportRef}
        className={"board-viewport" + (drawMode ? " is-drawing" : "")}
        aria-label="Serbest pano alanı"
        tabIndex={0}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            applyZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1));
          }
        }}
      >
        <div
          className="board-surface-scaler"
          style={{
            width: Math.round(surfaceWidth * zoom),
            height: Math.round(surfaceHeight * zoom),
          }}
        >
          <div
            ref={surfaceRef}
            className="board-surface"
            style={{
              width: surfaceWidth,
              height: surfaceHeight,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
            }}
            onPointerDown={(e) => {
              if (drawMode || e.button !== 0) return;
              const target = e.target as HTMLElement;
              if (
                target.closest(
                  ".movable-note, button, a, input, textarea, select",
                )
              ) {
                return;
              }
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              const pt = surfaceCoordinates(e);
              const additive = e.shiftKey || e.ctrlKey || e.metaKey;
              if (!additive) {
                setSelectedIds(new Set());
              }
              setMarquee({
                startX: pt.x,
                startY: pt.y,
                currentX: pt.x,
                currentY: pt.y,
                pointerId: e.pointerId,
                additive,
                initialSelected: additive ? new Set(selectedIds) : new Set(),
              });
            }}
            onPointerMove={(e) => {
              if (!marquee || marquee.pointerId !== e.pointerId) return;
              const pt = surfaceCoordinates(e);
              const rx1 = Math.min(marquee.startX, pt.x);
              const ry1 = Math.min(marquee.startY, pt.y);
              const rx2 = Math.max(marquee.startX, pt.x);
              const ry2 = Math.max(marquee.startY, pt.y);
              setMarquee((prev) =>
                prev
                  ? { ...prev, currentX: pt.x, currentY: pt.y }
                  : null,
              );
              if (Math.hypot(rx2 - rx1, ry2 - ry1) < 4) return;
              const next = new Set(marquee.initialSelected);
              for (const n of feed.notes) {
                const { width, height } = getNoteDimensions(n);
                const nx1 = n.x;
                const ny1 = n.y;
                const nx2 = n.x + width;
                const ny2 = n.y + height;
                if (nx1 <= rx2 && nx2 >= rx1 && ny1 <= ry2 && ny2 >= ry1) {
                  next.add(n.id);
                }
              }
              setSelectedIds(next);
            }}
            onPointerUp={(e) => {
              if (!marquee || marquee.pointerId !== e.pointerId) return;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
              setMarquee(null);
            }}
            onPointerCancel={() => setMarquee(null)}
          >
            {marquee && (
              <div
                className="board-marquee"
                aria-hidden="true"
                style={{
                  left: Math.min(marquee.startX, marquee.currentX),
                  top: Math.min(marquee.startY, marquee.currentY),
                  width: Math.abs(marquee.currentX - marquee.startX),
                  height: Math.abs(marquee.currentY - marquee.startY),
                }}
              />
            )}
            {drawMode && (
              <div
                className="board-draw-capture"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const pt = surfaceCoordinates(e);
                  setActiveDraft({
                    tool: drawTool,
                    strokeStyle,
                    points: [pt, pt],
                  });
                }}
                onPointerMove={(e) => {
                  if (!activeDraft) return;
                  const pt = surfaceCoordinates(e);
                  setActiveDraft((current) => {
                    if (!current) return null;
                    if (current.tool === "pen") {
                      const last = current.points[current.points.length - 1];
                      if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 4) {
                        return current;
                      }
                      return { ...current, points: [...current.points, pt] };
                    }
                    return {
                      ...current,
                      points: [current.points[0], pt],
                    };
                  });
                }}
                onPointerUp={(e) => {
                  if (!activeDraft) return;
                  const finished = activeDraft;
                  setActiveDraft(null);
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                  void commitDrawing(finished);
                }}
                onPointerCancel={() => setActiveDraft(null)}
              >
                {activeDraft && (
                  <svg className="board-draw-live-svg" aria-hidden="true">
                    <BoardVectorShape
                      tool={activeDraft.tool}
                      strokeStyle={activeDraft.strokeStyle}
                      points={activeDraft.points}
                    />
                  </svg>
                )}
              </div>
            )}

            {feed.notes.length ? (
              <div className="sticky-grid" aria-busy={busy}>
                {feed.notes.map((n) => {
                  const own = n.authorId === currentUserId,
                    canEdit = own || feed.canModerate;
                  const itemType = resolveItemType(n);
                  const zIndex = getNoteZIndex(n);
                  const isSelected = selectedIds.has(n.id);
                  const externalOffset =
                    isSelected &&
                    multiDrag &&
                    multiDrag.leaderId !== n.id &&
                    canEdit
                      ? { dx: multiDrag.dx, dy: multiDrag.dy }
                      : null;
                  return (
                    <MovableNote
                      key={n.id}
                      note={n}
                      itemType={itemType}
                      zoom={zoom}
                      zIndex={zIndex}
                      selected={isSelected}
                      externalOffset={externalOffset}
                      canMove={canEdit && !drawMode}
                      canEdit={canEdit && !drawMode}
                      canModerate={feed.canModerate}
                      onSelect={(additive) => {
                        setSelectedIds((prev) => {
                          if (additive) {
                            const next = new Set(prev);
                            if (next.has(n.id)) next.delete(n.id);
                            else next.add(n.id);
                            return next;
                          }
                          if (prev.has(n.id)) return prev;
                          return new Set([n.id]);
                        });
                      }}
                      onDragDelta={(dx, dy) => {
                        if (!selectedIds.has(n.id) || selectedIds.size <= 1) {
                          if (multiDrag) setMultiDrag(null);
                          return;
                        }
                        if (dx === 0 && dy === 0) {
                          setMultiDrag(null);
                        } else {
                          setMultiDrag({ leaderId: n.id, dx, dy });
                        }
                      }}
                      onEdit={
                        itemType !== "drawing"
                          ? () => {
                              setEditorError("");
                              setEditor({ mode: "edit", note: n });
                            }
                          : undefined
                      }
                      onDelete={() => {
                        setEditorError("");
                        setDeleteNote(n);
                      }}
                      onLayer={(direction) => {
                        void changeLayer(n, direction);
                      }}
                      onTogglePin={
                        feed.canModerate &&
                        itemType !== "drawing" &&
                        itemType !== "text"
                          ? () => {
                              void change(n, { pinned: !n.pinned });
                            }
                          : undefined
                      }
                      onToggleArchive={
                        itemType === "note" || itemType === "announcement"
                          ? () => {
                              void change(n, { archived: !n.archived });
                            }
                          : undefined
                      }
                      onMove={async (x, y, layoutVersion) => {
                        setMultiDrag(null);
                        const dx = x - n.x;
                        const dy = y - n.y;
                        const bulkTargets =
                          selectedIds.has(n.id) && selectedIds.size > 1
                            ? feed.notes.filter(
                                (item) =>
                                  selectedIds.has(item.id) &&
                                  (item.authorId === currentUserId ||
                                    feed.canModerate),
                              )
                            : [n];
                        try {
                          const moves: {
                            id: string;
                            fromX: number;
                            fromY: number;
                            toX: number;
                            toY: number;
                          }[] = [];
                          for (const item of bulkTargets) {
                            const toX =
                              item.id === n.id
                                ? x
                                : Math.max(0, Math.min(20000, item.x + dx));
                            const toY =
                              item.id === n.id
                                ? y
                                : Math.max(0, Math.min(20000, item.y + dy));
                            const lv =
                              item.id === n.id
                                ? layoutVersion
                                : item.layoutVersion;
                            await request(
                              "/board/notes/" + item.id + "/position",
                              { x: toX, y: toY, layoutVersion: lv },
                              "PATCH",
                            );
                            moves.push({
                              id: item.id,
                              fromX: item.x,
                              fromY: item.y,
                              toX,
                              toY,
                            });
                          }
                          if (moves.length) {
                            pushHistory({ kind: "move", moves });
                          }
                          await reload.current();
                        } catch (e) {
                          setError(
                            (e as Error).message === "note_position_conflict"
                              ? "Öğe başka bir yerde taşındı. Güncel konumu yüklendi."
                              : "Konum kaydedilemedi. Tekrar dene.",
                          );
                          await reload.current();
                          throw e;
                        }
                      }}
                    >
                      <BoardItemRenderer
                        note={n}
                        itemType={itemType}
                        apps={apps}
                        canEdit={canEdit}
                        canModerate={feed.canModerate}
                        onChange={(patch) => change(n, patch)}
                        onEdit={() => {
                          setEditorError("");
                          setEditor({ mode: "edit", note: n });
                        }}
                        onDelete={() => {
                          setEditorError("");
                          setDeleteNote(n);
                        }}
                      />
                    </MovableNote>
                  );
                })}
              </div>
            ) : (
              !busy &&
              !error && (
                <EmptyState
                  title={
                    archived === "1" ? "Arşivde öğe yok" : "İlk öğeyi sen bırak"
                  }
                  description={
                    scope === "private"
                      ? "Not, uygulama kısayolu, serbest yazı veya ok çizimi ekle; başlığından tutup istediğin yere taşı."
                      : "Ekip notları, uygulama kısayolları, yönlendirme yazıları ve ok çizimleri için ortak çalışma panosu."
                  }
                />
              )
            )}
          </div>
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
        title={modalTitle}
        description={
          scope === "private"
            ? "Bu öğe yalnızca senin kişisel panonda görünecek."
            : activeModalType === "shortcut"
              ? "Ortak panodaki kısayola tıklayan her üye kendi STARBASE hesabıyla uygulamaya bağlanır."
              : "Takım üyelerinin tamamı ortak panodaki bu öğeyi görebilir."
        }
        onClose={() => {
          if (!saving) setEditor(null);
        }}
      >
        {editor !== null && (
          <BoardItemForm
            key={editingNote?.id ?? `new-${activeModalType}`}
            itemType={activeModalType}
            note={editingNote}
            teams={teams}
            apps={apps}
            onSubmit={submitEditorPayload}
            error={editorError}
            saving={saving}
          />
        )}
      </Dialog>
      <Dialog
        open={!!deleteNote}
        title="Pano öğesini sil"
        description="Bu öğe panodan kalıcı olarak silinecek."
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

function BoardVectorShape({
  tool,
  strokeStyle,
  points,
}: {
  tool: DrawTool;
  strokeStyle: StrokeStyle;
  points: DrawingPoint[];
}) {
  const markerId = useId();
  if (points.length < 2) return null;
  const dashArray = strokeStyle === "dashed" ? "7 5" : undefined;
  const start = points[0];
  const end = points[points.length - 1];

  if (tool === "arrow" || tool === "line") {
    return (
      <g>
        {tool === "arrow" && (
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path
                d="M 1 2 L 10 6 L 1 10 z"
                fill="#ffffff"
                stroke="#ffffff"
                strokeWidth="1"
              />
            </marker>
          </defs>
        )}
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="square"
          strokeDasharray={dashArray}
          markerEnd={tool === "arrow" ? `url(#${markerId})` : undefined}
        />
      </g>
    );
  }

  if (tool === "rect") {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.max(4, Math.abs(end.x - start.x));
    const height = Math.max(4, Math.abs(end.y - start.y));
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#ffffff08"
        stroke="#ffffff"
        strokeWidth="2"
        strokeDasharray={dashArray}
      />
    );
  }

  const d = points
    .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
    .join(" ");
  return (
    <path
      d={d}
      fill="none"
      stroke="#ffffff"
      strokeWidth="2.2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeDasharray={dashArray}
    />
  );
}

function BoardItemRenderer({
  note,
  itemType,
  apps,
  canEdit,
  canModerate,
  onChange,
  onEdit,
  onDelete,
}: {
  note: Note;
  itemType: BoardItemType;
  apps: BoardApp[];
  canEdit: boolean;
  canModerate: boolean;
  onChange: (patch: Record<string, unknown>) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const data = note.itemData ?? {};
  const authorLabel = note.authorFirstName
    ? [note.authorFirstName, note.authorLastName].join(" ")
    : "Takım üyesi";

  if (itemType === "drawing") {
    const tool =
      data.tool === "line" || data.tool === "rect" || data.tool === "pen"
        ? data.tool
        : "arrow";
    const strokeStyle = data.strokeStyle === "dashed" ? "dashed" : "solid";
    const width =
      typeof data.width === "number" && data.width >= 32 ? data.width : 180;
    const height =
      typeof data.height === "number" && data.height >= 32 ? data.height : 120;
    const rawPoints = Array.isArray(data.points) ? data.points : [];
    const points: DrawingPoint[] = rawPoints
      .filter(
        (pt): pt is DrawingPoint =>
          Boolean(pt) &&
          typeof (pt as DrawingPoint).x === "number" &&
          typeof (pt as DrawingPoint).y === "number",
      )
      .map((pt) => ({ x: pt.x, y: pt.y }));

    return (
      <div
        className="board-drawing-item"
        style={{ width, height }}
        data-note-id={note.id}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-label={note.title}
        >
          <BoardVectorShape
            tool={tool}
            strokeStyle={strokeStyle}
            points={points}
          />
        </svg>
      </div>
    );
  }

  if (itemType === "text") {
    const size =
      data.size === "sm" || data.size === "md" || data.size === "lg"
        ? data.size
        : "lg";
    const framed = Boolean(data.framed);
    return (
      <div
        className={`board-canvas-text size-${size}${framed ? " is-framed" : ""}`}
        data-note-id={note.id}
      >
        <div className="board-canvas-text__body">
          <strong>{note.title}</strong>
          {note.content && note.content !== note.title && (
            <p>{note.content}</p>
          )}
        </div>
        <div className="board-canvas-text__meta">
          <span>{authorLabel}</span>
          {canEdit && (
            <div className="board-canvas-text__actions">
              <button
                type="button"
                onClick={onEdit}
                aria-label="Yazıyı düzenle"
                title="Yazıyı düzenle"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label="Yazıyı sil"
                title="Yazıyı sil"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (itemType === "shortcut") {
    const appId = typeof data.appId === "string" ? data.appId : "";
    const matchedApp = apps.find((a) => a.id === appId);
    const appName =
      matchedApp?.name ??
      (typeof data.appName === "string" && data.appName
        ? data.appName
        : note.title);
    const logoUrl =
      matchedApp?.logoUrl ??
      (typeof data.logoUrl === "string" ? data.logoUrl : "");
    const rawLaunchUrl =
      matchedApp?.launchUrl ??
      (typeof data.launchUrl === "string" ? data.launchUrl : "");
    const personalLaunchUrl = buildPersonalLaunchUrl(rawLaunchUrl);

    return (
      <Panel
        className={
          "sticky-note board-shortcut-card" + (note.pinned ? " is-pinned" : "")
        }
        data-note-id={note.id}
      >
        <div className="sticky-kicker">
          <span>
            <AppWindow size={14} /> Uygulama kısayolu
          </span>
          {note.pinned > 0 && (
            <span>
              <Pin size={13} /> Sabit
            </span>
          )}
        </div>
        <div className="board-shortcut-card__identity">
          <div className="board-shortcut-card__logo" aria-hidden="true">
            {logoUrl ? <img src={logoUrl} alt="" /> : <AppWindow size={26} />}
          </div>
          <div>
            <h3>{note.title || appName}</h3>
            <small>{appName}</small>
          </div>
        </div>
        <p className="sticky-content">{note.content}</p>
        {note.team && <span className="sticky-team">{note.team}</span>}
        {personalLaunchUrl && (
          <a
            className="sd-button sd-button--primary board-shortcut-card__launch"
            href={personalLaunchUrl}
            target={personalLaunchUrl.startsWith("http") ? "_blank" : undefined}
            rel={
              personalLaunchUrl.startsWith("http") ? "noreferrer" : undefined
            }
          >
            <span>Kendi hesabınla aç</span>
            <ArrowUpRight size={15} />
          </a>
        )}
        <div className="sticky-author">
          <span>{authorLabel}</span>
          <time dateTime={new Date(note.updatedAt * 1000).toISOString()}>
            {time(note.updatedAt)}
          </time>
        </div>
        {canEdit && (
          <div className="sticky-actions">
            {canModerate && (
              <IconButton
                label={note.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
                size="sm"
                variant="bare"
                onClick={() => onChange({ pinned: !note.pinned })}
              >
                <Pin size={15} />
              </IconButton>
            )}
            <IconButton
              label="Kısayolu düzenle"
              size="sm"
              variant="bare"
              onClick={onEdit}
            >
              <Pencil size={15} />
            </IconButton>
            <IconButton
              label="Kısayolu sil"
              size="sm"
              variant="bare"
              onClick={onDelete}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        )}
      </Panel>
    );
  }

  if (itemType === "checklist") {
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items: ChecklistItem[] = rawItems
      .filter(
        (item): item is ChecklistItem =>
          Boolean(item) && typeof (item as ChecklistItem).text === "string",
      )
      .map((item, idx) => ({
        id: typeof item.id === "string" ? item.id : `item-${idx}`,
        text: item.text,
        done: Boolean(item.done),
      }));
    const doneCount = items.filter((i) => i.done).length;
    const progress = items.length
      ? Math.round((doneCount / items.length) * 100)
      : 0;

    return (
      <Panel
        className={
          "sticky-note board-checklist-card" + (note.pinned ? " is-pinned" : "")
        }
        data-note-id={note.id}
      >
        <div className="sticky-kicker">
          <span>
            <CheckSquare size={14} /> Kontrol listesi
          </span>
          <span>
            {doneCount}/{items.length} ({progress}%)
          </span>
        </div>
        <h3>{note.title}</h3>
        <div className="board-checklist-progress" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </div>
        <ul className="board-checklist-items">
          {items.map((item) => (
            <li key={item.id} className={item.done ? "is-done" : ""}>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  const nextItems = items.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, done: !entry.done }
                      : entry,
                  );
                  void onChange({
                    itemType: "checklist",
                    itemData: { ...data, items: nextItems },
                  });
                }}
              >
                {item.done ? <CheckSquare size={14} /> : <Square size={14} />}
                <span>{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
        {note.team && <span className="sticky-team">{note.team}</span>}
        <div className="sticky-author">
          <span>{authorLabel}</span>
          <time dateTime={new Date(note.updatedAt * 1000).toISOString()}>
            {time(note.updatedAt)}
          </time>
        </div>
        {canEdit && (
          <div className="sticky-actions">
            {canModerate && (
              <IconButton
                label={note.pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
                size="sm"
                variant="bare"
                onClick={() => onChange({ pinned: !note.pinned })}
              >
                <Pin size={15} />
              </IconButton>
            )}
            <IconButton
              label="Listeyi düzenle"
              size="sm"
              variant="bare"
              onClick={onEdit}
            >
              <Pencil size={15} />
            </IconButton>
            <IconButton
              label="Listeyi sil"
              size="sm"
              variant="bare"
              onClick={onDelete}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        )}
      </Panel>
    );
  }

  const overdue = note.dueAt !== null && note.dueAt < Date.now() / 1000;
  return (
    <Panel
      className={"sticky-note" + (note.pinned ? " is-pinned" : "")}
      data-note-id={note.id}
    >
      <div className="sticky-kicker">
        <span>
          {note.kind === "announcement" ? (
            <Megaphone size={14} />
          ) : (
            <StickyNote size={14} />
          )}{" "}
          {note.kind === "announcement" ? "Duyuru" : "Not"}
        </span>
        {note.pinned > 0 && (
          <span>
            <Pin size={13} /> Sabit
          </span>
        )}
      </div>
      <h3>{note.title}</h3>
      <p className="sticky-content">{note.content}</p>
      {note.team && <span className="sticky-team">{note.team}</span>}
      {note.dueAt !== null && (
        <span className={"sticky-deadline" + (overdue ? " overdue" : "")}>
          <Calendar size={13} />
          {new Date(note.dueAt * 1000).toLocaleDateString("tr-TR")}
          {overdue ? " · Tarihi geçti" : ""}
        </span>
      )}
      <div className="sticky-author">
        <span>{authorLabel}</span>
        <time
          dateTime={new Date(note.updatedAt * 1000).toISOString()}
          title={note.version > 1 ? "Düzenlendi" : "Oluşturuldu"}
        >
          {time(note.updatedAt)}
          {note.version > 1 ? " · Düzenlendi" : ""}
        </time>
      </div>
      {canEdit && (
        <div className="sticky-actions">
          {canModerate && (
            <IconButton
              label={note.pinned ? "Sabitlemeyi kaldır" : "Notu sabitle"}
              size="sm"
              variant="bare"
              onClick={() => onChange({ pinned: !note.pinned })}
            >
              <Pin size={15} />
            </IconButton>
          )}
          <IconButton
            label="Notu düzenle"
            size="sm"
            variant="bare"
            onClick={onEdit}
          >
            <Pencil size={15} />
          </IconButton>
          <IconButton
            label={note.archived ? "Notu geri getir" : "Notu arşivle"}
            size="sm"
            variant="bare"
            onClick={() => onChange({ archived: !note.archived })}
          >
            {note.archived ? (
              <ArchiveRestore size={15} />
            ) : (
              <Archive size={15} />
            )}
          </IconButton>
          <IconButton
            label="Notu sil"
            size="sm"
            variant="bare"
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      )}
    </Panel>
  );
}

function BoardItemForm({
  itemType,
  note,
  teams,
  apps,
  onSubmit,
  error,
  saving,
}: {
  itemType: Exclude<BoardItemType, "drawing">;
  note: Note | null;
  teams: { id: string; name: string }[];
  apps: BoardApp[];
  onSubmit: (payload: {
    title: string;
    content: string;
    kind: "note" | "announcement";
    itemType: BoardItemType;
    itemData?: Record<string, unknown>;
    teamId: string | null;
    dueAt: number | null;
  }) => Promise<void>;
  error: string;
  saving: boolean;
}) {
  const existingData = note?.itemData ?? {};
  const [kind, setKind] = useState<"note" | "announcement">(
    itemType === "announcement" || note?.kind === "announcement"
      ? "announcement"
      : "note",
  );
  const [team, setTeam] = useState(note?.teamId ?? "");
  const [selectedAppId, setSelectedAppId] = useState<string>(() => {
    if (typeof existingData.appId === "string" && existingData.appId) {
      return existingData.appId;
    }
    return apps[0]?.id ?? "yrt-latex-web";
  });
  const [textSize, setTextSize] = useState<"sm" | "md" | "lg">(() =>
    existingData.size === "sm" ||
    existingData.size === "md" ||
    existingData.size === "lg"
      ? existingData.size
      : "lg",
  );
  const [textFramed, setTextFramed] = useState<string>(() =>
    existingData.framed ? "1" : "0",
  );

  const defaultChecklistLines = Array.isArray(existingData.items)
    ? (existingData.items as ChecklistItem[])
        .map((i) => i.text)
        .filter(Boolean)
        .join("\n")
    : note?.content ?? "";

  const dateValue = note?.dueAt
    ? new Date(note.dueAt * 1000).toLocaleDateString("en-CA")
    : "";

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);

    if (itemType === "shortcut") {
      const app =
        apps.find((a) => a.id === selectedAppId) ?? {
          id: selectedAppId,
          name: "YRT LaTeX",
          logoUrl: "/api/v1/apps/yrt-latex-web/logo",
          launchUrl: "https://yrt-latex.web.app/?starbase_login=1",
        };
      const customTitle = String(f.get("title") ?? "").trim() || app.name;
      const customNote =
        String(f.get("content") ?? "").trim() ||
        `${app.name} çalışma alanına kendi STARBASE hesabınla hızlı geçiş yap.`;
      void onSubmit({
        title: customTitle,
        content: customNote,
        kind: "note",
        itemType: "shortcut",
        itemData: {
          appId: app.id,
          appName: app.name,
          logoUrl: app.logoUrl,
          launchUrl: app.launchUrl,
        },
        teamId: team || null,
        dueAt: null,
      });
      return;
    }

    if (itemType === "text") {
      const mainText = String(f.get("title") ?? "").trim();
      const subText = String(f.get("content") ?? "").trim() || mainText;
      void onSubmit({
        title: mainText,
        content: subText,
        kind: "note",
        itemType: "text",
        itemData: {
          size: textSize,
          framed: textFramed === "1",
        },
        teamId: null,
        dueAt: null,
      });
      return;
    }

    if (itemType === "checklist") {
      const title = String(f.get("title") ?? "").trim();
      const rawLines = String(f.get("content") ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const prevItems = Array.isArray(existingData.items)
        ? (existingData.items as ChecklistItem[])
        : [];
      const items: ChecklistItem[] = rawLines.map((line, index) => {
        const matched = prevItems.find((p) => p.text === line);
        return {
          id: matched?.id ?? `chk-${index}-${Date.now()}`,
          text: line,
          done: matched?.done ?? false,
        };
      });
      void onSubmit({
        title,
        content: rawLines.join("\n") || title,
        kind: "note",
        itemType: "checklist",
        itemData: { items },
        teamId: team || null,
        dueAt: null,
      });
      return;
    }

    const date = String(f.get("dueAt") ?? "");
    void onSubmit({
      title: String(f.get("title") ?? "").trim(),
      content: String(f.get("content") ?? "").trim(),
      kind,
      itemType: kind,
      itemData: {},
      teamId: team || null,
      dueAt: date
        ? Math.floor(new Date(date + "T23:59:59").getTime() / 1000)
        : null,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {itemType === "shortcut" && (
        <>
          <SelectMenu
            label="STARBASE uygulaması"
            value={selectedAppId}
            onChange={setSelectedAppId}
            options={
              apps.length
                ? apps.map((a) => ({ value: a.id, label: a.name }))
                : [{ value: "yrt-latex-web", label: "YRT LaTeX" }]
            }
          />
          <TextField
            name="title"
            label="Kısayol başlığı (isteğe bağlı)"
            defaultValue={note?.title ?? ""}
            placeholder="Örn: YRT LaTeX — Rapor Merkezi"
            maxLength={120}
          />
          <TextArea
            name="content"
            label="Açıklama / yönlendirme notu"
            defaultValue={note?.content ?? ""}
            placeholder="Örn: Güncel AKU-R ve toplantı raporlarına buradan ulaşabilirsiniz."
            maxLength={600}
          />
          <SelectMenu
            label="İlgili ekip"
            value={team}
            onChange={setTeam}
            options={[
              { value: "", label: "Tüm takım" },
              ...teams.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </>
      )}

      {itemType === "text" && (
        <>
          <TextField
            name="title"
            label="Pano yazısı"
            defaultValue={note?.title ?? ""}
            placeholder="Örn: Bakın şu uygulamaya gidin →"
            maxLength={120}
            required
          />
          <TextField
            name="content"
            label="Alt açıklama (isteğe bağlı)"
            defaultValue={
              note && note.content !== note.title ? note.content : ""
            }
            placeholder="Örn: Tüm teknik rapor şablonları YRT LaTeX üzerinde güncellendi"
            maxLength={300}
          />
          <SelectMenu
            label="Yazı boyutu"
            value={textSize}
            onChange={(v) => setTextSize(v as "sm" | "md" | "lg")}
            options={[
              { value: "lg", label: "Büyük başlık (Çağrı)" },
              { value: "md", label: "Orta vurgu" },
              { value: "sm", label: "Kompakt etiket" },
            ]}
          />
          <SelectMenu
            label="Görünüm"
            value={textFramed}
            onChange={setTextFramed}
            options={[
              { value: "0", label: "Çerçevesiz serbest yazı" },
              { value: "1", label: "İnce teknik çerçeveli" },
            ]}
          />
        </>
      )}

      {itemType === "checklist" && (
        <>
          <TextField
            name="title"
            label="Liste başlığı"
            defaultValue={note?.title ?? ""}
            placeholder="Örn: Uçuş Öncesi Rapor Teslim Listesi"
            maxLength={120}
            required
          />
          <TextArea
            name="content"
            label="Görev maddeleri (her satıra bir madde)"
            defaultValue={defaultChecklistLines}
            placeholder={
              "Avyonik test raporunu YRT LaTeX'te derle\nİtki alt sistem tablosunu güncelle\nSon PDF kontrolünü tamamla"
            }
            maxLength={2000}
            required
          />
          <SelectMenu
            label="İlgili ekip"
            value={team}
            onChange={setTeam}
            options={[
              { value: "", label: "Tüm takım" },
              ...teams.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </>
      )}

      {(itemType === "note" || itemType === "announcement") && (
        <>
          <TextField
            name="title"
            label="Başlık"
            defaultValue={note?.title ?? ""}
            maxLength={120}
            required
          />
          <TextArea
            name="content"
            label="İçerik"
            defaultValue={note?.content ?? ""}
            maxLength={2000}
            required
          />
          <SelectMenu
            label="Tür"
            value={kind}
            onChange={(v) => setKind(v as "note" | "announcement")}
            options={[
              { value: "note", label: "Yapışkan not" },
              { value: "announcement", label: "Ekip duyurusu" },
            ]}
          />
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
        </>
      )}

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
  itemType,
  zoom,
  zIndex,
  selected,
  externalOffset,
  canMove,
  canEdit,
  canModerate,
  onSelect,
  onDragDelta,
  onEdit,
  onDelete,
  onLayer,
  onTogglePin,
  onToggleArchive,
  onMove,
  children,
}: {
  note: Note;
  itemType: BoardItemType;
  zoom: number;
  zIndex: number;
  selected: boolean;
  externalOffset: { dx: number; dy: number } | null;
  canMove: boolean;
  canEdit: boolean;
  canModerate: boolean;
  onSelect: (additive: boolean) => void;
  onDragDelta: (dx: number, dy: number) => void;
  onEdit?: () => void;
  onDelete: () => void;
  onLayer: (direction: "front" | "forward" | "backward" | "back") => void;
  onTogglePin?: () => void;
  onToggleArchive?: () => void;
  onMove: (x: number, y: number, layoutVersion: number) => Promise<void>;
  children: ReactNode;
}) {
  const [position, setPosition] = useState({ x: note.x, y: note.y });
  const [moving, setMoving] = useState(false);
  const [pending, setPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!menuOpen) return;
    function onDocDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", onDocDown);
    return () => window.removeEventListener("mousedown", onDocDown);
  }, [menuOpen]);

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

  const renderX = externalOffset
    ? Math.max(0, Math.min(20000, position.x + externalOffset.dx))
    : position.x;
  const renderY = externalOffset
    ? Math.max(0, Math.min(20000, position.y + externalOffset.dy))
    : position.y;

  return (
    <div
      className={
        `movable-note is-type-${itemType}` +
        (moving || externalOffset ? " is-moving" : "") +
        (selected ? " is-selected" : "") +
        (menuOpen ? " is-menu-open" : "")
      }
      style={{
        transform: `translate(${renderX}px,${renderY}px)`,
        zIndex:
          moving || externalOffset
            ? 950
            : menuOpen
              ? 920
              : selected
                ? Math.max(zIndex, 40)
                : zIndex,
      }}
      onPointerDown={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          onSelect(true);
        }
      }}
    >
      <div className="note-top-controls">
        <button
          type="button"
          className="note-grip"
          aria-label={note.title + " öğesini taşı"}
          title="Sürükle veya yön tuşlarıyla taşı (Shift: büyük adım, Shift+Tık: çoklu seçim)"
          disabled={!canMove || pending}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
              onSelect(true);
              return;
            }
            if (!selected) {
              onSelect(false);
            }
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
            const nextX = Math.round(
              Math.max(
                0,
                Math.min(20000, d.x + (e.clientX - d.clientX) / zoom),
              ),
            );
            const nextY = Math.round(
              Math.max(
                0,
                Math.min(20000, d.y + (e.clientY - d.clientY) / zoom),
              ),
            );
            move({ x: nextX, y: nextY });
            onDragDelta(nextX - d.x, nextY - d.y);
          }}
          onPointerUp={(e) => {
            if (!drag.current) return;
            const d = drag.current;
            drag.current = null;
            setMoving(false);
            onDragDelta(0, 0);
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            if (d.x !== positionRef.current.x || d.y !== positionRef.current.y)
              void commit(d.layoutVersion);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setMoving(false);
            onDragDelta(0, 0);
            move({ x: note.x, y: note.y });
          }}
          onLostPointerCapture={() => {
            if (drag.current) {
              drag.current = null;
              setMoving(false);
              onDragDelta(0, 0);
              move({ x: note.x, y: note.y });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              drag.current = null;
              setMoving(false);
              onDragDelta(0, 0);
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
          <GripHorizontal size={16} />
        </button>

        {canEdit && (
          <div
            ref={menuRef}
            className={
              "note-settings-dropdown" + (menuOpen ? " is-open" : "")
            }
            onMouseEnter={() => setMenuOpen(true)}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              type="button"
              className="note-settings-trigger"
              aria-label={note.title + " öğe seçenekleri ve katman sırası"}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title="Öğe ayarları, katman sırası ve silme"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Settings size={13} />
            </button>

            <div
              className="note-settings-menu"
              role="menu"
              aria-label={note.title + " öğe menüsü"}
            >
              {onEdit && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                >
                  <Pencil size={13} />
                  <span>Öğeyi düzenle</span>
                </button>
              )}
              {canModerate && onTogglePin && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onTogglePin();
                  }}
                >
                  <Pin size={13} />
                  <span>
                    {note.pinned ? "Sabitlemeyi kaldır" : "Panoya sabitle"}
                  </span>
                </button>
              )}
              {onToggleArchive && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleArchive();
                  }}
                >
                  {note.archived ? (
                    <ArchiveRestore size={13} />
                  ) : (
                    <Archive size={13} />
                  )}
                  <span>{note.archived ? "Arşivden çıkar" : "Arşivle"}</span>
                </button>
              )}
              {(onEdit || (canModerate && onTogglePin) || onToggleArchive) && (
                <hr />
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onLayer("front");
                }}
              >
                <ArrowUpToLine size={13} />
                <span>En öne al</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onLayer("forward");
                }}
              >
                <ArrowUp size={13} />
                <span>Bir öne al</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onLayer("backward");
                }}
              >
                <ArrowDown size={13} />
                <span>Bir arkaya al</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onLayer("back");
                }}
              >
                <ArrowDownToLine size={13} />
                <span>En arkaya al</span>
              </button>
              <hr />
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <Trash2 size={13} />
                <span>Öğeyi sil</span>
              </button>
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
