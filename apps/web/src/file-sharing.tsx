import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Check, Copy, File, FileUp, LockKeyhole, Plus, Search, Shield, UnlockKeyhole, UserPlus, Users, X } from "lucide-react";
import { Button, TextField } from "@stardrop/ui";
import { TransferLink, type FileOffer, type ReceivedFile, type Signal, type TransferProgress } from "@starbase/file-transfer";
import { request } from "./management";
import { subscribeShareChanges } from "./member-live";
import "./file-sharing.css";

type Room = { id: string; name: string; ownerId: string; ownerName: string; profileTargetId: string | null; protected: boolean; locked: boolean; participantCount: number; createdAt: number; isOwner: boolean; isInvited: boolean };
type Member = { connectionId: string; userId: string; name: string };
type StagedFile = { id: string; file: File };
type SearchMember = { id: string; firstName: string; lastName: string; username: string; photoUrl: string };
const errorText: Record<string, string> = {
  room_password_invalid: "Oda şifresi yanlış.", room_locked: "Oda yeni katılımlara kapalı.", room_access_denied: "Bu odaya erişimin kaldırıldı.",
  room_not_found: "Oda artık açık değil.", try_later: "Çok fazla deneme. Biraz bekle.", authentication_required: "Oturumun sona erdi.",
};
const messageOf = (error: unknown) => errorText[error instanceof Error ? error.message : ""] ?? (error instanceof Error ? error.message : "İşlem tamamlanamadı.");

export function FileSharing({ currentUserId, profileTarget, onBack }: {
  currentUserId: string;
  profileTarget: { id: string; name: string } | null;
  onBack: () => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
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
  const [offers, setOffers] = useState<Array<{ peerId: string; offer: FileOffer }>>([]);
  const [progress, setProgress] = useState<Array<{ peerId: string; value: TransferProgress }>>([]);
  const [received, setReceived] = useState<Array<ReceivedFile & { url?: string }>>([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState<SearchMember[]>([]);
  const [filter, setFilter] = useState("");
  const [settingsPassword, setSettingsPassword] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const linksRef = useRef(new Map<string, TransferLink>());
  const fileInput = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  const startedProfile = useRef("");
  const activeRoom = rooms.find((room) => room.id === roomId) ?? null;

  const refresh = useCallback(async () => {
    try { const data = await request("/share/rooms") as { rooms: Room[] }; setRooms(data.rooms); }
    catch (cause) { setError(messageOf(cause)); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 15_000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => subscribeShareChanges(() => void refresh()), [refresh]);
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);
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
      setRoomId(room.id); setJoinTarget(null); setJoinPassword("");
      await refresh();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  };
  const chooseRoom = (room: Room) => {
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
    if (!roomId) return;
    let active = true;
    let ownConnection = "";
    let roster: Member[] = [];
    const url = new URL(`/api/v1/share/rooms/${roomId}/live`, location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    socketRef.current = socket;
    const addPeer = (member: Member) => {
      if (linksRef.current.has(member.connectionId)) return linksRef.current.get(member.connectionId)!;
      const peerId = member.connectionId;
      const link = new TransferLink({
        signal: (signal: Signal) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "signal", to: peerId, signal })); },
        ready: () => { if (active) setReadyPeers((items) => [...new Set([...items, peerId])]); },
        offer: (offer) => { if (active) setOffers((items) => [...items, { peerId, offer }]); },
        progress: (value) => { if (active) setProgress((items) => [...items.filter((item) => item.peerId !== peerId || item.value.id !== value.id), { peerId, value }].slice(-20)); },
        received: (file) => { if (!active) return; const fileUrl = file.blob ? URL.createObjectURL(file.blob) : undefined; if (fileUrl) urls.current.push(fileUrl); setReceived((items) => [{ ...file, url: fileUrl }, ...items].slice(0, 12)); },
        error: (message) => { if (active) setError(message); },
      });
      linksRef.current.set(peerId, link);
      return link;
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "welcome") { ownConnection = message.connectionId; return; }
        if (message.type === "members") {
          roster = message.members as Member[];
          setMembers(roster);
          const present = new Set(roster.map((member) => member.connectionId));
          for (const [id, link] of linksRef.current) if (!present.has(id)) { link.close(); linksRef.current.delete(id); setReadyPeers((items) => items.filter((item) => item !== id)); }
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
        if (message.type === "closed" || message.type === "kicked") { setError(message.type === "kicked" ? "Oda sahibi seni odadan çıkardı." : "Oda kapatıldı."); setRoomId(null); void refresh(); }
      } catch { setError("Oda bağlantısı okunamadı."); }
    };
    socket.onclose = () => { if (active) setError("Canlı bağlantı kesildi. Odaya yeniden katılabilirsin."); };
    socket.onerror = () => { if (active) setError("Canlı odaya bağlanılamadı."); };
    const ping = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" })); }, 30_000);
    return () => { active = false; clearInterval(ping); socket.close(); socketRef.current = null; for (const link of linksRef.current.values()) link.close(); linksRef.current.clear(); setMembers([]); setReadyPeers([]); setOffers([]); };
  }, [roomId, refresh]);

  const updateRoom = async (change: Record<string, unknown>) => {
    if (!activeRoom) return;
    try { await request(`/share/rooms/${activeRoom.id}`, change, "PATCH"); setSettingsPassword(""); await refresh(); }
    catch (cause) { setError(messageOf(cause)); }
  };
  const closeRoom = async () => {
    if (!activeRoom) return;
    try { await request(`/share/rooms/${activeRoom.id}`, undefined, "DELETE"); setRoomId(null); setCreatedPassword(""); await refresh(); }
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
  const sendTo = (peerId: string, file: File) => {
    const link = linksRef.current.get(peerId);
    if (!link?.ready) { setError("Alıcının doğrudan bağlantısı henüz hazır değil."); return; }
    void link.sendFile(file).catch((cause) => setError(messageOf(cause)));
  };
  const addFiles = (files: FileList | File[]) => {
    const added = Array.from(files, (file) => ({ id: crypto.randomUUID(), file }));
    setStaged((items) => [...items, ...added]);
  };
  const filteredRooms = rooms.filter((room) => `${room.name} ${room.ownerName}`.toLocaleLowerCase("tr-TR").includes(filter.toLocaleLowerCase("tr-TR")));

  return <section className="share-page">
    <header className="share-header"><Button variant="bare" onClick={roomId ? () => { setRoomId(null); setCreatedPassword(""); } : onBack}><ArrowLeft size={16} /> {roomId ? "Odalara dön" : "Ana sayfaya dön"}</Button><span>STARBASE / DOSYA PAYLAŞIMI</span></header>
    <div className="share-title"><span className="eyebrow">CANLI AKTARIM</span><h1>{activeRoom ? activeRoom.name : "Dosya Paylaşımı"}</h1><p>Dosyalar doğrudan katılımcıların cihazları arasında aktarılır. Sunucuda saklanmaz.</p></div>
    {error && <div className="share-error" role="alert">{error}<button type="button" aria-label="Uyarıyı kapat" onClick={() => setError("")}><X size={14} /></button></div>}
    {!roomId && <div className="share-index">
      <section className="share-create"><span className="eyebrow">YENİ ODA</span><h2>Paylaşım başlat.</h2><form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (roomName.trim()) void createRoom(roomName.trim(), protectRoom); }}>
        <TextField label="Oda adı" value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={64} required placeholder="Örneğin: Aviyonik dosyaları" />
        <label className="share-check"><input type="checkbox" checked={protectRoom} onChange={(event) => setProtectRoom(event.target.checked)} /><span>Şifreli oda</span><LockKeyhole size={15} /></label>
        <Button variant="primary" type="submit" disabled={busy || roomName.trim().length < 2}>Oda oluştur <Plus size={15} /></Button>
      </form><p>Şifreli odanın erişim kodu oluşturulduğunda yalnız sana gösterilir. Odayı sonradan kilitleyebilirsin.</p></section>
      <section className="share-list"><div className="share-list-head"><div><span className="eyebrow">TAKIM ODALARI</span><h2>Şu an açık</h2></div><span>{rooms.length} oda</span></div><label className="share-search"><Search size={17} /><input aria-label="Odalarda ara" placeholder="Oda veya sahibi ara" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
        <div className="share-room-grid">{filteredRooms.map((room) => <button type="button" className="share-room-card" key={room.id} onClick={() => chooseRoom(room)}><span className="share-room-card-top">{room.protected ? <LockKeyhole size={18} /> : <UnlockKeyhole size={18} />}<span>{room.locked ? "GİRİŞLER KAPALI" : room.protected ? "ŞİFRELİ" : "AÇIK"}</span></span><strong>{room.name}</strong><span className="share-room-card-bottom"><span>{room.ownerName} · {room.participantCount} kişi</span><ArrowUpRight size={17} /></span>{room.isInvited && <small>SANA DAVET VAR</small>}</button>)}{!filteredRooms.length && <p className="share-empty">Açık oda bulunamadı. Yeni bir oda başlatabilirsin.</p>}</div>
      </section>
    </div>}
    {joinTarget && <div className="share-modal-backdrop" role="presentation"><form className="share-modal" onSubmit={(event) => { event.preventDefault(); void enter(joinTarget, joinPassword); }}><div className="share-modal-head"><LockKeyhole size={18} /><Button variant="bare" type="button" onClick={() => setJoinTarget(null)} aria-label="Kapat"><X size={17} /></Button></div><h2>{joinTarget.name}</h2><p>Bu oda için şifre gerekiyor.</p><TextField label="Oda şifresi" type="password" value={joinPassword} onChange={(event) => setJoinPassword(event.target.value)} required /><Button variant="primary" type="submit" disabled={busy}>Odaya katıl <ArrowUpRight size={15} /></Button></form></div>}
    {roomId && <div className="share-room-layout"><div className="share-room-main"><div className="share-room-toolbar"><div><span className="eyebrow">PAYLAŞIM ALANI</span><h2>{members.length} katılımcı · {readyPeers.length} doğrudan bağlantı</h2></div><Button variant="primary" onClick={() => fileInput.current?.click()}><FileUp size={15} /> Dosya ekle</Button><input ref={fileInput} type="file" multiple hidden onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} /></div>
      <div className="share-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files); }}><span className="share-dropzone-mark">+</span><p>Dosyaları buraya bırak veya yukarıdan seç.</p><small>Alıcıyı seçerek gönder; karşı taraf aktarımı onaylar.</small></div>
      <div className="share-section-head"><span className="eyebrow">DOSYALARIN</span><span>{staged.length} dosya</span></div><div className="share-file-grid">{staged.map((entry) => <div className="share-file-card" key={entry.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", entry.id)}><File size={25} /><div><strong title={entry.file.name}>{entry.file.name}</strong><small>{(entry.file.size / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} MB</small></div><button type="button" aria-label="Dosyayı kaldır" onClick={() => setStaged((items) => items.filter((item) => item.id !== entry.id))}><X size={14} /></button><div className="share-file-actions">{members.filter((member) => member.userId !== currentUserId).map((member) => <button type="button" key={member.connectionId} disabled={!readyPeers.includes(member.connectionId)} onClick={() => sendTo(member.connectionId, entry.file)}>{member.name} <ArrowUpRight size={12} /></button>)}</div></div>)}{!staged.length && <p className="share-empty">Dosya seçtiğinde burada görünür. Oda kapanınca bu alan temizlenir.</p>}</div>
      {progress.length > 0 && <div className="share-transfers"><span className="eyebrow">AKTARIMLAR</span>{progress.map(({ peerId, value }) => <div key={`${peerId}:${value.id}`}><span>{value.name}</span><span>{value.status} · %{value.size ? Math.round(value.bytes / value.size * 100) : 100}</span><progress value={value.bytes} max={Math.max(value.size, 1)} /></div>)}</div>}
      {received.length > 0 && <div className="share-received"><span className="eyebrow">ALINAN DOSYALAR</span>{received.map((file) => <div key={file.id}><File size={15} /><span>{file.name}</span>{file.url ? <a href={file.url} download={file.name}>İndir <ArrowUpRight size={14} /></a> : <small>Cihaza kaydedildi</small>}</div>)}</div>}
      </div><aside className="share-room-side"><div className="share-section-head"><span className="eyebrow">KATILIMCILAR</span><Users size={15} /></div><div className="share-member-list">{members.map((member) => <div className="share-member" key={member.connectionId} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const entry = staged.find((item) => item.id === event.dataTransfer.getData("text/plain")); if (entry) sendTo(member.connectionId, entry.file); }}><span className="share-member-avatar">{member.name.slice(0, 1)}</span><span><strong>{member.name}</strong><small>{member.userId === currentUserId ? "Sen" : readyPeers.includes(member.connectionId) ? "Bağlı · dosya alabilir" : "Bağlanıyor"}</small></span>{activeRoom?.isOwner && member.userId !== currentUserId && <button type="button" title="Odadan çıkar" aria-label={`${member.name} kişisini çıkar`} onClick={() => void kick(member)}><X size={14} /></button>}</div>)}</div>
      {activeRoom?.isOwner && <div className="share-owner-controls"><span className="eyebrow">ODA YÖNETİMİ</span>{createdPassword && <div className="share-password"><small>Oda şifresi</small><strong>{createdPassword}</strong><button type="button" onClick={() => void navigator.clipboard.writeText(createdPassword)} aria-label="Şifreyi kopyala"><Copy size={14} /></button></div>}<div className="share-control-row"><span>{activeRoom.protected ? "Şifreli oda" : "Açık oda"}</span><Button variant="bare" size="sm" onClick={() => { if (activeRoom.protected) { setCreatedPassword(""); void updateRoom({ protected: false }); } else { const password = settingsPassword || crypto.randomUUID().replaceAll("-", "").slice(0, 16); setCreatedPassword(password); void updateRoom({ protected: true, password }); } }}>{activeRoom.protected ? "Herkese aç" : "Şifrele"}</Button></div><TextField label="Yeni oda şifresi" type="password" value={settingsPassword} onChange={(event) => setSettingsPassword(event.target.value)} minLength={8} placeholder="En az 8 karakter" /><Button variant="bare" size="sm" disabled={settingsPassword.length < 8} onClick={() => { setCreatedPassword(settingsPassword); void updateRoom({ protected: true, password: settingsPassword }); }}>Şifreyi yenile</Button><div className="share-control-row"><span>{activeRoom.locked ? "Girişler durduruldu" : "Yeni girişler açık"}</span><Button variant="bare" size="sm" onClick={() => void updateRoom({ locked: !activeRoom.locked })}>{activeRoom.locked ? "Kilidi aç" : "Girişleri kilitle"}</Button></div><TextField label="Üye davet et" value={inviteQuery} onChange={(event) => setInviteQuery(event.target.value)} placeholder="İsim veya kullanıcı adı" /><div className="share-invite-results">{inviteResults.filter((member) => member.id !== currentUserId).map((member) => <button key={member.id} type="button" onClick={() => void invite(member)}><UserPlus size={14} /> {member.firstName} {member.lastName} <small>@{member.username}</small></button>)}</div><Button variant="bare" onClick={() => void closeRoom()}><X size={15} /> Odayı kapat</Button></div>}
      <div className="share-info"><Shield size={17} /><p>Dosyalar STARBASE sunucusuna yüklenmez. Kısıtlı ağlarda doğrudan bağlantı kurulamayabilir.</p></div></aside></div>}
    {offers.length > 0 && <div className="share-modal-backdrop"><div className="share-modal" role="dialog" aria-modal="true" aria-label="Dosya teklifi"><span className="eyebrow">DOSYA TEKLİFİ</span><h2>{offers[0].offer.name}</h2><p>{members.find((member) => member.connectionId === offers[0].peerId)?.name ?? "Bir üye"} sana dosya göndermek istiyor. {Math.round(offers[0].offer.size / 1024)} KB</p><div className="share-modal-actions"><Button variant="bare" onClick={() => { linksRef.current.get(offers[0].peerId)?.reject(offers[0].offer.id); setOffers((items) => items.slice(1)); }}>Reddet</Button><Button variant="primary" onClick={() => { void linksRef.current.get(offers[0].peerId)?.accept(offers[0].offer.id); setOffers((items) => items.slice(1)); }}>Kabul et <Check size={15} /></Button></div></div></div>}
  </section>;
}
