import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Ban, Check, ChevronDown, Copy, File, LockKeyhole, Plus, Search, Settings2, Shield, UnlockKeyhole, UserPlus, Users, X } from "lucide-react";
import { Button, TabBar, TextField } from "@stardrop/ui";
import { TransferLink, type FileOffer, type ReceivedFile, type Signal, type TransferProgress } from "@starbase/file-transfer";
import { request } from "./management";
import { subscribeShareChanges } from "./member-live";
import { ShareCanvas } from "./share-canvas";
import "./file-sharing.css";

type Room = { id: string; name: string; ownerId: string; ownerName: string; profileTargetId: string | null; protected: boolean; locked: boolean; participantCount: number; createdAt: number; isOwner: boolean; isInvited: boolean };
type Member = { connectionId: string; userId: string; name: string };
type StagedFile = { id: string; file: File };
type QueuedFile = { id: string; peerId: string; file: File };
type RemoteFile = { id: string; peerId: string; name: string; size: number; mime: string };
type SearchMember = { id: string; firstName: string; lastName: string; username: string; photoUrl: string };
const errorText: Record<string, string> = {
  room_password_invalid: "Oda kodu yanlış.", room_locked: "Oda yeni katılımlara kapalı.", room_access_denied: "Bu odada engellendin.",
  room_not_found: "Oda artık açık değil.", try_later: "Çok fazla deneme. Biraz bekle.", authentication_required: "Oturumun sona erdi.",
};
const messageOf = (error: unknown) => errorText[error instanceof Error ? error.message : ""] ?? (error instanceof Error ? error.message : "İşlem tamamlanamadı.");

export function FileSharing({ currentUserId, profileTarget, initialRoomId, initialRoomNonce, onBack }: {
  currentUserId: string;
  profileTarget: { id: string; name: string } | null;
  initialRoomId?: string | null;
  initialRoomNonce?: number;
  onBack: () => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [view, setView] = useState<"quick" | "rooms">("quick");
  const [quickState, setQuickState] = useState<"connecting" | "online" | "offline">("connecting");
  const [quickRetry, setQuickRetry] = useState(0);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [protectRoom, setProtectRoom] = useState(false);
  const [joinTarget, setJoinTarget] = useState<Room | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [createdPassword, setCreatedPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [readyPeers, setReadyPeers] = useState<string[]>([]);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFile[]>([]);
  const [offers, setOffers] = useState<Array<{ peerId: string; offer: FileOffer }>>([]);
  const [progress, setProgress] = useState<Array<{ peerId: string; value: TransferProgress; at: number }>>([]);
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [failed, setFailed] = useState<Array<{ id: string; peerId: string; name: string; reason: string; at: number }>>([]);
  const [received, setReceived] = useState<Array<ReceivedFile & { url?: string; peerId: string }>>([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState<SearchMember[]>([]);
  const [filter, setFilter] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [bannedUsers, setBannedUsers] = useState<Array<{ userId: string; firstName: string; lastName: string }>>([]);
  const [banCandidate, setBanCandidate] = useState<Member | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const linksRef = useRef(new Map<string, TransferLink>());
  const queueRef = useRef<QueuedFile[]>([]);
  const drainingRef = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  const stagedRef = useRef<StagedFile[]>([]);
  const startedProfile = useRef("");
  const openedInvite = useRef(0);
  const activeRoom = rooms.find((room) => room.id === roomId) ?? null;
  const visibleMembers = [...members]
    .sort((a, b) => Number(readyPeers.includes(b.connectionId)) - Number(readyPeers.includes(a.connectionId)))
    .filter((member, index, list) => list.findIndex((item) => item.userId === member.userId) === index);
  const transferRows = [
    ...queued.map((item) => ({ id: item.id, name: item.file.name, peer: members.find((member) => member.connectionId === item.peerId)?.name ?? "Üye", status: "Bağlantı kuruluyor", percent: 0, active: true })),
    ...progress.map(({ peerId, value }) => ({ id: `${peerId}:${value.id}`, name: value.name, peer: members.find((member) => member.connectionId === peerId)?.name ?? "Üye", status: ({ offered: "Alıcının onayı bekleniyor", sending: "Kabul edildi · gönderiliyor", receiving: "Alınıyor", sent: "Alıcıya ulaştı", received: "Alındı", rejected: "Reddedildi", failed: "Aktarım başarısız" } as const)[value.status], percent: value.size ? Math.round(value.bytes / value.size * 100) : 100, active: !["sent", "received", "rejected", "failed"].includes(value.status) })),
    ...failed.map((item) => ({ id: item.id, name: item.name, peer: members.find((member) => member.connectionId === item.peerId)?.name ?? "Üye", status: item.reason, percent: 0, active: false })),
  ].slice(-4).reverse();

  const drainPeer = async (peerId: string) => {
    if (drainingRef.current.has(peerId)) return;
    const link = linksRef.current.get(peerId);
    if (!link?.ready) return;
    drainingRef.current.add(peerId);
    try {
      while (link.ready) {
        const index = queueRef.current.findIndex((item) => item.peerId === peerId);
        if (index < 0) break;
        const [item] = queueRef.current.splice(index, 1);
        setQueued([...queueRef.current]);
        try { await link.sendFile(item.file); }
        catch (cause) {
          const reason = messageOf(cause).includes("reddetti") ? "Alıcı reddetti" : "Gönderilemedi";
          setFailed((items) => [...items, { id: item.id, peerId, name: item.file.name, reason, at: Date.now() }].slice(-8));
        }
      }
    } finally { drainingRef.current.delete(peerId); }
  };

  const refresh = useCallback(async () => {
    try { const data = await request("/share/rooms") as { rooms: Room[] }; setRooms(data.rooms); }
    catch (cause) { setError(messageOf(cause)); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 15_000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 6000;
      setProgress((items) => items.filter((item) => !["sent", "received", "rejected", "failed"].includes(item.value.status) || item.at > cutoff));
      setFailed((items) => items.filter((item) => item.at > cutoff));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => subscribeShareChanges(() => void refresh()), [refresh]);
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);
  useEffect(() => {
    stagedRef.current = staged;
    if (view !== "quick" || roomId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: "file-list", files: staged.slice(0, 20).map(({ id, file }) => ({ id, name: file.name, size: file.size, mime: file.type })) }));
  }, [staged, view, roomId]);
  useEffect(() => {
    if (roomId) return;
    setStaged([]); setRemoteFiles([]); setProgress([]); setReceived([]); setFailed([]);
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
  }, [roomId, view]);
  useEffect(() => {
    if (inviteQuery.trim().length < 2) { setInviteResults([]); return; }
    let active = true;
    const timer = setTimeout(() => { request(`/directory/users?q=${encodeURIComponent(inviteQuery.trim())}&page=1`).then((data: { users: SearchMember[] }) => { if (active) setInviteResults(data.users.slice(0, 6)); }).catch(() => { if (active) setInviteResults([]); }); }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [inviteQuery]);

  const enter = async (room: Room, password?: string) => {
    setBusy(true); setError("");
    try {
      await request(`/share/rooms/${room.id}/join`, password ? { password } : {}, "POST");
      setStaged([]); setRemoteFiles([]); setReceived([]);
      setView("rooms");
      setRoomId(room.id); setJoinTarget(null); setJoinPassword("");
      await refresh();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  };
  const chooseRoom = (room: Room) => {
    setView("rooms");
    if (room.protected && !room.isOwner && !room.isInvited) { setJoinTarget(room); setJoinPassword(""); return; }
    void enter(room);
  };
  const createRoom = async (name: string, protectedRoom: boolean, profileTargetId?: string) => {
    setBusy(true); setError("");
    try {
      const data = await request("/share/rooms", { name, protected: protectedRoom, ...(profileTargetId ? { profileTargetId } : {}) }) as { room: Room; generatedPassword?: string };
      setCreatedPassword(data.generatedPassword ?? "");
      setRoomName(""); setProtectRoom(false);
      await refresh();
      await enter(data.room);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!profileTarget || startedProfile.current === profileTarget.id) return;
    startedProfile.current = profileTarget.id;
    void createRoom(`${profileTarget.name} ile paylaşım`, true, profileTarget.id);
  }, [profileTarget?.id]);
  useEffect(() => {
    if (!initialRoomId || openedInvite.current === initialRoomNonce) return;
    const target = rooms.find((item) => item.id === initialRoomId);
    if (!target) return;
    openedInvite.current = initialRoomNonce ?? 0;
    setView("rooms");
    if (roomId && roomId !== initialRoomId) setRoomId(null);
    chooseRoom(target);
  }, [initialRoomId, initialRoomNonce, rooms, roomId]);
  useEffect(() => {
    if (!roomId || !activeRoom?.isOwner) { setBannedUsers([]); return; }
    let alive = true;
    request(`/share/rooms/${roomId}/bans`).then((data: { users: typeof bannedUsers }) => { if (alive) setBannedUsers(data.users); }).catch(() => {});
    return () => { alive = false; };
  }, [roomId, activeRoom?.isOwner]);

  useEffect(() => {
    if (!roomId && view !== "quick") return;
    const quick = !roomId;
    let active = true;
    let ownConnection = "";
    let replaced = false;
    let roster: Member[] = [];
    const url = new URL(quick ? "/api/v1/share/quick/live" : `/api/v1/share/rooms/${roomId}/live`, location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    socketRef.current = socket;
    if (quick) setQuickState("connecting");
    const announceFiles = () => {
      if (!quick || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "file-list", files: stagedRef.current.slice(0, 20).map(({ id, file }) => ({ id, name: file.name, size: file.size, mime: file.type })) }));
    };
    socket.onopen = () => { if (active && quick) { setQuickState("online"); setError(""); announceFiles(); } };
    const addPeer = (member: Member) => {
      if (linksRef.current.has(member.connectionId)) return linksRef.current.get(member.connectionId)!;
      const peerId = member.connectionId;
      const link = new TransferLink({
        signal: (signal: Signal) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "signal", to: peerId, signal })); },
        ready: () => { if (active) { setReadyPeers((items) => [...new Set([...items, peerId])]); void drainPeer(peerId); } },
        offer: (offer) => { if (active) setOffers((items) => [...items, { peerId, offer }]); },
        progress: (value) => { if (active) setProgress((items) => [...items.filter((item) => item.peerId !== peerId || item.value.id !== value.id), { peerId, value, at: Date.now() }].slice(-20)); },
        received: (file) => {
          if (!active) return;
          const fileUrl = file.blob ? URL.createObjectURL(file.blob) : undefined;
          if (fileUrl) urls.current.push(fileUrl);
          setReceived((items) => {
            const next = [{ ...file, url: fileUrl, peerId }, ...items];
            for (const stale of next.slice(12)) if (stale.url) URL.revokeObjectURL(stale.url);
            return next.slice(0, 12);
          });
        },
        error: (message) => {
          if (!active) return;
          setError(message);
          const pending = queueRef.current.filter((item) => item.peerId === peerId);
          queueRef.current = queueRef.current.filter((item) => item.peerId !== peerId);
          setQueued([...queueRef.current]);
          if (pending.length) setFailed((items) => [...items, ...pending.map((item) => ({ id: item.id, peerId, name: item.file.name, reason: "Bağlantı kurulamadı", at: Date.now() }))].slice(-8));
        },
      });
      linksRef.current.set(peerId, link);
      return link;
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "welcome") { ownConnection = message.connectionId; return; }
        if (message.type === "replaced") { replaced = true; setError("Bu hesap başka bir sekmede paylaşım alanına girdi. Bu bağlantı kapatıldı."); if (quick) setQuickState("offline"); else setRoomId(null); return; }
        if (quick && message.type === "file-list") {
          setRemoteFiles((items) => [...items.filter((item) => item.peerId !== message.from), ...(message.files as Array<Omit<RemoteFile, "peerId">>).map((file) => ({ ...file, peerId: message.from }))]);
          return;
        }
        if (quick && message.type === "file-request") {
          const file = stagedRef.current.find((item) => item.id === message.id)?.file;
          if (file && roster.some((member) => member.connectionId === message.from)) {
            queueRef.current.push({ id: crypto.randomUUID(), peerId: message.from, file });
            setQueued([...queueRef.current]);
            void drainPeer(message.from);
          }
          return;
        }
        if (message.type === "members") {
          roster = message.members as Member[];
          setMembers(roster);
          const present = new Set(roster.map((member) => member.connectionId));
          for (const [id, link] of linksRef.current) if (!present.has(id)) { link.close(); linksRef.current.delete(id); setReadyPeers((items) => items.filter((item) => item !== id)); queueRef.current = queueRef.current.filter((item) => item.peerId !== id); setQueued([...queueRef.current]); }
          if (quick) {
            setRemoteFiles((items) => items.filter((file) => present.has(file.peerId)));
            setReceived((items) => items.filter((file) => {
              if (present.has(file.peerId)) return true;
              if (file.url) URL.revokeObjectURL(file.url);
              return false;
            }));
            setOffers((items) => items.filter((item) => present.has(item.peerId)));
            announceFiles();
          }
          for (const member of roster) {
            if (member.connectionId === ownConnection || linksRef.current.has(member.connectionId)) continue;
            const link = addPeer(member);
            if (ownConnection > member.connectionId) void link.initiate().catch((cause) => setError(messageOf(cause)));
          }
          return;
        }
        if (message.type === "signal") {
          const member = roster.find((item) => item.connectionId === message.from) ?? { connectionId: message.from, userId: "", name: "Üye" };
          void addPeer(member).handleSignal(message.signal as Signal).catch((cause) => setError(messageOf(cause)));
        }
        if (["closed", "kicked", "banned"].includes(message.type)) { setError(message.type === "kicked" ? "Odadan çıkarıldın. Yeniden katılmak için yeni davet veya oda kodu gerekli." : message.type === "banned" ? "Bu odada engellendin." : "Oda kapatıldı."); setRoomId(null); void refresh(); }
      } catch { setError("Oda bağlantısı okunamadı."); }
    };
    socket.onclose = (event) => {
      if (!active) return;
      if (quick) {
        setQuickState("offline");
        setRemoteFiles([]); setReceived([]);
        for (const url of urls.current) URL.revokeObjectURL(url);
        urls.current = [];
        setError(event.code === 4001 || replaced ? "Bu hesap başka bir sekmede paylaşım alanına girdi." : "Canlı bağlantı kesildi. Yeniden bağlanabilirsin.");
        return;
      }
      if (event.code === 4001 || replaced || event.reason.includes("Newer connection")) setError("Bu hesap başka bir sekmede odaya girdi. Bu bağlantı kapatıldı.");
      else if (event.code === 4002) setError("Odadan çıkarıldın. Yeniden katılmak için yeni davet veya oda kodu gerekli.");
      else if (event.code === 4003) setError("Bu odada engellendin.");
      else setError("Canlı bağlantı kesildi. Odaya yeniden katılabilirsin.");
      setRoomId(null);
      void refresh();
    };
    socket.onerror = () => { if (active) setError(quick ? "Hızlı paylaşım alanına bağlanılamadı." : "Canlı odaya bağlanılamadı."); };
    const ping = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" })); }, 30_000);
    return () => { active = false; clearInterval(ping); socket.close(); socketRef.current = null; for (const link of linksRef.current.values()) link.close(); linksRef.current.clear(); queueRef.current = []; drainingRef.current.clear(); setQueued([]); setMembers([]); setReadyPeers([]); setOffers([]); setRemoteFiles([]); };
  }, [roomId, view, quickRetry, refresh]);

  const updateRoom = async (change: Record<string, unknown>) => {
    if (!activeRoom) return;
    try {
      const result = await request(`/share/rooms/${activeRoom.id}`, change, "PATCH") as { generatedPassword?: string };
      if (change.protected === false) setCreatedPassword("");
      if (result.generatedPassword) setCreatedPassword(result.generatedPassword);
      await refresh();
    }
    catch (cause) { setError(messageOf(cause)); }
  };
  const closeRoom = async () => {
    if (!activeRoom) return;
    try { await request(`/share/rooms/${activeRoom.id}`, undefined, "DELETE"); setRoomId(null); setCreatedPassword(""); setToolsOpen(false); await refresh(); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const invite = async (member: SearchMember) => {
    if (!activeRoom) return;
    try { await request(`/share/rooms/${activeRoom.id}/invites`, { userId: member.id }); setInviteQuery(""); setInviteResults([]); await refresh(); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const kick = async (member: Member) => {
    if (!activeRoom) return;
    try { await request(`/share/rooms/${activeRoom.id}/kick`, { userId: member.userId }); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const refreshBans = async () => {
    if (!activeRoom) return;
    const data = await request(`/share/rooms/${activeRoom.id}/bans`) as { users: typeof bannedUsers };
    setBannedUsers(data.users);
  };
  const ban = async () => {
    if (!activeRoom || !banCandidate) return;
    try { await request(`/share/rooms/${activeRoom.id}/bans`, { userId: banCandidate.userId }); setBanCandidate(null); await refreshBans(); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const unban = async (userId: string) => {
    if (!activeRoom) return;
    try { await request(`/share/rooms/${activeRoom.id}/bans/${userId}`, undefined, "DELETE"); await refreshBans(); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const sendTo = (peerId: string, file: File) => {
    if (!members.some((member) => member.connectionId === peerId)) { setError("Alıcı odadan ayrıldı."); return; }
    if (view === "quick" && file.size > 50 * 1024 * 1024) { setError("Hızlı paylaşımda üst sınır 50 MB. Büyük dosyalar için oda açabilirsin."); return; }
    queueRef.current.push({ id: crypto.randomUUID(), peerId, file });
    setQueued([...queueRef.current]);
    void drainPeer(peerId);
  };
  const addFiles = (files: FileList | File[]) => {
    const added = Array.from(files).filter((file) => {
      if (view !== "quick" || file.size <= 50 * 1024 * 1024) return true;
      setError("Hızlı paylaşımda üst sınır 50 MB. Büyük dosyalar için oda açabilirsin.");
      return false;
    }).map((file) => ({ id: crypto.randomUUID(), file }));
    if (view === "quick" && staged.length + added.length > 20) setError("Hızlı alanda en fazla 20 dosya gösterebilirsin.");
    setStaged((items) => [...items, ...added.slice(0, view === "quick" ? Math.max(0, 20 - items.length) : added.length)]);
  };
  const requestRemoteFile = (peerId: string, id: string) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) { setError("Canlı bağlantı hazır değil."); return; }
    socketRef.current.send(JSON.stringify({ type: "file-request", to: peerId, id }));
  };
  const filteredRooms = rooms.filter((room) => `${room.name} ${room.ownerName}`.toLocaleLowerCase("tr-TR").includes(filter.toLocaleLowerCase("tr-TR")));

  return <section className="share-page">
    <header className="share-header"><Button variant="bare" onClick={roomId ? () => { setRoomId(null); setCreatedPassword(""); } : onBack}><ArrowLeft size={16} /> {roomId ? "Odalara dön" : "Ana sayfaya dön"}</Button><span>STARBASE / DOSYA PAYLAŞIMI</span></header>
    <div className="share-title"><span className="eyebrow">CANLI AKTARIM</span><h1>{activeRoom ? activeRoom.name : "Dosya Paylaşımı"}</h1><p>Dosyalar doğrudan katılımcıların cihazları arasında aktarılır. Sunucuda saklanmaz.</p></div>
    <TabBar className="share-mode-tabs" label="Paylaşım biçimi" items={[{ value: "quick", label: "Hızlı paylaşım" }, { value: "rooms", label: "Odalar" }]} value={view} onChange={(next) => { setRoomId(null); setCreatedPassword(""); setToolsOpen(false); setError(""); setView(next as "quick" | "rooms"); }} />
    {error && <div className="share-error" role="alert">{error}<button type="button" aria-label="Uyarıyı kapat" onClick={() => setError("")}><X size={14} /></button></div>}
    {!roomId && view === "rooms" && <div className="share-index">
      <section className="share-create"><span className="eyebrow">YENİ ODA</span><h2>Paylaşım başlat.</h2><form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (roomName.trim()) void createRoom(roomName.trim(), protectRoom); }}>
        <TextField label="Oda adı" value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={64} required placeholder="Örneğin: Aviyonik dosyaları" />
        <label className="share-check"><input type="checkbox" checked={protectRoom} onChange={(event) => setProtectRoom(event.target.checked)} /><span>Şifreli oda</span><LockKeyhole size={15} /></label>
        <Button variant="primary" type="submit" disabled={busy || roomName.trim().length < 2}>Oda oluştur <Plus size={15} /></Button>
      </form><p>Kodlu oda açarsan 6 haneli kodu içeride görebilirsin.</p></section>
      <section className="share-list"><div className="share-list-head"><div><span className="eyebrow">TAKIM ODALARI</span><h2>Şu an açık</h2></div><span>{rooms.length} oda</span></div><label className="share-search"><Search size={17} /><input aria-label="Odalarda ara" placeholder="Oda veya sahibi ara" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
        <div className="share-room-grid">{filteredRooms.map((room) => <button type="button" className="share-room-card" key={room.id} onClick={() => chooseRoom(room)}><span className="share-room-card-top">{room.protected ? <LockKeyhole size={18} /> : <UnlockKeyhole size={18} />}<span>{room.locked ? "GİRİŞLER KAPALI" : room.protected ? "ŞİFRELİ" : "AÇIK"}</span></span><strong>{room.name}</strong><span className="share-room-card-bottom"><span>{room.ownerName} · {room.participantCount} kişi</span><ArrowUpRight size={17} /></span>{room.isInvited && <small>SANA DAVET VAR</small>}</button>)}{!filteredRooms.length && <p className="share-empty">Açık oda bulunamadı. Yeni bir oda başlatabilirsin.</p>}</div>
      </section>
    </div>}
    {joinTarget && <div className="share-modal-backdrop" role="presentation"><form className="share-modal" onSubmit={(event) => { event.preventDefault(); void enter(joinTarget, joinPassword); }}><div className="share-modal-head"><LockKeyhole size={18} /><Button variant="bare" type="button" onClick={() => setJoinTarget(null)} aria-label="Kapat"><X size={17} /></Button></div><h2>{joinTarget.name}</h2><p>6 haneli oda kodunu gir.</p><TextField label="Oda kodu" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={joinPassword} onChange={(event) => setJoinPassword(event.target.value.replace(/\D/g, "").slice(0, 6))} required /><Button variant="primary" type="submit" disabled={busy || joinPassword.length !== 6}>Odaya katıl <ArrowUpRight size={15} /></Button></form></div>}
    {(roomId || view === "quick") && <div className={`share-room-layout ${roomId ? "" : "share-quick-layout"}`}><div className="share-room-main">
      {!roomId && <div className="share-quick-intro"><div><span className="eyebrow">TAKIMIN ORTAK ALANI</span><p>Buraya gelen herkes anında görünür. Dosyalar gönderen ayrılınca alandan silinir.</p></div><div className="share-quick-presence"><span className={`share-live-dot ${quickState === "online" ? "is-online" : ""}`} />{quickState === "online" ? `${visibleMembers.length} kişi burada` : quickState === "connecting" ? "Bağlanıyor" : <button type="button" onClick={() => setQuickRetry((value) => value + 1)}>Yeniden bağlan</button>}</div></div>}
      <input ref={fileInput} type="file" multiple hidden onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
      <ShareCanvas files={staged} remoteFiles={roomId ? [] : remoteFiles} members={visibleMembers} currentUserId={currentUserId} readyPeers={readyPeers} transfers={transferRows} onAddFiles={addFiles} onRemoveFile={(id) => setStaged((items) => items.filter((item) => item.id !== id))} onSend={sendTo} onRequestFile={requestRemoteFile} onChooseFiles={() => fileInput.current?.click()} />
      {transferRows.length > 0 && <div className="share-transfers"><span className="eyebrow">SON AKTARIMLAR</span>{transferRows.map((item) => <div key={item.id}><span>{item.name} · {item.peer}</span><span>{item.status}{item.active && item.percent > 0 ? ` · %${item.percent}` : ""}</span>{item.active && item.percent > 0 && <progress value={item.percent} max={100} />}</div>)}</div>}
      {received.length > 0 && <div className="share-received"><span className="eyebrow">ALINAN DOSYALAR</span>{received.map((file) => <div key={file.id}><File size={15} /><span>{file.name}</span>{file.url ? <a href={file.url} download={file.name}>İndir <ArrowUpRight size={14} /></a> : <small>Cihaza kaydedildi</small>}</div>)}</div>}
      </div>{roomId && <aside className={`share-room-side ${toolsOpen ? "is-open" : ""}`}>
        <button type="button" className="share-tools-toggle" aria-expanded={toolsOpen} onClick={() => setToolsOpen((value) => !value)}><Users size={15} /><span>{visibleMembers.length} kişi</span>{activeRoom?.protected && <LockKeyhole size={13} />}<Settings2 size={15} /><ChevronDown size={14} /></button>
        {toolsOpen && <div className="share-tools-body">
          <div className="share-section-head"><span className="eyebrow">KATILIMCILAR</span><span>{visibleMembers.length}</span></div>
          <div className="share-member-list">{visibleMembers.map((member) => <div className="share-member" key={member.connectionId}><span className="share-member-avatar">{member.name.slice(0, 1)}</span><span><strong>{member.name}</strong><small>{member.userId === currentUserId ? "Sen" : readyPeers.includes(member.connectionId) ? "Dosya alabilir" : "Bağlanıyor"}</small></span>{activeRoom?.isOwner && member.userId !== currentUserId && <span className="share-member-actions"><button type="button" onClick={() => void kick(member)} title="Yeniden girebilir">Çıkar</button><button type="button" onClick={() => setBanCandidate(member)} title="Bu odaya tekrar giremez"><Ban size={13} /> Engelle</button></span>}</div>)}</div>
          {activeRoom?.isOwner && <div className="share-owner-controls">
            <span className="eyebrow">ODA AYARLARI</span>
            <div className="share-setting"><div><strong>Giriş</strong><small>{activeRoom.protected ? "6 haneli kod gerekir" : "Takıma açık"}</small></div><div className="share-setting-choice"><button type="button" className={!activeRoom.protected ? "selected" : ""} onClick={() => { if (activeRoom.protected) void updateRoom({ protected: false }); }}>Açık</button><button type="button" className={activeRoom.protected ? "selected" : ""} onClick={() => { if (!activeRoom.protected) void updateRoom({ protected: true }); }}>Kodlu</button></div></div>
            {activeRoom.protected && <div className="share-pin"><span className="eyebrow">ODA KODU</span>{createdPassword ? <div><strong>{createdPassword}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(createdPassword)}><Copy size={13} /> Kopyala</button></div> : <small>Kod gizli. Yeni kod oluşturabilirsin.</small>}<button type="button" className="share-text-action" onClick={() => void updateRoom({ generatePin: true })}>Yeni kod oluştur</button></div>}
            <div className="share-setting"><div><strong>Yeni katılım</strong><small>{activeRoom.locked ? "Davetliler girebilir" : "Girişler açık"}</small></div><button type="button" className="share-text-action" onClick={() => void updateRoom({ locked: !activeRoom.locked })}>{activeRoom.locked ? "Kilidi aç" : "Kilitle"}</button></div>
            <div className="share-invite-control"><TextField label="Üye davet et" value={inviteQuery} onChange={(event) => setInviteQuery(event.target.value)} placeholder="İsim veya kullanıcı adı" /><div className="share-invite-results">{inviteResults.filter((member) => member.id !== currentUserId).map((member) => <button key={member.id} type="button" onClick={() => void invite(member)}><UserPlus size={14} /> {member.firstName} {member.lastName} <small>@{member.username}</small></button>)}</div></div>
            {bannedUsers.length > 0 && <div className="share-banned"><span className="eyebrow">ENGELLENENLER</span>{bannedUsers.map((member) => <div key={member.userId}><span>{member.firstName} {member.lastName}</span><button type="button" onClick={() => void unban(member.userId)}>Engeli kaldır</button></div>)}</div>}
            <button type="button" className="share-close-room" onClick={() => void closeRoom()}><X size={14} /> Odayı kapat</button>
          </div>}
          <div className="share-info"><Shield size={15} /><p>Dosyalar sunucuda saklanmaz.</p></div>
        </div>}
      </aside>}</div>}
    {banCandidate && <div className="share-modal-backdrop"><div className="share-modal" role="dialog" aria-modal="true" aria-label="Üyeyi engelle"><span className="eyebrow">ODA ERİŞİMİ</span><h2>{banCandidate.name} engellensin mi?</h2><p>Bu kişi odadan çıkarılır ve engeli kaldırana kadar tekrar giremez.</p><div className="share-modal-actions"><Button variant="bare" onClick={() => setBanCandidate(null)}>Vazgeç</Button><Button variant="primary" onClick={() => void ban()}>Engelle <Ban size={14} /></Button></div></div></div>}
    {offers.length > 0 && <div className="share-modal-backdrop"><div className="share-modal" role="dialog" aria-modal="true" aria-label="Dosya teklifi"><span className="eyebrow">DOSYA TEKLİFİ</span><h2>{offers[0].offer.name}</h2><p>{members.find((member) => member.connectionId === offers[0].peerId)?.name ?? "Bir üye"} sana dosya göndermek istiyor. {Math.round(offers[0].offer.size / 1024)} KB{view === "quick" && offers[0].offer.size > 50 * 1024 * 1024 ? " · Hızlı alanın 50 MB sınırını aşıyor." : ""}</p><div className="share-modal-actions"><Button variant="bare" onClick={() => { const current = offers[0]; linksRef.current.get(current.peerId)?.reject(current.offer.id); setFailed((items) => [...items, { id: current.offer.id, peerId: current.peerId, name: current.offer.name, reason: "Teklif reddedildi", at: Date.now() }].slice(-8)); setOffers((items) => items.slice(1)); }}>Reddet</Button><Button variant="primary" disabled={view === "quick" && offers[0].offer.size > 50 * 1024 * 1024} onClick={() => { void linksRef.current.get(offers[0].peerId)?.accept(offers[0].offer.id, view === "quick"); setOffers((items) => items.slice(1)); }}>Kabul et <Check size={15} /></Button></div></div></div>}
  </section>;
}
